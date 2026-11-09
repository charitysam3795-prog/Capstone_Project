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

$department = DB::table('tbl_departments')->where('department_code', 'COED')->first()
    ?: DB::table('tbl_departments')->where('department_name', 'like', '%College of Education%')->first();

if (! $department) {
    $departmentId = DB::table('tbl_departments')->insertGetId([
        'campus_id' => $campus->campus_id,
        'department_code' => 'COED',
        'department_name' => 'College of Education',
    ]);
} else {
    $departmentId = (int) $department->department_id;
    DB::table('tbl_departments')->where('department_id', $departmentId)->update([
        'campus_id' => $department->campus_id ?: $campus->campus_id,
        'department_code' => $department->department_code ?: 'COED',
        'department_name' => 'College of Education',
    ]);
}

$program = DB::table('tbl_program')
    ->where('program_code', 'BEED')
    ->orWhere('program_name', 'Bachelor of Elementary Education')
    ->first();

if (! $program) {
    $programId = DB::table('tbl_program')->insertGetId([
        'department_id' => $departmentId,
        'campus_id' => $campus->campus_id,
        'program_code' => 'BEED',
        'program_name' => 'Bachelor of Elementary Education',
        'total_units_required' => 159,
    ]);
} else {
    $programId = (int) $program->program_id;
    DB::table('tbl_program')->where('program_id', $programId)->update([
        'department_id' => $program->department_id ?: $departmentId,
        'campus_id' => $program->campus_id ?: $campus->campus_id,
        'program_code' => $program->program_code ?: 'BEED',
        'program_name' => 'Bachelor of Elementary Education',
        'total_units_required' => $program->total_units_required ?: 159,
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
        'description' => 'Effective 2023-2024; Based on CMO No. 74 Series of 2017',
    ]);
} else {
    $headerId = (int) $header->curriculum_header_id;
    DB::table('tbl_curriculum_header')->where('curriculum_header_id', $headerId)->update([
        'description' => 'Effective 2023-2024; Based on CMO No. 74 Series of 2017',
    ]);
}

