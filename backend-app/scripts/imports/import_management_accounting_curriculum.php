<?php
declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__ . '/../../vendor/autoload.php';

$app = require __DIR__ . '/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$normalizeCode = static fn (string $code): string => strtoupper(str_replace(' ', '', trim($code)));

$findSubject = static function (string $code) use ($normalizeCode) {
    return DB::table('tbl_subjects')
        ->whereRaw("REPLACE(UPPER(subject_code), ' ', '') = ?", [$normalizeCode($code)])
        ->first();
};

$subjectId = static function (string $code) use ($findSubject): int {
    $subject = $findSubject($code);
    if (! $subject) {
        throw new RuntimeException("Missing subject: {$code}");
    }

    return (int) $subject->subject_id;
};

$campus = DB::table('tbl_campus')->orderBy('campus_id')->first();
if (! $campus) {
    throw new RuntimeException('Missing campus.');
}

$department = DB::table('tbl_departments')->where('department_code', 'CMA')->first()
    ?: DB::table('tbl_departments')->where('department_name', 'like', '%Management%Account%')->first();

if (! $department) {
    $departmentId = DB::table('tbl_departments')->insertGetId([
        'campus_id' => $campus->campus_id,
        'department_code' => 'CMA',
        'department_name' => 'College of Management and Accountancy',
    ]);
} else {
    $departmentId = (int) $department->department_id;
    DB::table('tbl_departments')->where('department_id', $departmentId)->update([
        'campus_id' => $department->campus_id ?: $campus->campus_id,
        'department_code' => $department->department_code ?: 'CMA',
        'department_name' => 'College of Management and Accountancy',
    ]);
}

$program = DB::table('tbl_program')
    ->where('program_code', 'BSMA')
    ->orWhere('program_name', 'Bachelor of Science in Management Accounting')
    ->first();

if (! $program) {
    $programId = DB::table('tbl_program')->insertGetId([
        'department_id' => $departmentId,
        'campus_id' => $campus->campus_id,
        'program_code' => 'BSMA',
        'program_name' => 'Bachelor of Science in Management Accounting',
        'total_units_required' => 178,
    ]);
} else {
    $programId = (int) $program->program_id;
    DB::table('tbl_program')->where('program_id', $programId)->update([
        'department_id' => $program->department_id ?: $departmentId,
        'campus_id' => $program->campus_id ?: $campus->campus_id,
        'program_code' => $program->program_code ?: 'BSMA',
        'program_name' => 'Bachelor of Science in Management Accounting',
        'total_units_required' => $program->total_units_required ?: 178,
    ]);
}

$header = DB::table('tbl_curriculum_header')
    ->where('program_id', $programId)
    ->where('Effective_Year', 2023)
    ->first();

if (! $header) {
    $headerId = DB::table('tbl_curriculum_header')->insertGetId([
        'program_id' => $programId,
        'Effective_Year' => 2023,
        'description' => 'Effective SY 2023-2024; Based on CMO No. 28 Series of 2017',
    ]);
} else {
    $headerId = (int) $header->curriculum_header_id;
    DB::table('tbl_curriculum_header')->where('curriculum_header_id', $headerId)->update([
        'description' => 'Effective SY 2023-2024; Based on CMO No. 28 Series of 2017',
    ]);
}

