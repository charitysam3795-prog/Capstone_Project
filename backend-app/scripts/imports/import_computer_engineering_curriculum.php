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
    ->where('program_code', 'BSCPE')
    ->orWhere('program_name', 'Bachelor of Science in Computer Engineering')
    ->first();

if (! $program) {
    $programId = DB::table('tbl_program')->insertGetId([
        'department_id' => $departmentId,
        'campus_id' => $campus->campus_id,
        'program_code' => 'BSCPE',
        'program_name' => 'Bachelor of Science in Computer Engineering',
        'total_units_required' => 172,
    ]);
} else {
    $programId = (int) $program->program_id;
    DB::table('tbl_program')->where('program_id', $programId)->update([
        'department_id' => $departmentId,
        'campus_id' => $program->campus_id ?: $campus->campus_id,
        'program_code' => 'BSCPE',
        'program_name' => 'Bachelor of Science in Computer Engineering',
        'total_units_required' => 172,
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
        'description' => 'Effective SY 2018-2019; Based on CMO No. 87 Series of 2017',
    ]);
} else {
    $headerId = (int) $header->curriculum_header_id;
    DB::table('tbl_curriculum_header')->where('curriculum_header_id', $headerId)->update([
        'description' => 'Effective SY 2018-2019; Based on CMO No. 87 Series of 2017',
    ]);
}

$subjects = [
    ['GEN 002', 'Understanding the Self', 3, 3],
    ['GEN 003', 'Science, Technology and Society', 3, 3],
    ['MAT 152', 'Mathematics in the Modern World', 3, 3],
    ['HIS 007', 'Life and Works of Rizal', 3, 3],
    ['MAT 171', 'Calculus 1 for Engineers', 4, 4],
    ['CPE 034', 'Computer Engineering as a Discipline', 1, 1],
    ['CPE 035', 'Programming Logic and Design', 2, 2],
    ['NST 021', 'National Service Training Program 1', 3, 3],
    ['GEN 004', 'Readings in Philippine History', 3, 3],
    ['ART 002', 'Art Appreciation', 3, 3],
    ['GEN 001', 'Purposive Communication', 3, 3],
    ['GEN 005', 'The Contemporary World', 3, 3],
    ['MAT 076', 'Calculus 2', 3, 3],
    ['PHY 032', 'Physics for Engineers (Calculus Based)', 4, 4],
    ['ITE 030', 'Object-Oriented Programming', 2, 2],
    ['NST 022', 'National Service Training Program 2', 3, 3],
    ['MAT 126', 'Differential Equations', 3, 3],
    ['CHE 025', 'Chemistry for Engineers', 4, 4],
    ['ITE 294', 'Data Structures and Algorithms', 2, 2],
    ['ECE 069', 'Engineering Data Analysis', 3, 3],
    ['CPE 037', 'Fundamentals of Electric Circuits', 4, 4],
    ['PED 025', 'Movement Enhancement', 2, 2],
    ['SSP 005', 'Student Success Program 1', 1, 1],
    ['GEN 006', 'Ethics', 3, 3],
    ['BES 024', 'Computer-Aided Drafting', 1, 1],
    ['ECO 017', 'Engineering Economics', 3, 3],
    ['MAT 043', 'Discrete Mathematics', 3, 3],
    ['MAT 120', 'Numerical Methods', 3, 3],
    ['CPE 038', 'Software Design', 4, 4],
    ['CPE 039', 'Fundamentals of Electronic Circuits', 4, 4],
    ['PED 026', 'Fitness Exercises', 2, 2],
    ['SSP 006', 'Student Success Program 2', 1, 1],
    ['ENG 188', 'Philippine Popular Culture', 3, 3],
    ['CPE 040', 'Logic Circuits and Design', 4, 4],
    ['ITE 076', 'Operating Systems', 3, 3],
    ['CPE 041', 'Data and Digital Communications', 3, 3],
    ['CPE 042', 'Introduction to Hardware Description Language', 1, 1],
    ['CPE 043', 'Feedback and Control Systems', 3, 3],
    ['CPE 044', 'Fundamentals of Mixed Signals and Sensors', 3, 3],
    ['CPE 053', 'Embedded Systems 1', 3, 3],
    ['PED 027', 'Physical Activities Towards Health and Fitness I', 2, 2],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    ['SCX 010', 'Environmental Science', 3, 3],
    ['CPE 045', 'Basic Occupational Health and Safety', 3, 3],
    ['CPE 046', 'Computer Networks and Security', 4, 4],
    ['CPE 047', 'Microprocessors', 4, 4],
    ['CPE 014', 'Design Project 1 (Methods of Research)', 2, 2],
    ['CPE 036', 'Technopreneurship', 3, 3],
    ['CPE 054', 'Embedded Systems 2', 3, 3],
    ['PED 028', 'Physical Activities Towards Health and Fitness', 2, 2],
    ['CPE 032', 'Computer Engineering Drafting and Design', 1, 1],
    ['SSP 008', 'Student Success Program 4', 1, 1],
    ['GEN 010', 'Gender and Society', 3, 3],
    ['CPE 048', 'Embedded Systems', 4, 4],
    ['CPE 049', 'Computer Architecture and Organization', 4, 4],
    ['CPE 050', 'Computer Engineering Practice and Design 1', 1, 1],
    ['ECE 029', 'Digital Signal Processing', 4, 4],
    ['CPE 055', 'Embedded Systems 3', 3, 3],
    ['SSP 009', 'Student Success Program 5', 1, 1],
    ['CPE 013', 'Emerging Technologies for Computer Engineering', 3, 3],
    ['CPE 052', 'Computer Engineering Laws and Professional Practice', 2, 2],
    ['CPE 051', 'Computer Engineering Practice and Design 2', 2, 2],
    ['CPE 005', 'CpE Seminars and Field Trips', 1, 1],
    ['CPE 004', 'On-The-Job Training for Computer Engineering (240 Hours)', 3, 3],
];

