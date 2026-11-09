<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('tbl_subject_equivalence', function (Blueprint $table) {
            $table->integer('equivalence_id', true)->primary();
            $table->integer('other_school_subject');
            $table->integer('subject_id');
            $table->integer('credited_units')->nullable();
            $table->string('credit_basis', 50)->nullable();
            $table->string('status', 50)->default('active');
            $table->text('remarks')->nullable();

            $table->foreign('other_school_subject')->references('other_subject_id')->on('tbl_other_school_subjects')->onDelete('cascade');
            $table->foreign('subject_id')->references('subject_id')->on('tbl_subjects')->onDelete('cascade');
        });
    }

    public function down()
    {
        Schema::dropIfExists('tbl_subject_equivalence');
    }
};

