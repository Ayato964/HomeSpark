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


def _get_appdata_config_path() -> Path:
    appdata = os.getenv("APPDATA")
    if appdata:
        app_dir = Path(appdata) / "HomeSpark"
        app_dir.mkdir(parents=True, exist_ok=True)
        return app_dir / "storage_config.json"
    backend_dir = Path(__file__).resolve().parent.parent.parent
    data_dir = backend_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "storage_config.json"


def _get_local_config_path() -> Path:
    backend_dir = Path(__file__).resolve().parent.parent.parent
    data_dir = backend_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "storage_config.json"


class StorageManager:
    """Singleton Storage Manager managing the active storage provider."""

    _instance: Optional[StorageManager] = None

    def __init__(self):
        # Default to 'local' (SQLite) for desktop app unless DATABASE_URL is explicitly set
        has_db_url = bool(os.getenv("DATABASE_URL") or os.getenv("DATABASE_URL_POOLED"))
        self._mode: str = "cloud" if has_db_url else "local"
        self._postgres_provider = PostgresStorageProvider()
        self._sqlite_provider = SqliteStorageProvider()
        self._load_config()

    @classmethod
    def get_instance(cls) -> StorageManager:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_config(self) -> None:
        for cfg_path in [_get_appdata_config_path(), _get_local_config_path()]:
            if cfg_path.exists():
                try:
                    with open(cfg_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        saved_mode = data.get("storage_mode")
                        if saved_mode in ("cloud", "local"):
                            self._mode = saved_mode
                            logger.info(f"[StorageManager] Loaded persistent storage mode: {self._mode} from {cfg_path}")
                            break
                except Exception as e:
                    logger.warning(f"[StorageManager] Failed to load storage config from {cfg_path}: {e}")

    def _save_config(self) -> None:
        for cfg_path in [_get_appdata_config_path(), _get_local_config_path()]:
            try:
                with open(cfg_path, "w", encoding="utf-8") as f:
                    json.dump({"storage_mode": self._mode}, f, indent=2)
                logger.info(f"[StorageManager] Saved storage mode to config: {self._mode} ({cfg_path})")
            except Exception as e:
                logger.warning(f"[StorageManager] Failed to save storage config to {cfg_path}: {e}")

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
        """Get the active storage provider instance with graceful SQLite fallback."""
        if self._mode == "local":
            return self._sqlite_provider
        
        # In cloud mode, verify DATABASE_URL is available; if not, safely fallback to SQLite
        has_db_url = bool(os.getenv("DATABASE_URL") or os.getenv("DATABASE_URL_POOLED"))
        if not has_db_url:
            logger.warning("[StorageManager] DATABASE_URL is not set. Gracefully falling back to SqliteStorageProvider.")
            return self._sqlite_provider
        
        return self._postgres_provider
