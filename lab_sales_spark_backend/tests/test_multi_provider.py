"""Unit tests for Multi-Provider LLM Configuration and Resolution."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from config.const import (
    GEMINI_BASE_URL,
    DEFAULT_GEMINI_MODEL,
    OPENAI_BASE_URL,
    DEFAULT_OPENAI_MODEL,
    DEFAULT_CUSTOM_VLLM_URL,
    DEFAULT_CUSTOM_VLLM_MODEL,
    DEFAULT_LOCAL_VLLM_URL,
    DEFAULT_LOCAL_VLLM_MODEL,
)
from core.llm_client import resolve_provider_config, OpenAICompatClient, get_llm_client
from server import app


class TestMultiProviderResolution(unittest.TestCase):
    def test_gemini_resolution(self):
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini", "GEMINI_API_KEY": "test-gemini-key", "GEMINI_MODEL": "gemini-2.5-flash"}, clear=True):
            key, url, model = resolve_provider_config()
            self.assertEqual(key, "test-gemini-key")
            self.assertEqual(url, GEMINI_BASE_URL)
            self.assertEqual(model, "gemini-2.5-flash")

    def test_openai_resolution(self):
        with patch.dict(os.environ, {"LLM_PROVIDER": "openai", "OPENAI_API_KEY": "test-openai-key", "OPENAI_MODEL": "gpt-4.5-preview"}, clear=True):
            key, url, model = resolve_provider_config()
            self.assertEqual(key, "test-openai-key")
            self.assertEqual(url, OPENAI_BASE_URL)
            self.assertEqual(model, "gpt-4.5-preview")

    def test_custom_vllm_resolution(self):
        with patch.dict(os.environ, {"LLM_PROVIDER": "custom_vllm", "BYTECOMPUTE_API_KEY": "test-bc-key", "MODEL_NAME": "gemma-4-31B-it", "BYTECOMPUTE_BASE_URL": DEFAULT_CUSTOM_VLLM_URL}, clear=True):
            key, url, model = resolve_provider_config()
            self.assertEqual(key, "test-bc-key")
            self.assertEqual(url, DEFAULT_CUSTOM_VLLM_URL)
            self.assertEqual(model, "gemma-4-31B-it")

    def test_local_vllm_resolution(self):
        with patch.dict(os.environ, {"LLM_PROVIDER": "local_vllm", "HF_TOKEN": "hf_12345", "LOCAL_VLLM_MODEL": "google/gemma-4-31B-it", "LOCAL_VLLM_URL": DEFAULT_LOCAL_VLLM_URL}, clear=True):
            key, url, model = resolve_provider_config()
            self.assertEqual(key, "hf_12345")
            self.assertEqual(url, DEFAULT_LOCAL_VLLM_URL)
            self.assertEqual(model, "google/gemma-4-31B-it")


class TestLlmConfigEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_get_llm_config(self):
        response = self.client.get("/api/settings/llm-config")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("active_provider", data)
        self.assertIn("providers", data)
        self.assertIn("gemini", data["providers"])
        self.assertIn("openai", data["providers"])
        self.assertIn("custom_vllm", data["providers"])
        self.assertIn("local_vllm", data["providers"])
        self.assertIn("gpu", data)
        self.assertIn("has_gpu", data["gpu"])

    def test_save_llm_config(self):
        payload = {
            "active_provider": "gemini",
            "gemini": {
                "api_key": "AIzaSyTestKey12345",
                "model_name": "gemini-2.5-pro",
            }
        }
        response = self.client.post("/api/settings/llm-config", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["active_provider"], "gemini")
        self.assertEqual(os.environ.get("LLM_PROVIDER"), "gemini")
        self.assertEqual(os.environ.get("GEMINI_API_KEY"), "AIzaSyTestKey12345")
        self.assertEqual(os.environ.get("GEMINI_MODEL"), "gemini-2.5-pro")

    def test_test_llm_connection_mock(self):
        with patch("core.llm_client.OpenAICompatClient") as mock_client_cls:
            mock_inst = MagicMock()
            mock_res = MagicMock()
            mock_res.content = "pong"
            mock_inst.ask.return_value = mock_res
            mock_client_cls.return_value = mock_inst

            payload = {
                "provider": "gemini",
                "api_key": "AIzaSyDummyKey",
                "model_name": "gemini-2.5-flash",
            }
            response = self.client.post("/api/settings/llm-test", json=payload)
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertTrue(data["success"])
            self.assertEqual(data["response"], "pong")


if __name__ == "__main__":
    unittest.main()
