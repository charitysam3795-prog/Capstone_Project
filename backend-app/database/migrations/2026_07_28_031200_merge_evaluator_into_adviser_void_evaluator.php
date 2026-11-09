<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Merge Evaluator into Adviser and void the Evaluator role.
 *
 * - Reassign Evaluator users → Adviser
 * - Copy any Evaluator-only role_permissions onto Adviser
 * - Delete the Evaluator role (and its leftover role_permissions)
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_roles')) {
            return;
        }

        $evaluator = DB::table('tbl_roles')->where('role_name', 'Evaluator')->first();
        $adviser = DB::table('tbl_roles')->where('role_name', 'Adviser')->first();

        // No Evaluator role — nothing to void.
        if (! $evaluator) {
            return;
        }

        // Ensure an Adviser role exists (create from Evaluator if somehow missing).
        if (! $adviser) {
            DB::table('tbl_roles')
                ->where('role_id', $evaluator->role_id)
                ->update([
                    'role_name' => 'Adviser',
                    'description' => 'Adviser — student curriculum evaluation & guidance',
                ]);

            return;
        }

        $evaluatorId = (int) $evaluator->role_id;
        $adviserId = (int) $adviser->role_id;

        if ($evaluatorId === $adviserId) {
            return;
        }

        // Prefer the higher access level for the surviving Adviser role.
        $evaluatorLevel = $evaluator->access_level !== null ? (int) $evaluator->access_level : null;
        $adviserLevel = $adviser->access_level !== null ? (int) $adviser->access_level : null;
        $mergedLevel = max($evaluatorLevel ?? 0, $adviserLevel ?? 0) ?: ($adviserLevel ?? $evaluatorLevel);

        DB::table('tbl_roles')
            ->where('role_id', $adviserId)
            ->update([
                'access_level' => $mergedLevel,
                'description' => 'Adviser — student curriculum evaluation & guidance',
            ]);

        // Reassign all Evaluator users to Adviser.
        if (Schema::hasTable('tbl_users')) {
            DB::table('tbl_users')
                ->where('role_id', $evaluatorId)
                ->update(['role_id' => $adviserId]);
        }

        // Merge role_permissions: copy Evaluator grants Adviser does not already have.
        if (Schema::hasTable('tbl_role_permissions')) {
            $evaluatorPermIds = DB::table('tbl_role_permissions')
                ->where('role_id', $evaluatorId)
                ->pluck('permission_id')
                ->map(static fn ($id) => (int) $id)
                ->all();

            $adviserPermIds = DB::table('tbl_role_permissions')
                ->where('role_id', $adviserId)
                ->pluck('permission_id')
                ->map(static fn ($id) => (int) $id)
                ->flip()
                ->all();

            foreach ($evaluatorPermIds as $permissionId) {
                if (isset($adviserPermIds[$permissionId])) {
                    continue;
                }
                DB::table('tbl_role_permissions')->insert([
                    'role_id' => $adviserId,
                    'permission_id' => $permissionId,
                ]);
            }

            DB::table('tbl_role_permissions')->where('role_id', $evaluatorId)->delete();
        }

        // Void Evaluator role.
        DB::table('tbl_roles')->where('role_id', $evaluatorId)->delete();
    }

    public function down(): void
    {
        if (! Schema::hasTable('tbl_roles')) {
            return;
        }

        $exists = DB::table('tbl_roles')->where('role_name', 'Evaluator')->exists();
        if ($exists) {
            return;
        }

        DB::table('tbl_roles')->insert([
            'role_name' => 'Evaluator',
            'access_level' => 8,
            'description' => 'Evaluator — student curriculum evaluation (restored)',
        ]);
    }
};
