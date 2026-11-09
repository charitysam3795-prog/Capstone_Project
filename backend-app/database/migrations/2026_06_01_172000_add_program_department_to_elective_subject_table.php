<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tbl_elective_subject', function (Blueprint $table) {
            if (!Schema::hasColumn('tbl_elective_subject', 'department_id')) {
                $table->integer('department_id')->nullable()->after('elective_subject_id');
            }

            if (!Schema::hasColumn('tbl_elective_subject', 'program_id')) {
                $table->integer('program_id')->nullable()->after('department_id');
            }
        });

        $itProgram = DB::table('tbl_program')
            ->where('program_code', 'like', '%IT%')
            ->orWhere('program_name', 'like', '%Information Technology%')
            ->first();

        if ($itProgram) {
            DB::table('tbl_elective_subject')
                ->whereNull('program_id')
                ->update([
                    'department_id' => $itProgram->department_id,
                    'program_id' => $itProgram->program_id,
                ]);
        }
    }

    public function down(): void
    {
        Schema::table('tbl_elective_subject', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_elective_subject', 'program_id')) {
                $table->dropColumn('program_id');
            }

            if (Schema::hasColumn('tbl_elective_subject', 'department_id')) {
                $table->dropColumn('department_id');
            }
        });
    }
};
