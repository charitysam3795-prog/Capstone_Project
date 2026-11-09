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
        Schema::create('tbl_dean_profile', function (Blueprint $table) {
            $table->id('dean_id');
            $table->integer('user_id');
            $table->integer('program_id');
            
            $table->foreign('user_id')->references('user_id')->on('tbl_users')->onDelete('cascade');
            $table->foreign('program_id')->references('program_id')->on('tbl_program')->onDelete('cascade');
            
            $table->timestamps = false; // No timestamps as per model
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tbl_dean_profile');
    }
};
