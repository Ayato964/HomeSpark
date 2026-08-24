"""Per-user Google Calendar + Gmail tools.

`build_google_tools(uid)` returns a list of `Tool`s whose functions are closed
over the caller's uid, so the LLM never sees (or controls) whose account it is
acting on. Each tool resolves the user's OAuth credentials at call time and
returns a human-readable string for the model to reason over.
"""
from __future__ import annotations

import base64
import datetime
from email.mime.text import MIMEText

from .google_oauth import GoogleIntegrationError, get_credentials
from .tool import Tool

_NOT_LINKED = (
    "[未連携] このユーザーはGoogleアカウントを連携していません。"
    "サイドバーの『Google連携』ボタンから接続するよう案内してください。"
)


def _service(uid: str, api: str, version: str):
    """Build an authorized Google API client for `uid`, or None if unlinked."""
    creds = get_credentials(uid)
    if creds is None:
        return None
    from googleapiclient.discovery import build

    return build(api, version, credentials=creds, cache_discovery=False)


def _utcnow_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# Calendar
# --------------------------------------------------------------------------- #
def _calendar_list_events(uid, time_min=None, time_max=None, max_results=10, query=None):
    svc = _service(uid, "calendar", "v3")
    if svc is None:
        import logging
        logging.getLogger("sales_spark").warning(f"[_calendar_list_events] Service is None for uid='{uid}'. User not linked.")
        return _NOT_LINKED
    try:
        params = {
            "calendarId": "primary",
            "singleEvents": True,
            "orderBy": "startTime",
            "maxResults": max(1, min(int(max_results or 10), 50)),
            "timeMin": time_min or _utcnow_iso(),
        }
        if time_max:
            params["timeMax"] = time_max
        if query:
            params["q"] = query
        items = svc.events().list(**params).execute().get("items", [])
    except Exception as e:  # noqa: BLE001
        return f"[error] Calendarの予定取得に失敗しました: {e}"

    # Build BOTH the LLM-facing text list AND a structured "custom diagram"
    # payload for the frontend to visualize. The diagram travels to the client
    # as its own SSE event (sent whole, not token-streamed); the LLM only ever
    # sees llm_text.
    events = []
    lines = []
    for ev in items:
        start = ev.get("start", {})
        end = ev.get("end", {})
        all_day = "dateTime" not in start  # all-day events carry only "date"
        start_at = start.get("dateTime") or start.get("date") or ""
        end_at = end.get("dateTime") or end.get("date") or ""
        summary = ev.get("summary", "(無題)")
        loc = ev.get("location") or ""
        eid = ev.get("id") or ""
        events.append(
            {
                "id": eid,
                "summary": summary,
                "start": start_at,
                "end": end_at,
                "location": loc,
                "description": ev.get("description", "") or "",
                "all_day": all_day,
            }
        )
        line = f"- {start_at or '(不明)'} | {summary}"
        if loc:
            line += f" @ {loc}"
        line += f" (id: {eid})"
        lines.append(line)

    llm_text = "\n".join(lines) if lines else "該当する予定はありません。"
    return {
        "llm_text": llm_text,
        "diagram": {"mode": "calendar", "title": "予定一覧", "events": events},
    }


def _calendar_create_event(
    uid, summary, start, end, description=None, location=None, attendees=None
):
    svc = _service(uid, "calendar", "v3")
    if svc is None:
        return _NOT_LINKED
    try:
        body = {
            "summary": summary,
            "start": {"dateTime": start, "timeZone": "Asia/Tokyo"},
            "end": {"dateTime": end, "timeZone": "Asia/Tokyo"},
        }
        if description:
            body["description"] = description
        if location:
            body["location"] = location
        if attendees:
            if isinstance(attendees, str):
                attendees = [a.strip() for a in attendees.split(",") if a.strip()]
            body["attendees"] = [{"email": a} for a in attendees]
        created = svc.events().insert(calendarId="primary", body=body).execute()
    except Exception as e:  # noqa: BLE001
        return f"[error] 予定の作成に失敗しました: {e}"
    return (
        f"予定を作成しました: {created.get('summary')} "
        f"({created.get('start', {}).get('dateTime')} - "
        f"{created.get('end', {}).get('dateTime')})\n"
        f"リンク: {created.get('htmlLink')}"
    )


# --------------------------------------------------------------------------- #
# Gmail
# --------------------------------------------------------------------------- #
def _gmail_search(uid, query=None, max_results=10):
    svc = _service(uid, "gmail", "v1")
    if svc is None:
        return _NOT_LINKED
    try:
        listing = (
            svc.users()
            .messages()
            .list(
                userId="me",
                q=query or "",
                maxResults=max(1, min(int(max_results or 10), 25)),
            )
            .execute()
        )
        msgs = listing.get("messages", [])
        out = []
        emails = []
        for m in msgs:
            full = (
                svc.users()
                .messages()
                .get(
                    userId="me",
                    id=m["id"],
                    format="metadata",
                    metadataHeaders=["From", "Subject", "Date"],
                )
                .execute()
            )
            headers = {h["name"]: h["value"] for h in full.get("payload", {}).get("headers", [])}
            unread = "UNREAD" in (full.get("labelIds") or [])
            frm = headers.get("From", "?")
            subject = headers.get("Subject", "(件名なし)")
            date = headers.get("Date", "?")
            snippet = full.get("snippet", "")
            out.append(
                f"- id: {m['id']}\n  From: {frm}\n  Subject: {subject}\n"
                f"  Date: {date}\n  Unread: {unread}\n  Snippet: {snippet}"
            )
            emails.append(
                {
                    "id": m["id"],
                    "from": frm,
                    "subject": subject,
                    "date": date,
                    "snippet": snippet,
                    "unread": unread,
                }
            )
    except Exception as e:  # noqa: BLE001
        return f"[error] メール検索に失敗しました: {e}"

    # Same dual return as Calendar: LLM text + a structured diagram for the UI.
    llm_text = "\n".join(out) if out else "該当するメールはありません。"
    return {
        "llm_text": llm_text,
        "diagram": {
            "mode": "email_list",
            "title": "メール検索結果",
            "query": query or "",
            "messages": emails,
        },
    }


