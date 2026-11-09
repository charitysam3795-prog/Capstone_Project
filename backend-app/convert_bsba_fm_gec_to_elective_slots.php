<?php
declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__ . '/vendor/autoload.php';

$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$normalizeCode = static fn (string $code): string => strtoupper(str_replace(' ', '', trim($code)));

$findSubject = static function (string $code) use ($normalizeCode) {
    return DB::table('tbl_subjects')
        ->whereRaw("REPLACE(UPPER(subject_code), ' ', '') = ?", [$normalizeCode($code)])
        ->first();
};

$program = DB::table('tbl_program')
    ->where('program_code', 'BSBAFM')
    ->orWhere('program_name', 'Bachelor of Science in Business Administration Major in Financial Management')
    ->first();

if (! $program) {
    throw new RuntimeException('BSBA Financial Management program was not found. Run import_bsba_financial_management_curriculum.php first.');
}

$headerId = DB::table('tbl_curriculum_header')
    ->where('program_id', $program->program_id)
    ->where('Effective_Year', 2023)
    ->value('curriculum_header_id');

if (! $headerId) {
    throw new RuntimeException('BSBA Financial Management curriculum header was not found.');
}

$choiceCodes = ['GEN 010', 'ENG 188', 'SCX 010'];
$choiceSubjects = [];
foreach ($choiceCodes as $code) {
    $subject = $findSubject($code);
    if (! $subject) {
        throw new RuntimeException("Missing GEC elective subject: {$code}");
    }
    $choiceSubjects[$code] = $subject;
}

$slotDefinitions = [
    ['slot_name' => 'BSBAFM GEC Elective 1', 'year' => 2, 'semester' => 1, 'replace_code' => 'GEN 010'],
    ['slot_name' => 'BSBAFM GEC Elective 2', 'year' => 2, 'semester' => 2, 'replace_code' => 'ENG 188'],
    ['slot_name' => 'BSBAFM GEC Elective 3', 'year' => 3, 'semester' => 1, 'replace_code' => 'SCX 010'],
];

$createdSlots = 0;
$updatedSlots = 0;
$convertedRows = 0;
$insertedRows = 0;
$assignedChoices = 0;

DB::transaction(function () use (
    $program,
    $headerId,
    $findSubject,
    $choiceSubjects,
    $slotDefinitions,
    &$createdSlots,
    &$updatedSlots,
    &$convertedRows,
    &$insertedRows,
    &$assignedChoices
): void {
    foreach ($slotDefinitions as $definition) {
        $slotPayload = [
            'program_id' => $program->program_id,
            'year_level_id' => $definition['year'],
            'semester_id' => $definition['semester'],
            'slot_name' => $definition['slot_name'],
            'status' => 'active',
        ];

        $slot = DB::table('tbl_elective_slot')
            ->where('program_id', $program->program_id)
            ->where('slot_name', $definition['slot_name'])
            ->first();

        if ($slot) {
            $slotId = (int) $slot->elective_slot_id;
            DB::table('tbl_elective_slot')->where('elective_slot_id', $slotId)->update($slotPayload);
            $updatedSlots++;
        } else {
            $slotId = DB::table('tbl_elective_slot')->insertGetId($slotPayload);
            $createdSlots++;
        }

        $choiceSubjectIds = [];
        foreach ($choiceSubjects as $subject) {
            $choiceSubjectIds[] = (int) $subject->subject_id;

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

        DB::table('tbl_elective_subject')
            ->where('elective_slot_id', $slotId)
            ->whereNotIn('subject_id', $choiceSubjectIds)
            ->delete();

        $replaceSubject = $findSubject($definition['replace_code']);
        $existingCurriculum = $replaceSubject
            ? DB::table('curriculum')
                ->where('program_id', $program->program_id)
                ->where('subject_id', $replaceSubject->subject_id)
                ->where('year_level', $definition['year'])
                ->where('semester_id', $definition['semester'])
                ->first()
            : null;

        $curriculumPayload = [
            'curriculum_header_id' => $headerId,
            'program_id' => $program->program_id,
            'subject_id' => null,
            'elective_slot_id' => $slotId,
            'year_level' => $definition['year'],
            'semester_id' => $definition['semester'],
            'passing_grade' => 50,
            'subject_type' => 'elective subject',
            'requisite_id' => null,
        ];

        if ($existingCurriculum) {
            DB::table('curriculum')
                ->where('curriculum_id', $existingCurriculum->curriculum_id)
                ->update($curriculumPayload);
            $convertedRows++;
            continue;
        }

        $linkedCurriculum = DB::table('curriculum')
            ->where('program_id', $program->program_id)
            ->where('elective_slot_id', $slotId)
            ->where('year_level', $definition['year'])
            ->where('semester_id', $definition['semester'])
            ->first();

        if ($linkedCurriculum) {
            DB::table('curriculum')
                ->where('curriculum_id', $linkedCurriculum->curriculum_id)
                ->update($curriculumPayload);
            continue;
        }

        DB::table('curriculum')->insert($curriculumPayload);
        $insertedRows++;
    }
});

echo json_encode([
    'program_id' => (int) $program->program_id,
    'program_code' => $program->program_code,
    'created_slots' => $createdSlots,
    'updated_slots' => $updatedSlots,
    'converted_curriculum_rows' => $convertedRows,
    'inserted_curriculum_rows' => $insertedRows,
    'assigned_choice_rows' => $assignedChoices,
], JSON_PRETTY_PRINT) . PHP_EOL;

