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
    ->where('program_code', 'BSEE')
    ->orWhere('program_name', 'Bachelor of Science in Electrical Engineering')
    ->first();

if (! $program) {
    $programId = DB::table('tbl_program')->insertGetId([
        'department_id' => $departmentId,
        'campus_id' => $campus->campus_id,
        'program_code' => 'BSEE',
        'program_name' => 'Bachelor of Science in Electrical Engineering',
        'total_units_required' => 179,
    ]);
} else {
    $programId = (int) $program->program_id;
    DB::table('tbl_program')->where('program_id', $programId)->update([
        'department_id' => $departmentId,
        'campus_id' => $program->campus_id ?: $campus->campus_id,
        'program_code' => 'BSEE',
        'program_name' => 'Bachelor of Science in Electrical Engineering',
        'total_units_required' => 179,
    ]);
}

$header = DB::table('tbl_curriculum_header')
    ->where('program_id', $programId)
    ->where('Effective_Year', 2018)
    ->first();

if (! $header) {
    $headerId = DB::table('tbl_curriculum_header')->insertGetId([
        'program_id' => $programId,
        'Effective_Year' => 2018,
        'description' => 'Effective SY 2018-2019; Based on CMO No. 88 Series of 2017',
    ]);
} else {
    $headerId = (int) $header->curriculum_header_id;
    DB::table('tbl_curriculum_header')->where('curriculum_header_id', $headerId)->update([
        'description' => 'Effective SY 2018-2019; Based on CMO No. 88 Series of 2017',
    ]);
}

$subjects = [
    ['GEN 002', 'Understanding the Self', 3, 3],
    ['GEN 003', 'Science, Technology and Society', 3, 3],
    ['MAT 152', 'Mathematics in the Modern World', 3, 3],
    ['HIS 007', 'Life and Works of Rizal', 3, 3],
    ['MAT 171', 'Calculus 1 for Engineers', 4, 4],
    ['PED 025', 'Movement Enhancement', 2, 2],
    ['NST 021', 'National Service Training Program 1', 3, 3],
    ['CHE 025', 'Chemistry for Engineers', 4, 4],
    ['GEN 004', 'Readings in Philippine History', 3, 3],
    ['ART 002', 'Art Appreciation', 3, 3],
    ['GEN 001', 'Purposive Communication', 3, 3],
    ['GEN 005', 'The Contemporary World', 3, 3],
    ['MAT 076', 'Calculus 2', 3, 3],
    ['PHY 032', 'Physics for Engineers', 4, 4],
    ['PED 026', 'Fitness Exercises', 2, 2],
    ['NST 022', 'National Service Training Program 2', 3, 3],
    ['GEN 006', 'Ethics', 3, 3],
    ['SCX 010', 'Environmental Science', 3, 3],
    ['MEE 086', 'Basic Thermodynamics', 3, 3],
    ['ITE 295', 'Computer Programming', 1, 1],
    ['MAT 052', 'Differential Equations', 3, 3],
    ['ELE 001', 'Electrical Circuits 1', 4, 4],
    ['BES 058', 'Engineering Mechanics', 3, 3],
    ['ECE 069', 'Engineering Data Analysis', 3, 3],
    ['PED 027', 'Physical Activities Towards Health and Fitness I', 2, 2],
    ['SSP 005', 'Student Success Program 1', 1, 1],
    ['ENG 188', 'Philippine Popular Culture', 3, 3],
    ['BES 024', 'Computer-Aided Drafting', 1, 1],
    ['MAT 168', 'Engineering Math for Electrical Engineering', 3, 3],
    ['BES 059', 'Fundamentals of Deformable Bodies', 2, 2],
    ['ELE 002', 'Electrical Circuits 2', 4, 4],
    ['ELE 093', 'Electronic Circuits, Devices and Analysis', 4, 4],
    ['ELE 117', 'Electromagnetics', 2, 2],
    ['PED 028', 'Physical Activities Towards Health and Fitness II', 2, 2],
    ['SSP 006', 'Student Success Program 2', 1, 1],
    ['MAT 169', 'Numerical Methods and Analysis', 3, 3],
    ['ELE 095', 'Fundamentals of Electronic Communications', 3, 3],
    ['BES 061', 'Environmental Science and Engineering', 2, 2],
    ['GEN 010', 'Gender and Society', 3, 3],
    ['BES 057', 'Basic Occupational Safety and Health', 3, 3],
    ['ITE 296', 'Logic Circuits and Switching Theory', 2, 2],
    ['ECE 062', 'Materials Science and Engineering', 2, 2],
    ['ELE 077', 'Industrial Electronics', 4, 4],
    ['ELE 017', 'Electrical Engineering Laws, Codes, and Professional Ethics', 2, 2],
    ['ELE 096', 'Electrical Machines 1', 2, 2],
    ['ELE 101', 'Feedback Control Systems', 2, 2],
    ['CPE 036', 'Technopreneurship', 3, 3],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    ['ELE 084', 'Microprocessor Systems', 2, 2],
    ['ELE 098', 'Electrical Apparatus and Devices', 3, 3],
    ['ELE 099', 'Electrical Machines 2', 4, 4],
    ['ELE 023', 'Research Methods for EE', 1, 1],
    ['ELE 100', 'Management of Engineering Project', 2, 2],
    ['ELE 102', 'Electrical Standards and Practices', 1, 1],
    ['BES 060', 'Fluid Mechanics', 3, 3],
    ['ELE 030', 'Instrumentation and Control Engineering', 3, 3],
    ['SSP 008', 'Student Success Program 4', 1, 1],
    ['ECO 017', 'Engineering Economics', 3, 3],
    ['ELE 116', 'Transmission and Distribution', 3, 3],
    ['ELE 113', 'Industrial and Commercial Power Systems', 3, 3],
    ['ELE 103', 'Electrical Systems and Illumination Engineering Design', 5, 5],
    ['ELE 104', 'Power Systems Analysis', 4, 4],
    ['ELE 105', 'Fundamentals of Power Plant Engineering Design', 1, 1],
    ['ELE 106', 'Distribution Systems and Substation Design', 3, 3],
    ['ELE 107', 'Research Project or Capstone Design Project', 1, 1],
    ['SSP 009', 'Student Success Program 5', 1, 1],
    ['ELE 061', 'On-the-Job Training for Electrical Engineering', 2, 2],
    ['ECE 082', 'Professional Integration Course 1 (Mathematics for Electrical Engineering)', 1, 1],
    ['ELE 108', 'Professional Integration Course 2 (Engineering Science and Allied Subject)', 1, 1],
    ['ELE 109', 'Professional Integration Course 3 (Electrical Engineering Professional Subjects)', 1, 1],
    ['ELE 111', 'Seminars/Colloquia for EE', 1, 1],
];

