<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('tbl_elective_slot', function (Blueprint $table) {
            $table->integer('elective_slot_id', true)->primary();
            $table->integer('program_id');
            $table->integer('semester_id');
            $table->integer('year_level_id');
            $table->string('slot_name', 100);
            $table->string('status', 50)->default('active');

            $table->foreign('program_id')->references('program_id')->on('tbl_program')->onDelete('cascade');
            $table->foreign('semester_id')->references('semester_id')->on('tbl_semester')->onDelete('cascade');
            $table->foreign('year_level_id')->references('year_level_id')->on('year_level')->onDelete('cascade');
        });
    }

    public function down()
    {
        Schema::dropIfExists('tbl_elective_slot');
    }
};

