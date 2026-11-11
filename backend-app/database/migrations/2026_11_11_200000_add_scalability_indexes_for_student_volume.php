<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Indexes for list / analytics / import paths that filter or join on
 * student standing, program, campus, and evaluation history as volume grows.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->addIndexIfMissing('tbl_student_profile', 'sp_current_program_idx', ['Current_Program']);
        $this->addIndexIfMissing('tbl_student_profile', 'sp_year_level_idx', ['year_level_id']);
        $this->addIndexIfMissing('tbl_student_profile', 'sp_academic_status_idx', ['academic_status']);
        $this->addIndexIfMissing('tbl_student_profile', 'sp_academic_year_idx', ['academic_year_id']);
        if (Schema::hasColumn('tbl_student_profile', 'campus_id')) {
            $this->addIndexIfMissing('tbl_student_profile', 'sp_campus_id_idx', ['campus_id']);
        }
        if (Schema::hasColumn('tbl_student_profile', 'is_simulation')) {
            $this->addIndexIfMissing('tbl_student_profile', 'sp_is_simulation_idx', ['is_simulation']);
        }
        if (Schema::hasColumn('tbl_student_profile', 'student_id_number')) {
            $this->addIndexIfMissing('tbl_student_profile', 'sp_student_id_number_idx', ['student_id_number']);
        }

        if (Schema::hasTable('tbl_evaluation')) {
            $this->addIndexIfMissing('tbl_evaluation', 'eval_student_id_idx', ['student_id']);
            $this->addIndexIfMissing('tbl_evaluation', 'eval_student_subject_idx', ['student_id', 'subject_id']);
            $this->addIndexIfMissing('tbl_evaluation', 'eval_ay_sem_idx', ['academic_year_id', 'semester_id']);
        }

        if (Schema::hasTable('tbl_academic_record_evaluation_complete')) {
            $this->addIndexIfMissing(
                'tbl_academic_record_evaluation_complete',
                'arec_student_completed_idx',
                ['student_id', 'completed_at']
            );
        }

        if (Schema::hasTable('tbl_credit_evaluation_details')) {
            $this->addIndexIfMissing(
                'tbl_credit_evaluation_details',
                'ced_student_subject_idx',
                ['student_id', 'subject_id']
            );
        }
    }

    public function down(): void
    {
        $drops = [
            'tbl_student_profile' => [
                'sp_current_program_idx',
                'sp_year_level_idx',
                'sp_academic_status_idx',
                'sp_academic_year_idx',
                'sp_campus_id_idx',
                'sp_is_simulation_idx',
                'sp_student_id_number_idx',
            ],
            'tbl_evaluation' => [
                'eval_student_id_idx',
                'eval_student_subject_idx',
                'eval_ay_sem_idx',
            ],
            'tbl_academic_record_evaluation_complete' => [
                'arec_student_completed_idx',
            ],
            'tbl_credit_evaluation_details' => [
                'ced_student_subject_idx',
            ],
        ];

        foreach ($drops as $table => $indexes) {
            if (! Schema::hasTable($table)) {
                continue;
            }
            Schema::table($table, function (Blueprint $blueprint) use ($table, $indexes) {
                foreach ($indexes as $name) {
                    if ($this->indexExists($table, $name)) {
                        $blueprint->dropIndex($name);
                    }
                }
            });
        }
    }

    /**
     * @param  list<string>  $columns
     */
    private function addIndexIfMissing(string $table, string $name, array $columns): void
    {
        if (! Schema::hasTable($table) || $this->indexExists($table, $name)) {
            return;
        }

        // Skip when every column already participates in an identical index.
        if ($this->columnsAlreadyIndexed($table, $columns)) {
            return;
        }

        Schema::table($table, function (Blueprint $blueprint) use ($name, $columns) {
            $blueprint->index($columns, $name);
        });
    }

    /**
     * @param  list<string>  $columns
     */
    private function columnsAlreadyIndexed(string $table, array $columns): bool
    {
        $wanted = array_map('strtolower', $columns);
        $byKey = [];
        foreach (DB::select('SHOW INDEX FROM `'.$table.'`') as $row) {
            $key = (string) $row->Key_name;
            $seq = (int) $row->Seq_in_index;
            $byKey[$key][$seq] = strtolower((string) $row->Column_name);
        }
        foreach ($byKey as $cols) {
            ksort($cols);
            if (array_values($cols) === $wanted) {
                return true;
            }
        }

        return false;
    }

    private function indexExists(string $table, string $name): bool
    {
        foreach (DB::select('SHOW INDEX FROM `'.$table.'`') as $row) {
            if (strcasecmp((string) $row->Key_name, $name) === 0) {
                return true;
            }
        }

        return false;
    }
};
