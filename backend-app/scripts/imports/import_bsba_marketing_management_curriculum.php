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
    ->where('program_code', 'BSBAMM')
    ->orWhere('program_name', 'Bachelor of Science in Business Administration Major in Marketing Management')
    ->first();

if (! $program) {
    $programId = DB::table('tbl_program')->insertGetId([
        'department_id' => $departmentId,
        'campus_id' => $campus->campus_id,
        'program_code' => 'BSBAMM',
        'program_name' => 'Bachelor of Science in Business Administration Major in Marketing Management',
        'total_units_required' => 126,
    ]);
} else {
    $programId = (int) $program->program_id;
    DB::table('tbl_program')->where('program_id', $programId)->update([
        'department_id' => $program->department_id ?: $departmentId,
        'campus_id' => $program->campus_id ?: $campus->campus_id,
        'program_code' => $program->program_code ?: 'BSBAMM',
        'program_name' => 'Bachelor of Science in Business Administration Major in Marketing Management',
        'total_units_required' => $program->total_units_required ?: 126,
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
        'description' => 'Effective SY 2023-2024; Based on CMO No. 17 Series of 2017',
    ]);
} else {
    $headerId = (int) $header->curriculum_header_id;
    DB::table('tbl_curriculum_header')->where('curriculum_header_id', $headerId)->update([
        'description' => 'Effective SY 2023-2024; Based on CMO No. 17 Series of 2017',
    ]);
}

$subjects = [
    ['GEN 004', 'Readings in Philippine History', 3, 3],
    ['GEN 001', 'Purposive Communication', 3, 3],
    ['ART 002', 'Art Appreciation', 3, 3],
    ['GEN 005', 'The Contemporary World', 3, 3],
    ['BAM 191', 'Fundamentals of Business Administration', 3, 3],
    ['GEN 008', 'Living in the IT Era', 3, 3],
    ['PED 030', 'Physical Activities Toward Health and Fitness I: Movement Competency Training', 2, 2],
    ['NST 021', 'National Service Training Program 1', 3, 3],
    ['GEN 002', 'Understanding the Self', 3, 3],
    ['GEN 003', 'Science, Technology and Society', 3, 3],
    ['MAT 152', 'Mathematics in the Modern World', 3, 3],
    ['HIS 007', 'Life and Works of Rizal', 3, 3],
    ['ACC 104', 'Fundamentals of Accounting and FS Analysis', 3, 3],
    ['MKT 005', 'Professional Salesmanship', 3, 3],
    ['PED 031', 'Physical Activities Toward Health and Fitness II: Exercise-Based Fitness Activities', 2, 2],
    ['NST 022', 'National Service Training Program 2', 3, 3],
    ['MKT 046', 'E-Commerce and Digital Marketing', 3, 3],
    ['GEN 009', 'The Entrepreneurial Mind', 3, 3],
    ['MKT 001', 'Product Management', 3, 3],
    ['MKT 006', 'Advertising', 3, 3],
    ['ECO 025', 'Basic Microeconomics', 3, 3],
    ['MKT 002', 'Marketing Management', 3, 3],
    ['SSP 005', 'Student Success Program 1', 1, 1],
    ['PED 032', 'Physical Activities Toward Health and Fitness III: Individual and Dual Sports', 2, 2],
    ['BAM 006', 'Business Communication', 3, 3],
    ['MKT 048', 'Pricing Strategy with Business Analytics', 3, 3],
    ['GEN 006', 'Ethics', 3, 3],
    ['BAM 127', 'Income Taxation for BA', 3, 3],
    ['MKT 007', 'Retail Management', 3, 3],
    ['MKT 009', 'Distribution Management', 3, 3],
    ['SSP 006', 'Student Success Program 2', 1, 1],
    ['PED 033', 'Physical Activities Toward Health and Fitness IV: Team Sports', 2, 2],
    ['MKT 003', 'Marketing Research', 3, 3],
    ['BAM 069', 'Business Research', 3, 3],
    ['BAM 201', 'International Business and Trade', 3, 3],
    ['BAM 199', 'Operations Management (TQM)', 3, 3],
    ['MKT ELEC 4', 'Professional Elective 4', 3, 3],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    ['BAM 023', 'Feasibility Study', 3, 3],
    ['BAM 200', 'Strategic Management', 3, 3],
    ['BAM 128', 'Law on Obligations and Contracts for Business Administration', 3, 3],
    ['BAM 193', 'Good Governance and Social Responsibility', 3, 3],
    ['HRE 002', 'Human Resource Management', 3, 3],
    ['SSP 008', 'Student Success Program 4', 1, 1],
    ['BAM 287', 'Business Administration Internship 1 (local or international) - 300 hours', 3, 3],
    ['BAM 288', 'Business Administration Internship 2 (local or international) - 300 hours', 3, 3],
    ['MKT 016', 'Consumer Behavior', 3, 3],
    ['MKT 014', 'International Marketing', 3, 3],
    ['MKT 073', 'Direct Marketing', 3, 3],
    ['MKT 013', 'Services Marketing', 3, 3],
    ['MKT 112', 'Industrial/Agricultural Marketing', 3, 3],
    ['MKT 018', 'Customer Value Marketing', 3, 3],
    ['MKT 034', 'New Market Development', 3, 3],
    ['MKT 036', 'Strategic Marketing Management', 3, 3],
    ['MKT 025', 'Environmental Marketing', 3, 3],
    ['MKT 022', 'Special Topics in Marketing Management', 3, 3],
    ['BAM 217', 'Personal Finance', 3, 3],
    ['BAM 225', 'Business Analytics', 3, 3],
    ['BAM 175', 'Fundamentals of Business Process Outsourcing 101', 3, 3],
    ['BAM 180', 'Fundamentals of Business Process Outsourcing 102', 3, 3],
    ['BAM 316', 'Principles of System Thinking', 3, 3],
    ['BAM 181', 'Customer Relationship Management', 3, 3],
    ['BAM 318', 'Professional Development and Career Planning', 3, 3],
    ['BAM 182', 'Business Information System', 3, 3],
    ['BAM 219', 'Information Technology Application Tools for Business', 3, 3],
];

