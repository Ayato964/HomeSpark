"""Storage Façade for Sales Spark & HomeSpark.

Provides backward-compatible module-level functions that delegate seamlessly
to the active BaseStorageProvider (PostgreSQL Cloud or SQLite Local) managed by StorageManager.
"""
from __future__ import annotations

import typing as t
from typing import Any, Dict, List, Optional

from .storage import StorageManager, BaseStorageProvider


def get_storage_manager() -> StorageManager:
    """Access the global StorageManager instance."""
    return StorageManager.get_instance()


def _get_provider() -> BaseStorageProvider:
    """Access the active StorageProvider instance."""
    return StorageManager.get_instance().get_provider()


def init_spark_tables() -> None:
    """Initialize active database tables."""
    _get_provider().initialize()


# --------------------------------------------------------------------------- #
# Chat sessions & Messages
# --------------------------------------------------------------------------- #
def get_chats(uid: str) -> list[dict]:
    return _get_provider().get_chats(uid)


def get_messages(uid: str, chat_id: str) -> list[dict]:
    return _get_provider().get_messages(uid, chat_id)


def save_message(
    uid: str,
    chat_id: str,
    role: str,
    content: t.Any,
    title: str | None = None,
    model: str | None = None,
) -> None:
    _get_provider().save_message(uid, chat_id, role, content, title, model)


def delete_chat(uid: str, chat_id: str) -> None:
    _get_provider().delete_chat(uid, chat_id)


# --------------------------------------------------------------------------- #
# Google OAuth Tokens
# --------------------------------------------------------------------------- #
def save_google_tokens(uid: str, tokens: dict) -> None:
    _get_provider().save_google_tokens(uid, tokens)


def get_google_tokens(uid: str) -> dict | None:
    return _get_provider().get_google_tokens(uid)


def delete_google_tokens(uid: str) -> None:
    _get_provider().delete_google_tokens(uid)


# --------------------------------------------------------------------------- #
# Digital Business Cards
# --------------------------------------------------------------------------- #
def get_digital_business_cards(uid: str, query: str | None = None) -> list[dict]:
    return _get_provider().get_digital_business_cards(uid, query)


def save_digital_business_card(uid: str, card_data: dict) -> dict:
    return _get_provider().save_digital_business_card(uid, card_data)


def delete_digital_business_card(uid: str, card_id: str) -> bool:
    return _get_provider().delete_digital_business_card(uid, card_id)


# --------------------------------------------------------------------------- #
# Voice Memory & Skills (Long-term Archives)
# --------------------------------------------------------------------------- #
def get_user_current_minutes(uid: str) -> str | None:
    return _get_provider().get_user_current_minutes(uid)


def save_user_minutes_and_archive_old(
    uid: str, new_minutes: str, archive_title: str | None = None
) -> dict:
    return _get_provider().save_user_minutes_and_archive_old(uid, new_minutes, archive_title)


def search_user_skills(uid: str, query: str = "", limit: int = 5) -> list[dict]:
    return _get_provider().search_user_skills(uid, query, limit)


# --------------------------------------------------------------------------- #
# External IMAP / SMTP Accounts
# --------------------------------------------------------------------------- #
def get_imap_accounts(uid: str) -> list[dict]:
    return _get_provider().get_imap_accounts(uid)


def get_imap_account_by_id(uid: str, account_id: str) -> dict | None:
    return _get_provider().get_imap_account_by_id(uid, account_id)


def save_imap_account(uid: str, account_data: dict) -> dict:
    return _get_provider().save_imap_account(uid, account_data)


def delete_imap_account(uid: str, account_id: str) -> bool:
    return _get_provider().delete_imap_account(uid, account_id)
