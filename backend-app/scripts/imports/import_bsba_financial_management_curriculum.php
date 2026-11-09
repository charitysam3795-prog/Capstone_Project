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
    ->where('program_code', 'BSBAFM')
    ->orWhere('program_name', 'Bachelor of Science in Business Administration Major in Financial Management')
    ->first();

if (! $program) {
    $programId = DB::table('tbl_program')->insertGetId([
        'department_id' => $departmentId,
        'campus_id' => $campus->campus_id,
        'program_code' => 'BSBAFM',
        'program_name' => 'Bachelor of Science in Business Administration Major in Financial Management',
        'total_units_required' => 126,
    ]);
} else {
    $programId = (int) $program->program_id;
    DB::table('tbl_program')->where('program_id', $programId)->update([
        'department_id' => $program->department_id ?: $departmentId,
        'campus_id' => $program->campus_id ?: $campus->campus_id,
        'program_code' => $program->program_code ?: 'BSBAFM',
        'program_name' => 'Bachelor of Science in Business Administration Major in Financial Management',
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
    ['PED 030', 'Physical Activities Toward Health and Fitness I: Movement Competency Training', 2, 2],
    ['NST 021', 'National Service Training Program 1', 3, 3],
    ['GEN 002', 'Understanding the Self', 3, 3],
    ['GEN 003', 'Science, Technology and Society', 3, 3],
    ['MAT 152', 'Mathematics in the Modern World', 3, 3],
    ['HIS 007', 'Life and Works of Rizal', 3, 3],
    ['ACC 104', 'Fundamentals of Accounting and Financial Statement Analysis', 3, 3],
    ['PED 031', 'Physical Activities Toward Health and Fitness II: Exercise-Based Fitness Activities', 2, 2],
    ['NST 022', 'National Service Training Program 2', 3, 3],
    ['GEN 006', 'Ethics', 3, 3],
    ['GEN 010', 'Gender and Society', 3, 3],
    ['HRE 002', 'Human Resource Management', 3, 3],
    ['ECO 025', 'Basic Microeconomics', 3, 3],
    ['FIN 004', 'Financial Management', 3, 3],
    ['FIN 008', 'Banking and Financial Institutions', 3, 3],
    ['FIN 012', 'Credit and Collections', 3, 3],
    ['PED 032', 'Physical Activities Toward Health and Fitness III: Individual and Dual Sports', 1, 1],
    ['SSP 005', 'Student Success Program 1', 2, 2],
    ['ENG 188', 'Philippine Popular Culture', 3, 3],
    ['FIN 013', 'Capital Markets', 3, 3],
    ['BAM 128', 'Law on Obligations and Contracts for Business Administration', 3, 3],
    ['BAM 127', 'Income Taxation for Business Administration', 3, 3],
    ['FIN 014', 'Financial Analysis and Reporting', 3, 3],
    ['FIN 011', 'Monetary Policy and Central Banking', 3, 3],
    ['SSP 006', 'Student Success Program 2', 1, 1],
    ['PED 033', 'Physical Activities Toward Health and Fitness IV: Team Sports', 2, 2],
    ['BAM 069', 'Business Research', 3, 3],
    ['BAM 193', 'Good Governance and Social Responsibility', 3, 3],
    ['BAM 199', 'Operations Management (TQM)', 3, 3],
    ['BAM 201', 'International Business and Trade', 3, 3],
    ['BAM 012', 'Entrepreneurial Management', 3, 3],
    ['SCX 010', 'Environmental Science', 3, 3],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    ['BAM 023', 'Feasibility Study', 3, 3],
    ['BAM 181', 'Customer Relationship Management', 3, 3],
    ['FIN 009', 'Investment and Portfolio Management', 3, 3],
    ['BAM 209', 'Strategic Management', 3, 3],
    ['FIN 032', 'Special Topics in Financial Management', 3, 3],
    ['SSP 008', 'Student Success Program 4', 1, 1],
    ['BAM 287', 'Business Administration Internship 1 (300 hours)', 3, 3],
    ['BAM 288', 'Business Administration Internship 2 (300 hours)', 3, 3],
];

$minorPrefixes = ['GEN', 'ART', 'HIS', 'MAT', 'PED', 'NST', 'SCX', 'ENG', 'SSP'];
$subjectType = static function (string $code) use ($minorPrefixes): string {
    $prefix = strtoupper(strtok(trim($code), ' ') ?: trim($code));

    return in_array($prefix, $minorPrefixes, true) ? 'minor' : 'core';
};

$curriculumRows = [
    ['GEN 004', 1, 1], ['GEN 001', 1, 1], ['ART 002', 1, 1], ['GEN 005', 1, 1], ['BAM 191', 1, 1], ['PED 030', 1, 1], ['NST 021', 1, 1],
    ['GEN 002', 1, 2], ['GEN 003', 1, 2], ['MAT 152', 1, 2], ['HIS 007', 1, 2], ['ACC 104', 1, 2], ['PED 031', 1, 2], ['NST 022', 1, 2],
    ['GEN 006', 2, 1], ['GEN 010', 2, 1], ['HRE 002', 2, 1], ['ECO 025', 2, 1], ['FIN 004', 2, 1], ['FIN 008', 2, 1], ['FIN 012', 2, 1], ['PED 032', 2, 1], ['SSP 005', 2, 1],
    ['ENG 188', 2, 2], ['FIN 013', 2, 2], ['BAM 128', 2, 2], ['BAM 127', 2, 2], ['FIN 014', 2, 2], ['FIN 011', 2, 2], ['SSP 006', 2, 2], ['PED 033', 2, 2],
    ['BAM 069', 3, 1], ['BAM 193', 3, 1], ['BAM 199', 3, 1], ['BAM 201', 3, 1], ['BAM 012', 3, 1], ['SCX 010', 3, 1], ['SSP 007', 3, 1],
    ['BAM 023', 3, 2], ['BAM 181', 3, 2], ['FIN 009', 3, 2], ['BAM 209', 3, 2], ['FIN 032', 3, 2], ['SSP 008', 3, 2],
    ['BAM 287', 4, 1],
    ['BAM 288', 4, 2],
];

$prerequisites = [
    'PED 031' => ['PED 030'],
    'NST 022' => ['NST 021'],
    'FIN 004' => ['ACC 104'],
    'FIN 008' => ['ACC 104'],
    'FIN 012' => ['ACC 104'],
    'PED 032' => ['PED 031'],
    'FIN 013' => ['FIN 004'],
    'BAM 127' => ['ACC 104'],
    'FIN 014' => ['FIN 008'],
    'FIN 011' => ['FIN 008'],
    'SSP 006' => ['SSP 005'],
    'PED 033' => ['PED 032'],
    'BAM 193' => ['BAM 191'],
    'BAM 199' => ['BAM 191'],
    'BAM 201' => ['BAM 191'],
    'BAM 012' => ['FIN 004'],
    'SSP 007' => ['SSP 006'],
    'BAM 023' => ['BAM 069'],
    'FIN 009' => ['FIN 004'],
    'FIN 032' => ['FIN 004'],
    'SSP 008' => ['SSP 007'],
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
            ->where('program_id', $programId)
            ->where('subject_id', $sid)
            ->where('year_level', $year)
            ->where('semester_id', $semester)
            ->first();

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

    $allBeforeInternshipOne = collect($curriculumRows)
        ->filter(fn (array $row) => (int) $row[1] < 4)
        ->pluck(0)
        ->all();

    $allBeforeInternshipTwo = collect($curriculumRows)
        ->filter(fn (array $row) => (int) $row[1] < 4 || ((int) $row[1] === 4 && (int) $row[2] === 1))
        ->pluck(0)
        ->all();

    $syncPrerequisites('BAM 287', $allBeforeInternshipOne, 'all subjects');
    $syncPrerequisites('BAM 288', $allBeforeInternshipTwo, 'all subjects');
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

