<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bind calendar academic year + curriculum year level + semester on the student
 * so standing (status tracking) can be stored and updated from SIS / promote / dean UI.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_student_profile')) {
            return;
        }

        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (! Schema::hasColumn('tbl_student_profile', 'semester_id')) {
                $table->unsignedBigInteger('semester_id')->nullable()->after('year_level_id');
            }
            if (! Schema::hasColumn('tbl_student_profile', 'academic_year_id')) {
                $table->unsignedBigInteger('academic_year_id')->nullable()->after('semester_id');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('tbl_student_profile')) {
            return;
        }

        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_student_profile', 'academic_year_id')) {
                $table->dropColumn('academic_year_id');
            }
            if (Schema::hasColumn('tbl_student_profile', 'semester_id')) {
                $table->dropColumn('semester_id');
            }
        });
    }
};
