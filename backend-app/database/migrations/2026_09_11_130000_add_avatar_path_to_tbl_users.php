<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_users')) {
            return;
        }
        if (Schema::hasColumn('tbl_users', 'avatar_path')) {
            return;
        }

        Schema::table('tbl_users', function (Blueprint $table) {
            $table->string('avatar_path', 255)->nullable()->after('contact_number');
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('tbl_users') && Schema::hasColumn('tbl_users', 'avatar_path')) {
            Schema::table('tbl_users', function (Blueprint $table) {
                $table->dropColumn('avatar_path');
            });
        }
    }
};
