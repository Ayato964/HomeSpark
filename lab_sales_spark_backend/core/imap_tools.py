"""IMAP and SMTP external mail processing engine and tools for Sales Spark.

Allows users to connect their corporate/external email accounts (e.g. Sakura, XServer,
Yahoo!, Outlook, or custom domain mail servers) to read, search, and send emails via Jenny.
"""
from __future__ import annotations

import email
import email.header
import email.mime.text
import imaplib
import logging
import smtplib
import socket
from typing import Any, Dict, List, Optional
from .store import get_imap_accounts, get_imap_account_by_id
from .tool import Tool

logger = logging.getLogger("sales_spark")


def _decode_mime_header(header_val: str | None) -> str:
    """Safely decode MIME headers (e.g., =?ISO-2022-JP?...?= or =?UTF-8?...?=)."""
    if not header_val:
        return ""
    try:
        decoded_fragments = email.header.decode_header(header_val)
        result = []
        for fragment, encoding in decoded_fragments:
            if isinstance(fragment, bytes):
                if encoding:
                    try:
                        result.append(fragment.decode(encoding, errors="replace"))
                    except (LookupError, UnicodeDecodeError):
                        result.append(fragment.decode("utf-8", errors="replace"))
                else:
                    result.append(fragment.decode("utf-8", errors="replace"))
            else:
                result.append(str(fragment))
        return "".join(result)
    except Exception:
        return str(header_val)


def _extract_body_from_message(msg: email.message.Message) -> str:
    """Extract plain text body from an email message."""
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            cdisp = str(part.get("Content-Disposition", ""))
            if ctype == "text/plain" and "attachment" not in cdisp:
                payload = part.get_payload(decode=True)
                charset = part.get_content_charset() or "utf-8"
                try:
                    body = payload.decode(charset, errors="replace")
                except Exception:
                    body = payload.decode("utf-8", errors="replace")
                break
            elif ctype == "text/html" and "attachment" not in cdisp and not body:
                payload = part.get_payload(decode=True)
                charset = part.get_content_charset() or "utf-8"
                try:
                    raw_html = payload.decode(charset, errors="replace")
                except Exception:
                    raw_html = payload.decode("utf-8", errors="replace")
                # Basic HTML tag stripping
                import re
                body = re.sub(r"<[^>]+>", " ", raw_html)
                body = re.sub(r"\s+", " ", body).strip()
    else:
        payload = msg.get_payload(decode=True)
        charset = msg.get_content_charset() or "utf-8"
        if payload:
            try:
                body = payload.decode(charset, errors="replace")
            except Exception:
                body = payload.decode("utf-8", errors="replace")
    return body.strip()


def test_imap_and_smtp_connection(config: dict) -> dict:
    """Test connecting and authenticating to both IMAP and SMTP servers."""
    imap_host = config.get("imap_host", "").strip()
    imap_port = int(config.get("imap_port", 993))
    imap_ssl = bool(config.get("imap_ssl", True))
    smtp_host = config.get("smtp_host", "").strip()
    smtp_port = int(config.get("smtp_port", 465))
    smtp_ssl = bool(config.get("smtp_ssl", True))
    username = config.get("username", "").strip()
    password = config.get("password", "").strip()

    if not imap_host or not username or not password:
        return {"success": False, "error": "IMAPホスト、ユーザー名、パスワードを入力してください。"}

    # 1. Test IMAP
    try:
        if imap_ssl:
            imap_conn = imaplib.IMAP4_SSL(imap_host, imap_port, timeout=10)
        else:
            imap_conn = imaplib.IMAP4(imap_host, imap_port, timeout=10)
        imap_conn.login(username, password)
        imap_conn.logout()
    except Exception as e:
        logger.warning(f"[IMAP Test] Connection failed: {e}")
        return {"success": False, "error": f"IMAP接続エラー: {e}"}

    # 2. Test SMTP (if provided)
    if smtp_host:
        try:
            if smtp_ssl and smtp_port == 465:
                smtp_conn = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10)
                smtp_conn.login(username, password)
                smtp_conn.quit()
            else:
                smtp_conn = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
                if smtp_ssl or smtp_port == 587:
                    smtp_conn.starttls()
                smtp_conn.login(username, password)
                smtp_conn.quit()
        except Exception as e:
            logger.warning(f"[SMTP Test] Connection failed: {e}")
            return {"success": False, "error": f"SMTP接続エラー: {e}"}

    return {"success": True, "message": "IMAP / SMTP サーバーへの接続・認証に成功しました！"}


