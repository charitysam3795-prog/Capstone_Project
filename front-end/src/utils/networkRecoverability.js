/**
 * Network / recoverability events shared by axios + UI banner.
 */

export const NETWORK_OFFLINE_EVENT = 'aep-network-offline';
export const NETWORK_ONLINE_EVENT = 'aep-network-online';
export const NETWORK_REQUEST_FAILED_EVENT = 'aep-network-request-failed';

export function isBrowserOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

export function isAxiosNetworkError(error) {
  if (!error) return false;
  if (error.response) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return (
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    msg.includes('network error') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror')
  );
}

export function emitNetworkOffline(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NETWORK_OFFLINE_EVENT, { detail }));
}

export function emitNetworkOnline(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NETWORK_ONLINE_EVENT, { detail }));
}

export function emitNetworkRequestFailed(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NETWORK_REQUEST_FAILED_EVENT, { detail }));
}

const DRAFT_PREFIX = 'aep-recoverable-draft:v1:';

export function recoverableDraftKey(parts) {
  return `${DRAFT_PREFIX}${parts.filter(Boolean).join(':')}`;
}

export function readRecoverableDraft(key) {
  if (typeof window === 'undefined' || !key) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeRecoverableDraft(key, data) {
  if (typeof window === 'undefined' || !key) return;
  try {
    if (data == null || (typeof data === 'object' && Object.keys(data).length === 0)) {
      window.sessionStorage.removeItem(key);
      return;
    }
    const safe =
      typeof data === 'object' && !Array.isArray(data)
        ? Object.fromEntries(
            Object.entries(data).filter(([k]) => !/password/i.test(String(k))),
          )
        : data;
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ data: safe, savedAt: Date.now() }),
    );
  } catch {
    // quota / private mode — ignore
  }
}

export function clearRecoverableDraft(key) {
  if (typeof window === 'undefined' || !key) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}
