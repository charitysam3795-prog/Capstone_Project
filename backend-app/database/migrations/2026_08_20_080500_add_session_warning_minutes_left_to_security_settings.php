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

        if (! Schema::hasColumn('tbl_security_settings', 'session_warning_minutes_left')) {
            Schema::table('tbl_security_settings', function (Blueprint $table) {
                $table->unsignedSmallInteger('session_warning_minutes_left')
                    ->default(29)
                    ->after('student_session_timeout_minutes');
            });

            DB::table('tbl_security_settings')->update([
                'session_warning_minutes_left' => DB::raw('GREATEST(1, LEAST(session_timeout_minutes, COALESCE(student_session_timeout_minutes, session_timeout_minutes)) - 1)'),
            ]);
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('tbl_security_settings') && Schema::hasColumn('tbl_security_settings', 'session_warning_minutes_left')) {
            Schema::table('tbl_security_settings', function (Blueprint $table) {
                $table->dropColumn('session_warning_minutes_left');
            });
        }
    }
};