$subjects = [
    ['GEN 004', 'Readings in Philippine History', 3, 3],
    ['ART 002', 'Art Appreciation', 3, 3],
    ['GEN 001', 'Purposive Communication', 3, 3],
    ['GEN 005', 'The Contemporary World', 3, 3],
    ['ACC 102', 'Fundamentals of Financial Accounting and Reporting', 6, 6],
    ['PED 030', 'Physical Activities Toward Health and Fitness I: Movement Competency Training', 2, 2],
    ['NST 021', 'National Service Training Program 1', 3, 3],
    ['GEN 002', 'Understanding the Self', 3, 3],
    ['GEN 003', 'Science, Technology and Society', 3, 3],
    ['MAT 152', 'Mathematics in the Modern World', 3, 3],
    ['HIS 007', 'Life and Works of Rizal', 3, 3],
    ['ACC 103', 'Conceptual Framework and Accounting Standards', 3, 3],
    ['BAM 201', 'International Business and Trade', 3, 3],
    ['BAM 040', 'Managerial Economics', 3, 3],
    ['PED 031', 'Physical Activities Toward Health and Fitness II: Exercise-Based Fitness Activities', 2, 2],
    ['NST 022', 'National Service Training Program 2', 3, 3],
    ['SCX 010', 'Environmental Science', 3, 3],
    ['BAM 199', 'Operations Management and TQM', 3, 3],
    ['GEN 010', 'Gender and Society', 3, 3],
    ['BAM 026', 'Law on Obligations and Contracts', 3, 3],
    ['ACC 106', 'Intermediate Accounting 1', 3, 3],
    ['ACC 107', 'Intermediate Accounting 2', 3, 3],
    ['FIN 081', 'Financial Management for Accountancy', 3, 3],
    ['SSP 005', 'Student Success Program 1', 1, 1],
    ['PED 032', 'Physical Activities Toward Health and Fitness III: Individual and Dual Sport', 2, 2],
    ['ENG 188', 'Philippine Popular Culture', 3, 3],
    ['GEN 006', 'Ethics', 3, 3],
    ['ACC 123', 'Information Technology Application Tools in Business', 3, 3],
    ['BAM 241', 'Business Laws and Regulations', 3, 3],
    ['ACC 108', 'Intermediate Accounting 3', 3, 3],
    ['ACC 109', 'Intermediate Accounting 4', 3, 3],
    ['FIN 072', 'Financial Markets', 3, 3],
    ['SSP 006', 'Student Success Program 2', 1, 1],
    ['PED 033', 'Physical Activities Toward Health and Fitness IV: Team Sport', 2, 2],
    ['PSY 002', 'Human Behavior in Organization', 3, 3],
    ['ACC 191', 'Governance, Business Ethics, Risk Management, and Internal Control', 3, 3],
    ['ACC 192', 'Cost Accounting and Control', 3, 3],
    ['BAM 031', 'Income Taxation', 3, 3],
    ['FIN 083', 'Strategic Cost Management', 3, 3],
    ['BAM 242', 'Regulatory Framework and Legal Issues in Business', 3, 3],
    ['ACC 150', 'Valuation Methods', 3, 3],
    ['ACC 116', 'Accounting Research Methods', 3, 3],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    ['BAM 062', 'Project Management', 3, 3],
    ['ACC 196', 'Management Science', 3, 3],
    ['ACC 193', 'Accounting for Business Combinations', 3, 3],
    ['BAM 283', 'Business Taxation', 3, 3],
    ['ACC 148', 'Performance Management System', 3, 3],
    ['ACC 195', 'Accounting Information System', 3, 3],
    ['ACC 117', 'Statistical Analysis with Software Application', 3, 3],
    ['ACC 152', 'Management Accounting Research', 3, 3],
    ['SSP 008', 'Student Success Program 4', 1, 1],
    ['ACC 197', 'Accounting for Government and Non-Profit Organizations', 3, 3],
    ['BAM 200', 'Strategic Management', 3, 3],
    ['ACC 194', 'Strategic Business Analysis', 3, 3],
    ['ECO 028', 'Economic Development', 3, 3],
    ['ACC 151', 'Strategic Tax Management', 3, 3],
    ['ACC 146', 'Sustainability and Strategic Audit', 3, 3],
    ['SSP 009', 'Student Success Program 5', 1, 1],
    ['ACC 179', 'Updates in Management Accounting 1', 3, 3],
    ['ACC 180', 'Updates in Management Accounting 2', 3, 3],
    ['ACC 149', 'Management Accounting Internship - 400 hours', 6, 6],
    ['BAM 006', 'Business Communication', 3, 3],
    ['GEN 009', 'Entrepreneurial Mind', 3, 3],
    ['PHI 002', 'Logic', 3, 3],
    ['FIL 125', 'Filipino sa Iba\'t Ibang Disiplina', 3, 3],
    ['FIL 128', 'Sinesosyedad / Pelikulang Pilipino', 3, 3],
    ['ACC 177', 'Updates in Accounting and Auditing Developments', 6, 6],
    ['ACC 178', 'Updates in Tax and Business Regulations', 3, 3],
    ['ACC 157', 'Data Warehousing and Management', 3, 3],
    ['ACC 160', 'Enterprise Resource Planning and Management', 3, 3],
    ['ACC 163', 'Updates in Managerial / Financial Reporting', 3, 3],
    ['ACC 165', 'Management Reporting', 3, 3],
    ['ACC 166', 'Enterprise Governance Framework', 3, 3],
    ['ACC 167', 'Operations Auditing', 3, 3],
    ['ACC 169', 'Principles and Methods of Teaching Accounting', 3, 3],
    ['BAM 225', 'Business Analytics', 3, 3],
    ['BAM 243', 'Innovation and Strategy Formulation', 3, 3],
    ['HRE 002', 'Human Resource Management', 3, 3],
];

