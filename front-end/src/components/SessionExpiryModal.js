import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import useDialogFocus from '../hooks/useDialogFocus';
import './SessionExpiryModal.css';

function formatTimeLeft(totalSeconds) {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins <= 0) {
    return `${s} ${s === 1 ? 'sec' : 'secs'}`;
  }
  if (secs === 0) {
    return `${mins} ${mins === 1 ? 'min' : 'mins'}`;
  }
  return `${mins} ${mins === 1 ? 'min' : 'mins'} ${secs} ${secs === 1 ? 'sec' : 'secs'}`;
}

/**
 * Shown after the configured idle warning delay (see useIdleLogout + SessionIdleController).
 */
const SessionExpiryModal = ({ open, secondsLeft, onContinue, onLogout }) => {
  const dialogRef = useRef(null);
  const continueButtonRef = useRef(null);
  useDialogFocus(open, dialogRef, continueButtonRef);

  if (!open) return null;

  const timeLabel = formatTimeLeft(secondsLeft);

  return createPortal(
    <div className="session-expiry-overlay" role="presentation">
      <div
        ref={dialogRef}
        className="session-expiry-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expiry-title"
        aria-describedby="session-expiry-desc"
        tabIndex="-1"
      >
        <div className="session-expiry-modal__icon" aria-hidden>
          <span className="session-expiry-modal__icon-inner">!</span>
        </div>
        <h2 id="session-expiry-title" className="session-expiry-modal__title">
          You have been idle
        </h2>
        <p id="session-expiry-desc" className="session-expiry-modal__text">
          <strong>{timeLabel}</strong> left to automatic logout.
        </p>
        <div className="session-expiry-modal__actions">
          <button
            ref={continueButtonRef}
            type="button"
            className="session-expiry-modal__btn session-expiry-modal__btn--continue"
            onClick={onContinue}
          >
            Continue
          </button>
          <button type="button" className="session-expiry-modal__btn session-expiry-modal__btn--logout" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SessionExpiryModal;
