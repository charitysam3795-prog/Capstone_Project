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
        Schema::create('tbl_offered_subject', function (Blueprint $table) {
            $table->integer('offered_subject_id', true)->primary();
            $table->integer('subject_id');
            $table->integer('academic_year_id');
            $table->integer('semester_id');
            $table->integer('program_id');
            $table->integer('track_id')->nullable();
            $table->integer('year_level_id')->nullable();
            $table->string('status', 50)->nullable();
            
            $table->foreign('subject_id')->references('subject_id')->on('tbl_subjects')->onDelete('cascade');
            $table->foreign('academic_year_id')->references('academic_year_id')->on('tbl_academic_year')->onDelete('cascade');
            $table->foreign('semester_id')->references('semester_id')->on('tbl_semester')->onDelete('cascade');
            $table->foreign('program_id')->references('program_id')->on('tbl_program')->onDelete('cascade');
            $table->foreign('track_id')->references('track_id')->on('tbl_track')->onDelete('set null');
            $table->foreign('year_level_id')->references('year_level_id')->on('year_level')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tbl_offered_subject');
    }
};

