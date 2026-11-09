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

$department = DB::table('tbl_departments')->where('department_code', 'CAHS')->first()
    ?: DB::table('tbl_departments')->where('department_name', 'like', '%Allied Health%')->first();
$campus = DB::table('tbl_campus')->orderBy('campus_id')->first();

if (! $department || ! $campus) {
    throw new RuntimeException('Missing CAHS department or campus.');
}

$program = DB::table('tbl_program')
    ->where('program_name', 'Bachelor of Science in Pharmacy')
    ->orWhere('program_code', 'BSPHARM')
    ->first();

if (! $program) {
    $programId = DB::table('tbl_program')->insertGetId([
        'department_id' => $department->department_id,
        'campus_id' => $campus->campus_id,
        'program_code' => 'BSPHARM',
        'program_name' => 'Bachelor of Science in Pharmacy',
        'total_units_required' => 181,
    ]);
} else {
    $programId = (int) $program->program_id;
    DB::table('tbl_program')->where('program_id', $programId)->update([
        'department_id' => $program->department_id ?: $department->department_id,
        'campus_id' => $program->campus_id ?: $campus->campus_id,
        'program_code' => $program->program_code ?: 'BSPHARM',
        'program_name' => 'Bachelor of Science in Pharmacy',
        'total_units_required' => $program->total_units_required ?: 181,
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
        'description' => 'Based on CMO No. 25 Series of 2021',
    ]);
} else {
    $headerId = (int) $header->curriculum_header_id;
    DB::table('tbl_curriculum_header')->where('curriculum_header_id', $headerId)->update([
        'description' => 'Based on CMO No. 25 Series of 2021',
    ]);
}