def fetch_account_emails(account: dict, limit: int = 10, unread_only: bool = False) -> list[dict]:
    """Fetch emails from an external IMAP account."""
    imap_host = account.get("imap_host")
    imap_port = account.get("imap_port", 993)
    imap_ssl = account.get("imap_ssl", True)
    username = account.get("username")
    password = account.get("password")

    if not imap_host or not username or not password:
        return []

    results = []
    try:
        if imap_ssl:
            mail = imaplib.IMAP4_SSL(imap_host, imap_port, timeout=12)
        else:
            mail = imaplib.IMAP4(imap_host, imap_port, timeout=12)
        
        mail.login(username, password)
        mail.select("INBOX", readonly=True)

        search_criteria = "UNSEEN" if unread_only else "ALL"
        status, data = mail.search(None, search_criteria)
        if status != "OK" or not data or not data[0]:
            mail.logout()
            return []

        msg_ids = data[0].split()
        latest_ids = msg_ids[-limit:][::-1]

        for m_id in latest_ids:
            res, msg_data = mail.fetch(m_id, "(RFC822)")
            if res != "OK" or not msg_data or not msg_data[0]:
                continue
            
            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)
            
            subject = _decode_mime_header(msg.get("Subject"))
            sender = _decode_mime_header(msg.get("From"))
            date_str = _decode_mime_header(msg.get("Date"))
            body = _extract_body_from_message(msg)

            results.append({
                "account_label": account.get("label", "外部メール"),
                "account_email": account.get("email_address"),
                "message_id": m_id.decode("utf-8", errors="ignore"),
                "subject": subject or "(件名なし)",
                "from": sender,
                "date": date_str,
                "snippet": body[:300] if body else "(本文なし)"
            })

        mail.logout()
    except Exception as e:
        logger.error(f"[fetch_account_emails] Failed for {account.get('email_address')}: {e}")

    return results


def send_account_email(account: dict, to_email: str, subject: str, body: str) -> dict:
    """Send an email via the external account's SMTP settings."""
    smtp_host = account.get("smtp_host")
    smtp_port = int(account.get("smtp_port", 465))
    smtp_ssl = bool(account.get("smtp_ssl", True))
    username = account.get("username")
    password = account.get("password")
    from_email = account.get("email_address") or username

    if not smtp_host or not username or not password:
        return {"success": False, "error": "SMTP設定が不完全です。"}

    try:
        msg = email.mime.text.MIMEText(body, "plain", "utf-8")
        msg["Subject"] = email.header.Header(subject, "utf-8")
        msg["From"] = from_email
        msg["To"] = to_email

        if smtp_ssl and smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15)
            server.login(username, password)
            server.sendmail(from_email, [to_email], msg.as_string())
            server.quit()
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
            if smtp_ssl or smtp_port == 587:
                server.starttls()
            server.login(username, password)
            server.sendmail(from_email, [to_email], msg.as_string())
            server.quit()

        return {"success": True, "message": f"{to_email} 宛にメールを送信しました。"}
    except Exception as e:
        logger.error(f"[send_account_email] Failed: {e}")
        return {"success": False, "error": str(e)}


