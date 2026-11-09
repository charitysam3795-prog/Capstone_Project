import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Moves focus into a modal, keeps Tab navigation inside it, and restores focus
 * to the control that opened it.
 */
export default function useDialogFocus(open, containerRef, initialFocusRef, onEscape) {
  const escapeHandlerRef = useRef(onEscape);
  escapeHandlerRef.current = onEscape;

  useEffect(() => {
    if (!open || !containerRef?.current) return undefined;

    const dialog = containerRef.current;
    const previouslyFocused = document.activeElement;
    const focusables = () =>
      Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (element) => element.getAttribute('aria-hidden') !== 'true'
      );

    const frame = requestAnimationFrame(() => {
      const firstTarget = initialFocusRef?.current || focusables()[0] || dialog;
      firstTarget.focus();
    });

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && typeof escapeHandlerRef.current === 'function') {
        event.preventDefault();
        escapeHandlerRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const available = focusables();
      if (!available.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = available[0];
      const last = available[available.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open, containerRef, initialFocusRef]);
}
