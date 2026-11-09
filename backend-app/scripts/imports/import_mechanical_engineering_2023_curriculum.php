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
    ->where('program_code', 'BSME')
    ->orWhere('program_name', 'Bachelor of Science in Mechanical Engineering')
    ->first();

if (! $program) {
    $programId = DB::table('tbl_program')->insertGetId([
        'department_id' => $departmentId,
        'campus_id' => $campus->campus_id,
        'program_code' => 'BSME',
        'program_name' => 'Bachelor of Science in Mechanical Engineering',
        'total_units_required' => 185,
    ]);
} else {
    $programId = (int) $program->program_id;
    DB::table('tbl_program')->where('program_id', $programId)->update([
        'department_id' => $departmentId,
        'campus_id' => $program->campus_id ?: $campus->campus_id,
        'program_code' => 'BSME',
        'program_name' => 'Bachelor of Science in Mechanical Engineering',
        'total_units_required' => 185,
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
        'description' => 'Effective SY 2023-2024; Based on CMO No. 97 Series of 2017',
    ]);
} else {
    $headerId = (int) $header->curriculum_header_id;
    DB::table('tbl_curriculum_header')->where('curriculum_header_id', $headerId)->update([
        'description' => 'Effective SY 2023-2024; Based on CMO No. 97 Series of 2017',
    ]);
}

$subjects = [
    ['GEN 002', 'Understanding the Self', 3, 3],
    ['GEN 003', 'Science, Technology and Society', 3, 3],
    ['MAT 152', 'Mathematics in the Modern World', 3, 3],
    ['HIS 007', 'Life and Works of Rizal', 3, 3],
    ['MAT 171', 'Calculus 1 for Engineers', 4, 4],
    ['MEE 095', 'Mechanical Engineering Orientation', 1, 1],
    ['CHE 025', 'Chemistry for Engineers', 4, 4],
    ['PED 030', 'PATHFit 1: Movement Competency Training', 2, 2],
    ['NST 021', 'National Service Training Program 1', 3, 3],
    ['GEN 004', 'Readings in Philippine History', 3, 3],
    ['ART 002', 'Art Appreciation', 3, 3],
    ['GEN 001', 'Purposive Communication', 3, 3],
    ['GEN 005', 'The Contemporary World', 3, 3],
    ['MAT 076', 'Calculus 2', 3, 3],
    ['PHY 032', 'Physics for Engineers', 4, 4],
    ['PED 031', 'PATHFit 2: Exercise-Based Fitness Activities', 2, 2],
    ['MAE 109', 'Engineering Drawing', 1, 1],
    ['NST 022', 'National Service Training Program 2', 3, 3],
    ['PED 032', 'PATHFit 3: Individual and Dual Sports', 2, 2],
    ['GEN 010', 'Gender and Society', 3, 3],
    ['MAT 052', 'Differential Equations', 3, 3],
    ['BES 025', 'Statics of Rigid Bodies', 3, 3],
    ['BES 042', 'Basic Electrical Engineering', 3, 3],
    ['MEE 027', 'Thermodynamics 1', 3, 3],
    ['MEE 096', 'Workshop Theory and Practice', 1, 1],
    ['BES 024', 'Computer-Aided Drafting', 1, 1],
    ['MEE 040', 'Methods of Research for Mechanical Engineering', 1, 1],
    ['ITE 297', 'Computer Fundamentals and Programming', 1, 1],
    ['SSP 005', 'Student Success Program 1', 1, 1],
    ['PED 033', 'PATHFit 4: Team Sports', 2, 2],
    ['MEE 097', 'Computer Applications for Mechanical Engineering', 1, 1],
    ['BES 062', 'Dynamics of Rigid Bodies', 2, 2],
    ['ECE 079', 'Basic Electronics', 3, 3],
    ['MEE 029', 'Thermodynamics 2', 3, 3],
    ['MEE 034', 'Machine Shop Theory', 2, 2],
    ['BES 027', 'Mechanics of Deformable Bodies', 3, 3],
    ['MAT 170', 'Advanced Mathematics for Mechanical Engineering', 3, 3],
    ['SSP 006', 'Student Success Program 2', 1, 1],
    ['MEE 115', 'Micro-Hydro Electric Power', 2, 2],
    ['MEE 098', 'Materials Science and Engineering for Mechanical Engineering', 3, 3],
    ['BES 057', 'Basic Occupational Safety and Health', 3, 3],
    ['CPE 036', 'Technopreneurship', 3, 3],
    ['ECE 069', 'Engineering Data Analysis', 3, 3],
    ['SCX 010', 'Environmental Science', 3, 3],
    ['ELE 110', 'DC and AC Machinery', 3, 3],
    ['MEE 012', 'Heat Transfer', 2, 2],
    ['MEE 099', 'Mechanical Engineering Laboratory 1', 1, 1],
    ['BES 049', 'Fluid Mechanics', 3, 3],
    ['MEE 003', 'Machine Elements 1', 3, 3],
    ['MEE 011', 'Vibration Engineering', 2, 2],
    ['ENG 188', 'Philippine Popular Culture', 3, 3],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    ['MEE 039', 'Refrigeration Systems', 3, 3],
    ['MEE 013', 'Fluid Machinery', 3, 3],
    ['MEE 037', 'Combustion Engineering', 2, 2],
    ['MEE 007', 'Mechanical Engineering Laboratory 2', 2, 2],
    ['MEE 035', 'Machine Design 1', 3, 3],
    ['ECO 017', 'Engineering Economics', 3, 3],
    ['BES 047', 'Engineering Management', 2, 2],
    ['MEE 112', 'Energy Management in Buildings', 2, 2],
    ['SSP 008', 'Student Success Program 4', 1, 1],
    ['MEE 044', 'ME Project Study 1', 1, 1],
    ['MEE 113', 'Solar Energy and Wind Energy Utilization', 2, 2],
    ['MEE 106', 'Manufacturing and Industrial Processes with Plant Visits', 2, 2],
    ['GEN 006', 'Ethics', 3, 3],
    ['MEE 104', 'ME Laws, Ethics, Contracts, Codes and Standards', 2, 2],
    ['MEE 048', 'ME Project Study 2', 1, 1],
    ['MEE 100', 'Airconditioning and Ventilation Systems', 3, 3],
    ['MEE 103', 'Power Plant Design with Renewable Energy', 4, 4],
    ['MEE 117', 'Machine Design 2', 3, 3],
    ['MEE 008', 'Mechanical Engineering Laboratory 3', 2, 2],
    ['SSP 009', 'Student Success Program 5', 1, 1],
    ['MEE 105', 'Industrial Plant Engineering', 4, 4],
    ['MEE 116', 'Control Engineering', 3, 3],
    ['MEE 107', 'Professional Integration 1 (Mathematics) for Mechanical Engineering', 1, 1],
    ['MEE 108', 'Professional Integration 2 (Machine Design, Materials and Shop Practice) for Mechanical Engineering', 1, 1],
    ['MEE 109', 'Professional Integration 3 (Power Plant Engineering) for Mechanical Engineering', 1, 1],
    ['MEE 085', 'ME Plant Visit/On-the-Job Training', 2, 2],
];