$subjects = [
    ['GEN 001', 'Purposive Communication', 3, 3],
    ['ART 002', 'Art Appreciation', 3, 3],
    ['GEN 004', 'Readings in Philippine History', 3, 3],
    ['PHA 115', 'Pharmaceutical Inorganic Chemistry 1 (with Qualitative Analysis)', 3, 3],
    ['PHA 035', 'Perspectives in Pharmacy', 2, 2],
    ['PHA 040', 'Pharmaceutical Calculations and Techniques', 3, 3],
    ['PHA 048', 'Pharmaceutical Botany with Taxonomy', 3, 3],
    ['NST 021', 'National Service Training Program 1', 3, 3],
    ['PED 030', 'Physical Activities Towards Health and Fitness (PATHFit 1): Movement Competency Training', 2, 2],
    ['GEN 002', 'Understanding the Self', 3, 3],
    ['MAT 152', 'Mathematics in the Modern World', 3, 3],
    ['PHA 034', 'Pharmaceutical Organic Chemistry', 3, 3],
    ['PHA 111', 'Introduction to the Health Care System', 1, 1],
    ['PHA 037', 'Introduction to Pharmacy Administration, Management and Leadership', 2, 2],
    ['HES 101', 'Human Physiology and Pathophysiology', 4, 4],
    ['PHA 039', 'Pharmaceutical Analysis 1 (Quantitative Pharmaceutical Chemistry)', 3, 3],
    ['NST 022', 'National Service Training Program 2', 3, 3],
    ['PED 031', 'Physical Activities Towards Health and Fitness (PATHFit 2): Exercise Based Fitness Activities', 2, 2],
    ['GEN 005', 'The Contemporary World', 3, 3],
    ['GEN 003', 'Science, Technology and Society', 3, 3],
    ['HIS 007', 'Life and Works of Rizal', 3, 3],
    ['GEN 006', 'Ethics', 3, 3],
    ['GEN 010', 'Gender and Society', 3, 3],
    ['PHA 041', 'Pharmaceutical Dosage Forms, Drug Delivery Systems and Medical Devices', 4, 4],
    ['PHA 042', 'Dispensing 1 (Dispensing Process and Interpreting Prescriptions)', 2, 2],
    ['PHA 110', 'Pharmaceutical Biochemistry', 4, 4],
    ['PHA 044', 'Physical Pharmacy', 3, 3],
    ['PHA 045', 'Complementary and Alternative Medicine', 1, 1],
    ['PHA 046', 'Pharmaceutical Microbiology and Parasitology', 4, 4],
    ['PED 032', 'Physical Activities Towards Health and Fitness (PATHFit 3): Individual and Dual Sports', 2, 2],
    ['SSP 005', 'Student Success Program 1', 1, 1],
    ['SCX 010', 'Environmental Science', 3, 3],
    ['ENG 188', 'Philippine Popular Culture', 3, 3],
    ['PHA 093', 'Pharmaceutical and Medicinal Organic Chemistry', 4, 4],
    ['PHA 112', 'Pharmacognosy and Plant Chemistry', 4, 4],
    ['PHA 052', 'Pharmaceutical Analysis 2 (Instrumental Methods of Analysis)', 3, 3],
    ['PHA 053', 'Pharmacology 1', 3, 3],
    ['PHA 094', 'Pharmacy Informatics', 2, 2],
    ['PED 033', 'Physical Activities Towards Health and Fitness (PATHFit 4): Team Sports', 2, 2],
    ['SSP 006', 'Student Success Program 2', 1, 1],
    ['PHA 068', 'Biopharmaceutics & Pharmacokinetics', 3, 3],
    ['PHA 114', 'Pharmaceutical Manufacturing (with Regulatory Pharmacy, Quality Assurance & CGMP)', 4, 4],
    ['PHA 116', 'Dispensing II (Medication Safety, Counseling and Pharmacy Services)', 3, 3],
    ['PHA 113', 'Drug Discovery, Design, and Development', 1, 1],
    ['PHA 108', 'Pharmacology 2', 3, 3],
    ['PHA 058', 'Clinical Pharmacy and Pharmacotherapeutics 1', 3, 3],
    ['PHA 073', 'Pharmacy Research Methods with Pharmaceutical Statistics', 2, 2],
    ['PHA 109', 'Hospital Pharmacy', 2, 2],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    ['PHA 080', 'Pharmaceutical Toxicology', 3, 3],
    ['PHA 061', 'Clinical Pharmacy and Pharmacotherapeutics 2', 3, 3],
    ['PHA 062', 'Public Health Pharmacy (with Pharmacoepidemiology)', 3, 3],
    ['PHA 077', 'Pharmacy Research and Thesis Writing', 3, 3],
    ['PHA 064', 'Health Technology Assessment and Health Policy (with Pharmacoeconomics)', 2, 2],
    ['PHA 065', 'Social and Administrative Pharmacy', 1, 1],
    ['PHA 066', 'Pharmaceutical Marketing and Entrepreneurship', 2, 2],
    ['PHA 078', 'Legal Pharmacy and Ethics', 2, 2],
    ['PHA 107', 'Cosmetic Product Development, Regulations and Safety', 2, 2],
    ['SSP 008', 'Student Success Program 4', 1, 1],
    ['PHA 082', 'Experiential Pharmacy Practice in Institutional Pharmacy', 2, 2],
    ['PHA 083', 'Experiential Pharmacy Practice in Public Health and Regulatory Pharmacy', 4, 4],
    ['PHA 084', 'Experiential Pharmacy Practice in Community Pharmacy', 6, 6],
    ['SSP 009', 'Student Success Program 5', 1, 1],
    ['PHA 096', 'Pharmacy Seminar 1', 1, 1],
    ['PHA 085', 'Experiential Pharmacy Practice in Hospital Pharmacy', 6, 6],
    ['PHA 086', 'Experiential Pharmacy Practice in Industry Pharmacy', 6, 6],
    ['PHA 097', 'Pharmacy Seminar 2', 1, 1],
];

$minorPrefixes = ['GEN', 'ART', 'MAT', 'NST', 'PED', 'HIS', 'SCX', 'ENG', 'SSP'];
$subjectType = static function (string $code) use ($minorPrefixes): string {
    $prefix = strtoupper(strtok(trim($code), ' ') ?: trim($code));
    return in_array($prefix, $minorPrefixes, true) ? 'minor' : 'core';
};

$insertedSubjects = 0;
$updatedSubjects = 0;
$insertedCurriculumRows = 0;
$updatedCurriculumRows = 0;
$insertedRequisites = 0;

