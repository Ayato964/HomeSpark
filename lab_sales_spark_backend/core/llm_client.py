from __future__ import annotations

import json
import os
import re
import typing as t
from abc import ABC, abstractmethod
from dataclasses import dataclass

from openai import OpenAI
from openai import APIError, BadRequestError

from config.const import (
    API_KEY_ENV,
    BASE_URL,
    DEFAULT_MAX_TOKENS,
    DEFAULT_TEMPERATURE,
    DEFAULT_TOP_P,
    MAX_TOOL_ITERATIONS,
    MODEL_NAME,
    LLM_PROVIDER,
    GEMINI_BASE_URL,
    DEFAULT_GEMINI_MODEL,
    OPENAI_BASE_URL,
    DEFAULT_OPENAI_MODEL,
    DEFAULT_CUSTOM_VLLM_URL,
    DEFAULT_CUSTOM_VLLM_MODEL,
    DEFAULT_LOCAL_VLLM_URL,
    DEFAULT_LOCAL_VLLM_MODEL,
)

from .prompts import (
    TOOL_CALL_SENTINEL_CLOSE,
    TOOL_CALL_SENTINEL_OPEN,
    build_json_schema_instruction,
    build_prompted_tools_instruction,
    compose_system_prompt,
)
from .tool import ToolRegistry


Message = dict[str, t.Any]
StreamCallback = t.Callable[[str], None]


@dataclass
class AskResult:
    content: str
    messages_appended: list[Message]  # everything added beyond the user turn


ToolMode = t.Literal["native", "prompted", "auto", "off"]


class BaseLLMClient(ABC):
    @abstractmethod
    def ask(
        self,
        *,
        user_content: str | list,
        system_prompt: str | None,
        history: list[Message],
        tool_registry: ToolRegistry | None,
        json_schema: dict | None,
        tool_mode: ToolMode,
        stream: bool,
        on_token: StreamCallback | None,
        **kwargs,
    ) -> AskResult: ...