$minorPrefixes = ['GEN', 'ART', 'HIS', 'MAT', 'PED', 'NST', 'SSP', 'SCX', 'ENG'];
$subjectType = static function (string $code) use ($minorPrefixes): string {
    $prefix = strtoupper(strtok(trim($code), ' ') ?: trim($code));

    return in_array($prefix, $minorPrefixes, true) ? 'minor' : 'core';
};

$curriculumRows = [
    ['GEN 002', 1, 1], ['GEN 003', 1, 1], ['MAT 152', 1, 1], ['HIS 007', 1, 1], ['MAT 171', 1, 1], ['CPE 034', 1, 1], ['CPE 035', 1, 1], ['NST 021', 1, 1],
    ['GEN 004', 1, 2], ['ART 002', 1, 2], ['GEN 001', 1, 2], ['GEN 005', 1, 2], ['MAT 076', 1, 2], ['PHY 032', 1, 2], ['ITE 030', 1, 2], ['NST 022', 1, 2],
    ['MAT 126', 2, 1], ['CHE 025', 2, 1], ['ITE 294', 2, 1], ['ECE 069', 2, 1], ['CPE 037', 2, 1], ['PED 025', 2, 1], ['SSP 005', 2, 1], ['GEN 006', 2, 1],
    ['BES 024', 2, 2], ['ECO 017', 2, 2], ['MAT 043', 2, 2], ['MAT 120', 2, 2], ['CPE 038', 2, 2], ['CPE 039', 2, 2], ['PED 026', 2, 2], ['SSP 006', 2, 2], ['__GEC_ELECTIVE_1__', 2, 2],
    ['CPE 040', 3, 1], ['ITE 076', 3, 1], ['CPE 041', 3, 1], ['CPE 042', 3, 1], ['CPE 043', 3, 1], ['CPE 044', 3, 1], ['__PROF_ELECTIVE_1__', 3, 1], ['PED 027', 3, 1], ['SSP 007', 3, 1], ['__GEC_ELECTIVE_2__', 3, 1],
    ['CPE 045', 3, 2], ['CPE 046', 3, 2], ['CPE 047', 3, 2], ['CPE 014', 3, 2], ['CPE 036', 3, 2], ['__PROF_ELECTIVE_2__', 3, 2], ['PED 028', 3, 2], ['CPE 032', 3, 2], ['SSP 008', 3, 2], ['__GEC_ELECTIVE_3__', 3, 2],
    ['CPE 048', 4, 1], ['CPE 049', 4, 1], ['CPE 050', 4, 1], ['ECE 029', 4, 1], ['__PROF_ELECTIVE_3__', 4, 1], ['SSP 009', 4, 1], ['CPE 013', 4, 1], ['CPE 052', 4, 1],
    ['CPE 051', 4, 2], ['CPE 005', 4, 2], ['CPE 004', 4, 2],
];

