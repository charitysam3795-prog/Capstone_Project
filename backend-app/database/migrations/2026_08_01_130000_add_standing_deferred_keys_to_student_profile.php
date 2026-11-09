<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dean Current-subjects load plan: row keys deferred (dropped from this standing load).
 * Remaining eligible backlog + current-term subjects are the student's to-take set.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_student_profile')) {
            return;
        }

        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (! Schema::hasColumn('tbl_student_profile', 'standing_deferred_keys')) {
                $table->json('standing_deferred_keys')->nullable()->after('promotion_target_semester_id');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('tbl_student_profile')) {
            return;
        }

        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_student_profile', 'standing_deferred_keys')) {
                $table->dropColumn('standing_deferred_keys');
            }
        });
    }
};
