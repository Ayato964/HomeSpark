"""PostgreSQL persistence for Sales Spark (chat history + Google tokens).

Replaces the former Firestore layer. Data lives in the SAME Postgres database
as poc_customer_meeting_agent (Neon), in the spark_* tables added by
db/schema_patch_sales_spark.sql. Every row is scoped by (tenant_id, user_ref)
so users are isolated.

Sales Spark is synchronous (sync FastAPI handlers + a background agent thread),
so this uses psycopg3's SYNC connection pool — not the async asyncpg the poc
API uses. Both talk to the same database; the driver choice is independent.

Public functions intentionally keep the exact signatures the old firebase_db
module exposed, so the rest of the backend is unchanged:
  get_chats, get_messages, save_message, delete_chat,
  save_google_tokens, get_google_tokens, delete_google_tokens
"""
from __future__ import annotations

import time
import typing as t
import uuid

from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from config.const import DATABASE_URL, DEFAULT_TENANT_ID

_TENANT = uuid.UUID(DEFAULT_TENANT_ID)
_pool: ConnectionPool | None = None


def _get_pool() -> ConnectionPool:
    """Lazily create the connection pool on first use."""
    global _pool
    if _pool is None:
        if not DATABASE_URL:
            raise RuntimeError(
                "DATABASE_URL is not set. Point it at the Neon DEV branch DSN "
                "(see SETUP_POSTGRES_MIGRATION.md)."
            )
        _pool = ConnectionPool(
            conninfo=DATABASE_URL,
            min_size=1,
            max_size=10,
            # Neon drops idle connections (and serverless compute may suspend),
            # leaving the pool holding dead sockets that fail mid-query with
            # "SSL connection has been closed unexpectedly". `check` validates
            # each connection on checkout and transparently replaces stale ones;
            # `max_idle` proactively retires connections before Neon does.
            check=ConnectionPool.check_connection,
            max_idle=120,
            # Neon's pooled endpoint runs PgBouncer in transaction mode, which
            # does not support server-side prepared statements; disable them.
            kwargs={"prepare_threshold": None},
            open=True,
        )
    return _pool


def _json_or_none(value: t.Any):
    """Wrap a value for a JSONB column, or pass NULL through. A bare string or
    list is valid JSON, so chat content (string OR multimodal array) round-trips
    unchanged."""
    return Jsonb(value) if value is not None else None


def _as_uuid(value: t.Any) -> uuid.UUID:
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return uuid.uuid5(uuid.NAMESPACE_DNS, str(value))


# --------------------------------------------------------------------------- #
# Chat sessions
# --------------------------------------------------------------------------- #
def get_chats(uid: str) -> list[dict]:
    """All chat sessions for the user, most-recently-updated first."""
    with _get_pool().connection() as conn:
        rows = conn.execute(
            """
            SELECT chat_id, title, updated_at
            FROM spark_chat_sessions
            WHERE tenant_id = %s AND user_ref = %s
            ORDER BY updated_at DESC
            """,
            (_TENANT, uid),
        ).fetchall()
    return [
        {
            "chat_id": str(chat_id),
            "title": title or "New Chat",
            "updated_at": updated_at.isoformat() if updated_at else None,
        }
        for (chat_id, title, updated_at) in rows
    ]


def get_messages(uid: str, chat_id: str) -> list[dict]:
    """All messages in a chat, in send order. Scoped by user_ref so a user can
    only read their own chats even if they guess a chat_id."""
    with _get_pool().connection() as conn:
        rows = conn.execute(
            """
            SELECT role, content, tool_calls, tool_call_id, name
            FROM spark_chat_messages
            WHERE tenant_id = %s AND chat_id = %s AND user_ref = %s
            ORDER BY seq ASC
            """,
            (_TENANT, _as_uuid(chat_id), uid),
        ).fetchall()
    return [
        {
            "role": role,
            "content": content,        # JSONB -> already parsed (str / list / None)
            "tool_calls": tool_calls,  # JSONB -> list / None
            "tool_call_id": tool_call_id,
            "name": name,
        }
        for (role, content, tool_calls, tool_call_id, name) in rows
    ]


