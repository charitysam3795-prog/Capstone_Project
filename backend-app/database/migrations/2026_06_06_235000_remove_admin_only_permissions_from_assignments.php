<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $adminOnlyNames = [
            'audit.view',
            'system.settings',
            'system.backup',
            'System Management',
            'test',
            'Test',
        ];

        $permissionIds = DB::table('tbl_permission')
            ->whereIn('permission_name', $adminOnlyNames)
            ->pluck('permission_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        if ($permissionIds === []) {
            return;
        }

        DB::table('tbl_role_permissions')
            ->whereIn('permission_id', $permissionIds)
            ->delete();

        DB::table('tbl_user_permissions')
            ->whereIn('permission_id', $permissionIds)
            ->delete();
    }

    public function down(): void
    {
        // Intentionally irreversible: admin-only permissions should not be restored to roles/users.
    }
};
