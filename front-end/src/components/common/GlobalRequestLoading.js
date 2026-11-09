import React, { useEffect, useRef, useState } from 'react';
import { subscribeRequestLoading } from '../../api/requestLoading';
import './GlobalRequestLoading.css';

const SHOW_DELAY_MS = 180;

/**
 * Full-screen blocking loader while tracked axios requests are in flight
 * (mutations by default, plus anything with `showLoading: true`).
 */
export default function GlobalRequestLoading() {
  const [pending, setPending] = useState(0);
  const [message, setMessage] = useState('Loading…');
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const showTimerRef = useRef(null);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    return subscribeRequestLoading(({ count, message: nextMessage }) => {
      setPending(count);
      setMessage(nextMessage || 'Loading…');

      if (count > 0) {
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        if (!showTimerRef.current && !visibleRef.current) {
          showTimerRef.current = setTimeout(() => {
            visibleRef.current = true;
            setVisible(true);
            showTimerRef.current = null;
          }, SHOW_DELAY_MS);
        }
        return;
      }

      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      hideTimerRef.current = setTimeout(() => {
        visibleRef.current = false;
        setVisible(false);
        hideTimerRef.current = null;
      }, 120);
    });
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="global-request-loading"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="assertive"
      aria-label={message}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="global-request-loading__panel">
        <span className="global-request-loading__spinner" aria-hidden />
        <span className="global-request-loading__text">
          {pending > 1 ? `${message.replace(/…$/, '')} (${pending})…` : message}
        </span>
      </div>
    </div>
  );
}