def _derive_title(role: str, content: t.Any, title_fallback: str | None) -> str:
    if role == "user":
        if isinstance(content, str):
            return content[:50]
        if isinstance(content, list):
            text_parts = [
                part.get("text", "")
                for part in content
                if isinstance(part, dict) and part.get("type") == "text"
            ]
            if text_parts:
                return "".join(text_parts)[:50]
    if title_fallback:
        return title_fallback[:50]
    return "New Chat"


def save_message(
    uid: str,
    chat_id: str,
    role: str,
    content: t.Any,
    *,
    tool_calls: list[dict] | None = None,
    tool_call_id: str | None = None,
    name: str | None = None,
    title_fallback: str | None = None,
) -> None:
    """Insert a message and upsert its session metadata (one transaction)."""
    seq = time.time_ns()
    title = _derive_title(role, content, title_fallback)
    cid = _as_uuid(chat_id)

    with _get_pool().connection() as conn:  # commits at block exit
        # Scope by user_ref too: a user who guesses another user's chat_id must
        # not be able to touch that session. If the guess misses, `existing` is
        # None and the INSERT below collides on the chat_id PK, failing safely.
        existing = conn.execute(
            "SELECT title FROM spark_chat_sessions "
            "WHERE tenant_id = %s AND chat_id = %s AND user_ref = %s",
            (_TENANT, cid, uid),
        ).fetchone()

        if existing is None:
            conn.execute(
                """
                INSERT INTO spark_chat_sessions (chat_id, tenant_id, user_ref, title)
                VALUES (%s, %s, %s, %s)
                """,
                (cid, _TENANT, uid, title),
            )
        elif role == "user" and existing[0] == "New Chat":
            conn.execute(
                "UPDATE spark_chat_sessions SET title = %s, updated_at = now() "
                "WHERE tenant_id = %s AND chat_id = %s AND user_ref = %s",
                (title, _TENANT, cid, uid),
            )
        else:
            conn.execute(
                "UPDATE spark_chat_sessions SET updated_at = now() "
                "WHERE tenant_id = %s AND chat_id = %s AND user_ref = %s",
                (_TENANT, cid, uid),
            )

        conn.execute(
            """
            INSERT INTO spark_chat_messages
              (chat_id, tenant_id, user_ref, role, content, tool_calls,
               tool_call_id, name, seq)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                cid,
                _TENANT,
                uid,
                role,
                _json_or_none(content),
                _json_or_none(tool_calls),
                tool_call_id,
                name,
                seq,
            ),
        )


def delete_chat(uid: str, chat_id: str) -> None:
    """Delete a chat (messages cascade via FK). Scoped by user_ref."""
    with _get_pool().connection() as conn:
        conn.execute(
            "DELETE FROM spark_chat_sessions "
            "WHERE tenant_id = %s AND chat_id = %s AND user_ref = %s",
            (_TENANT, _as_uuid(chat_id), uid),
        )


# --------------------------------------------------------------------------- #
# Google OAuth tokens (per user)
# --------------------------------------------------------------------------- #
def save_google_tokens(uid: str, tokens: dict) -> None:
    """Upsert a user's Google tokens. A refresh_token is only issued by Google
    on first consent, so an empty one never clobbers a stored one."""
    with _get_pool().connection() as conn:
        conn.execute(
            """
            INSERT INTO spark_google_tokens
              (tenant_id, user_ref, refresh_token, access_token, token_uri,
               scopes, token_expiry, email, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s::timestamptz, %s, now())
            ON CONFLICT (tenant_id, user_ref) DO UPDATE SET
              refresh_token = COALESCE(EXCLUDED.refresh_token, spark_google_tokens.refresh_token),
              access_token  = EXCLUDED.access_token,
              token_uri     = COALESCE(EXCLUDED.token_uri, spark_google_tokens.token_uri),
              scopes        = COALESCE(EXCLUDED.scopes, spark_google_tokens.scopes),
              token_expiry  = EXCLUDED.token_expiry,
              email         = COALESCE(EXCLUDED.email, spark_google_tokens.email),
              updated_at    = now()
            """,
            (
                _TENANT,
                uid,
                tokens.get("refresh_token"),
                tokens.get("access_token"),
                tokens.get("token_uri"),
                _json_or_none(tokens.get("scopes")),
                tokens.get("token_expiry"),
                tokens.get("email"),
            ),
        )


def get_google_tokens(uid: str) -> dict | None:
    """Return stored Google tokens for a user, or None. token_expiry is returned
    as an ISO string to match what google_oauth.get_credentials expects."""
    with _get_pool().connection() as conn:
        row = conn.execute(
            """
            SELECT refresh_token, access_token, token_uri, scopes, token_expiry, email
            FROM spark_google_tokens
            WHERE tenant_id = %s AND user_ref = %s
            """,
            (_TENANT, uid),
        ).fetchone()
    if row is None:
        return None
    refresh_token, access_token, token_uri, scopes, token_expiry, email = row
    return {
        "refresh_token": refresh_token,
        "access_token": access_token,
        "token_uri": token_uri,
        "scopes": scopes,
        "token_expiry": token_expiry.isoformat() if token_expiry else None,
        "email": email,
    }


def delete_google_tokens(uid: str) -> None:
    with _get_pool().connection() as conn:
        conn.execute(
            "DELETE FROM spark_google_tokens WHERE tenant_id = %s AND user_ref = %s",
            (_TENANT, uid),
        )


# --------------------------------------------------------------------------- #
# Spark People & Calendar Event Analysis DB functions
# --------------------------------------------------------------------------- #
def init_spark_tables() -> None:
    """Ensure spark_people, spark_event_people, and spark_event_analysis tables exist."""
    with _get_pool().connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS spark_people (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                user_ref TEXT NOT NULL,
                name TEXT NOT NULL,
                company TEXT,
                role TEXT,
                email TEXT,
                phone TEXT,
                address TEXT,
                postal_code TEXT,
                hobbies TEXT,
                notes TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(tenant_id, user_ref, name)
            );
            ALTER TABLE spark_people ADD COLUMN IF NOT EXISTS email TEXT;
            ALTER TABLE spark_people ADD COLUMN IF NOT EXISTS phone TEXT;
            ALTER TABLE spark_people ADD COLUMN IF NOT EXISTS address TEXT;
            ALTER TABLE spark_people ADD COLUMN IF NOT EXISTS postal_code TEXT;
            ALTER TABLE spark_people ADD COLUMN IF NOT EXISTS hobbies TEXT;
            ALTER TABLE spark_people ADD COLUMN IF NOT EXISTS notes TEXT;

            CREATE TABLE IF NOT EXISTS spark_event_people (
                tenant_id UUID NOT NULL,
                user_ref TEXT NOT NULL,
                event_id TEXT NOT NULL,
                person_id UUID NOT NULL REFERENCES spark_people(id) ON DELETE CASCADE,
                PRIMARY KEY (tenant_id, user_ref, event_id, person_id)
            );
            CREATE TABLE IF NOT EXISTS spark_event_analysis (
                tenant_id UUID NOT NULL,
                user_ref TEXT NOT NULL,
                event_id TEXT NOT NULL,
                analyzed_at TIMESTAMPTZ DEFAULT NOW(),
                is_meeting BOOLEAN DEFAULT FALSE,
                minutes TEXT,
                PRIMARY KEY (tenant_id, user_ref, event_id)
            );
            ALTER TABLE spark_event_analysis ADD COLUMN IF NOT EXISTS is_meeting BOOLEAN DEFAULT FALSE;
            ALTER TABLE spark_event_analysis ADD COLUMN IF NOT EXISTS minutes TEXT;

            CREATE TABLE IF NOT EXISTS spark_notifications (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                user_ref TEXT NOT NULL,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                actions JSONB DEFAULT '[]'::jsonb,
                is_read BOOLEAN DEFAULT FALSE,
                mail_message_id TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            ALTER TABLE spark_notifications ADD COLUMN IF NOT EXISTS mail_message_id TEXT;

            CREATE TABLE IF NOT EXISTS spark_user_profiles (
                tenant_id UUID NOT NULL,
                user_ref TEXT NOT NULL,
                name TEXT NOT NULL,
                company TEXT DEFAULT '',
                role TEXT DEFAULT '',
                email TEXT DEFAULT '',
                phone TEXT DEFAULT '',
                address TEXT DEFAULT '',
                postal_code TEXT DEFAULT '',
                hobbies TEXT DEFAULT '',
                notes TEXT DEFAULT '',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (tenant_id, user_ref)
            );
        """)