DB::transaction(function () use (
    $subjects,
    $findSubject,
    $subjectId,
    $programId,
    $headerId,
    $subjectType,
    &$insertedSubjects,
    &$updatedSubjects,
    &$insertedCurriculumRows,
    &$updatedCurriculumRows,
    &$insertedRequisites
) {
    foreach ($subjects as [$code, $name, $units, $hours]) {
        $existing = $findSubject($code);
        if ($existing) {
            $updates = [
                'number_of_units' => $existing->number_of_units ?: $units,
                'number_of_hrs' => $existing->number_of_hrs ?: $hours,
            ];

            if (str_starts_with(strtoupper(trim($code)), 'PHA')) {
                $updates['subject_name'] = $name;
            }

            DB::table('tbl_subjects')->where('subject_id', $existing->subject_id)->update($updates);
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
        ['GEN 001', 1, 1], ['ART 002', 1, 1], ['GEN 004', 1, 1], ['PHA 115', 1, 1],
        ['PHA 035', 1, 1], ['PHA 040', 1, 1], ['PHA 048', 1, 1], ['NST 021', 1, 1], ['PED 030', 1, 1],
        ['GEN 002', 1, 2], ['MAT 152', 1, 2], ['PHA 034', 1, 2], ['PHA 111', 1, 2],
        ['PHA 037', 1, 2], ['HES 101', 1, 2], ['PHA 039', 1, 2], ['NST 022', 1, 2], ['PED 031', 1, 2],
        ['GEN 005', 2, 3], ['GEN 003', 2, 3], ['HIS 007', 2, 3],
        ['GEN 006', 2, 1], ['GEN 010', 2, 1], ['PHA 041', 2, 1], ['PHA 042', 2, 1],
        ['PHA 110', 2, 1], ['PHA 044', 2, 1], ['PHA 045', 2, 1], ['PHA 046', 2, 1],
        ['PED 032', 2, 1], ['SSP 005', 2, 1],
        ['SCX 010', 2, 2], ['ENG 188', 2, 2], ['PHA 093', 2, 2], ['PHA 112', 2, 2],
        ['PHA 052', 2, 2], ['PHA 053', 2, 2], ['PHA 094', 2, 2], ['PED 033', 2, 2], ['SSP 006', 2, 2],
        ['PHA 068', 3, 1], ['PHA 114', 3, 1], ['PHA 116', 3, 1], ['PHA 113', 3, 1],
        ['PHA 108', 3, 1], ['PHA 058', 3, 1], ['PHA 073', 3, 1], ['PHA 109', 3, 1], ['SSP 007', 3, 1],
        ['PHA 080', 3, 2], ['PHA 061', 3, 2], ['PHA 062', 3, 2], ['PHA 077', 3, 2],
        ['PHA 064', 3, 2], ['PHA 065', 3, 2], ['PHA 066', 3, 2], ['PHA 078', 3, 2],
        ['PHA 107', 3, 2], ['SSP 008', 3, 2],
        ['PHA 082', 4, 1], ['PHA 083', 4, 1], ['PHA 084', 4, 1], ['SSP 009', 4, 1], ['PHA 096', 4, 1],
        ['PHA 085', 4, 2], ['PHA 086', 4, 2], ['PHA 097', 4, 2],
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
            $updatedCurriculumRows++;
        } else {
            DB::table('curriculum')->insert($payload);
            $insertedCurriculumRows++;
        }
    }

    $requisites = [
        'NST 022' => ['prerequisite' => ['NST 021']],
        'PED 031' => ['prerequisite' => ['PED 030']],
        'PHA 041' => ['prerequisite' => ['PHA 040']],
        'PHA 042' => ['prerequisite' => ['PHA 040']],
        'PHA 110' => ['prerequisite' => ['PHA 034']],
        'PHA 044' => ['corequisite' => ['PHA 041']],
        'PED 032' => ['prerequisite' => ['PED 031']],
        'PHA 093' => ['prerequisite' => ['PHA 034'], 'corequisite' => ['PHA 112']],
        'PHA 112' => ['prerequisite' => ['PHA 048']],
        'PHA 052' => ['prerequisite' => ['PHA 039', 'PHA 044']],
        'PHA 053' => ['prerequisite' => ['HES 101', 'PHA 046']],
        'PED 033' => ['prerequisite' => ['PED 032']],
        'PHA 068' => ['prerequisite' => ['PHA 044']],
        'PHA 114' => ['prerequisite' => ['PHA 044']],
        'PHA 116' => ['prerequisite' => ['PHA 041', 'PHA 042']],
        'PHA 108' => ['prerequisite' => ['PHA 053']],
        'PHA 058' => ['prerequisite' => ['PHA 053']],
        'PHA 073' => ['prerequisite' => ['PHA 094']],
        'SSP 007' => ['prerequisite' => ['SSP 006']],
        'PHA 080' => ['prerequisite' => ['PHA 108']],
        'PHA 061' => ['prerequisite' => ['PHA 058']],
        'PHA 062' => ['prerequisite' => ['PHA 046']],
        'PHA 077' => ['prerequisite' => ['PHA 073']],
        'PHA 107' => ['prerequisite' => ['PHA 114']],
        'SSP 008' => ['prerequisite' => ['SSP 007']],
        'SSP 009' => ['prerequisite' => ['SSP 008']],
        'PHA 097' => ['prerequisite' => ['PHA 096']],
    ];

    foreach ($requisites as $subjectCode => $types) {
        $mainSubjectId = $subjectId($subjectCode);
        $firstRequisiteId = null;

        foreach ($types as $type => $requiredCodes) {
            foreach ($requiredCodes as $requiredCode) {
                $requiredSubjectId = $subjectId($requiredCode);
                $existing = DB::table('tbl_prerequisite')
                    ->where('subject_id', $mainSubjectId)
                    ->where('requisite_type', $type)
                    ->where('requisites_subject_id', $requiredSubjectId)
                    ->first();

                if (! $existing) {
                    $requisiteId = DB::table('tbl_prerequisite')->insertGetId([
                        'subject_id' => $mainSubjectId,
                        'requisite_type' => $type,
                        'requisites_subject_id' => $requiredSubjectId,
                    ]);
                    $insertedRequisites++;
                } else {
                    $requisiteId = (int) $existing->requisites_id;
                    DB::table('tbl_prerequisite')
                        ->where('subject_id', $mainSubjectId)
                        ->where('requisite_type', $type)
                        ->where('requisites_subject_id', $requiredSubjectId)
                        ->where('requisites_id', '!=', $requisiteId)
                        ->delete();
                }

                if ($type === 'prerequisite') {
                    $firstRequisiteId ??= $requisiteId;
                }
            }
        }

        if ($firstRequisiteId) {
            DB::table('curriculum')
                ->where('program_id', $programId)
                ->where('subject_id', $mainSubjectId)
                ->update(['requisite_id' => $firstRequisiteId]);
        }
    }

    $fourthYearStandingSubjectCodes = ['PHA 082', 'PHA 083', 'PHA 084', 'PHA 096', 'PHA 085', 'PHA 086'];
    $fourthYearStandingRequiredIds = DB::table('curriculum')
        ->where('program_id', $programId)
        ->whereBetween('year_level', [1, 3])
        ->whereNotNull('subject_id')
        ->pluck('subject_id')
        ->map(fn ($id) => (int) $id)
        ->unique()
        ->values();

    foreach ($fourthYearStandingSubjectCodes as $subjectCode) {
        $mainSubjectId = $subjectId($subjectCode);

        DB::table('tbl_prerequisite')
            ->where('subject_id', $mainSubjectId)
            ->where('requisite_type', 'prerequisite')
            ->whereNotIn('requisites_subject_id', $fourthYearStandingRequiredIds)
            ->delete();

        $firstRequisiteId = null;
        foreach ($fourthYearStandingRequiredIds as $requiredSubjectId) {
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
                    'rule_label' => '4th year standing',
                ]);
                $insertedRequisites++;
            } else {
                $requisiteId = (int) $existing->requisites_id;
                DB::table('tbl_prerequisite')->where('requisites_id', $requisiteId)->update([
                    'rule_label' => '4th year standing',
                ]);
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
    'inserted_curriculum_rows' => $insertedCurriculumRows,
    'updated_curriculum_rows' => $updatedCurriculumRows,
    'pharmacy_curriculum_rows' => DB::table('curriculum')->where('program_id', $programId)->count(),
    'inserted_requisites' => $insertedRequisites,
];

echo json_encode($summary, JSON_PRETTY_PRINT) . PHP_EOL;
