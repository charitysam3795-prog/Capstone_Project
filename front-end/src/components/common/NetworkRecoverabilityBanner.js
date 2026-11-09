import React, { useCallback, useEffect, useState } from 'react';
import { swalToast } from '../../utils/swal';
import {
  NETWORK_OFFLINE_EVENT,
  NETWORK_ONLINE_EVENT,
  NETWORK_REQUEST_FAILED_EVENT,
  isBrowserOnline,
} from '../../utils/networkRecoverability';
import './NetworkRecoverabilityBanner.css';

/**
 * Shows when the browser is offline or an API call failed due to network loss.
 * Explains that typed inputs are kept locally so the user can continue after reconnect.
 */
const NetworkRecoverabilityBanner = () => {
  const [offline, setOffline] = useState(() => !isBrowserOnline());
  const [requestFailed, setRequestFailed] = useState(false);

  const markOffline = useCallback(() => {
    setOffline(true);
    setRequestFailed(false);
  }, []);

  const markOnline = useCallback((fromEvent = false) => {
    setOffline(false);
    setRequestFailed(false);
    if (fromEvent) {
      swalToast(
        'success',
        'Connection restored — you can continue. Unsaved inputs were kept on this device.',
      );
      window.dispatchEvent(new CustomEvent('aep-network-restored'));
    }
  }, []);

  useEffect(() => {
    const onOffline = () => markOffline();
    const onOnline = () => markOnline(true);
    const onReqFail = () => {
      if (!isBrowserOnline()) {
        markOffline();
      } else {
        setRequestFailed(true);
      }
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    window.addEventListener(NETWORK_OFFLINE_EVENT, onOffline);
    window.addEventListener(NETWORK_ONLINE_EVENT, onOnline);
    window.addEventListener(NETWORK_REQUEST_FAILED_EVENT, onReqFail);

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener(NETWORK_OFFLINE_EVENT, onOffline);
      window.removeEventListener(NETWORK_ONLINE_EVENT, onOnline);
      window.removeEventListener(NETWORK_REQUEST_FAILED_EVENT, onReqFail);
    };
  }, [markOffline, markOnline]);

  if (!offline && !requestFailed) return null;

  const title = offline ? 'Network interrupted' : 'Connection problem';
  const body = offline
    ? 'You are offline. The system preserved inputs typed on this device (forms and evaluation drafts). Reconnect to save to the server.'
    : 'A request could not reach the server. Your inputs on this page were kept — check your connection and try again.';

  return (
    <div
      className={`net-recover-banner${offline ? ' net-recover-banner--offline' : ' net-recover-banner--warn'}`}
      role="status"
      aria-live="polite"
    >
      <div className="net-recover-banner__inner">
        <i
          className={`fa-solid ${offline ? 'fa-wifi' : 'fa-triangle-exclamation'}`}
          aria-hidden
        />
        <div className="net-recover-banner__text">
          <strong>{title}</strong>
          <span>{body}</span>
        </div>
        {requestFailed && isBrowserOnline() ? (
          <button
            type="button"
            className="net-recover-banner__dismiss"
            onClick={() => setRequestFailed(false)}
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default NetworkRecoverabilityBanner;
