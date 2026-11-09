<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dean / Program Head prerogative: unlock specific major subjects when year-standing
 * units are short but lower-year majors are already OK.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_student_profile')) {
            return;
        }

        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (! Schema::hasColumn('tbl_student_profile', 'major_standing_override_keys')) {
                $table->json('major_standing_override_keys')->nullable()->after('standing_term_load');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('tbl_student_profile')) {
            return;
        }

        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_student_profile', 'major_standing_override_keys')) {
                $table->dropColumn('major_standing_override_keys');
            }
        });
    }
};
