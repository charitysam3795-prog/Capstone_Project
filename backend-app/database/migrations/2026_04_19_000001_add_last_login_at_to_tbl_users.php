<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_users')) {
            return;
        }

        Schema::table('tbl_users', function (Blueprint $table) {
            if (! Schema::hasColumn('tbl_users', 'last_login_at')) {
                $table->timestamp('last_login_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('tbl_users')) {
            return;
        }

        Schema::table('tbl_users', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_users', 'last_login_at')) {
                $table->dropColumn('last_login_at');
            }
        });
    }
};
