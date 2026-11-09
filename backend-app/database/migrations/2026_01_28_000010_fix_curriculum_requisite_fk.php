<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $dbName = DB::getDatabaseName();

        $fk = DB::table('information_schema.KEY_COLUMN_USAGE')
            ->where('TABLE_SCHEMA', $dbName)
            ->where('TABLE_NAME', 'curriculum')
            ->where('COLUMN_NAME', 'requisite_id')
            ->whereNotNull('REFERENCED_TABLE_NAME')
            ->select('CONSTRAINT_NAME')
            ->first();

        if ($fk && !empty($fk->CONSTRAINT_NAME)) {
            try {
                DB::statement("ALTER TABLE `curriculum` DROP FOREIGN KEY `{$fk->CONSTRAINT_NAME}`");
            } catch (Throwable $e) {
                // ignore
            }
        }

        Schema::table('curriculum', function (Blueprint $table) {
            // Ensure we have an index name consistent with the FK name
            try {
                $table->dropIndex('fk_curriculum_requisite');
            } catch (Throwable $e) {
                // ignore
            }

            $table->index('requisite_id', 'fk_curriculum_requisite');

            $table->foreign('requisite_id', 'fk_curriculum_requisite')
                ->references('requisites_id')
                ->on('tbl_prerequisite')
                ->onDelete('set null');
        });
    }

    public function down(): void
    {
        $dbName = DB::getDatabaseName();

        $fk = DB::table('information_schema.KEY_COLUMN_USAGE')
            ->where('TABLE_SCHEMA', $dbName)
            ->where('TABLE_NAME', 'curriculum')
            ->where('COLUMN_NAME', 'requisite_id')
            ->whereNotNull('REFERENCED_TABLE_NAME')
            ->select('CONSTRAINT_NAME')
            ->first();

        if ($fk && !empty($fk->CONSTRAINT_NAME)) {
            try {
                DB::statement("ALTER TABLE `curriculum` DROP FOREIGN KEY `{$fk->CONSTRAINT_NAME}`");
            } catch (Throwable $e) {
                // ignore
            }
        }
    }
};
