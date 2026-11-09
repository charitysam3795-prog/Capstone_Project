<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * session_warning_minutes_left originally meant "minutes remaining when warning opens"
 * (default timeout-1 → warn after 1 min). It now means "minutes idle before warning".
 * Convert rows that still look like the old default (timeout - 1) to idle-after = 1.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_security_settings')) {
            return;
        }
        if (! Schema::hasColumn('tbl_security_settings', 'session_warning_minutes_left')) {
            return;
        }

        DB::table('tbl_security_settings')
            ->whereColumn('session_warning_minutes_left', DB::raw('GREATEST(1, session_timeout_minutes - 1)'))
            ->update(['session_warning_minutes_left' => 1]);
    }

    public function down(): void
    {
        // Irreversible semantic change; leave values as-is.
    }
};