$slotDefinitions = [
    '__GEC_ELECTIVE_1__' => ['slot_name' => 'BSCPE GEC Elective 1', 'year' => 2, 'semester' => 2, 'choices' => ['ENG 188']],
    '__GEC_ELECTIVE_2__' => ['slot_name' => 'BSCPE GEC Elective 2', 'year' => 3, 'semester' => 1, 'choices' => ['SCX 010']],
    '__GEC_ELECTIVE_3__' => ['slot_name' => 'BSCPE GEC Elective 3', 'year' => 3, 'semester' => 2, 'choices' => ['GEN 010']],
    '__PROF_ELECTIVE_1__' => ['slot_name' => 'BSCPE Professional Elective 1', 'year' => 3, 'semester' => 1, 'choices' => ['CPE 053']],
    '__PROF_ELECTIVE_2__' => ['slot_name' => 'BSCPE Professional Elective 2', 'year' => 3, 'semester' => 2, 'choices' => ['CPE 054']],
    '__PROF_ELECTIVE_3__' => ['slot_name' => 'BSCPE Professional Elective 3', 'year' => 4, 'semester' => 1, 'choices' => ['CPE 055']],
];

$prerequisites = [
    'MAT 076' => ['MAT 171'],
    'PHY 032' => ['MAT 171'],
    'ITE 030' => ['CPE 035'],
    'NST 022' => ['NST 021'],
    'MAT 126' => ['MAT 076'],
    'ITE 294' => ['ITE 030'],
    'ECE 069' => ['MAT 171'],
    'CPE 037' => ['PHY 032'],
    'MAT 043' => ['MAT 171'],
    'MAT 120' => ['MAT 126'],
    'CPE 038' => ['ITE 294'],
    'CPE 039' => ['CPE 037'],
    'PED 026' => ['PED 025'],
    'CPE 040' => ['CPE 039'],
    'ITE 076' => ['ITE 294'],
    'CPE 041' => ['CPE 039'],
    'CPE 042' => ['CPE 035', 'CPE 039'],
    'CPE 043' => ['MAT 120', 'CPE 037'],
    'CPE 044' => ['CPE 039'],
    'PED 027' => ['PED 026'],
    'CPE 046' => ['CPE 041'],
    'CPE 047' => ['CPE 040'],
    'CPE 014' => ['ECE 069', 'GEN 001', 'CPE 040'],
    'CPE 054' => ['CPE 053'],
    'PED 028' => ['PED 027'],
    'CPE 032' => ['CPE 039'],
    'CPE 048' => ['CPE 047'],
    'CPE 049' => ['CPE 047'],
    'CPE 050' => ['CPE 047', 'CPE 014'],
    'ECE 029' => ['CPE 043'],
    'CPE 055' => ['CPE 054'],
    'CPE 051' => ['CPE 050'],
];

$standingPrerequisites = [
    'BES 024' => ['maxYear' => 1, 'ruleLabel' => '2nd year standing'],
    'ECO 017' => ['maxYear' => 1, 'ruleLabel' => '2nd year standing'],
    'CPE 053' => ['maxYear' => 2, 'ruleLabel' => '3rd year standing'],
    'CPE 045' => ['maxYear' => 2, 'ruleLabel' => '3rd year standing'],
    'CPE 036' => ['maxYear' => 2, 'ruleLabel' => '3rd year standing'],
    'CPE 052' => ['maxYear' => 2, 'ruleLabel' => '3rd year standing'],
    'CPE 013' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'CPE 005' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'CPE 004' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
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

