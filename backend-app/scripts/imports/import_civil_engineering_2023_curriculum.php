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
    ->where('program_code', 'BSCE')
    ->orWhere('program_name', 'Bachelor of Science in Civil Engineering')
    ->first();

if (! $program) {
    $programId = DB::table('tbl_program')->insertGetId([
        'department_id' => $departmentId,
        'campus_id' => $campus->campus_id,
        'program_code' => 'BSCE',
        'program_name' => 'Bachelor of Science in Civil Engineering',
        'total_units_required' => 181,
    ]);
} else {
    $programId = (int) $program->program_id;
    DB::table('tbl_program')->where('program_id', $programId)->update([
        'department_id' => $departmentId,
        'campus_id' => $program->campus_id ?: $campus->campus_id,
        'program_code' => 'BSCE',
        'program_name' => 'Bachelor of Science in Civil Engineering',
        'total_units_required' => 181,
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
        'description' => 'Effective SY 2023-2024; Construction Engineering and Management specialization; Based on CMO No. 92 Series of 2017',
    ]);
} else {
    $headerId = (int) $header->curriculum_header_id;
    DB::table('tbl_curriculum_header')->where('curriculum_header_id', $headerId)->update([
        'description' => 'Effective SY 2023-2024; Construction Engineering and Management specialization; Based on CMO No. 92 Series of 2017',
    ]);
}

$subjects = [
    ['GEN 002', 'Understanding the Self', 3, 3],
    ['GEN 003', 'Science, Technology and Society', 3, 3],
    ['MAT 152', 'Mathematics in the Modern World', 3, 3],
    ['HIS 007', 'Life and Works of Rizal', 3, 3],
    ['MAT 171', 'Calculus 1 for Engineers', 4, 4],
    ['CIE 110', 'Civil Engineering Orientation', 2, 2],
    ['PED 030', 'PATHFit 1: Movement Competency Training', 2, 2],
    ['NST 021', 'National Service Training Program 1', 3, 3],
    ['GEN 004', 'Readings in Philippine History', 3, 3],
    ['ART 002', 'Art Appreciation', 3, 3],
    ['GEN 001', 'Purposive Communication', 3, 3],
    ['GEN 005', 'The Contemporary World', 3, 3],
    ['MAT 076', 'Calculus 2', 3, 3],
    ['PHY 032', 'Physics for Engineers', 4, 4],
    ['PED 031', 'PATHFit 2: Exercise-Based Fitness Activities', 2, 2],
    ['NST 022', 'National Service Training Program 2', 3, 3],
    ['GEN 006', 'Ethics', 3, 3],
    ['CIE 111', 'Engineering Drawing and Plans', 1, 1],
    ['BES 043', 'Computer Fundamentals and Programming', 2, 2],
    ['MAT 052', 'Differential Equations', 3, 3],
    ['BES 025', 'Statics of Rigid Bodies', 3, 3],
    ['GEN 010', 'Gender and Society', 3, 3],
    ['PED 032', 'PATHFit 3: Individual and Dual Sports', 2, 2],
    ['SSP 005', 'Student Success Program 1', 1, 1],
    ['CHE 025', 'Chemistry for Engineers', 4, 4],
    ['BES 024', 'Computer-Aided Drafting', 1, 1],
    ['CIE 112', 'Fundamentals of Surveying', 4, 4],
    ['BES 001', 'Engineering Economy', 3, 3],
    ['BES 026', 'Dynamics of Rigid Bodies', 2, 2],
    ['BES 047', 'Engineering Management', 2, 2],
    ['PED 033', 'PATHFit 4: Team Sports', 2, 2],
    ['SSP 006', 'Student Success Program 2', 1, 1],
    ['CIE 114', 'Geology for Civil Engineers', 2, 2],
    ['CIE 113', 'Mechanics of Deformable Bodies', 4, 4],
    ['CIE 115', 'Numerical Solutions to Civil Engineering Problems', 3, 3],
    ['ECE 069', 'Engineering Data Analysis', 3, 3],
    ['SCX 010', 'Environmental Science', 3, 3],
    ['CPE 036', 'Technopreneurship', 3, 3],
    ['CIE 136', 'Structural Theory', 4, 4],
    ['CIE 118', 'Building Systems Design', 3, 3],
    ['CIE 043', 'Construction Materials and Testing', 3, 3],
    ['CIE 116', 'Engineering Utilities 1', 3, 3],
    ['CIE 117', 'Engineering Utilities 2', 3, 3],
    ['ENG 188', 'Philippine Popular Culture', 3, 3],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    ['CIE 121', 'Hydraulics', 5, 5],
    ['CIE 119', 'Principles of Steel Design', 3, 3],
    ['CIE 120', 'Principles of Reinforced/Prestressed Concrete', 4, 4],
    ['CIE 122', 'Highway and Railroad Engineering', 3, 3],
    ['SSP 008', 'Student Success Program 4', 1, 1],
    ['CIE 054', 'Civil Engineering Laws, Contracts, and Ethics', 2, 2],
    ['CIE 123', 'Civil Engineering Project 1', 2, 2],
    ['CIE 125', 'Hydrology', 2, 2],
    ['CIE 126', 'Quantity Surveying', 2, 2],
    ['CIE 128', 'Principles of Transportation Engineering', 3, 3],
    ['CIE 047', 'Geotechnical Engineering 1 (Soil Mechanics)', 4, 4],
    ['CIE 127', 'Civil Engineering Project 2', 2, 2],
    ['CIE 048', 'Construction Cost Engineering', 3, 3],
    ['CIE 132', 'Project Construction and Management', 3, 3],
    ['CIE 133', 'Advanced Construction Methods and Equipment', 3, 3],
    ['CIE 124', 'Construction Methods and Project Management', 3, 3],
    ['CIE 107', 'Database Management in Construction', 3, 3],
    ['CIE 134', 'Construction Occupational Safety and Health (COSH)', 3, 3],
    ['SSP 009', 'Student Success Program 5', 1, 1],
    ['CIE 135', 'On-the-Job Training for Civil Engineering (240 Hours)', 3, 3],
    ['CIE 093', 'Professional Integration Course 1 (Mathematics for Civil Engineering)', 1, 1],
    ['CIE 094', 'Professional Integration Course 2 (Surveying)', 1, 1],
    ['CIE 095', 'Professional Integration Course 3 (Hydraulics and Geotechnical Engineering)', 1, 1],
    ['CIE 096', 'Professional Integration Course 4 (Design and Construction)', 1, 1],
];

