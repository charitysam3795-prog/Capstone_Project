<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        // Create permissions table
        Schema::create('tbl_permission', function (Blueprint $table) {
            $table->integer('permission_id', true)->primary();
            $table->string('permission_name', 100);
            $table->text('description')->nullable();
            $table->unique('permission_name');
        });

        // Create role_permissions table
        Schema::create('tbl_role_permissions', function (Blueprint $table) {
            $table->integer('role_permission_id', true)->primary();
            $table->integer('role_id');
            $table->integer('permission_id');

            $table->foreign('role_id')->references('role_id')->on('tbl_roles')->onDelete('cascade');
            $table->foreign('permission_id')->references('permission_id')->on('tbl_permission')->onDelete('cascade');
            
            $table->unique(['role_id', 'permission_id']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('tbl_role_permissions');
        Schema::dropIfExists('tbl_permission');
    }
};

