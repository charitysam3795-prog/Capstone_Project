<?php
declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__ . '/../../vendor/autoload.php';

$app = require __DIR__ . '/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$normalizeCode = static fn (string $code): string => strtoupper(str_replace(' ', '', trim($code)));

$findSubject = static function (string $code) use ($normalizeCode) {
    $normalized = $normalizeCode($code);

    return DB::table('tbl_subjects')
        ->whereRaw("REPLACE(UPPER(subject_code), ' ', '') = ?", [$normalized])
        ->first();
};

$subjectId = static function (string $code) use ($findSubject): int {
    $subject = $findSubject($code);
    if (! $subject) {
        throw new RuntimeException("Missing subject for prerequisite: {$code}");
    }

    return (int) $subject->subject_id;
};

$department = DB::table('tbl_departments')->where('department_code', 'CAHS')->first()
    ?: DB::table('tbl_departments')->where('department_name', 'like', '%Allied Health%')->first();
$campus = DB::table('tbl_campus')->orderBy('campus_id')->first();

if (! $department || ! $campus) {
    throw new RuntimeException('Missing CAHS department or campus.');
}

$program = DB::table('tbl_program')
    ->where('program_code', 'BSN')
    ->orWhere('program_name', 'Bachelor of Science in Nursing')
    ->first();

if (! $program) {
    $programId = DB::table('tbl_program')->insertGetId([
        'department_id' => $department->department_id,
        'campus_id' => $campus->campus_id,
        'program_code' => 'BSN',
        'program_name' => 'Bachelor of Science in Nursing',
        'total_units_required' => 197,
    ]);
} else {
    $programId = (int) $program->program_id;
    DB::table('tbl_program')->where('program_id', $programId)->update([
        'department_id' => $program->department_id ?: $department->department_id,
        'campus_id' => $program->campus_id ?: $campus->campus_id,
        'program_code' => 'BSN',
        'program_name' => 'Bachelor of Science in Nursing',
        'total_units_required' => $program->total_units_required ?: 197,
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
        'description' => 'Based on CMO No. 15 Series of 2017',
    ]);
} else {
    $headerId = (int) $header->curriculum_header_id;
    DB::table('tbl_curriculum_header')->where('curriculum_header_id', $headerId)->update([
        'description' => 'Based on CMO No. 15 Series of 2017',
    ]);
}

