<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_users')) {
            return;
        }

        Schema::table('tbl_users', function (Blueprint $table) {
            if (! Schema::hasColumn('tbl_users', 'failed_login_attempts')) {
                $table->unsignedTinyInteger('failed_login_attempts')->default(0);
            }
            if (! Schema::hasColumn('tbl_users', 'locked_until')) {
                $table->timestamp('locked_until')->nullable();
            }
            if (! Schema::hasColumn('tbl_users', 'password_changed_at')) {
                $table->timestamp('password_changed_at')->nullable();
            }
        });

        if (Schema::hasColumn('tbl_users', 'password_changed_at')) {
            DB::table('tbl_users')->whereNull('password_changed_at')->update([
                'password_changed_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('tbl_users')) {
            return;
        }

        Schema::table('tbl_users', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_users', 'failed_login_attempts')) {
                $table->dropColumn('failed_login_attempts');
            }
            if (Schema::hasColumn('tbl_users', 'locked_until')) {
                $table->dropColumn('locked_until');
            }
            if (Schema::hasColumn('tbl_users', 'password_changed_at')) {
                $table->dropColumn('password_changed_at');
            }
        });
    }
};
