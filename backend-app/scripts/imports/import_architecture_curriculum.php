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

$department = DB::table('tbl_departments')->where('department_code', 'CEA')->first()
    ?: DB::table('tbl_departments')->where('department_name', 'like', '%Engineering%Architecture%')->first();

if (! $department) {
    $departmentId = DB::table('tbl_departments')->insertGetId([
        'campus_id' => $campus->campus_id,
        'department_code' => 'CEA',
        'department_name' => 'College of Engineering and Architecture',
    ]);
} else {
    $departmentId = (int) $department->department_id;
    DB::table('tbl_departments')->where('department_id', $departmentId)->update([
        'campus_id' => $department->campus_id ?: $campus->campus_id,
        'department_code' => 'CEA',
        'department_name' => 'College of Engineering and Architecture',
    ]);
}

$program = DB::table('tbl_program')
    ->where('program_code', 'BSARCH')
    ->orWhere('program_name', 'Bachelor of Science in Architecture')
    ->first();

if (! $program) {
    $programId = DB::table('tbl_program')->insertGetId([
        'department_id' => $departmentId,
        'campus_id' => $campus->campus_id,
        'program_code' => 'BSARCH',
        'program_name' => 'Bachelor of Science in Architecture',
        'total_units_required' => 210,
    ]);
} else {
    $programId = (int) $program->program_id;
    DB::table('tbl_program')->where('program_id', $programId)->update([
        'department_id' => $departmentId,
        'campus_id' => $program->campus_id ?: $campus->campus_id,
        'program_code' => 'BSARCH',
        'program_name' => 'Bachelor of Science in Architecture',
        'total_units_required' => 210,
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
        'description' => 'Effective SY 2023-2024; Based on CMO No. 61 Series of 2017',
    ]);
} else {
    $headerId = (int) $header->curriculum_header_id;
    DB::table('tbl_curriculum_header')->where('curriculum_header_id', $headerId)->update([
        'description' => 'Effective SY 2023-2024; Based on CMO No. 61 Series of 2017',
    ]);
}

