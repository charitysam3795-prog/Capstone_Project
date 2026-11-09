<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_session_logs', function (Blueprint $table) {
            $table->bigIncrements('session_log_id');
            $table->integer('user_id')->nullable();
            $table->string('email', 255)->nullable();
            $table->string('status', 30)->default('success');
            $table->string('failure_reason', 255)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->string('browser', 80)->nullable();
            $table->string('platform', 80)->nullable();
            $table->string('device', 80)->nullable();
            $table->string('token_hash', 64)->nullable();
            $table->timestamp('login_at')->nullable();
            $table->timestamp('logout_at')->nullable();
            $table->string('logout_reason', 80)->nullable();
            $table->timestamps();

            $table->foreign('user_id')->references('user_id')->on('tbl_users')->nullOnDelete();
            $table->index(['user_id', 'login_at'], 'idx_session_user_login');
            $table->index('token_hash', 'idx_session_token_hash');
            $table->index('ip_address', 'idx_session_ip_address');
            $table->index('status', 'idx_session_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_session_logs');
    }
};