$subjects = [
    ['GEN 002', 'Understanding the Self', 3, 3],
    ['GEN 001', 'Purposive Communication', 3, 3],
    ['MAT 152', 'Mathematics in the Modern World', 3, 3],
    ['NUR 016', 'Theoretical Foundations in Nursing', 3, 3],
    ['HES 006', 'Anatomy and Physiology', 5, 5],
    ['BIO 024', 'Biochemistry', 5, 5],
    ['PED 030', 'Physical Activities Towards Health and Fitness (PATHFit 1): Movement Competency Training', 2, 2],
    ['NST 021', 'National Service Training Program 1', 3, 3],
    ['ART 002', 'Art Appreciation', 3, 3],
    ['GEN 004', 'Readings in Philippine History', 3, 3],
    ['GEN 003', 'Science, Technology, and Society', 3, 3],
    ['NUR 097', 'Health Assessment - Lecture', 3, 3],
    ['NUR 098', 'Health Assessment - RLE', 2, 2],
    ['NUR 091', 'Fundamentals of Nursing Practice - Lecture', 3, 3],
    ['NUR 092', 'Fundamentals of Nursing Practice - RLE', 2, 2],
    ['PED 031', 'Physical Activities Towards Health and Fitness (PATHFit 2): Exercise-Based Fitness Activity', 2, 2],
    ['NST 022', 'National Service Training Program 2', 3, 3],
    ['HES 008', 'Health Education', 3, 3],
    ['NUR 192', 'Community Health Nursing 1 (Individual and Family as Clients) - Lecture', 2, 2],
    ['NUR 193', 'Community Health Nursing 1 (Individual and Family as Clients) - RLE', 2, 2],
    ['ELEC 1', 'Elective 1', 3, 3],
    ['GEN 006', 'Ethics', 3, 3],
    ['NUR 102', 'Nutrition and Diet Therapy', 3, 3],
    ['HES 005', 'Pharmacology', 3, 3],
    ['NUR 194', 'Care of Mother, Child, Adolescent (Well Clients) - Lecture', 4, 4],
    ['NUR 195', 'Care of Mother, Child, Adolescent (Well Clients) - RLE', 5, 5],
    ['HES 007', 'Microbiology and Parasitology', 4, 4],
    ['PED 032', 'Physical Activities Towards Health and Fitness (PATHFit 3): Individual and Dual Sports', 2, 2],
    ['SSP 005', 'Student Success Program 1', 1, 1],
    ['GEN 005', 'The Contemporary World', 3, 3],
    ['SCX 010', 'Environmental Science', 3, 3],
    ['NUR 104', 'Health Care Ethics (Bioethics)', 3, 3],
    ['NUR 145', 'Care of Mother, Child at Risk or with Problems (Acute and Chronic) - Lecture', 6, 6],
    ['NUR 146', 'Care of Mother, Child at Risk or with Problems (Acute and Chronic) - RLE', 6, 6],
    ['NUR 014', 'Nursing Informatics', 3, 3],
    ['HIS 007', 'Life and Works of Rizal', 3, 3],
    ['NUR 153', 'Community Health Nursing II (Population Groups and Community as Clients) - Lecture', 2, 2],
    ['NUR 154', 'Community Health Nursing II (Population Groups and Community as Clients) - RLE', 1, 1],
    ['PED 033', 'Physical Activities Towards Health and Fitness (PATHFit 4): Team Sports', 2, 2],
    ['SSP 006', 'Student Success Program 2', 1, 1],
    ['NUR 155', 'Care of Clients with Problems in Oxygenation and Cellular Aberration - Lecture', 8, 8],
    ['NUR 156', 'Care of Clients with Problems in Oxygenation and Cellular Aberration - RLE', 6, 6],
    ['NUR 114', 'Disaster Nursing - Lecture', 2, 2],
    ['NUR 218', 'Disaster Nursing - RLE', 1, 1],
    ['NUR 151', 'Care of the Older Adult - Lecture', 2, 2],
    ['NUR 152', 'Care of the Older Adult - RLE', 1, 1],
    ['NUR 027', 'Nursing Research 1', 3, 3],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    ['NUR 149', 'Care of Clients with Problems in Nutrition and Metabolism - Lecture', 5, 5],
    ['NUR 150', 'Care of Clients with Problems in Nutrition and Metabolism - RLE', 4, 4],
    ['NUR 147', 'Care of Clients with Maladaptive Patterns of Behavior - Lecture', 3, 3],
    ['NUR 148', 'Care of Clients with Maladaptive Patterns of Behavior - RLE', 3, 3],
    ['GEN 010', 'Gender and Society', 3, 3],
    ['SSP 008', 'Student Success Program 4', 1, 1],
    ['NUR 028', 'Nursing Research 2', 2, 2],
    ['NUR 198', 'Care of Clients with Maladaptive Patterns of Behavior - Lecture', 1, 1],
    ['NUR 199', 'Care of Clients with Maladaptive Patterns of Behavior - RLE', 1, 1],
    ['NUR 200', 'Nursing Care of Clients with Life Threatening Conditions - Lecture', 4, 4],
    ['NUR 201', 'Nursing Care of Clients with Life Threatening Conditions - RLE', 5, 5],
    ['NUR 216', 'Nursing Leadership and Management - Lecture', 4, 4],
    ['NUR 217', 'Nursing Leadership and Management - RLE', 3, 3],
    ['NUR 227', 'Nursing Seminar 1', 3, 3],
    ['SSP 009', 'Student Success Program 5', 1, 1],
    ['NUR 038', 'Intensive Nursing Practicum', 8, 8],
    ['NUR 228', 'Nursing Seminar 2', 3, 3],
];

$minorPrefixes = ['GEN', 'MAT', 'PED', 'NST', 'ART', 'HIS', 'SCX', 'SSP'];
$subjectType = static function (string $code) use ($minorPrefixes): string {
    $prefix = strtoupper(strtok(trim($code), ' ') ?: trim($code));
    if ($prefix === 'ELEC') {
        return 'elective subject';
    }

    return in_array($prefix, $minorPrefixes, true) ? 'minor' : 'core';
};

$insertedSubjects = 0;
$updatedSubjects = 0;

