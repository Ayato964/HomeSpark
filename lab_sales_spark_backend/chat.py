from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # python-dotenv is optional but recommended
    pass

from config.const import DEFAULT_SYSTEM_PROMPT, MODEL_NAME
from core.agent import Agent
from core.llm_client import OpenAICompatClient
from core.tool_calls import default_registry


SESSIONS_DIR = Path("sessions")

HELP_TEXT = """\
利用可能なコマンド:
  /help                 このヘルプを表示
  /exit, /quit          終了
  /reset                会話履歴をクリア
  /history              会話履歴を JSON で表示
  /tools                登録済みツール一覧
  /toolmode <mode>      tool 呼び出しモード切替 (auto|native|prompted|off)
  /json on <schema?>    JSON 出力モード ON (schema は JSON ファイルパス、省略可)
  /json off             JSON 出力モード OFF
  /sys <prompt>         システムプロンプトを書き換え
  /sys show             現在のシステムプロンプトを表示
  /stream on|off        ストリーミング切替
  /save <name>          現在の会話を sessions/<name>.json に保存
  /load <name>          sessions/<name>.json から会話を復元
  /model                現在のモデル名を表示
"""

DEFAULT_JSON_SCHEMA = {
    "title": "Response",
    "type": "object",
    "properties": {
        "thinking": {"type": "string", "description": "思考メモ"},
        "answer": {"type": "string", "description": "ユーザーへの最終回答"},
    },
    "required": ["thinking", "answer"],
    "additionalProperties": False,
}


def color(text: str, code: str) -> str:
    if os.name == "nt" and not os.getenv("FORCE_COLOR"):
        return text
    return f"\033[{code}m{text}\033[0m"


def banner(model: str, tool_mode: str, stream: bool, tools_count: int) -> str:
    return (
        "================ Gemma 4 CLI ================\n"
        f" model     : {model}\n"
        f" tool mode : {tool_mode}  ({tools_count} tools)\n"
        f" streaming : {'on' if stream else 'off'}\n"
        " '/help' でコマンド一覧。 '/exit' で終了。\n"
        "============================================="
    )


def read_multiline_input() -> str:
    """Single-line by default. If line ends with backslash, continue."""
    try:
        line = input(color("you> ", "1;36"))
    except EOFError:
        return "/exit"
    while line.endswith("\\"):
        line = line[:-1] + "\n"
        try:
            cont = input(color(".... ", "1;36"))
        except EOFError:
            break
        line += cont
    return line


