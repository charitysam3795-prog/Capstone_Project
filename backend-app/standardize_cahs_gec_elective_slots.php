<?php
declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__ . '/vendor/autoload.php';

$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$cahs = DB::table('tbl_departments')
    ->where('department_code', 'CAHS')
    ->orWhere('department_name', 'like', '%Allied Health%')
    ->first();

if (! $cahs) {
    throw new RuntimeException('CAHS department was not found.');
}

$programs = DB::table('tbl_program')
    ->where('department_id', $cahs->department_id)
    ->whereIn('program_code', ['BSMT', 'BSN', 'BSPHARM', 'BSPSY'])
    ->get()
    ->keyBy('program_code');

$programChoices = [
    'BSMT' => ['SCX 010', 'GEN 010', 'ENG 188'],
    'BSN' => ['SCX 010', 'GEN 010', 'ELEC 1'],
    'BSPHARM' => ['SCX 010', 'GEN 010', 'ENG 188'],
    'BSPSY' => ['SCX 010', 'GEN 010', 'PHI 002'],
];

$renamedSlots = 0;
$assignedChoices = 0;

DB::transaction(function () use ($programs, $programChoices, &$renamedSlots, &$assignedChoices): void {
    foreach ($programChoices as $programCode => $subjectCodes) {
        $program = $programs[$programCode] ?? null;
        if (! $program) {
            continue;
        }

        for ($n = 1; $n <= 3; $n++) {
            $oldName = "GEC Elective {$n}";
            $newName = "CAHS Electives {$n}";

            $slot = DB::table('tbl_elective_slot')
                ->where('program_id', $program->program_id)
                ->where(function ($query) use ($oldName, $newName): void {
                    $query->where('slot_name', $oldName)
                        ->orWhere('slot_name', $newName);
                })
                ->orderByRaw("CASE WHEN slot_name = ? THEN 0 ELSE 1 END", [$newName])
                ->first();

            if (! $slot) {
                continue;
            }

            if ($slot->slot_name !== $newName) {
                DB::table('tbl_elective_slot')->where('elective_slot_id', $slot->elective_slot_id)->update([
                    'slot_name' => $newName,
                    'status' => 'active',
                ]);
                $renamedSlots++;
            }

            foreach ($subjectCodes as $subjectCode) {
                $subject = DB::table('tbl_subjects')
                    ->where('subject_code', $subjectCode)
                    ->first();

                if (! $subject) {
                    continue;
                }

                DB::table('tbl_elective_subject')->updateOrInsert(
                    [
                        'elective_slot_id' => $slot->elective_slot_id,
                        'subject_id' => $subject->subject_id,
                        'track_id' => null,
                    ],
                    [
                        'department_id' => $program->department_id,
                        'program_id' => $program->program_id,
                        'description' => null,
                    ]
                );
                $assignedChoices++;
            }
        }
    }
});

echo json_encode([
    'department_id' => (int) $cahs->department_id,
    'department_code' => $cahs->department_code,
    'renamed_slots' => $renamedSlots,
    'assigned_choice_rows' => $assignedChoices,
], JSON_PRETTY_PRINT) . PHP_EOL;