$minorPrefixes = ['GEN', 'ART', 'HIS', 'MAT', 'PED', 'NST', 'SSP', 'SCX', 'ENG'];
$subjectType = static function (string $code) use ($minorPrefixes): string {
    $prefix = strtoupper(strtok(trim($code), ' ') ?: trim($code));

    return in_array($prefix, $minorPrefixes, true) ? 'minor' : 'core';
};

$curriculumRows = [
    ['GEN 002', 1, 1], ['GEN 003', 1, 1], ['MAT 152', 1, 1], ['HIS 007', 1, 1], ['MAT 171', 1, 1], ['PED 025', 1, 1], ['NST 021', 1, 1], ['CHE 025', 1, 1],
    ['GEN 004', 1, 2], ['ART 002', 1, 2], ['GEN 001', 1, 2], ['GEN 005', 1, 2], ['MAT 076', 1, 2], ['PHY 032', 1, 2], ['PED 026', 1, 2], ['NST 022', 1, 2],
    ['GEN 006', 2, 1], ['__GEC_ELECTIVE_1__', 2, 1], ['MEE 086', 2, 1], ['ITE 295', 2, 1], ['MAT 052', 2, 1], ['ELE 001', 2, 1], ['BES 058', 2, 1], ['ECE 069', 2, 1], ['PED 027', 2, 1], ['SSP 005', 2, 1],
    ['__GEC_ELECTIVE_2__', 2, 2], ['BES 024', 2, 2], ['MAT 168', 2, 2], ['BES 059', 2, 2], ['ELE 002', 2, 2], ['ELE 093', 2, 2], ['ELE 117', 2, 2], ['PED 028', 2, 2], ['SSP 006', 2, 2],
    ['MAT 169', 3, 3], ['ELE 095', 3, 3], ['BES 061', 3, 3],
    ['__GEC_ELECTIVE_3__', 3, 1], ['BES 057', 3, 1], ['ITE 296', 3, 1], ['ECE 062', 3, 1], ['ELE 077', 3, 1], ['ELE 017', 3, 1], ['ELE 096', 3, 1], ['ELE 101', 3, 1], ['CPE 036', 3, 1], ['SSP 007', 3, 1],
    ['ELE 084', 3, 2], ['ELE 098', 3, 2], ['ELE 099', 3, 2], ['ELE 023', 3, 2], ['ELE 100', 3, 2], ['ELE 102', 3, 2], ['BES 060', 3, 2], ['ELE 030', 3, 2], ['SSP 008', 3, 2],
    ['ECO 017', 4, 3], ['__PROF_ELECTIVE_1__', 4, 3], ['__PROF_ELECTIVE_2__', 4, 3],
    ['ELE 103', 4, 1], ['ELE 104', 4, 1], ['ELE 105', 4, 1], ['ELE 106', 4, 1], ['ELE 107', 4, 1], ['SSP 009', 4, 1],
    ['ELE 061', 4, 2], ['ECE 082', 4, 2], ['ELE 108', 4, 2], ['ELE 109', 4, 2], ['ELE 111', 4, 2],
];