$minorPrefixes = ['GEN', 'ART', 'HIS', 'MAT', 'PED', 'NST', 'SCX', 'ENG', 'PHI', 'FIL', 'SSP'];
$subjectType = static function (string $code) use ($minorPrefixes): string {
    $prefix = strtoupper(strtok(trim($code), ' ') ?: trim($code));

    return in_array($prefix, $minorPrefixes, true) ? 'minor' : 'core';
};

$curriculumRows = [
    ['GEN 004', 1, 1], ['ART 002', 1, 1], ['GEN 001', 1, 1], ['GEN 005', 1, 1], ['ACC 102', 1, 1], ['PED 030', 1, 1], ['NST 021', 1, 1],
    ['GEN 002', 1, 2], ['GEN 003', 1, 2], ['MAT 152', 1, 2], ['HIS 007', 1, 2], ['ACC 103', 1, 2], ['BAM 201', 1, 2], ['BAM 040', 1, 2], ['PED 031', 1, 2], ['NST 022', 1, 2],
    ['__GEC_ELECTIVE_1__', 2, 1], ['BAM 199', 2, 1], ['__GEC_ELECTIVE_2__', 2, 1], ['BAM 026', 2, 1], ['ACC 106', 2, 1], ['ACC 107', 2, 1], ['FIN 081', 2, 1], ['SSP 005', 2, 1], ['PED 032', 2, 1],
    ['__GEC_ELECTIVE_3__', 2, 2], ['GEN 006', 2, 2], ['ACC 123', 2, 2], ['BAM 241', 2, 2], ['ACC 108', 2, 2], ['ACC 109', 2, 2], ['FIN 072', 2, 2], ['SSP 006', 2, 2], ['PED 033', 2, 2],
    ['PSY 002', 3, 1], ['ACC 191', 3, 1], ['ACC 192', 3, 1], ['BAM 031', 3, 1], ['FIN 083', 3, 1], ['BAM 242', 3, 1], ['ACC 150', 3, 1], ['ACC 116', 3, 1], ['SSP 007', 3, 1],
    ['BAM 062', 3, 2], ['ACC 196', 3, 2], ['ACC 193', 3, 2], ['BAM 283', 3, 2], ['ACC 148', 3, 2], ['ACC 195', 3, 2], ['ACC 117', 3, 2], ['ACC 152', 3, 2], ['SSP 008', 3, 2],
    ['ACC 197', 4, 1], ['BAM 200', 4, 1], ['ACC 194', 4, 1], ['ECO 028', 4, 1], ['ACC 151', 4, 1], ['ACC 146', 4, 1], ['SSP 009', 4, 1], ['__PROF_ELECTIVE_1__', 4, 1],
    ['__PROF_ELECTIVE_2__', 4, 2], ['ACC 149', 4, 2],
];