def build_imap_tools(uid: str) -> List[Tool]:
    """Build Function Calling tools for external IMAP/SMTP accounts."""

    def _list_external(account_label: str = "", unread_only: bool = False, limit: int = 5) -> str:
        accounts = get_imap_accounts(uid, include_password=True)
        if not accounts:
            return "【外部メール確認】\n連携されている外部メールアカウント（IMAP）がありません。サイドバーの設定から外部メールアカウントを追加してください。"

        target_accounts = accounts
        if account_label.strip():
            target_accounts = [a for a in accounts if account_label.lower() in a.get("label", "").lower() or account_label.lower() in a.get("email_address", "").lower()]
            if not target_accounts:
                target_accounts = accounts

        all_emails = []
        for acc in target_accounts:
            fetched = fetch_account_emails(acc, limit=limit, unread_only=unread_only)
            all_emails.extend(fetched)

        if not all_emails:
            mode = "未読メール" if unread_only else "メール"
            return f"【外部メール確認】\n該当する{mode}はありませんでした。"

        lines = [f"【外部メール一覧 ({len(all_emails)}件)】"]
        for idx, m in enumerate(all_emails, 1):
            lines.append(f"\n--- [{idx}] [{m['account_label']}] {m['subject']} ---")
            lines.append(f"差出人: {m['from']}")
            lines.append(f"日時: {m['date']}")
            lines.append(f"本文要約: {m['snippet']}")

        return "\n".join(lines)

    def _send_external(to: str, subject: str, body: str, account_label: str = "") -> str:
        accounts = get_imap_accounts(uid, include_password=True)
        if not accounts:
            return "【外部メール送信エラー】\n連携されている外部メールアカウントがありません。"

        target_account = accounts[0]
        if account_label.strip():
            matched = [a for a in accounts if account_label.lower() in a.get("label", "").lower() or account_label.lower() in a.get("email_address", "").lower()]
            if matched:
                target_account = matched[0]

        res = send_account_email(target_account, to, subject, body)
        if res.get("success"):
            return f"【外部メール送信成功】\n送信元: [{target_account.get('label')}] {target_account.get('email_address')}\n宛先: {to}\n件名: {subject}\nメールを正常に送信しました！"
        else:
            return f"【外部メール送信エラー】\n送信に失敗しました: {res.get('error')}"

    return [
        Tool(
            name="list_external_emails",
            description="連携されている外部メール（会社の独自ドメインメール、さくら、Yahoo!、Outlook等のIMAPメール）の新着・受信メール一覧を確認します。「会社メールを確認して」「外部アドレスに新着来てる？」「info宛てのメールチェックして」などの際に呼び出してください。",
            parameters={
                "type": "object",
                "properties": {
                    "account_label": {
                        "type": "string",
                        "description": "特定のアカウント名やアドレス（例: '会社メール', 'info@company.co.jp'）。空欄の場合は全アカウントを対象とします。",
                    },
                    "unread_only": {
                        "type": "boolean",
                        "description": "未読メールのみを取得する場合はtrue、全メールを取得する場合はfalse",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "取得件数（デフォルト: 5、最大: 10）",
                    },
                },
                "required": [],
                "additionalProperties": False,
            },
            func=_list_external,
        ),
        Tool(
            name="send_external_email",
            description="連携されている外部メール（会社の独自ドメインメールやサブアドレス等のSMTP）からメールを新規作成・送信します。「会社メールから〇〇さんに送信して」「外部アドレスで返信して」などの際に呼び出してください。",
            parameters={
                "type": "object",
                "properties": {
                    "to": {
                        "type": "string",
                        "description": "送信先メールアドレス",
                    },
                    "subject": {
                        "type": "string",
                        "description": "メールの件名",
                    },
                    "body": {
                        "type": "string",
                        "description": "メールの本文",
                    },
                    "account_label": {
                        "type": "string",
                        "description": "送信に使用するアカウント名やアドレス（例: '会社メール'）。空欄の場合はデフォルトの外部アカウントを使用します。",
                    },
                },
                "required": ["to", "subject", "body"],
                "additionalProperties": False,
            },
            func=_send_external,
        )
    ]
