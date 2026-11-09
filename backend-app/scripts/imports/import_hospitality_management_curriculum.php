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
    ->where('program_code', 'BSHM')
    ->orWhere('program_name', 'Bachelor of Science in Hospitality Management')
    ->first();

if (! $program) {
    $programId = DB::table('tbl_program')->insertGetId([
        'department_id' => $departmentId,
        'campus_id' => $campus->campus_id,
        'program_code' => 'BSHM',
        'program_name' => 'Bachelor of Science in Hospitality Management',
        'total_units_required' => 126,
    ]);
} else {
    $programId = (int) $program->program_id;
    DB::table('tbl_program')->where('program_id', $programId)->update([
        'department_id' => $program->department_id ?: $departmentId,
        'campus_id' => $program->campus_id ?: $campus->campus_id,
        'program_code' => $program->program_code ?: 'BSHM',
        'program_name' => 'Bachelor of Science in Hospitality Management',
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
        'description' => 'Effective SY 2023-2024; Based on CMO No. 62 Series of 2017',
    ]);
} else {
    $headerId = (int) $header->curriculum_header_id;
    DB::table('tbl_curriculum_header')->where('curriculum_header_id', $headerId)->update([
        'description' => 'Effective SY 2023-2024; Based on CMO No. 62 Series of 2017',
    ]);
}

$subjects = [
    ['GEN 004', 'Readings in Philippine History', 3, 3],
    ['ART 002', 'Art Appreciation', 3, 3],
    ['GEN 001', 'Purposive Communication', 3, 3],
    ['GEN 005', 'The Contemporary World', 3, 3],
    ['TOU 040', 'Macro Perspective of Tourism and Hospitality', 3, 3],
    ['TOU 041', 'Risk Management as Applied to Safety, Security and Sanitation', 3, 3],
    ['PED 030', 'Physical Activities Toward Health and Fitness I: Movement Competency Training', 2, 2],
    ['NST 021', 'National Service Training Program 1', 3, 3],
    ['GEN 002', 'Understanding the Self', 3, 3],
    ['GEN 003', 'Science, Technology and Society', 3, 3],
    ['MAT 152', 'Mathematics in the Modern World', 3, 3],
    ['HIS 007', 'Life and Works of Rizal', 3, 3],
    ['TOU 042', 'Micro Perspective of Tourism and Hospitality', 3, 3],
    ['TOU 043', 'Philippine Culture and Tourism Geography', 3, 3],
    ['PED 031', 'Physical Activities Toward Health and Fitness II: Exercise-Based Fitness Activities', 2, 2],
    ['NST 022', 'National Service Training Program 2', 3, 3],
    ['GEN 006', 'Ethics', 3, 3],
    ['GEN 010', 'Gender and Society', 3, 3],
    ['HRM 136', 'Quality Service Management in Tourism and Hospitality', 3, 3],
    ['TOU 044', 'Tourism and Hospitality Marketing', 3, 3],
    ['HRM 149', 'Kitchen Essentials and Basic Food Preparation', 3, 3],
    ['HRM 137', 'Fundamentals of Food Service Operations', 3, 3],
    ['SSP 005', 'Student Success Program 1', 1, 1],
    ['PED 032', 'Physical Activities Toward Health and Fitness III: Individual and Dual Sport', 2, 2],
    ['ENG 188', 'Philippine Popular Culture', 3, 3],
    ['HRM 138', 'Professional Development and Applied Ethics', 3, 3],
    ['TOU 045', 'Legal Aspects in Tourism and Hospitality', 3, 3],
    ['HRM 150', 'Fundamentals in Lodging Operations', 3, 3],
    ['HRM 139', 'Supply Chain Management in Hospitality Industry', 3, 3],
    ['HRM 140', 'Ergonomics and Facilities Planning for the Hospitality Industry', 3, 3],
    ['HRM 151', 'Applied Business Tools and Technologies', 3, 3],
    ['SSP 006', 'Student Success Program 2', 1, 1],
    ['PED 033', 'Physical Activities Toward Health and Fitness IV: Team Sports', 2, 2],
    ['BAM 158', 'Operations Management', 3, 3],
    ['TOU 046', 'Entrepreneurship in Tourism and Hospitality', 3, 3],
    ['TOU 083', 'Introduction to Meetings, Incentives, Conferences and Exhibitions', 3, 3],
    ['FOL 002', 'Mandarin 1', 3, 3],
    ['FOL 003', 'Mandarin 2', 3, 3],
    ['FOL 015', 'French 1', 3, 3],
    ['FOL 016', 'French 2', 3, 3],
    ['FOL 014', 'Spanish 1', 3, 3],
    ['FOL 006', 'Spanish 2', 3, 3],
    ['HRM 131', 'Food and Beverage Knowledge', 3, 3],
    ['HRM 183', 'Food and Beverage Labor Cost Control', 3, 3],
    ['HRM 175', 'Bread and Pastry', 3, 3],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    ['HRM 141', 'Strategic Management and Total Quality Management', 3, 3],
    ['HRM 153', 'Research in Hospitality', 3, 3],
    ['HRM 032', 'Bar and Beverage Management with Laboratory', 3, 3],
    ['HRM 178', 'Banquet and Catering Management', 3, 3],
    ['SSP 008', 'Student Success Program 4', 1, 1],
    ['SSP 009', 'Student Success Program 5', 1, 1],
    ['SCX 010', 'Environmental Science', 3, 3],
    ['TOU 047', 'Multicultural Diversity in Workplace for the Tourism Professional', 3, 3],
    ['HRM 152', 'Hospitality Management Local Practicum 1', 3, 3],
    ['HRM 189', 'Hospitality Management Local/International Practicum 2', 3, 3],
    ['HRM 190', 'Hospitality Management Local/International Practicum 3', 6, 6],
    ['HRM 166', 'Housekeeping Operations', 3, 3],
    ['HRM 167', 'Food Styling and Designs', 3, 3],
    ['HRM 168', 'Philippine Regional Cuisine', 3, 3],
    ['HRM 169', 'Culinary Nutrition', 3, 3],
    ['HRM 170', 'Food and Beverage Service with Laboratory', 3, 3],
    ['HRM 171', 'Oenology', 3, 3],
    ['HRM 172', 'Classical French Cuisine', 3, 3],
    ['HRM 173', 'Gastronomy (Food and Culture)', 3, 3],
    ['HRM 176', 'Asian Cuisine', 3, 3],
    ['HRM 177', 'Specialty Cuisine', 3, 3],
    ['HRM 179', 'Menu Design and Revenue Management', 3, 3],
    ['HRM 180', 'Trends and Issues in Hospitality Management', 3, 3],
    ['HRM 181', 'Cruise Ship Operations and Management', 3, 3],
    ['HRM 182', 'Data Analytics in the Hospitality Industry', 3, 3],
    ['HRM 184', 'Rooms Division Cost Control', 3, 3],
    ['HRM 185', 'Franchising', 3, 3],
    ['HRM 186', 'Front Office Procedure', 3, 3],
];

