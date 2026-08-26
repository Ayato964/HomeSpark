"""Local voice-engine runtime detection and on-demand installation.

The Windows installer ships an embedded CPython (``python_runtime``) built from
``requirements.txt`` only, which deliberately excludes the multi-gigabyte voice
stack (torch / faster-whisper / Irodori-TTS). Without that distinction the
startup diagnostics report a perfectly healthy cloud install as a hard failure.

This module answers two questions:

  * What voice profile can this machine actually run (``capability()``)?
  * Can we install the missing pieces into the embedded runtime right now
    (``start_install()`` / ``install_status()``)?

Everything degrades gracefully: a machine with no GPU is a supported
configuration (Web Speech synthesis + cloud STT), not an error.
"""
from __future__ import annotations

import importlib.util
import logging
import os
import subprocess
import sys
import threading
import time
import typing as t
from collections import deque
from pathlib import Path

logger = logging.getLogger("sales_spark")

# --------------------------------------------------------------------------- #
# Package groups
# --------------------------------------------------------------------------- #
# Modules required for local (in-process / dedicated worker) speech recognition.
_STT_MODULES = ("torch", "faster_whisper")
# Modules required by Irodori-TTS-Lite's app_voice.py on top of the STT set.
_TTS_MODULES = ("torch", "scipy", "pyopenjtalk", "irodori_tts_lite", "irodori_tts")

_TORCH_CUDA_INDEX = "https://download.pytorch.org/whl/cu124"
_TORCH_CPU_INDEX = "https://download.pytorch.org/whl/cpu"

# Installed from the branch zipball rather than `git+https://...` so the user
# does not need git on PATH.
_ONECOMP_ZIP = (
    "https://github.com/kizuna-intelligence/onecompression-runtime/archive/refs/heads/main.zip"
)
_IRODORI_TTS_ZIP = "https://github.com/Aratako/Irodori-TTS/archive/refs/heads/main.zip"

_SUBPROCESS_FLAGS = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def _backend_dir() -> Path:
    return Path(__file__).resolve().parent.parent


def _tts_source_dir() -> Path:
    return _backend_dir() / "Irodori-TTS-Lite"


# --------------------------------------------------------------------------- #
# Detection
# --------------------------------------------------------------------------- #
def _has_module(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def missing_modules(modules: t.Sequence[str]) -> list[str]:
    return [m for m in modules if not _has_module(m)]


def detect_gpu() -> dict:
    """Best-effort NVIDIA GPU detection that does NOT require torch.

    Mirrors the Electron-side probe order so both sides agree on whether this
    machine is a "GPU machine"."""
    # 1. nvidia-smi: authoritative when the NVIDIA driver is installed.
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=6,
            creationflags=_SUBPROCESS_FLAGS,
        )
        line = (out.stdout or "").strip().splitlines()
        if out.returncode == 0 and line:
            name, _, vram = line[0].partition(",")
            return {
                "has_gpu": True,
                "gpu_name": name.strip(),
                "vram": vram.strip() or None,
                "source": "nvidia-smi",
            }
    except (OSError, subprocess.SubprocessError):
        pass

    # 2. torch, when the voice stack is already installed.
    if _has_module("torch"):
        try:
            import torch

            if torch.cuda.is_available():
                return {
                    "has_gpu": True,
                    "gpu_name": torch.cuda.get_device_name(0),
                    "vram": f"{round(torch.cuda.get_device_properties(0).total_memory / (1024 ** 3), 1)} GiB",
                    "source": "torch",
                }
        except Exception:  # noqa: BLE001 - torch raises many driver-level errors
            pass

    # 3. WMI, so we can still name the adapter on a CPU-only box.
    if os.name == "nt":
        try:
            out = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
                ],
                capture_output=True,
                text=True,
                timeout=8,
                creationflags=_SUBPROCESS_FLAGS,
            )
            names = [n.strip() for n in (out.stdout or "").splitlines() if n.strip()]
            if names:
                joined = " ".join(names).lower()
                is_nvidia = any(k in joined for k in ("nvidia", "geforce", "rtx", "gtx", "quadro"))
                return {
                    "has_gpu": is_nvidia,
                    "gpu_name": names[0],
                    "vram": None,
                    # An NVIDIA adapter without a working nvidia-smi means the
                    # driver/CUDA runtime is not usable, so flag it separately.
                    "source": "wmi",
                }
        except (OSError, subprocess.SubprocessError):
            pass

    return {"has_gpu": False, "gpu_name": None, "vram": None, "source": "none"}


