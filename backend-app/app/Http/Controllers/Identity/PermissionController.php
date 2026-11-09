<?php

namespace App\Http\Controllers\Identity;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\TblUser;
use App\Models\YearLevel;
use App\Services\RbacPortalMerge;
use App\Services\UserPermissionUiExclusions;
use App\Services\UserPermissionUiScope;
use Illuminate\Http\Request;

class PermissionController extends Controller
{
    public function index(Request $request)
    {
        try {
            if (! $request->user() || ! $request->user()->isAdmin()) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $permissions = Permission::with('roles')->get();

            return response()->json($permissions);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch permissions', 'message' => $e->getMessage()], 500);
        }
    }

    public function store(Request $request)
    {
        try {
            if (! $request->user() || ! $request->user()->isAdmin()) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $validated = $request->validate([
                'permission_name' => 'required|string|max:100',
                'category' => 'nullable|string|max:100',
                'description' => 'nullable|string',
            ]);

            $permission = Permission::create($validated);

            return response()->json($permission, 201);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to create permission', 'message' => $e->getMessage()], 500);
        }
    }

    public function update(Request $request, $id)
    {
        try {
            if (! $request->user() || ! $request->user()->isAdmin()) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $permission = Permission::findOrFail($id);

            $validated = $request->validate([
                'permission_name' => 'required|string|max:100',
                'category' => 'nullable|string|max:100',
                'description' => 'nullable|string',
            ]);

            $permission->update($validated);

            return response()->json($permission);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to update permission', 'message' => $e->getMessage()], 500);
        }
    }

    public function destroy(Request $request, $id)
    {
        try {
            if (! $request->user() || ! $request->user()->isAdmin()) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $permission = Permission::findOrFail($id);
            $permission->delete();

            return response()->json(['message' => 'Permission deleted successfully']);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to delete permission', 'message' => $e->getMessage()], 500);
        }
    }

    public function assignToRole(Request $request)
    {
        try {
            if (! $request->user() || ! $request->user()->isAdmin()) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $validated = $request->validate([
                'role_id' => 'required|exists:tbl_roles,role_id',
                'permission_id' => 'required|exists:tbl_permission,permission_id',
            ]);

            $exists = RolePermission::where('role_id', $validated['role_id'])
                ->where('permission_id', $validated['permission_id'])
                ->exists();

            if ($exists) {
                return response()->json(['message' => 'Permission already assigned to role'], 422);
            }

            $rolePermission = RolePermission::create($validated);

            return response()->json($rolePermission, 201);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to assign permission', 'message' => $e->getMessage()], 500);
        }
    }

