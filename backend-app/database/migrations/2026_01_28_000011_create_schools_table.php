<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('tbl_schools', function (Blueprint $table) {
            $table->integer('school_id', true)->primary();
            $table->string('school_name');
            $table->text('school_program')->nullable();
            $table->text('school_curriculum')->nullable();
        });
    }

    public function down()
    {
        Schema::dropIfExists('tbl_schools');
    }
};

