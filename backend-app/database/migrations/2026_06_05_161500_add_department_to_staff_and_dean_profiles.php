<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tbl_users', function (Blueprint $table) {
            if (! Schema::hasColumn('tbl_users', 'department_id')) {
                $table->integer('department_id')->nullable()->after('role_id');
            }
        });

        Schema::table('tbl_dean_profile', function (Blueprint $table) {
            if (! Schema::hasColumn('tbl_dean_profile', 'department_id')) {
                $table->integer('department_id')->nullable()->after('user_id');
            }
        });

        DB::table('tbl_dean_profile as dp')
            ->join('tbl_program as p', 'dp.program_id', '=', 'p.program_id')
            ->whereNull('dp.department_id')
            ->update(['dp.department_id' => DB::raw('p.department_id')]);

        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE tbl_dean_profile MODIFY program_id INT NULL');
        }
    }

    public function down(): void
    {
        Schema::table('tbl_dean_profile', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_dean_profile', 'department_id')) {
                $table->dropColumn('department_id');
            }
        });

        Schema::table('tbl_users', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_users', 'department_id')) {
                $table->dropColumn('department_id');
            }
        });
    }
};
