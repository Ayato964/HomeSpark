// Google-login auth WITHOUT Firebase.
//
// Login is a full-page redirect to the backend, which sends the user to
// Google's consent screen and bounces back with a signed session token in the
// URL fragment (#session=...). We store that token and send it as the Bearer
// on every API call. The token's payload is base64url JSON we can decode to
// show the user; only the backend can mint/validate it.

const backendUrl =
  process.env.NEXT_PUBLIC_API_URL ||
  'https://sales-spark-backend-84357422286.asia-northeast1.run.app';

const STORAGE_KEY = 'spark_session';

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

interface SessionClaims {
  sub: string;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  exp?: number;
}

function decodeClaims(token: string): SessionClaims | null {
  try {
    const body = token.split('.')[0];
    // base64url -> base64, then atob -> UTF-8 JSON
    const b64 = body.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Start login: full-page redirect to the backend → Google consent. */
export function login(): void {
  if (typeof window !== 'undefined') {
    window.location.href = `${backendUrl}/api/auth/login`;
  }
}

/** Instant login for local/offline usage or while Google OAuth is unverified. */
export function loginQuick(
  email: string = "ayato.yofukashi@gmail.com",
  name: string = "Ayato (Local User)",
  autoReload: boolean = true
): void {
  if (typeof window === 'undefined') return;
  const claims = {
    sub: "usr_" + btoa(email).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16),
    email: email,
    name: name,
    picture: null,
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
  };
  const jsonStr = JSON.stringify(claims);
  const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
  const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const token = `${b64url}.local_dev_session`;
  window.localStorage.setItem(STORAGE_KEY, token);
  if (autoReload) {
    window.location.reload();
  }
}

export function logout(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

/** Return the stored session token if present and unexpired, else null. */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = window.localStorage.getItem(STORAGE_KEY);
  if (!token) return null;
  const claims = decodeClaims(token);
  if (!claims || (claims.exp && claims.exp * 1000 < Date.now())) {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
  return token;
}

export function getUser(): UserProfile | null {
  const token = getToken();
  if (!token) return null;
  const c = decodeClaims(token);
  if (!c) return null;
  return {
    uid: c.sub,
    displayName: c.name ?? null,
    email: c.email ?? null,
    photoURL: c.picture ?? null,
  };
}

/**
 * On app load, pick up the session token (or error) the backend put in the URL
 * fragment after the OAuth callback, persist it, and clean the URL.
 * Returns 'success' | 'error' | null.
 */
export function consumeSessionFromUrl(): 'success' | 'error' | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  let result: 'success' | 'error' | null = null;

  const session = params.get('session');
  if (session) {
    window.localStorage.setItem(STORAGE_KEY, session);
    result = 'success';
  } else if (params.get('login_error')) {
    result = 'error';
  }

  if (result) {
    // Strip the fragment so the token doesn't linger in the address bar/history.
    const clean = window.location.pathname + window.location.search;
    window.history.replaceState({}, '', clean);
  }
  return result;
}
