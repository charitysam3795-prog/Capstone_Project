<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Import / Export is now granted only via its own permissions (data.import / data.export),
     * no longer implied by Student Management. Keep current access by granting the matching
     * permission to roles / custom users that previously got the page through those fallbacks.
     *
     * Curriculum headers now come with Curriculum Management → Full access.
     */
    public function up(): void
    {
        if (! Schema::hasTable('tbl_permission')) {
            return;
        }

        $id = fn (string $name) => DB::table('tbl_permission')->where('permission_name', $name)->value('permission_id');
        $ids = fn (array $names) => DB::table('tbl_permission')->whereIn('permission_name', $names)->pluck('permission_id')->map(fn ($v) => (int) $v)->all();

        $importId = $id('data.import');
        $exportId = $id('data.export');
        $dataIds = $ids(['Import / Export', 'data.import', 'data.export']);
        $importFallbackIds = $ids(['Student Management', 'students.create', 'students.enroll']);
        $exportFallbackIds = $ids(['students.view']);

        $headerIds = $ids(['lookup.curriculum_headers.view', 'lookup.curriculum_headers.manage']);
        $curriculumManagementId = $id('Curriculum Management');
        $curriculumCreateId = $id('curriculum.create');
        $curriculumEditId = $id('curriculum.edit');

        $skipRoleIds = DB::table('tbl_roles')
            ->whereIn('role_name', ['Student', 'Admin'])
            ->pluck('role_id')
            ->map(fn ($v) => (int) $v)
            ->all();

        $grant = function (string $table, string $ownerColumn, int $ownerId, array $permissionIds): void {
            foreach ($permissionIds as $pid) {
                if (! $pid) {
                    continue;
                }
                $exists = DB::table($table)
                    ->where($ownerColumn, $ownerId)
                    ->where('permission_id', $pid)
                    ->exists();
                if (! $exists) {
                    DB::table($table)->insert([$ownerColumn => $ownerId, 'permission_id' => (int) $pid]);
                }
            }
        };

        $migrateOwner = function (string $table, string $ownerColumn, int $ownerId, array $assigned) use (
            $grant, $dataIds, $importFallbackIds, $exportFallbackIds, $importId, $exportId,
            $headerIds, $curriculumManagementId, $curriculumCreateId, $curriculumEditId
        ): void {
            if (array_intersect($assigned, $dataIds) === []) {
                if (array_intersect($assigned, $importFallbackIds) !== []) {
                    $grant($table, $ownerColumn, $ownerId, [$importId, $exportId]);
                } elseif (array_intersect($assigned, $exportFallbackIds) !== []) {
                    $grant($table, $ownerColumn, $ownerId, [$exportId]);
                }
            }

            $curriculumFull = ($curriculumManagementId && in_array((int) $curriculumManagementId, $assigned, true))
                || ($curriculumCreateId && $curriculumEditId
                    && in_array((int) $curriculumCreateId, $assigned, true)
                    && in_array((int) $curriculumEditId, $assigned, true));
            if ($curriculumFull) {
                $grant($table, $ownerColumn, $ownerId, $headerIds);
            }
        };

        if (Schema::hasTable('tbl_role_permissions')) {
            $byRole = DB::table('tbl_role_permissions')->get(['role_id', 'permission_id'])->groupBy('role_id');
            foreach ($byRole as $roleId => $rows) {
                if (in_array((int) $roleId, $skipRoleIds, true)) {
                    continue;
                }
                $assigned = $rows->pluck('permission_id')->map(fn ($v) => (int) $v)->all();
                $migrateOwner('tbl_role_permissions', 'role_id', (int) $roleId, $assigned);
            }
        }

        if (Schema::hasTable('tbl_user_permissions')) {
            $skipUserIds = $skipRoleIds === [] ? [] : DB::table('tbl_users')
                ->whereIn('role_id', $skipRoleIds)
                ->pluck('user_id')
                ->map(fn ($v) => (int) $v)
                ->all();
            $byUser = DB::table('tbl_user_permissions')->get(['user_id', 'permission_id'])->groupBy('user_id');
            foreach ($byUser as $userId => $rows) {
                if (in_array((int) $userId, $skipUserIds, true)) {
                    continue;
                }
                $assigned = $rows->pluck('permission_id')->map(fn ($v) => (int) $v)->all();
                $migrateOwner('tbl_user_permissions', 'user_id', (int) $userId, $assigned);
            }
        }
    }

    public function down(): void
    {
        // Intentionally empty — adjust via User permissions.
    }
};
