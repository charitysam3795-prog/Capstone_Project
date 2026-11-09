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
            Schema::create('tbl_security_settings', function (Blueprint $table) {
                $table->id('security_settings_id');
                $table->unsignedSmallInteger('max_password_length')->default(64);
                $table->unsignedSmallInteger('password_expiry_days')->default(90);
                $table->unsignedSmallInteger('session_timeout_minutes')->default(30);
                $table->unsignedTinyInteger('lockout_attempts')->default(5);
                $table->unsignedSmallInteger('lockout_duration_minutes')->default(15);
                $table->timestamps();
            });

            DB::table('tbl_security_settings')->insert([
                'max_password_length' => 64,
                'password_expiry_days' => 90,
                'session_timeout_minutes' => 30,
                'lockout_attempts' => 5,
                'lockout_duration_minutes' => 15,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tbl_security_settings');
    }
};
