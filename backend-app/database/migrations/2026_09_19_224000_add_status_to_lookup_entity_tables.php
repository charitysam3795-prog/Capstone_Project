<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Soft enable/disable for Lookup Data entities (Activate / Deactivate in Admin UI).
 */
return new class extends Migration
{
    /** @var list<string> */
    private array $tables = [
        'tbl_program',
        'tbl_departments',
        'tbl_subjects',
        'year_level',
        'tbl_campus',
        'tbl_roles',
        'tbl_track',
        'tbl_curriculum_header',
        'tbl_elective_subject',
    ];

    public function up(): void
    {
        foreach ($this->tables as $table) {
            if (! Schema::hasTable($table) || Schema::hasColumn($table, 'status')) {
                continue;
            }
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->string('status', 20)->nullable()->default('active');
            });
            DB::table($table)->where(function ($q) {
                $q->whereNull('status')->orWhere('status', '');
            })->update(['status' => 'active']);
        }
    }

    public function down(): void
    {
        foreach ($this->tables as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'status')) {
                continue;
            }
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->dropColumn('status');
            });
        }
    }
};
