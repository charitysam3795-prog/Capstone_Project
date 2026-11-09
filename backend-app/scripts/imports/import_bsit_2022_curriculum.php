<?php

declare(strict_types=1);

/**
 * Replace BSIT Effective SY 2022-2023 curriculum (CMO No. 25 S. 2015 checklist).
 * Clears junk/test rows on that header and rebuilds Y1–Y4 + IT elective slots.
 *
 * Usage: php scripts/imports/import_bsit_2022_curriculum.php
 */

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

require __DIR__.'/../../vendor/autoload.php';

$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$normalizeCode = static fn (string $code): string => strtoupper(str_replace(' ', '', trim($code)));

$findSubject = static function (string $code) use ($normalizeCode) {
    return DB::table('tbl_subjects')
        ->whereRaw("REPLACE(UPPER(subject_code), ' ', '') = ?", [$normalizeCode($code)])
        ->first();
};

$ensureSubject = static function (string $code, string $name, int $units, int $hours) use ($findSubject): object {
    $existing = $findSubject($code);
    if ($existing) {
        DB::table('tbl_subjects')->where('subject_id', $existing->subject_id)->update([
            'subject_code' => $code,
            'subject_name' => $name,
            'number_of_units' => $units,
            'number_of_hrs' => $hours,
        ]);

        return DB::table('tbl_subjects')->where('subject_id', $existing->subject_id)->first();
    }

    $id = DB::table('tbl_subjects')->insertGetId([
        'subject_code' => $code,
        'subject_name' => $name,
        'number_of_units' => $units,
        'number_of_hrs' => $hours,
    ]);

    return DB::table('tbl_subjects')->where('subject_id', $id)->first();
};

/**
 * Prefer canonical BSIT track codes (SYS DEV / CYBER / BI / DA).
 * Merges legacy aliases (SD, CS, …) into the preferred row so promote UI
 * does not show duplicate track electives.
 *
 * @param  list<string>  $aliasCodes
 * @param  list<string>  $aliasNames
 */
$ensureTrack = static function (string $code, string $name, array $aliasCodes = [], array $aliasNames = []): int {
    $allCodes = array_values(array_unique(array_filter(array_map(
        static fn ($c) => strtoupper(trim((string) $c)),
        [$code, ...$aliasCodes]
    ))));
    $allNames = array_values(array_unique(array_filter(array_map(
        static fn ($n) => trim((string) $n),
        [$name, ...$aliasNames]
    ))));

    $candidates = DB::table('tbl_track')
        ->where(function ($q) use ($allCodes, $allNames) {
            if ($allCodes !== []) {
                $q->whereIn(DB::raw('UPPER(TRIM(track_code))'), $allCodes);
            }
            foreach ($allNames as $n) {
                $q->orWhereRaw('LOWER(TRIM(track_name)) = ?', [strtolower($n)]);
            }
        })
        ->orderBy('track_id')
        ->get();

    $preferred = $candidates->first(
        static fn ($t) => strtoupper(trim((string) $t->track_code)) === strtoupper(trim($code))
    ) ?? $candidates->first();

    if ($preferred) {
        $keepId = (int) $preferred->track_id;
        $update = [
            'track_code' => $code,
            'track_name' => $name,
        ];
        if (Schema::hasColumn('tbl_track', 'status')) {
            $update['status'] = 'active';
        }
        DB::table('tbl_track')->where('track_id', $keepId)->update($update);

        // Re-point FKs from alias duplicates, then remove them.
        foreach ($candidates as $dup) {
            $dupId = (int) $dup->track_id;
            if ($dupId === $keepId) {
                continue;
            }
            foreach (['tbl_elective_subject', 'tbl_student_profile', 'tbl_offered_subject'] as $table) {
                if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'track_id')) {
                    continue;
                }
                if ($table === 'tbl_elective_subject') {
                    // Avoid unique collisions: drop alias rows that already exist under keepId.
                    $aliasRows = DB::table($table)->where('track_id', $dupId)->get();
                    foreach ($aliasRows as $row) {
                        $exists = DB::table($table)
                            ->where('elective_slot_id', $row->elective_slot_id)
                            ->where('subject_id', $row->subject_id)
                            ->where('track_id', $keepId)
                            ->exists();
                        if ($exists) {
                            DB::table($table)->where('elective_subject_id', $row->elective_subject_id)->delete();
                        } else {
                            DB::table($table)->where('elective_subject_id', $row->elective_subject_id)->update([
                                'track_id' => $keepId,
                            ]);
                        }
                    }
                } else {
                    DB::table($table)->where('track_id', $dupId)->update(['track_id' => $keepId]);
                }
            }
            DB::table('tbl_track')->where('track_id', $dupId)->delete();
        }

        return $keepId;
    }

    $payload = [
        'track_code' => $code,
        'track_name' => $name,
    ];
    if (Schema::hasColumn('tbl_track', 'status')) {
        $payload['status'] = 'active';
    }

    return (int) DB::table('tbl_track')->insertGetId($payload);
};