    public function removeFromRole(Request $request, $roleId, $permissionId)
    {
        try {
            if (! $request->user() || ! $request->user()->isAdmin()) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $rolePermission = RolePermission::where('role_id', $roleId)
                ->where('permission_id', $permissionId)
                ->firstOrFail();

            $rolePermission->delete();

            return response()->json(['message' => 'Permission removed from role successfully']);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to remove permission', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Get all permissions (grouped by category) and which are assigned to the role.
     * For Role Settings UI: left panel = roles, right panel = checkboxes per permission.
     */
    public function forRole(Request $request, $roleId)
    {
        try {
            if (! $request->user() || ! $request->user()->isAdmin()) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $role = Role::find($roleId);
            if (! $role) {
                return response()->json(['message' => 'Role not found'], 404);
            }

            $permissions = Permission::orderBy('category')->orderBy('permission_name')->get();
            $assignedIds = RbacPortalMerge::mergedRoleAssignedIds($roleId, $role->role_name);

            $portalPanelIds = RbacPortalMerge::portalPanelPermissionIds($role->role_name);

            return response()->json([
                'permissions' => $permissions,
                'assigned_ids' => $assignedIds,
                'portal_panel_permission_ids' => $portalPanelIds,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch permissions for role', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Permissions UI payload for one user (custom overrides vs role defaults).
     */
    public function forUser(Request $request, $userId)
    {
        try {
            if (! $request->user() || ! $request->user()->isAdmin()) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $target = TblUser::with(['role', 'directPermissions'])->find($userId);
            if (! $target) {
                return response()->json(['message' => 'User not found'], 404);
            }

            $roleName = $target->role?->role_name;
            $allPermissions = Permission::orderBy('category')->orderBy('permission_name')->get();
            $scopedNames = UserPermissionUiScope::scopedPermissionNames($roleName);
            $permissionsUiScoped = $scopedNames !== null && ! $target->isAdmin();

            if ($target->isAdmin()) {
                $permissions = UserPermissionUiExclusions::filterVisible($allPermissions);
                $visibleIds = $permissions->pluck('permission_id')->map(fn ($id) => (int) $id)->all();
                $assignedIds = $visibleIds;
                $portalPanelIds = array_values(array_intersect(
                    RbacPortalMerge::portalPanelPermissionIds($roleName),
                    $visibleIds
                ));

                return response()->json([
                    'permissions' => $permissions,
                    'assigned_ids' => $assignedIds,
                    'portal_panel_permission_ids' => $portalPanelIds,
                    'use_custom_permissions' => false,
                    'permissions_read_only' => true,
                    'permissions_ui_scoped' => false,
                    'role_name' => $roleName,
                    'year_levels' => [],
                    'evaluation_year_level_ids_effective' => null,
                    'evaluation_year_level_ids_role' => null,
                    'evaluation_year_level_ids_user_override' => null,
                ]);
            }

            if ($permissionsUiScoped) {
                $permissions = $allPermissions
                    ->filter(fn ($p) => in_array($p->permission_name, $scopedNames, true))
                    ->values();
            } else {
                $permissions = $allPermissions;
            }

            $permissions = UserPermissionUiExclusions::filterVisible($permissions);
            $visibleIds = $permissions->pluck('permission_id')->map(fn ($id) => (int) $id)->all();

            if ((bool) ($target->use_custom_permissions ?? false)) {
                $assignedIds = $target->directPermissions
                    ->pluck('permission_id')
                    ->map(fn ($id) => (int) $id)
                    ->unique()
                    ->values()
                    ->all();
            } else {
                $assignedIds = RbacPortalMerge::mergedRoleAssignedIds($target->role_id, $roleName);
            }

            $assignedIds = array_values(array_intersect($assignedIds, $visibleIds));

            $portalPanelIds = array_values(array_intersect(
                RbacPortalMerge::portalPanelPermissionIds($roleName),
                $visibleIds
            ));

            $target->loadMissing('role');
            $yearLevels = YearLevel::query()
                ->orderBy('year_level_id')
                ->get(['year_level_id', 'year_level']);
            $roleYearIds = TblUser::normalizeYearLevelIdArray($target->role?->evaluation_year_level_ids ?? null);

            return response()->json([
                'permissions' => $permissions,
                'assigned_ids' => $assignedIds,
                'portal_panel_permission_ids' => $portalPanelIds,
                'use_custom_permissions' => (bool) ($target->use_custom_permissions ?? false),
                'permissions_read_only' => false,
                'permissions_ui_scoped' => $permissionsUiScoped,
                'role_name' => $roleName,
                'year_levels' => $yearLevels,
                'evaluation_year_level_ids_effective' => $target->effectiveEvaluationYearLevelIds(),
                'evaluation_year_level_ids_role' => $roleYearIds,
                'evaluation_year_level_ids_user_override' => $target->evaluation_year_level_ids,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch permissions for user', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Replace this user’s direct permission rows and enable custom overrides.
     */
    public function syncUser(Request $request, $userId)
    {
        try {
            if (! $request->user() || ! $request->user()->isAdmin()) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $target = TblUser::find($userId);
            if (! $target) {
                return response()->json(['message' => 'User not found'], 404);
            }
            if ($target->isAdmin()) {
                return response()->json(['message' => 'Admin accounts always have full access; permissions are not editable here.'], 422);
            }

            $validated = $request->validate([
                'permission_ids' => 'array',
                'permission_ids.*' => 'integer|exists:tbl_permission,permission_id',
                'evaluation_year_level_ids' => 'sometimes|nullable|array',
                'evaluation_year_level_ids.*' => 'integer|exists:year_level,year_level_id',
            ]);

            $permissionIds = array_values(array_unique(array_map('intval', $validated['permission_ids'] ?? [])));

            $stripIds = UserPermissionUiExclusions::excludedPermissionIds();
            $permissionIds = array_values(array_diff($permissionIds, $stripIds));

            $allowedScope = UserPermissionUiScope::allowedPermissionIdsForSync($target->role?->role_name);
            if ($allowedScope !== null) {
                foreach ($permissionIds as $pid) {
                    if (! in_array($pid, $allowedScope, true)) {
                        return response()->json([
                            'message' => 'One or more permissions are not allowed for this user\'s role.',
                        ], 422);
                    }
                }
            }

            $implicit = UserPermissionUiExclusions::implicitMergeIdsForRole($target->role?->role_name);
            $permissionIds = array_values(array_unique(array_merge($permissionIds, $implicit)));

            $target->directPermissions()->sync($permissionIds);
            $target->use_custom_permissions = true;

            if (array_key_exists('evaluation_year_level_ids', $validated)) {
                $target->loadMissing('role');
                $submitted = TblUser::normalizeYearLevelIdArray($validated['evaluation_year_level_ids']);
                $roleOnly = TblUser::normalizeYearLevelIdArray($target->role?->evaluation_year_level_ids ?? null);
                $sortedCopy = function (?array $ids): ?array {
                    if ($ids === null) {
                        return null;
                    }
                    $c = $ids;
                    sort($c);

                    return $c;
                };
                $catalogIds = YearLevel::query()
                    ->orderBy('year_level_id')
                    ->pluck('year_level_id')
                    ->map(fn ($id) => (int) $id)
                    ->values()
                    ->all();
                $catalogSorted = $catalogIds;
                sort($catalogSorted);
                $subSorted = $submitted === null ? [] : $submitted;
                sort($subSorted);
                $fullCatalogSelected = $catalogSorted !== [] && $subSorted === $catalogSorted;
                $matchesRole = $sortedCopy($submitted) === $sortedCopy($roleOnly);

                if ($matchesRole || ($fullCatalogSelected && $roleOnly === null)) {
                    $target->evaluation_year_level_ids = null;
                } else {
                    $target->evaluation_year_level_ids = $submitted;
                }
            }

            $target->save();

            return response()->json([
                'message' => 'User permissions updated successfully',
                'assigned_ids' => $permissionIds,
                'use_custom_permissions' => true,
                'evaluation_year_level_ids_effective' => $target->fresh(['role'])->effectiveEvaluationYearLevelIds(),
                'evaluation_year_level_ids_user_override' => $target->evaluation_year_level_ids,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to sync user permissions', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Clear direct assignments; user falls back to their role’s permissions.
     */
    public function resetUserToRole(Request $request, $userId)
    {
        try {
            if (! $request->user() || ! $request->user()->isAdmin()) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $target = TblUser::with(['role', 'directPermissions'])->find($userId);
            if (! $target) {
                return response()->json(['message' => 'User not found'], 404);
            }
            if ($target->isAdmin()) {
                return response()->json(['message' => 'Nothing to reset for admin accounts.'], 422);
            }

            $target->directPermissions()->detach();
            $target->use_custom_permissions = false;
            $target->evaluation_year_level_ids = null;
            $target->save();

            $roleName = $target->role?->role_name;
            $assignedIds = RbacPortalMerge::mergedRoleAssignedIds($target->role_id, $roleName);

            $assignedIds = array_values(array_diff($assignedIds, UserPermissionUiExclusions::excludedPermissionIds()));

            $allowedScope = UserPermissionUiScope::allowedPermissionIdsForSync($roleName);
            if ($allowedScope !== null) {
                $assignedIds = array_values(array_intersect($assignedIds, $allowedScope));
            }

            $target->loadMissing('role');

            return response()->json([
                'message' => 'User permissions reset to role defaults',
                'assigned_ids' => $assignedIds,
                'use_custom_permissions' => false,
                'evaluation_year_level_ids_effective' => $target->effectiveEvaluationYearLevelIds(),
                'evaluation_year_level_ids_role' => TblUser::normalizeYearLevelIdArray($target->role?->evaluation_year_level_ids ?? null),
                'evaluation_year_level_ids_user_override' => $target->evaluation_year_level_ids,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to reset user permissions', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Sync permissions for a role: replace current assignments with the given list.
     */
    public function syncRole(Request $request, $roleId)
    {
        try {
            if (! $request->user() || ! $request->user()->isAdmin()) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $validated = $request->validate([
                'permission_ids' => 'array',
                'permission_ids.*' => 'integer|exists:tbl_permission,permission_id',
            ]);

            $permissionIds = array_map('intval', $validated['permission_ids'] ?? []);

            RolePermission::where('role_id', $roleId)->delete();
            foreach ($permissionIds as $pid) {
                RolePermission::create(['role_id' => $roleId, 'permission_id' => $pid]);
            }

            return response()->json([
                'message' => 'Permissions updated successfully',
                'assigned_ids' => $permissionIds,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to sync permissions', 'message' => $e->getMessage()], 500);
        }
    }
}