$slotDefinitions = [
    '__GEC_ELECTIVE_1__' => ['slot_name' => 'BSMA GEC Elective 1', 'year' => 2, 'semester' => 1, 'choices' => ['SCX 010']],
    '__GEC_ELECTIVE_2__' => ['slot_name' => 'BSMA GEC Elective 2', 'year' => 2, 'semester' => 1, 'choices' => ['GEN 010']],
    '__GEC_ELECTIVE_3__' => ['slot_name' => 'BSMA GEC Elective 3', 'year' => 2, 'semester' => 2, 'choices' => ['ENG 188']],
    '__PROF_ELECTIVE_1__' => ['slot_name' => 'BSMA Professional Elective 1', 'year' => 4, 'semester' => 1, 'choices' => ['ACC 179']],
    '__PROF_ELECTIVE_2__' => ['slot_name' => 'BSMA Professional Elective 2', 'year' => 4, 'semester' => 2, 'choices' => ['ACC 180']],
];

$reservedGecElectiveCodes = ['SCX 010', 'GEN 010', 'BAM 006', 'GEN 009', 'PHI 002', 'FIL 125', 'FIL 128'];
$reservedProfessionalElectiveCodes = ['ACC 177', 'ACC 178', 'ACC 179', 'ACC 180', 'ACC 157', 'ACC 160', 'ACC 163', 'ACC 165', 'ACC 166', 'ACC 167', 'ACC 169', 'BAM 225', 'BAM 243', 'HRE 002'];

$prerequisites = [
    'ACC 103' => ['ACC 102'],
    'PED 031' => ['PED 030'],
    'NST 022' => ['NST 021'],
    'BAM 199' => ['BAM 040'],
    'ACC 106' => ['ACC 103'],
    'ACC 107' => ['ACC 103'],
    'FIN 081' => ['ACC 102'],
    'PED 032' => ['PED 031'],
    'BAM 241' => ['BAM 026'],
    'ACC 108' => ['ACC 103'],
    'ACC 109' => ['ACC 103'],
    'FIN 072' => ['FIN 081'],
    'PED 033' => ['PED 032'],
    'ACC 191' => ['ACC 109'],
    'ACC 192' => ['ACC 109'],
    'BAM 031' => ['ACC 103'],
    'FIN 083' => ['ACC 109'],
    'BAM 242' => ['BAM 026'],
    'ACC 150' => ['ACC 109'],
    'SSP 007' => ['SSP 006'],
    'BAM 062' => ['BAM 199'],
    'ACC 196' => ['ACC 192'],
    'ACC 193' => ['ACC 109'],
    'BAM 283' => ['BAM 031'],
    'ACC 148' => ['BAM 199'],
    'ACC 195' => ['ACC 123'],
    'ACC 117' => ['ACC 116'],
    'ACC 152' => ['ACC 116'],
    'SSP 008' => ['SSP 007'],
    'ACC 197' => ['ACC 109'],
    'BAM 200' => ['BAM 199'],
    'ACC 194' => ['FIN 083'],
    'ECO 028' => ['BAM 040'],
    'ACC 151' => ['BAM 127'],
    'ACC 146' => ['ACC 191'],
    'SSP 009' => ['SSP 008'],
    'ACC 179' => ['ACC 109'],
    'ACC 180' => ['ACC 109'],
];

$insertedSubjects = 0;
$updatedSubjects = 0;
$insertedCurriculumRows = 0;
$updatedCurriculumRows = 0;
$insertedRequisites = 0;
$updatedRequisites = 0;
$createdSlots = 0;
$updatedSlots = 0;
$assignedChoices = 0;
$reservedElectiveSubjects = 0;

