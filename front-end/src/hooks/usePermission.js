import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Custom hook for checking user permissions in components.
 * Usage:
 *   const { hasPermission, hasAnyPermission, hasAllPermissions, isAdmin } = usePermission();
 *   
 *   if (hasPermission('users.create')) {
 *     // Show create button
 *   }
 */
export const usePermission = () => {
  const { user, isAdmin, hasPermission: contextHasPermission } = useAuth();

  /**
   * Check if user has a specific permission
   */
  const hasPermission = useCallback((permissionName) => {
    if (!user) return false;
    if (isAdmin) return true; // Admin has all permissions
    if (!permissionName) return false;
    
    return contextHasPermission(permissionName);
  }, [user, isAdmin, contextHasPermission]);

  /**
   * Check if user has any of the given permissions
   */
  const hasAnyPermission = useCallback((permissionNames) => {
    if (!Array.isArray(permissionNames)) return false;
    if (isAdmin) return true;
    if (!user || !user.permissions) return false;
    
    return permissionNames.some(permission => 
      user.permissions.includes(permission)
    );
  }, [user, isAdmin]);

  /**
   * Check if user has all of the given permissions
   */
  const hasAllPermissions = useCallback((permissionNames) => {
    if (!Array.isArray(permissionNames)) return false;
    if (isAdmin) return true;
    if (!user || !user.permissions) return false;
    
    return permissionNames.every(permission => 
      user.permissions.includes(permission)
    );
  }, [user, isAdmin]);

  /**
   * Check if user can perform action on a resource
   */
  const can = useCallback((action, resource) => {
    const permission = `${resource}.${action}`;
    return hasPermission(permission);
  }, [hasPermission]);

  /**
   * Get all user permissions
   */
  const getPermissions = useCallback(() => {
    if (!user) return [];
    if (isAdmin) return ['*']; // Admin wildcard
    return user.permissions || [];
  }, [user, isAdmin]);

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    can,
    getPermissions,
    isAdmin,
    user,
  };
};

/**
 * Component wrapper that conditionally renders based on permission
 * Usage:
 *   <PermissionGuard permission="users.create">
 *     <CreateUserButton />
 *   </PermissionGuard>
 */
export const PermissionGuard = ({ 
  permission, 
  permissions, 
  requireAll = false, 
  children, 
  fallback = null 
}) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isAdmin } = usePermission();

  // Admin bypass
  if (isAdmin) {
    return children;
  }

  let hasAccess = false;

  if (permission) {
    // Single permission check
    hasAccess = hasPermission(permission);
  } else if (permissions) {
    // Multiple permissions check
    if (requireAll) {
      hasAccess = hasAllPermissions(permissions);
    } else {
      hasAccess = hasAnyPermission(permissions);
    }
  }

  return hasAccess ? children : fallback;
};

/**
 * HOC for wrapping components with permission check
 * Usage:
 *   const ProtectedComponent = withPermission(EditUserButton, 'users.edit');
 */
export const withPermission = (WrappedComponent, permission) => {
  return function WithPermissionComponent(props) {
    const { hasPermission, isAdmin } = usePermission();

    if (!isAdmin && !hasPermission(permission)) {
      return null;
    }

    return <WrappedComponent {...props} />;
  };
};

export default usePermission;