$minorPrefixes = ['GEN', 'ART', 'HIS', 'MAT', 'PED', 'NST', 'SSP', 'SCX', 'ENG'];
$subjectType = static function (string $code) use ($minorPrefixes): string {
    $prefix = strtoupper(strtok(trim($code), ' ') ?: trim($code));

    return in_array($prefix, $minorPrefixes, true) ? 'minor' : 'core';
};

$curriculumRows = [
    ['GEN 002', 1, 1], ['GEN 003', 1, 1], ['MAT 152', 1, 1], ['HIS 007', 1, 1], ['MAT 171', 1, 1], ['MEE 095', 1, 1], ['CHE 025', 1, 1], ['PED 030', 1, 1], ['NST 021', 1, 1],
    ['GEN 004', 1, 2], ['ART 002', 1, 2], ['GEN 001', 1, 2], ['GEN 005', 1, 2], ['MAT 076', 1, 2], ['PHY 032', 1, 2], ['PED 031', 1, 2], ['MAE 109', 1, 2], ['NST 022', 1, 2],
    ['PED 032', 2, 1], ['__GEC_ELECTIVE_1__', 2, 1], ['MAT 052', 2, 1], ['BES 025', 2, 1], ['BES 042', 2, 1], ['MEE 027', 2, 1], ['MEE 096', 2, 1], ['BES 024', 2, 1], ['MEE 040', 2, 1], ['ITE 297', 2, 1], ['SSP 005', 2, 1],
    ['PED 033', 2, 2], ['MEE 097', 2, 2], ['BES 062', 2, 2], ['ECE 079', 2, 2], ['MEE 029', 2, 2], ['MEE 034', 2, 2], ['BES 027', 2, 2], ['MAT 170', 2, 2], ['SSP 006', 2, 2], ['__PROF_ELECTIVE_1__', 2, 2],
    ['MEE 098', 3, 3], ['BES 057', 3, 3], ['CPE 036', 3, 3],
    ['ECE 069', 3, 1], ['__GEC_ELECTIVE_2__', 3, 1], ['ELE 110', 3, 1], ['MEE 012', 3, 1], ['MEE 099', 3, 1], ['BES 049', 3, 1], ['MEE 003', 3, 1], ['MEE 011', 3, 1], ['__GEC_ELECTIVE_3__', 3, 1], ['SSP 007', 3, 1],
    ['MEE 039', 3, 2], ['MEE 013', 3, 2], ['MEE 037', 3, 2], ['MEE 007', 3, 2], ['MEE 035', 3, 2], ['ECO 017', 3, 2], ['BES 047', 3, 2], ['__PROF_ELECTIVE_2__', 3, 2], ['SSP 008', 3, 2], ['MEE 044', 3, 2], ['__PROF_ELECTIVE_3__', 3, 2],
    ['MEE 106', 4, 3], ['GEN 006', 4, 3], ['MEE 104', 4, 3],
    ['MEE 048', 4, 1], ['MEE 100', 4, 1], ['MEE 103', 4, 1], ['MEE 117', 4, 1], ['MEE 008', 4, 1], ['SSP 009', 4, 1], ['MEE 105', 4, 1],
    ['MEE 116', 4, 2], ['MEE 107', 4, 2], ['MEE 108', 4, 2], ['MEE 109', 4, 2], ['MEE 085', 4, 2],
];

