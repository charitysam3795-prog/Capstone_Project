<?php

namespace App\Services;

/**
 * User permissions screen exposes the full editable module list for every non-admin user.
 * Returning null means no per-role UI scoping.
 */
class UserPermissionUiScope
{
    /**
     * @return list<string>|null  null = show all permissions
     */
    public static function scopedPermissionNames(?string $roleName): ?array
    {
        return null;
    }

    /**
     * For sync validation: null = any permission id allowed; non-null = only these ids may be assigned.
     *
     * @return list<int>|null
     */
    public static function allowedPermissionIdsForSync(?string $roleName): ?array
    {
        return null;
    }

}
