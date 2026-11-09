import axios from 'axios';
import {
  beginRequestLoading,
  endRequestLoading,
  loadingMessageFor,
  shouldTrackRequestLoading,
} from './requestLoading';
import { findUnsafeInPayload } from '../utils/inputValidation';
import {
  emitNetworkOffline,
  emitNetworkRequestFailed,
  isAxiosNetworkError,
  isBrowserOnline,
} from '../utils/networkRecoverability';
import {
  clearSessionActivity,
  expireClientSessionIfIdle,
  touchSessionActivity,
} from '../utils/sessionActivity';

const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:8000/api');

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// JWT Token management
const getToken = () => localStorage.getItem('jwt_token');
const setToken = (token) => localStorage.setItem('jwt_token', token);
const removeToken = () => {
  localStorage.removeItem('jwt_token');
  clearSessionActivity();
};

// Add request interceptor to attach JWT token + block unsafe payload symbols
api.interceptors.request.use(
  (config) => {
    const url = String(config.url || '');
    const isAuthBootstrap =
      url.endsWith('/login') ||
      url.includes('/login/device-otp') ||
      url.includes('/forgot-password') ||
      url.includes('/reset-password') ||
      url.includes('/verify-email');

    // Hard stop leftover JWTs after idle (tab close / mobile suspend).
    // Reports logout reason to the session log before clearing the token.
    // Never block public auth endpoints — those must always be reachable.
    if (!isAuthBootstrap && getToken() && expireClientSessionIfIdle(removeToken, 'idle timeout')) {
      const err = new Error('Session expired due to inactivity.');
      err.isSessionIdleExpired = true;
      err.config = config;
      return Promise.reject(err);
    }

    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (config.data instanceof FormData) {
      // Let the browser set multipart boundary; default JSON content-type breaks uploads.
      if (config.headers && typeof config.headers.delete === 'function') {
        config.headers.delete('Content-Type');
      } else if (config.headers) {
        delete config.headers['Content-Type'];
        delete config.headers['content-type'];
      }
    }

    const method = String(config.method || 'get').toLowerCase();
    if (['post', 'put', 'patch'].includes(method) && config.data != null) {
      let payload = config.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          payload = null;
        }
      }
      if (payload && typeof payload === 'object' && !(payload instanceof FormData)) {
        const bad = findUnsafeInPayload(payload);
        if (bad) {
          const err = new Error(
            `Field "${bad}" contains unnecessary symbols that are not allowed.`,
          );
          err.isInputValidationError = true;
          err.config = config;
          return Promise.reject(err);
        }
      }
    }

    if (
      shouldTrackRequestLoading(config) &&
      !config.__trackLoading
    ) {
      config.__trackLoading = true;
      beginRequestLoading(loadingMessageFor(config));
    }

    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

function finishTrackedLoading(config) {
  if (config?.__trackLoading) {
    config.__trackLoading = false;
    endRequestLoading();
  }
}

/** One in-flight refresh so parallel 401s do not stampede /jwt/refresh. */
let jwtRefreshInFlight = null;

function refreshAccessToken(token) {
  if (!jwtRefreshInFlight) {
    jwtRefreshInFlight = axios
      .post(
        `${API_BASE_URL}/jwt/refresh`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      )
      .finally(() => {
        jwtRefreshInFlight = null;
      });
  }
  return jwtRefreshInFlight;
}

// User-facing API success extends the idle session. Silent polls / JWT refresh do not.
api.interceptors.response.use(
  (response) => {
    finishTrackedLoading(response.config);
    if (shouldTrackRequestLoading(response.config)) {
      window.dispatchEvent(new CustomEvent('app-activity'));
      touchSessionActivity();
    }
    return response;
  },
  async (error) => {
    const config = error.config;
    const status = error.response?.status;

    if (error?.isSessionIdleExpired) {
      finishTrackedLoading(config);
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    if (isAxiosNetworkError(error)) {
      if (!isBrowserOnline()) {
        emitNetworkOffline({ url: config?.url });
      } else {
        emitNetworkRequestFailed({ url: config?.url });
      }
    }

    // Do not end loading yet on 401 retry path — the retried call finishes it.
    const willRetryAuth =
      status === 401 &&
      config &&
      !config.silent &&
      !config._jwtRetry &&
      !(config.url || '').includes('/jwt/refresh') &&
      !(config.url || '').endsWith('/login') &&
      !!getToken();

    if (!willRetryAuth) {
      finishTrackedLoading(config);
    }

    if (status !== 401 || config?.silent) {
      return Promise.reject(error);
    }

    if (config._jwtRetry) {
      removeToken();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    const url = config.url || '';
    if (url.includes('/jwt/refresh') || url.endsWith('/login')) {
      removeToken();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // Do not silently mint a new JWT after the idle window already elapsed.
    if (expireClientSessionIfIdle(removeToken)) {
      finishTrackedLoading(config);
      window.location.href = '/login';
      return Promise.reject(error);
    }

    config._jwtRetry = true;

    try {
      const refreshRes = await refreshAccessToken(token);
      const newToken = refreshRes.data?.access_token;
      if (newToken) {
        setToken(newToken);
      }
      config.headers.Authorization = `Bearer ${newToken || token}`;
      return api(config);
    } catch (refreshErr) {
      finishTrackedLoading(config);
      removeToken();
      window.location.href = '/login';
      return Promise.reject(refreshErr);
    }
  }
);

export const jwtAuth = {
  getToken,
  setToken,
  removeToken,
  isAuthenticated: () => !!getToken(),
};

export default api;
