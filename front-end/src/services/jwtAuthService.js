import api, { jwtAuth } from '../api/axios';

/**
 * JWT helpers aligned with main auth: POST /login, /logout, /user, POST /jwt/refresh.
 */
export const jwtAuthService = {
  async login(email, password) {
    const response = await api.post('/login', { email, password });
    if (response.data.access_token) {
      jwtAuth.setToken(response.data.access_token);
    }
    return response.data;
  },

  async register() {
    throw new Error('Public registration is disabled. Create users in Admin → User Management.');
  },

  async logout() {
    try {
      await api.post('/logout');
    } finally {
      jwtAuth.removeToken();
    }
  },

  async getCurrentUser() {
    const response = await api.get('/user');
    return response.data.user;
  },

  async refreshToken() {
    const response = await api.post('/jwt/refresh');
    if (response.data.access_token) {
      jwtAuth.setToken(response.data.access_token);
    }
    return response.data;
  },

  isAuthenticated() {
    return jwtAuth.isAuthenticated();
  },

  getToken() {
    return jwtAuth.getToken();
  },

  removeToken() {
    jwtAuth.removeToken();
  },
};

export default jwtAuthService;
