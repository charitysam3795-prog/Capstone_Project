<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tbl_dean_profile', function (Blueprint $table) {
            if (! Schema::hasColumn('tbl_dean_profile', 'first_name')) {
                $table->string('first_name', 50)->nullable()->after('user_id');
            }
            if (! Schema::hasColumn('tbl_dean_profile', 'middle_name')) {
                $table->string('middle_name', 50)->nullable()->after('first_name');
            }
            if (! Schema::hasColumn('tbl_dean_profile', 'last_name')) {
                $table->string('last_name', 50)->nullable()->after('middle_name');
            }
            if (! Schema::hasColumn('tbl_dean_profile', 'employee_id')) {
                $table->string('employee_id', 50)->nullable()->after('last_name');
            }
            if (! Schema::hasColumn('tbl_dean_profile', 'specialization')) {
                $table->string('specialization', 255)->nullable()->after('employee_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tbl_dean_profile', function (Blueprint $table) {
            foreach (['specialization', 'employee_id', 'last_name', 'middle_name', 'first_name'] as $column) {
                if (Schema::hasColumn('tbl_dean_profile', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