$subjects = [
    ['GEN 001', 'Purposive Communication', 3, 3],
    ['GEN 004', 'Readings in Philippine History', 3, 3],
    ['ART 002', 'Art Appreciation', 3, 3],
    ['GEN 005', 'The Contemporary World', 3, 3],
    ['EDU 530', 'The Child and Adolescent Learners and Learning Principles', 3, 3],
    ['NST 021', 'National Service Training Program 1', 3, 3],
    ['PED 030', 'Physical Activities Toward Health and Fitness (PATHFIT 1) Movement Competency Training', 2, 2],
    ['GEN 002', 'Understanding the Self', 3, 3],
    ['MAT 152', 'Mathematics in the Modern World', 3, 3],
    ['GEN 003', 'Science, Technology and Society', 3, 3],
    ['EDU 531', 'Facilitating Learner-Centered Teaching', 3, 3],
    ['NST 022', 'National Service Training Program 2', 3, 3],
    ['EDU 537', 'Foundation of Special and Inclusive Education', 3, 3],
    ['PED 031', 'Physical Activities Toward Health and Fitness (PATHFIT 2) Exercise-Based Fitness Activities', 2, 2],
    ['EDU 538', 'Building and Enhancing New Literacies Across the Curriculum', 3, 3],
    ['EDU 011', 'The Teaching Profession', 3, 3],
    ['EDU 534', 'Technology for Teaching and Learning 1', 3, 3],
    ['EDU 563', 'Teaching Music in the Elementary Grades', 3, 3],
    ['EDU 566', 'Teaching Social Studies in Elementary Grades (Philippine History and Government)', 3, 3],
    ['GEN 006', 'Ethics', 3, 3],
    ['EDU 562', 'Teaching Science in the Elementary Grades (Biology and Chemistry)', 3, 3],
    ['PED 032', 'Physical Activities Toward Health and Fitness (PATHFIT 3) Individual and Dual Sports', 2, 2],
    ['SSP 005', 'Student Success Program 1', 1, 1],
    ['EDU 536', 'The Teacher and the Community, School Culture and Organizational Leadership', 3, 3],
    ['EDU 532', 'The Teacher and the School Curriculum', 3, 3],
    ['EDU 533', 'Assessment in Learning 1', 3, 3],
    ['EDU 569', 'Teaching English in Elementary Grades (Language Arts)', 3, 3],
    ['EDU 564', 'Teaching Math in the Primary Grades', 3, 3],
    ['EDU 578', 'Technology for Teaching and Learning in the Elementary Grades', 3, 3],
    ['EDU 571', 'Teaching Social Studies in Elementary Grades (Culture and Geography)', 3, 3],
    ['PED 033', 'Physical Activities Toward Health and Fitness (PATHFIT 4) Team Sports', 2, 2],
    ['SSP 006', 'Student Success Program 2', 1, 1],
    ['EDU 573', 'Pagtuturo ng Filipino sa Elementarya II - Panitikan ng Filipinas', 3, 3],
    ['EDU 567', 'Pagtuturo ng Filipino sa Elementarya I - Estruktura at Gamit ng Wikang Filipino', 3, 3],
    ['EDU 570', 'Teaching Science in Intermediate Grades (Physics, Earth and Space Science)', 3, 3],
    ['EDU 572', 'Teaching PE and Health in the Elementary Grades', 3, 3],
    ['EDU 535', 'Assessment in Learning 2', 3, 3],
    ['EDU 575', 'Teaching English in the Elementary Grades through Literature', 3, 3],
    ['EDU 574', 'Teaching Math in the Intermediate Grades', 3, 3],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    ['GEN 010', 'Gender and Society', 3, 3],
    ['EDU 580', 'Research in Education', 3, 3],
    ['SCX 010', 'Environmental Science', 3, 3],
    ['HIS 007', 'Life and Works of Rizal', 3, 3],
    ['EDU 729', 'Peace Education and Philippine Indigenous Communities', 3, 3],
    ['EDU 577', 'Good Manners and Right Conduct (Edukasyon sa Pagpapakatao)', 3, 3],
    ['EDU 565', 'Teaching Arts in the Elementary Grades', 3, 3],
    ['SSP 008', 'Student Success Program 4', 1, 1],
    ['EDU 568', 'Edukasyong Pantahanan at Pangkabuhayan', 3, 3],
    ['EDU 576', 'Edukasyong Pantahanan at Pangkabuhayan (with Entrepreneurship)', 3, 3],
    ['EDU 540', 'Teaching Multi-grade Classes', 3, 3],
    ['EDU 579', 'Content and Pedagogy for the Mother-Tongue', 3, 3],
    ['EDU 600', 'Field Study 1', 3, 3],
    ['EDU 601', 'Field Study 2', 3, 3],
    ['EDU 728', 'Professional Integration', 6, 6],
    ['EDU 541', 'Teaching Internship', 6, 6],
];

$minorPrefixes = ['GEN', 'ART', 'HIS', 'MAT', 'PED', 'NST', 'SCX', 'SSP'];
$subjectType = static function (string $code) use ($minorPrefixes): string {
    $prefix = strtoupper(strtok(trim($code), ' ') ?: trim($code));

    return in_array($prefix, $minorPrefixes, true) ? 'minor' : 'core';
};

$curriculumRows = [
    ['GEN 001', 1, 1], ['GEN 004', 1, 1], ['ART 002', 1, 1], ['GEN 005', 1, 1], ['EDU 530', 1, 1], ['NST 021', 1, 1], ['PED 030', 1, 1],
    ['GEN 002', 1, 2], ['MAT 152', 1, 2], ['GEN 003', 1, 2], ['EDU 531', 1, 2], ['NST 022', 1, 2], ['EDU 537', 1, 2], ['PED 031', 1, 2],
    ['EDU 538', 2, 1], ['EDU 011', 2, 1], ['EDU 534', 2, 1], ['EDU 563', 2, 1], ['EDU 566', 2, 1], ['GEN 006', 2, 1], ['EDU 562', 2, 1], ['PED 032', 2, 1], ['SSP 005', 2, 1],
    ['EDU 536', 2, 2], ['EDU 532', 2, 2], ['EDU 533', 2, 2], ['EDU 569', 2, 2], ['EDU 564', 2, 2], ['EDU 578', 2, 2], ['EDU 571', 2, 2], ['PED 033', 2, 2], ['SSP 006', 2, 2],
    ['EDU 573', 3, 1], ['EDU 567', 3, 1], ['EDU 570', 3, 1], ['EDU 572', 3, 1], ['EDU 535', 3, 1], ['EDU 575', 3, 1], ['EDU 574', 3, 1], ['SSP 007', 3, 1], ['GEN 010', 3, 1],
    ['EDU 580', 3, 2], ['SCX 010', 3, 2], ['HIS 007', 3, 2], ['EDU 729', 3, 2], ['EDU 577', 3, 2], ['EDU 565', 3, 2], ['SSP 008', 3, 2], ['EDU 568', 3, 2],
    ['EDU 576', 3, 3], ['EDU 540', 3, 3], ['EDU 579', 3, 3],
    ['EDU 600', 4, 1], ['EDU 601', 4, 1],
    ['EDU 728', 4, 2], ['EDU 541', 4, 2],
];

