<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('tbl_evaluation', function (Blueprint $table) {
            $table->id('evaluation_id');
            $table->integer('student_id');
            $table->integer('subject_id');
            $table->integer('academic_year_id');
            $table->integer('semester_id');
            $table->string('grade')->nullable();
            $table->string('evaluation_status')->nullable();
            $table->date('enrolled_date')->nullable();
            $table->timestamps();

            // Foreign keys
            $table->foreign('student_id')->references('student_id')->on('tbl_student_profile')->onDelete('cascade');
            $table->foreign('subject_id')->references('subject_id')->on('tbl_subjects')->onDelete('cascade');
            $table->foreign('academic_year_id')->references('academic_year_id')->on('tbl_academic_year')->onDelete('cascade');
            $table->foreign('semester_id')->references('semester_id')->on('tbl_semester')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tbl_evaluation');
    }
};
