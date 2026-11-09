import api from '../api/axios';

const API_URL = '/roles';
const PERMISSIONS_URL = '/permissions';

export const roleService = {
  /**
   * Get all roles with permissions
   */
  async getRoles() {
    try {
      const response = await api.get(API_URL);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Get role statistics
   */
  async getRoleStatistics() {
    try {
      const response = await api.get(`${API_URL}/statistics`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Get single role
   */
  async getRole(id) {
    try {
      const response = await api.get(`${API_URL}/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Create new role
   */
  async createRole(roleData) {
    try {
      const response = await api.post(API_URL, roleData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Update role
   */
  async updateRole(id, roleData) {
    try {
      const response = await api.put(`${API_URL}/${id}`, roleData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Delete role
   */
  async deleteRole(id) {
    try {
      const response = await api.delete(`${API_URL}/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },
};

export const permissionService = {
  /**
   * Get all permissions
   */
  async getPermissions() {
    try {
      const response = await api.get(PERMISSIONS_URL);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Get permissions for a role
   */
  async getPermissionsForRole(roleId) {
    try {
      const response = await api.get(`${PERMISSIONS_URL}/for-role/${roleId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Create new permission
   */
  async createPermission(permissionData) {
    try {
      const response = await api.post(PERMISSIONS_URL, permissionData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Update permission
   */
  async updatePermission(id, permissionData) {
    try {
      const response = await api.put(`${PERMISSIONS_URL}/${id}`, permissionData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Delete permission
   */
  async deletePermission(id) {
    try {
      const response = await api.delete(`${PERMISSIONS_URL}/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Sync permissions for a role
   */
  async syncRolePermissions(roleId, permissionIds) {
    try {
      const response = await api.put(`${PERMISSIONS_URL}/sync-role/${roleId}`, {
        permission_ids: permissionIds,
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  async getPermissionsForUser(userId) {
    try {
      const response = await api.get(`${PERMISSIONS_URL}/for-user/${userId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  async syncUserPermissions(userId, permissionIds, evaluationYearLevelIds) {
    try {
      const body = { permission_ids: permissionIds };
      if (evaluationYearLevelIds !== undefined) {
        body.evaluation_year_level_ids = evaluationYearLevelIds;
      }
      const response = await api.put(`${PERMISSIONS_URL}/sync-user/${userId}`, body);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  async resetUserPermissionsToRole(userId) {
    try {
      const response = await api.post(`${PERMISSIONS_URL}/reset-user/${userId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Assign permission to role
   */
  async assignPermissionToRole(roleId, permissionId) {
    try {
      const response = await api.post(`${PERMISSIONS_URL}/assign`, {
        role_id: roleId,
        permission_id: permissionId,
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Remove permission from role
   */
  async removePermissionFromRole(roleId, permissionId) {
    try {
      const response = await api.delete(
        `${PERMISSIONS_URL}/role/${roleId}/permission/${permissionId}`
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },
};

export const userService = {
  async getUsers() {
    try {
      const response = await api.get('/users');
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },
};

const rbacService = { roleService, permissionService, userService };

export default rbacService;
