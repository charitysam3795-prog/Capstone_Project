<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (! Schema::hasColumn('tbl_student_profile', 'promoted_next_sem_at')) {
                $table->timestamp('promoted_next_sem_at')->nullable()->after('track_id');
            }
            if (! Schema::hasColumn('tbl_student_profile', 'promoted_next_sem_by')) {
                $table->unsignedInteger('promoted_next_sem_by')->nullable()->after('promoted_next_sem_at');
            }
            if (! Schema::hasColumn('tbl_student_profile', 'promotion_evaluated_by')) {
                $table->string('promotion_evaluated_by', 150)->nullable()->after('promoted_next_sem_by');
            }
            if (! Schema::hasColumn('tbl_student_profile', 'promotion_target_year_level_id')) {
                $table->unsignedInteger('promotion_target_year_level_id')->nullable()->after('promotion_evaluated_by');
            }
            if (! Schema::hasColumn('tbl_student_profile', 'promotion_target_semester_id')) {
                $table->unsignedInteger('promotion_target_semester_id')->nullable()->after('promotion_target_year_level_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tbl_student_profile', function (Blueprint $table) {
            foreach (
                [
                    'promotion_target_semester_id',
                    'promotion_target_year_level_id',
                    'promotion_evaluated_by',
                    'promoted_next_sem_by',
                    'promoted_next_sem_at',
                ] as $col
            ) {
                if (Schema::hasColumn('tbl_student_profile', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
