<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Allow free-text passing grades (e.g. "complete", custom values)
     * in addition to numeric thresholds like 50/60/70.
     */
    public function up(): void
    {
        try {
            DB::statement('ALTER TABLE curriculum MODIFY passing_grade VARCHAR(50) NULL');
        } catch (\Exception $e) {
            // Ignore if already VARCHAR or table differs in local envs.
        }
    }

    public function down(): void
    {
        try {
            DB::statement('ALTER TABLE curriculum MODIFY passing_grade INT NULL');
        } catch (\Exception $e) {
            // Ignore rollback failure.
        }
    }
};