def engine_status() -> dict:
    """Read the local voice engine's self-reported state.

    Written by Irodori-TTS-Lite/app_voice.py. Loading the models takes about a
    minute, during which the port is closed and a plain connection probe cannot
    tell "still starting" from "not running at all"."""
    appdata = os.getenv("APPDATA") or os.path.join(os.path.expanduser("~"), ".homespark")
    path = Path(appdata) / "HomeSpark" / "data" / "voice_engine_status.json"

    if not path.exists():
        return {"state": "absent"}
    try:
        import json

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {"state": "absent"}

    state = data.get("state")
    pid = data.get("pid")
    age = time.time() - float(data.get("updated_at") or 0)

    # A status file left behind by a killed process must not read as "loading"
    # forever; confirm the process is still there.
    if state in ("loading", "ready") and pid and not _pid_alive(int(pid)):
        return {"state": "stale", "port": data.get("port"), "age_sec": age}

    data["age_sec"] = age
    return data


def _pid_alive(pid: int) -> bool:
    if os.name == "nt":
        try:
            out = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                capture_output=True,
                text=True,
                timeout=8,
                creationflags=_SUBPROCESS_FLAGS,
            )
            return str(pid) in (out.stdout or "")
        except (OSError, subprocess.SubprocessError):
            return True  # cannot tell - assume alive rather than cry wolf
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False


def pip_available() -> bool:
    try:
        out = subprocess.run(
            [sys.executable, "-m", "pip", "--version"],
            capture_output=True,
            text=True,
            timeout=25,
            creationflags=_SUBPROCESS_FLAGS,
        )
        return out.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def capability() -> dict:
    """Describe what this machine can do for voice, and what is installable.

    ``mode`` is the *effective* configuration right now:
      * ``local_gpu``   - GPU + full stack: local Irodori-TTS and local Whisper.
      * ``local_stt``   - Whisper installed locally, synthesis via Web Speech.
      * ``cloud``       - No local voice stack: Web Speech + cloud STT. Supported.
    ``recommended_profile`` is what an install button should offer, or None when
    there is nothing useful left to install.
    """
    gpu = detect_gpu()
    missing_stt = missing_modules(_STT_MODULES)
    missing_tts = missing_modules(_TTS_MODULES)

    has_stt = not missing_stt
    has_tts = not missing_tts

    if has_tts and gpu["has_gpu"]:
        mode = "local_gpu"
    elif has_stt:
        mode = "local_stt"
    else:
        mode = "cloud"

    if not has_stt:
        recommended = "gpu" if gpu["has_gpu"] else "cpu"
    elif gpu["has_gpu"] and not has_tts:
        recommended = "tts"
    else:
        recommended = None

    return {
        "mode": mode,
        "gpu": gpu,
        "local_stt_ready": has_stt,
        "local_tts_ready": has_tts,
        "missing_stt_modules": missing_stt,
        "missing_tts_modules": missing_tts,
        "recommended_profile": recommended,
        "python_executable": sys.executable,
        "installable": recommended is not None,
        "profiles": {k: {"label": v["label"], "size_hint": v["size_hint"], "note": v["note"]}
                     for k, v in INSTALL_PROFILES.items()},
    }


# --------------------------------------------------------------------------- #
# Install profiles
# --------------------------------------------------------------------------- #
def _pip(*args: str) -> list[str]:
    return [
        sys.executable, "-m", "pip", "install",
        "--no-input", "--disable-pip-version-check",
        # End-user machines have no CMake and no MSVC build tools, so a source
        # build is never going to succeed - prefer a wheel wherever one exists.
        "--prefer-binary",
        *args,
    ]


# The upstream `pyopenjtalk` sdist compiles OpenJTalk with CMake, which fails on
# any machine without CMake + MSVC ("CMake is not found in the system path").
# `pyopenjtalk-plus` is a maintained fork that publishes cp310 win_amd64 wheels
# and installs under the same `pyopenjtalk` module name.
_PYOPENJTALK = "pyopenjtalk-plus==0.4.1.post9"

# onecomp-runtime declares `triton>=3.0`, which has no Windows wheel; the
# Windows build is published separately as `triton-windows`.
_TRITON = "triton-windows>=3.0" if os.name == "nt" else "triton>=3.0"

