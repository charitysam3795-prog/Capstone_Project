<?php

namespace App\Services;

use App\Models\Permission;
use Illuminate\Support\Collection;

/**
 * Permissions hidden from the User permissions admin UI (dashboard / profile shells).
 * Portal merge still applies them implicitly; sync re-attaches when the role baseline includes them.
 */
final class UserPermissionUiExclusions
{
    /**
     * @return list<string>
     */
    public static function excludedPermissionNames(): array
    {
        return [
            'Admin Dashboard',
            'Faculty',
            'faculty.view',
            // Admin-only modules. Admin accounts have these intrinsically and are hidden from User permissions.
            'audit.view',
            'Audit Logs',
            'system.settings',
            'system.backup',
            'System Management',
            'test',
            'Test',
            // Lookup Data is managed from its own sidebar area; do not duplicate it in User permissions.
            'Lookup Data',
            'lookup.view',
            'lookup.manage',
            // Role lookup/table permissions are internal; keep only the Role Settings module visible.
            'roles.view',
            'roles.create',
            'roles.edit',
            'roles.delete',
            // Dean portal + high-impact academic approvals — not shown here; use Student Evaluation for grade/eval
            // workspace. Implicit merge (see implicitMergeIdsForRole) keeps Dean role baseline on custom saves.
            'dean.view',
            'dean.approve',
            'Evaluation Reports',
            'reports.view',
            'reports.generate',
            // Legacy subject module keys — managed via Lookup Data (subjects / lookup.subjects.*) instead.
            'subjects.view',
            'subjects.create',
            'subjects.edit',
            'subjects.delete',
        ];
    }

    /**
     * @return list<int>
     */
    public static function excludedPermissionIds(): array
    {
        return Permission::whereIn('permission_name', self::excludedPermissionNames())
            ->pluck('permission_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  Collection<int, \App\Models\Permission>  $permissions
     * @return Collection<int, \App\Models\Permission>
     */
    public static function filterVisible(Collection $permissions): Collection
    {
        $excluded = self::excludedPermissionNames();

        return $permissions->filter(fn ($p) => ! in_array($p->permission_name, $excluded, true))->values();
    }

    /**
     * Excluded permission IDs that this role’s portal baseline already includes — merged on every custom sync.
     *
     * @return list<int>
     */
    public static function implicitMergeIdsForRole(?string $roleName): array
    {
        $baselineNames = array_unique(array_merge(
            RbacPortalMerge::portalAlwaysVisiblePermissionNames($roleName),
            RbacPortalMerge::portalOptionalTabPermissionNames($roleName)
        ));
        $forceNames = array_values(array_intersect(self::excludedPermissionNames(), $baselineNames));
        if ($forceNames === []) {
            return [];
        }

        return Permission::whereIn('permission_name', $forceNames)
            ->pluck('permission_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }
}
