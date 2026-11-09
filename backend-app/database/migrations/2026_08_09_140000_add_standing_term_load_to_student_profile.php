<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Full Current-subjects term load for Regular/Irregular tracking:
 * standing year/sem, take keys, deferred keys, and prior OFFSEM/Semestral flags.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_student_profile')) {
            return;
        }

        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (! Schema::hasColumn('tbl_student_profile', 'standing_term_load')) {
                $table->json('standing_term_load')->nullable()->after('standing_deferred_keys');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('tbl_student_profile')) {
            return;
        }

        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_student_profile', 'standing_term_load')) {
                $table->dropColumn('standing_term_load');
            }
        });
    }
};