INSTALL_PROFILES: dict[str, dict] = {
    "cpu": {
        "label": "音声認識のみ (CPU版・約 300 MB)",
        "size_hint": "約 300 MB",
        "note": "GPU非搭載機向け。faster-whisper を CPU (int8) で動かします。音声合成は Web Speech API を使用します。",
        "steps": [
            ("PyTorch (CPU版) を取得中", _pip("torch==2.6.0", "--index-url", _TORCH_CPU_INDEX)),
            ("faster-whisper を取得中", _pip("faster-whisper==1.2.1", "numpy<3")),
        ],
    },
    "gpu": {
        "label": "音声認識 GPU 高速版 (CUDA 12.4・約 2.8 GB)",
        "size_hint": "約 2.8 GB",
        "note": "NVIDIA GPU 向け。faster-whisper を CUDA float16 で常駐させます。ダウンロードに時間がかかります。",
        "steps": [
            (
                "PyTorch (CUDA 12.4版) を取得中 - 数分かかります",
                _pip("torch==2.6.0+cu124", "torchaudio==2.6.0+cu124", "--index-url", _TORCH_CUDA_INDEX),
            ),
            ("faster-whisper を取得中", _pip("faster-whisper==1.2.1", "numpy<3")),
        ],
    },
    "tts": {
        "label": "ローカル音声合成 Irodori-TTS (GPU専用・約 3.5 GB)",
        "size_hint": "約 3.5 GB",
        "note": (
            "NVIDIA GPU 必須。GeMo の声をこの PC で合成します（Web Speech API より自然で高品質）。"
            "音声認識エンジンも同時に導入されます。失敗した場合は Web Speech API に自動フォールバック"
            "するため、アプリが使えなくなることはありません。"
        ),
        # Self-contained: re-running a satisfied step is a no-op for pip, so this
        # profile works whether or not the GPU speech-recognition profile ran
        # first. Every step resolves to a wheel - no compiler required.
        "steps": [
            (
                "PyTorch (CUDA 12.4版) を取得中 - 数分かかります",
                _pip("torch==2.6.0+cu124", "torchaudio==2.6.0+cu124", "--index-url", _TORCH_CUDA_INDEX),
            ),
            ("faster-whisper を取得中", _pip("faster-whisper==1.2.1", "numpy<3")),
            (
                "音声合成の共通依存を取得中",
                _pip("scipy", "soundfile", "safetensors", "huggingface_hub>=0.24", _PYOPENJTALK),
            ),
            (
                "テキスト解析モデルの依存を取得中",
                _pip("transformers>=5.12.1,<6", "sentencepiece", "numba", "llvmlite", "peft", "pyyaml", "tqdm"),
            ),
            ("Triton (int4 カーネル) を取得中", _pip(_TRITON)),
            # --no-deps throughout: upstream pins `torch>=2.10` / `torchcodec` /
            # `triton`, which would replace the CUDA 12.4 build installed above
            # with an incompatible one. The inference path only needs the
            # packages resolved in the preceding steps.
            ("onecompression-runtime を取得中", _pip("--no-deps", _ONECOMP_ZIP)),
            ("Irodori-TTS 本体を取得中", _pip("--no-deps", _IRODORI_TTS_ZIP)),
            ("Irodori-TTS-Lite を登録中", _pip("--no-deps", str(_tts_source_dir()))),
        ],
    },
}


# --------------------------------------------------------------------------- #
# Install job (single-flight, background thread)
# --------------------------------------------------------------------------- #
_JOB_LOCK = threading.Lock()
_JOB: dict = {
    "state": "idle",  # idle | running | success | error
    "profile": None,
    "step_index": 0,
    "step_total": 0,
    "step_label": "",
    "error": None,
    "started_at": None,
    "finished_at": None,
}
_JOB_LOGS: deque[str] = deque(maxlen=800)
_JOB_THREAD: threading.Thread | None = None


def _log(msg: str) -> None:
    ts = time.strftime("%H:%M:%S")
    _JOB_LOGS.append(f"[{ts}] {msg}")
    logger.info(f"[VoiceInstall] {msg}")