def get_all_people(uid: str) -> list[dict]:
    """Fetch all stored people for the user, ordered by creation time descending."""
    init_spark_tables()
    with _get_pool().connection() as conn:
        rows = conn.execute(
            """
            SELECT id, name, company, role, email, phone, address, postal_code, hobbies, notes, created_at
            FROM spark_people
            WHERE tenant_id = %s AND user_ref = %s
            ORDER BY created_at DESC
            """,
            (_TENANT, uid),
        ).fetchall()

        return [
            {
                "id": str(r[0]),
                "name": r[1],
                "company": r[2] or "",
                "role": r[3] or "",
                "email": r[4] or "",
                "phone": r[5] or "",
                "address": r[6] or "",
                "postal_code": r[7] or "",
                "hobbies": r[8] or "",
                "notes": r[9] or "",
                "created_at": r[10].isoformat() if r[10] else ""
            }
            for r in rows
        ]


def create_full_person(uid: str, data: dict) -> dict:
    """Create or update a full person profile."""
    init_spark_tables()
    name = (data.get("name") or "").strip()
    if not name:
        raise ValueError("Name is required")

    person_id = uuid.uuid4()
    company = data.get("company") or None
    role = data.get("role") or None
    email = data.get("email") or None
    phone = data.get("phone") or None
    address = data.get("address") or None
    postal_code = data.get("postal_code") or None
    hobbies = data.get("hobbies") or None
    notes = data.get("notes") or None

    with _get_pool().connection() as conn:
        conn.execute(
            """
            INSERT INTO spark_people (id, tenant_id, user_ref, name, company, role, email, phone, address, postal_code, hobbies, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (tenant_id, user_ref, name) DO UPDATE SET
                company = EXCLUDED.company,
                role = EXCLUDED.role,
                email = EXCLUDED.email,
                phone = EXCLUDED.phone,
                address = EXCLUDED.address,
                postal_code = EXCLUDED.postal_code,
                hobbies = EXCLUDED.hobbies,
                notes = EXCLUDED.notes
            """,
            (person_id, _TENANT, uid, name, company, role, email, phone, address, postal_code, hobbies, notes),
        )

        row = conn.execute(
            """
            SELECT id, name, company, role, email, phone, address, postal_code, hobbies, notes
            FROM spark_people
            WHERE tenant_id = %s AND user_ref = %s AND name = %s
            """,
            (_TENANT, uid, name),
        ).fetchone()

        return {
            "id": str(row[0]),
            "name": row[1],
            "company": row[2] or "",
            "role": row[3] or "",
            "email": row[4] or "",
            "phone": row[5] or "",
            "address": row[6] or "",
            "postal_code": row[7] or "",
            "hobbies": row[8] or "",
            "notes": row[9] or "",
        }


