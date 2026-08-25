"""SQLite Local Storage Provider.

Implements BaseStorageProvider for local offline persistence (Desktop App).
Stores chats, messages, memory/skills, digital cards, and settings in a local SQLite database.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
import typing as t
import uuid
from datetime import datetime
from pathlib import Path

from .base import BaseStorageProvider


def _get_default_sqlite_path() -> str:
    backend_dir = Path(__file__).resolve().parent.parent.parent
    data_dir = backend_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return str(data_dir / "homespark_local.db")


class SqliteStorageProvider(BaseStorageProvider):
    """SQLite Local Storage Provider for Desktop App."""

    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or _get_default_sqlite_path()
        self._initialized = False

    @property
    def provider_type(self) -> str:
        return "local"

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def initialize(self) -> None:
        if self._initialized:
            return
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        with self._get_conn() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS spark_chats (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    user_ref TEXT NOT NULL,
                    title TEXT NOT NULL,
                    model TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_sqlite_chats_user ON spark_chats (tenant_id, user_ref);

                CREATE TABLE IF NOT EXISTS spark_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tenant_id TEXT NOT NULL,
                    user_ref TEXT NOT NULL,
                    chat_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT,
                    tool_calls TEXT,
                    tool_call_id TEXT,
                    name TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (chat_id) REFERENCES spark_chats(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_sqlite_msgs_chat ON spark_messages (chat_id);

                CREATE TABLE IF NOT EXISTS spark_digital_business_cards (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    user_ref TEXT NOT NULL,
                    company_name TEXT NOT NULL,
                    person_name TEXT NOT NULL,
                    department TEXT,
                    position TEXT,
                    email TEXT,
                    phone TEXT,
                    address TEXT,
                    website TEXT,
                    profile_summary TEXT,
                    exchange_date TEXT,
                    exchange_place TEXT,
                    notes TEXT,
                    tags TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_sqlite_cards_user ON spark_digital_business_cards (tenant_id, user_ref);

                CREATE TABLE IF NOT EXISTS spark_skills (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    user_ref TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'general',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_sqlite_skills_user ON spark_skills (tenant_id, user_ref);

                CREATE TABLE IF NOT EXISTS spark_voice_memory (
                    tenant_id TEXT NOT NULL,
                    user_ref TEXT NOT NULL,
                    current_minutes TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (tenant_id, user_ref)
                );

                CREATE TABLE IF NOT EXISTS spark_imap_accounts (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    user_ref TEXT NOT NULL,
                    email_address TEXT NOT NULL,
                    account_name TEXT,
                    imap_host TEXT NOT NULL,
                    imap_port INTEGER NOT NULL DEFAULT 993,
                    imap_ssl INTEGER NOT NULL DEFAULT 1,
                    imap_username TEXT NOT NULL,
                    imap_password TEXT NOT NULL,
                    smtp_host TEXT NOT NULL,
                    smtp_port INTEGER NOT NULL DEFAULT 465,
                    smtp_ssl INTEGER NOT NULL DEFAULT 1,
                    smtp_username TEXT NOT NULL,
                    smtp_password TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_sqlite_imap_user ON spark_imap_accounts (tenant_id, user_ref);

                CREATE TABLE IF NOT EXISTS spark_google_tokens (
                    tenant_id TEXT NOT NULL,
                    user_ref TEXT NOT NULL,
                    access_token TEXT NOT NULL,
                    refresh_token TEXT,
                    token_expiry INTEGER,
                    scope TEXT,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (tenant_id, user_ref)
                );
                """
            )
        self._initialized = True

    # ----------------------------------------------------------------------- #
    # Chats & Messages
    # ----------------------------------------------------------------------- #
    def get_chats(self, uid: str) -> list[dict]:
        self.initialize()
        with self._get_conn() as conn:
            rows = conn.execute(
                """
                SELECT id, title, model, updated_at
                FROM spark_chats
                WHERE user_ref = ?
                ORDER BY updated_at DESC
                """,
                (uid,),
            ).fetchall()
        return [
            {
                "id": str(r["id"]),
                "title": r["title"] or "新規チャット",
                "model": r["model"] or "spark-pro",
                "updatedAt": r["updated_at"],
            }
            for r in rows
        ]

    def get_messages(self, uid: str, chat_id: str) -> list[dict]:
        self.initialize()
        with self._get_conn() as conn:
            rows = conn.execute(
                """
                SELECT role, content, created_at
                FROM spark_messages
                WHERE user_ref = ? AND chat_id = ?
                ORDER BY created_at ASC
                """,
                (uid, str(chat_id)),
            ).fetchall()
        result = []
        for r in rows:
            raw = r["content"]
            try:
                parsed = json.loads(raw) if raw else None
            except Exception:
                parsed = raw
            result.append({
                "role": r["role"],
                "content": parsed,
                "createdAt": r["created_at"],
            })
        return result

    def save_message(
        self,
        uid: str,
        chat_id: str,
        role: str,
        content: t.Any,
        title: str | None = None,
        model: str | None = None,
        tool_calls: t.Any = None,
        tool_call_id: str | None = None,
        name: str | None = None,
        **kwargs: t.Any,
    ) -> None:
        self.initialize()
        cid = str(chat_id)
        content_str = json.dumps(content, ensure_ascii=False) if content is not None else None
        tool_calls_str = json.dumps(tool_calls, ensure_ascii=False) if tool_calls is not None else None
        now_iso = datetime.now().isoformat()
        with self._get_conn() as conn:
            # Defensive column addition for existing sqlite DBs
            try:
                conn.execute("ALTER TABLE spark_messages ADD COLUMN tool_calls TEXT")
            except sqlite3.OperationalError:
                pass
            try:
                conn.execute("ALTER TABLE spark_messages ADD COLUMN tool_call_id TEXT")
            except sqlite3.OperationalError:
                pass
            try:
                conn.execute("ALTER TABLE spark_messages ADD COLUMN name TEXT")
            except sqlite3.OperationalError:
                pass

            # Upsert chat
            conn.execute(
                """
                INSERT INTO spark_chats (id, tenant_id, user_ref, title, model, updated_at)
                VALUES (?, '00000000-0000-0000-0000-000000000001', ?, COALESCE(?, '新規チャット'), COALESCE(?, 'spark-pro'), ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = CASE WHEN ? IS NOT NULL THEN ? ELSE spark_chats.title END,
                    model = CASE WHEN ? IS NOT NULL THEN ? ELSE spark_chats.model END,
                    updated_at = excluded.updated_at
                """,
                (cid, uid, title, model, now_iso, title, title, model, model),
            )
            # Insert message
            conn.execute(
                """
                INSERT INTO spark_messages (tenant_id, user_ref, chat_id, role, content, tool_calls, tool_call_id, name, created_at)
                VALUES ('00000000-0000-0000-0000-000000000001', ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (uid, cid, role, content_str, tool_calls_str, tool_call_id, name, now_iso),
            )

    def delete_chat(self, uid: str, chat_id: str) -> None:
        self.initialize()
        cid = str(chat_id)
        with self._get_conn() as conn:
            conn.execute("DELETE FROM spark_messages WHERE user_ref = ? AND chat_id = ?", (uid, cid))
            conn.execute("DELETE FROM spark_chats WHERE user_ref = ? AND id = ?", (uid, cid))

    # ----------------------------------------------------------------------- #
    # Voice Memory & Skills
    # ----------------------------------------------------------------------- #
    def get_user_current_minutes(self, uid: str) -> str | None:
        self.initialize()
        with self._get_conn() as conn:
            row = conn.execute(
                """
                SELECT current_minutes
                FROM spark_voice_memory
                WHERE user_ref = ?
                """,
                (uid,),
            ).fetchone()
        return row["current_minutes"] if row and row["current_minutes"] else None

    def save_user_minutes_and_archive_old(
        self, uid: str, new_minutes: str, archive_title: str | None = None
    ) -> dict:
        self.initialize()
        now_iso = datetime.now().isoformat()
        with self._get_conn() as conn:
            row = conn.execute(
                """
                SELECT current_minutes, updated_at
                FROM spark_voice_memory
                WHERE user_ref = ?
                """,
                (uid,),
            ).fetchone()

            archived = False
            if row and row["current_minutes"] and row["current_minutes"].strip():
                old_minutes = row["current_minutes"].strip()
                old_time = row["updated_at"]
                title = archive_title or f"会話議事録・記憶 ({old_time[:16] if old_time else '過去の会話'})"
                skill_id = str(uuid.uuid4())

                conn.execute(
                    """
                    INSERT INTO spark_skills (id, tenant_id, user_ref, title, content, category, created_at)
                    VALUES (?, '00000000-0000-0000-0000-000000000001', ?, ?, ?, 'conversation_minutes', ?)
                    """,
                    (skill_id, uid, title, old_minutes, now_iso),
                )
                archived = True

            conn.execute(
                """
                INSERT INTO spark_voice_memory (tenant_id, user_ref, current_minutes, updated_at)
                VALUES ('00000000-0000-0000-0000-000000000001', ?, ?, ?)
                ON CONFLICT(tenant_id, user_ref) DO UPDATE SET
                    current_minutes = excluded.current_minutes,
                    updated_at = excluded.updated_at
                """,
                (uid, new_minutes, now_iso),
            )
        return {"status": "ok", "archived_previous": archived, "minutes": new_minutes}

    def search_user_skills(self, uid: str, query: str = "", limit: int = 5) -> list[dict]:
        self.initialize()
        with self._get_conn() as conn:
            if query and query.strip():
                like_term = f"%{query.strip()}%"
                rows = conn.execute(
                    """
                    SELECT id, title, content, category, created_at
                    FROM spark_skills
                    WHERE user_ref = ?
                      AND (title LIKE ? OR content LIKE ? OR category LIKE ?)
                    ORDER BY created_at DESC
                    LIMIT ?
                    """,
                    (uid, like_term, like_term, like_term, max(1, min(limit, 20))),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT id, title, content, category, created_at
                    FROM spark_skills
                    WHERE user_ref = ?
                    ORDER BY created_at DESC
                    LIMIT ?
                    """,
                    (uid, max(1, min(limit, 20))),
                ).fetchall()

        return [
            {
                "id": r["id"],
                "title": r["title"],
                "content": r["content"],
                "category": r["category"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]

    # ----------------------------------------------------------------------- #
    # Digital Business Cards
    # ----------------------------------------------------------------------- #
    def get_digital_business_cards(self, uid: str, query: str | None = None) -> list[dict]:
        self.initialize()
        with self._get_conn() as conn:
            if query and query.strip():
                like_term = f"%{query.strip()}%"
                rows = conn.execute(
                    """
                    SELECT id, company_name, person_name, department, position, email, phone,
                           address, website, profile_summary, exchange_date, exchange_place,
                           notes, tags, created_at, updated_at
                    FROM spark_digital_business_cards
                    WHERE user_ref = ?
                      AND (company_name LIKE ? OR person_name LIKE ? OR department LIKE ? OR position LIKE ? OR profile_summary LIKE ? OR notes LIKE ?)
                    ORDER BY updated_at DESC
                    """,
                    (uid, like_term, like_term, like_term, like_term, like_term, like_term),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT id, company_name, person_name, department, position, email, phone,
                           address, website, profile_summary, exchange_date, exchange_place,
                           notes, tags, created_at, updated_at
                    FROM spark_digital_business_cards
                    WHERE user_ref = ?
                    ORDER BY updated_at DESC
                    """,
                    (uid,),
                ).fetchall()

        result = []
        for r in rows:
            tags_val = r["tags"]
            try:
                tags = json.loads(tags_val) if tags_val else []
            except Exception:
                tags = []
            result.append({
                "id": r["id"],
                "company_name": r["company_name"],
                "person_name": r["person_name"],
                "department": r["department"],
                "position": r["position"],
                "email": r["email"],
                "phone": r["phone"],
                "address": r["address"],
                "website": r["website"],
                "profile_summary": r["profile_summary"],
                "exchange_date": r["exchange_date"],
                "exchange_place": r["exchange_place"],
                "notes": r["notes"],
                "tags": tags,
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            })
        return result

    def save_digital_business_card(self, uid: str, card_data: dict) -> dict:
        self.initialize()
        card_id = card_data.get("id") or str(uuid.uuid4())
        tags_str = json.dumps(card_data.get("tags") or [], ensure_ascii=False)
        now_iso = datetime.now().isoformat()
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO spark_digital_business_cards (
                    id, tenant_id, user_ref, company_name, person_name, department, position,
                    email, phone, address, website, profile_summary, exchange_date, exchange_place,
                    notes, tags, created_at, updated_at
                )
                VALUES (?, '00000000-0000-0000-0000-000000000001', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    company_name = excluded.company_name,
                    person_name = excluded.person_name,
                    department = excluded.department,
                    position = excluded.position,
                    email = excluded.email,
                    phone = excluded.phone,
                    address = excluded.address,
                    website = excluded.website,
                    profile_summary = excluded.profile_summary,
                    exchange_date = excluded.exchange_date,
                    exchange_place = excluded.exchange_place,
                    notes = excluded.notes,
                    tags = excluded.tags,
                    updated_at = excluded.updated_at
                """,
                (
                    card_id,
                    uid,
                    card_data.get("company_name", ""),
                    card_data.get("person_name", ""),
                    card_data.get("department"),
                    card_data.get("position"),
                    card_data.get("email"),
                    card_data.get("phone"),
                    card_data.get("address"),
                    card_data.get("website"),
                    card_data.get("profile_summary"),
                    card_data.get("exchange_date"),
                    card_data.get("exchange_place"),
                    card_data.get("notes"),
                    tags_str,
                    now_iso,
                    now_iso,
                ),
            )
        return {"id": card_id, "status": "saved"}

    def delete_digital_business_card(self, uid: str, card_id: str) -> bool:
        self.initialize()
        with self._get_conn() as conn:
            res = conn.execute(
                "DELETE FROM spark_digital_business_cards WHERE user_ref = ? AND id = ?",
                (uid, str(card_id)),
            )
        return res.rowcount > 0

    # ----------------------------------------------------------------------- #
    # External IMAP / SMTP Email Accounts
    # ----------------------------------------------------------------------- #
    def get_imap_accounts(self, uid: str) -> list[dict]:
        self.initialize()
        with self._get_conn() as conn:
            rows = conn.execute(
                """
                SELECT id, email_address, account_name, imap_host, imap_port, imap_ssl, imap_username, imap_password,
                       smtp_host, smtp_port, smtp_ssl, smtp_username, smtp_password, is_active, created_at, updated_at
                FROM spark_imap_accounts
                WHERE user_ref = ?
                ORDER BY created_at ASC
                """,
                (uid,),
            ).fetchall()

        return [
            {
                "id": r["id"],
                "email_address": r["email_address"],
                "account_name": r["account_name"] or r["email_address"],
                "imap_host": r["imap_host"],
                "imap_port": r["imap_port"],
                "imap_ssl": bool(r["imap_ssl"]),
                "imap_username": r["imap_username"],
                "imap_password": r["imap_password"],
                "smtp_host": r["smtp_host"],
                "smtp_port": r["smtp_port"],
                "smtp_ssl": bool(r["smtp_ssl"]),
                "smtp_username": r["smtp_username"],
                "smtp_password": r["smtp_password"],
                "is_active": bool(r["is_active"]),
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            }
            for r in rows
        ]

    def get_imap_account_by_id(self, uid: str, account_id: str) -> dict | None:
        self.initialize()
        with self._get_conn() as conn:
            r = conn.execute(
                """
                SELECT id, email_address, account_name, imap_host, imap_port, imap_ssl, imap_username, imap_password,
                       smtp_host, smtp_port, smtp_ssl, smtp_username, smtp_password, is_active, created_at, updated_at
                FROM spark_imap_accounts
                WHERE user_ref = ? AND id = ?
                """,
                (uid, str(account_id)),
            ).fetchone()

        if not r:
            return None

        return {
            "id": r["id"],
            "email_address": r["email_address"],
            "account_name": r["account_name"] or r["email_address"],
            "imap_host": r["imap_host"],
            "imap_port": r["imap_port"],
            "imap_ssl": bool(r["imap_ssl"]),
            "imap_username": r["imap_username"],
            "imap_password": r["imap_password"],
            "smtp_host": r["smtp_host"],
            "smtp_port": r["smtp_port"],
            "smtp_ssl": bool(r["smtp_ssl"]),
            "smtp_username": r["smtp_username"],
            "smtp_password": r["smtp_password"],
            "is_active": bool(r["is_active"]),
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
        }

    def save_imap_account(self, uid: str, account_data: dict) -> dict:
        self.initialize()
        account_id = account_data.get("id") or str(uuid.uuid4())
        now_iso = datetime.now().isoformat()
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO spark_imap_accounts (
                    id, tenant_id, user_ref, email_address, account_name,
                    imap_host, imap_port, imap_ssl, imap_username, imap_password,
                    smtp_host, smtp_port, smtp_ssl, smtp_username, smtp_password,
                    is_active, created_at, updated_at
                )
                VALUES (?, '00000000-0000-0000-0000-000000000001', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    email_address = excluded.email_address,
                    account_name = excluded.account_name,
                    imap_host = excluded.imap_host,
                    imap_port = excluded.imap_port,
                    imap_ssl = excluded.imap_ssl,
                    imap_username = excluded.imap_username,
                    imap_password = excluded.imap_password,
                    smtp_host = excluded.smtp_host,
                    smtp_port = excluded.smtp_port,
                    smtp_ssl = excluded.smtp_ssl,
                    smtp_username = excluded.smtp_username,
                    smtp_password = excluded.smtp_password,
                    is_active = excluded.is_active,
                    updated_at = excluded.updated_at
                """,
                (
                    account_id,
                    uid,
                    account_data.get("email_address", ""),
                    account_data.get("account_name"),
                    account_data.get("imap_host", ""),
                    account_data.get("imap_port", 993),
                    1 if account_data.get("imap_ssl", True) else 0,
                    account_data.get("imap_username", ""),
                    account_data.get("imap_password", ""),
                    account_data.get("smtp_host", ""),
                    account_data.get("smtp_port", 465),
                    1 if account_data.get("smtp_ssl", True) else 0,
                    account_data.get("smtp_username", ""),
                    account_data.get("smtp_password", ""),
                    1 if account_data.get("is_active", True) else 0,
                    now_iso,
                    now_iso,
                ),
            )
        return {"id": account_id, "status": "saved"}

    def delete_imap_account(self, uid: str, account_id: str) -> bool:
        self.initialize()
        with self._get_conn() as conn:
            res = conn.execute(
                "DELETE FROM spark_imap_accounts WHERE user_ref = ? AND id = ?",
                (uid, str(account_id)),
            )
        return res.rowcount > 0

    # ----------------------------------------------------------------------- #
    # Google OAuth Tokens
    # ----------------------------------------------------------------------- #
    def save_google_tokens(self, uid: str, tokens: dict) -> None:
        self.initialize()
        now = int(time.time())
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO spark_google_tokens (
                    tenant_id, user_ref, access_token, refresh_token, token_expiry, scope, updated_at
                )
                VALUES ('00000000-0000-0000-0000-000000000001', ?, ?, ?, ?, ?, ?)
                ON CONFLICT(tenant_id, user_ref) DO UPDATE SET
                    access_token = excluded.access_token,
                    refresh_token = COALESCE(excluded.refresh_token, spark_google_tokens.refresh_token),
                    token_expiry = excluded.token_expiry,
                    scope = COALESCE(excluded.scope, spark_google_tokens.scope),
                    updated_at = excluded.updated_at
                """,
                (
                    uid,
                    tokens.get("access_token"),
                    tokens.get("refresh_token"),
                    tokens.get("token_expiry"),
                    tokens.get("scope"),
                    now,
                ),
            )

    def get_google_tokens(self, uid: str) -> dict | None:
        self.initialize()
        with self._get_conn() as conn:
            row = conn.execute(
                """
                SELECT access_token, refresh_token, token_expiry, scope
                FROM spark_google_tokens
                WHERE user_ref = ?
                """,
                (uid,),
            ).fetchone()
        if not row or not row["access_token"]:
            return None
        return {
            "access_token": row["access_token"],
            "refresh_token": row["refresh_token"],
            "token_expiry": row["token_expiry"],
            "scope": row["scope"],
        }

    def delete_google_tokens(self, uid: str) -> None:
        self.initialize()
        with self._get_conn() as conn:
            conn.execute(
                "DELETE FROM spark_google_tokens WHERE user_ref = ?",
                (uid,),
            )
