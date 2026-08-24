from __future__ import annotations

import json
import typing as t
from dataclasses import dataclass, field

from config.const import DEFAULT_SYSTEM_PROMPT

from .llm_client import (
    AskResult,
    BaseLLMClient,
    Message,
    StreamCallback,
    ToolMode,
)
from .tool import ToolRegistry


@dataclass
class Agent:
    client: BaseLLMClient
    system_prompt: str = DEFAULT_SYSTEM_PROMPT
    tools: ToolRegistry | None = None
    memory: list[Message] = field(default_factory=list)
    tool_mode: ToolMode = "auto"
    json_schema: dict | None = None
    stream: bool = True

    def reset(self) -> None:
        self.memory.clear()

    def set_system_prompt(self, prompt: str) -> None:
        self.system_prompt = prompt

    def set_json_schema(self, schema: dict | None) -> None:
        self.json_schema = schema

    def set_tool_mode(self, mode: ToolMode) -> None:
        self.tool_mode = mode

    def history(self) -> list[Message]:
        return list(self.memory)

    def ask(
        self,
        user_content: str | list,
        *,
        on_token: StreamCallback | None = None,
        **kwargs,
    ) -> str:
        user_msg: Message = {"role": "user", "content": user_content}
        result: AskResult = self.client.ask(
            user_content=user_content,
            system_prompt=self.system_prompt,
            history=self.history(),
            tool_registry=self.tools,
            json_schema=self.json_schema,
            tool_mode=self.tool_mode,
            stream=self.stream,
            on_token=on_token,
            **kwargs,
        )
        self.memory.append(user_msg)
        self.memory.extend(result.messages_appended)
        return result.content

    # ------------- persistence

    def save(self, path: str) -> None:
        payload = {
            "system_prompt": self.system_prompt,
            "tool_mode": self.tool_mode,
            "json_schema": self.json_schema,
            "memory": self.memory,
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    def load(self, path: str) -> None:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        self.system_prompt = payload.get("system_prompt", self.system_prompt)
        self.tool_mode = payload.get("tool_mode", self.tool_mode)
        self.json_schema = payload.get("json_schema")
        self.memory = payload.get("memory", [])