$minorPrefixes = ['GEN', 'ART', 'HIS', 'MAT', 'PED', 'NST', 'SSP', 'SCX', 'ENG'];
$subjectType = static function (string $code) use ($minorPrefixes): string {
    $prefix = strtoupper(strtok(trim($code), ' ') ?: trim($code));

    return in_array($prefix, $minorPrefixes, true) ? 'minor' : 'core';
};

$curriculumRows = [
    ['GEN 002', 1, 1], ['GEN 003', 1, 1], ['MAT 152', 1, 1], ['HIS 007', 1, 1], ['MAT 171', 1, 1], ['CIE 110', 1, 1], ['PED 030', 1, 1], ['NST 021', 1, 1],
    ['GEN 004', 1, 2], ['ART 002', 1, 2], ['GEN 001', 1, 2], ['GEN 005', 1, 2], ['MAT 076', 1, 2], ['PHY 032', 1, 2], ['PED 031', 1, 2], ['NST 022', 1, 2],
    ['GEN 006', 2, 1], ['CIE 111', 2, 1], ['BES 043', 2, 1], ['MAT 052', 2, 1], ['BES 025', 2, 1], ['GEN 010', 2, 1], ['PED 032', 2, 1], ['SSP 005', 2, 1], ['CHE 025', 2, 1],
    ['BES 024', 2, 2], ['CIE 112', 2, 2], ['BES 001', 2, 2], ['BES 026', 2, 2], ['BES 047', 2, 2], ['PED 033', 2, 2], ['SSP 006', 2, 2], ['CIE 114', 2, 2], ['CIE 113', 2, 2], ['CIE 115', 2, 2],
    ['ECE 069', 3, 3], ['SCX 010', 3, 3],
    ['CPE 036', 3, 1], ['CIE 136', 3, 1], ['CIE 118', 3, 1], ['CIE 043', 3, 1], ['CIE 116', 3, 1], ['CIE 117', 3, 1], ['ENG 188', 3, 1], ['SSP 007', 3, 1],
    ['CIE 121', 3, 2], ['CIE 119', 3, 2], ['CIE 120', 3, 2], ['CIE 122', 3, 2], ['SSP 008', 3, 2], ['CIE 054', 3, 2], ['CIE 123', 3, 2], ['CIE 125', 3, 2],
    ['CIE 126', 4, 3], ['CIE 128', 4, 3],
    ['CIE 047', 4, 1], ['CIE 127', 4, 1], ['CIE 048', 4, 1], ['CIE 132', 4, 1], ['CIE 133', 4, 1], ['CIE 124', 4, 1], ['CIE 107', 4, 1], ['CIE 134', 4, 1], ['SSP 009', 4, 1],
    ['CIE 135', 4, 2], ['CIE 093', 4, 2], ['CIE 094', 4, 2], ['CIE 095', 4, 2], ['CIE 096', 4, 2],
];

