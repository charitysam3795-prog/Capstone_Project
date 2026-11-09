<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_trusted_devices')) {
            Schema::create('tbl_trusted_devices', function (Blueprint $table) {
                $table->bigIncrements('trusted_device_id');
                $table->integer('user_id');
                $table->string('fingerprint_hash', 64);
                $table->string('device_label', 120)->nullable();
                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->timestamp('last_used_at')->nullable();
                $table->timestamp('trusted_at')->nullable();
                $table->timestamps();

                $table->unique(['user_id', 'fingerprint_hash'], 'uq_trusted_device_user_fp');
                $table->index('user_id', 'idx_trusted_device_user');
            });
        }

        if (! Schema::hasTable('tbl_device_login_challenges')) {
            Schema::create('tbl_device_login_challenges', function (Blueprint $table) {
                $table->bigIncrements('challenge_id');
                $table->integer('user_id');
                $table->string('challenge_token_hash', 64);
                $table->string('code_hash', 64);
                $table->string('fingerprint_hash', 64);
                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->unsignedTinyInteger('attempts')->default(0);
                $table->timestamp('expires_at');
                $table->timestamp('created_at')->nullable();

                $table->unique('challenge_token_hash', 'uq_device_challenge_token');
                $table->index(['user_id', 'fingerprint_hash'], 'idx_device_challenge_user_fp');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tbl_device_login_challenges');
        Schema::dropIfExists('tbl_trusted_devices');
    }
};