$minorPrefixes = ['GEN', 'ART', 'HIS', 'MAT', 'PED', 'NST', 'SSP'];
$subjectType = static function (string $code) use ($minorPrefixes): string {
    $prefix = strtoupper(strtok(trim($code), ' ') ?: trim($code));

    return in_array($prefix, $minorPrefixes, true) ? 'minor' : 'core';
};

$curriculumRows = [
    ['GEN 004', 1, 1], ['GEN 001', 1, 1], ['ART 002', 1, 1], ['GEN 005', 1, 1], ['BAM 191', 1, 1], ['__GEC_ELECTIVE_1__', 1, 1], ['PED 030', 1, 1], ['NST 021', 1, 1],
    ['GEN 002', 1, 2], ['GEN 003', 1, 2], ['MAT 152', 1, 2], ['HIS 007', 1, 2], ['ACC 104', 1, 2], ['MKT 005', 1, 2], ['PED 031', 1, 2], ['NST 022', 1, 2],
    ['MKT 046', 2, 1], ['__GEC_ELECTIVE_2__', 2, 1], ['MKT 001', 2, 1], ['MKT 006', 2, 1], ['ECO 025', 2, 1], ['MKT 002', 2, 1], ['SSP 005', 2, 1], ['PED 032', 2, 1],
    ['__GEC_ELECTIVE_3__', 2, 2], ['MKT 048', 2, 2], ['GEN 006', 2, 2], ['BAM 127', 2, 2], ['MKT 007', 2, 2], ['MKT 009', 2, 2], ['SSP 006', 2, 2], ['PED 033', 2, 2],
    ['MKT 003', 3, 1], ['BAM 069', 3, 1], ['BAM 201', 3, 1], ['BAM 199', 3, 1], ['__PROF_ELECTIVE_4__', 3, 1], ['SSP 007', 3, 1],
    ['BAM 023', 3, 2], ['BAM 200', 3, 2], ['BAM 128', 3, 2], ['BAM 193', 3, 2], ['HRE 002', 3, 2], ['SSP 008', 3, 2],
    ['BAM 287', 4, 1],
    ['BAM 288', 4, 2],
];

