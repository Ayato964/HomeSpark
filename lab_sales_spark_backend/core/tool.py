from __future__ import annotations

import inspect
import typing as t
from dataclasses import dataclass, field

JsonValue = t.Union[str, int, float, bool, None, dict, list]
ToolFunc = t.Callable[..., t.Any]


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    func: ToolFunc

    @property
    def schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    def __call__(self, **kwargs) -> t.Any:
        return self.func(**kwargs)


def tool(
    name: str | None = None,
    description: str | None = None,
    parameters: dict | None = None,
) -> t.Callable[[ToolFunc], Tool]:
    """Decorator. If parameters is omitted, build a minimal schema from the
    function signature (all params required, typed as string)."""

    def decorator(func: ToolFunc) -> Tool:
        resolved_name = name or func.__name__
        resolved_desc = description or (inspect.getdoc(func) or "").strip() or resolved_name
        resolved_params = parameters or _infer_parameters(func)
        return Tool(
            name=resolved_name,
            description=resolved_desc,
            parameters=resolved_params,
            func=func,
        )

    return decorator


def _infer_parameters(func: ToolFunc) -> dict:
    sig = inspect.signature(func)
    props: dict[str, dict] = {}
    required: list[str] = []
    for pname, param in sig.parameters.items():
        if pname == "self":
            continue
        json_type = _python_type_to_json(param.annotation)
        props[pname] = {"type": json_type}
        if param.default is inspect.Parameter.empty:
            required.append(pname)
    return {
        "type": "object",
        "properties": props,
        "required": required,
        "additionalProperties": False,
    }


_TYPE_MAP = {
    str: "string",
    int: "integer",
    float: "number",
    bool: "boolean",
    list: "array",
    dict: "object",
}


def _python_type_to_json(py_type: t.Any) -> str:
    if py_type is inspect.Parameter.empty:
        return "string"
    return _TYPE_MAP.get(py_type, "string")


@dataclass
class ToolRegistry:
    _tools: dict[str, Tool] = field(default_factory=dict)

    def add(self, t: Tool) -> "ToolRegistry":
        self._tools[t.name] = t
        return self

    def add_many(self, tools: t.Iterable[Tool]) -> "ToolRegistry":
        for tl in tools:
            self.add(tl)
        return self

    def remove(self, name: str) -> None:
        self._tools.pop(name, None)

    def names(self) -> list[str]:
        return list(self._tools.keys())

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def __len__(self) -> int:
        return len(self._tools)

    def __bool__(self) -> bool:
        return bool(self._tools)

    def get_tools_schema(self) -> list[dict] | None:
        if not self._tools:
            return None
        return [tl.schema for tl in self._tools.values()]

    def describe_for_prompt(self) -> str:
        """Human/LLM-readable tool catalogue for prompted-JSON tool calling."""
        lines: list[str] = []
        for tl in self._tools.values():
            params = tl.parameters.get("properties", {})
            required = set(tl.parameters.get("required", []))
            param_lines = []
            for pname, pdef in params.items():
                ptype = pdef.get("type", "string")
                pdesc = pdef.get("description", "")
                marker = "" if pname in required else "?"
                tail = f" — {pdesc}" if pdesc else ""
                param_lines.append(f"    - {pname}{marker} ({ptype}){tail}")
            params_block = "\n".join(param_lines) if param_lines else "    (no parameters)"
            lines.append(f"- {tl.name}: {tl.description}\n{params_block}")
        return "\n".join(lines)

    def execute(self, name: str, arguments: dict | None) -> t.Any:
        tl = self._tools.get(name)
        if tl is None:
            raise KeyError(f"Unknown tool: {name}")
        args = arguments or {}
        return tl(**args)