$slotDefinitions = [
    '__GEC_ELECTIVE_1__' => ['slot_name' => 'BSEE GEC Elective 1', 'year' => 2, 'semester' => 1, 'choices' => ['SCX 010']],
    '__GEC_ELECTIVE_2__' => ['slot_name' => 'BSEE GEC Elective 2', 'year' => 2, 'semester' => 2, 'choices' => ['ENG 188']],
    '__GEC_ELECTIVE_3__' => ['slot_name' => 'BSEE GEC Elective 3', 'year' => 3, 'semester' => 1, 'choices' => ['GEN 010']],
    '__PROF_ELECTIVE_1__' => ['slot_name' => 'BSEE Professional Elective 1', 'year' => 4, 'semester' => 3, 'choices' => ['ELE 116']],
    '__PROF_ELECTIVE_2__' => ['slot_name' => 'BSEE Professional Elective 2', 'year' => 4, 'semester' => 3, 'choices' => ['ELE 113']],
];

$prerequisites = [
    'MAT 076' => ['MAT 171'],
    'PHY 032' => ['MAT 171'],
    'PED 026' => ['PED 025'],
    'NST 022' => ['NST 021'],
    'MEE 086' => ['PHY 032'],
    'MAT 052' => ['MAT 076'],
    'ELE 001' => ['PHY 032', 'MAT 076'],
    'BES 058' => ['PHY 032', 'MAT 076'],
    'ECE 069' => ['MAT 171'],
    'PED 027' => ['PED 026'],
    'MAT 168' => ['MAT 052'],
    'BES 059' => ['BES 058'],
    'ELE 002' => ['ELE 001'],
    'ELE 093' => ['ELE 001'],
    'ELE 117' => ['PHY 032', 'MAT 052'],
    'PED 028' => ['PED 027'],
    'MAT 169' => ['MAT 168'],
    'ELE 095' => ['ELE 093'],
    'ITE 296' => ['ELE 093'],
    'ECE 062' => ['CHE 025', 'BES 059'],
    'ELE 077' => ['ELE 093'],
    'ELE 017' => ['GEN 006'],
    'ELE 096' => ['ELE 002'],
    'ELE 101' => ['MAT 168', 'ELE 093'],
    'ELE 084' => ['ITE 296'],
    'ELE 098' => ['ELE 002'],
    'ELE 099' => ['ELE 096'],
    'ELE 023' => ['ECE 069'],
    'ELE 102' => ['ELE 017'],
    'BES 060' => ['PHY 032'],
    'ELE 030' => ['ELE 101'],
    'ELE 103' => ['ELE 099'],
    'ELE 104' => ['ELE 102'],
    'ELE 107' => ['ELE 023'],
];

$standingPrerequisites = [
    'ELE 116' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'ELE 113' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'ELE 061' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'ECE 082' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'ELE 108' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'ELE 109' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'ELE 111' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
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
    $standingPrerequisites,
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

    $codesForStanding = static function (int $maxYear) use ($curriculumRows, $slotDefinitions): array {
        $codes = [];
        foreach ($curriculumRows as [$code, $year]) {
            if ((int) $year > $maxYear) {
                continue;
            }

            if (isset($slotDefinitions[$code])) {
                array_push($codes, ...$slotDefinitions[$code]['choices']);
                continue;
            }

            $codes[] = $code;
        }

        return array_values(array_unique($codes));
    };

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

    foreach ($standingPrerequisites as $targetCode => $standingRule) {
        $syncPrerequisites(
            $targetCode,
            $codesForStanding((int) $standingRule['maxYear']),
            $standingRule['ruleLabel']
        );
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

