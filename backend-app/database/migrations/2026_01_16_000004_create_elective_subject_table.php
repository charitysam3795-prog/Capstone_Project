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
        Schema::create('tbl_elective_subject', function (Blueprint $table) {
            $table->integer('elective_subject_id', true)->primary();
            $table->integer('track_id')->nullable();
            $table->integer('subject_id');
            $table->string('description')->nullable();
            
            // Foreign key for track_id - only create if track_id is not null (handled by nullable)
            $table->foreign('track_id')->references('track_id')->on('tbl_track')->onDelete('cascade');
            $table->foreign('subject_id')->references('subject_id')->on('tbl_subjects')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tbl_elective_subject');
    }
};

