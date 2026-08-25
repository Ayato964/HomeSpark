"""Server-side Google OAuth 2.0 (authorization-code flow with offline access).

Responsibilities:
  * Build the consent-screen URL for a given user.
  * Exchange the returned authorization code for tokens.
  * Persist the long-lived refresh token (via firebase_db) and transparently
    refresh the short-lived access token whenever a tool needs it.
  * Sign / verify the OAuth `state` parameter so the callback cannot be forged
    (CSRF protection) and so we know which uid a callback belongs to.

The Google client libraries are imported lazily: the rest of the backend
(plain chat) must keep working even if these optional packages are not yet
installed.
"""
from __future__ import annotations

import base64
import datetime
import hashlib
import hmac
import json
import os
import time
import typing as t

# Google often returns a slightly different scope set than requested (it appends
# `openid`); without this, oauthlib raises during token exchange.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

from config.const import (
    FRONTEND_URL,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI,
    GOOGLE_OAUTH_SCOPES,
    OAUTH_STATE_SECRET,
)
from .store import (
    delete_google_tokens,
    get_google_tokens,
    save_google_tokens,
)

_TOKEN_URI = "https://oauth2.googleapis.com/token"
_AUTH_URI = "https://accounts.google.com/o/oauth2/auth"

# A non-empty signing secret is required; fall back to a clearly-marked dev
# default so local flows still work without extra configuration.
_STATE_SECRET = (OAUTH_STATE_SECRET or "sales-spark-dev-state-secret").encode()
_STATE_MAX_AGE_SEC = 600  # the user has 10 minutes to complete consent


# --------------------------------------------------------------------------- #
# Optional dependency loading
# --------------------------------------------------------------------------- #
class GoogleIntegrationError(RuntimeError):
    """Raised when Google integration is unavailable or misconfigured."""


def _require_libs():
    try:
        from google.oauth2.credentials import Credentials  # noqa: F401
        from google_auth_oauthlib.flow import Flow  # noqa: F401
        from google.auth.transport.requests import Request  # noqa: F401
    except ImportError as e:  # pragma: no cover - depends on environment
        raise GoogleIntegrationError(
            "Google client libraries are not installed. Run "
            "`pip install -r requirements.txt`."
        ) from e


def is_configured() -> bool:
    """True when the OAuth client credentials have been provided."""
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)


def _allow_insecure_localhost() -> None:
    """oauthlib rejects http:// callbacks. Google permits http for localhost, so
    relax the check only when our redirect URI is an http localhost URL (dev)."""
    uri = GOOGLE_OAUTH_REDIRECT_URI
    if uri.startswith("http://") and ("localhost" in uri or "127.0.0.1" in uri):
        os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")


def _client_config() -> dict:
    return {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": _AUTH_URI,
            "token_uri": _TOKEN_URI,
            "redirect_uris": [GOOGLE_OAUTH_REDIRECT_URI],
        }
    }


