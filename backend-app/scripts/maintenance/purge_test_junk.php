<?php

/**
 * One-off: find faculty XSS / <test><script> junk rows across lookup + students.
 * Run: php scripts/maintenance/purge_test_junk.php [--delete]
 */

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

require __DIR__ . '/../../vendor/autoload.php';
$app = require __DIR__ . '/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$doDelete = in_array('--delete', $argv ?? [], true);

$patterns = ['%<script%', '%<test>%', '%onerror=alert%', '%onload=alert%'];

function matchesJunk($value): bool
{
    $s = strtolower((string) $value);
    if ($s === '') {
        return false;
    }
    return str_contains($s, '<script')
        || str_contains($s, '<test>')
        || str_contains($s, 'onload=alert')
        || str_contains($s, 'onerror=alert')
        || str_contains($s, 'javascript:');
}

/**
 * @param  list<string>  $columns
 * @return list<object>
 */
function findJunkRows(string $table, string $pk, array $columns): array
{
    if (! Schema::hasTable($table)) {
        return [];
    }
    $cols = array_values(array_filter($columns, fn ($c) => Schema::hasColumn($table, $c)));
    if ($cols === []) {
        return [];
    }

    $rows = DB::table($table)->get(array_values(array_unique(array_merge([$pk], $cols))));
    $hits = [];
    foreach ($rows as $row) {
        foreach ($cols as $c) {
            if (matchesJunk($row->{$c} ?? null)) {
                $hits[] = $row;
                break;
            }
        }
    }

    return $hits;
}

$targets = [
    ['tbl_student_profile', 'student_id', ['first_name', 'last_name', 'middle_name', 'student_id_number']],
    ['tbl_program', 'program_id', ['program_name', 'program_code']],
    ['tbl_subjects', 'subject_id', ['subject_name', 'subject_code']],
    ['tbl_departments', 'department_id', ['department_name', 'department_code']],
    ['tbl_campus', 'campus_id', ['campus_name']],
    ['tbl_academic_year', 'academic_year_id', ['academic_year_name']],
    ['tbl_track', 'track_id', ['track_name', 'track_code']],
    ['tbl_users', 'user_id', ['first_name', 'last_name', 'email', 'username']],
    ['tbl_elective_slot', 'elective_slot_id', ['slot_name', 'description']],
    ['tbl_elective_subject', 'elective_subject_id', ['description']],
    ['tbl_semester', 'semester_id', ['semester_name']],
    ['year_level', 'year_level_id', ['year_level']],
    ['tbl_roles', 'role_id', ['role_name', 'description']],
    ['tbl_curriculum_header', 'curriculum_header_id', ['description']],
    ['tbl_section', 'section_id', ['section_name']],
];

$report = [];
foreach ($targets as [$table, $pk, $cols]) {
    $hits = findJunkRows($table, $pk, $cols);
    if ($hits === []) {
        continue;
    }
    $ids = array_map(fn ($r) => $r->{$pk}, $hits);
    $report[$table] = [
        'pk' => $pk,
        'ids' => $ids,
        'count' => count($ids),
        'samples' => array_slice(array_map(function ($r) use ($pk, $cols) {
            $out = [$pk => $r->{$pk}];
            foreach ($cols as $c) {
                if (isset($r->{$c})) {
                    $out[$c] = $r->{$c};
                }
            }
            return $out;
        }, $hits), 0, 5),
    ];
}

echo $doDelete ? "MODE: DELETE\n" : "MODE: DRY-RUN (pass --delete to purge)\n";
echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";

if (! $doDelete) {
    echo "\nNo rows deleted. Re-run with --delete to purge.\n";
    exit(0);
}

