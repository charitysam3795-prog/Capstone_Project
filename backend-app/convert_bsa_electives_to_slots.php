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

$ensureSubject = static function (string $code, string $name, int $units = 3) use ($findSubject) {
    $subject = $findSubject($code);
    if ($subject) {
        return $subject;
    }

    $id = DB::table('tbl_subjects')->insertGetId([
        'subject_code' => $code,
        'subject_name' => $name,
        'number_of_units' => $units,
        'number_of_hrs' => $units,
    ]);

    return DB::table('tbl_subjects')->where('subject_id', $id)->first();
};

$program = DB::table('tbl_program')->where('program_code', 'BSA')->first();
if (! $program) {
    throw new RuntimeException('BSA program was not found. Run import_accountancy_curriculum.php first.');
}

$headerId = DB::table('tbl_curriculum_header')
    ->where('program_id', $program->program_id)
    ->where('Effective_Year', 2023)
    ->value('curriculum_header_id');

if (! $headerId) {
    throw new RuntimeException('BSA curriculum header was not found.');
}

$subjectNames = [
    'SCX 010' => 'Environmental Science',
    'GEN 010' => 'Gender and Society',
    'BAM 006' => 'Business Communication',
    'GEN 009' => 'Entrepreneurial Mind',
    'PHI 002' => 'Logic',
    'ACC 109' => 'Intermediate Accounting 4',
    'ACC 143' => 'Preferential Taxation and Tax Remedies',
    'BAM 213' => 'Law on Negotiable Instruments and Other Banking Laws',
    'ACC 142' => 'Accounting for Special Transactions Part 2',
    'PSY 002' => 'Human Behavior in Organization',
    'ACC 177' => 'Updates in Accounting and Auditing Developments',
    'ACC 167' => 'Operations Auditing',
    'ACC 168' => 'Valuation Concepts and Methods',
    'ACC 169' => 'Principles and Methods of Teaching Accounting',
    'BAM 225' => 'Business Analytics',
    'ACC 157' => 'Data Warehousing and Management',
];

$slotDefinitions = [
    ['slot_name' => 'BSA GEC Elective 1', 'year' => 2, 'semester' => 1, 'replace_code' => 'SCX 010', 'choices' => ['SCX 010']],
    ['slot_name' => 'BSA GEC Elective 2', 'year' => 2, 'semester' => 1, 'replace_code' => 'GEN 010', 'choices' => ['GEN 010']],
    ['slot_name' => 'BSA GEC Elective 3', 'year' => 2, 'semester' => 2, 'replace_code' => 'ENG 188', 'choices' => ['ENG 188']],
    ['slot_name' => 'BSA Professional Elective 1', 'year' => 3, 'semester' => 2, 'replace_code' => 'BAM 213', 'choices' => ['BAM 213']],
    ['slot_name' => 'BSA Professional Elective 2', 'year' => 4, 'semester' => 1, 'replace_code' => 'ACC 143', 'choices' => ['ACC 143']],
    ['slot_name' => 'BSA Professional Elective 3', 'year' => 4, 'semester' => 1, 'replace_code' => 'ACC 142', 'choices' => ['ACC 142']],
    ['slot_name' => 'BSA Professional Elective 4', 'year' => 4, 'semester' => 2, 'replace_code' => 'ACC 177', 'choices' => ['ACC 177']],
];

$createdSlots = 0;
$updatedSlots = 0;
$convertedRows = 0;
$insertedRows = 0;
$assignedChoices = 0;
$removedOptionalChoices = 0;

DB::transaction(function () use (
    $program,
    $headerId,
    $subjectNames,
    $slotDefinitions,
    $findSubject,
    $ensureSubject,
    &$createdSlots,
    &$updatedSlots,
    &$convertedRows,
    &$insertedRows,
    &$assignedChoices,
    &$removedOptionalChoices
): void {
    foreach ($subjectNames as $code => $name) {
        $ensureSubject($code, $name);
    }

    foreach ($slotDefinitions as $definition) {
        $slot = DB::table('tbl_elective_slot')
            ->where('program_id', $program->program_id)
            ->where('slot_name', $definition['slot_name'])
            ->first();

        $slotPayload = [
            'program_id' => $program->program_id,
            'year_level_id' => $definition['year'],
            'semester_id' => $definition['semester'],
            'slot_name' => $definition['slot_name'],
            'status' => 'active',
        ];

        if ($slot) {
            DB::table('tbl_elective_slot')
                ->where('elective_slot_id', $slot->elective_slot_id)
                ->update($slotPayload);
            $slotId = (int) $slot->elective_slot_id;
            $updatedSlots++;
        } else {
            $slotId = DB::table('tbl_elective_slot')->insertGetId($slotPayload);
            $createdSlots++;
        }

        $choiceSubjectIds = [];
        foreach ($definition['choices'] as $choiceCode) {
            $subject = $findSubject($choiceCode);
            if (! $subject) {
                continue;
            }
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

        if ($choiceSubjectIds) {
            $removedOptionalChoices += DB::table('tbl_elective_subject')
                ->where('elective_slot_id', $slotId)
                ->whereNotIn('subject_id', $choiceSubjectIds)
                ->delete();
        }

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

        $alreadyLinked = DB::table('curriculum')
            ->where('program_id', $program->program_id)
            ->where('elective_slot_id', $slotId)
            ->where('year_level', $definition['year'])
            ->where('semester_id', $definition['semester'])
            ->first();

        if ($alreadyLinked) {
            DB::table('curriculum')
                ->where('curriculum_id', $alreadyLinked->curriculum_id)
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
    'removed_optional_choice_rows' => $removedOptionalChoices,
], JSON_PRETTY_PRINT) . PHP_EOL;
