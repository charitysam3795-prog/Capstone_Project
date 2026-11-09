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

$department = DB::table('tbl_departments')->where('department_code', 'CCJE')->first()
    ?: DB::table('tbl_departments')->where('department_name', 'like', '%Criminal Justice%')->first();

if (! $department) {
    $departmentId = DB::table('tbl_departments')->insertGetId([
        'campus_id' => $campus->campus_id,
        'department_code' => 'CCJE',
        'department_name' => 'College of Criminal Justice Education',
    ]);
} else {
    $departmentId = (int) $department->department_id;
    DB::table('tbl_departments')->where('department_id', $departmentId)->update([
        'campus_id' => $department->campus_id ?: $campus->campus_id,
        'department_code' => $department->department_code ?: 'CCJE',
        'department_name' => 'College of Criminal Justice Education',
    ]);
}

$program = DB::table('tbl_program')
    ->where('program_code', 'BSCRIM')
    ->orWhere('program_name', 'Bachelor of Science in Criminology')
    ->first();

if (! $program) {
    $programId = DB::table('tbl_program')->insertGetId([
        'department_id' => $departmentId,
        'campus_id' => $campus->campus_id,
        'program_code' => 'BSCRIM',
        'program_name' => 'Bachelor of Science in Criminology',
        'total_units_required' => 185,
    ]);
} else {
    $programId = (int) $program->program_id;
    DB::table('tbl_program')->where('program_id', $programId)->update([
        'department_id' => $program->department_id ?: $departmentId,
        'campus_id' => $program->campus_id ?: $campus->campus_id,
        'program_code' => $program->program_code ?: 'BSCRIM',
        'program_name' => 'Bachelor of Science in Criminology',
        'total_units_required' => $program->total_units_required ?: 185,
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
        'description' => 'Effective SY 2023-2024; Based on CMO No. 05 s. 2018',
    ]);
} else {
    $headerId = (int) $header->curriculum_header_id;
    DB::table('tbl_curriculum_header')->where('curriculum_header_id', $headerId)->update([
        'description' => 'Effective SY 2023-2024; Based on CMO No. 05 s. 2018',
    ]);
}