def resolve_provider_config(
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> tuple[str, str, str]:
    """Resolves (resolved_api_key, resolved_base_url, resolved_model) for the active LLM provider."""
    active_provider = provider or os.getenv("LLM_PROVIDER") or "custom_vllm"

    if active_provider == "gemini":
        resolved_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("BYTECOMPUTE_API_KEY") or ""
        resolved_url = base_url or os.getenv("GEMINI_BASE_URL") or GEMINI_BASE_URL
        resolved_model = model or os.getenv("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL
    elif active_provider == "openai":
        resolved_key = api_key or os.getenv("OPENAI_API_KEY") or ""
        resolved_url = base_url or os.getenv("OPENAI_BASE_URL") or OPENAI_BASE_URL
        resolved_model = model or os.getenv("OPENAI_MODEL") or DEFAULT_OPENAI_MODEL
    elif active_provider == "local_vllm":
        resolved_key = api_key or os.getenv("HF_TOKEN") or "EMPTY"
        resolved_url = base_url or os.getenv("LOCAL_VLLM_URL") or DEFAULT_LOCAL_VLLM_URL
        resolved_model = model or os.getenv("LOCAL_VLLM_MODEL") or DEFAULT_LOCAL_VLLM_MODEL
    else:  # custom_vllm / default
        resolved_key = (
            api_key
            or os.getenv("BYTECOMPUTE_API_KEY")
            or os.getenv("CUSTOM_VLLM_API_KEY")
            or os.getenv("OPENAI_API_KEY")
            or ""
        )
        resolved_url = base_url or os.getenv("BYTECOMPUTE_BASE_URL") or os.getenv("CUSTOM_VLLM_URL") or DEFAULT_CUSTOM_VLLM_URL
        resolved_model = model or os.getenv("MODEL_NAME") or DEFAULT_CUSTOM_VLLM_MODEL

    return resolved_key, resolved_url, resolved_model


class OpenAICompatClient(BaseLLMClient):
    """Talks to any OpenAI-compatible Chat Completions endpoint.

    Supports:
    - Google Gemini (via official OpenAI-compatible endpoint)
    - OpenAI (GPT-4o, etc.)
    - Custom vLLM / ByteCompute / self-hosted GPU servers
    - Local vLLM on Windows
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        provider: str | None = None,
        max_tool_iterations: int = MAX_TOOL_ITERATIONS,
    ) -> None:
        resolved_key, resolved_url, resolved_model = resolve_provider_config(
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            model=model,
        )

        active_provider = provider or os.getenv("LLM_PROVIDER") or "custom_vllm"
        if not resolved_key and active_provider != "local_vllm":
            key_name = "GEMINI_API_KEY" if active_provider == "gemini" else ("OPENAI_API_KEY" if active_provider == "openai" else "BYTECOMPUTE_API_KEY")
            raise ValueError(
                f"API key not found for provider '{active_provider}'. Set {key_name} in environment or settings modal."
            )

        self.client = OpenAI(
            api_key=resolved_key or "EMPTY",
            base_url=resolved_url,
        )
        self.model = resolved_model
        self.provider = active_provider
        self.max_tool_iterations = max_tool_iterations

    # ------------------------------------------------------------------ public

    def chat(
        self,
        messages: list[Message],
        max_tokens: int = DEFAULT_MAX_TOKENS,
        temperature: float = DEFAULT_TEMPERATURE,
        **kwargs,
    ) -> AskResult:
        """Simple direct chat completions call without tool execution."""
        sampling = {
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        sampling.update({k: v for k, v in kwargs.items() if v is not None})
        res = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            **sampling,
        )
        content = res.choices[0].message.content or ""
        return AskResult(content=content, messages_appended=[{"role": "assistant", "content": content}])

    def ask(
        self,
        *,
        user_content: str | list,
        system_prompt: str | None,
        history: list[Message],
        tool_registry: ToolRegistry | None,
        json_schema: dict | None,
        tool_mode: ToolMode = "auto",
        stream: bool = False,
        on_token: StreamCallback | None = None,
        temperature: float = DEFAULT_TEMPERATURE,
        top_p: float = DEFAULT_TOP_P,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        **kwargs,
    ) -> AskResult:
        effective_mode = self._resolve_tool_mode(tool_mode, tool_registry)

        sampling = {
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": max_tokens,
        }
        sampling.update({k: v for k, v in kwargs.items() if v is not None})

        # Try native tool loop first if effective_mode is native
        if effective_mode == "native" and tool_registry:
            try:
                sys_parts: list[str | None] = [system_prompt]
                if json_schema is not None:
                    sys_parts.append(build_json_schema_instruction(json_schema))
                effective_system = compose_system_prompt(*sys_parts)

                messages: list[Message] = []
                if effective_system:
                    messages.append({"role": "system", "content": effective_system})
                messages.extend(history)
                messages.append({"role": "user", "content": user_content})

                return self._loop_native(
                    messages=messages,
                    appended=[],
                    tool_registry=tool_registry,
                    json_schema=json_schema,
                    stream=stream,
                    on_token=on_token,
                    sampling=sampling,
                )
            except (BadRequestError, APIError) as e:
                # If server rejects native 'tools' schema and mode was 'auto', fall back to prompted
                if tool_mode == "auto":
                    effective_mode = "prompted"
                else:
                    raise e

        if effective_mode == "prompted" and tool_registry:
            sys_parts = [
                system_prompt,
                build_prompted_tools_instruction(tool_registry.describe_for_prompt()),
            ]
            if json_schema is not None:
                sys_parts.append(build_json_schema_instruction(json_schema))
            effective_system = compose_system_prompt(*sys_parts)

            messages = []
            if effective_system:
                messages.append({"role": "system", "content": effective_system})
            messages.extend(history)
            messages.append({"role": "user", "content": user_content})

            return self._loop_prompted(
                messages=messages,
                appended=[],
                tool_registry=tool_registry,
                json_schema=json_schema,
                stream=stream,
                on_token=on_token,
                sampling=sampling,
            )

        # off / single shot
        sys_parts = [system_prompt]
        if json_schema is not None:
            sys_parts.append(build_json_schema_instruction(json_schema))
        effective_system = compose_system_prompt(*sys_parts)

        messages = []
        if effective_system:
            messages.append({"role": "system", "content": effective_system})
        messages.extend(history)
        messages.append({"role": "user", "content": user_content})

        return self._single_shot(
            messages=messages,
            appended=[],
            json_schema=json_schema,
            stream=stream,
            on_token=on_token,
            sampling=sampling,
        )

    # --------------------------------------------------------------- internals

    def _resolve_tool_mode(
        self, mode: ToolMode, registry: ToolRegistry | None
    ) -> ToolMode:
        if not registry:
            return "off"
        if mode == "auto":
            # bytecompute.ai supports native tool calling perfectly for gemma-4-31B-it
            return "native"
        return mode

    def _merge_system_message(self, messages: list[Message]) -> list[Message]:
        if not messages:
            return messages
        if messages[0].get("role") != "system":
            return messages
        sys_content = messages[0].get("content") or ""
        new_msgs = []
        merged = False
        for msg in messages[1:]:
            if not merged and msg.get("role") == "user":
                user_content = msg.get("content") or ""
                if isinstance(user_content, str):
                    new_content = f"{sys_content}\n\n{user_content}"
                else:
                    new_content = [{"type": "text", "text": sys_content}] + list(user_content)
                new_msgs.append({**msg, "content": new_content})
                merged = True
            else:
                new_msgs.append(msg)
        if not merged:
            new_msgs.insert(0, {"role": "user", "content": sys_content})
        return new_msgs

    # ---- raw call

    def _chat_completion(
        self,
        *,
        messages: list[Message],
        tools: list[dict] | None,
        json_schema: dict | None,
        stream: bool,
        on_token: StreamCallback | None,
        sampling: dict,
    ) -> t.Any:
        req: dict[str, t.Any] = {
            "model": self.model,
            "messages": messages,
            **sampling,
        }
        if tools:
            req["tools"] = tools
        if json_schema is not None:
            req["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": json_schema.get("title", "Response"),
                    "schema": json_schema,
                    "strict": True,
                },
            }
        if stream:
            req["stream"] = True

        # Build list of fallback configurations to try in sequence
        configs_to_try = []

        # Config 1: Original request (Native response_format, system role, tools)
        configs_to_try.append(req)

        # Config 2: Try guided_json instead of response_format
        if json_schema is not None:
            c2 = req.copy()
            c2.pop("response_format", None)
            c2["guided_json"] = json_schema
            configs_to_try.append(c2)

        # Config 3: Try merging system message into first user message (for both response_format and guided_json variants)
        has_system = len(messages) > 0 and messages[0].get("role") == "system"
        if has_system:
            merged_messages = self._merge_system_message(messages)
            
            c3_a = req.copy()
            c3_a["messages"] = merged_messages
            configs_to_try.append(c3_a)

            if json_schema is not None:
                c3_b = c3_a.copy()
                c3_b.pop("response_format", None)
                c3_b["guided_json"] = json_schema
                configs_to_try.append(c3_b)

        # Config 4: Bare-minimum fallback (no response_format/guided_json, no tools)
        # Use merged messages if system role was present
        c4 = req.copy()
        c4.pop("response_format", None)
        c4.pop("guided_json", None)
        c4.pop("tools", None)
        if has_system:
            c4["messages"] = self._merge_system_message(messages)
        configs_to_try.append(c4)

        last_err = None
        for config in configs_to_try:
            try:
                return self.client.chat.completions.create(**config)
            except BadRequestError as e:
                last_err = e
                continue

        if last_err is not None:
            raise last_err

    def _consume_stream(
        self, stream: t.Iterable, on_token: StreamCallback | None
    ) -> tuple[str, list[dict]]:
        text_parts: list[str] = []
        tool_call_buf: dict[int, dict] = {}
        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            piece = getattr(delta, "content", None)
            if piece:
                text_parts.append(piece)
                if on_token:
                    on_token(piece)
            tcs = getattr(delta, "tool_calls", None) or []
            for tc in tcs:
                idx = tc.index
                slot = tool_call_buf.setdefault(
                    idx, {"id": None, "name": "", "arguments": ""}
                )
                if tc.id:
                    slot["id"] = tc.id
                fn = getattr(tc, "function", None)
                if fn:
                    if getattr(fn, "name", None):
                        slot["name"] = fn.name
                    if getattr(fn, "arguments", None):
                        slot["arguments"] += fn.arguments
        ordered = [tool_call_buf[i] for i in sorted(tool_call_buf)]
        return "".join(text_parts), ordered

    # ---- single-shot (no tools)

    def _single_shot(
        self,
        *,
        messages: list[Message],
        appended: list[Message],
        json_schema: dict | None,
        stream: bool,
        on_token: StreamCallback | None,
        sampling: dict,
    ) -> AskResult:
        resp = self._chat_completion(
            messages=messages,
            tools=None,
            json_schema=json_schema,
            stream=stream,
            on_token=on_token,
            sampling=sampling,
        )
        if stream:
            content, _ = self._consume_stream(resp, on_token)
        else:
            content = resp.choices[0].message.content or ""
        appended.append({"role": "assistant", "content": content})
        return AskResult(content=content, messages_appended=appended)

    # ---- native tool loop

    def _loop_native(
        self,
        *,
        messages: list[Message],
        appended: list[Message],
        tool_registry: ToolRegistry,
        json_schema: dict | None,
        stream: bool,
        on_token: StreamCallback | None,
        sampling: dict,
    ) -> AskResult:
        tools_schema = tool_registry.get_tools_schema()
        for _ in range(self.max_tool_iterations):
            resp = self._chat_completion(
                messages=messages,
                tools=tools_schema,
                json_schema=json_schema if not tools_schema else None,
                stream=stream,
                on_token=on_token,
                sampling=sampling,
            )
            if stream:
                content, tool_calls = self._consume_stream(resp, on_token)
                if not tool_calls:
                    prompted_call = self._parse_prompted_call(content)
                    if prompted_call:
                        name, args = prompted_call
                        asst_msg = {"role": "assistant", "content": content}
                        messages.append(asst_msg)
                        appended.append(asst_msg)
                        result_msg = self._dispatch_tool(
                            tool_registry,
                            name=name,
                            arguments_str=json.dumps(args),
                            call_id="call_prompted_fallback",
                        )
                        messages.append(result_msg)
                        appended.append(result_msg)
                        continue
                    appended.append({"role": "assistant", "content": content})
                    return AskResult(content=content, messages_appended=appended)
                asst_msg: Message = {
                    "role": "assistant",
                    "content": content or None,
                    "tool_calls": [
                        {
                            "id": tc["id"] or f"call_{i}",
                            "type": "function",
                            "function": {
                                "name": tc["name"],
                                "arguments": tc["arguments"] or "{}",
                            },
                        }
                        for i, tc in enumerate(tool_calls)
                    ],
                }
                messages.append(asst_msg)
                appended.append(asst_msg)
                for tc in tool_calls:
                    result_msg = self._dispatch_tool(
                        tool_registry,
                        name=tc["name"],
                        arguments_str=tc["arguments"] or "{}",
                        call_id=tc["id"] or "call_0",
                    )
                    messages.append(result_msg)
                    appended.append(result_msg)
                continue

            choice = resp.choices[0]
            msg = choice.message
            if not msg.tool_calls:
                content = msg.content or ""
                prompted_call = self._parse_prompted_call(content)
                if prompted_call:
                    name, args = prompted_call
                    asst_msg = {"role": "assistant", "content": content}
                    messages.append(asst_msg)
                    appended.append(asst_msg)
                    result_msg = self._dispatch_tool(
                        tool_registry,
                        name=name,
                        arguments_str=json.dumps(args),
                        call_id="call_prompted_fallback",
                    )
                    messages.append(result_msg)
                    appended.append(result_msg)
                    continue
                appended.append({"role": "assistant", "content": content})
                return AskResult(content=content, messages_appended=appended)
            asst_msg = {
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in msg.tool_calls
                ],
            }
            messages.append(asst_msg)
            appended.append(asst_msg)
            for tc in msg.tool_calls:
                result_msg = self._dispatch_tool(
                    tool_registry,
                    name=tc.function.name,
                    arguments_str=tc.function.arguments or "{}",
                    call_id=tc.id,
                )
                messages.append(result_msg)
                appended.append(result_msg)

        appended.append(
            {
                "role": "assistant",
                "content": "[max tool iterations reached]",
            }
        )
        return AskResult(
            content="[max tool iterations reached]", messages_appended=appended
        )

    def _dispatch_tool(
        self,
        registry: ToolRegistry,
        *,
        name: str,
        arguments_str: str,
        call_id: str,
    ) -> Message:
        try:
            args = json.loads(arguments_str) if arguments_str else {}
        except json.JSONDecodeError as e:
            result = f"[error] failed to parse arguments JSON: {e}"
        else:
            try:
                raw = registry.execute(name, args)
                result = raw if isinstance(raw, str) else json.dumps(
                    raw, ensure_ascii=False, default=str
                )
            except Exception as e:  # noqa: BLE001
                result = f"[error] tool {name!r} raised: {e}"
        return {
            "role": "tool",
            "tool_call_id": call_id,
            "name": name,
            "content": result,
        }

    # ---- prompted tool loop

    _PROMPTED_RE = re.compile(
        re.escape(TOOL_CALL_SENTINEL_OPEN)
        + r"\s*(?P<body>\{.*?\})\s*"
        + re.escape(TOOL_CALL_SENTINEL_CLOSE),
        re.DOTALL,
    )

    def _loop_prompted(
        self,
        *,
        messages: list[Message],
        appended: list[Message],
        tool_registry: ToolRegistry,
        json_schema: dict | None,
        stream: bool,
        on_token: StreamCallback | None,
        sampling: dict,
    ) -> AskResult:
        for _ in range(self.max_tool_iterations):
            resp = self._chat_completion(
                messages=messages,
                tools=None,
                json_schema=json_schema,
                stream=stream,
                on_token=on_token,
                sampling=sampling,
            )
            if stream:
                content, _ = self._consume_stream(resp, on_token)
            else:
                content = resp.choices[0].message.content or ""

            parsed = self._parse_prompted_call(content)
            if parsed is None:
                appended.append({"role": "assistant", "content": content})
                return AskResult(content=content, messages_appended=appended)

            name, args = parsed
            asst_msg = {"role": "assistant", "content": content}
            messages.append(asst_msg)
            appended.append(asst_msg)
            try:
                raw = tool_registry.execute(name, args)
                tool_result = (
                    raw
                    if isinstance(raw, str)
                    else json.dumps(raw, ensure_ascii=False, default=str)
                )
            except KeyError:
                tool_result = f"[error] unknown tool: {name}"
            except Exception as e:  # noqa: BLE001
                tool_result = f"[error] tool {name!r} raised: {e}"

            feedback: Message = {
                "role": "user",
                "content": (
                    f"TOOL_RESULT[{name}]:\n{tool_result}\n\n"
                    "上記の結果をふまえて、ユーザーへの回答を続けてください。"
                    "さらにツール呼び出しが必要な場合は同じ形式で 1 件だけ出力してください。"
                ),
            }
            messages.append(feedback)
            appended.append(feedback)

        appended.append(
            {"role": "assistant", "content": "[max tool iterations reached]"}
        )
        return AskResult(
            content="[max tool iterations reached]", messages_appended=appended
        )

    def _parse_prompted_call(self, text: str) -> tuple[str, dict] | None:
        m = self._PROMPTED_RE.search(text)
        if not m:
            return None
        body = m.group("body").strip()
        # Clean markdown code fences if present inside sentinel tags
        if body.startswith("```"):
            body = re.sub(r"^```(?:json)?\s*", "", body, flags=re.IGNORECASE)
            body = re.sub(r"\s*```$", "", body)
        try:
            obj = json.loads(body)
        except json.JSONDecodeError:
            return None
        name = obj.get("tool")
        args = obj.get("arguments", {})
        if not isinstance(name, str) or not isinstance(args, dict):
            return None
        return name, args


def get_llm_client(
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> BaseLLMClient:
    """Factory to obtain the appropriate LLM client instance for the active configuration."""
    return OpenAICompatClient(
        provider=provider,
        api_key=api_key,
        base_url=base_url,
        model=model,
    )
