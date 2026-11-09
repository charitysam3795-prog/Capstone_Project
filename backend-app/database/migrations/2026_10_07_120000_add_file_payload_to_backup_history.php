<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_backup_history') || Schema::hasColumn('tbl_backup_history', 'file_payload')) {
            return;
        }

        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            // Blueprint::binary() maps to BLOB (64 KB), too small for backup files.
            $after = Schema::hasColumn('tbl_backup_history', 'file_size') ? ' AFTER `file_size`' : '';
            DB::statement('ALTER TABLE `tbl_backup_history` ADD `file_payload` LONGBLOB NULL'.$after);

            return;
        }

        Schema::table('tbl_backup_history', function (Blueprint $table) {
            $table->binary('file_payload')->nullable();
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('tbl_backup_history')) {
            return;
        }

        Schema::table('tbl_backup_history', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_backup_history', 'file_payload')) {
                $table->dropColumn('file_payload');
            }
        });
    }
};
