<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tbl_schools', function (Blueprint $table) {
            $table->boolean('is_transfer_placeholder')->default(false)->after('school_curriculum');
        });
    }

    public function down(): void
    {
        Schema::table('tbl_schools', function (Blueprint $table) {
            $table->dropColumn('is_transfer_placeholder');
        });
    }
};
