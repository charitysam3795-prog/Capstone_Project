<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Remove prerequisite_id and corequisite_id columns from curriculum table if they exist
        Schema::table('curriculum', function (Blueprint $table) {
            // Check if columns exist before dropping them
            if (Schema::hasColumn('curriculum', 'prerequisite_id')) {
                $table->dropColumn('prerequisite_id');
            }
            if (Schema::hasColumn('curriculum', 'corequisite_id')) {
                $table->dropColumn('corequisite_id');
            }
        });
    }

    public function down(): void
    {
        // Add back the columns for rollback
        Schema::table('curriculum', function (Blueprint $table) {
            $table->integer('prerequisite_id')->nullable();
            $table->integer('corequisite_id')->nullable();
            
            
            $table->foreign('prerequisite_id')
                ->references('prerequisite_id')
                ->on('tbl_prerequisite')
                ->onDelete('set null');
                
            $table->foreign('corequisite_id')
                ->references('corequisite_id')
                ->on('tbl_corequisite')
                ->onDelete('set null');
        });
    }
};
