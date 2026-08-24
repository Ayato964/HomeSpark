from __future__ import annotations

import json

TOOL_CALL_SENTINEL_OPEN = "<<<TOOL_CALL>>>"
TOOL_CALL_SENTINEL_CLOSE = "<<<END_TOOL_CALL>>>"


PROMPTED_TOOL_TEMPLATE = """\
あなたは以下のツールを利用できます。回答にツール呼び出しが  必要な場合は、
前置きや解説、Markdownのコードブロック (```) を一切含めず、次の正確な形式で **JSON 1 件のみ** を出力してください。

{open}
{{"tool": "<tool_name>", "arguments": {{ ...key/value... }}}}
{close}

- arguments は必ず JSON オブジェクト形式とし、ツールの定義に従ったキーのみを含めてください。
- ツールが不要な場合は、ツール呼び出しの形式を絶対に使わず、通常の日本語で回答してください。
- 1 ターンにつき呼び出しは 1 ツールまでです。複数必要な場合は、ツール結果を受け取った次のターンで続けてください。

# 利用可能なツール

{tool_catalogue}
"""


def build_prompted_tools_instruction(tool_catalogue: str) -> str:
    return PROMPTED_TOOL_TEMPLATE.format(
        open=TOOL_CALL_SENTINEL_OPEN,
        close=TOOL_CALL_SENTINEL_CLOSE,
        tool_catalogue=tool_catalogue,
    )


JSON_SCHEMA_TEMPLATE = """\
以下の JSON Schema に **厳密に** 一致する JSON オブジェクトのみを返してください。
前置きや解説、コードフェンス (```), Markdown は一切不要です。出力は有効な JSON 1 件のみとします。

# Schema
{schema}
"""


def build_json_schema_instruction(schema: dict) -> str:
    return JSON_SCHEMA_TEMPLATE.format(schema=json.dumps(schema, ensure_ascii=False, indent=2))


def compose_system_prompt(*parts: str | None) -> str:
    return "\n\n".join(p.strip() for p in parts if p and p.strip())
