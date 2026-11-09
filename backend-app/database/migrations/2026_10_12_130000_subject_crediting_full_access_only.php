<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Subject crediting (credit_eval.*) belongs to Credit Evaluation → Full access only.
     * Strip it from the Adviser role default and from promote-only custom users.
     */
    public function up(): void
    {
        if (! Schema::hasTable('tbl_permission')) {
            return;
        }

        $creditIds = DB::table('tbl_permission')
            ->where(function ($q) {
                $q->where('permission_name', 'like', 'credit\_eval.%')
                    ->orWhere('permission_name', 'Credit Evaluation');
            })
            ->pluck('permission_id');
        if ($creditIds->isEmpty()) {
            return;
        }

        if (Schema::hasTable('tbl_role_permissions')) {
            $adviserRoleId = DB::table('tbl_roles')->where('role_name', 'Adviser')->value('role_id');
            if ($adviserRoleId) {
                DB::table('tbl_role_permissions')
                    ->where('role_id', $adviserRoleId)
                    ->whereIn('permission_id', $creditIds)
                    ->delete();
            }
        }

        if (! Schema::hasTable('tbl_user_permissions')) {
            return;
        }
        $promoteId = DB::table('tbl_permission')->where('permission_name', 'evaluation.promote')->value('permission_id');
        if (! $promoteId) {
            return;
        }
        $gradeEditIds = DB::table('tbl_permission')
            ->whereIn('permission_name', ['evaluation.create', 'evaluation.edit', 'evaluation.approve'])
            ->pluck('permission_id');

        $promoteOnlyUserIds = DB::table('tbl_user_permissions')
            ->where('permission_id', $promoteId)
            ->whereNotIn('user_id', DB::table('tbl_user_permissions')
                ->select('user_id')
                ->whereIn('permission_id', $gradeEditIds))
            ->pluck('user_id');

        if ($promoteOnlyUserIds->isNotEmpty()) {
            DB::table('tbl_user_permissions')
                ->whereIn('user_id', $promoteOnlyUserIds)
                ->whereIn('permission_id', $creditIds)
                ->delete();
        }
    }

    public function down(): void
    {
        // Intentionally empty — grant Subject crediting again via User permissions → Full access.
    }
};
