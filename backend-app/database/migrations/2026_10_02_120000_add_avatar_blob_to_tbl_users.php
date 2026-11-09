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

        Schema::table('tbl_users', function (Blueprint $table) {
            if (! Schema::hasColumn('tbl_users', 'avatar_data')) {
                // Base64 JPEG/PNG (survives Railway ephemeral disk)
                $table->longText('avatar_data')->nullable()->after('avatar_path');
            }
            if (! Schema::hasColumn('tbl_users', 'avatar_mime')) {
                $table->string('avatar_mime', 64)->nullable()->after('avatar_data');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('tbl_users')) {
            return;
        }

        Schema::table('tbl_users', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_users', 'avatar_mime')) {
                $table->dropColumn('avatar_mime');
            }
            if (Schema::hasColumn('tbl_users', 'avatar_data')) {
                $table->dropColumn('avatar_data');
            }
        });
    }
};
