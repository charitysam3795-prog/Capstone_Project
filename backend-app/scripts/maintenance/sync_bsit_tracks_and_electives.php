<?php

declare(strict_types=1);

/**
 * Merge legacy BSIT track aliases (CS→CYBER, SD→SYS DEV) and rebuild IT elective
 * slot catalog so Digi auto-assigns Elective 4 (ITE 388) and promote modal has no
 * duplicate tracks.
 *
 * Usage: php scripts/maintenance/sync_bsit_tracks_and_electives.php
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
        'elective4' => 'ITE 388',
    ],
];

$slotDefs = [
    ['slot_name' => 'IT Electives 1', 'year' => 3, 'semester' => 1, 'index' => 0],
    ['slot_name' => 'IT Electives 2', 'year' => 3, 'semester' => 2, 'index' => 1],
    ['slot_name' => 'IT Electives 3', 'year' => 3, 'semester' => 2, 'index' => 2],
    ['slot_name' => 'IT Electives 4', 'year' => 4, 'semester' => 1, 'index' => 3],
];

$elective4FreeChoiceCodes = [
    'BAM 285', 'BAM 286', 'ITE 382',
    'ITE 383', 'ITE 384', 'ITE 385',
    'ITE 387', 'ITE 235', 'ITE 386',
    'ITE 391', 'ITE 392', 'ITE 240', 'ITE 388',
    'ITE 381',
];

$stats = ['tracks' => 0, 'slots' => 0, 'choices' => 0, 'deleted_alias_tracks' => 0];

DB::transaction(function () use (
    $electiveByTrack,
    $slotDefs,
    $elective4FreeChoiceCodes,
    $ensureTrack,
    $findSubject,
    $programId,
    $departmentId,
    &$stats
): void {
    $beforeTrackIds = DB::table('tbl_track')->pluck('track_id')->map(fn ($id) => (int) $id)->all();

    $trackIds = [];
    foreach ($electiveByTrack as $code => $meta) {
        $trackIds[$code] = $ensureTrack(
            $code,
            $meta['name'],
            $meta['alias_codes'] ?? [],
            $meta['alias_names'] ?? []
        );
        $stats['tracks']++;
    }

    $afterTrackIds = DB::table('tbl_track')->pluck('track_id')->map(fn ($id) => (int) $id)->all();
    $stats['deleted_alias_tracks'] = count(array_diff($beforeTrackIds, $afterTrackIds));

    foreach ($slotDefs as $def) {
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
        $stats['slots']++;

        DB::table('tbl_elective_subject')->where('elective_slot_id', $slotId)->delete();

        $slotIndex = (int) $def['index'];
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
});

echo json_encode([
    'ok' => true,
    'program_id' => $programId,
    'stats' => $stats,
    'tracks' => DB::table('tbl_track')
        ->whereIn('track_code', ['SYS DEV', 'CYBER', 'BI', 'DA', 'SD', 'CS'])
        ->orderBy('track_id')
        ->get(['track_id', 'track_code', 'track_name']),
], JSON_PRETTY_PRINT).PHP_EOL;
