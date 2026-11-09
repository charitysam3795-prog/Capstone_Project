<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->integer('audit_logs_id', true)->primary();
            $table->integer('user_id');
            $table->string('actions', 255);
            $table->string('table_name', 100);
            $table->integer('record_id')->nullable();
            $table->text('old_value')->nullable();
            $table->text('new_value')->nullable();
            $table->timestamp('action_timestamp')->useCurrent();

            $table->foreign('user_id')->references('user_id')->on('tbl_users')->onDelete('cascade');
            $table->index(['table_name', 'record_id'], 'idx_table_record');
            $table->index('action_timestamp', 'idx_timestamp');
        });
    }

    public function down()
    {
        Schema::dropIfExists('audit_logs');
    }
};