$minorPrefixes = ['GEN', 'ART', 'HIS', 'MAT', 'PED', 'NST', 'SSP', 'SCX', 'ENG', 'FOL'];
$subjectType = static function (string $code) use ($minorPrefixes): string {
    $prefix = strtoupper(strtok(trim($code), ' ') ?: trim($code));

    return in_array($prefix, $minorPrefixes, true) ? 'minor' : 'core';
};

$curriculumRows = [
    ['GEN 004', 1, 1], ['ART 002', 1, 1], ['GEN 001', 1, 1], ['GEN 005', 1, 1], ['TOU 040', 1, 1], ['TOU 041', 1, 1], ['PED 030', 1, 1], ['NST 021', 1, 1],
    ['GEN 002', 1, 2], ['GEN 003', 1, 2], ['MAT 152', 1, 2], ['HIS 007', 1, 2], ['TOU 042', 1, 2], ['TOU 043', 1, 2], ['PED 031', 1, 2], ['NST 022', 1, 2],
    ['GEN 006', 2, 1], ['__GEC_ELECTIVE_1__', 2, 1], ['HRM 136', 2, 1], ['TOU 044', 2, 1], ['HRM 149', 2, 1], ['HRM 137', 2, 1], ['SSP 005', 2, 1], ['PED 032', 2, 1],
    ['__GEC_ELECTIVE_2__', 2, 2], ['HRM 138', 2, 2], ['TOU 045', 2, 2], ['HRM 150', 2, 2], ['HRM 139', 2, 2], ['HRM 140', 2, 2], ['HRM 151', 2, 2], ['SSP 006', 2, 2], ['PED 033', 2, 2],
    ['BAM 158', 3, 1], ['TOU 046', 3, 1], ['TOU 083', 3, 1], ['__FOREIGN_LANGUAGE_1__', 3, 1], ['__PROF_ELECTIVE_1__', 3, 1], ['__PROF_ELECTIVE_2__', 3, 1], ['__PROF_ELECTIVE_3__', 3, 1], ['SSP 007', 3, 1],
    ['HRM 141', 3, 2], ['__FOREIGN_LANGUAGE_2__', 3, 2], ['HRM 153', 3, 2], ['__PROF_ELECTIVE_4__', 3, 2], ['__PROF_ELECTIVE_5__', 3, 2], ['SSP 008', 3, 2], ['SSP 009', 3, 2], ['__GEC_ELECTIVE_3__', 3, 2], ['TOU 047', 3, 2],
    ['HRM 152', 4, 1], ['HRM 189', 4, 1],
    ['HRM 190', 4, 2],
];

