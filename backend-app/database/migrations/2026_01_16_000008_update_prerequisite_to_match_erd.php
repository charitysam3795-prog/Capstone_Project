<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Drop existing table and recreate with new structure
        Schema::dropIfExists('tbl_prerequisite');
        
        Schema::create('tbl_prerequisite', function (Blueprint $table) {
            $table->integer('requisites_id', true)->primary();
            $table->integer('subject_id');
            $table->string('requisite_type', 50); // PREREQUISITE, COREQUISITE, etc.
            $table->integer('requisites_subject_id');
            
            $table->foreign('subject_id')->references('subject_id')->on('tbl_subjects')->onDelete('cascade');
            $table->foreign('requisites_subject_id')->references('subject_id')->on('tbl_subjects')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tbl_prerequisite');
        
        // Recreate old structure
        Schema::create('tbl_prerequisite', function (Blueprint $table) {
            $table->integer('prerequisite_id', true)->primary();
            $table->integer('subject_id');
            $table->integer('prereq_subject_id');
            
            $table->foreign('subject_id')->references('subject_id')->on('tbl_subjects')->onDelete('cascade');
            $table->foreign('prereq_subject_id')->references('subject_id')->on('tbl_subjects')->onDelete('cascade');
        });
    }
};