$subjects = [
    ['ARC 152', 'Architectural Design 1 - Introduction to Design', 2, 2],
    ['ARC 064', 'Architectural Visual Communication 1 - Graphics 1', 3, 3],
    ['ARC 057', 'Theory of Architecture 1', 2, 2],
    ['GEN 002', 'Understanding the Self', 3, 3],
    ['GEN 003', 'Science, Technology, and Society', 3, 3],
    ['HIS 007', 'Life and Works of Rizal', 3, 3],
    ['MAT 152', 'Mathematics in the Modern World', 3, 3],
    ['NST 021', 'National Service Training Program 1', 3, 3],
    ['ARC 002', 'Architectural Design 2 - Creative Design Fundamentals', 2, 2],
    ['ARC 061', 'Architectural Visual Communication 2 - Visual Techniques 1', 2, 2],
    ['ARC 062', 'Theory of Architecture 2', 2, 2],
    ['GEN 004', 'Readings in Philippine History', 3, 3],
    ['GEN 001', 'Purposive Communication', 3, 3],
    ['GEN 005', 'The Contemporary World', 3, 3],
    ['ART 002', 'Art Appreciation', 3, 3],
    ['ARC 072', 'Architectural Interior', 2, 2],
    ['NST 022', 'National Service Training Program 2', 3, 3],
    ['ARC 003', 'Architectural Design 3 - Creative Design Architectural Interior', 3, 3],
    ['ARC 063', 'Architectural Visual Communication 4 - Visual Techniques 2', 2, 2],
    ['ARC 066', 'Architectural Visual Communication 3 - Graphics 2', 3, 3],
    ['GEN 010', 'Gender and Society', 3, 3],
    ['ARC 080', 'History of Architecture 1', 2, 2],
    ['SSP 005', 'Student Success Program 1', 1, 1],
    ['MAT 092', 'Solid Mensuration', 2, 2],
    ['PED 025', 'Movement Enhancement', 2, 2],
    ['ARC 004', 'Architectural Design 4 - Space Planning 1', 3, 3],
    ['ARC 083', 'History of Architecture 2', 2, 2],
    ['ARC 079', 'Building Technology 1 - Building Materials', 3, 3],
    ['ARC 142', 'Building Utilities 1 - Plumbing and Sanitary Systems', 3, 3],
    ['ARC 143', 'Architectural Visual Communication 5 - Visual Techniques 3', 2, 2],
    ['ENG 188', 'Philippine Popular Culture', 3, 3],
    ['SSP 006', 'Student Success Program 2', 1, 1],
    ['MAT 132', 'Differential and Integral Calculus', 3, 3],
    ['PED 026', 'Fitness Exercises', 2, 2],
    ['SCX 010', 'Environmental Science', 3, 3],
    ['GEN 006', 'Ethics', 3, 3],
    ['ARC 005', 'Architectural Design 5 - Space Planning 2', 4, 4],
    ['ARC 084', 'History of Architecture 3', 2, 2],
    ['ARC 144', 'Computer Aided Design and Drafting for Architecture 1', 2, 2],
    ['ARC 076', 'Professional Practice 1 (Laws Affecting the Practice of Architecture)', 3, 3],
    ['ARC 074', 'Building Technology 2 - Construction Drawings in Wood, Steel and Concrete', 3, 3],
    ['BES 025', 'Statics of Rigid Bodies', 3, 3],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    ['PED 027', 'Physical Activities Towards Health and Fitness I', 2, 2],
    ['ARC 006', 'Architectural Design 6 - Site Development Planning and Landscaping', 4, 4],
    ['ARC 145', 'Tropical Design', 2, 2],
    ['ARC 030', 'Building Utilities 2 - Electrical, Electronics and Mechanical System', 3, 3],
    ['BES 005', 'Strength of Materials', 3, 3],
    ['ARC 146', 'History of Architecture 4', 2, 2],
    ['ARC 147', 'Computer Aided Design and Drafting for Architecture 2', 2, 2],
    ['CIE 098', 'Surveying', 3, 3],
    ['ARC 007', 'Architectural Design 7 - Community Architecture and Urban Design', 5, 5],
    ['ARC 148', 'Building Utilities 3 - Acoustics and Lighting System', 3, 3],
    ['ARC 045', 'Planning 1 - Site Planning and Landscaping Architecture', 3, 3],
    ['ARC 149', 'Professional Practice 2 - Administering the Regular Services of the Architect', 3, 3],
    ['ARC 075', 'Building Technology 3 - Construction Drawings in Wood, Steel and Concrete', 3, 3],
    ['CIE 030', 'Theory of Structures', 3, 3],
    ['ARC 008', 'Architectural Design 8 - Design of Complex Structure', 5, 5],
    ['ARC 019', 'Research Method for Architecture', 3, 3],
    ['ARC 085', 'Planning 2 - Fundamentals of Urban Design and Community Architecture', 3, 3],
    ['AHM 001', 'Architectural Specification Writing and Quantity Surveying', 3, 3],
    ['CIE 095A', 'Steel and Timber Design', 3, 3],
    ['ARC 053', 'Community Planning Development', 3, 3],
    ['ARC 050', 'Professional Practice 3 - Global Practice for 21st Century', 3, 3],
    ['ARC 009', 'Architectural Design 9 - Thesis Research Writing', 5, 5],
    ['ARC 058', 'Planning 3 - Introduction to Urban and Regional Planning', 3, 3],
    ['ARC 094', 'Building Technology 5 - Alternative Building Construction', 3, 3],
    ['ARC 076A', 'Architectural Structure', 3, 3],
    ['ARC 150', 'Housing', 2, 2],
    ['ARC 095', 'Business Management and Application for Architecture 1', 3, 3],
    ['ARC 010', 'Architectural Design 10 - Thesis Research Application', 5, 5],
    ['ARC 056', 'Architecture Comprehensive Course', 3, 3],
    ['ARC 086', 'Business Management and Application for Architecture 2', 3, 3],
    ['ARC 055', 'Construction Management', 3, 3],
    ['ARC 073', 'Urban Design', 3, 3],
    ['MAM 062', 'Project Management', 3, 3],
    ['ARC 068', 'Facilities, Utilities and Administration', 3, 3],
    ['ARC 069', 'Geographic Information Systems (GIS)', 3, 3],
];

