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
    ->where('program_code', 'BSEDFIL')
    ->orWhere('program_name', 'Bachelor of Secondary Education Major in Filipino')
    ->first();

if (! $program) {
    $programId = DB::table('tbl_program')->insertGetId([
        'department_id' => $departmentId,
        'campus_id' => $campus->campus_id,
        'program_code' => 'BSEDFIL',
        'program_name' => 'Bachelor of Secondary Education Major in Filipino',
        'total_units_required' => 168,
    ]);
} else {
    $programId = (int) $program->program_id;
    DB::table('tbl_program')->where('program_id', $programId)->update([
        'department_id' => $program->department_id ?: $departmentId,
        'campus_id' => $program->campus_id ?: $campus->campus_id,
        'program_code' => $program->program_code ?: 'BSEDFIL',
        'program_name' => 'Bachelor of Secondary Education Major in Filipino',
        'total_units_required' => $program->total_units_required ?: 168,
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
        'description' => 'Effective 2023-2024; Based on CMO No. 75 Series of 2017',
    ]);
} else {
    $headerId = (int) $header->curriculum_header_id;
    DB::table('tbl_curriculum_header')->where('curriculum_header_id', $headerId)->update([
        'description' => 'Effective 2023-2024; Based on CMO No. 75 Series of 2017',
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
    ['EDU 537', 'Foundation of Special and Inclusive Education', 3, 3],
    ['NST 022', 'National Service Training Program 2', 3, 3],
    ['PED 031', 'Physical Activities Toward Health and Fitness (PATHFIT 2) Exercise-Based Fitness Activities', 2, 2],
    ['EDU 538', 'Building and Enhancing New Literacies Across the Curriculum', 3, 3],
    ['EDU 011', 'The Teaching Profession', 3, 3],
    ['EDU 534', 'Technology for Teaching and Learning 1', 3, 3],
    ['FIL 060', 'Ang Filipino sa Kurikulum ng Batayang Edukasyon', 3, 3],
    ['FIL 017', 'Panimulang Linggwistika', 3, 3],
    ['FIL 061', 'Istruktura ng Wikang Filipino', 3, 3],
    ['FIL 059', 'Introduksiyon sa Pag-aaral ng Wika', 3, 3],
    ['GEN 006', 'Ethics', 3, 3],
    ['PED 032', 'Physical Activities Toward Health and Fitness (PATHFIT 3) Individual and Dual Sports', 2, 2],
    ['SSP 005', 'Student Success Program 1', 1, 1],
    ['EDU 533', 'Assessment in Learning 1', 3, 3],
    ['EDU 536', 'The Teacher and the Community, School Culture and Organizational Leadership', 3, 3],
    ['EDU 532', 'The Teacher and the School Curriculum', 3, 3],
    ['FIL 115', 'Barayti at Baryasyon ng Wika', 3, 3],
    ['FIL 062', 'Introduksiyon sa Pagsasalin', 3, 3],
    ['FIL 020', 'Paghahanda at Ebalwasyon ng Kagamitang Panturo', 3, 3],
    ['FIL 113', 'Pagtuturo at Pagtataya ng Makrong Kasanayang Pangwika', 3, 3],
    ['PED 033', 'Physical Activities Toward Health and Fitness (PATHFIT 4) Team Sports', 2, 2],
    ['SSP 006', 'Student Success Program 2', 1, 1],
    ['FIL 117', 'Malikhaing Kuwento at Nobelang Filipino', 3, 3],
    ['FIL 066', 'Sanaysay at Talumpati', 3, 3],
    ['EDU 535', 'Assessment in Learning 2', 3, 3],
    ['FIL 045', 'Panunuring Pampanitikan', 3, 3],
    ['FIL 057', 'Malikhaing Pagsulat', 3, 3],
    ['FIL 039', 'Dulaang Filipino', 3, 3],
    ['EDU 542', 'Technology for Teaching and Learning 2 (Technology in Language Education)', 3, 3],
    ['FIL 114', 'Ugnayan ng Wika, Kultura at Lipunan', 3, 3],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    ['GEN 010', 'Gender and Society', 3, 3],
    ['FIL 041', 'Introduksiyon sa Pananaliksik, Wika at Panitikan', 3, 3],
    ['FIL 040', 'Panulaang Filipino', 3, 3],
    ['FIL 043', 'Introduksiyon sa Pamamahayag', 3, 3],
    ['SCX 010', 'Environmental Science', 3, 3],
    ['HIS 007', 'Life and Works of Rizal', 3, 3],
    ['EDU 729', 'Peace Education and Philippine Indigenous Communities', 3, 3],
    ['FIL 063', 'Kulturang Popular', 3, 3],
    ['SSP 008', 'Student Success Program 4', 1, 1],
    ['FIL 121', 'Filipino para sa Natatanging Gamit', 3, 3],
    ['FIL 067', 'Panitikan ng Rehiyon', 3, 3],
    ['FIL 116', 'Mga Natatanging Diskurso sa Wika at Panitikan', 3, 3],
    ['EDU 601', 'Field Study 2', 3, 3],
    ['EDU 600', 'Field Study 1', 3, 3],
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
    ['GEN 002', 1, 2], ['MAT 152', 1, 2], ['GEN 003', 1, 2], ['EDU 531', 1, 2], ['EDU 537', 1, 2], ['NST 022', 1, 2], ['PED 031', 1, 2],
    ['EDU 538', 2, 1], ['EDU 011', 2, 1], ['EDU 534', 2, 1], ['FIL 060', 2, 1], ['FIL 017', 2, 1], ['FIL 061', 2, 1], ['FIL 059', 2, 1], ['GEN 006', 2, 1], ['PED 032', 2, 1], ['SSP 005', 2, 1],
    ['EDU 533', 2, 2], ['EDU 536', 2, 2], ['EDU 532', 2, 2], ['FIL 115', 2, 2], ['FIL 062', 2, 2], ['FIL 020', 2, 2], ['FIL 113', 2, 2], ['PED 033', 2, 2], ['SSP 006', 2, 2],
    ['FIL 117', 3, 1], ['FIL 066', 3, 1], ['EDU 535', 3, 1], ['FIL 045', 3, 1], ['FIL 057', 3, 1], ['FIL 039', 3, 1], ['EDU 542', 3, 1], ['FIL 114', 3, 1], ['SSP 007', 3, 1], ['GEN 010', 3, 1],
    ['FIL 041', 3, 2], ['FIL 040', 3, 2], ['FIL 043', 3, 2], ['SCX 010', 3, 2], ['HIS 007', 3, 2], ['EDU 729', 3, 2], ['FIL 063', 3, 2], ['SSP 008', 3, 2],
    ['FIL 121', 3, 3], ['FIL 067', 3, 3], ['FIL 116', 3, 3],
    ['EDU 601', 4, 1], ['EDU 600', 4, 1],
    ['EDU 728', 4, 2], ['EDU 541', 4, 2],
];

$prerequisites = [
    'EDU 531' => ['EDU 530'],
    'EDU 537' => ['EDU 530'],
    'NST 022' => ['NST 021'],
    'PED 031' => ['PED 030'],
    'EDU 011' => ['EDU 531'],
    'EDU 534' => ['EDU 531'],
    'PED 032' => ['PED 031'],
    'EDU 533' => ['EDU 534'],
    'EDU 536' => ['EDU 011'],
    'EDU 532' => ['EDU 534'],
    'FIL 115' => ['FIL 017'],
    'FIL 062' => ['FIL 061'],
    'FIL 020' => ['FIL 062'],
    'FIL 113' => ['FIL 060'],
    'PED 033' => ['PED 032'],
    'SSP 006' => ['SSP 005'],
    'EDU 535' => ['EDU 533'],
    'FIL 057' => ['FIL 061'],
    'EDU 542' => ['EDU 534'],
    'SSP 007' => ['SSP 006'],
    'SSP 008' => ['SSP 007'],
    'FIL 121' => ['FIL 061'],
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

    $fil041Excluded = ['FIL 040', 'FIL 043', 'EDU 729', 'FIL 063', 'FIL 121', 'FIL 057', 'FIL 116'];
    $fil041RequiredCodes = collect($curriculumRows)
        ->filter(fn (array $row) => str_starts_with($row[0], 'FIL '))
        ->reject(fn (array $row) => $row[0] === 'FIL 041')
        ->reject(fn (array $row) => in_array($row[0], $fil041Excluded, true))
        ->pluck(0)
        ->all();
    $syncPrerequisites('FIL 041', $fil041RequiredCodes, 'all major subjects except FIL040, FIL043, EDU729, FIL063, FIL121, FIL057 and FIL116');

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
