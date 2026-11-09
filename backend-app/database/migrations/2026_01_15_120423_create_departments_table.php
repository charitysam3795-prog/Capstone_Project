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
        Schema::create('tbl_departments', function (Blueprint $table) {
            $table->integer('department_id', true)->primary();
            $table->string('department_name', 100);
            $table->string('department_code', 255);
            $table->timestamps = false; // No timestamps as per model
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tbl_departments');
    }
};
