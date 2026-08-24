from __future__ import annotations

import datetime as _dt
import json
import os
import urllib.error
import urllib.request

from .tool import Tool, ToolRegistry, tool


@tool(
    name="get_current_time",
    description="現在日時を ISO 8601 形式で返します。タイムゾーンは UTC。",
    parameters={"type": "object", "properties": {}, "required": [], "additionalProperties": False},
)
def get_current_time() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


@tool(
    name="read_file",
    description="ローカルテキストファイルの内容を返します。最大 200KB まで。",
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "読み込みたいファイルの絶対または相対パス"},
        },
        "required": ["path"],
        "additionalProperties": False,
    },
)
def read_file(path: str) -> str:
    abs_path = os.path.abspath(path)
    size = os.path.getsize(abs_path)
    if size > 200_000:
        return f"[error] file too large: {size} bytes (max 200000)"
    with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


@tool(
    name="write_file",
    description="ローカルファイルへテキストを書き込みます。既存ファイルは上書き。",
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "書き込み先パス"},
            "content": {"type": "string", "description": "書き込む内容"},
        },
        "required": ["path", "content"],
        "additionalProperties": False,
    },
)
def write_file(path: str, content: str) -> str:
    abs_path = os.path.abspath(path)
    os.makedirs(os.path.dirname(abs_path) or ".", exist_ok=True)
    with open(abs_path, "w", encoding="utf-8") as f:
        f.write(content)
    return f"wrote {len(content)} chars to {abs_path}"


@tool(
    name="list_dir",
    description="ディレクトリ内のエントリ一覧を返します。",
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "対象ディレクトリ"},
        },
        "required": ["path"],
        "additionalProperties": False,
    },
)
def list_dir(path: str) -> str:
    abs_path = os.path.abspath(path)
    entries = []
    for name in sorted(os.listdir(abs_path)):
        full = os.path.join(abs_path, name)
        kind = "DIR" if os.path.isdir(full) else "FILE"
        entries.append(f"{kind}\t{name}")
    return "\n".join(entries) if entries else "(empty)"


@tool(
    name="http_get",
    description="HTTP GET でテキスト/JSON を取得して文字列で返します。最大 200KB。",
    parameters={
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "取得する URL (http/https)"},
            "timeout_sec": {"type": "integer", "description": "タイムアウト秒。既定 15"},
        },
        "required": ["url"],
        "additionalProperties": False,
    },
)
def http_get(url: str, timeout_sec: int = 15) -> str:
    if not (url.startswith("http://") or url.startswith("https://")):
        return "[error] only http/https URLs are allowed"
    req = urllib.request.Request(url, headers={"User-Agent": "sales-spark-cli/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            body = resp.read(200_001)
    except urllib.error.URLError as e:
        return f"[error] request failed: {e}"
    if len(body) > 200_000:
        return "[error] response too large (>200000 bytes)"
    try:
        return body.decode("utf-8")
    except UnicodeDecodeError:
        return body.decode("utf-8", errors="replace")


@tool(
    name="json_parse",
    description="文字列を JSON としてパースし、整形済み JSON 文字列を返します。",
    parameters={
        "type": "object",
        "properties": {
            "text": {"type": "string", "description": "JSON 文字列"},
        },
        "required": ["text"],
        "additionalProperties": False,
    },
)
def json_parse(text: str) -> str:
    try:
        obj = json.loads(text)
    except json.JSONDecodeError as e:
        return f"[error] invalid JSON: {e}"
    return json.dumps(obj, ensure_ascii=False, indent=2)


def default_registry() -> ToolRegistry:
    reg = ToolRegistry()
    reg.add_many(
        [
            get_current_time,
            read_file,
            write_file,
            list_dir,
            http_get,
            json_parse,
        ]
    )
    return reg


__all__ = [
    "get_current_time",
    "read_file",
    "write_file",
    "list_dir",
    "http_get",
    "json_parse",
    "default_registry",
]
