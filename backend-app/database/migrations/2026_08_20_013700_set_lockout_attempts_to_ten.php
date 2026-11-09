<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_security_settings')) {
            return;
        }

        DB::table('tbl_security_settings')->update(['lockout_attempts' => 10]);
    }

    public function down(): void
    {
        if (! Schema::hasTable('tbl_security_settings')) {
            return;
        }

        DB::table('tbl_security_settings')->update(['lockout_attempts' => 5]);
    }
};
