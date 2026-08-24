from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch
from openai import BadRequestError

from core.llm_client import OpenAICompatClient, AskResult
from core.tool import Tool, ToolRegistry


def dummy_tool(location: str) -> str:
    return f"Weather in {location} is Sunny"


class TestLLMClientToolCalling(unittest.TestCase):
    def setUp(self):
        self.registry = ToolRegistry()
        self.registry.add(
            Tool(
                name="get_weather",
                description="Get weather for a location",
                parameters={
                    "type": "object",
                    "properties": {"location": {"type": "string"}},
                    "required": ["location"],
                    "additionalProperties": False,
                },
                func=dummy_tool,
            )
        )

    @patch.object(OpenAICompatClient, "_loop_native")
    def test_native_mode_success(self, mock_loop_native):
        mock_loop_native.return_value = AskResult(
            content="The weather in Tokyo is Sunny.",
            messages_appended=[{"role": "assistant", "content": "The weather in Tokyo is Sunny."}],
        )
        
        client = OpenAICompatClient(api_key="mock-key")
        result = client.ask(
            user_content="Tokyo weather?",
            system_prompt=None,
            history=[],
            tool_registry=self.registry,
            json_schema=None,
            tool_mode="auto",
        )
        
        self.assertEqual(result.content, "The weather in Tokyo is Sunny.")
        mock_loop_native.assert_called_once()

    @patch.object(OpenAICompatClient, "_loop_prompted")
    @patch.object(OpenAICompatClient, "_loop_native")
    def test_auto_mode_fallback_to_prompted_on_bad_request(self, mock_loop_native, mock_loop_prompted):
        # Simulate BadRequestError when calling native tool loop
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_loop_native.side_effect = BadRequestError(
            message="tools parameter not supported",
            response=mock_response,
            body={"error": {"message": "tools parameter not supported"}},
        )

        mock_loop_prompted.return_value = AskResult(
            content="Fallback answer: Tokyo is Sunny.",
            messages_appended=[{"role": "assistant", "content": "Fallback answer: Tokyo is Sunny."}],
        )

        client = OpenAICompatClient(api_key="mock-key")
        result = client.ask(
            user_content="Tokyo weather?",
            system_prompt=None,
            history=[],
            tool_registry=self.registry,
            json_schema=None,
            tool_mode="auto",
        )

        self.assertEqual(result.content, "Fallback answer: Tokyo is Sunny.")
        mock_loop_native.assert_called_once()
        mock_loop_prompted.assert_called_once()

    def test_parse_prompted_call(self):
        client = OpenAICompatClient(api_key="mock-key")
        text = 'Here is the call: <<<TOOL_CALL>>>{"tool": "get_weather", "arguments": {"location": "Tokyo"}}<<<END_TOOL_CALL>>>'
        parsed = client._parse_prompted_call(text)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed[0], "get_weather")
        self.assertEqual(parsed[1], {"location": "Tokyo"})

    @patch.object(OpenAICompatClient, "_chat_completion")
    def test_native_loop_sentinel_fallback(self, mock_chat_comp):
        # First call returns no native tool_calls, but text with <<<TOOL_CALL>>>
        mock_choice_1 = MagicMock()
        mock_choice_1.message.tool_calls = None
        mock_choice_1.message.content = '<<<TOOL_CALL>>>{"tool": "get_weather", "arguments": {"location": "Tokyo"}}<<<END_TOOL_CALL>>>'
        mock_resp_1 = MagicMock()
        mock_resp_1.choices = [mock_choice_1]

        # Second call after tool execution returns final answer
        mock_choice_2 = MagicMock()
        mock_choice_2.message.tool_calls = None
        mock_choice_2.message.content = "Tokyo is Sunny today."
        mock_resp_2 = MagicMock()
        mock_resp_2.choices = [mock_choice_2]

        mock_chat_comp.side_effect = [mock_resp_1, mock_resp_2]

        client = OpenAICompatClient(api_key="mock-key")
        result = client.ask(
            user_content="Tokyo weather?",
            system_prompt=None,
            history=[],
            tool_registry=self.registry,
            json_schema=None,
            tool_mode="native",
        )

        self.assertEqual(result.content, "Tokyo is Sunny today.")
        self.assertEqual(mock_chat_comp.call_count, 2)


if __name__ == "__main__":
    unittest.main()
