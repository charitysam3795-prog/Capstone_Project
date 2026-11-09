<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('tbl_other_school_subjects', function (Blueprint $table) {
            $table->integer('other_subject_id', true)->primary();
            $table->integer('school_id');
            $table->string('subject_code', 50);
            $table->string('subject_name', 100);
            $table->integer('units')->nullable();
            $table->integer('hours')->nullable();
            $table->text('description')->nullable();

            $table->foreign('school_id')->references('school_id')->on('tbl_schools')->onDelete('cascade');
        });
    }

    public function down()
    {
        Schema::dropIfExists('tbl_other_school_subjects');
    }
};

