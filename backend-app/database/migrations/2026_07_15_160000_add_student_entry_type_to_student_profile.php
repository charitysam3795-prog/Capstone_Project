<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Admission/entry classification set when creating a student account.
     * Distinct from academic_status (Regular / Irregular), which is computed from coursework.
     */
    public function up(): void
    {
        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (! Schema::hasColumn('tbl_student_profile', 'student_entry_type')) {
                $table->string('student_entry_type', 30)->nullable()->after('academic_status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_student_profile', 'student_entry_type')) {
                $table->dropColumn('student_entry_type');
            }
        });
    }
};
