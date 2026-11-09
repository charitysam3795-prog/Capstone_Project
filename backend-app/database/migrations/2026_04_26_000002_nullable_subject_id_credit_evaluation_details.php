<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tbl_credit_evaluation_details', function (Blueprint $table) {
            $table->dropForeign(['subject_id']);
        });
        DB::statement('ALTER TABLE tbl_credit_evaluation_details MODIFY subject_id INT NULL');
        Schema::table('tbl_credit_evaluation_details', function (Blueprint $table) {
            $table->foreign('subject_id')->references('subject_id')->on('tbl_subjects')->nullOnDelete();
        });
    }

    public function down(): void
    {
        DB::table('tbl_credit_evaluation_details')->whereNull('subject_id')->delete();
        Schema::table('tbl_credit_evaluation_details', function (Blueprint $table) {
            $table->dropForeign(['subject_id']);
        });
        DB::statement('ALTER TABLE tbl_credit_evaluation_details MODIFY subject_id INT NOT NULL');
        Schema::table('tbl_credit_evaluation_details', function (Blueprint $table) {
            $table->foreign('subject_id')->references('subject_id')->on('tbl_subjects')->onDelete('cascade');
        });
    }
};
