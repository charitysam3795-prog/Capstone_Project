/** Shared pending-request counter for global loading UI (axios interceptors). */

let pending = 0;
/** Parallel request labels (FIFO) so the overlay can show Signing in / out, etc. */
const messages = [];
const listeners = new Set();

function currentMessage() {
  return messages[0] || 'Loading…';
}

function notify() {
  const payload = { count: pending, message: currentMessage() };
  listeners.forEach((fn) => {
    try {
      fn(payload);
    } catch {
      // ignore subscriber errors
    }
  });
}

/**
 * @param {string} [message]
 */
export function beginRequestLoading(message = 'Loading…') {
  pending += 1;
  messages.push(message || 'Loading…');
  notify();
}

export function endRequestLoading() {
  pending = Math.max(0, pending - 1);
  if (messages.length) messages.shift();
  notify();
}

export function getPendingRequestCount() {
  return pending;
}

/** @param {(state: { count: number, message: string }) => void} listener */
export function subscribeRequestLoading(listener) {
  listeners.add(listener);
  listener({ count: pending, message: currentMessage() });
  return () => listeners.delete(listener);
}

/**
 * Track loading for mutating requests by default.
 * GETs stay quiet unless `showLoading: true` (CSV/import-style jobs).
 * Opt out with `skipLoading` / `silent` / `showLoading: false`.
 */
export function shouldTrackRequestLoading(config) {
  if (!config) return false;
  if (config.silent === true || config.skipLoading === true) return false;
  if (config.showLoading === false) return false;
  const url = String(config.url || '');
  if (url.includes('/jwt/refresh')) return false;
  if (config.showLoading === true) return true;
  const method = String(config.method || 'get').toLowerCase();
  return ['post', 'put', 'patch', 'delete'].includes(method);
}

/** Human label for the global overlay based on the request. */
export function loadingMessageFor(config) {
  if (!config) return 'Loading…';
  if (typeof config.loadingMessage === 'string' && config.loadingMessage.trim()) {
    return config.loadingMessage.trim();
  }
  const url = String(config.url || '');
  if (url.includes('/login')) return 'Signing in…';
  if (url.includes('/logout')) return 'Signing out…';
  return 'Loading…';
}