$subjects = [
    ['GEN 001', 'Purposive Communication', 3, 3],
    ['GEN 002', 'Understanding the Self', 3, 3],
    ['HIS 007', 'Life and Works of Rizal', 3, 3],
    ['MAT 152', 'Mathematics in the Modern World', 3, 3],
    ['CRI 010', 'Introduction to Criminology', 3, 3],
    ['PED 034', 'PATHFit 1: Movement Competency Training for Criminology', 2, 2],
    ['NST 004', 'Military Science 1/Civic Welfare Training Service 1', 3, 3],
    ['ART 002', 'Art Appreciation', 3, 3],
    ['GEN 003', 'Science, Technology and Society', 3, 3],
    ['GEN 004', 'Readings in Philippine History', 3, 3],
    ['GEN 005', 'The Contemporary World', 3, 3],
    ['CHE 022', 'General Chemistry', 3, 3],
    ['CRI 061', 'Intro to Philippine Criminal Justice System', 3, 3],
    ['PED 035', 'PATHFit 2: Exercise-based Fitness Activities for Criminology', 2, 2],
    ['NST 005', 'Military Science 2/Civic Welfare Training Service 2', 3, 3],
    ['GEN 006', 'Ethics', 3, 3],
    ['SCX 010', 'Environmental Science', 3, 3],
    ['PHI 002', 'Logic', 3, 3],
    ['PED 036', 'PATHFit 3: Outdoor and Adventures Activities for Criminology 1', 2, 2],
    ['CRI 168', 'Law Enforcement Organization and Administration', 4, 4],
    ['CRI 169', 'Fundamentals of Criminal Investigation & Intelligence', 4, 4],
    ['CRI 198', 'Forensic Photography (with Lab)', 3, 3],
    ['SSP 005', 'Student Success Program 1', 1, 1],
    ['ENG 188', 'Philippine Popular Culture', 3, 3],
    ['CRI 029', 'Institutional Corrections', 3, 3],
    ['CRI 057', 'Criminal Law (Book 1)', 3, 3],
    ['PED 037', 'PATHFit 4: Outdoor and Adventures Activities for Criminology 2', 2, 2],
    ['CRI 170', 'Theories of Crime Causation', 3, 3],
    ['CRI 173', 'Comparative Models in Policing', 3, 3],
    ['CRI 174', 'Specialized Crime Investigation 1 with Legal Medicine', 3, 3],
    ['CRI 199', 'Personal Identification Techniques (with Lab)', 3, 3],
    ['SSP 006', 'Student Success Program 2', 1, 1],
    ['CRI 171', 'Nationalism and Patriotism', 3, 3],
    ['CRI 166', 'Human Rights Education', 3, 3],
    ['CRI 023', 'Forensic Chemistry and Toxicology', 5, 5],
    ['CRI 175', 'Leadership, Decision-Making, Management and Administration', 3, 3],
    ['CRI 176', 'Specialized Crime Investigation 2', 3, 3],
    ['CRI 177', 'Human Behavior & Victimology', 3, 3],
    ['CRI 178', 'Introduction to Industrial Security Concepts', 3, 3],
    ['CRI 181', 'Criminal Law (Book 2)', 4, 4],
    ['CRI 201', 'Lie Detection Techniques (with Lab)', 3, 3],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    ['CRI 154', 'Professional Conduct and Ethical Standards', 3, 3],
    ['CRI 165', 'Evidence', 3, 3],
    ['CRI 180', 'Non-Institutional Corrections', 3, 3],
    ['CRI 183', 'Law Enforcement Operations and Planning with Crime Mapping', 3, 3],
    ['CRI 184', 'Juvenile Delinquency and Juvenile Justice System', 3, 3],
    ['CRI 185', 'Technical English 1 (Technical Report Writing and Presentation)', 3, 3],
    ['CRI 200', 'Questioned Documents Examination (with Lab)', 3, 3],
    ['CRI 202', 'Forensic Ballistics (with Lab)', 3, 3],
    ['SSP 008', 'Student Success Program 4', 1, 1],
    ['CRI 179', 'Traffic Management and Accident Investigation with Driving', 3, 3],
    ['CRI 191', 'Criminological Research 1 (Research Methods with Applied Statistics)', 3, 3],
    ['CRI 195', 'Technical English 2 (Legal Forms)', 3, 3],
    ['CRI 060', 'Criminal Procedure and Court Testimony', 3, 3],
    ['CRI 187', 'Criminology Internship (On-the-job Training 1) (270 Field Hours)', 3, 3],
    ['CRI 189', 'Therapeutic Modalities', 2, 2],
    ['CRI 188', 'Fire Protection and Arson Investigation', 3, 3],
    ['CRI 190', 'Dispute Resolution and Crisis/Incidents Management', 3, 3],
    ['CRI 192', 'Vice and Drug Education and Control', 3, 3],
    ['CRI 194', 'Criminological Research 2 (Thesis Writing and Presentation)', 3, 3],
    ['SSP 009', 'Student Success Program 5', 1, 1],
    ['CRI 193', 'Criminology Internship (On-the-job Training 2) (270 Field Hours)', 3, 3],
    ['CRI 196', 'Introduction to Cybercrime and Environmental Laws and Protection', 3, 3],
    ['CRI 197', 'Program Outcomes Audit', 3, 3],
];

$minorPrefixes = ['GEN', 'ART', 'HIS', 'MAT', 'PED', 'NST', 'CHE', 'SCX', 'PHI', 'ENG', 'SSP'];
$subjectType = static function (string $code) use ($minorPrefixes): string {
    $prefix = strtoupper(strtok(trim($code), ' ') ?: trim($code));
    return in_array($prefix, $minorPrefixes, true) ? 'minor' : 'core';
};

