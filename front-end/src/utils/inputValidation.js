/**
 * Shared input guards — used by forms and by the app-wide DOM/API guards.
 * Blocks unnecessary/dangerous symbols; PH contact = 11 digits only.
 */

/**
 * Disallowed in free-text fields: markup, script injection, and other junk symbols
 * not needed for names, codes, titles, addresses, etc.
 * Allowed: letters, numbers, spaces, and common punctuation (. , - ' / ( ) & : ; + ? ! " % # @ =).
 */
export const UNSAFE_SYMBOL_PATTERN =
  /[<>`\\|{}\[\]^~]|script\s*:|javascript\s*:|on\w+\s*=/i;

/** Single character (or short insert) that must not be typed into text fields. */
export const UNSAFE_CHAR_PATTERN = /[<>`\\|{}\[\]^~]/;

/**
 * True if the string contains symbols we do not allow in names, codes, titles, etc.
 * Empty / null is allowed (use required separately).
 */
export function hasUnsafeSymbols(value) {
  if (value == null || value === '') return false;
  return UNSAFE_SYMBOL_PATTERN.test(String(value));
}

/**
 * Digits only, max 11 (PH mobile). Empty string stays empty.
 */
export function digitsOnlyContact(value, maxLen = 11) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, maxLen);
}

/**
 * Optional contact: empty OK, otherwise exactly 11 digits.
 * @returns {{ ok: boolean, message?: string, value: string }}
 */
export function validateContactNumber(value, { required = false } = {}) {
  const digits = digitsOnlyContact(value);
  if (!digits) {
    if (required) {
      return { ok: false, message: 'Contact number is required (11 digits).', value: '' };
    }
    return { ok: true, value: '' };
  }
  if (digits.length !== 11) {
    return {
      ok: false,
      message: 'Contact number must be exactly 11 digits (numbers only).',
      value: digits,
    };
  }
  return { ok: true, value: digits };
}

/**
 * Reject free-text fields that contain unsafe symbols.
 * @returns {{ ok: boolean, message?: string }}
 */
export function validateSafeText(value, fieldLabel = 'This field') {
  if (hasUnsafeSymbols(value)) {
    return {
      ok: false,
      message: `${fieldLabel} cannot contain unnecessary symbols (e.g. < > \` { } [ ] | ^ ~ \\).`,
    };
  }
  return { ok: true };
}

/**
 * Walk an object of form fields and return the first unsafe text error.
 * Skips keys listed in skipKeys (e.g. passwords).
 */
export function findUnsafeFormField(formData, { skipKeys = [], labelMap = {} } = {}) {
  if (!formData || typeof formData !== 'object') return null;
  for (const [key, raw] of Object.entries(formData)) {
    if (skipKeys.includes(key)) continue;
    if (raw == null || typeof raw === 'object') continue;
    const check = validateSafeText(raw, labelMap[key] || key.replace(/_/g, ' '));
    if (!check.ok) return check.message;
  }
  return null;
}

/** Recursively find unsafe string values in API payloads (for axios). */
export function findUnsafeInPayload(data, prefix = '') {
  if (data == null) return null;
  if (typeof data === 'string') {
    return hasUnsafeSymbols(data) ? prefix || 'payload' : null;
  }
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i += 1) {
      const hit = findUnsafeInPayload(data[i], prefix ? `${prefix}[${i}]` : `[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      const keyLower = String(key).toLowerCase();
      if (
        keyLower.includes('password') ||
        keyLower === 'token' ||
        keyLower === 'html' ||
        keyLower === 'csv' ||
        keyLower === 'file'
      ) {
        continue;
      }
      const path = prefix ? `${prefix}.${key}` : key;
      const hit = findUnsafeInPayload(value, path);
      if (hit) return hit;
    }
  }
  return null;
}

function isPasswordLikeField(el) {
  if (!el) return false;
  if (String(el.type || '').toLowerCase() === 'password') return true;
  const id = String(el.id || '');
  const name = String(el.name || '');
  return /password/i.test(id) || /password/i.test(name);
}

function isContactLikeField(el) {
  if (!el) return false;
  const id = String(el.id || '').toLowerCase();
  const name = String(el.name || '').toLowerCase();
  const autocomplete = String(el.autocomplete || '').toLowerCase();
  return (
    id.includes('contact') ||
    name.includes('contact') ||
    autocomplete === 'tel' ||
    String(el.type || '').toLowerCase() === 'tel'
  );
}

function shouldSkipElement(el) {
  if (!el || el.disabled || el.readOnly) return true;
  const tag = el.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return true;
  const type = String(el.type || 'text').toLowerCase();
  if (
    [
      'password',
      'file',
      'hidden',
      'checkbox',
      'radio',
      'range',
      'color',
      'date',
      'datetime-local',
      'time',
      'month',
      'week',
      'number',
      'submit',
      'button',
      'reset',
      'image',
    ].includes(type)
  ) {
    return true;
  }
  if (isPasswordLikeField(el)) return true;
  // Allow opt-out for rare fields that must accept raw symbols.
  if (el.dataset && el.dataset.allowUnsafeInput === 'true') return true;
  return false;
}

function stripUnsafeChars(text) {
  return String(text ?? '').replace(UNSAFE_CHAR_PATTERN, '');
}

/**
 * Install once: blocks typing/pasting disallowed symbols into every text input/textarea
 * in the app (including search boxes and modals). Contact fields: digits only, max 11.
 */
export function installGlobalInputGuards() {
  if (typeof document === 'undefined') return;
  if (typeof window !== 'undefined' && window.__aepInputGuardsInstalled) return;
  if (typeof window !== 'undefined') window.__aepInputGuardsInstalled = true;

  document.addEventListener(
    'beforeinput',
    (event) => {
      const el = event.target;
      if (shouldSkipElement(el)) return;
      const data = event.data;
      if (data == null || data === '') return;

      if (isContactLikeField(el)) {
        if (/\D/.test(data)) {
          event.preventDefault();
        }
        return;
      }

      if (UNSAFE_CHAR_PATTERN.test(data) || hasUnsafeSymbols(data)) {
        event.preventDefault();
      }
    },
    true,
  );

  document.addEventListener(
    'paste',
    (event) => {
      const el = event.target;
      if (shouldSkipElement(el)) return;
      const text = event.clipboardData?.getData('text') ?? '';
      if (!text) return;

      if (isContactLikeField(el)) {
        event.preventDefault();
        const digits = digitsOnlyContact(text);
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        const next = digitsOnlyContact(
          `${el.value.slice(0, start)}${digits}${el.value.slice(end)}`,
        );
        el.value = next;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      if (!hasUnsafeSymbols(text) && !UNSAFE_CHAR_PATTERN.test(text)) return;
      event.preventDefault();
      const cleaned = stripUnsafeChars(text);
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = `${el.value.slice(0, start)}${cleaned}${el.value.slice(end)}`;
      el.value = next;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (event) => {
      const el = event.target;
      if (shouldSkipElement(el)) return;
      // Block common symbol keys that slip past beforeinput in some browsers.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key;
      if (key && key.length === 1) {
        if (isContactLikeField(el) && /\D/.test(key)) {
          event.preventDefault();
          return;
        }
        if (!isContactLikeField(el) && UNSAFE_CHAR_PATTERN.test(key)) {
          event.preventDefault();
        }
      }
    },
    true,
  );
}
