"""PostgreSQL Storage Provider.

Implements BaseStorageProvider for Neon PostgreSQL (Cloud Storage).
"""
from __future__ import annotations

import time
import typing as t
import uuid
from datetime import datetime
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from config.const import DATABASE_URL, DEFAULT_TENANT_ID
from .base import BaseStorageProvider


def _json_or_none(value: t.Any):
    return Jsonb(value) if value is not None else None


def _as_uuid(value: t.Any) -> uuid.UUID:
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return uuid.uuid5(uuid.NAMESPACE_DNS, str(value))


class PostgresStorageProvider(BaseStorageProvider):
    """PostgreSQL (Neon) Cloud Storage Provider."""

    def __init__(self, db_url: str = DATABASE_URL, tenant_id: str = DEFAULT_TENANT_ID):
        self.db_url = db_url
        self.tenant_uuid = uuid.UUID(tenant_id)
        self._pool: ConnectionPool | None = None
        self._initialized = False

    @property
    def provider_type(self) -> str:
        return "cloud"

    def _get_pool(self) -> ConnectionPool:
        if self._pool is None:
            if not self.db_url:
                raise RuntimeError("DATABASE_URL is not set for PostgresStorageProvider.")
            self._pool = ConnectionPool(
                conninfo=self.db_url,
                min_size=1,
                max_size=10,
                check=ConnectionPool.check_connection,
                max_idle=120,
                kwargs={"prepare_threshold": None},
                open=True,
            )
        return self._pool

    def initialize(self) -> None:
        if self._initialized:
            return
        with self._get_pool().connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS spark_digital_business_cards (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    tenant_id UUID NOT NULL,
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
                    exchange_date DATE,
                    exchange_place TEXT,
                    notes TEXT,
                    tags TEXT[] DEFAULT '{}',
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_spark_cards_user 
                ON spark_digital_business_cards (tenant_id, user_ref);

                CREATE TABLE IF NOT EXISTS spark_skills (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    tenant_id UUID NOT NULL,
                    user_ref TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'general',
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_spark_skills_user
                ON spark_skills (tenant_id, user_ref);

                CREATE TABLE IF NOT EXISTS spark_voice_memory (
                    tenant_id UUID NOT NULL,
                    user_ref TEXT NOT NULL,
                    current_minutes TEXT NOT NULL,
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    PRIMARY KEY (tenant_id, user_ref)
                );

                CREATE TABLE IF NOT EXISTS spark_imap_accounts (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    tenant_id UUID NOT NULL,
                    user_ref TEXT NOT NULL,
                    email_address TEXT NOT NULL,
                    account_name TEXT,
                    imap_host TEXT NOT NULL,
                    imap_port INT NOT NULL DEFAULT 993,
                    imap_ssl BOOLEAN NOT NULL DEFAULT TRUE,
                    imap_username TEXT NOT NULL,
                    imap_password TEXT NOT NULL,
                    smtp_host TEXT NOT NULL,
                    smtp_port INT NOT NULL DEFAULT 465,
                    smtp_ssl BOOLEAN NOT NULL DEFAULT TRUE,
                    smtp_username TEXT NOT NULL,
                    smtp_password TEXT NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_spark_imap_user
                ON spark_imap_accounts (tenant_id, user_ref);
                """
            )
        self._initialized = True

    # ----------------------------------------------------------------------- #
    # Chats & Messages
    # ----------------------------------------------------------------------- #
    def get_chats(self, uid: str) -> list[dict]:
        self.initialize()
        with self._get_pool().connection() as conn:
            rows = conn.execute(
                """
                SELECT id, title, model, updated_at
                FROM spark_chats
                WHERE tenant_id = %s AND user_ref = %s
                ORDER BY updated_at DESC
                """,
                (self.tenant_uuid, uid),
            ).fetchall()
        return [
            {
                "id": str(r[0]),
                "title": r[1] or "新規チャット",
                "model": r[2] or "spark-pro",
                "updatedAt": r[3].isoformat() if r[3] else None,
            }
            for r in rows
        ]

    def get_messages(self, uid: str, chat_id: str) -> list[dict]:
        self.initialize()
        cid = _as_uuid(chat_id)
        with self._get_pool().connection() as conn:
            rows = conn.execute(
                """
                SELECT role, content, created_at
                FROM spark_messages
                WHERE tenant_id = %s AND user_ref = %s AND chat_id = %s
                ORDER BY created_at ASC
                """,
                (self.tenant_uuid, uid, cid),
            ).fetchall()
        return [
            {
                "role": r[0],
                "content": r[1],
                "createdAt": r[2].isoformat() if r[2] else None,
            }
            for r in rows
        ]

    def save_message(
        self,
        uid: str,
        chat_id: str,
        role: str,
        content: t.Any,
        title: str | None = None,
        model: str | None = None,
    ) -> None:
        self.initialize()
        cid = _as_uuid(chat_id)
        with self._get_pool().connection() as conn:
            conn.execute(
                """
                INSERT INTO spark_chats (id, tenant_id, user_ref, title, model, updated_at)
                VALUES (%s, %s, %s, COALESCE(%s, '新規チャット'), COALESCE(%s, 'spark-pro'), NOW())
                ON CONFLICT (id)
                DO UPDATE SET
                    title = COALESCE(EXCLUDED.title, spark_chats.title),
                    model = COALESCE(EXCLUDED.model, spark_chats.model),
                    updated_at = NOW()
                """,
                (cid, self.tenant_uuid, uid, title, model),
            )
            conn.execute(
                """
                INSERT INTO spark_messages (tenant_id, user_ref, chat_id, role, content, created_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
                """,
                (self.tenant_uuid, uid, cid, role, _json_or_none(content)),
            )

    def delete_chat(self, uid: str, chat_id: str) -> None:
        self.initialize()
        cid = _as_uuid(chat_id)
        with self._get_pool().connection() as conn:
            conn.execute(
                """
                DELETE FROM spark_messages
                WHERE tenant_id = %s AND user_ref = %s AND chat_id = %s
                """,
                (self.tenant_uuid, uid, cid),
            )
            conn.execute(
                """
                DELETE FROM spark_chats
                WHERE tenant_id = %s AND user_ref = %s AND id = %s
                """,
                (self.tenant_uuid, uid, cid),
            )

    # ----------------------------------------------------------------------- #
    # Voice Memory & Skills
    # ----------------------------------------------------------------------- #
    def get_user_current_minutes(self, uid: str) -> str | None:
        self.initialize()
        with self._get_pool().connection() as conn:
            row = conn.execute(
                """
                SELECT current_minutes
                FROM spark_voice_memory
                WHERE tenant_id = %s AND user_ref = %s
                """,
                (self.tenant_uuid, uid),
            ).fetchone()
        return row[0] if row and row[0] else None

    def save_user_minutes_and_archive_old(
        self, uid: str, new_minutes: str, archive_title: str | None = None
    ) -> dict:
        self.initialize()
        with self._get_pool().connection() as conn:
            row = conn.execute(
                """
                SELECT current_minutes, updated_at
                FROM spark_voice_memory
                WHERE tenant_id = %s AND user_ref = %s
                """,
                (self.tenant_uuid, uid),
            ).fetchone()

            archived = False
            if row and row[0] and row[0].strip():
                old_minutes = row[0].strip()
                old_time = row[1]
                time_str = old_time.strftime("%Y年%m月%d日 %H:%M") if old_time else "過去の会話"
                title = archive_title or f"会話議事録・記憶 ({time_str})"

                conn.execute(
                    """
                    INSERT INTO spark_skills (tenant_id, user_ref, title, content, category, created_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    """,
                    (self.tenant_uuid, uid, title, old_minutes, "conversation_minutes"),
                )
                archived = True

            conn.execute(
                """
                INSERT INTO spark_voice_memory (tenant_id, user_ref, current_minutes, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (tenant_id, user_ref)
                DO UPDATE SET
                    current_minutes = EXCLUDED.current_minutes,
                    updated_at = NOW()
                """,
                (self.tenant_uuid, uid, new_minutes),
            )
        return {"status": "ok", "archived_previous": archived, "minutes": new_minutes}

    def search_user_skills(self, uid: str, query: str = "", limit: int = 5) -> list[dict]:
        self.initialize()
        with self._get_pool().connection() as conn:
            if query and query.strip():
                like_term = f"%{query.strip()}%"
                rows = conn.execute(
                    """
                    SELECT id, title, content, category, created_at
                    FROM spark_skills
                    WHERE tenant_id = %s AND user_ref = %s
                      AND (title ILIKE %s OR content ILIKE %s OR category ILIKE %s)
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (self.tenant_uuid, uid, like_term, like_term, like_term, max(1, min(limit, 20))),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT id, title, content, category, created_at
                    FROM spark_skills
                    WHERE tenant_id = %s AND user_ref = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (self.tenant_uuid, uid, max(1, min(limit, 20))),
                ).fetchall()

        return [
            {
                "id": str(r[0]),
                "title": r[1],
                "content": r[2],
                "category": r[3],
                "created_at": r[4].isoformat() if r[4] else None,
            }
            for r in rows
        ]

    # ----------------------------------------------------------------------- #
    # Digital Business Cards
    # ----------------------------------------------------------------------- #
    def get_digital_business_cards(self, uid: str, query: str | None = None) -> list[dict]:
        self.initialize()
        with self._get_pool().connection() as conn:
            if query and query.strip():
                like_term = f"%{query.strip()}%"
                rows = conn.execute(
                    """
                    SELECT id, company_name, person_name, department, position, email, phone, address, website, profile_summary, exchange_date, exchange_place, notes, tags, created_at, updated_at
                    FROM spark_digital_business_cards
                    WHERE tenant_id = %s AND user_ref = %s
                      AND (company_name ILIKE %s OR person_name ILIKE %s OR department ILIKE %s OR position ILIKE %s OR profile_summary ILIKE %s OR notes ILIKE %s)
                    ORDER BY updated_at DESC
                    """,
                    (self.tenant_uuid, uid, like_term, like_term, like_term, like_term, like_term, like_term),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT id, company_name, person_name, department, position, email, phone, address, website, profile_summary, exchange_date, exchange_place, notes, tags, created_at, updated_at
                    FROM spark_digital_business_cards
                    WHERE tenant_id = %s AND user_ref = %s
                    ORDER BY updated_at DESC
                    """,
                    (self.tenant_uuid, uid),
                ).fetchall()

        return [
            {
                "id": str(r[0]),
                "company_name": r[1],
                "person_name": r[2],
                "department": r[3],
                "position": r[4],
                "email": r[5],
                "phone": r[6],
                "address": r[7],
                "website": r[8],
                "profile_summary": r[9],
                "exchange_date": r[10].isoformat() if r[10] else None,
                "exchange_place": r[11],
                "notes": r[12],
                "tags": r[13] or [],
                "created_at": r[14].isoformat() if r[14] else None,
                "updated_at": r[15].isoformat() if r[15] else None,
            }
            for r in rows
        ]

    def save_digital_business_card(self, uid: str, card_data: dict) -> dict:
        self.initialize()
        card_id_str = card_data.get("id")
        card_id = _as_uuid(card_id_str) if card_id_str else uuid.uuid4()
        with self._get_pool().connection() as conn:
            conn.execute(
                """
                INSERT INTO spark_digital_business_cards (
                    id, tenant_id, user_ref, company_name, person_name, department, position,
                    email, phone, address, website, profile_summary, exchange_date, exchange_place,
                    notes, tags, created_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                ON CONFLICT (id)
                DO UPDATE SET
                    company_name = EXCLUDED.company_name,
                    person_name = EXCLUDED.person_name,
                    department = EXCLUDED.department,
                    position = EXCLUDED.position,
                    email = EXCLUDED.email,
                    phone = EXCLUDED.phone,
                    address = EXCLUDED.address,
                    website = EXCLUDED.website,
                    profile_summary = EXCLUDED.profile_summary,
                    exchange_date = EXCLUDED.exchange_date,
                    exchange_place = EXCLUDED.exchange_place,
                    notes = EXCLUDED.notes,
                    tags = EXCLUDED.tags,
                    updated_at = NOW()
                """,
                (
                    card_id,
                    self.tenant_uuid,
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
                    card_data.get("tags") or [],
                ),
            )
        return {"id": str(card_id), "status": "saved"}

    def delete_digital_business_card(self, uid: str, card_id: str) -> bool:
        self.initialize()
        cid = _as_uuid(card_id)
        with self._get_pool().connection() as conn:
            res = conn.execute(
                """
                DELETE FROM spark_digital_business_cards
                WHERE tenant_id = %s AND user_ref = %s AND id = %s
                """,
                (self.tenant_uuid, uid, cid),
            )
        return res.rowcount > 0

    # ----------------------------------------------------------------------- #
    # External IMAP / SMTP Email Accounts
    # ----------------------------------------------------------------------- #
    def get_imap_accounts(self, uid: str) -> list[dict]:
        self.initialize()
        with self._get_pool().connection() as conn:
            rows = conn.execute(
                """
                SELECT id, email_address, account_name, imap_host, imap_port, imap_ssl, imap_username, imap_password,
                       smtp_host, smtp_port, smtp_ssl, smtp_username, smtp_password, is_active, created_at, updated_at
                FROM spark_imap_accounts
                WHERE tenant_id = %s AND user_ref = %s
                ORDER BY created_at ASC
                """,
                (self.tenant_uuid, uid),
            ).fetchall()

        return [
            {
                "id": str(r[0]),
                "email_address": r[1],
                "account_name": r[2] or r[1],
                "imap_host": r[3],
                "imap_port": r[4],
                "imap_ssl": bool(r[5]),
                "imap_username": r[6],
                "imap_password": r[7],
                "smtp_host": r[8],
                "smtp_port": r[9],
                "smtp_ssl": bool(r[10]),
                "smtp_username": r[11],
                "smtp_password": r[12],
                "is_active": bool(r[13]),
                "created_at": r[14].isoformat() if r[14] else None,
                "updated_at": r[15].isoformat() if r[15] else None,
            }
            for r in rows
        ]

    def get_imap_account_by_id(self, uid: str, account_id: str) -> dict | None:
        self.initialize()
        aid = _as_uuid(account_id)
        with self._get_pool().connection() as conn:
            r = conn.execute(
                """
                SELECT id, email_address, account_name, imap_host, imap_port, imap_ssl, imap_username, imap_password,
                       smtp_host, smtp_port, smtp_ssl, smtp_username, smtp_password, is_active, created_at, updated_at
                FROM spark_imap_accounts
                WHERE tenant_id = %s AND user_ref = %s AND id = %s
                """,
                (self.tenant_uuid, uid, aid),
            ).fetchone()

        if not r:
            return None

        return {
            "id": str(r[0]),
            "email_address": r[1],
            "account_name": r[2] or r[1],
            "imap_host": r[3],
            "imap_port": r[4],
            "imap_ssl": bool(r[5]),
            "imap_username": r[6],
            "imap_password": r[7],
            "smtp_host": r[8],
            "smtp_port": r[9],
            "smtp_ssl": bool(r[10]),
            "smtp_username": r[11],
            "smtp_password": r[12],
            "is_active": bool(r[13]),
            "created_at": r[14].isoformat() if r[14] else None,
            "updated_at": r[15].isoformat() if r[15] else None,
        }

    def save_imap_account(self, uid: str, account_data: dict) -> dict:
        self.initialize()
        account_id_str = account_data.get("id")
        account_id = _as_uuid(account_id_str) if account_id_str else uuid.uuid4()
        with self._get_pool().connection() as conn:
            conn.execute(
                """
                INSERT INTO spark_imap_accounts (
                    id, tenant_id, user_ref, email_address, account_name,
                    imap_host, imap_port, imap_ssl, imap_username, imap_password,
                    smtp_host, smtp_port, smtp_ssl, smtp_username, smtp_password,
                    is_active, created_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                ON CONFLICT (id)
                DO UPDATE SET
                    email_address = EXCLUDED.email_address,
                    account_name = EXCLUDED.account_name,
                    imap_host = EXCLUDED.imap_host,
                    imap_port = EXCLUDED.imap_port,
                    imap_ssl = EXCLUDED.imap_ssl,
                    imap_username = EXCLUDED.imap_username,
                    imap_password = EXCLUDED.imap_password,
                    smtp_host = EXCLUDED.smtp_host,
                    smtp_port = EXCLUDED.smtp_port,
                    smtp_ssl = EXCLUDED.smtp_ssl,
                    smtp_username = EXCLUDED.smtp_username,
                    smtp_password = EXCLUDED.smtp_password,
                    is_active = EXCLUDED.is_active,
                    updated_at = NOW()
                """,
                (
                    account_id,
                    self.tenant_uuid,
                    uid,
                    account_data.get("email_address", ""),
                    account_data.get("account_name"),
                    account_data.get("imap_host", ""),
                    account_data.get("imap_port", 993),
                    account_data.get("imap_ssl", True),
                    account_data.get("imap_username", ""),
                    account_data.get("imap_password", ""),
                    account_data.get("smtp_host", ""),
                    account_data.get("smtp_port", 465),
                    account_data.get("smtp_ssl", True),
                    account_data.get("smtp_username", ""),
                    account_data.get("smtp_password", ""),
                    account_data.get("is_active", True),
                ),
            )
        return {"id": str(account_id), "status": "saved"}

    def delete_imap_account(self, uid: str, account_id: str) -> bool:
        self.initialize()
        aid = _as_uuid(account_id)
        with self._get_pool().connection() as conn:
            res = conn.execute(
                """
                DELETE FROM spark_imap_accounts
                WHERE tenant_id = %s AND user_ref = %s AND id = %s
                """,
                (self.tenant_uuid, uid, aid),
            )
        return res.rowcount > 0

    # ----------------------------------------------------------------------- #
    # Google OAuth Tokens
    # ----------------------------------------------------------------------- #
    def save_google_tokens(self, uid: str, tokens: dict) -> None:
        self.initialize()
        now = int(time.time())
        with self._get_pool().connection() as conn:
            conn.execute(
                """
                INSERT INTO spark_google_tokens (
                    tenant_id, user_ref, access_token, refresh_token, token_expiry, scope, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (tenant_id, user_ref)
                DO UPDATE SET
                    access_token = EXCLUDED.access_token,
                    refresh_token = COALESCE(EXCLUDED.refresh_token, spark_google_tokens.refresh_token),
                    token_expiry = EXCLUDED.token_expiry,
                    scope = COALESCE(EXCLUDED.scope, spark_google_tokens.scope),
                    updated_at = EXCLUDED.updated_at
                """,
                (
                    self.tenant_uuid,
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
        with self._get_pool().connection() as conn:
            row = conn.execute(
                """
                SELECT access_token, refresh_token, token_expiry, scope
                FROM spark_google_tokens
                WHERE tenant_id = %s AND user_ref = %s
                """,
                (self.tenant_uuid, uid),
            ).fetchone()
        if not row or not row[0]:
            return None
        return {
            "access_token": row[0],
            "refresh_token": row[1],
            "token_expiry": row[2],
            "scope": row[3],
        }

    def delete_google_tokens(self, uid: str) -> None:
        self.initialize()
        with self._get_pool().connection() as conn:
            conn.execute(
                """
                DELETE FROM spark_google_tokens
                WHERE tenant_id = %s AND user_ref = %s
                """,
                (self.tenant_uuid, uid),
            )
