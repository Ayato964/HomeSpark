"""Storage Manager.

Acts as the Context & Factory for Storage Providers, allowing dynamic switching
between Cloud (PostgreSQL) and Local (SQLite) storage modes.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Optional

from .base import BaseStorageProvider
from .postgres_provider import PostgresStorageProvider
from .sqlite_provider import SqliteStorageProvider

logger = logging.getLogger("sales_spark")


def _get_config_path() -> Path:
    backend_dir = Path(__file__).resolve().parent.parent.parent
    data_dir = backend_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "storage_config.json"


class StorageManager:
    """Singleton Storage Manager managing the active storage provider."""

    _instance: Optional[StorageManager] = None

    def __init__(self):
        self._mode: str = "cloud"  # 'cloud' | 'local'
        self._postgres_provider = PostgresStorageProvider()
        self._sqlite_provider = SqliteStorageProvider()
        self._load_config()

    @classmethod
    def get_instance(cls) -> StorageManager:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_config(self) -> None:
        cfg_path = _get_config_path()
        if cfg_path.exists():
            try:
                with open(cfg_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    saved_mode = data.get("storage_mode")
                    if saved_mode in ("cloud", "local"):
                        self._mode = saved_mode
                        logger.info(f"[StorageManager] Loaded persistent storage mode: {self._mode}")
            except Exception as e:
                logger.warning(f"[StorageManager] Failed to load storage config: {e}")

    def _save_config(self) -> None:
        cfg_path = _get_config_path()
        try:
            with open(cfg_path, "w", encoding="utf-8") as f:
                json.dump({"storage_mode": self._mode}, f, indent=2)
            logger.info(f"[StorageManager] Saved storage mode to config: {self._mode}")
        except Exception as e:
            logger.error(f"[StorageManager] Failed to save storage config: {e}")

    @property
    def mode(self) -> str:
        """Get current storage mode: 'cloud' or 'local'."""
        return self._mode

    def set_mode(self, mode: str) -> None:
        """Switch storage mode between 'cloud' and 'local'."""
        if mode not in ("cloud", "local"):
            raise ValueError(f"Invalid storage mode '{mode}'. Must be 'cloud' or 'local'.")
        self._mode = mode
        self._save_config()
        logger.info(f"[StorageManager] Storage mode switched to: {self._mode}")

    def get_provider(self) -> BaseStorageProvider:
        """Get the active storage provider instance."""
        if self._mode == "local":
            return self._sqlite_provider
        return self._postgres_provider
