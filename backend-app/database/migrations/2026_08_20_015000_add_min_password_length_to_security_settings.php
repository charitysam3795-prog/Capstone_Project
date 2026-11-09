<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_security_settings')) {
            return;
        }

        if (! Schema::hasColumn('tbl_security_settings', 'min_password_length')) {
            Schema::table('tbl_security_settings', function (Blueprint $table) {
                $table->unsignedTinyInteger('min_password_length')->default(8)->after('max_password_length');
            });
        }

        DB::table('tbl_security_settings')->update(['min_password_length' => 8]);
    }

    public function down(): void
    {
        if (Schema::hasTable('tbl_security_settings') && Schema::hasColumn('tbl_security_settings', 'min_password_length')) {
            Schema::table('tbl_security_settings', function (Blueprint $table) {
                $table->dropColumn('min_password_length');
            });
        }
    }
};