def delete_person(uid: str, person_id: str) -> None:
    """Delete a person profile by person_id."""
    init_spark_tables()
    with _get_pool().connection() as conn:
        conn.execute(
            """
            DELETE FROM spark_people
            WHERE tenant_id = %s AND user_ref = %s AND id = %s
            """,
            (_TENANT, uid, _as_uuid(person_id)),
        )


def find_person_candidates(uid: str, name: str) -> list[dict]:
    """Find exact or partial matching people from spark_people for smart matching."""
    init_spark_tables()
    name_clean = name.strip()
    if not name_clean:
        return []

    with _get_pool().connection() as conn:
        # 1. Exact match
        exact_rows = conn.execute(
            """
            SELECT id, name, company, role, email, phone, address, postal_code, hobbies, notes
            FROM spark_people
            WHERE tenant_id = %s AND user_ref = %s AND name = %s
            """,
            (_TENANT, uid, name_clean),
        ).fetchall()

        if exact_rows:
            return [
                {
                    "id": str(r[0]),
                    "name": r[1],
                    "company": r[2] or "",
                    "role": r[3] or "",
                    "email": r[4] or "",
                    "phone": r[5] or "",
                    "address": r[6] or "",
                    "postal_code": r[7] or "",
                    "hobbies": r[8] or "",
                    "notes": r[9] or "",
                    "match_type": "exact"
                }
                for r in exact_rows
            ]

        # 2. Fuzzy / Partial match
        fuzzy_rows = conn.execute(
            """
            SELECT id, name, company, role, email, phone, address, postal_code, hobbies, notes
            FROM spark_people
            WHERE tenant_id = %s AND user_ref = %s AND (name ILIKE %s OR %s ILIKE ('%%' || name || '%%'))
            """,
            (_TENANT, uid, f"%{name_clean}%", name_clean),
        ).fetchall()

        return [
            {
                "id": str(r[0]),
                "name": r[1],
                "company": r[2] or "",
                "role": r[3] or "",
                "email": r[4] or "",
                "phone": r[5] or "",
                "address": r[6] or "",
                "postal_code": r[7] or "",
                "hobbies": r[8] or "",
                "notes": r[9] or "",
                "match_type": "fuzzy"
            }
            for r in fuzzy_rows
        ]


