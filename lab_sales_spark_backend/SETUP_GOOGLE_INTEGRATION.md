# Setup: Google Login + Calendar/Gmail (NO Firebase)

Login is now **our own Google OAuth** — no Firebase, no service-account JSON.
A single Google consent both **logs the user in** and **grants Calendar/Gmail**.
Identity = the user's Google `sub`; the backend issues a signed session token.
Chat history + Google tokens live in **Postgres** (see SETUP_POSTGRES_MIGRATION.md).

```
Frontend  --login()-->  GET /api/auth/login  --302-->  Google consent
   ^                                                        |
   |  #session=<signed token>                               v
Frontend  <--302--  GET /api/auth/google/callback  <--302--  Google
```

---

## 1. Enable the Google APIs

In **Google Cloud Console** → **APIs & Services → Library**, enable:
- **Google Calendar API**
- **Gmail API**

(Login itself uses OpenID Connect, which needs no API to be enabled.)

## 2. OAuth consent screen

**APIs & Services → OAuth consent screen**:
- User type: Internal (Workspace) or External.
- Scopes to add:
  - `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`  (login identity)
  - `.../auth/calendar.events`  (read/write events)
  - `.../auth/gmail.readonly`, `.../auth/gmail.send`
- If External + "Testing": add each user's email under **Test users**.
- `gmail.send` is a **restricted** scope; keep the app in Testing for internal use
  to avoid Google verification.

## 3. OAuth client (Web)

**APIs & Services → Credentials → Create credentials → OAuth client ID → Web**:
- **Authorized redirect URIs** — must match `GOOGLE_OAUTH_REDIRECT_URI` EXACTLY:
  - `http://localhost:8080/api/auth/google/callback`  (local)
  - `https://<backend-domain>/api/auth/google/callback`  (prod)
- Copy the **Client ID** and **Client secret**.

> Note: the redirect URI host must match what the browser uses to reach the
> backend. If `NEXT_PUBLIC_API_URL` is `http://127.0.0.1:8080`, register the
> callback with `127.0.0.1` too (Google treats `localhost` and `127.0.0.1` as
> different). Keep them consistent.

## 4. Configure `main/.env`

```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8080/api/auth/google/callback
FRONTEND_URL=http://localhost:3000
OAUTH_STATE_SECRET=<python -c "import secrets;print(secrets.token_urlsafe(32))">
SESSION_SECRET=<python -c "import secrets;print(secrets.token_urlsafe(32))">
# (DATABASE_URL + DEFAULT_TENANT_ID already set from the Postgres migration)
```

Frontend `front/main/.env.local` only needs the backend URL (no Firebase keys):
```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8080
BACKEND_API_URL=http://127.0.0.1:8080
```

## 5. Run

```bash
cd main && pip install -r requirements.txt && python server.py   # :8080
cd front/main && npm install && npm run dev                      # :3000
```

## 6. Verify

1. Open the app → **Google でログイン** → consent screen → back to the app,
   logged in as your real Google account (badge `USER`).
2. Reload → still logged in (session token in localStorage).
3. The Google badge shows `連携済` (login already granted Calendar/Gmail).
4. Try: 「今日の予定」「先週の未読メールを要約」「明日15時に打ち合わせ」「下書きを送って」.
5. Chat, then check Postgres: rows appear in `spark_chat_messages` under your
   Google `sub` as `user_ref`.

### Local dev without Google credentials
Set `ALLOW_MOCK_AUTH=1` in `main/.env`; **Google でログイン** then issues a mock
session (no real Google) so you can exercise the app. Never set this in prod.

## 7. Production notes

- Set the same vars on Cloud Run (secrets in Secret Manager): `GOOGLE_CLIENT_ID/SECRET`,
  `OAUTH_STATE_SECRET`, `SESSION_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI=https://<backend>/api/auth/google/callback`,
  `FRONTEND_URL=https://<frontend>`, plus the bytecompute key and `DATABASE_URL`.
- Add the production redirect URI to the OAuth client.
- Cookies: the OAuth nonce cookie is marked `Secure` automatically when
  `GOOGLE_OAUTH_REDIRECT_URI` is https.
- No Firebase project, no service-account JSON, no `firebase-admin` dependency.
