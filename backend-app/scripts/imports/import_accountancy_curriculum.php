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
    ->where('program_code', 'BSA')
    ->orWhere('program_name', 'Bachelor of Science in Accountancy')
    ->first();

if (! $program) {
    $programId = DB::table('tbl_program')->insertGetId([
        'department_id' => $departmentId,
        'campus_id' => $campus->campus_id,
        'program_code' => 'BSA',
        'program_name' => 'Bachelor of Science in Accountancy',
        'total_units_required' => 191,
    ]);
} else {
    $programId = (int) $program->program_id;
    DB::table('tbl_program')->where('program_id', $programId)->update([
        'department_id' => $program->department_id ?: $departmentId,
        'campus_id' => $program->campus_id ?: $campus->campus_id,
        'program_code' => $program->program_code ?: 'BSA',
        'program_name' => 'Bachelor of Science in Accountancy',
        'total_units_required' => $program->total_units_required ?: 191,
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
        'description' => 'Effective SY 2023-2024; Based on CMO No. 27 Series of 2017',
    ]);
} else {
    $headerId = (int) $header->curriculum_header_id;
    DB::table('tbl_curriculum_header')->where('curriculum_header_id', $headerId)->update([
        'description' => 'Effective SY 2023-2024; Based on CMO No. 27 Series of 2017',
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
    ['BAM 031', 'Income Taxation', 3, 3],
    ['ACC 139', 'Auditing and Assurance Principles', 3, 3],
    ['ACC 112', 'Governance, Business Ethics, Risk Management, and Internal Control', 3, 3],
    ['BAM 242', 'Regulatory Framework and Legal Issues in Business', 3, 3],
    ['ACC 110', 'Accounting for Special Transactions Part 1', 3, 3],
    ['ACC 122', 'Cost Accounting and Control', 3, 3],
    ['ACC 116', 'Accounting Research Methods', 3, 3],
    ['FIN 073', 'Strategic Cost Management', 3, 3],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    ['BAM 208', 'Business Taxation', 3, 3],
    ['ACC 140', 'Auditing and Assurance: Concepts and Applications 1', 3, 3],
    ['ACC 141', 'Auditing and Assurance: Concepts and Applications 2', 3, 3],
    ['BAM 213', 'Law on Negotiable Instruments and Other Banking Laws', 3, 3],
    ['ACC 113', 'Accounting for Business Combinations', 3, 3],
    ['ACC 115', 'Management Science', 3, 3],
    ['ACC 117', 'Statistical Analysis with Software Application', 3, 3],
    ['ACC 100', 'Accounting Information System', 3, 3],
    ['SSP 008', 'Student Success Program 4', 1, 1],
    ['ACC 121', 'Accountancy Research', 3, 3],
    ['ECO 007', 'Economic Development', 3, 3],
    ['ACC 111', 'Accounting for Government and Non-Profit Organizations', 3, 3],
    ['BAM 284', 'Strategic Management (RFBT)', 3, 3],
    ['ACC 114', 'Auditing and Assurance: Specialized Industries', 3, 3],
    ['ACC 142', 'Accounting for Special Transactions Part 2', 3, 3],
    ['ACC 143', 'Preferential Taxation and Tax Remedies', 3, 3],
    ['ACC 118', 'Strategic Business Analysis', 3, 3],
    ['ACC 120', 'Audit in a Computer Information System Environment', 3, 3],
    ['SSP 009', 'Student Success Program 5', 1, 1],
    ['ACC 177', 'Updates in Accounting and Auditing Developments', 6, 6],
    ['ACC 119', 'Accounting Internship - 400 hours', 6, 6],
    ['BAM 006', 'Business Communication', 3, 3],
    ['GEN 009', 'Entrepreneurial Mind', 3, 3],
    ['PHI 002', 'Logic', 3, 3],
    ['PSY 002', 'Human Behavior in Organization', 3, 3],
    ['ACC 167', 'Operations Auditing', 3, 3],
    ['ACC 168', 'Valuation Concepts and Methods', 3, 3],
    ['ACC 169', 'Principles and Methods of Teaching Accounting', 3, 3],
    ['BAM 225', 'Business Analytics', 3, 3],
    ['ACC 157', 'Data Warehousing and Management', 3, 3],
];

$minorPrefixes = ['GEN', 'ART', 'HIS', 'MAT', 'PED', 'NST', 'SCX', 'ENG', 'PHI', 'SSP'];
$subjectType = static function (string $code) use ($minorPrefixes): string {
    $prefix = strtoupper(strtok(trim($code), ' ') ?: trim($code));

    return in_array($prefix, $minorPrefixes, true) ? 'minor' : 'core';
};

$curriculumRows = [
    ['GEN 004', 1, 1], ['ART 002', 1, 1], ['GEN 001', 1, 1], ['GEN 005', 1, 1], ['ACC 102', 1, 1], ['PED 030', 1, 1], ['NST 021', 1, 1],
    ['GEN 002', 1, 2], ['GEN 003', 1, 2], ['MAT 152', 1, 2], ['HIS 007', 1, 2], ['ACC 103', 1, 2], ['BAM 201', 1, 2], ['BAM 040', 1, 2], ['PED 031', 1, 2], ['NST 022', 1, 2],
    ['SCX 010', 2, 1], ['BAM 199', 2, 1], ['GEN 010', 2, 1], ['BAM 026', 2, 1], ['ACC 106', 2, 1], ['ACC 107', 2, 1], ['FIN 081', 2, 1], ['SSP 005', 2, 1], ['PED 032', 2, 1],
    ['ENG 188', 2, 2], ['GEN 006', 2, 2], ['ACC 123', 2, 2], ['BAM 241', 2, 2], ['ACC 108', 2, 2], ['ACC 109', 2, 2], ['FIN 072', 2, 2], ['SSP 006', 2, 2], ['PED 033', 2, 2],
    ['BAM 031', 3, 1], ['ACC 139', 3, 1], ['ACC 112', 3, 1], ['BAM 242', 3, 1], ['ACC 110', 3, 1], ['ACC 122', 3, 1], ['ACC 116', 3, 1], ['FIN 073', 3, 1], ['SSP 007', 3, 1],
    ['BAM 208', 3, 2], ['ACC 140', 3, 2], ['ACC 141', 3, 2], ['BAM 213', 3, 2], ['ACC 113', 3, 2], ['ACC 115', 3, 2], ['ACC 117', 3, 2], ['ACC 100', 3, 2], ['SSP 008', 3, 2],
    ['ACC 121', 3, 3], ['ECO 007', 3, 3],
    ['ACC 111', 4, 1], ['BAM 284', 4, 1], ['ACC 114', 4, 1], ['ACC 142', 4, 1], ['ACC 143', 4, 1], ['ACC 118', 4, 1], ['ACC 120', 4, 1], ['SSP 009', 4, 1],
    ['ACC 177', 4, 2], ['ACC 119', 4, 2],
];

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
    'SSP 006' => ['SSP 005'],
    'PED 033' => ['PED 032'],
    'BAM 031' => ['ACC 107', 'ACC 109'],
    'ACC 139' => ['ACC 107', 'ACC 109'],
    'ACC 112' => ['ACC 107', 'ACC 109'],
    'BAM 242' => ['BAM 026'],
    'ACC 110' => ['ACC 107', 'ACC 109'],
    'ACC 122' => ['ACC 109'],
    'ACC 116' => ['MAT 152'],
    'FIN 073' => ['ACC 109'],
    'BAM 208' => ['BAM 031'],
    'ACC 140' => ['ACC 139'],
    'ACC 141' => ['ACC 139'],
    'BAM 213' => ['BAM 026'],
    'ACC 113' => ['ACC 109'],
    'ACC 115' => ['ACC 122'],
    'ACC 117' => ['MAT 152'],
    'ACC 100' => ['ACC 107', 'ACC 109'],
    'ACC 121' => ['ACC 116'],
    'ECO 007' => ['BAM 040'],
    'ACC 111' => ['ACC 109'],
    'BAM 284' => ['BAM 026'],
    'ACC 114' => ['ACC 139'],
    'ACC 142' => ['ACC 109'],
    'ACC 143' => ['BAM 031'],
    'ACC 118' => ['ACC 122'],
    'ACC 120' => ['ACC 139'],
    'SSP 009' => ['SSP 008'],
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

    $coreBeforeFinalYearSecond = collect($curriculumRows)
        ->filter(fn (array $row) => (int) $row[1] < 4 || ((int) $row[1] === 4 && (int) $row[2] === 1))
        ->filter(fn (array $row) => $subjectType($row[0]) === 'core')
        ->pluck(0)
        ->all();

    $syncPrerequisites('ACC 177', $coreBeforeFinalYearSecond, 'all board subjects');
    $syncPrerequisites('ACC 119', $coreBeforeFinalYearSecond, '100% professional units');
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
