<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_student_profile') || ! Schema::hasColumn('tbl_student_profile', 'user_id')) {
            return;
        }

        Schema::table('tbl_student_profile', function (Blueprint $table) {
            $table->dropForeign('fk_student_user');
        });

        DB::statement('ALTER TABLE tbl_student_profile MODIFY user_id INT NULL');

        Schema::table('tbl_student_profile', function (Blueprint $table) {
            $table->foreign('user_id', 'fk_student_user')
                ->references('user_id')
                ->on('tbl_users')
                ->restrictOnDelete();
        });

        if (Schema::hasColumn('tbl_student_profile', 'is_simulation')) {
            $simUserIds = DB::table('tbl_student_profile')
                ->where('is_simulation', 1)
                ->whereNotNull('user_id')
                ->pluck('user_id')
                ->unique()
                ->filter()
                ->values();

            DB::table('tbl_student_profile')
                ->where('is_simulation', 1)
                ->update(['user_id' => null]);

            if ($simUserIds->isNotEmpty()) {
                DB::table('tbl_users')->whereIn('user_id', $simUserIds)->delete();
            }
        }

        DB::table('tbl_users')
            ->where('email', 'like', 'sim.dummy.%@simulation.local')
            ->delete();
    }

    public function down(): void
    {
        // Keep user_id nullable; restoring NOT NULL would break existing dummy rows.
    }
};