// Only sync non-conflicting or Marketing-specific prerequisites because requisites are subject-level.
$prerequisites = [
    'PED 031' => ['PED 030'],
    'NST 022' => ['NST 021'],
    'MKT 001' => ['BAM 191'],
    'MKT 006' => ['BAM 191'],
    'PED 032' => ['PED 031'],
    'MKT 048' => ['MKT 001'],
    'BAM 127' => ['ACC 104'],
    'MKT 007' => ['MKT 002'],
    'MKT 009' => ['MKT 002'],
    'SSP 006' => ['SSP 005'],
    'PED 033' => ['PED 032'],
    'MKT ELEC 4' => ['MKT 002'],
    'BAM 023' => ['BAM 069'],
    'BAM 200' => ['BAM 193'],
    'SSP 008' => ['SSP 007'],
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

$reservedProfessionalElectiveCodes = [
    'BAM 191',
    'ACC 104',
    'MKT 016',
    'MKT 005',
    'MKT 014',
    'MKT 046',
    'BAM 012',
    'MKT 073',
    'MKT 013',
    'MKT 112',
    'MKT 018',
    'MKT 034',
    'MKT 036',
    'MKT 025',
    'MKT 022',
    'BAM 217',
    'BAM 225',
    'BAM 175',
    'BAM 180',
    'BAM 316',
    'BAM 181',
    'BAM 318',
    'BAM 182',
    'BAM 219',
];

$gecElectiveSlots = [
    '__GEC_ELECTIVE_1__' => ['slot_name' => 'BSBAMM GEC Elective 1', 'year' => 1, 'semester' => 1, 'replace_code' => 'GEN 008'],
    '__GEC_ELECTIVE_2__' => ['slot_name' => 'BSBAMM GEC Elective 2', 'year' => 2, 'semester' => 1, 'replace_code' => 'GEN 009'],
    '__GEC_ELECTIVE_3__' => ['slot_name' => 'BSBAMM GEC Elective 3', 'year' => 2, 'semester' => 2, 'replace_code' => 'BAM 006'],
];

$gecElectiveChoiceCodes = ['GEN 008', 'GEN 009', 'BAM 006'];

DB::transaction(function () use (
    $subjects,
    $curriculumRows,
    $prerequisites,
    $findSubject,
    $subjectId,
    $programId,
    $departmentId,
    $headerId,
    $subjectType,
    $reservedProfessionalElectiveCodes,
    $gecElectiveSlots,
    $gecElectiveChoiceCodes,
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

    $electiveSubject = $findSubject('MKT ELEC 4');
    $slot = DB::table('tbl_elective_slot')
        ->where('program_id', $programId)
        ->where('slot_name', 'BSBAMM Professional Elective 4')
        ->first();
    $slotPayload = [
        'program_id' => $programId,
        'year_level_id' => 3,
        'semester_id' => 1,
        'slot_name' => 'BSBAMM Professional Elective 4',
        'status' => 'active',
    ];
    if ($slot) {
        $slotId = (int) $slot->elective_slot_id;
        DB::table('tbl_elective_slot')->where('elective_slot_id', $slotId)->update($slotPayload);
        $updatedSlots++;
    } else {
        $slotId = DB::table('tbl_elective_slot')->insertGetId($slotPayload);
        $createdSlots++;
    }

    DB::table('tbl_elective_subject')->updateOrInsert(
        [
            'elective_slot_id' => $slotId,
            'subject_id' => $electiveSubject->subject_id,
            'track_id' => null,
        ],
        [
            'department_id' => $departmentId,
            'program_id' => $programId,
            'description' => null,
        ]
    );
    $assignedChoices++;

    $electiveSlotIds = [
        '__PROF_ELECTIVE_4__' => $slotId,
    ];

    foreach ($gecElectiveSlots as $placeholder => $definition) {
        $gecSlotPayload = [
            'program_id' => $programId,
            'year_level_id' => $definition['year'],
            'semester_id' => $definition['semester'],
            'slot_name' => $definition['slot_name'],
            'status' => 'active',
        ];

        $gecSlot = DB::table('tbl_elective_slot')
            ->where('program_id', $programId)
            ->where('slot_name', $definition['slot_name'])
            ->first();

        if ($gecSlot) {
            $gecSlotId = (int) $gecSlot->elective_slot_id;
            DB::table('tbl_elective_slot')->where('elective_slot_id', $gecSlotId)->update($gecSlotPayload);
            $updatedSlots++;
        } else {
            $gecSlotId = DB::table('tbl_elective_slot')->insertGetId($gecSlotPayload);
            $createdSlots++;
        }

        $electiveSlotIds[$placeholder] = $gecSlotId;
        $choiceSubjectIds = [];
        foreach ($gecElectiveChoiceCodes as $choiceCode) {
            $choiceSubject = $findSubject($choiceCode);
            if (! $choiceSubject) {
                continue;
            }

            $choiceSubjectIds[] = (int) $choiceSubject->subject_id;
            DB::table('tbl_elective_subject')->updateOrInsert(
                [
                    'elective_slot_id' => $gecSlotId,
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
                ->where('elective_slot_id', $gecSlotId)
                ->whereNotIn('subject_id', $choiceSubjectIds)
                ->delete();
        }

        $replaceSubject = $findSubject($definition['replace_code']);
        if ($replaceSubject) {
            DB::table('curriculum')
                ->where('program_id', $programId)
                ->where('subject_id', $replaceSubject->subject_id)
                ->where('year_level', $definition['year'])
                ->where('semester_id', $definition['semester'])
                ->update([
                    'subject_id' => null,
                    'elective_slot_id' => $gecSlotId,
                    'subject_type' => 'elective subject',
                    'requisite_id' => null,
                ]);
        }
    }

    foreach ($reservedProfessionalElectiveCodes as $reservedCode) {
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
                'description' => 'Reserved professional elective for Marketing Management',
            ]
        );
        $reservedElectiveSubjects++;
    }

    foreach ($curriculumRows as [$code, $year, $semester]) {
        $isElectiveSlot = isset($electiveSlotIds[$code]);
        $sid = $isElectiveSlot ? null : $subjectId($code);
        $payload = [
            'curriculum_header_id' => $headerId,
            'program_id' => $programId,
            'subject_id' => $sid,
            'elective_slot_id' => $isElectiveSlot ? $electiveSlotIds[$code] : null,
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
            ? $query->where('elective_slot_id', $electiveSlotIds[$code])->first()
            : $query->where('subject_id', $sid)->first();

        if ($existing) {
            DB::table('curriculum')->where('curriculum_id', $existing->curriculum_id)->update($payload);
            $updatedCurriculumRows++;
        } else {
            DB::table('curriculum')->insert($payload);
            $insertedCurriculumRows++;
        }
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

