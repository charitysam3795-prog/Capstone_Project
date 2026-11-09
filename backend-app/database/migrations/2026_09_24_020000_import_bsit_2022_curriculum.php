<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One-shot: rebuild BSIT Effective SY 2022-2023 from the official checklist
 * (removes test / ELE / MEE junk on that header).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_curriculum_header') || ! Schema::hasTable('curriculum')) {
            return;
        }

        $programId = DB::table('tbl_program')
            ->where('program_code', 'BSIT')
            ->orWhere('program_name', 'like', '%Information Technology%')
            ->orderBy('program_id')
            ->value('program_id');

        if (! $programId) {
            return;
        }

        $headerId = DB::table('tbl_curriculum_header')
            ->where('program_id', $programId)
            ->where('Effective_Year', 2022)
            ->orderByDesc('curriculum_header_id')
            ->value('curriculum_header_id');

        if (! $headerId) {
            // Still create/fill via import script.
            Artisan::call('curriculum:import-bsit-2022');

            return;
        }

        $rowCount = (int) DB::table('curriculum')->where('curriculum_header_id', $headerId)->count();
        $hasJunk = DB::table('curriculum as c')
            ->leftJoin('tbl_subjects as s', 's.subject_id', '=', 'c.subject_id')
            ->where('c.curriculum_header_id', $headerId)
            ->where(function ($q) {
                $q->whereRaw("REPLACE(UPPER(COALESCE(s.subject_code,'')), ' ', '') IN ('TEST','ELE119','MEE117')")
                    ->orWhere('s.subject_name', 'like', 'test%')
                    ->orWhere('s.subject_name', 'like', '%Industrial Electronics%')
                    ->orWhere('s.subject_name', 'like', '%Machine Design%');
            })
            ->exists();

        // Already fully imported (55 rows, no junk).
        if (! $hasJunk && $rowCount >= 50) {
            return;
        }

        Artisan::call('curriculum:import-bsit-2022');
    }

    public function down(): void
    {
        // Irreversible data sync — leave curriculum as-is.
    }
};
