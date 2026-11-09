import { useEffect, useRef, useCallback } from 'react';
import {
  getLastActivityAt,
  isSessionIdleExpired,
  touchSessionActivity,
} from '../utils/sessionActivity';

const DEFAULT_IDLE_MS = 30 * 60 * 1000;
const DEFAULT_WARN_AFTER_MS = 60 * 1000;

function throttle(fn, wait) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    }
  };
}

/** Show the idle alert after 1 minute, unless the session itself is shorter. */
function warnAfterIdleMs(totalMs, requestedMs) {
  const total = Math.max(1000, Number(totalMs) || DEFAULT_IDLE_MS);
  const requested = Number(requestedMs) > 0 ? Number(requestedMs) : DEFAULT_WARN_AFTER_MS;
  if (total > requested + 15000) {
    return requested;
  }
  return Math.max(5000, Math.min(15000, Math.floor(total / 3)));
}

/** Derive delay before showing warning based on "minutes left". */
function resolveWarnDelayMs(totalMs, warnBeforeLogoutMs, fallbackWarnAfterIdleMs) {
  const total = Math.max(1000, Number(totalMs) || DEFAULT_IDLE_MS);
  const beforeMs = Number(warnBeforeLogoutMs);
  if (Number.isFinite(beforeMs) && beforeMs > 0 && beforeMs < total) {
    return Math.max(1000, total - beforeMs);
  }
  return warnAfterIdleMs(total, fallbackWarnAfterIdleMs);
}

/**
 * After idleMs with no user activity, calls onIdleLogout.
 * Shows a warning with time remaining until logout (e.g. 30 mins left),
 * based on configured "minutes left before auto logout".
 *
 * @param {object} opts
 * @param {boolean} opts.enabled
 * @param {() => void} opts.onIdleLogout
 * @param {number} opts.idleMs
 * @param {number} [opts.warnAfterIdleMs=60000] — legacy fallback delay before idle alert
 * @param {number} [opts.warnBeforeLogoutMs] — preferred lead time before logout to show warning
 * @param {(evt: { type: 'open'|'tick'|'close'; secondsLeft?: number }) => void} [opts.onSessionWarning]
 */
export function useIdleLogout({
  enabled,
  onIdleLogout,
  idleMs,
  warnAfterIdleMs: warnAfterIdleMsOpt = DEFAULT_WARN_AFTER_MS,
  warnBeforeLogoutMs,
  onSessionWarning,
}) {
  const warnAfterOpt = warnAfterIdleMsOpt ?? DEFAULT_WARN_AFTER_MS;
  const logoutTimeoutRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const idleMsRef = useRef(idleMs ?? DEFAULT_IDLE_MS);
  idleMsRef.current = idleMs ?? DEFAULT_IDLE_MS;
  const onIdleLogoutRef = useRef(onIdleLogout);
  onIdleLogoutRef.current = onIdleLogout;
  const onSessionWarningRef = useRef(onSessionWarning);
  onSessionWarningRef.current = onSessionWarning;
  const lastActivityRef = useRef(getLastActivityAt() || Date.now());

  const clearAllTimers = useCallback(() => {
    if (logoutTimeoutRef.current) {
      clearTimeout(logoutTimeoutRef.current);
      logoutTimeoutRef.current = null;
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const forceIdleLogout = useCallback(() => {
    clearAllTimers();
    onSessionWarningRef.current?.({ type: 'close' });
    onIdleLogoutRef.current();
  }, [clearAllTimers]);

  const armTimersFromLastActivity = useCallback(() => {
    clearAllTimers();
    onSessionWarningRef.current?.({ type: 'close' });

    if (!enabled) {
      return;
    }

    const total = idleMsRef.current;
    const last = lastActivityRef.current || Date.now();
    const elapsed = Math.max(0, Date.now() - last);
    if (elapsed >= total) {
      forceIdleLogout();
      return;
    }

    const remaining = total - elapsed;
    const warnDelayFull = resolveWarnDelayMs(total, warnBeforeLogoutMs, warnAfterOpt);
    const warnDelay = Math.max(0, warnDelayFull - elapsed);

    logoutTimeoutRef.current = setTimeout(() => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      onIdleLogoutRef.current();
    }, remaining);

    if (warnDelay > 0 && warnDelay < remaining) {
      warningTimeoutRef.current = setTimeout(() => {
        const end = lastActivityRef.current + idleMsRef.current;
        const secs = Math.max(1, Math.ceil((end - Date.now()) / 1000));
        onSessionWarningRef.current?.({ type: 'open', secondsLeft: secs });

        countdownIntervalRef.current = setInterval(() => {
          const left = Math.max(
            0,
            Math.ceil((lastActivityRef.current + idleMsRef.current - Date.now()) / 1000)
          );
          if (left <= 0) {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            return;
          }
          onSessionWarningRef.current?.({ type: 'tick', secondsLeft: left });
        }, 1000);
      }, warnDelay);
    } else if (elapsed >= warnDelayFull && remaining > 0) {
      const end = last + total;
      const secs = Math.max(1, Math.ceil((end - Date.now()) / 1000));
      onSessionWarningRef.current?.({ type: 'open', secondsLeft: secs });
      countdownIntervalRef.current = setInterval(() => {
        const left = Math.max(
          0,
          Math.ceil((lastActivityRef.current + idleMsRef.current - Date.now()) / 1000)
        );
        if (left <= 0) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return;
        }
        onSessionWarningRef.current?.({ type: 'tick', secondsLeft: left });
      }, 1000);
    }
  }, [enabled, clearAllTimers, warnAfterOpt, warnBeforeLogoutMs, forceIdleLogout]);

  const resetTimer = useCallback(() => {
    if (!enabled) {
      clearAllTimers();
      onSessionWarningRef.current?.({ type: 'close' });
      return;
    }

    lastActivityRef.current = touchSessionActivity(Date.now());
    armTimersFromLastActivity();
  }, [enabled, clearAllTimers, armTimersFromLastActivity]);

  useEffect(() => {
    if (!enabled) {
      clearAllTimers();
      onSessionWarningRef.current?.({ type: 'close' });
      return undefined;
    }

    // Resume from persisted activity (tab close / mobile suspend).
    const stored = getLastActivityAt();
    if (stored) {
      lastActivityRef.current = stored;
    } else {
      lastActivityRef.current = touchSessionActivity(Date.now());
    }

    if (isSessionIdleExpired(Date.now(), idleMsRef.current)) {
      forceIdleLogout();
      return undefined;
    }

    armTimersFromLastActivity();

    const throttledReset = throttle(resetTimer, 1000);
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click', 'wheel'];
    events.forEach((e) => window.addEventListener(e, throttledReset, { passive: true }));

    const onAppActivity = () => resetTimer();
    window.addEventListener('app-activity', onAppActivity);

    // Mobile browsers often pause timers while backgrounded — re-check on resume.
    const onResume = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (isSessionIdleExpired(Date.now(), idleMsRef.current)) {
        forceIdleLogout();
        return;
      }
      armTimersFromLastActivity();
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);

    return () => {
      clearAllTimers();
      onSessionWarningRef.current?.({ type: 'close' });
      events.forEach((e) => window.removeEventListener(e, throttledReset));
      window.removeEventListener('app-activity', onAppActivity);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [enabled, resetTimer, idleMs, clearAllTimers, armTimersFromLastActivity, forceIdleLogout]);
}