DB::transaction(function () use (
    $subjects,
    $findSubject,
    &$insertedSubjects,
    &$updatedSubjects,
    $programId,
    $headerId,
    $subjectType,
    $subjectId
) {
    foreach ($subjects as [$code, $name, $units, $hours]) {
        $existing = $findSubject($code);
        if ($existing) {
            DB::table('tbl_subjects')->where('subject_id', $existing->subject_id)->update([
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

    $curriculumRows = [
        ['GEN 002', 1, 1], ['GEN 001', 1, 1], ['MAT 152', 1, 1], ['NUR 016', 1, 1],
        ['HES 006', 1, 1], ['BIO 024', 1, 1], ['PED 030', 1, 1], ['NST 021', 1, 1],
        ['ART 002', 1, 2], ['GEN 004', 1, 2], ['GEN 003', 1, 2], ['NUR 097', 1, 2],
        ['NUR 098', 1, 2], ['NUR 091', 1, 2], ['NUR 092', 1, 2], ['PED 031', 1, 2],
        ['NST 022', 1, 2], ['HES 008', 1, 2],
        ['NUR 192', 2, 3], ['NUR 193', 2, 3], ['ELEC 1', 2, 3],
        ['GEN 006', 2, 1], ['NUR 102', 2, 1], ['HES 005', 2, 1], ['NUR 194', 2, 1],
        ['NUR 195', 2, 1], ['HES 007', 2, 1], ['PED 032', 2, 1], ['SSP 005', 2, 1],
        ['GEN 005', 2, 1],
        ['SCX 010', 2, 2], ['NUR 104', 2, 2], ['NUR 145', 2, 2], ['NUR 146', 2, 2],
        ['NUR 014', 2, 2], ['HIS 007', 2, 2], ['NUR 153', 2, 2], ['NUR 154', 2, 2],
        ['PED 033', 2, 2], ['SSP 006', 2, 2],
        ['NUR 155', 3, 1], ['NUR 156', 3, 1], ['NUR 114', 3, 1], ['NUR 218', 3, 1],
        ['NUR 151', 3, 1], ['NUR 152', 3, 1], ['NUR 027', 3, 1], ['SSP 007', 3, 1],
        ['NUR 149', 3, 2], ['NUR 150', 3, 2], ['NUR 147', 3, 2], ['NUR 148', 3, 2],
        ['GEN 010', 3, 2], ['SSP 008', 3, 2], ['NUR 028', 3, 2],
        ['NUR 198', 4, 3], ['NUR 199', 4, 3],
        ['NUR 200', 4, 1], ['NUR 201', 4, 1], ['NUR 216', 4, 1], ['NUR 217', 4, 1],
        ['NUR 227', 4, 1], ['SSP 009', 4, 1],
        ['NUR 038', 4, 2], ['NUR 228', 4, 2],
    ];

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
        } else {
            DB::table('curriculum')->insert($payload);
        }
    }

    $prerequisites = [
        'NUR 097' => ['NUR 016', 'HES 006'],
        'NUR 098' => ['NUR 016', 'HES 006'],
        'NUR 091' => ['NUR 016', 'HES 006'],
        'NUR 092' => ['NUR 016', 'HES 006'],
        'PED 031' => ['PED 030'],
        'NST 022' => ['NST 021'],
        'NUR 192' => ['NUR 097', 'NUR 098', 'NUR 091', 'NUR 092'],
        'NUR 193' => ['NUR 097', 'NUR 098', 'NUR 091', 'NUR 092'],
        'NUR 102' => ['HES 006'],
        'HES 005' => ['MAT 152', 'HES 006', 'NUR 097', 'NUR 098', 'NUR 091', 'NUR 092'],
        'NUR 194' => ['NUR 097', 'NUR 098', 'NUR 091', 'NUR 092'],
        'NUR 195' => ['NUR 097', 'NUR 098', 'NUR 091', 'NUR 092'],
        'HES 007' => ['HES 006'],
        'PED 032' => ['PED 031'],
        'NUR 104' => ['GEN 002', 'GEN 003'],
        'NUR 145' => ['NUR 194', 'NUR 195'],
        'NUR 146' => ['NUR 194', 'NUR 195'],
        'NUR 153' => ['NUR 192', 'NUR 193'],
        'NUR 154' => ['NUR 192', 'NUR 193'],
        'PED 033' => ['PED 032'],
        'SSP 006' => ['SSP 005'],
        'NUR 155' => ['NUR 145', 'NUR 146'],
        'NUR 156' => ['NUR 145', 'NUR 146'],
        'NUR 114' => ['NUR 145', 'NUR 146'],
        'NUR 218' => ['NUR 145', 'NUR 146'],
        'NUR 151' => ['NUR 153', 'NUR 154'],
        'NUR 152' => ['NUR 153', 'NUR 154'],
        'NUR 027' => ['MAT 152'],
        'SSP 007' => ['SSP 006'],
        'NUR 149' => ['NUR 155', 'NUR 156'],
        'NUR 150' => ['NUR 155', 'NUR 156'],
        'NUR 147' => ['NUR 151', 'NUR 152'],
        'NUR 148' => ['NUR 151', 'NUR 152'],
        'SSP 008' => ['SSP 007'],
        'NUR 028' => ['NUR 027'],
        'NUR 198' => ['NUR 147', 'NUR 148'],
        'NUR 199' => ['NUR 147', 'NUR 148'],
        'NUR 200' => ['NUR 155', 'NUR 156'],
        'NUR 201' => ['NUR 155', 'NUR 156'],
        'NUR 216' => ['NUR 155', 'NUR 156'],
        'NUR 217' => ['NUR 155', 'NUR 156'],
        'NUR 227' => ['NUR 155', 'NUR 156'],
        'SSP 009' => ['SSP 008'],
    ];

    $professionalSubjectCodes = [
        'NUR 016', 'HES 006', 'BIO 024', 'NUR 097', 'NUR 098', 'NUR 091', 'NUR 092', 'HES 008',
        'NUR 192', 'NUR 193', 'NUR 102', 'HES 005', 'NUR 194', 'NUR 195', 'HES 007', 'NUR 104',
        'NUR 145', 'NUR 146', 'NUR 014', 'NUR 153', 'NUR 154', 'NUR 155', 'NUR 156', 'NUR 114',
        'NUR 218', 'NUR 151', 'NUR 152', 'NUR 027', 'NUR 149', 'NUR 150', 'NUR 147', 'NUR 148',
        'NUR 028', 'NUR 198', 'NUR 199', 'NUR 200', 'NUR 201', 'NUR 216', 'NUR 217', 'NUR 227',
    ];
    $prerequisites['NUR 038'] = $professionalSubjectCodes;
    $prerequisites['NUR 228'] = $professionalSubjectCodes;

    foreach ($prerequisites as $subjectCode => $requiredCodes) {
        $mainSubjectId = $subjectId($subjectCode);
        $firstRequisiteId = null;

        foreach ($requiredCodes as $requiredCode) {
            $requiredSubjectId = $subjectId($requiredCode);
            $existing = DB::table('tbl_prerequisite')
                ->where('subject_id', $mainSubjectId)
                ->where('requisite_type', 'prerequisite')
                ->where('requisites_subject_id', $requiredSubjectId)
                ->first();

            if (! $existing) {
                $requisiteId = DB::table('tbl_prerequisite')->insertGetId([
                    'subject_id' => $mainSubjectId,
                    'requisite_type' => 'prerequisite',
                    'requisites_subject_id' => $requiredSubjectId,
                ]);
            } else {
                $requisiteId = (int) $existing->requisites_id;
                DB::table('tbl_prerequisite')
                    ->where('subject_id', $mainSubjectId)
                    ->where('requisite_type', 'prerequisite')
                    ->where('requisites_subject_id', $requiredSubjectId)
                    ->where('requisites_id', '!=', $requisiteId)
                    ->delete();
            }

            $firstRequisiteId ??= $requisiteId;
        }

        if ($firstRequisiteId) {
            DB::table('curriculum')
                ->where('program_id', $programId)
                ->where('subject_id', $mainSubjectId)
                ->update(['requisite_id' => $firstRequisiteId]);
        }
    }
});

$summary = [
    'program_id' => $programId,
    'curriculum_header_id' => $headerId,
    'inserted_subjects' => $insertedSubjects,
    'reused_or_updated_subjects' => $updatedSubjects,
    'curriculum_rows' => DB::table('curriculum')->where('program_id', $programId)->count(),
    'nursing_prerequisite_rows' => DB::table('tbl_prerequisite as p')
        ->join('tbl_subjects as s', 's.subject_id', '=', 'p.subject_id')
        ->whereRaw("REPLACE(UPPER(s.subject_code), ' ', '') LIKE 'NUR%'")
        ->count(),
];

echo json_encode($summary, JSON_PRETTY_PRINT) . PHP_EOL;
