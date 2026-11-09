<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tbl_permission', function (Blueprint $table) {
            if (!Schema::hasColumn('tbl_permission', 'category')) {
                $table->string('category', 100)->nullable()->after('permission_name');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tbl_permission', function (Blueprint $table) {
            $table->dropColumn('category');
        });
    }
};