def get_or_create_person(uid: str, name: str, company: str = None, role: str = None) -> dict:
    """Find a person by name or insert a new person into spark_people."""
    init_spark_tables()
    name_clean = name.strip()
    if not name_clean:
        return None
    with _get_pool().connection() as conn:
        row = conn.execute(
            """
            SELECT id, name, company, role
            FROM spark_people
            WHERE tenant_id = %s AND user_ref = %s AND name = %s
            """,
            (_TENANT, uid, name_clean),
        ).fetchone()
        if row:
            p_id, p_name, p_company, p_role = row
            return {"id": str(p_id), "name": p_name, "company": p_company, "role": p_role}

        new_id = uuid.uuid4()
        conn.execute(
            """
            INSERT INTO spark_people (id, tenant_id, user_ref, name, company, role)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (tenant_id, user_ref, name) DO NOTHING
            """,
            (new_id, _TENANT, uid, name_clean, company, role),
        )
        return {"id": str(new_id), "name": name_clean, "company": company, "role": role}


def link_event_person(uid: str, event_id: str, person_id: str) -> None:
    """Link an event_id to a person_id."""
    init_spark_tables()
    with _get_pool().connection() as conn:
        conn.execute(
            """
            INSERT INTO spark_event_people (tenant_id, user_ref, event_id, person_id)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (_TENANT, uid, event_id, _as_uuid(person_id)),
        )


def mark_event_analyzed(uid: str, event_id: str, is_meeting: bool = False) -> None:
    """Mark calendar event as analyzed by AI with is_meeting flag."""
    init_spark_tables()
    with _get_pool().connection() as conn:
        conn.execute(
            """
            INSERT INTO spark_event_analysis (tenant_id, user_ref, event_id, is_meeting)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (tenant_id, user_ref, event_id) DO UPDATE SET
                is_meeting = EXCLUDED.is_meeting,
                analyzed_at = NOW()
            """,
            (_TENANT, uid, event_id, is_meeting),
        )


def save_event_minutes(uid: str, event_id: str, minutes: str) -> None:
    """Save generated minutes to event analysis."""
    init_spark_tables()
    with _get_pool().connection() as conn:
        conn.execute(
            """
            INSERT INTO spark_event_analysis (tenant_id, user_ref, event_id, minutes)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (tenant_id, user_ref, event_id) DO UPDATE SET
                minutes = EXCLUDED.minutes,
                analyzed_at = NOW()
            """,
            (_TENANT, uid, event_id, minutes),
        )


def get_person_by_id(uid: str, person_id: str) -> dict:
    """Get full person details by person_id."""
    init_spark_tables()
    with _get_pool().connection() as conn:
        row = conn.execute(
            """
            SELECT id, name, company, role, email, phone, address, postal_code, hobbies, notes, created_at
            FROM spark_people
            WHERE tenant_id = %s AND user_ref = %s AND id = %s
            """,
            (_TENANT, uid, _as_uuid(person_id)),
        ).fetchone()

        if not row:
            return None

        return {
            "id": str(row[0]),
            "name": row[1],
            "company": row[2] or "",
            "role": row[3] or "",
            "email": row[4] or "",
            "phone": row[5] or "",
            "address": row[6] or "",
            "postal_code": row[7] or "",
            "hobbies": row[8] or "",
            "notes": row[9] or "",
            "created_at": row[10].isoformat() if row[10] else None,
        }


def get_person_events(uid: str, person_id: str) -> list[str]:
    """Get linked calendar event IDs for a person."""
    init_spark_tables()
    with _get_pool().connection() as conn:
        rows = conn.execute(
            """
            SELECT ep.event_id
            FROM spark_event_people ep
            WHERE ep.tenant_id = %s AND ep.user_ref = %s AND ep.person_id = %s
            """,
            (_TENANT, uid, _as_uuid(person_id)),
        ).fetchall()
        return [r[0] for r in rows]


def get_event_people_and_analysis(uid: str, event_id: str) -> dict:
    """Get linked people and AI analysis status for a calendar event."""
    init_spark_tables()
    with _get_pool().connection() as conn:
        analysis_row = conn.execute(
            """
            SELECT analyzed_at, is_meeting, minutes FROM spark_event_analysis
            WHERE tenant_id = %s AND user_ref = %s AND event_id = %s
            """,
            (_TENANT, uid, event_id),
        ).fetchone()
        
        analyzed = False
        is_meeting = False
        minutes = None
        if analysis_row:
            analyzed = True
            is_meeting = bool(analysis_row[1])
            minutes = analysis_row[2]

        people_rows = conn.execute(
            """
            SELECT p.id, p.name, p.company, p.role, p.email, p.phone, p.address, p.postal_code, p.hobbies, p.notes, p.created_at
            FROM spark_people p
            JOIN spark_event_people ep ON p.id = ep.person_id
            WHERE ep.tenant_id = %s AND ep.user_ref = %s AND ep.event_id = %s
            ORDER BY p.name ASC
            """,
            (_TENANT, uid, event_id),
        ).fetchall()

        people = [
            {
                "id": str(r[0]),
                "name": r[1],
                "company": r[2] or "",
                "role": r[3] or "",
                "email": r[4] or "",
                "phone": r[5] or "",
                "address": r[6] or "",
                "postal_code": r[7] or "",
                "hobbies": r[8] or "",
                "notes": r[9] or "",
                "created_at": r[10].isoformat() if r[10] else None,
            }
            for r in people_rows
        ]

        return {"analyzed": analyzed, "is_meeting": is_meeting, "minutes": minutes, "people": people}


# --------------------------------------------------------------------------- #
# Spark Notifications
# --------------------------------------------------------------------------- #
def get_notifications(uid: str) -> list[dict]:
    """Fetch all notifications for the user, ordered by creation time descending."""
    init_spark_tables()
    with _get_pool().connection() as conn:
        rows = conn.execute(
            """
            SELECT id, category, title, content, actions, is_read, created_at, mail_message_id
            FROM spark_notifications
            WHERE tenant_id = %s AND user_ref = %s
            ORDER BY created_at DESC
            """,
            (_TENANT, uid),
        ).fetchall()
    return [
        {
            "id": str(r[0]),
            "category": r[1],
            "title": r[2],
            "content": r[3],
            "actions": r[4] or [],
            "is_read": r[5],
            "created_at": r[6].isoformat() if r[6] else None,
            "mail_message_id": r[7]
        }
        for r in rows
    ]


def create_notification(
    uid: str,
    category: str,
    title: str,
    content: str,
    actions: list = None,
    mail_message_id: str = None
) -> dict:
    """Create a new notification entry."""
    init_spark_tables()
    nid = uuid.uuid4()
    with _get_pool().connection() as conn:
        conn.execute(
            """
            INSERT INTO spark_notifications (id, tenant_id, user_ref, category, title, content, actions, mail_message_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (nid, _TENANT, uid, category, title, content, Jsonb(actions or []), mail_message_id),
        )
    return {
        "id": str(nid),
        "category": category,
        "title": title,
        "content": content,
        "actions": actions or [],
        "mail_message_id": mail_message_id
    }


def mark_notification_as_read(uid: str, notification_id: str) -> None:
    """Mark a notification as read."""
    init_spark_tables()
    with _get_pool().connection() as conn:
        conn.execute(
            """
            UPDATE spark_notifications
            SET is_read = TRUE
            WHERE tenant_id = %s AND user_ref = %s AND id = %s
            """,
            (_TENANT, uid, _as_uuid(notification_id)),
        )


def delete_notification(uid: str, notification_id: str) -> None:
    """Delete a notification by ID."""
    init_spark_tables()
    with _get_pool().connection() as conn:
        conn.execute(
            """
            DELETE FROM spark_notifications
            WHERE tenant_id = %s AND user_ref = %s AND id = %s
            """,
            (_TENANT, uid, _as_uuid(notification_id)),
        )


def notification_exists_for_mail(uid: str, mail_message_id: str) -> bool:
    """Check if a notification has already been created for a given email message ID."""
    init_spark_tables()
    with _get_pool().connection() as conn:
        row = conn.execute(
            """
            SELECT 1 FROM spark_notifications
            WHERE tenant_id = %s AND user_ref = %s AND mail_message_id = %s
            """,
            (_TENANT, uid, mail_message_id)
        ).fetchone()
    return row is not None


def get_all_linked_users() -> list[str]:
    """Get all user_refs who have stored Google OAuth tokens."""
    with _get_pool().connection() as conn:
        rows = conn.execute(
            "SELECT DISTINCT user_ref FROM spark_google_tokens WHERE tenant_id = %s",
            (_TENANT,)
        ).fetchall()
    return [r[0] for r in rows]


def get_notification_by_id(uid: str, notification_id: str) -> dict | None:
    """Fetch a single notification by ID."""
    init_spark_tables()
    with _get_pool().connection() as conn:
        row = conn.execute(
            """
            SELECT id, category, title, content, actions, is_read, created_at, mail_message_id
            FROM spark_notifications
            WHERE tenant_id = %s AND user_ref = %s AND id = %s
            """,
            (_TENANT, uid, _as_uuid(notification_id)),
        ).fetchone()
    if not row:
        return None
    return {
        "id": str(row[0]),
        "category": row[1],
        "title": row[2],
        "content": row[3],
        "actions": row[4] or [],
        "is_read": row[5],
        "created_at": row[6].isoformat() if row[6] else None,
        "mail_message_id": row[7]
    }


def get_user_profile(uid: str) -> dict | None:
    """Fetch user's own profile."""
    init_spark_tables()
    with _get_pool().connection() as conn:
        row = conn.execute(
            """
            SELECT name, company, role, email, phone, address, postal_code, hobbies, notes
            FROM spark_user_profiles
            WHERE tenant_id = %s AND user_ref = %s
            """,
            (_TENANT, uid),
        ).fetchone()
    if not row:
        return None
    return {
        "name": row[0],
        "company": row[1],
        "role": row[2],
        "email": row[3],
        "phone": row[4],
        "address": row[5],
        "postal_code": row[6],
        "hobbies": row[7],
        "notes": row[8]
    }


def upsert_user_profile(uid: str, data: dict) -> dict:
    """Create or update user's own profile."""
    init_spark_tables()
    name = data.get("name", "")
    company = data.get("company", "")
    role = data.get("role", "")
    email = data.get("email", "")
    phone = data.get("phone", "")
    address = data.get("address", "")
    postal_code = data.get("postal_code", "")
    hobbies = data.get("hobbies", "")
    notes = data.get("notes", "")

    with _get_pool().connection() as conn:
        conn.execute(
            """
            INSERT INTO spark_user_profiles (tenant_id, user_ref, name, company, role, email, phone, address, postal_code, hobbies, notes, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (tenant_id, user_ref)
            DO UPDATE SET
                name = EXCLUDED.name,
                company = EXCLUDED.company,
                role = EXCLUDED.role,
                email = EXCLUDED.email,
                phone = EXCLUDED.phone,
                address = EXCLUDED.address,
                postal_code = EXCLUDED.postal_code,
                hobbies = EXCLUDED.hobbies,
                notes = EXCLUDED.notes,
                updated_at = NOW()
            """,
            (_TENANT, uid, name, company, role, email, phone, address, postal_code, hobbies, notes)
        )
    return get_user_profile(uid)


def find_person_by_email(uid: str, email_addr: str) -> dict | None:
    """Find a person in digital business cards (spark_people) by email."""
    init_spark_tables()
    # Extract clean email address if in format "Name <email@example.com>"
    import re
    match = re.search(r'[\w\.-]+@[\w\.-]+', email_addr)
    if not match:
        return None
    clean_email = match.group(0).lower()
    
    with _get_pool().connection() as conn:
        row = conn.execute(
            """
            SELECT id, name, company, role, email, phone, address, postal_code, hobbies, notes
            FROM spark_people
            WHERE tenant_id = %s AND user_ref = %s AND LOWER(email) = %s
            """,
            (_TENANT, uid, clean_email),
        ).fetchone()
    if not row:
        return None
    return {
        "id": str(row[0]),
        "name": row[1],
        "company": row[2],
        "role": row[3],
        "email": row[4],
        "phone": row[5],
        "address": row[6],
        "postal_code": row[7],
        "hobbies": row[8],
        "notes": row[9]
    }




