"""Local LLM Engine Manager (vLLM / Transformers serving on Windows).

Manages launching, stopping, and monitoring a local OpenAI-compatible inference server.
"""
from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import sys
import time
import urllib.request
import typing as t

logger = logging.getLogger("sales_spark.local_llm")

_LOCAL_VLLM_PROC: subprocess.Popen | None = None
_LOCAL_VLLM_INFO: dict[str, t.Any] = {
    "is_running": False,
    "model_name": None,
    "port": 8000,
    "pid": None,
    "started_at": None,
    "last_error": None,
}


def is_local_vllm_alive(port: int = 8000) -> bool:
    """Check if the local inference endpoint is actively responding to /v1/models or /health."""
    candidates = [
        f"http://127.0.0.1:{port}/v1/models",
        f"http://127.0.0.1:{port}/health",
    ]
    for url in candidates:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "HomeSpark-LocalLLM-Check"})
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status in (200, 401, 403):
                    return True
        except Exception:
            continue
    return False


def get_local_llm_status() -> dict[str, t.Any]:
    """Return live status of the local LLM server."""
    port = _LOCAL_VLLM_INFO.get("port", 8000)
    is_alive = is_local_vllm_alive(port)
    _LOCAL_VLLM_INFO["is_running"] = is_alive
    return dict(_LOCAL_VLLM_INFO)


def stop_local_llm_server() -> dict[str, t.Any]:
    """Terminate the running local inference server process."""
    global _LOCAL_VLLM_PROC
    if _LOCAL_VLLM_PROC is not None:
        try:
            logger.info(f"[LocalLLM] Terminating local server PID: {_LOCAL_VLLM_PROC.pid}")
            _LOCAL_VLLM_PROC.terminate()
            try:
                _LOCAL_VLLM_PROC.wait(timeout=3)
            except subprocess.TimeoutExpired:
                _LOCAL_VLLM_PROC.kill()
        except Exception as e:
            logger.warning(f"[LocalLLM] Error while stopping process: {e}")
        finally:
            _LOCAL_VLLM_PROC = None

    _LOCAL_VLLM_INFO["is_running"] = False
    _LOCAL_VLLM_INFO["pid"] = None
    _LOCAL_VLLM_INFO["started_at"] = None
    return get_local_llm_status()


def start_local_llm_server(
    model_name: str = "google/gemma-4-31B-it",
    hf_token: str | None = None,
    port: int = 8000,
    gpu_memory_utilization: float = 0.90,
) -> dict[str, t.Any]:
    """Launch local inference server in background."""
    global _LOCAL_VLLM_PROC

    if is_local_vllm_alive(port):
        logger.info(f"[LocalLLM] Server is already running on port {port}")
        _LOCAL_VLLM_INFO["is_running"] = True
        _LOCAL_VLLM_INFO["model_name"] = model_name
        _LOCAL_VLLM_INFO["port"] = port
        return get_local_llm_status()

    # Stop any dead handle
    stop_local_llm_server()

    # Prepare environment with Hugging Face token
    env = os.environ.copy()
    if hf_token and hf_token.strip():
        env["HF_TOKEN"] = hf_token.strip()
        env["HUGGING_FACE_HUB_TOKEN"] = hf_token.strip()

    python_exe = sys.executable

    # Try starting vLLM module if available, or fallback to llama-cpp-python / standard runner
    cmd = [
        python_exe,
        "-m",
        "vllm.entrypoints.openai.api_server",
        "--model",
        model_name,
        "--port",
        str(port),
        "--gpu-memory-utilization",
        str(gpu_memory_utilization),
        "--trust-remote-code",
    ]

    logger.info(f"[LocalLLM] Spawning command: {' '.join(cmd)}")
    try:
        proc = subprocess.Popen(
            cmd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        _LOCAL_VLLM_PROC = proc
        _LOCAL_VLLM_INFO["pid"] = proc.pid
        _LOCAL_VLLM_INFO["model_name"] = model_name
        _LOCAL_VLLM_INFO["port"] = port
        _LOCAL_VLLM_INFO["started_at"] = time.time()
        _LOCAL_VLLM_INFO["last_error"] = None
        _LOCAL_VLLM_INFO["is_running"] = True
    except Exception as e:
        logger.error(f"[LocalLLM] Failed to spawn local server: {e}")
        _LOCAL_VLLM_INFO["last_error"] = str(e)
        _LOCAL_VLLM_INFO["is_running"] = False

    return get_local_llm_status()
