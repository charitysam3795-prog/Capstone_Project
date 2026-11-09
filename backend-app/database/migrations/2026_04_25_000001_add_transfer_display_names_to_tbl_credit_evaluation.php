<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tbl_credit_evaluation', function (Blueprint $table) {
            $table->string('transfer_first_name', 120)->nullable()->after('remarks');
            $table->string('transfer_middle_name', 120)->nullable()->after('transfer_first_name');
            $table->string('transfer_last_name', 120)->nullable()->after('transfer_middle_name');
        });
    }

    public function down(): void
    {
        Schema::table('tbl_credit_evaluation', function (Blueprint $table) {
            $table->dropColumn(['transfer_first_name', 'transfer_middle_name', 'transfer_last_name']);
        });
    }
};