DB::beginTransaction();
try {
    // Students first (and related eval / profiles), then subjects/programs, etc.
    if (! empty($report['tbl_student_profile']['ids'])) {
        $sids = $report['tbl_student_profile']['ids'];
        foreach ([
            'tbl_evaluation' => 'student_id',
            'tbl_enrollments' => 'student_id',
            'tbl_credit_evaluation' => 'student_id',
            'tbl_credit_evaluation_details' => 'student_id',
            'tbl_academic_record_evaluation_complete' => 'student_id',
        ] as $t => $col) {
            if (Schema::hasTable($t) && Schema::hasColumn($t, $col)) {
                $n = DB::table($t)->whereIn($col, $sids)->delete();
                echo "Deleted {$n} from {$t}\n";
            }
        }
        // Null out user links then delete students
        if (Schema::hasColumn('tbl_student_profile', 'user_id')) {
            $userIds = DB::table('tbl_student_profile')->whereIn('student_id', $sids)->whereNotNull('user_id')->pluck('user_id')->all();
        } else {
            $userIds = [];
        }
        $n = DB::table('tbl_student_profile')->whereIn('student_id', $sids)->delete();
        echo "Deleted {$n} junk student profile(s)\n";
        // Also delete orphan junk users from the student set or junk-name users
    }

    if (! empty($report['tbl_users']['ids'])) {
        $uids = $report['tbl_users']['ids'];
        foreach (['tbl_faculty_profile', 'tbl_dean_profile', 'tbl_user_permissions', 'user_session_logs'] as $t) {
            if (! Schema::hasTable($t)) {
                continue;
            }
            $col = Schema::hasColumn($t, 'user_id') ? 'user_id' : null;
            if ($col) {
                $n = DB::table($t)->whereIn($col, $uids)->delete();
                echo "Deleted {$n} from {$t}\n";
            }
        }
        $n = DB::table('tbl_users')->whereIn('user_id', $uids)->delete();
        echo "Deleted {$n} junk user(s)\n";
    }

    // Curriculum / offerings referencing junk subjects or programs
    if (! empty($report['tbl_subjects']['ids'])) {
        $subIds = $report['tbl_subjects']['ids'];
        foreach ([
            ['curriculum', 'subject_id'],
            ['tbl_evaluation', 'subject_id'],
            ['tbl_offered_subject', 'subject_id'],
            ['tbl_elective_subject', 'subject_id'],
            ['tbl_prerequisite', 'subject_id'],
            ['tbl_prerequisite', 'requisites_subject_id'],
            ['tbl_credit_evaluation_details', 'subject_id'],
            ['tbl_subject_equivalence', 'local_subject_id'],
            ['tbl_subject_equivalence', 'other_subject_id'],
        ] as [$t, $col]) {
            if (Schema::hasTable($t) && Schema::hasColumn($t, $col)) {
                $n = DB::table($t)->whereIn($col, $subIds)->delete();
                echo "Deleted {$n} from {$t}.{$col} (junk subjects)\n";
            }
        }
        $n = DB::table('tbl_subjects')->whereIn('subject_id', $subIds)->delete();
        echo "Deleted {$n} junk subject(s)\n";
    }

    if (! empty($report['tbl_program']['ids'])) {
        $pids = $report['tbl_program']['ids'];
        // Headers for junk programs
        if (Schema::hasTable('tbl_curriculum_header')) {
            $hids = DB::table('tbl_curriculum_header')->whereIn('program_id', $pids)->pluck('curriculum_header_id')->all();
            if ($hids && Schema::hasTable('curriculum') && Schema::hasColumn('curriculum', 'curriculum_header_id')) {
                $n = DB::table('curriculum')->whereIn('curriculum_header_id', $hids)->delete();
                echo "Deleted {$n} curriculum rows for junk program headers\n";
            }
            $n = DB::table('tbl_curriculum_header')->whereIn('program_id', $pids)->delete();
            echo "Deleted {$n} curriculum header(s) for junk programs\n";
        }
        foreach ([
            ['curriculum', 'program_id'],
            ['tbl_elective_slot', 'program_id'],
            ['tbl_elective_subject', 'program_id'],
            ['tbl_offered_subject', 'program_id'],
            ['tbl_track', 'program_id'],
            ['tbl_student_profile', 'program_id'],
        ] as [$t, $col]) {
            if (Schema::hasTable($t) && Schema::hasColumn($t, $col)) {
                // Don't mass-delete remaining real students by program — only null where safe
                if ($t === 'tbl_student_profile') {
                    continue;
                }
                $n = DB::table($t)->whereIn($col, $pids)->delete();
                echo "Deleted {$n} from {$t}.{$col} (junk programs)\n";
            }
        }
        $n = DB::table('tbl_program')->whereIn('program_id', $pids)->delete();
        echo "Deleted {$n} junk program(s)\n";
    }

    foreach ([
        'tbl_departments' => 'department_id',
        'tbl_campus' => 'campus_id',
        'tbl_academic_year' => 'academic_year_id',
        'tbl_track' => 'track_id',
        'tbl_elective_slot' => 'elective_slot_id',
        'tbl_elective_subject' => 'elective_subject_id',
        'tbl_semester' => 'semester_id',
        'year_level' => 'year_level_id',
        'tbl_roles' => 'role_id',
        'tbl_curriculum_header' => 'curriculum_header_id',
        'tbl_section' => 'section_id',
    ] as $table => $pk) {
        if (empty($report[$table]['ids'])) {
            continue;
        }
        $ids = $report[$table]['ids'];
        // Soft-clear common FKs for academic year / track before delete
        if ($table === 'tbl_academic_year') {
            foreach (['tbl_curriculum_header', 'tbl_offered_subject', 'tbl_evaluation', 'tbl_enrollments', 'tbl_student_profile'] as $t) {
                if (Schema::hasTable($t) && Schema::hasColumn($t, 'academic_year_id')) {
                    // Null where nullable; otherwise leave and skip delete if still linked
                    try {
                        DB::table($t)->whereIn('academic_year_id', $ids)->update(['academic_year_id' => null]);
                    } catch (Throwable $e) {
                        // ignore
                    }
                }
            }
        }
        if ($table === 'tbl_elective_slot') {
            if (Schema::hasTable('tbl_elective_subject')) {
                DB::table('tbl_elective_subject')->whereIn('elective_slot_id', $ids)->delete();
            }
            if (Schema::hasTable('curriculum') && Schema::hasColumn('curriculum', 'elective_slot_id')) {
                DB::table('curriculum')->whereIn('elective_slot_id', $ids)->delete();
            }
        }
        try {
            $n = DB::table($table)->whereIn($pk, $ids)->delete();
            echo "Deleted {$n} from {$table}\n";
        } catch (Throwable $e) {
            echo "SKIP {$table}: ".$e->getMessage()."\n";
        }
    }

    DB::commit();
    echo "\nPurge committed.\n";
} catch (Throwable $e) {
    DB::rollBack();
    fwrite(STDERR, 'FAILED: '.$e->getMessage()."\n");
    exit(1);
}