$minorPrefixes = ['GEN', 'ART', 'HIS', 'MAT', 'PED', 'NST', 'SSP', 'SCX', 'ENG'];
$subjectType = static function (string $code) use ($minorPrefixes): string {
    $prefix = strtoupper(strtok(trim($code), ' ') ?: trim($code));

    return in_array($prefix, $minorPrefixes, true) ? 'minor' : 'core';
};

$curriculumRows = [
    ['ARC 152', 1, 1], ['ARC 064', 1, 1], ['ARC 057', 1, 1], ['GEN 002', 1, 1], ['GEN 003', 1, 1], ['HIS 007', 1, 1], ['MAT 152', 1, 1], ['NST 021', 1, 1],
    ['ARC 002', 1, 2], ['ARC 061', 1, 2], ['ARC 062', 1, 2], ['GEN 004', 1, 2], ['GEN 001', 1, 2], ['GEN 005', 1, 2], ['ART 002', 1, 2], ['ARC 072', 1, 2], ['NST 022', 1, 2],
    ['ARC 003', 2, 1], ['ARC 063', 2, 1], ['ARC 066', 2, 1], ['__GEC_ELECTIVE_1__', 2, 1], ['ARC 080', 2, 1], ['SSP 005', 2, 1], ['MAT 092', 2, 1], ['PED 025', 2, 1],
    ['ARC 004', 2, 2], ['ARC 083', 2, 2], ['ARC 079', 2, 2], ['ARC 142', 2, 2], ['ARC 143', 2, 2], ['__GEC_ELECTIVE_2__', 2, 2], ['SSP 006', 2, 2], ['MAT 132', 2, 2], ['PED 026', 2, 2],
    ['__GEC_ELECTIVE_3__', 2, 3], ['GEN 006', 2, 3],
    ['ARC 005', 3, 1], ['ARC 084', 3, 1], ['ARC 144', 3, 1], ['ARC 076', 3, 1], ['ARC 074', 3, 1], ['BES 025', 3, 1], ['SSP 007', 3, 1], ['PED 027', 3, 1],
    ['ARC 006', 3, 2], ['ARC 145', 3, 2], ['ARC 030', 3, 2], ['BES 005', 3, 2], ['ARC 146', 3, 2], ['ARC 147', 3, 2], ['CIE 098', 3, 2],
    ['ARC 007', 4, 1], ['ARC 148', 4, 1], ['ARC 045', 4, 1], ['ARC 149', 4, 1], ['ARC 075', 4, 1], ['CIE 030', 4, 1],
    ['ARC 008', 4, 2], ['ARC 019', 4, 2], ['ARC 085', 4, 2], ['AHM 001', 4, 2], ['CIE 095A', 4, 2],
    ['__SPEC_ELECTIVE_1__', 4, 3], ['ARC 050', 4, 3],
    ['ARC 009', 5, 1], ['ARC 058', 5, 1], ['ARC 094', 5, 1], ['ARC 076A', 5, 1], ['ARC 150', 5, 1], ['ARC 095', 5, 1], ['SSP 009', 5, 1],
    ['ARC 010', 5, 2], ['ARC 056', 5, 2], ['ARC 086', 5, 2], ['__SPEC_ELECTIVE_2__', 5, 2], ['__SPEC_ELECTIVE_3__', 5, 2],
];

$slotDefinitions = [
    '__GEC_ELECTIVE_1__' => ['slot_name' => 'BSARCH GEC Elective 1', 'year' => 2, 'semester' => 1, 'choices' => ['GEN 010']],
    '__GEC_ELECTIVE_2__' => ['slot_name' => 'BSARCH GEC Elective 2', 'year' => 2, 'semester' => 2, 'choices' => ['ENG 188']],
    '__GEC_ELECTIVE_3__' => ['slot_name' => 'BSARCH GEC Elective 3', 'year' => 2, 'semester' => 3, 'choices' => ['SCX 010']],
    '__SPEC_ELECTIVE_1__' => ['slot_name' => 'BSARCH Specialization Elective 1', 'year' => 4, 'semester' => 3, 'choices' => ['ARC 053']],
    '__SPEC_ELECTIVE_2__' => ['slot_name' => 'BSARCH Specialization Elective 2', 'year' => 5, 'semester' => 2, 'choices' => ['ARC 055']],
    '__SPEC_ELECTIVE_3__' => ['slot_name' => 'BSARCH Specialization Elective 3', 'year' => 5, 'semester' => 2, 'choices' => ['ARC 073']],
];