def _gmail_read_message(uid, message_id):
    svc = _service(uid, "gmail", "v1")
    if svc is None:
        return _NOT_LINKED
    try:
        full = (
            svc.users().messages().get(userId="me", id=message_id, format="full").execute()
        )
    except Exception as e:  # noqa: BLE001
        return f"[error] メールの取得に失敗しました: {e}"
    payload = full.get("payload", {})
    headers = {h["name"]: h["value"] for h in payload.get("headers", [])}
    body_text = _extract_plain_body(payload)
    return (
        f"From: {headers.get('From', '?')}\nTo: {headers.get('To', '?')}\n"
        f"Subject: {headers.get('Subject', '(件名なし)')}\n"
        f"Date: {headers.get('Date', '?')}\n\n{body_text or full.get('snippet', '')}"
    )


def _extract_plain_body(payload) -> str:
    """Depth-first search for a text/plain part, falling back to top-level body."""
    mime = payload.get("mimeType", "")
    body = payload.get("body", {})
    data = body.get("data")
    if mime == "text/plain" and data:
        return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
    for part in payload.get("parts", []) or []:
        found = _extract_plain_body(part)
        if found:
            return found
    if data:  # last resort (e.g. text/html only)
        return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
    return ""


def _gmail_send(uid, to, subject, body, cc=None):
    svc = _service(uid, "gmail", "v1")
    if svc is None:
        return _NOT_LINKED
    try:
        mime = MIMEText(body, _charset="utf-8")
        mime["To"] = to
        mime["Subject"] = subject
        if cc:
            mime["Cc"] = cc
        raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()
        sent = (
            svc.users().messages().send(userId="me", body={"raw": raw}).execute()
        )
    except Exception as e:  # noqa: BLE001
        return f"[error] メール送信に失敗しました: {e}"
    return f"メールを送信しました (id: {sent.get('id')}) 宛先: {to} 件名: {subject}"


# --------------------------------------------------------------------------- #
# Factory
# --------------------------------------------------------------------------- #
def build_google_tools(uid: str) -> list[Tool]:
    """Return Calendar + Gmail tools bound to a specific user's uid."""

    def bind(fn):
        return lambda **kwargs: fn(uid, **kwargs)

    return [
        Tool(
            name="calendar_list_events",
            description=(
                "Googleカレンダーの予定を取得します。時刻は RFC3339 形式 "
                "(例: 2026-06-21T09:00:00+09:00)。timeMin 未指定時は現在以降。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "time_min": {"type": "string", "description": "開始日時の下限 (RFC3339)。省略時は現在"},
                    "time_max": {"type": "string", "description": "開始日時の上限 (RFC3339)"},
                    "max_results": {"type": "integer", "description": "最大件数 (既定10, 最大50)"},
                    "query": {"type": "string", "description": "フリーテキスト検索語"},
                },
                "required": [],
                "additionalProperties": False,
            },
            func=bind(_calendar_list_events),
        ),
        Tool(
            name="calendar_create_event",
            description=(
                "Googleカレンダーに予定を作成します。start/end は RFC3339 形式 "
                "(例: 2026-06-21T15:00:00+09:00)。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "summary": {"type": "string", "description": "予定のタイトル"},
                    "start": {"type": "string", "description": "開始日時 (RFC3339)"},
                    "end": {"type": "string", "description": "終了日時 (RFC3339)"},
                    "description": {"type": "string", "description": "予定の説明"},
                    "location": {"type": "string", "description": "場所"},
                    "attendees": {"type": "string", "description": "参加者メール(カンマ区切り)"},
                },
                "required": ["summary", "start", "end"],
                "additionalProperties": False,
            },
            func=bind(_calendar_create_event),
        ),
        Tool(
            name="gmail_search",
            description=(
                "Gmailを検索し、一致したメールの送信者・件名・抜粋を返します。"
                "query は Gmail 検索構文 (例: 'from:boss is:unread newer_than:7d')。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Gmail検索クエリ"},
                    "max_results": {"type": "integer", "description": "最大件数 (既定10, 最大25)"},
                },
                "required": [],
                "additionalProperties": False,
            },
            func=bind(_gmail_search),
        ),
        Tool(
            name="gmail_read_message",
            description="指定した message_id のGmailメール本文を取得します。",
            parameters={
                "type": "object",
                "properties": {
                    "message_id": {"type": "string", "description": "gmail_search が返すメールID"},
                },
                "required": ["message_id"],
                "additionalProperties": False,
            },
            func=bind(_gmail_read_message),
        ),
        Tool(
            name="gmail_send",
            description=(
                "Gmailからメールを送信します。送信前に必ず宛先・件名・本文を"
                "ユーザーに確認してください。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "宛先メールアドレス"},
                    "subject": {"type": "string", "description": "件名"},
                    "body": {"type": "string", "description": "本文 (プレーンテキスト)"},
                    "cc": {"type": "string", "description": "CC (任意, カンマ区切り)"},
                },
                "required": ["to", "subject", "body"],
                "additionalProperties": False,
            },
            func=bind(_gmail_send),
        ),
    ]