$prerequisites = [
    'MAT 076' => ['MAT 171'],
    'PHY 032' => ['MAT 171'],
    'PED 031' => ['PED 030'],
    'NST 022' => ['NST 021'],
    'MAT 052' => ['MAT 076'],
    'BES 025' => ['MAT 076', 'PHY 032'],
    'PED 032' => ['PED 031'],
    'CIE 112' => ['CIE 111'],
    'BES 026' => ['BES 025'],
    'PED 033' => ['PED 032'],
    'CIE 114' => ['CHE 025'],
    'CIE 113' => ['BES 025'],
    'CIE 115' => ['MAT 052'],
    'CIE 136' => ['CIE 113'],
    'CIE 118' => ['CIE 111'],
    'CIE 116' => ['PHY 032'],
    'CIE 117' => ['PHY 032'],
    'CIE 119' => ['CIE 136'],
    'CIE 120' => ['CIE 136'],
    'CIE 122' => ['CIE 112'],
    'CIE 126' => ['CIE 118'],
    'CIE 128' => ['CIE 122'],
    'CIE 047' => ['CIE 113', 'CIE 114'],
    'CIE 127' => ['CIE 123'],
];

$standingPrerequisites = [
    'BES 001' => ['maxYear' => 1, 'ruleLabel' => '2nd year standing'],
    'CPE 036' => ['maxYear' => 2, 'ruleLabel' => '3rd year standing'],
    'CIE 121' => ['maxYear' => 2, 'ruleLabel' => '3rd year standing'],
    'CIE 054' => ['maxYear' => 2, 'ruleLabel' => '3rd year standing'],
    'CIE 123' => ['maxYear' => 2, 'ruleLabel' => '3rd year standing'],
    'CIE 125' => ['maxYear' => 2, 'ruleLabel' => '3rd year standing'],
    'CIE 048' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'CIE 132' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'CIE 133' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'CIE 124' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'CIE 107' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'CIE 134' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'CIE 135' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'CIE 093' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'CIE 094' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'CIE 095' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
    'CIE 096' => ['maxYear' => 3, 'ruleLabel' => '4th year standing'],
];

$insertedSubjects = 0;
$updatedSubjects = 0;
$insertedCurriculumRows = 0;
$updatedCurriculumRows = 0;
$insertedRequisites = 0;
$updatedRequisites = 0;

DB::transaction(function () use (
    $subjects,
    $curriculumRows,
    $prerequisites,
    $standingPrerequisites,
    $findSubject,
    $subjectId,
    $programId,
    $headerId,
    $subjectType,
    &$insertedSubjects,
    &$updatedSubjects,
    &$insertedCurriculumRows,
    &$updatedCurriculumRows,
    &$insertedRequisites,
    &$updatedRequisites
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

    foreach ($curriculumRows as [$code, $year, $semester]) {
        $sid = $subjectId($code);
        $payload = [
            'curriculum_header_id' => $headerId,
            'program_id' => $programId,
            'subject_id' => $sid,
            'elective_slot_id' => null,
            'year_level' => $year,
            'semester_id' => $semester,
            'passing_grade' => 50,
            'subject_type' => $subjectType($code),
            'requisite_id' => null,
        ];

        $existing = DB::table('curriculum')
            ->where('curriculum_header_id', $headerId)
            ->where('program_id', $programId)
            ->where('year_level', $year)
            ->where('semester_id', $semester)
            ->where('subject_id', $sid)
            ->first();

        if ($existing) {
            DB::table('curriculum')->where('curriculum_id', $existing->curriculum_id)->update($payload);
            $updatedCurriculumRows++;
        } else {
            DB::table('curriculum')->insert($payload);
            $insertedCurriculumRows++;
        }
    }

    $codesForStanding = static function (int $maxYear) use ($curriculumRows): array {
        return collect($curriculumRows)
            ->filter(fn (array $row) => (int) $row[1] <= $maxYear)
            ->pluck(0)
            ->unique()
            ->values()
            ->all();
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
    'inserted_requisites' => $insertedRequisites,
    'updated_requisites' => $updatedRequisites,
], JSON_PRETTY_PRINT) . PHP_EOL;

