<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('tbl_credit_evaluation_details', function (Blueprint $table) {
            $table->integer('credit_detail_id', true)->primary();
            $table->integer('student_id');
            $table->integer('other_subject_id');
            $table->integer('subject_id');
            $table->integer('credited_units')->nullable();
            $table->string('credit_basis', 50)->nullable();
            $table->text('remarks')->nullable();

            $table->foreign('student_id')->references('student_id')->on('tbl_student_profile')->onDelete('cascade');
            $table->foreign('other_subject_id')->references('other_subject_id')->on('tbl_other_school_subjects')->onDelete('cascade');
            $table->foreign('subject_id')->references('subject_id')->on('tbl_subjects')->onDelete('cascade');
        });
    }

    public function down()
    {
        Schema::dropIfExists('tbl_credit_evaluation_details');
    }
};