$prerequisites = [
    'EDU 531' => ['EDU 530'],
    'NST 022' => ['NST 021'],
    'EDU 537' => ['EDU 530'],
    'PED 031' => ['PED 030'],
    'EDU 011' => ['EDU 531'],
    'EDU 534' => ['EDU 531'],
    'EDU 566' => ['GEN 004'],
    'EDU 562' => ['GEN 003'],
    'PED 032' => ['PED 031'],
    'EDU 536' => ['EDU 011'],
    'EDU 532' => ['EDU 534'],
    'EDU 533' => ['EDU 534'],
    'EDU 569' => ['GEN 001'],
    'EDU 564' => ['MAT 152'],
    'EDU 578' => ['EDU 534'],
    'EDU 571' => ['EDU 566'],
    'PED 033' => ['PED 032'],
    'SSP 006' => ['SSP 005'],
    'EDU 570' => ['EDU 562'],
    'EDU 572' => ['PED 033'],
    'EDU 535' => ['EDU 533'],
    'EDU 575' => ['EDU 569'],
    'EDU 574' => ['EDU 564'],
    'SSP 007' => ['SSP 006'],
    'EDU 577' => ['GEN 002'],
    'EDU 565' => ['ART 002'],
    'SSP 008' => ['SSP 007'],
    'EDU 576' => ['EDU 568'],
    'EDU 540' => ['EDU 729'],
    'EDU 579' => ['EDU 536'],
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

    $researchExcluded = ['EDU 729', 'EDU 577', 'EDU 565', 'EDU 570', 'EDU 540', 'EDU 568', 'EDU 579'];
    $researchRequiredCodes = collect($curriculumRows)
        ->filter(fn (array $row) => $subjectType($row[0]) === 'core')
        ->filter(fn (array $row) => (int) $row[1] < 3 || ((int) $row[1] === 3 && (int) $row[2] === 1))
        ->reject(fn (array $row) => $row[0] === 'EDU 580')
        ->reject(fn (array $row) => in_array($row[0], $researchExcluded, true))
        ->pluck(0)
        ->all();
    $syncPrerequisites('EDU 580', $researchRequiredCodes, 'all major subjects except EDU729, EDU577, EDU565, EDU570, EDU540, EDU568 and EDU579');

    $professionalAndMajorBeforeFourthCodes = collect($curriculumRows)
        ->filter(fn (array $row) => (int) $row[1] < 4)
        ->filter(fn (array $row) => $subjectType($row[0]) === 'core')
        ->pluck(0)
        ->all();
    $syncPrerequisites('EDU 600', $professionalAndMajorBeforeFourthCodes, 'all professional and major specialization subjects');
    $syncPrerequisites('EDU 601', $professionalAndMajorBeforeFourthCodes, 'all professional and major specialization subjects');

    $professionalAndMajorBeforeInternshipCodes = collect($curriculumRows)
        ->filter(fn (array $row) => (int) $row[1] < 4 || ((int) $row[1] === 4 && (int) $row[2] === 1))
        ->filter(fn (array $row) => $subjectType($row[0]) === 'core')
        ->reject(fn (array $row) => in_array($row[0], ['EDU 728', 'EDU 541'], true))
        ->pluck(0)
        ->all();
    $syncPrerequisites('EDU 728', $professionalAndMajorBeforeInternshipCodes, 'all professional and major specialization subjects');
    $syncPrerequisites('EDU 541', $professionalAndMajorBeforeInternshipCodes, 'all professional and major specialization subjects');
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
