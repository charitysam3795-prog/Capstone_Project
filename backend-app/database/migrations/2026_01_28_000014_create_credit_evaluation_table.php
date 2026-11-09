<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('tbl_credit_evaluation', function (Blueprint $table) {
            $table->integer('credit_eval_id', true)->primary();
            $table->integer('student_id');
            $table->integer('school_id');
            $table->string('credit_type', 50);
            $table->integer('evaluated_by');
            $table->date('evaluation_date');
            $table->string('status', 50)->default('pending');
            $table->text('remarks')->nullable();

            $table->foreign('student_id')->references('student_id')->on('tbl_student_profile')->onDelete('cascade');
            $table->foreign('school_id')->references('school_id')->on('tbl_schools')->onDelete('cascade');
            $table->foreign('evaluated_by')->references('user_id')->on('tbl_users')->onDelete('cascade');
        });
    }

    public function down()
    {
        Schema::dropIfExists('tbl_credit_evaluation');
    }
};

