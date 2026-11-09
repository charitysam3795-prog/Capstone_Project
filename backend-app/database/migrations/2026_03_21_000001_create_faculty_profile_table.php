<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('tbl_faculty_profile')) {
            return;
        }

        Schema::create('tbl_faculty_profile', function (Blueprint $table) {
            $table->integer('faculty_id', true);
            $table->integer('user_id');
            $table->string('first_name', 100)->nullable();
            $table->string('middle_name', 100)->nullable();
            $table->string('last_name', 100)->nullable();
            $table->string('employee_id', 100)->nullable();
            $table->integer('department_id')->nullable();
            $table->string('specialization', 255)->nullable();

            $table->timestamps(false);

            $table->foreign('user_id')->references('user_id')->on('tbl_users')->onDelete('cascade');
            $table->foreign('department_id')->references('department_id')->on('tbl_departments')->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tbl_faculty_profile');
    }
};

