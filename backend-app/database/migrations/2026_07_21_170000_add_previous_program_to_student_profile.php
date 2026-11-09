<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (! Schema::hasColumn('tbl_student_profile', 'Previous_Program')) {
                $table->integer('Previous_Program')->nullable()->after('Current_Program');
            }
        });

        // Align type with tbl_program.program_id (INT in this schema).
        try {
            DB::statement('ALTER TABLE tbl_student_profile MODIFY Previous_Program INT NULL');
        } catch (\Exception $e) {
            // Ignore if already aligned.
        }

        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_student_profile', 'Previous_Program')) {
                try {
                    $table->foreign('Previous_Program')
                        ->references('program_id')
                        ->on('tbl_program')
                        ->onDelete('set null');
                } catch (\Exception $e) {
                    // FK may already exist.
                }
            }
        });
    }

    public function down(): void
    {
        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_student_profile', 'Previous_Program')) {
                try {
                    $table->dropForeign(['Previous_Program']);
                } catch (\Exception $e) {
                    // Ignore if missing.
                }
                $table->dropColumn('Previous_Program');
            }
        });
    }
};