$program = DB::table('tbl_program')
    ->where('program_code', 'BSIT')
    ->orWhere('program_name', 'like', '%Information Technology%')
    ->orderBy('program_id')
    ->first();

if (! $program) {
    throw new RuntimeException('BSIT program not found.');
}

$programId = (int) $program->program_id;
$departmentId = (int) ($program->department_id ?? 0);

DB::table('tbl_program')->where('program_id', $programId)->update([
    'program_code' => 'BSIT',
    'program_name' => 'Bachelor of Science in Information Technology',
    'total_units_required' => 154,
]);

$header = DB::table('tbl_curriculum_header')
    ->where('program_id', $programId)
    ->where('Effective_Year', 2022)
    ->orderByDesc('curriculum_header_id')
    ->first();

if (! $header) {
    $headerId = (int) DB::table('tbl_curriculum_header')->insertGetId([
        'program_id' => $programId,
        'Effective_Year' => 2022,
        'description' => 'Effective SY 2022-2023; Based on CMO No. 25 Series of 2015',
        'status' => 'active',
    ]);
} else {
    $headerId = (int) $header->curriculum_header_id;
    DB::table('tbl_curriculum_header')->where('curriculum_header_id', $headerId)->update([
        'description' => 'Effective SY 2022-2023; Based on CMO No. 25 Series of 2015',
        'status' => 'active',
    ]);
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

if (! $hasJunk && $rowCount >= 50) {
    // Curriculum rows already good — still merge CS/SD aliases and rebuild Digi Elective 4.
    $syncScript = __DIR__.'/../maintenance/sync_bsit_tracks_and_electives.php';
    $trackSyncRaw = null;
    if (is_file($syncScript)) {
        $php = PHP_BINARY ?: 'php';
        $trackSyncRaw = shell_exec(escapeshellarg($php).' '.escapeshellarg($syncScript).' 2>&1');
    }
    echo json_encode([
        'program_id' => $programId,
        'curriculum_header_id' => $headerId,
        'effective_year' => 2022,
        'skipped' => true,
        'reason' => 'already_synced',
        'row_count' => $rowCount,
        'track_elective_sync' => $trackSyncRaw ? json_decode(trim($trackSyncRaw), true) : null,
    ], JSON_PRETTY_PRINT).PHP_EOL;
    exit(0);
}

// [code, name, units, hours]
$subjects = [
    // Y1 S1
    ['ITE 366', 'Introduction to Computing (Including IT Fundamentals)', 3, 3],
    ['ITE 260', 'Computer Programming 1', 3, 3],
    ['GEN 002', 'Understanding the Self', 3, 3],
    ['MAT 152', 'Mathematics in the Modern World', 3, 3],
    ['GEN 001', 'Purposive Communication', 3, 3],
    ['GEN 006', 'Ethics', 3, 3],
    ['ENG 212', 'Global Workplace English 1', 1, 1],
    ['PED 025', 'Movement Enhancement', 2, 2],
    ['NST 021', 'National Service Training Program 1', 3, 3],
    // Y1 S2
    ['ITE 186', 'Computer Programming 2', 3, 3],
    ['ITE 399', 'Human Computer Interaction 1', 3, 3],
    ['ITE 048', 'Discrete Structures', 3, 3],
    ['GEN 008', 'Living in the IT Era', 3, 3],
    ['ART 002', 'Art Appreciation', 3, 3],
    ['GEN 005', 'The Contemporary World', 3, 3],
    ['ENG 213', 'Global Workplace English 2', 1, 1],
    ['PED 026', 'Fitness Exercise', 2, 2],
    ['NST 022', 'National Service Training Program 2', 3, 3],
    // Y2 S1
    ['ITE 298', 'Information Management (Including Fundamentals of Database Systems)', 3, 3],
    ['ITE 300', 'Object-Oriented Programming', 3, 3],
    ['ITE 292', 'Networking 1', 3, 3],
    ['ITE 031', 'Data Structures and Algorithms', 3, 3],
    ['ITE 083', 'IT Project Management', 3, 3],
    ['HIS 007', 'Life and Works of Rizal', 3, 3],
    ['ENG 216', 'Global Workplace English 3', 2, 2],
    ['PED 027', 'Physical Activities Towards Health & Fitness 1', 2, 2],
    ['SSP 005', 'Student Success Program 1', 1, 1],
    // Y2 S2
    ['ITE 393', 'Applications Development and Emerging Technologies (including Event-Driven Programming)', 3, 3],
    ['ITE 400', 'Systems Integration and Architecture', 3, 3],
    ['ITE 308', 'Web Systems and Technologies', 3, 3],
    ['ITE 380', 'Human Computer Interaction 2', 3, 3],
    ['GEN 003', 'Science, Technology, and Society', 3, 3],
    ['GEN 004', 'Readings in Philippine History', 3, 3],
    ['GEN 009', 'The Entrepreneurial Mind', 3, 3],
    ['GEN 013', "People and the Earth's Ecosystems", 3, 3],
    ['PED 028', 'Physical Activities Towards Health & Fitness 2', 2, 2],
    ['SSP 006', 'Student Success Program 2', 1, 1],
    // Y3 S1
    ['ITE 359', 'Networking 2', 3, 3],
    ['ITE 369', 'Information Assurance and Security 1', 3, 3],
    ['ITE 353', 'Data Scalability & Analytics', 3, 3],
    ['ITE 307', 'Quantitative Methods (Including Modeling and Simulation)', 3, 3],
    ['ITE 397', 'Advanced Database Systems (including Advanced Systems Integration and Architecture)', 3, 3],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    // Y3 S2
    ['ITE 309', 'Capstone Project and Research 1', 3, 3],
    ['ITE 293', 'Systems Administration and Maintenance', 3, 3],
    ['ITE 370', 'Information Assurance and Security 2', 3, 3],
    ['ITE 401', 'Platform Technologies', 3, 3],
    ['SSP 008', 'Student Success Program 4', 1, 1],
    // Y4
    ['ITE 310', 'Capstone Project and Research 2', 3, 3],
    ['ITE 367', 'Managing IT Resources (Including Social & Professional Issues)', 3, 3],
    ['ITE 311', 'IT Practicum (486 hrs.)', 6, 6],
    // Elective pool (+ ITE 381 as Elective 4 / IT Business Solutions option)
    ['BAM 285', 'Business Analysis for IT', 3, 3],
    ['BAM 286', 'Applied Analytics in Business for IT', 3, 3],
    ['ITE 382', 'Intelligent Systems', 3, 3],
    ['ITE 381', 'IT Business Solutions', 3, 3],
    ['ITE 383', 'Network Security', 3, 3],
    ['ITE 384', 'Computer Forensics', 3, 3],
    ['ITE 385', 'Ethical Hacking', 3, 3],
    ['ITE 387', 'Advanced Programming', 3, 3],
    ['ITE 235', 'Game Development', 3, 3],
    ['ITE 386', 'Cloud Programming', 3, 3],
    ['ITE 391', 'Freehand and Digital Drawing', 3, 3],
    ['ITE 392', 'Script Writing and Storyboard Design', 3, 3],
    ['ITE 240', '3D Animation', 3, 3],
    ['ITE 388', 'Clean-up and In-between for IT', 3, 3],
];

$minorPrefixes = ['GEN', 'ART', 'HIS', 'MAT', 'PED', 'NST', 'SSP', 'ENG'];
$subjectType = static function (string $code) use ($minorPrefixes): string {
    $prefix = strtoupper(strtok(trim($code), ' ') ?: trim($code));

    return in_array($prefix, $minorPrefixes, true) ? 'minor' : 'core';
};

// Placeholders for elective slots in curriculum rows
$curriculumRows = [
    // Y1 S1
    ['ITE 366', 1, 1], ['ITE 260', 1, 1], ['GEN 002', 1, 1], ['MAT 152', 1, 1], ['GEN 001', 1, 1],
    ['GEN 006', 1, 1], ['ENG 212', 1, 1], ['PED 025', 1, 1], ['NST 021', 1, 1],
    // Y1 S2
    ['ITE 186', 1, 2], ['ITE 399', 1, 2], ['ITE 048', 1, 2], ['GEN 008', 1, 2], ['ART 002', 1, 2],
    ['GEN 005', 1, 2], ['ENG 213', 1, 2], ['PED 026', 1, 2], ['NST 022', 1, 2],
    // Y2 S1
    ['ITE 298', 2, 1], ['ITE 300', 2, 1], ['ITE 292', 2, 1], ['ITE 031', 2, 1], ['ITE 083', 2, 1],
    ['HIS 007', 2, 1], ['ENG 216', 2, 1], ['PED 027', 2, 1], ['SSP 005', 2, 1],
    // Y2 S2
    ['ITE 393', 2, 2], ['ITE 400', 2, 2], ['ITE 308', 2, 2], ['ITE 380', 2, 2], ['GEN 003', 2, 2],
    ['GEN 004', 2, 2], ['GEN 009', 2, 2], ['GEN 013', 2, 2], ['PED 028', 2, 2], ['SSP 006', 2, 2],
    // Y3 S1
    ['ITE 359', 3, 1], ['ITE 369', 3, 1], ['ITE 353', 3, 1], ['ITE 307', 3, 1], ['ITE 397', 3, 1],
    ['__IT_ELEC_1__', 3, 1], ['SSP 007', 3, 1],
    // Y3 S2
    ['ITE 309', 3, 2], ['ITE 293', 3, 2], ['ITE 370', 3, 2], ['ITE 401', 3, 2],
    ['__IT_ELEC_2__', 3, 2], ['__IT_ELEC_3__', 3, 2], ['SSP 008', 3, 2],
    // Y4
    ['ITE 310', 4, 1], ['__IT_ELEC_4__', 4, 1], ['ITE 367', 4, 1],
    ['ITE 311', 4, 2],
];

$prerequisites = [
    'ITE 186' => ['ITE 260'],
    'ITE 399' => ['ITE 366'],
    'ITE 048' => ['MAT 152'],
    'ENG 213' => ['ENG 212'],
    'PED 026' => ['PED 025'],
    'NST 022' => ['NST 021'],
    'ITE 300' => ['ITE 186'],
    'ITE 292' => ['ITE 366'],
    'ITE 031' => ['ITE 186'],
    'ITE 083' => ['ITE 366'],
    'ENG 216' => ['ENG 213'],
    'PED 027' => ['PED 026'],
    'ITE 393' => ['ITE 031'],
    'ITE 400' => ['ITE 366'],
    'ITE 308' => ['ITE 260'],
    'ITE 380' => ['ITE 399'],
    'PED 028' => ['PED 027'],
    'SSP 006' => ['SSP 005'],
    'ITE 359' => ['ITE 292'],
    'ITE 369' => ['ITE 298', 'ITE 031'],
    'ITE 353' => ['ITE 298', 'ITE 031'],
    'ITE 307' => ['MAT 152'],
    'ITE 397' => ['ITE 298', 'ITE 031'],
    'SSP 007' => ['SSP 006'],
    'ITE 309' => ['ITE 400'],
    'ITE 293' => ['ITE 359'],
    'ITE 370' => ['ITE 369'],
    'ITE 401' => ['ITE 393'],
    'SSP 008' => ['SSP 007'],
    'ITE 310' => ['ITE 309'],
    'ITE 367' => ['ITE 369'],
];

$corequisites = [
    'ITE 298' => ['ITE 031'],
    'ITE 031' => ['ITE 298'],
];

/**
 * Canonical BSIT tracks. Legacy CS/SD aliases are merged into CYBER / SYS DEV.
 * Digi uses 4 dedicated subjects (one per elective slot); other tracks use 3
 * track electives + free-choice Elective 4.
 */
$electiveByTrack = [
    'BI' => [
        'name' => 'Business Informatics',
        'alias_codes' => [],
        'alias_names' => [],
        'codes' => ['BAM 285', 'BAM 286', 'ITE 382'],
        'elective4' => null,
    ],
    'CYBER' => [
        'name' => 'Cybersecurity',
        'alias_codes' => ['CS'],
        'alias_names' => ['Computer Security'],
        'codes' => ['ITE 383', 'ITE 384', 'ITE 385'],
        'elective4' => null,
    ],
    'SYS DEV' => [
        'name' => 'System Development',
        'alias_codes' => ['SD', 'SYSDEV'],
        'alias_names' => ['Systems Development'],
        'codes' => ['ITE 387', 'ITE 235', 'ITE 386'],
        'elective4' => null,
    ],
    'DA' => [
        'name' => 'Digital Arts',
        'alias_codes' => ['DIGI'],
        'alias_names' => [],
        'codes' => ['ITE 391', 'ITE 392', 'ITE 240'],
        // Digi Elective 4 auto-assigns Clean-up and In-between (ITE 388).
        'elective4' => 'ITE 388',
    ],
];

$slotDefs = [
    '__IT_ELEC_1__' => ['slot_name' => 'IT Electives 1', 'year' => 3, 'semester' => 1, 'index' => 0],
    '__IT_ELEC_2__' => ['slot_name' => 'IT Electives 2', 'year' => 3, 'semester' => 2, 'index' => 1],
    '__IT_ELEC_3__' => ['slot_name' => 'IT Electives 3', 'year' => 3, 'semester' => 2, 'index' => 2],
    '__IT_ELEC_4__' => ['slot_name' => 'IT Electives 4', 'year' => 4, 'semester' => 1, 'index' => 3],
];

/** Free-choice Elective 4 pool for SysDev / Cyber / BAM (null track_id). */
$elective4FreeChoiceCodes = [
    'BAM 285', 'BAM 286', 'ITE 382',
    'ITE 383', 'ITE 384', 'ITE 385',
    'ITE 387', 'ITE 235', 'ITE 386',
    'ITE 391', 'ITE 392', 'ITE 240', 'ITE 388',
    'ITE 381',
];

$stats = [
    'subjects_upserted' => 0,
    'rows_deleted' => 0,
    'rows_inserted' => 0,
    'slots' => 0,
    'choices' => 0,
    'prereqs' => 0,
    'coreqs' => 0,
];

DB::transaction(function () use (
    $subjects,
    $curriculumRows,
    $prerequisites,
    $corequisites,
    $electiveByTrack,
    $slotDefs,
    $elective4FreeChoiceCodes,
    $ensureSubject,
    $ensureTrack,
    $findSubject,
    $subjectType,
    $programId,
    $departmentId,
    $headerId,
    &$stats
): void {
    foreach ($subjects as [$code, $name, $units, $hours]) {
        $ensureSubject($code, $name, $units, $hours);
        $stats['subjects_upserted']++;
    }

    $trackIds = [];
    foreach ($electiveByTrack as $code => $meta) {
        $trackIds[$code] = $ensureTrack(
            $code,
            $meta['name'],
            $meta['alias_codes'] ?? [],
            $meta['alias_names'] ?? []
        );
    }

    $electiveSlotIds = [];
    foreach ($slotDefs as $placeholder => $def) {
        $payload = [
            'program_id' => $programId,
            'year_level_id' => $def['year'],
            'semester_id' => $def['semester'],
            'slot_name' => $def['slot_name'],
            'status' => 'active',
        ];
        $slot = DB::table('tbl_elective_slot')
            ->where('program_id', $programId)
            ->where('slot_name', $def['slot_name'])
            ->first();
        if ($slot) {
            $slotId = (int) $slot->elective_slot_id;
            DB::table('tbl_elective_slot')->where('elective_slot_id', $slotId)->update($payload);
        } else {
            $slotId = (int) DB::table('tbl_elective_slot')->insertGetId($payload);
        }
        $electiveSlotIds[$placeholder] = $slotId;
        $stats['slots']++;

        // Rebuild slot choices from scratch so CS/SD duplicates and Digi
        // "all subjects in every slot" leftovers cannot linger.
        DB::table('tbl_elective_subject')->where('elective_slot_id', $slotId)->delete();

        $slotIndex = (int) ($def['index'] ?? 0);
        $isElectiveFour = $slotIndex === 3;

        if ($isElectiveFour) {
            foreach ($elective4FreeChoiceCodes as $subjectCode) {
                $subject = $findSubject($subjectCode);
                if (! $subject) {
                    continue;
                }
                DB::table('tbl_elective_subject')->insert([
                    'elective_slot_id' => $slotId,
                    'subject_id' => (int) $subject->subject_id,
                    'track_id' => null,
                    'department_id' => $departmentId ?: null,
                    'program_id' => $programId,
                    'description' => null,
                ]);
                $stats['choices']++;
            }
            // Digi only: track-linked Elective 4 auto-assigns ITE 388.
            foreach ($electiveByTrack as $trackCode => $meta) {
                $digiCode = $meta['elective4'] ?? null;
                if (! $digiCode) {
                    continue;
                }
                $subject = $findSubject($digiCode);
                if (! $subject) {
                    continue;
                }
                DB::table('tbl_elective_subject')->insert([
                    'elective_slot_id' => $slotId,
                    'subject_id' => (int) $subject->subject_id,
                    'track_id' => $trackIds[$trackCode],
                    'department_id' => $departmentId ?: null,
                    'program_id' => $programId,
                    'description' => null,
                ]);
                $stats['choices']++;
            }
        } else {
            // Electives 1–3: one subject per track (index 0/1/2).
            foreach ($electiveByTrack as $trackCode => $meta) {
                $subjectCode = $meta['codes'][$slotIndex] ?? null;
                if (! $subjectCode) {
                    continue;
                }
                $subject = $findSubject($subjectCode);
                if (! $subject) {
                    continue;
                }
                DB::table('tbl_elective_subject')->insert([
                    'elective_slot_id' => $slotId,
                    'subject_id' => (int) $subject->subject_id,
                    'track_id' => $trackIds[$trackCode],
                    'department_id' => $departmentId ?: null,
                    'program_id' => $programId,
                    'description' => null,
                ]);
                $stats['choices']++;
            }
        }
    }

    \App\Support\ElectiveSlotPrerequisite::syncItElectiveChainForProgram($programId);

    $stats['rows_deleted'] = DB::table('curriculum')
        ->where('curriculum_header_id', $headerId)
        ->delete();

    foreach ($curriculumRows as [$code, $year, $semester]) {
        $isSlot = isset($electiveSlotIds[$code]);
        $payload = [
            'curriculum_header_id' => $headerId,
            'program_id' => $programId,
            'subject_id' => $isSlot ? null : (int) $findSubject($code)->subject_id,
            'elective_slot_id' => $isSlot ? $electiveSlotIds[$code] : null,
            'year_level' => $year,
            'semester_id' => $semester,
            'passing_grade' => 50,
            'subject_type' => $isSlot ? 'elective subject' : $subjectType($code),
            'requisite_id' => null,
        ];
        DB::table('curriculum')->insert($payload);
        $stats['rows_inserted']++;
    }

    $syncEdges = static function (string $targetCode, array $requiredCodes, string $type, ?string $ruleLabel = null) use ($findSubject, &$stats): void {
        $target = $findSubject($targetCode);
        if (! $target) {
            return;
        }
        $targetId = (int) $target->subject_id;
        $requiredIds = [];
        foreach ($requiredCodes as $reqCode) {
            $req = $findSubject($reqCode);
            if ($req) {
                $requiredIds[] = (int) $req->subject_id;
            }
        }
        $requiredIds = array_values(array_unique(array_filter(
            $requiredIds,
            static fn (int $id) => $id !== $targetId
        )));

        DB::table('tbl_prerequisite')
            ->where('subject_id', $targetId)
            ->where('requisite_type', $type)
            ->when($requiredIds !== [], fn ($q) => $q->whereNotIn('requisites_subject_id', $requiredIds))
            ->when($requiredIds === [], fn ($q) => $q)
            ->delete();

        foreach ($requiredIds as $requiredId) {
            $existing = DB::table('tbl_prerequisite')
                ->where('subject_id', $targetId)
                ->where('requisite_type', $type)
                ->where('requisites_subject_id', $requiredId)
                ->first();
            $payload = [
                'subject_id' => $targetId,
                'requisite_type' => $type,
                'requisites_subject_id' => $requiredId,
                'rule_label' => $ruleLabel,
            ];
            if ($existing) {
                DB::table('tbl_prerequisite')->where('requisites_id', $existing->requisites_id)->update($payload);
            } else {
                DB::table('tbl_prerequisite')->insert($payload);
            }
            if ($type === 'corequisite') {
                $stats['coreqs']++;
            } else {
                $stats['prereqs']++;
            }
        }
    };

    foreach ($prerequisites as $target => $reqs) {
        $syncEdges($target, $reqs, 'prerequisite');
    }
    foreach ($corequisites as $target => $reqs) {
        $syncEdges($target, $reqs, 'corequisite');
    }

    // 4th year standing for practicum: attach rule_label to Y1–Y3 subject edges
    $practicum = $findSubject('ITE 311');
    if ($practicum) {
        $priorSubjectIds = DB::table('curriculum')
            ->where('curriculum_header_id', $headerId)
            ->where('year_level', '<=', 3)
            ->whereNotNull('subject_id')
            ->pluck('subject_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
        foreach ($priorSubjectIds as $requiredId) {
            DB::table('tbl_prerequisite')->updateOrInsert(
                [
                    'subject_id' => (int) $practicum->subject_id,
                    'requisite_type' => 'prerequisite',
                    'requisites_subject_id' => $requiredId,
                ],
                [
                    'rule_label' => '4th year standing',
                ]
            );
            $stats['prereqs']++;
        }
    }
});

echo json_encode([
    'program_id' => $programId,
    'curriculum_header_id' => $headerId,
    'effective_year' => 2022,
    'stats' => $stats,
], JSON_PRETTY_PRINT).PHP_EOL;
