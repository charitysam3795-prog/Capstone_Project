<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('tbl_users')) {
            Schema::table('tbl_users', function (Blueprint $table) {
                if (! Schema::hasColumn('tbl_users', 'evaluation_year_level_ids')) {
                    $table->json('evaluation_year_level_ids')->nullable()->after('use_custom_permissions');
                }
            });
        }
        if (Schema::hasTable('tbl_roles')) {
            Schema::table('tbl_roles', function (Blueprint $table) {
                if (! Schema::hasColumn('tbl_roles', 'evaluation_year_level_ids')) {
                    $table->json('evaluation_year_level_ids')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('tbl_users')) {
            Schema::table('tbl_users', function (Blueprint $table) {
                if (Schema::hasColumn('tbl_users', 'evaluation_year_level_ids')) {
                    $table->dropColumn('evaluation_year_level_ids');
                }
            });
        }
        if (Schema::hasTable('tbl_roles')) {
            Schema::table('tbl_roles', function (Blueprint $table) {
                if (Schema::hasColumn('tbl_roles', 'evaluation_year_level_ids')) {
                    $table->dropColumn('evaluation_year_level_ids');
                }
            });
        }
    }
};
