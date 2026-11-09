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
        // Legacy migration previously restored the full database schema from an SQL dump.
        // The project has since been refactored to use dedicated, explicit migrations
        // that match the current ERD, so this migration is now intentionally a no-op.
        //
        // Keeping this file (with an empty up/down) avoids migration errors for
        // existing installations without re-importing the old schema.
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No-op: we no longer manage the old backup-based schema from this migration.
    }
};
