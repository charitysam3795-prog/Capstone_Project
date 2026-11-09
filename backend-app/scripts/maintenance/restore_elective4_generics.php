<?php

/**
 * Ensure IT Electives 4 has free-choice (track_id null) subjects for SysDev/Cyber/BAM
 * to pick manually, plus Digi track-linked ITE388.
 *
 * Usage: php scripts/maintenance/restore_elective4_generics.php
 */

require __DIR__ . '/../../vendor/autoload.php';
$app = require __DIR__ . '/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

$slotFourId = DB::table('tbl_elective_slot')
    ->where('program_id', 1)
    ->where('slot_name', 'IT Electives 4')
    ->value('elective_slot_id');

if (! $slotFourId) {
    echo "IT Electives 4 slot not found.\n";
    exit(1);
}

$digitalTrackId = DB::table('tbl_track')
    ->where(function ($q) {
        $q->where('track_code', 'DA')
            ->orWhere('track_code', 'like', '%DIGI%')
            ->orWhere('track_name', 'like', '%Digital%');
    })
    ->value('track_id');

$departmentId = DB::table('tbl_program')->where('program_id', 1)->value('department_id');

$slotFourSubjects = [
    ['code' => 'BAM285', 'track_id' => null],
    ['code' => 'BAM286', 'track_id' => null],
    ['code' => 'ITE382', 'track_id' => null],
    ['code' => 'ITE383', 'track_id' => null],
    ['code' => 'ITE384', 'track_id' => null],
    ['code' => 'ITE385', 'track_id' => null],
    ['code' => 'ITE387', 'track_id' => null],
    ['code' => 'ITE235', 'track_id' => null],
    ['code' => 'ITE386', 'track_id' => null],
    ['code' => 'ITE391', 'track_id' => null],
    ['code' => 'ITE392', 'track_id' => null],
    ['code' => 'ITE240', 'track_id' => null],
    ['code' => 'ITE388', 'track_id' => null],
    ['code' => 'ITE388', 'track_id' => $digitalTrackId ? (int) $digitalTrackId : null],
];

$upserted = 0;
foreach ($slotFourSubjects as $subjectRow) {
    $subjectId = DB::table('tbl_subjects')
        ->whereRaw('REPLACE(UPPER(subject_code), " ", "") = ?', [$subjectRow['code']])
        ->value('subject_id');

    if (! $subjectId) {
        echo "  SKIP missing subject {$subjectRow['code']}\n";
        continue;
    }

    DB::table('tbl_elective_subject')->updateOrInsert(
        [
            'elective_slot_id' => $slotFourId,
            'subject_id' => $subjectId,
            'track_id' => $subjectRow['track_id'],
        ],
        [
            'department_id' => $departmentId,
            'program_id' => 1,
            'description' => null,
        ]
    );
    $upserted++;
    echo "  OK {$subjectRow['code']} track_id=" . ($subjectRow['track_id'] ?? 'null') . "\n";
}

echo "\nDone. Upserted {$upserted} Elective 4 catalog row(s).\n";
