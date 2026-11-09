<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('tbl_app_setting');
    }

    public function down(): void
    {
        if (Schema::hasTable('tbl_app_setting')) {
            return;
        }

        Schema::create('tbl_app_setting', function (Blueprint $table) {
            $table->string('setting_key', 100)->primary();
            $table->text('setting_value')->nullable();
            $table->timestamp('updated_at')->nullable();
        });

        DB::table('tbl_app_setting')->insert([
            'setting_key' => 'inc_default_compliance_days',
            'setting_value' => '30',
            'updated_at' => now(),
        ]);
    }
};
