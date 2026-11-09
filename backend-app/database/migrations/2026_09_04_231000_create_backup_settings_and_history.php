<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_backup_settings')) {
            Schema::create('tbl_backup_settings', function (Blueprint $table) {
                $table->id();
                $table->boolean('enabled')->default(true);
                $table->string('schedule_type', 32)->default('daily');
                $table->string('backup_time', 8)->default('00:01');
                $table->string('storage_path', 500)->nullable();
                $table->timestamp('updated_at')->nullable();
            });

            DB::table('tbl_backup_settings')->insert([
                'enabled' => true,
                'schedule_type' => 'daily',
                'backup_time' => '00:01',
                'storage_path' => null,
                'updated_at' => now(),
            ]);
        }

        if (! Schema::hasTable('tbl_backup_history')) {
            Schema::create('tbl_backup_history', function (Blueprint $table) {
                $table->id();
                $table->string('action', 32); // backup | restore
                $table->string('trigger', 32); // manual | scheduled
                $table->string('status', 32); // running | success | failed
                $table->string('file_name', 255)->nullable();
                $table->string('file_path', 1000)->nullable();
                $table->unsignedBigInteger('file_size')->nullable();
                $table->text('details')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->timestamp('started_at')->nullable();
                $table->timestamp('finished_at')->nullable();
                $table->timestamps();

                $table->index(['action', 'status']);
                $table->index('started_at');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tbl_backup_history');
        Schema::dropIfExists('tbl_backup_settings');
    }
};
