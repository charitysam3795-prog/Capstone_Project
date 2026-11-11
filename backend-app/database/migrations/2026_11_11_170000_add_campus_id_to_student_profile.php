<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // tbl_campus.campus_id is signed int(11); FK requires a matching type.
        if (! Schema::hasColumn('tbl_student_profile', 'campus_id')) {
            Schema::table('tbl_student_profile', function (Blueprint $table) {
                $table->integer('campus_id')->nullable()->after('academic_year_id');
            });
        } else {
            // Column may exist from a partial earlier run (unsigned, no FK).
            DB::statement('ALTER TABLE `tbl_student_profile` MODIFY `campus_id` INT NULL');
        }

        $fkExists = collect(DB::select(
            'SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND CONSTRAINT_TYPE = ?
               AND CONSTRAINT_NAME = ?',
            ['tbl_student_profile', 'FOREIGN KEY', 'tbl_student_profile_campus_id_foreign']
        ))->isNotEmpty();

        if (! $fkExists) {
            Schema::table('tbl_student_profile', function (Blueprint $table) {
                $table->foreign('campus_id')
                    ->references('campus_id')
                    ->on('tbl_campus')
                    ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_student_profile', 'campus_id')) {
                $table->dropForeign(['campus_id']);
                $table->dropColumn('campus_id');
            }
        });
    }
};
