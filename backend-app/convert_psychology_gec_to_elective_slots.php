<?php
declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__ . '/vendor/autoload.php';

$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$program = DB::table('tbl_program')
    ->where('program_code', 'BSPSY')
    ->orWhere('program_name', 'Bachelor of Science in Psychology')
    ->first();

if (! $program) {
    throw new RuntimeException('Bachelor of Science in Psychology program was not found.');
}

$choices = ['SCX 010', 'GEN 010', 'PHI 002'];
$choiceSubjects = DB::table('tbl_subjects')
    ->whereIn('subject_code', $choices)
    ->get()
    ->keyBy('subject_code');

foreach ($choices as $code) {
    if (! isset($choiceSubjects[$code])) {
        throw new RuntimeException("Missing Psychology GEC elective subject: {$code}");
    }
}

$slotRows = [
    ['slot_name' => 'GEC Elective 1', 'current_subject_code' => 'GEN 010'],
    ['slot_name' => 'GEC Elective 2', 'current_subject_code' => 'PHI 002'],
    ['slot_name' => 'GEC Elective 3', 'current_subject_code' => 'SCX 010'],
];

$updatedCurriculumRows = 0;
$assignedChoices = 0;

DB::transaction(function () use ($program, $choiceSubjects, $slotRows, &$updatedCurriculumRows, &$assignedChoices): void {
    foreach ($slotRows as $slotRow) {
        $currentSubject = $choiceSubjects[$slotRow['current_subject_code']];
        $curriculum = DB::table('curriculum')
            ->where('program_id', $program->program_id)
            ->where('subject_id', $currentSubject->subject_id)
            ->first();

        if (! $curriculum) {
            throw new RuntimeException("Missing BSPSY curriculum row for {$slotRow['current_subject_code']}");
        }

        $existingSlot = DB::table('tbl_elective_slot')
            ->where('program_id', $program->program_id)
            ->where('year_level_id', $curriculum->year_level)
            ->where('semester_id', $curriculum->semester_id)
            ->where('slot_name', $slotRow['slot_name'])
            ->first();

        if ($existingSlot) {
            $slotId = (int) $existingSlot->elective_slot_id;
            DB::table('tbl_elective_slot')->where('elective_slot_id', $slotId)->update([
                'status' => 'active',
            ]);
        } else {
            $slotId = DB::table('tbl_elective_slot')->insertGetId([
                'program_id' => $program->program_id,
                'year_level_id' => $curriculum->year_level,
                'semester_id' => $curriculum->semester_id,
                'slot_name' => $slotRow['slot_name'],
                'status' => 'active',
            ]);
        }

        DB::table('curriculum')->where('curriculum_id', $curriculum->curriculum_id)->update([
            'subject_id' => null,
            'elective_slot_id' => $slotId,
            'subject_type' => 'elective subject',
        ]);
        $updatedCurriculumRows++;

        foreach ($choiceSubjects as $subject) {
            DB::table('tbl_elective_subject')->updateOrInsert(
                [
                    'elective_slot_id' => $slotId,
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
});

echo json_encode([
    'program_id' => (int) $program->program_id,
    'program_code' => $program->program_code,
    'updated_curriculum_rows' => $updatedCurriculumRows,
    'assigned_choice_rows' => $assignedChoices,
], JSON_PRETTY_PRINT) . PHP_EOL;