# --------------------------------------------------------------------------- #
# State signing (CSRF protection + uid carrier)
# --------------------------------------------------------------------------- #
def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def make_state(uid: str) -> str:
    payload = {"uid": uid, "ts": int(time.time())}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_STATE_SECRET, body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify_state(state: str) -> str | None:
    """Returns the uid embedded in a valid, unexpired state, else None."""
    try:
        body, sig = state.split(".", 1)
    except ValueError:
        return None
    expected = _b64(hmac.new(_STATE_SECRET, body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(_unb64(body))
    except (ValueError, json.JSONDecodeError):
        return None
    if int(time.time()) - int(payload.get("ts", 0)) > _STATE_MAX_AGE_SEC:
        return None
    uid = payload.get("uid")
    return uid if isinstance(uid, str) and uid else None


# --------------------------------------------------------------------------- #
# Authorization-code flow
# --------------------------------------------------------------------------- #
def build_login_url(nonce: str) -> str:
    """Build the Google consent URL for LOGIN.

    A single consent both authenticates the user (openid/profile/email) and
    grants Calendar/Gmail. `nonce` is also stored in an HttpOnly cookie by the
    caller and embedded in the signed `state`; the callback requires the two to
    match, binding the flow to this browser (CSRF / session-fixation defense)."""
    if not is_configured():
        raise GoogleIntegrationError(
            "Google OAuth is not configured (set GOOGLE_CLIENT_ID / "
            "GOOGLE_CLIENT_SECRET)."
        )
    _require_libs()
    _allow_insecure_localhost()
    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_config(
        _client_config(),
        scopes=GOOGLE_OAUTH_SCOPES,
        redirect_uri=GOOGLE_OAUTH_REDIRECT_URI,
        # Do NOT auto-generate a PKCE code_verifier. This flow is stateless: the
        # callback rebuilds a fresh Flow and has no way to recover a verifier
        # generated here, so emitting a code_challenge would make Google reject
        # the token exchange with "Missing code verifier". CSRF is already
        # covered by the signed `state` + HttpOnly nonce cookie. (google-auth-
        # oauthlib >=1.4 defaults this to True, which broke the exchange.)
        autogenerate_code_verifier=False,
    )
    auth_url, _ = flow.authorization_url(
        access_type="offline",        # request a refresh token (for Calendar/Gmail)
        include_granted_scopes="true",
        prompt="consent",             # ensure a refresh token is issued
        state=make_state(nonce),
    )
    return auth_url


def exchange_code_for_login(code: str, state: str, expected_nonce: str | None) -> dict:
    """Exchange the auth code, verify the user's Google identity, persist their
    Calendar/Gmail tokens (keyed by their Google `sub`), and return the identity
    {sub, email, name, picture}. Raises on invalid state / nonce / id_token.

    The signed `state` must decode to the same nonce the browser holds in its
    HttpOnly cookie, so a captured code+state cannot be replayed into another
    user's browser."""
    nonce = verify_state(state)
    if not nonce:
        raise GoogleIntegrationError("Invalid or expired OAuth state.")
    # If cookie nonce is available, verify match; otherwise rely on HMAC-signed state
    if expected_nonce and nonce != expected_nonce:
        raise GoogleIntegrationError("OAuth state nonce mismatch.")
    _require_libs()
    _allow_insecure_localhost()
    from google_auth_oauthlib.flow import Flow
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as ga_requests

    flow = Flow.from_client_config(
        _client_config(),
        scopes=GOOGLE_OAUTH_SCOPES,
        redirect_uri=GOOGLE_OAUTH_REDIRECT_URI,
        # Must mirror build_login_url: no PKCE verifier was generated at login,
        # so none is sent here.
        autogenerate_code_verifier=False,
    )
    try:
        flow.fetch_token(code=code)
    except Exception as e:  # noqa: BLE001 - oauthlib raises its own error types
        # Convert any token-exchange failure into our own error so the callback
        # redirects the user back with login_error instead of returning a 500.
        raise GoogleIntegrationError(f"Token exchange failed: {e}") from e
    creds = flow.credentials

    raw_id_token = getattr(creds, "id_token", None)
    if not raw_id_token:
        raise GoogleIntegrationError("Google did not return an id_token.")
    claims = google_id_token.verify_oauth2_token(
        raw_id_token, ga_requests.Request(), GOOGLE_CLIENT_ID
    )
    sub = claims.get("sub")
    if not sub:
        raise GoogleIntegrationError("id_token is missing 'sub'.")

    # Persist Calendar/Gmail tokens keyed by the user's stable Google id.
    tokens = _credentials_to_dict(creds)
    tokens["email"] = claims.get("email")
    save_google_tokens(sub, tokens)

    return {
        "sub": sub,
        "email": claims.get("email"),
        "name": claims.get("name"),
        "picture": claims.get("picture"),
    }


# --------------------------------------------------------------------------- #
# Credential persistence + refresh
# --------------------------------------------------------------------------- #
def _credentials_to_dict(creds) -> dict:
    expiry = getattr(creds, "expiry", None)
    return {
        "access_token": creds.token,
        "refresh_token": getattr(creds, "refresh_token", None),
        "token_uri": creds.token_uri or _TOKEN_URI,
        "scopes": list(getattr(creds, "scopes", None) or GOOGLE_OAUTH_SCOPES),
        "token_expiry": expiry.replace(tzinfo=datetime.timezone.utc).isoformat()
        if expiry
        else None,
    }


def get_credentials(uid: str):
    """Return ready-to-use google.oauth2 Credentials for `uid`, or None.

    Transparently refreshes the access token (and persists the new one) when it
    has expired. Returns None when the user has not linked their account."""
    stored = get_google_tokens(uid)
    if not stored or not stored.get("refresh_token"):
        return None
    _require_libs()
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request

    # Pass the stored expiry (as naive UTC, which google-auth expects) so that
    # `creds.valid` actually reflects expiry. Without it google-auth treats any
    # non-empty access token as valid and the refresh branch below never runs,
    # leaving the user with a dead token ~1h after linking.
    expiry = None
    raw_expiry = stored.get("token_expiry")
    if raw_expiry:
        try:
            dt = datetime.datetime.fromisoformat(raw_expiry)
            if dt.tzinfo is not None:
                dt = dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
            expiry = dt
        except (ValueError, TypeError):
            expiry = None

    creds = Credentials(
        token=stored.get("access_token"),
        refresh_token=stored.get("refresh_token"),
        token_uri=stored.get("token_uri", _TOKEN_URI),
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=stored.get("scopes", GOOGLE_OAUTH_SCOPES),
        expiry=expiry,
    )
    if not creds.valid:
        try:
            creds.refresh(Request())
            save_google_tokens(uid, _credentials_to_dict(creds))
        except Exception as e:  # noqa: BLE001
            raise GoogleIntegrationError(
                f"Failed to refresh Google access token: {e}. "
                "The user may need to re-link their account."
            ) from e
    return creds


def is_connected(uid: str) -> bool:
    stored = get_google_tokens(uid)
    return bool(stored and stored.get("refresh_token"))


def connection_info(uid: str) -> dict:
    stored = get_google_tokens(uid) or {}
    return {
        "connected": bool(stored.get("refresh_token")),
        "email": stored.get("email"),
        "scopes": stored.get("scopes", []),
    }


def disconnect(uid: str) -> None:
    delete_google_tokens(uid)