DB::transaction(function () use (
    $subjects,
    $curriculumRows,
    $slotDefinitions,
    $reservedGecElectiveCodes,
    $reservedProfessionalElectiveCodes,
    $prerequisites,
    $findSubject,
    $subjectId,
    $programId,
    $departmentId,
    $headerId,
    $subjectType,
    &$insertedSubjects,
    &$updatedSubjects,
    &$insertedCurriculumRows,
    &$updatedCurriculumRows,
    &$insertedRequisites,
    &$updatedRequisites,
    &$createdSlots,
    &$updatedSlots,
    &$assignedChoices,
    &$reservedElectiveSubjects
): void {
    foreach ($subjects as [$code, $name, $units, $hours]) {
        $existing = $findSubject($code);
        if ($existing) {
            DB::table('tbl_subjects')->where('subject_id', $existing->subject_id)->update([
                'subject_name' => $existing->subject_name ?: $name,
                'number_of_units' => $existing->number_of_units ?: $units,
                'number_of_hrs' => $existing->number_of_hrs ?: $hours,
            ]);
            $updatedSubjects++;
            continue;
        }

        DB::table('tbl_subjects')->insert([
            'subject_code' => $code,
            'subject_name' => $name,
            'number_of_units' => $units,
            'number_of_hrs' => $hours,
        ]);
        $insertedSubjects++;
    }

    $slotIds = [];
    foreach ($slotDefinitions as $placeholder => $definition) {
        $slotPayload = [
            'program_id' => $programId,
            'year_level_id' => $definition['year'],
            'semester_id' => $definition['semester'],
            'slot_name' => $definition['slot_name'],
            'status' => 'active',
        ];

        $slot = DB::table('tbl_elective_slot')
            ->where('program_id', $programId)
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

        $slotIds[$placeholder] = $slotId;
        $choiceSubjectIds = [];
        foreach ($definition['choices'] as $choiceCode) {
            $choiceSubject = $findSubject($choiceCode);
            if (! $choiceSubject) {
                continue;
            }

            $choiceSubjectIds[] = (int) $choiceSubject->subject_id;
            DB::table('tbl_elective_subject')->updateOrInsert(
                [
                    'elective_slot_id' => $slotId,
                    'subject_id' => $choiceSubject->subject_id,
                    'track_id' => null,
                ],
                [
                    'department_id' => $departmentId,
                    'program_id' => $programId,
                    'description' => null,
                ]
            );
            $assignedChoices++;
        }

        if ($choiceSubjectIds) {
            DB::table('tbl_elective_subject')
                ->where('elective_slot_id', $slotId)
                ->whereNotIn('subject_id', $choiceSubjectIds)
                ->delete();
        }
    }

    foreach (array_merge($reservedGecElectiveCodes, $reservedProfessionalElectiveCodes) as $reservedCode) {
        $reservedSubject = $findSubject($reservedCode);
        if (! $reservedSubject) {
            continue;
        }

        DB::table('tbl_elective_subject')->updateOrInsert(
            [
                'elective_slot_id' => null,
                'subject_id' => $reservedSubject->subject_id,
                'track_id' => null,
                'program_id' => $programId,
            ],
            [
                'department_id' => $departmentId,
                'description' => 'Reserved elective for Management Accounting',
            ]
        );
        $reservedElectiveSubjects++;
    }

    foreach ($curriculumRows as [$code, $year, $semester]) {
        $isElectiveSlot = isset($slotIds[$code]);
        $sid = $isElectiveSlot ? null : $subjectId($code);
        $payload = [
            'curriculum_header_id' => $headerId,
            'program_id' => $programId,
            'subject_id' => $sid,
            'elective_slot_id' => $isElectiveSlot ? $slotIds[$code] : null,
            'year_level' => $year,
            'semester_id' => $semester,
            'passing_grade' => 50,
            'subject_type' => $isElectiveSlot ? 'elective subject' : $subjectType($code),
            'requisite_id' => null,
        ];

        $query = DB::table('curriculum')
            ->where('program_id', $programId)
            ->where('year_level', $year)
            ->where('semester_id', $semester);
        $existing = $isElectiveSlot
            ? $query->where('elective_slot_id', $slotIds[$code])->first()
            : $query->where('subject_id', $sid)->first();

        if ($existing) {
            DB::table('curriculum')->where('curriculum_id', $existing->curriculum_id)->update($payload);
            $updatedCurriculumRows++;
        } else {
            DB::table('curriculum')->insert($payload);
            $insertedCurriculumRows++;
        }
    }

    foreach ([
        ['code' => 'ACC 179', 'year' => 4, 'semester' => 1],
        ['code' => 'ACC 180', 'year' => 4, 'semester' => 2],
    ] as $replacedProfessionalElective) {
        $replacedSubject = $findSubject($replacedProfessionalElective['code']);
        if (! $replacedSubject) {
            continue;
        }

        DB::table('curriculum')
            ->where('program_id', $programId)
            ->where('subject_id', $replacedSubject->subject_id)
            ->where('year_level', $replacedProfessionalElective['year'])
            ->where('semester_id', $replacedProfessionalElective['semester'])
            ->delete();
    }

    $syncPrerequisites = static function (string $targetCode, array $requiredCodes, ?string $ruleLabel = null) use ($subjectId, &$insertedRequisites, &$updatedRequisites): void {
        $targetId = $subjectId($targetCode);
        $requiredIds = collect($requiredCodes)
            ->map(fn (string $code) => $subjectId($code))
            ->filter(fn (int $id) => $id !== $targetId)
            ->unique()
            ->values();

        DB::table('tbl_prerequisite')
            ->where('subject_id', $targetId)
            ->where('requisite_type', 'prerequisite')
            ->whereNotIn('requisites_subject_id', $requiredIds)
            ->delete();

        foreach ($requiredIds as $requiredId) {
            $existing = DB::table('tbl_prerequisite')
                ->where('subject_id', $targetId)
                ->where('requisite_type', 'prerequisite')
                ->where('requisites_subject_id', $requiredId)
                ->first();

            $payload = [
                'subject_id' => $targetId,
                'requisite_type' => 'prerequisite',
                'requisites_subject_id' => $requiredId,
                'rule_label' => $ruleLabel,
            ];

            if ($existing) {
                DB::table('tbl_prerequisite')->where('requisites_id', $existing->requisites_id)->update($payload);
                $updatedRequisites++;
            } else {
                DB::table('tbl_prerequisite')->insert($payload);
                $insertedRequisites++;
            }
        }
    };

    foreach ($prerequisites as $targetCode => $requiredCodes) {
        $syncPrerequisites($targetCode, $requiredCodes);
    }

    $professionalBeforeInternship = collect($curriculumRows)
        ->filter(fn (array $row) => (int) $row[1] < 4 || ((int) $row[1] === 4 && (int) $row[2] === 1))
        ->filter(fn (array $row) => ! isset($slotIds[$row[0]]))
        ->filter(fn (array $row) => $subjectType($row[0]) === 'core')
        ->pluck(0)
        ->all();

    $syncPrerequisites('ACC 149', $professionalBeforeInternship, '100% professional units');
});

echo json_encode([
    'department_id' => $departmentId,
    'program_id' => $programId,
    'curriculum_header_id' => $headerId,
    'inserted_subjects' => $insertedSubjects,
    'updated_subjects' => $updatedSubjects,
    'inserted_curriculum_rows' => $insertedCurriculumRows,
    'updated_curriculum_rows' => $updatedCurriculumRows,
    'created_slots' => $createdSlots,
    'updated_slots' => $updatedSlots,
    'assigned_choice_rows' => $assignedChoices,
    'reserved_elective_subjects' => $reservedElectiveSubjects,
    'inserted_requisites' => $insertedRequisites,
    'updated_requisites' => $updatedRequisites,
], JSON_PRETTY_PRINT) . PHP_EOL;

