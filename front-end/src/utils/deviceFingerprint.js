/** Persistent per-browser id used to skip Dean device OTP on known devices. */
const DEVICE_FINGERPRINT_KEY = 'aes_trusted_device_id';

function randomDeviceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getOrCreateDeviceFingerprint() {
  try {
    let id = window.localStorage.getItem(DEVICE_FINGERPRINT_KEY);
    if (!id || String(id).trim().length < 8) {
      id = randomDeviceId();
      window.localStorage.setItem(DEVICE_FINGERPRINT_KEY, id);
    }
    return String(id).trim();
  } catch {
    return randomDeviceId();
  }
}
