<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('tbl_evaluation', function (Blueprint $table) {
            // Remove timestamps if they exist (since model has timestamps = false)
            if (Schema::hasColumn('tbl_evaluation', 'created_at')) {
                $table->dropTimestamps();
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tbl_evaluation', function (Blueprint $table) {
            // Re-add timestamps if needed
            if (!Schema::hasColumn('tbl_evaluation', 'created_at')) {
                $table->timestamps();
            }
        });
    }
};

