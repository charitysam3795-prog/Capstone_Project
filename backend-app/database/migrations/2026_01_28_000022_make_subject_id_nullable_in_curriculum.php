<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // First, drop the foreign key constraint on subject_id
        $dbName = DB::getDatabaseName();
        
        $fk = DB::table('information_schema.KEY_COLUMN_USAGE')
            ->where('TABLE_SCHEMA', $dbName)
            ->where('TABLE_NAME', 'curriculum')
            ->where('COLUMN_NAME', 'subject_id')
            ->whereNotNull('REFERENCED_TABLE_NAME')
            ->select('CONSTRAINT_NAME')
            ->first();

        if ($fk && !empty($fk->CONSTRAINT_NAME)) {
            try {
                DB::statement("ALTER TABLE `curriculum` DROP FOREIGN KEY `{$fk->CONSTRAINT_NAME}`");
            } catch (\Exception $e) {
                // Foreign key might not exist or already dropped
            }
        }

        // Make subject_id nullable
        Schema::table('curriculum', function (Blueprint $table) {
            $table->integer('subject_id')->nullable()->change();
        });

        // Re-add the foreign key constraint
        Schema::table('curriculum', function (Blueprint $table) {
            $table->foreign('subject_id')
                ->references('subject_id')
                ->on('tbl_subjects')
                ->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Drop the foreign key
        $dbName = DB::getDatabaseName();
        
        $fk = DB::table('information_schema.KEY_COLUMN_USAGE')
            ->where('TABLE_SCHEMA', $dbName)
            ->where('TABLE_NAME', 'curriculum')
            ->where('COLUMN_NAME', 'subject_id')
            ->whereNotNull('REFERENCED_TABLE_NAME')
            ->select('CONSTRAINT_NAME')
            ->first();

        if ($fk && !empty($fk->CONSTRAINT_NAME)) {
            try {
                DB::statement("ALTER TABLE `curriculum` DROP FOREIGN KEY `{$fk->CONSTRAINT_NAME}`");
            } catch (\Exception $e) {
                // Ignore
            }
        }

        // Make subject_id NOT NULL again (but first ensure no NULL values exist)
        DB::statement('UPDATE curriculum SET subject_id = 0 WHERE subject_id IS NULL');
        
        Schema::table('curriculum', function (Blueprint $table) {
            $table->integer('subject_id')->nullable(false)->change();
        });

        // Re-add the foreign key constraint
        Schema::table('curriculum', function (Blueprint $table) {
            $table->foreign('subject_id')
                ->references('subject_id')
                ->on('tbl_subjects')
                ->onDelete('cascade');
        });
    }
};

