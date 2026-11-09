/**
 * Persist idle-session activity so timeout still applies after tab close,
 * browser suspend (common on phones), or returning to /login with a leftover JWT.
 */

const ACTIVITY_KEY = 'aes_session_last_activity_at';
const IDLE_MS_KEY = 'aes_session_idle_ms';

const DEFAULT_IDLE_MS = 30 * 60 * 1000;

const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  (typeof process !== 'undefined' && process.env.NODE_ENV === 'production'
    ? '/api'
    : 'http://localhost:8000/api');

/**
 * Tell the API to close the open session row before dropping a leftover JWT.
 * Uses keepalive so it still fires when the tab is closing / redirecting.
 */
export function reportSessionEnded(reason = 'idle timeout') {
  let token = null;
  try {
    token = localStorage.getItem('jwt_token');
  } catch {
    token = null;
  }
  if (!token) {
    return;
  }

  const body = JSON.stringify({ reason });
  try {
    fetch(`${API_BASE_URL}/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body,
      keepalive: true,
      credentials: 'include',
    }).catch(() => {});
  } catch {
    // ignore
  }
}

export function getStoredIdleMs() {
  try {
    const n = Number(localStorage.getItem(IDLE_MS_KEY));
    if (Number.isFinite(n) && n >= 1000) {
      return n;
    }
  } catch {
    // ignore
  }
  return DEFAULT_IDLE_MS;
}

export function setStoredIdleMs(ms) {
  try {
    const n = Number(ms);
    if (Number.isFinite(n) && n >= 1000) {
      localStorage.setItem(IDLE_MS_KEY, String(Math.floor(n)));
    }
  } catch {
    // ignore
  }
}

export function getLastActivityAt() {
  try {
    const n = Number(localStorage.getItem(ACTIVITY_KEY));
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  } catch {
    // ignore
  }
  return null;
}

export function touchSessionActivity(at = Date.now()) {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(at));
  } catch {
    // ignore
  }
  return at;
}

export function clearSessionActivity() {
  try {
    localStorage.removeItem(ACTIVITY_KEY);
    localStorage.removeItem(IDLE_MS_KEY);
  } catch {
    // ignore
  }
}

/** True when stored last activity is older than the idle window. */
export function isSessionIdleExpired(now = Date.now(), idleMs = getStoredIdleMs()) {
  const last = getLastActivityAt();
  if (last == null) {
    return false;
  }
  const windowMs = Number(idleMs);
  if (!Number.isFinite(windowMs) || windowMs < 1000) {
    return false;
  }
  return now - last >= windowMs;
}

/**
 * If idle window already elapsed, close the server session log then clear JWT.
 * @returns {boolean} true when the session was expired and cleared
 */
export function expireClientSessionIfIdle(removeToken, reason = 'idle timeout') {
  if (!isSessionIdleExpired()) {
    return false;
  }
  reportSessionEnded(reason);
  try {
    if (typeof removeToken === 'function') {
      removeToken();
    }
  } catch {
    // ignore
  }
  clearSessionActivity();
  return true;
}
