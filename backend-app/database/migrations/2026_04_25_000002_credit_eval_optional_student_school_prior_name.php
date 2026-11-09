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
            $table->dropForeign(['student_id']);
        });
        DB::statement('ALTER TABLE tbl_credit_evaluation_details MODIFY student_id INT NULL');
        Schema::table('tbl_credit_evaluation_details', function (Blueprint $table) {
            $table->foreign('student_id')->references('student_id')->on('tbl_student_profile')->nullOnDelete();
        });

        Schema::table('tbl_credit_evaluation', function (Blueprint $table) {
            $table->dropForeign(['student_id']);
            $table->dropForeign(['school_id']);
        });
        DB::statement('ALTER TABLE tbl_credit_evaluation MODIFY student_id INT NULL');
        DB::statement('ALTER TABLE tbl_credit_evaluation MODIFY school_id INT NULL');
        Schema::table('tbl_credit_evaluation', function (Blueprint $table) {
            $table->foreign('student_id')->references('student_id')->on('tbl_student_profile')->nullOnDelete();
            $table->foreign('school_id')->references('school_id')->on('tbl_schools')->nullOnDelete();
        });

        if (! Schema::hasColumn('tbl_credit_evaluation', 'prior_school_name')) {
            Schema::table('tbl_credit_evaluation', function (Blueprint $table) {
                $table->string('prior_school_name', 200)->nullable()->after('school_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('tbl_credit_evaluation', 'prior_school_name')) {
            Schema::table('tbl_credit_evaluation', function (Blueprint $table) {
                $table->dropColumn('prior_school_name');
            });
        }

        Schema::table('tbl_credit_evaluation_details', function (Blueprint $table) {
            $table->dropForeign(['student_id']);
        });
        DB::statement('ALTER TABLE tbl_credit_evaluation_details MODIFY student_id INT NOT NULL');
        Schema::table('tbl_credit_evaluation_details', function (Blueprint $table) {
            $table->foreign('student_id')->references('student_id')->on('tbl_student_profile')->onDelete('cascade');
        });

        Schema::table('tbl_credit_evaluation', function (Blueprint $table) {
            $table->dropForeign(['student_id']);
            $table->dropForeign(['school_id']);
        });
        DB::statement('ALTER TABLE tbl_credit_evaluation MODIFY student_id INT NOT NULL');
        DB::statement('ALTER TABLE tbl_credit_evaluation MODIFY school_id INT NOT NULL');
        Schema::table('tbl_credit_evaluation', function (Blueprint $table) {
            $table->foreign('student_id')->references('student_id')->on('tbl_student_profile')->onDelete('cascade');
            $table->foreign('school_id')->references('school_id')->on('tbl_schools')->onDelete('cascade');
        });
    }
};
