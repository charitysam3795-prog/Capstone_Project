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
        Schema::create('tbl_curriculum_header', function (Blueprint $table) {
            $table->integer('curriculum_header_id', true)->primary();
            $table->integer('program_id');
            $table->integer('Effective_Year');
            $table->string('description')->nullable();
            
            $table->foreign('program_id')->references('program_id')->on('tbl_program')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tbl_curriculum_header');
    }
};