$reservedSpecializationElectiveCodes = ['ARC 053', 'ARC 073', 'ARC 055', 'MAM 062', 'ARC 068', 'ARC 069'];

$prerequisites = [
    'ARC 002' => ['ARC 152', 'ARC 057'],
    'ARC 061' => ['ARC 064'],
    'ARC 062' => ['ARC 057'],
    'ARC 072' => ['ARC 057'],
    'NST 022' => ['NST 021'],
    'ARC 003' => ['ARC 002', 'ARC 061', 'ARC 072'],
    'ARC 063' => ['ARC 061'],
    'ARC 066' => ['ARC 064'],
    'MAT 092' => ['MAT 152'],
    'ARC 004' => ['ARC 003'],
    'ARC 083' => ['ARC 080'],
    'ARC 143' => ['ARC 063'],
    'MAT 132' => ['MAT 152', 'MAT 092'],
    'PED 026' => ['PED 025'],
    'ARC 005' => ['ARC 004'],
    'ARC 084' => ['ARC 083'],
    'ARC 144' => ['ARC 143'],
    'ARC 074' => ['ARC 079'],
    'PED 027' => ['PED 026'],
    'ARC 006' => ['ARC 005'],
    'ARC 030' => ['ARC 142'],
    'BES 005' => ['BES 025'],
    'ARC 146' => ['ARC 084'],
    'ARC 147' => ['ARC 144'],
    'CIE 098' => ['BES 025'],
    'ARC 007' => ['ARC 006'],
    'ARC 148' => ['ARC 030'],
    'ARC 045' => ['CIE 098'],
    'ARC 149' => ['ARC 076'],
    'ARC 075' => ['ARC 074'],
    'CIE 030' => ['BES 005'],
    'ARC 008' => ['ARC 007'],
    'ARC 085' => ['ARC 045'],
    'AHM 001' => ['ARC 075'],
    'CIE 095A' => ['CIE 030'],
    'ARC 053' => ['ARC 007'],
    'ARC 050' => ['ARC 149'],
    'ARC 058' => ['ARC 085'],
    'ARC 094' => ['ARC 075'],
    'ARC 076A' => ['CIE 095A'],
    'ARC 095' => ['ARC 050'],
    'ARC 010' => ['ARC 009'],
    'ARC 086' => ['ARC 095'],
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
    $reservedSpecializationElectiveCodes,
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

    foreach ($reservedSpecializationElectiveCodes as $reservedCode) {
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
                'description' => 'Reserved specialization elective for Architecture',
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

    $syncPrerequisites = static function (string $targetCode, array $requiredCodes, ?string $ruleLabel = null) use ($subjectId, $programId, &$insertedRequisites, &$updatedRequisites): void {
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

        $firstRequisiteId = null;
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
                $requisiteId = (int) $existing->requisites_id;
                DB::table('tbl_prerequisite')->where('requisites_id', $requisiteId)->update($payload);
                $updatedRequisites++;
            } else {
                $requisiteId = DB::table('tbl_prerequisite')->insertGetId($payload);
                $insertedRequisites++;
            }

            $firstRequisiteId ??= $requisiteId;
        }

        DB::table('curriculum')
            ->where('program_id', $programId)
            ->where('subject_id', $targetId)
            ->update(['requisite_id' => $firstRequisiteId]);
    };

    foreach ($prerequisites as $targetCode => $requiredCodes) {
        $syncPrerequisites($targetCode, $requiredCodes);
    }

    $codesBeforeThesis = [];
    foreach ($curriculumRows as [$code, $year, $semester]) {
        if ($code === 'ARC 009') {
            continue;
        }

        if ((int) $year > 4) {
            continue;
        }

        if (isset($slotDefinitions[$code])) {
            array_push($codesBeforeThesis, ...$slotDefinitions[$code]['choices']);
            continue;
        }

        $codesBeforeThesis[] = $code;
    }
    $syncPrerequisites('ARC 009', array_values(array_unique($codesBeforeThesis)), 'all subjects');
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

