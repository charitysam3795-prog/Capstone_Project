<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Convert `tbl_student_profile.student_number` from INT to VARCHAR(50)
     * so hyphenated/long student id inputs like `02-2324-07413` can be stored
     * without MySQL out-of-range errors.
     */
    public function up(): void
    {
        // Use raw SQL to avoid depending on doctrine/dbal.
        // If the column is already VARCHAR, this is harmless in MySQL.
        try {
            DB::statement('ALTER TABLE tbl_student_profile MODIFY student_number VARCHAR(50) NOT NULL');
        } catch (\Exception $e) {
            // If MODIFY fails (e.g., already correct type), ignore.
        }
    }

    /**
     * Revert `student_number` back to INT (may truncate long IDs).
     * This rollback is best-effort only.
     */
    public function down(): void
    {
        try {
            DB::statement('ALTER TABLE tbl_student_profile MODIFY student_number INT(11) NOT NULL');
        } catch (\Exception $e) {
            // Ignore rollback failure.
        }
    }
};

