import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
} from 'react';
import api, { jwtAuth } from '../api/axios';
import { getOrCreateDeviceFingerprint } from '../utils/deviceFingerprint';
import {
  clearSessionActivity,
  expireClientSessionIfIdle,
  setStoredIdleMs,
  touchSessionActivity,
} from '../utils/sessionActivity';

const IDLE_LOGOUT_MS = parseInt(process.env.REACT_APP_IDLE_TIMEOUT_MS || '3600000', 10);

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionIdleMs, setSessionIdleMs] = useState(IDLE_LOGOUT_MS);
  /** Minutes of inactivity before the idle warning opens (converted to ms for the hook). */
  const [sessionWarnAfterIdleMs, setSessionWarnAfterIdleMs] = useState(60 * 1000);
  const [minPasswordLength, setMinPasswordLength] = useState(8);

  const applySecurityFromResponse = useCallback((security, user) => {
    const isStudent = user?.role === 'Student';
    let minutes;
    if (isStudent) {
      const s = Number(security?.student_session_timeout_minutes);
      const fallback = Number(security?.session_timeout_minutes);
      minutes = Number.isFinite(s) && s >= 1 ? s : fallback;
    } else {
      minutes = Number(security?.session_timeout_minutes);
    }
    const m = Number(minutes);
    if (Number.isFinite(m) && m >= 1) {
      const ms = m * 60 * 1000;
      setSessionIdleMs(ms);
      setStoredIdleMs(ms);
    } else {
      setSessionIdleMs(IDLE_LOGOUT_MS);
      setStoredIdleMs(IDLE_LOGOUT_MS);
    }

    // session_warning_minutes_left = minutes idle before the alert (not "time remaining").
    const warnAfterMins = Number(security?.session_warning_minutes_left);
    const timeoutMins = Number.isFinite(m) && m >= 1 ? m : Math.max(1, Math.round(IDLE_LOGOUT_MS / 60000));
    if (Number.isFinite(warnAfterMins) && warnAfterMins >= 1) {
      const capped = Math.min(warnAfterMins, Math.max(1, timeoutMins - 1));
      setSessionWarnAfterIdleMs(capped * 60 * 1000);
    } else {
      setSessionWarnAfterIdleMs(60 * 1000);
    }
    const minPw = Number(security?.min_password_length);
    if (Number.isFinite(minPw) && minPw >= 6) {
      setMinPasswordLength(minPw);
    }
  }, []);

  const checkUser = useCallback(async () => {
    try {
      // Closing a tab / phone browser does not clear localStorage. If the idle
      // window already elapsed, drop the leftover JWT before restoring session.
      if (expireClientSessionIfIdle(() => jwtAuth.removeToken())) {
        setUser(null);
        setSessionIdleMs(IDLE_LOGOUT_MS);
        setSessionWarnAfterIdleMs(60 * 1000);
        return;
      }

      if (jwtAuth.isAuthenticated()) {
        // Initial session boot uses AuthContext `loading`, not the global overlay.
        const response = await api.get('/user', { skipLoading: true });
        setUser(response.data.user);
        applySecurityFromResponse(response.data.security, response.data.user);
        touchSessionActivity();
      } else {
        setUser(null);
        setSessionIdleMs(IDLE_LOGOUT_MS);
        setSessionWarnAfterIdleMs(60 * 1000);
      }
    } catch (error) {
      setUser(null);
      setSessionIdleMs(IDLE_LOGOUT_MS);
      setSessionWarnAfterIdleMs(60 * 1000);
    } finally {
      setLoading(false);
    }
  }, [applySecurityFromResponse]);

  /** Soft re-fetch for tab focus / permission sync — never blocks the UI. */
  const refreshUser = useCallback(async () => {
    if (!jwtAuth.isAuthenticated()) {
      return;
    }
    try {
      const response = await api.get('/user', { silent: true, skipLoading: true });
      const nextUser = response.data?.user ?? null;
      applySecurityFromResponse(response.data?.security, nextUser);
      setUser((prev) => {
        if (!nextUser) return null;
        if (
          prev &&
          prev.user_id === nextUser.user_id &&
          prev.role === nextUser.role &&
          !!prev.must_change_password === !!nextUser.must_change_password &&
          JSON.stringify(prev.permissions || []) === JSON.stringify(nextUser.permissions || []) &&
          !!prev.is_admin === !!nextUser.is_admin &&
          (prev.avatar_url || null) === (nextUser.avatar_url || null) &&
          (prev.avatar_path || null) === (nextUser.avatar_path || null) &&
          (prev.display_name || null) === (nextUser.display_name || null)
        ) {
          return prev;
        }
        return nextUser;
      });
    } catch {
      // Keep existing session; idle logout / 401 handler will clear if needed.
    }
  }, [applySecurityFromResponse]);

  const refreshSessionPolicy = useCallback(async () => {
    if (!jwtAuth.isAuthenticated()) {
      return;
    }
    try {
      const response = await api.get('/user', { silent: true, skipLoading: true });
      applySecurityFromResponse(response.data?.security, response.data?.user);
    } catch {
      // ignore
    }
  }, [applySecurityFromResponse]);

  useEffect(() => {
    checkUser();
  }, [checkUser]);

  /**
   * @param {string} [reason='manual logout'] - written to login-session audit (manual / idle timeout / session expired)
   * @param {{ showLoading?: boolean }} [options]
   */
  const logout = useCallback(async (reason = 'manual logout', options = {}) => {
    const reasonText =
      typeof reason === 'string' && reason.trim() !== '' ? reason.trim() : 'manual logout';
    const showLoading = options.showLoading ?? reasonText === 'manual logout';
    try {
      await api.post(
        '/logout',
        { reason: reasonText },
        showLoading
          ? { showLoading: true, loadingMessage: 'Signing out…' }
          : { silent: true, skipLoading: true }
      );
    } catch {
      // still clear client session
    } finally {
      jwtAuth.removeToken();
      clearSessionActivity();
      setUser(null);
      setSessionIdleMs(IDLE_LOGOUT_MS);
      setSessionWarnAfterIdleMs(60 * 1000);
    }
  }, []);

  /** Replace the in-memory user (e.g. after forced password change). */
  const applyUser = useCallback((nextUser) => {
    setUser(nextUser || null);
  }, []);

  const login = async (email, password) => {
    try {
      const response = await api.post(
        '/login',
        {
          email,
          password,
          device_fingerprint: getOrCreateDeviceFingerprint(),
        },
        { showLoading: true, loadingMessage: 'Signing in…' }
      );

      if (response.data?.requires_device_otp) {
        return {
          success: false,
          requiresDeviceOtp: true,
          challengeToken: response.data.challenge_token,
          emailHint: response.data.email_hint,
          expiresIn: response.data.expires_in,
          message: response.data.message,
        };
      }

      // Store JWT token
      if (response.data.access_token) {
        jwtAuth.setToken(response.data.access_token);
      }

      setUser(response.data.user);
      applySecurityFromResponse(response.data.security, response.data.user);
      touchSessionActivity();
      return { success: true, data: response.data };
    } catch (error) {
      const data = error.response?.data;
      const fromErrors =
        (Array.isArray(data?.errors?.email) && data.errors.email[0]) ||
        (Array.isArray(data?.errors?.device_fingerprint) && data.errors.device_fingerprint[0]) ||
        (data?.errors && typeof data.errors === 'object' && Object.values(data.errors)[0]?.[0]);
      const status = error.response?.status;
      let msg =
        fromErrors ||
        data?.error ||
        data?.message ||
        error.message;
      if (status >= 500 || (!error.response && error.code === 'ERR_NETWORK')) {
        msg =
          process.env.NODE_ENV === 'production'
            ? 'Server error while signing in. The database may be empty or unavailable—try again shortly, or ask an admin to check Railway MySQL.'
            : 'Cannot reach the database or API. Make sure MySQL (XAMPP) and `php artisan serve` are running.';
      }
      return {
        success: false,
        error: msg,
      };
    }
  };

  const verifyDeviceOtp = async (challengeToken, otpCode) => {
    try {
      const response = await api.post(
        '/login/device-otp',
        {
          challenge_token: challengeToken,
          otp_code: otpCode,
          device_fingerprint: getOrCreateDeviceFingerprint(),
        },
        { showLoading: true, loadingMessage: 'Verifying device…' }
      );

      if (response.data.access_token) {
        jwtAuth.setToken(response.data.access_token);
      }
      setUser(response.data.user);
      applySecurityFromResponse(response.data.security, response.data.user);
      touchSessionActivity();
      return { success: true, data: response.data };
    } catch (error) {
      const data = error.response?.data;
      const fromErrors =
        (Array.isArray(data?.errors?.otp_code) && data.errors.otp_code[0]) ||
        (data?.errors && typeof data.errors === 'object' && Object.values(data.errors)[0]?.[0]);
      return {
        success: false,
        error: fromErrors || data?.error || data?.message || error.message || 'Verification failed',
      };
    }
  };

  const resendDeviceOtp = async (challengeToken) => {
    try {
      const response = await api.post(
        '/login/device-otp/resend',
        {
          challenge_token: challengeToken,
          device_fingerprint: getOrCreateDeviceFingerprint(),
        },
        { showLoading: true, loadingMessage: 'Sending new code…' }
      );
      return {
        success: true,
        challengeToken: response.data.challenge_token,
        emailHint: response.data.email_hint,
        expiresIn: response.data.expires_in,
        message: response.data.message,
      };
    } catch (error) {
      const data = error.response?.data;
      const fromErrors =
        (Array.isArray(data?.errors?.otp_code) && data.errors.otp_code[0]) ||
        (data?.errors && typeof data.errors === 'object' && Object.values(data.errors)[0]?.[0]);
      return {
        success: false,
        error: fromErrors || data?.error || data?.message || error.message || 'Could not resend code',
      };
    }
  };

  const hasPermission = (permissionName) => {
    if (!user || !permissionName) return false;
    if (user.is_admin) return true;
    const list = user.permissions;
    return Array.isArray(list) && list.includes(permissionName);
  };

  const hasAnyPermission = (permissionNames) => {
    if (!user || !Array.isArray(permissionNames) || permissionNames.length === 0) return false;
    if (user.is_admin) return true;
    const list = user.permissions;
    if (!Array.isArray(list)) return false;
    return permissionNames.some((name) => list.includes(name));
  };

  /**
   * True if the current role has any of these permission names in the DB (JWT /user payload).
   * Does not treat Admin as all-powerful — used so Admin Panel tabs match Role Settings checkboxes.
   */
  const hasAnyAssignedPermission = useCallback((permissionNames) => {
    if (!user || !Array.isArray(permissionNames) || permissionNames.length === 0) return false;
    const list = user.permissions;
    if (!Array.isArray(list)) return false;
    return permissionNames.some((name) => list.includes(name));
  }, [user]);

  /**
   * Sidebar / module visibility: admins see everything; others need at least one matching name
   * from the JWT permission list (role defaults + user overrides from User permissions).
   */
  const canAccessModule = useCallback(
    (permissionNames) => {
      if (!user) return false;
      if (user.is_admin) return true;
      return hasAnyAssignedPermission(permissionNames);
    },
    [user, hasAnyAssignedPermission]
  );

  const value = {
    user,
    loading,
    /** Idle timeout duration (ms) from security settings; used by SessionIdleController. */
    sessionIdleMs,
    /** How long idle (ms) before the warning modal opens. */
    sessionWarnAfterIdleMs,
    minPasswordLength,
    login,
    verifyDeviceOtp,
    resendDeviceOtp,
    logout,
    applyUser,
    /** Re-fetch /user (e.g. after admin updates your role permissions). */
    refreshUser,
    refreshSessionPolicy,
    isAuthenticated: !!user,
    isAdmin: user?.is_admin || false,
    isDean: user?.role === 'Dean' || false,
    isProgramHead: user?.role === 'Program Head' || false,
    isSecretary: user?.role === 'Secretary' || false,
    /** Adviser portal (legacy Evaluator role merged into Adviser). */
    isFaculty: user?.role === 'Adviser' || user?.role === 'Evaluator' || false,
    hasPermission,
    hasAnyPermission,
    hasAnyAssignedPermission,
    canAccessModule,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