$slotDefinitions = [
    '__GEC_ELECTIVE_1__' => ['slot_name' => 'BSME 2023 GEC Elective 1', 'year' => 2, 'semester' => 1, 'choices' => ['GEN 010']],
    '__GEC_ELECTIVE_2__' => ['slot_name' => 'BSME 2023 GEC Elective 2', 'year' => 3, 'semester' => 1, 'choices' => ['SCX 010']],
    '__GEC_ELECTIVE_3__' => ['slot_name' => 'BSME 2023 GEC Elective 3', 'year' => 3, 'semester' => 1, 'choices' => ['ENG 188']],
    '__PROF_ELECTIVE_1__' => ['slot_name' => 'BSME 2023 Professional Elective 1', 'year' => 2, 'semester' => 2, 'choices' => ['MEE 115']],
    '__PROF_ELECTIVE_2__' => ['slot_name' => 'BSME 2023 Professional Elective 2', 'year' => 3, 'semester' => 2, 'choices' => ['MEE 112']],
    '__PROF_ELECTIVE_3__' => ['slot_name' => 'BSME 2023 Professional Elective 3', 'year' => 3, 'semester' => 2, 'choices' => ['MEE 113']],
];

$prerequisites = [
    'MAT 076' => ['MAT 171'],
    'PHY 032' => ['MAT 171'],
    'PED 031' => ['PED 030'],
    'NST 022' => ['NST 021'],
    'PED 032' => ['PED 031'],
    'MAT 052' => ['MAT 076'],
    'BES 025' => ['MAT 076', 'PHY 032'],
    'BES 042' => ['MAT 076', 'PHY 032'],
    'MEE 027' => ['MAT 076', 'PHY 032'],
    'PED 033' => ['PED 032'],
    'BES 062' => ['BES 025'],
    'ECE 079' => ['ITE 297'],
    'MEE 029' => ['MEE 027'],
    'MEE 034' => ['MEE 096'],
    'BES 027' => ['BES 025'],
    'MAT 170' => ['MAT 052'],
    'MEE 098' => ['BES 027', 'CHE 025'],
    'ELE 110' => ['BES 042'],
    'MEE 012' => ['MEE 029'],
    'MEE 099' => ['MEE 029', 'BES 049'],
    'BES 049' => ['MEE 027'],
    'MEE 003' => ['BES 062'],
    'MEE 011' => ['MAT 052'],
    'MEE 039' => ['MEE 012'],
    'MEE 013' => ['BES 049'],
    'MEE 037' => ['MEE 029'],
    'MEE 007' => ['MEE 099'],
    'MEE 035' => ['MEE 003'],
    'MEE 044' => ['MEE 040'],
    'MEE 106' => ['MEE 013'],
    'MEE 048' => ['MEE 044'],
    'MEE 100' => ['MEE 039'],
    'MEE 103' => ['MEE 037'],
    'MEE 117' => ['MEE 035'],
    'MEE 008' => ['MEE 007'],
    'MEE 105' => ['MEE 106'],
    'MEE 116' => ['ECE 079'],
    'MEE 108' => ['MEE 103'],
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

DB::transaction(function () use (
    $subjects,
    $curriculumRows,
    $slotDefinitions,
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
    &$assignedChoices
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
            ->where('curriculum_header_id', $headerId)
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
    'inserted_requisites' => $insertedRequisites,
    'updated_requisites' => $updatedRequisites,
], JSON_PRETTY_PRINT) . PHP_EOL;