def _explain_pip_failure(tail: t.Iterable[str], code: int) -> str:
    """Turn a pip failure into something the user can act on.

    A bare "exit code 1" is useless; the actionable part is almost always a
    missing build toolchain, which means we picked a package with no wheel."""
    text = " ".join(tail).lower()
    if "cmake is not found" in text or "cmake" in text and "not found" in text:
        return (
            "ソースからのビルドが必要なパッケージが選択されました (CMake 未検出)。"
            "アプリを最新版に更新すると、ビルド不要の配布版を使用します。"
        )
    if "microsoft visual c++" in text or "vcvarsall" in text or "build tools" in text:
        return (
            "C++ ビルドツールが必要なパッケージが選択されました。"
            "アプリを最新版に更新すると、ビルド不要の配布版を使用します。"
        )
    if "no matching distribution" in text or "could not find a version" in text:
        return (
            "この Python 環境に対応する配布物が見つかりませんでした。"
            "ネットワーク接続とプロキシ設定をご確認ください。"
        )
    if "connection" in text or "timed out" in text or "temporary failure" in text:
        return "ダウンロードに失敗しました。ネットワーク接続を確認して再試行してください。"
    if "no space left" in text or "not enough space" in text or "errno 28" in text:
        return "ディスクの空き容量が不足しています。"
    if "access is denied" in text or "permission denied" in text or "errno 13" in text:
        return (
            "インストール先への書き込みが拒否されました。"
            "アプリを一度終了し、管理者権限で起動して再試行してください。"
        )
    last = next((l for l in reversed(list(tail)) if l), "")
    return f"(pip exit code {code}) {last[:300]}"


def _run_steps(profile: str) -> None:
    steps = INSTALL_PROFILES[profile]["steps"]
    try:
        if not pip_available():
            raise RuntimeError(
                "同梱 Python に pip が見つかりません。"
                "インストーラを再実行するか、開発環境の .venv からの起動をお試しください。"
            )

        for i, (label, cmd) in enumerate(steps, start=1):
            with _JOB_LOCK:
                _JOB["step_index"] = i
                _JOB["step_label"] = label
            _log(f"[{i}/{len(steps)}] {label}")

            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                cwd=str(_backend_dir()),
                creationflags=_SUBPROCESS_FLAGS,
            )
            assert proc.stdout is not None
            tail: deque[str] = deque(maxlen=25)
            for raw in proc.stdout:
                line = raw.rstrip()
                if not line:
                    continue
                tail.append(line.strip())
                # pip's progress bars redraw on one line; keep the log readable.
                if not line.startswith("     "):
                    _JOB_LOGS.append(f"    {line}")
            code = proc.wait()
            if code != 0:
                raise RuntimeError(f"{label} が失敗しました。{_explain_pip_failure(tail, code)}")

        _log("✅ 音声エンジンの導入が完了しました。アプリを再起動すると有効になります。")
        with _JOB_LOCK:
            _JOB["state"] = "success"
    except Exception as e:  # noqa: BLE001 - surfaced to the UI verbatim
        _log(f"❌ 導入に失敗しました: {e}")
        with _JOB_LOCK:
            _JOB["state"] = "error"
            _JOB["error"] = str(e)
    finally:
        with _JOB_LOCK:
            _JOB["finished_at"] = time.time()


def start_install(profile: str) -> dict:
    """Kick off a background install. Raises ValueError for an unknown profile."""
    global _JOB_THREAD

    if profile not in INSTALL_PROFILES:
        raise ValueError(f"Unknown voice engine profile '{profile}'.")

    with _JOB_LOCK:
        if _JOB["state"] == "running":
            return {"started": False, "reason": "already_running", **_snapshot_locked()}
        _JOB.update(
            {
                "state": "running",
                "profile": profile,
                "step_index": 0,
                "step_total": len(INSTALL_PROFILES[profile]["steps"]),
                "step_label": "準備中...",
                "error": None,
                "started_at": time.time(),
                "finished_at": None,
            }
        )
    _JOB_LOGS.clear()
    _log(f"音声エンジン導入を開始します (プロファイル: {profile})")
    _log(f"対象 Python: {sys.executable}")

    _JOB_THREAD = threading.Thread(target=_run_steps, args=(profile,), daemon=True)
    _JOB_THREAD.start()
    with _JOB_LOCK:
        return {"started": True, **_snapshot_locked()}


def _snapshot_locked() -> dict:
    return {
        "state": _JOB["state"],
        "profile": _JOB["profile"],
        "step_index": _JOB["step_index"],
        "step_total": _JOB["step_total"],
        "step_label": _JOB["step_label"],
        "error": _JOB["error"],
    }


def install_status() -> dict:
    with _JOB_LOCK:
        snap = _snapshot_locked()
    snap["logs"] = list(_JOB_LOGS)
    return snap