$slotDefinitions = [
    '__GEC_ELECTIVE_1__' => ['slot_name' => 'BSHM GEC Elective 1', 'year' => 2, 'semester' => 1, 'choices' => ['GEN 010']],
    '__GEC_ELECTIVE_2__' => ['slot_name' => 'BSHM GEC Elective 2', 'year' => 2, 'semester' => 2, 'choices' => ['ENG 188']],
    '__GEC_ELECTIVE_3__' => ['slot_name' => 'BSHM GEC Elective 3', 'year' => 3, 'semester' => 2, 'choices' => ['SCX 010']],
    '__FOREIGN_LANGUAGE_1__' => ['slot_name' => 'BSHM Foreign Language 1', 'year' => 3, 'semester' => 1, 'choices' => ['FOL 002', 'FOL 015', 'FOL 014']],
    '__FOREIGN_LANGUAGE_2__' => ['slot_name' => 'BSHM Foreign Language 2', 'year' => 3, 'semester' => 2, 'choices' => ['FOL 003', 'FOL 016', 'FOL 006']],
    '__PROF_ELECTIVE_1__' => ['slot_name' => 'BSHM Professional Elective 1', 'year' => 3, 'semester' => 1, 'choices' => ['HRM 131']],
    '__PROF_ELECTIVE_2__' => ['slot_name' => 'BSHM Professional Elective 2', 'year' => 3, 'semester' => 1, 'choices' => ['HRM 183']],
    '__PROF_ELECTIVE_3__' => ['slot_name' => 'BSHM Professional Elective 3', 'year' => 3, 'semester' => 1, 'choices' => ['HRM 175']],
    '__PROF_ELECTIVE_4__' => ['slot_name' => 'BSHM Professional Elective 4', 'year' => 3, 'semester' => 2, 'choices' => ['HRM 032']],
    '__PROF_ELECTIVE_5__' => ['slot_name' => 'BSHM Professional Elective 5', 'year' => 3, 'semester' => 2, 'choices' => ['HRM 178']],
];

$reservedProfessionalElectiveCodes = [
    'HRM 131', 'HRM 166', 'HRM 167', 'HRM 168', 'HRM 169', 'HRM 170',
    'HRM 171', 'HRM 172', 'HRM 173', 'HRM 032', 'HRM 175', 'HRM 176',
    'HRM 177', 'HRM 178', 'HRM 179', 'HRM 180', 'HRM 181', 'HRM 182',
    'HRM 183', 'HRM 184', 'HRM 185', 'HRM 186',
];

$prerequisites = [
    'TOU 042' => ['TOU 040'],
    'PED 031' => ['PED 030'],
    'NST 022' => ['NST 021'],
    'HRM 149' => ['TOU 041'],
    'PED 032' => ['PED 031'],
    'HRM 138' => ['GEN 006'],
    'HRM 139' => ['HRM 137'],
    'HRM 140' => ['HRM 136'],
    'SSP 006' => ['SSP 005'],
    'PED 033' => ['PED 032'],
    'TOU 046' => ['TOU 044'],
    'SSP 007' => ['SSP 006'],
    'SSP 008' => ['SSP 007'],
    'SSP 009' => ['SSP 007'],
    'FOL 003' => ['FOL 002'],
    'FOL 016' => ['FOL 015'],
    'FOL 006' => ['FOL 014'],
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
                'description' => 'Reserved professional elective for Hospitality Management',
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

    $coreBeforePracticum = collect($curriculumRows)
        ->filter(fn (array $row) => (int) $row[1] < 4)
        ->filter(fn (array $row) => ! isset($slotIds[$row[0]]))
        ->filter(fn (array $row) => $subjectType($row[0]) === 'core')
        ->pluck(0)
        ->all();

    $syncPrerequisites('HRM 152', $coreBeforePracticum, 'all major subjects');
    $syncPrerequisites('HRM 189', $coreBeforePracticum, 'all major subjects');
    $syncPrerequisites('HRM 190', $coreBeforePracticum, 'all major subjects');
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

