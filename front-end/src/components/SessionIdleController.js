import React, { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useIdleLogout } from '../hooks/useIdleLogout';
import SessionExpiryModal from './SessionExpiryModal';
import api, { jwtAuth } from '../api/axios';

/**
 * Idle timeout + idle warning modal. Lives outside AuthContext.js so lazy-loaded
 * routes (e.g. StudentPanel) always see a fully initialized context (avoids circular init issues).
 */
const SessionIdleController = () => {
  const { user, loading, logout, sessionIdleMs, sessionWarnAfterIdleMs } = useAuth();
  const [sessionExpiryWarn, setSessionExpiryWarn] = useState({ open: false, secondsLeft: 60 });

  const onSessionWarning = useCallback((evt) => {
    if (evt.type === 'open') {
      setSessionExpiryWarn({
        open: true,
        secondsLeft: evt.secondsLeft ?? 60,
      });
    } else if (evt.type === 'tick') {
      setSessionExpiryWarn((s) =>
        s.open ? { ...s, secondsLeft: evt.secondsLeft ?? s.secondsLeft } : s
      );
    } else if (evt.type === 'close') {
      setSessionExpiryWarn({ open: false, secondsLeft: 60 });
    }
  }, []);

  const handleSessionContinue = useCallback(async () => {
    try {
      const res = await api.post('/jwt/refresh', {}, { silent: true });
      const next = res.data?.access_token;
      if (next) {
        jwtAuth.setToken(next);
      }
    } catch {
      // access token may still be valid; extending idle window is enough
    }
    window.dispatchEvent(new CustomEvent('app-activity'));
  }, []);

  const idleLogout = useCallback(() => {
    logout('idle timeout', { showLoading: false });
  }, [logout]);

  const manualLogout = useCallback(() => {
    logout('manual logout');
  }, [logout]);

  useIdleLogout({
    enabled: !!user && !loading,
    onIdleLogout: idleLogout,
    idleMs: sessionIdleMs,
    warnAfterIdleMs: sessionWarnAfterIdleMs,
    onSessionWarning,
  });

  return (
    <SessionExpiryModal
      open={sessionExpiryWarn.open}
      secondsLeft={sessionExpiryWarn.secondsLeft}
      onContinue={handleSessionContinue}
      onLogout={manualLogout}
    />
  );
};

export default SessionIdleController;
