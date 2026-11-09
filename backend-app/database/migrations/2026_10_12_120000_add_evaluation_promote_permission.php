<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * "Promote only" evaluation access: evaluation.promote without evaluation.create / edit.
     * Adviser role default becomes promote only; roles / custom users who can already edit grades
     * also get evaluation.promote so their access still reads as Full access.
     */
    public function up(): void
    {
        if (! Schema::hasTable('tbl_permission')) {
            return;
        }

        $promoteId = DB::table('tbl_permission')->where('permission_name', 'evaluation.promote')->value('permission_id');
        if (! $promoteId) {
            $row = [
                'permission_name' => 'evaluation.promote',
                'description' => 'Promote students to the next semester (no grade editing)',
            ];
            if (Schema::hasColumn('tbl_permission', 'category')) {
                $row['category'] = 'Student Evaluation';
            }
            $promoteId = DB::table('tbl_permission')->insertGetId($row);
        }
        $promoteId = (int) $promoteId;

        $gradeEditIds = DB::table('tbl_permission')
            ->whereIn('permission_name', ['evaluation.create', 'evaluation.edit', 'evaluation.approve'])
            ->pluck('permission_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        if (Schema::hasTable('tbl_role_permissions')) {
            $adviserRoleId = DB::table('tbl_roles')->where('role_name', 'Adviser')->value('role_id');
            if ($adviserRoleId) {
                $editOnlyIds = DB::table('tbl_permission')
                    ->whereIn('permission_name', ['evaluation.create', 'evaluation.edit'])
                    ->pluck('permission_id');
                DB::table('tbl_role_permissions')
                    ->where('role_id', $adviserRoleId)
                    ->whereIn('permission_id', $editOnlyIds)
                    ->delete();
            }

            $roleIds = DB::table('tbl_role_permissions')
                ->whereIn('permission_id', $gradeEditIds)
                ->distinct()
                ->pluck('role_id')
                ->map(fn ($id) => (int) $id)
                ->all();
            if ($adviserRoleId) {
                $roleIds[] = (int) $adviserRoleId;
            }
            foreach (array_unique($roleIds) as $roleId) {
                $exists = DB::table('tbl_role_permissions')
                    ->where('role_id', $roleId)
                    ->where('permission_id', $promoteId)
                    ->exists();
                if (! $exists) {
                    DB::table('tbl_role_permissions')->insert([
                        'role_id' => $roleId,
                        'permission_id' => $promoteId,
                    ]);
                }
            }
        }

        if (Schema::hasTable('tbl_user_permissions')) {
            $userIds = DB::table('tbl_user_permissions')
                ->whereIn('permission_id', $gradeEditIds)
                ->distinct()
                ->pluck('user_id')
                ->map(fn ($id) => (int) $id)
                ->all();
            foreach ($userIds as $userId) {
                $exists = DB::table('tbl_user_permissions')
                    ->where('user_id', $userId)
                    ->where('permission_id', $promoteId)
                    ->exists();
                if (! $exists) {
                    DB::table('tbl_user_permissions')->insert([
                        'user_id' => $userId,
                        'permission_id' => $promoteId,
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        $promoteId = DB::table('tbl_permission')->where('permission_name', 'evaluation.promote')->value('permission_id');
        if (! $promoteId) {
            return;
        }
        if (Schema::hasTable('tbl_user_permissions')) {
            DB::table('tbl_user_permissions')->where('permission_id', $promoteId)->delete();
        }
        if (Schema::hasTable('tbl_role_permissions')) {
            DB::table('tbl_role_permissions')->where('permission_id', $promoteId)->delete();
        }
        DB::table('tbl_permission')->where('permission_id', $promoteId)->delete();
    }
};
