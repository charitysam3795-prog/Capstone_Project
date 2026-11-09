<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_user_permissions')) {
            Schema::create('tbl_user_permissions', function (Blueprint $table) {
                $table->integer('user_permission_id', true)->primary();
                $table->integer('user_id');
                $table->integer('permission_id');
                $table->unique(['user_id', 'permission_id'], 'tbl_user_permissions_user_perm_unique');
                $table->foreign('user_id')->references('user_id')->on('tbl_users')->onDelete('cascade');
                $table->foreign('permission_id')->references('permission_id')->on('tbl_permission')->onDelete('cascade');
            });
        }

        if (Schema::hasTable('tbl_users') && ! Schema::hasColumn('tbl_users', 'use_custom_permissions')) {
            Schema::table('tbl_users', function (Blueprint $table) {
                $table->boolean('use_custom_permissions')->default(false);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('tbl_users') && Schema::hasColumn('tbl_users', 'use_custom_permissions')) {
            Schema::table('tbl_users', function (Blueprint $table) {
                $table->dropColumn('use_custom_permissions');
            });
        }
        Schema::dropIfExists('tbl_user_permissions');
    }
};
