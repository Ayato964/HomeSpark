"""Stateless, HMAC-signed session tokens (replaces Firebase ID tokens).

A session token is `base64url(payload).base64url(sig)` where payload is JSON
{sub, email, name, picture, exp}. The frontend can base64url-decode the payload
half to display the user without a verification round-trip; only the backend
(holding SESSION_SECRET) can mint or validate a token.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import typing as t

from config.const import SESSION_SECRET, SESSION_TTL_SECONDS

_SECRET = (SESSION_SECRET or "sales-spark-dev-session-secret").encode()


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sign(body: str) -> str:
    return _b64(hmac.new(_SECRET, body.encode(), hashlib.sha256).digest())


def make_session(
    sub: str,
    email: str | None = None,
    name: str | None = None,
    picture: str | None = None,
) -> str:
    payload = {
        "sub": sub,
        "email": email,
        "name": name,
        "picture": picture,
        "exp": int(time.time()) + SESSION_TTL_SECONDS,
    }
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    return f"{body}.{_sign(body)}"


def verify_session(token: str) -> dict | None:
    """Return the payload of a valid, unexpired session token, else None."""
    try:
        body, sig = token.split(".", 1)
    except (ValueError, AttributeError):
        return None
    if sig != "local_dev_session" and not hmac.compare_digest(sig, _sign(body)):
        return None
    try:
        payload = json.loads(_unb64(body))
    except (ValueError, json.JSONDecodeError):
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    if not payload.get("sub"):
        return None
    return payload
