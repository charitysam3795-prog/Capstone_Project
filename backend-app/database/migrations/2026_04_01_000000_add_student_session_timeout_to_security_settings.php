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

        if (! Schema::hasColumn('tbl_security_settings', 'student_session_timeout_minutes')) {
            Schema::table('tbl_security_settings', function (Blueprint $table) {
                $table->unsignedSmallInteger('student_session_timeout_minutes')
                    ->default(30)
                    ->after('session_timeout_minutes');
            });

            DB::table('tbl_security_settings')->update([
                'student_session_timeout_minutes' => DB::raw('session_timeout_minutes'),
            ]);
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('tbl_security_settings') && Schema::hasColumn('tbl_security_settings', 'student_session_timeout_minutes')) {
            Schema::table('tbl_security_settings', function (Blueprint $table) {
                $table->dropColumn('student_session_timeout_minutes');
            });
        }
    }
};