def handle_slash(agent: Agent, raw: str) -> tuple[bool, str | None]:
    """Returns (handled, message). If handled is True, we skip LLM call."""
    parts = raw.strip().split(maxsplit=1)
    cmd = parts[0].lower()
    arg = parts[1].strip() if len(parts) > 1 else ""

    if cmd in ("/exit", "/quit"):
        return True, "__EXIT__"
    if cmd == "/help":
        return True, HELP_TEXT
    if cmd == "/reset":
        agent.reset()
        return True, "(memory cleared)"
    if cmd == "/history":
        return True, json.dumps(agent.history(), ensure_ascii=False, indent=2)
    if cmd == "/tools":
        if not agent.tools:
            return True, "(no tools registered)"
        return True, "\n".join(f"- {n}" for n in agent.tools.names())
    if cmd == "/toolmode":
        if arg not in ("auto", "native", "prompted", "off"):
            return True, "usage: /toolmode <auto|native|prompted|off>"
        agent.set_tool_mode(arg)  # type: ignore[arg-type]
        return True, f"tool mode -> {arg}"
    if cmd == "/json":
        sub = arg.split(maxsplit=1)
        if not sub:
            return True, "usage: /json on [schema.json] | /json off"
        if sub[0] == "off":
            agent.set_json_schema(None)
            return True, "JSON mode OFF"
        if sub[0] == "on":
            if len(sub) > 1:
                schema_path = sub[1].strip()
                try:
                    with open(schema_path, "r", encoding="utf-8") as f:
                        schema = json.load(f)
                except Exception as e:  # noqa: BLE001
                    return True, f"[error] failed to load schema: {e}"
                agent.set_json_schema(schema)
                return True, f"JSON mode ON (schema: {schema_path})"
            agent.set_json_schema(DEFAULT_JSON_SCHEMA)
            return True, "JSON mode ON (default schema: {thinking, answer})"
        return True, "usage: /json on [schema.json] | /json off"
    if cmd == "/sys":
        if arg == "show" or arg == "":
            return True, agent.system_prompt
        agent.set_system_prompt(arg)
        return True, "(system prompt updated)"
    if cmd == "/stream":
        if arg not in ("on", "off"):
            return True, "usage: /stream <on|off>"
        agent.stream = arg == "on"
        return True, f"streaming -> {arg}"
    if cmd == "/save":
        if not arg:
            return True, "usage: /save <name>"
        SESSIONS_DIR.mkdir(exist_ok=True)
        path = SESSIONS_DIR / f"{arg}.json"
        agent.save(str(path))
        return True, f"saved -> {path}"
    if cmd == "/load":
        if not arg:
            return True, "usage: /load <name>"
        path = SESSIONS_DIR / f"{arg}.json"
        if not path.exists():
            return True, f"[error] not found: {path}"
        agent.load(str(path))
        return True, f"loaded <- {path}"
    if cmd == "/model":
        return True, MODEL_NAME
    return False, None


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Gemma 4 (bytecompute.ai) interactive CLI chat",
    )
    p.add_argument("-p", "--prompt", help="one-shot prompt; print response and exit")
    p.add_argument(
        "--system",
        default=DEFAULT_SYSTEM_PROMPT,
        help="custom system prompt",
    )
    p.add_argument(
        "--tool-mode",
        default="auto",
        choices=["auto", "native", "prompted", "off"],
        help="tool calling mode (default: auto -> prompted)",
    )
    p.add_argument("--no-tools", action="store_true", help="disable tool registry")
    p.add_argument("--no-stream", action="store_true", help="disable streaming output")
    p.add_argument(
        "--json",
        action="store_true",
        help="enable JSON mode with default {thinking, answer} schema",
    )
    p.add_argument(
        "--json-schema",
        help="path to a JSON schema file to constrain output",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()

    try:
        client = OpenAICompatClient()
    except ValueError as e:
        print(color(f"[fatal] {e}", "31"), file=sys.stderr)
        return 2

    registry = None if args.no_tools else default_registry()
    schema: dict | None = None
    if args.json_schema:
        with open(args.json_schema, "r", encoding="utf-8") as f:
            schema = json.load(f)
    elif args.json:
        schema = DEFAULT_JSON_SCHEMA

    agent = Agent(
        client=client,
        system_prompt=args.system,
        tools=registry,
        tool_mode=args.tool_mode,
        json_schema=schema,
        stream=not args.no_stream,
    )

    # ---- one-shot mode

    if args.prompt is not None:
        if agent.stream:
            agent.ask(args.prompt, on_token=lambda tok: print(tok, end="", flush=True))
            print()
        else:
            out = agent.ask(args.prompt)
            print(out)
        return 0

    # ---- interactive mode

    print(banner(
        model=MODEL_NAME,
        tool_mode=agent.tool_mode,
        stream=agent.stream,
        tools_count=len(agent.tools) if agent.tools else 0,
    ))

    while True:
        raw = read_multiline_input()
        if not raw.strip():
            continue
        if raw.startswith("/"):
            handled, msg = handle_slash(agent, raw)
            if handled:
                if msg == "__EXIT__":
                    print("bye.")
                    return 0
                if msg is not None:
                    print(msg)
                continue

        print(color("ai>", "1;32"), end=" ", flush=True)
        try:
            if agent.stream:
                agent.ask(raw, on_token=lambda tok: print(tok, end="", flush=True))
                print()
            else:
                out = agent.ask(raw)
                print(out)
        except KeyboardInterrupt:
            print("\n(interrupted)")
        except Exception as e:  # noqa: BLE001
            print(color(f"\n[error] {e}", "31"))


if __name__ == "__main__":
    sys.exit(main())