$curriculumRows = [
    ['GEN 001', 1, 1], ['GEN 002', 1, 1], ['HIS 007', 1, 1], ['MAT 152', 1, 1], ['CRI 010', 1, 1], ['PED 034', 1, 1], ['NST 004', 1, 1],
    ['ART 002', 1, 2], ['GEN 003', 1, 2], ['GEN 004', 1, 2], ['GEN 005', 1, 2], ['CHE 022', 1, 2], ['CRI 061', 1, 2], ['PED 035', 1, 2], ['NST 005', 1, 2],
    ['GEN 006', 2, 1], ['SCX 010', 2, 1], ['PHI 002', 2, 1], ['PED 036', 2, 1], ['CRI 168', 2, 1], ['CRI 169', 2, 1], ['CRI 198', 2, 1], ['SSP 005', 2, 1],
    ['ENG 188', 2, 2], ['CRI 029', 2, 2], ['CRI 057', 2, 2], ['PED 037', 2, 2], ['CRI 170', 2, 2], ['CRI 173', 2, 2], ['CRI 174', 2, 2], ['CRI 199', 2, 2], ['SSP 006', 2, 2],
    ['CRI 171', 3, 3], ['CRI 166', 3, 3],
    ['CRI 023', 3, 1], ['CRI 175', 3, 1], ['CRI 176', 3, 1], ['CRI 177', 3, 1], ['CRI 178', 3, 1], ['CRI 181', 3, 1], ['CRI 201', 3, 1], ['SSP 007', 3, 1],
    ['CRI 154', 3, 2], ['CRI 165', 3, 2], ['CRI 180', 3, 2], ['CRI 183', 3, 2], ['CRI 184', 3, 2], ['CRI 185', 3, 2], ['CRI 200', 3, 2], ['CRI 202', 3, 2], ['SSP 008', 3, 2],
    ['CRI 179', 4, 3], ['CRI 191', 4, 3], ['CRI 195', 4, 3],
    ['CRI 060', 4, 1], ['CRI 187', 4, 1], ['CRI 189', 4, 1], ['CRI 188', 4, 1], ['CRI 190', 4, 1], ['CRI 192', 4, 1], ['CRI 194', 4, 1], ['SSP 009', 4, 1],
    ['CRI 193', 4, 2], ['CRI 196', 4, 2], ['CRI 197', 4, 2],
];

$prerequisites = [
    'NST 005' => ['NST 004'],
    'CRI 170' => ['CRI 010'],
    'CRI 173' => ['CRI 168'],
    'SSP 006' => ['SSP 005'],
    'CRI 023' => ['CHE 022'],
    'CRI 175' => ['CRI 168'],
    'CRI 176' => ['CRI 169'],
    'CRI 177' => ['CRI 010'],
    'CRI 181' => ['CRI 057'],
    'CRI 201' => ['CRI 169'],
    'SSP 007' => ['SSP 006'],
    'CRI 165' => ['CRI 181'],
    'CRI 183' => ['CRI 168'],
    'SSP 008' => ['SSP 007'],
    'CRI 179' => ['CRI 169'],
    'CRI 195' => ['CRI 185'],
    'CRI 060' => ['CRI 165'],
    'CRI 190' => ['CRI 177'],
    'CRI 192' => ['CRI 169'],
    'CRI 194' => ['CRI 191'],
    'SSP 009' => ['SSP 008'],
    'CRI 193' => ['CRI 187'],
    'CRI 196' => ['CRI 169'],
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
) {
    foreach ($subjects as [$code, $name, $units, $hours]) {
        $existing = $findSubject($code);
        if ($existing) {
            DB::table('tbl_subjects')->where('subject_id', $existing->subject_id)->update([
                'subject_name' => str_starts_with($normalize = strtoupper(trim($code)), 'CRI') ? $name : ($existing->subject_name ?: $name),
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

    $standingCodes = collect($curriculumRows)
        ->filter(fn (array $row) => (int) $row[1] <= 3)
        ->pluck(0)
        ->all();
    $syncPrerequisites('CRI 187', $standingCodes, '4th year standing');

    $allBeforeFinalCodes = collect($curriculumRows)
        ->reject(fn (array $row) => $row[0] === 'CRI 197')
        ->filter(fn (array $row) => (int) $row[1] < 4 || ((int) $row[1] === 4 && (int) $row[2] !== 2))
        ->pluck(0)
        ->all();
    $syncPrerequisites('CRI 197', $allBeforeFinalCodes, 'all subjects from 1st year to 4th year 1st semester');
});

echo json_encode([
    'program_id' => $programId,
    'curriculum_header_id' => $headerId,
    'inserted_subjects' => $insertedSubjects,
    'updated_subjects' => $updatedSubjects,
    'inserted_curriculum_rows' => $insertedCurriculumRows,
    'updated_curriculum_rows' => $updatedCurriculumRows,
    'inserted_requisites' => $insertedRequisites,
    'updated_requisites' => $updatedRequisites,
], JSON_PRETTY_PRINT) . PHP_EOL;
