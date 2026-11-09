<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_evaluation')) {
            return;
        }

        if (! Schema::hasColumn('tbl_evaluation', 'graded_under_program_id')) {
            Schema::table('tbl_evaluation', function (Blueprint $table) {
                $table->unsignedBigInteger('graded_under_program_id')->nullable()->after('subject_id');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('tbl_evaluation')) {
            return;
        }

        if (Schema::hasColumn('tbl_evaluation', 'graded_under_program_id')) {
            Schema::table('tbl_evaluation', function (Blueprint $table) {
                $table->dropColumn('graded_under_program_id');
            });
        }
    }
};
