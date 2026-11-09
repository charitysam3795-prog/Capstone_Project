<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (!Schema::hasColumn('tbl_student_profile', 'student_id_number')) {
                $table->string('student_id_number', 50)->nullable()->after('student_number');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_student_profile', 'student_id_number')) {
                $table->dropColumn('student_id_number');
            }
        });
    }
};

