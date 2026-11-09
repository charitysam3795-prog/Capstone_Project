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
                if (! Schema::hasColumn('tbl_users', 'program_id')) {
                    $table->integer('program_id')->nullable()->after('department_id');
                }
            });
        }

        if (Schema::hasTable('tbl_faculty_profile')) {
            Schema::table('tbl_faculty_profile', function (Blueprint $table) {
                if (! Schema::hasColumn('tbl_faculty_profile', 'program_id')) {
                    $table->integer('program_id')->nullable()->after('department_id');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('tbl_faculty_profile')) {
            Schema::table('tbl_faculty_profile', function (Blueprint $table) {
                if (Schema::hasColumn('tbl_faculty_profile', 'program_id')) {
                    $table->dropColumn('program_id');
                }
            });
        }

        if (Schema::hasTable('tbl_users')) {
            Schema::table('tbl_users', function (Blueprint $table) {
                if (Schema::hasColumn('tbl_users', 'program_id')) {
                    $table->dropColumn('program_id');
                }
            });
        }
    }
};
