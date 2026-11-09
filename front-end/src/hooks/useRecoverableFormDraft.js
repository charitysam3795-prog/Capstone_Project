import { useEffect, useRef } from 'react';
import {
  clearRecoverableDraft,
  readRecoverableDraft,
  writeRecoverableDraft,
} from '../utils/networkRecoverability';

/**
 * Autosave form state to sessionStorage so a network drop / refresh can restore inputs.
 *
 * @param {object} opts
 * @param {string} opts.draftKey
 * @param {object} opts.formData
 * @param {(next: object) => void} opts.setFormData
 * @param {boolean} opts.enabled — e.g. modal open
 * @param {boolean} [opts.skipHydrate] — when opening a fresh edit of a different record
 */
export default function useRecoverableFormDraft({
  draftKey,
  formData,
  setFormData,
  enabled,
  skipHydrate = false,
}) {
  const hydratedKeyRef = useRef('');
  const skipWriteRef = useRef(false);

  useEffect(() => {
    if (!enabled || !draftKey || skipHydrate) {
      if (!enabled) hydratedKeyRef.current = '';
      return;
    }
    if (hydratedKeyRef.current === draftKey) return;
    hydratedKeyRef.current = draftKey;
    const saved = readRecoverableDraft(draftKey);
    if (saved?.data && typeof saved.data === 'object') {
      skipWriteRef.current = true;
      setFormData((prev) => ({ ...prev, ...saved.data }));
    }
  }, [enabled, draftKey, skipHydrate, setFormData]);

  useEffect(() => {
    if (!enabled || !draftKey) return;
    if (skipWriteRef.current) {
      skipWriteRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      writeRecoverableDraft(draftKey, formData);
    }, 400);
    return () => window.clearTimeout(t);
  }, [enabled, draftKey, formData]);

  return {
    clearDraft: () => clearRecoverableDraft(draftKey),
    hasStoredDraft: () => Boolean(readRecoverableDraft(draftKey)?.data),
  };
}
