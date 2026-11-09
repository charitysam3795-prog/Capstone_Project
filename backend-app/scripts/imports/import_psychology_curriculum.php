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
    ?: DB::table('tbl_departments')->where('department_name', 'like', '%Allied Health%')->first()
    ?: DB::table('tbl_departments')->orderBy('department_id')->first();
$campus = DB::table('tbl_campus')->orderBy('campus_id')->first();

if (! $department || ! $campus) {
    throw new RuntimeException('Missing department or campus.');
}

$program = DB::table('tbl_program')
    ->where('program_name', 'Bachelor of Science in Psychology')
    ->orWhere('program_code', 'BSPSY')
    ->first();

if (! $program) {
    $programId = DB::table('tbl_program')->insertGetId([
        'department_id' => $department->department_id,
        'campus_id' => $campus->campus_id,
        'program_code' => 'BSPSY',
        'program_name' => 'Bachelor of Science in Psychology',
        'total_units_required' => 137,
    ]);
} else {
    $programId = (int) $program->program_id;
    DB::table('tbl_program')->where('program_id', $programId)->update([
        'department_id' => $program->department_id ?: $department->department_id,
        'campus_id' => $program->campus_id ?: $campus->campus_id,
        'program_code' => $program->program_code ?: 'BSPSY',
        'program_name' => 'Bachelor of Science in Psychology',
        'total_units_required' => $program->total_units_required ?: 137,
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
        'description' => 'Based on CMO No. 34 Series of 2017',
    ]);
} else {
    $headerId = (int) $header->curriculum_header_id;
    DB::table('tbl_curriculum_header')->where('curriculum_header_id', $headerId)->update([
        'description' => 'Based on CMO No. 34 Series of 2017',
    ]);
}

$subjects = [
    ['GEN 001', 'Purposive Communication', 3, 3],
    ['GEN 004', 'Readings in Philippine History', 3, 3],
    ['ART 002', 'Art Appreciation', 3, 3],
    ['GEN 005', 'The Contemporary World', 3, 3],
    ['PSY 079', 'Introduction to Psychology', 3, 3],
    ['NST 021', 'National Service Training Program 1', 3, 3],
    ['PED 030', 'Physical Activities Toward Health and Fitness (PATHFit 1): Movement Competency Training', 2, 2],
    ['GEN 002', 'Understanding the Self', 3, 3],
    ['GEN 003', 'Science, Technology and Society', 3, 3],
    ['PSY 055', 'Psychological Statistics', 5, 5],
    ['MAT 152', 'Mathematics in the Modern World', 3, 3],
    ['HIS 007', 'Life and Works of Rizal', 3, 3],
    ['NST 022', 'National Service Training Program 2', 3, 3],
    ['PED 031', 'Physical Activities Toward Health and Fitness (PATHFit 2): Exercise-based Fitness Activities', 2, 2],
    ['GEN 006', 'Ethics', 3, 3],
    ['GEN 010', 'Gender and Society', 3, 3],
    ['PSY 068', 'Theories of Personality', 3, 3],
    ['PSY 029', 'Developmental Psychology', 3, 3],
    ['BIO 044', 'General Zoology w/ Laboratory', 5, 5],
    ['PED 032', 'Physical Activities Toward Health and Fitness (PATHFit 3): Individual and Dual Sports', 2, 2],
    ['SSP 005', 'Student Success Program 1', 1, 1],
    ['PHI 002', 'Logic', 3, 3],
    ['SCX 010', 'Environmental Science', 3, 3],
    ['HES 010', 'Human Anatomy and Physiology', 5, 5],
    ['PSY 090', 'Industrial/Organizational Psychology', 3, 3],
    ['PSY 053', 'Cognitive Psychology', 3, 3],
    ['PSY 021', 'Abnormal Psychology', 3, 3],
    ['PED 033', 'Physical Activities Toward Health and Fitness (PATHFit 4): Team Sports', 2, 2],
    ['SSP 006', 'Student Success Program 2', 1, 1],
    ['CHE 005', 'Organic Chemistry w/ Laboratory', 5, 5],
    ['PSY 089', 'Physiological/Biological Psychology', 3, 3],
    ['PSY 087', 'Experimental Psychology', 5, 5],
    ['PSY 088', 'Psychological Assessment', 5, 5],
    ['SSP 007', 'Student Success Program 3', 1, 1],
    ['BIO 024', 'Biochemistry w/ Laboratory', 5, 5],
    ['PSY 084', 'Field Methods in Psychology', 5, 5],
    ['PSY 037', 'Social Psychology', 3, 3],
    ['PSY 034', 'Filipino Psychology', 3, 3],
    ['SSP 008', 'Student Success Program 4', 1, 1],
    ['PSY 101', 'Counseling Psychology (Elective 1)', 3, 3],
    ['PSY 039', 'Research in Psychology 1', 3, 3],
    ['SSP 009', 'Student Success Program 5', 1, 1],
    ['PSY 043', 'Research in Psychology 2', 3, 3],
    ['PSY 085', 'Practicum (Elective 2 Areas Social, Educational, Clinical, Counseling, and Industrial Settings)', 3, 3],
    ['PSY 096', 'Psychology Appraisal', 3, 3],
];

$minorPrefixes = ['GEN', 'ART', 'MAT', 'NST', 'PED', 'HIS', 'SCX', 'PHI', 'SSP'];
$subjectType = static function (string $code) use ($minorPrefixes): string {
    $prefix = strtoupper(strtok(trim($code), ' ') ?: trim($code));
    return in_array($prefix, $minorPrefixes, true) ? 'minor' : 'core';
};

$insertedSubjects = 0;
$updatedSubjects = 0;
$insertedCurriculumRows = 0;
$updatedCurriculumRows = 0;
$insertedRequisites = 0;
$electiveSlotId = null;
$electiveTwoSlotId = null;

$programDepartmentId = (int) DB::table('tbl_program')
    ->where('program_id', $programId)
    ->value('department_id');

DB::transaction(function () use (
    $subjects,
    $findSubject,
    $subjectId,
    $programId,
    $headerId,
    $programDepartmentId,
    $subjectType,
    &$insertedSubjects,
    &$updatedSubjects,
    &$insertedCurriculumRows,
    &$updatedCurriculumRows,
    &$insertedRequisites,
    &$electiveSlotId,
    &$electiveTwoSlotId
) {
    foreach ($subjects as [$code, $name, $units, $hours]) {
        $existing = $findSubject($code);
        if ($existing) {
            $updates = [
                'number_of_units' => $existing->number_of_units ?: $units,
                'number_of_hrs' => $existing->number_of_hrs ?: $hours,
            ];

            if (str_starts_with(strtoupper(trim($code)), 'PSY')) {
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

    $electiveSlot = DB::table('tbl_elective_slot')
        ->where('program_id', $programId)
        ->where('year_level_id', 4)
        ->where('semester_id', 1)
        ->where('slot_name', 'Elective 1')
        ->first();

    if ($electiveSlot) {
        $electiveSlotId = (int) $electiveSlot->elective_slot_id;
        DB::table('tbl_elective_slot')->where('elective_slot_id', $electiveSlotId)->update([
            'status' => 'active',
        ]);
    } else {
        $electiveSlotId = DB::table('tbl_elective_slot')->insertGetId([
            'program_id' => $programId,
            'year_level_id' => 4,
            'semester_id' => 1,
            'slot_name' => 'Elective 1',
            'status' => 'active',
        ]);
    }

    DB::table('tbl_elective_subject')->updateOrInsert(
        [
            'program_id' => $programId,
            'subject_id' => $subjectId('PSY 101'),
        ],
        [
            'department_id' => $programDepartmentId,
            'track_id' => null,
            'elective_slot_id' => $electiveSlotId,
            'description' => null,
        ],
    );

    $electiveTwoSlot = DB::table('tbl_elective_slot')
        ->where('program_id', $programId)
        ->where('year_level_id', 4)
        ->where('semester_id', 2)
        ->where('slot_name', 'Elective 2')
        ->first();

    if ($electiveTwoSlot) {
        $electiveTwoSlotId = (int) $electiveTwoSlot->elective_slot_id;
        DB::table('tbl_elective_slot')->where('elective_slot_id', $electiveTwoSlotId)->update([
            'status' => 'active',
        ]);
    } else {
        $electiveTwoSlotId = DB::table('tbl_elective_slot')->insertGetId([
            'program_id' => $programId,
            'year_level_id' => 4,
            'semester_id' => 2,
            'slot_name' => 'Elective 2',
            'status' => 'active',
        ]);
    }

    DB::table('tbl_elective_subject')->updateOrInsert(
        [
            'program_id' => $programId,
            'subject_id' => $subjectId('PSY 085'),
        ],
        [
            'department_id' => $programDepartmentId,
            'track_id' => null,
            'elective_slot_id' => $electiveTwoSlotId,
            'description' => null,
        ],
    );

    $curriculumRows = [
        ['GEN 001', 1, 1], ['GEN 004', 1, 1], ['ART 002', 1, 1], ['GEN 005', 1, 1],
        ['PSY 079', 1, 1], ['NST 021', 1, 1], ['PED 030', 1, 1],
        ['GEN 002', 1, 2], ['GEN 003', 1, 2], ['PSY 055', 1, 2], ['MAT 152', 1, 2],
        ['HIS 007', 1, 2], ['NST 022', 1, 2], ['PED 031', 1, 2],
        ['GEN 006', 2, 1], ['GEN 010', 2, 1], ['PSY 068', 2, 1], ['PSY 029', 2, 1],
        ['BIO 044', 2, 1], ['PED 032', 2, 1], ['SSP 005', 2, 1],
        ['PHI 002', 2, 2], ['SCX 010', 2, 2], ['HES 010', 2, 2], ['PSY 090', 2, 2],
        ['PSY 053', 2, 2], ['PSY 021', 2, 2], ['PED 033', 2, 2], ['SSP 006', 2, 2],
        ['CHE 005', 3, 1], ['PSY 089', 3, 1], ['PSY 087', 3, 1], ['PSY 088', 3, 1],
        ['SSP 007', 3, 1],
        ['BIO 024', 3, 2], ['PSY 084', 3, 2], ['PSY 037', 3, 2], ['PSY 034', 3, 2],
        ['SSP 008', 3, 2],
        ['PSY 039', 4, 1], ['SSP 009', 4, 1],
        ['PSY 043', 4, 2], ['PSY 096', 4, 2],
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

    $psy101Id = $subjectId('PSY 101');
    $electivePayload = [
        'curriculum_header_id' => $headerId,
        'program_id' => $programId,
        'subject_id' => null,
        'elective_slot_id' => $electiveSlotId,
        'year_level' => 4,
        'semester_id' => 1,
        'passing_grade' => 50,
        'subject_type' => 'elective subject',
        'requisite_id' => null,
    ];

    $existingElectiveRow = DB::table('curriculum')
        ->where('program_id', $programId)
        ->where('elective_slot_id', $electiveSlotId)
        ->where('year_level', 4)
        ->where('semester_id', 1)
        ->first();
    $existingPsy101Row = DB::table('curriculum')
        ->where('program_id', $programId)
        ->where('subject_id', $psy101Id)
        ->where('year_level', 4)
        ->where('semester_id', 1)
        ->first();

    if ($existingElectiveRow) {
        DB::table('curriculum')->where('curriculum_id', $existingElectiveRow->curriculum_id)->update($electivePayload);
        if ($existingPsy101Row && (int) $existingPsy101Row->curriculum_id !== (int) $existingElectiveRow->curriculum_id) {
            DB::table('curriculum')->where('curriculum_id', $existingPsy101Row->curriculum_id)->delete();
        }
        $updatedCurriculumRows++;
    } elseif ($existingPsy101Row) {
        DB::table('curriculum')->where('curriculum_id', $existingPsy101Row->curriculum_id)->update($electivePayload);
        $updatedCurriculumRows++;
    } else {
        DB::table('curriculum')->insert($electivePayload);
        $insertedCurriculumRows++;
    }

    $psy085Id = $subjectId('PSY 085');
    $electiveTwoPayload = [
        'curriculum_header_id' => $headerId,
        'program_id' => $programId,
        'subject_id' => null,
        'elective_slot_id' => $electiveTwoSlotId,
        'year_level' => 4,
        'semester_id' => 2,
        'passing_grade' => 50,
        'subject_type' => 'elective subject',
        'requisite_id' => null,
    ];

    $existingElectiveTwoRow = DB::table('curriculum')
        ->where('program_id', $programId)
        ->where('elective_slot_id', $electiveTwoSlotId)
        ->where('year_level', 4)
        ->where('semester_id', 2)
        ->first();
    $existingPsy085Row = DB::table('curriculum')
        ->where('program_id', $programId)
        ->where('subject_id', $psy085Id)
        ->where('year_level', 4)
        ->where('semester_id', 2)
        ->first();

    if ($existingElectiveTwoRow) {
        DB::table('curriculum')->where('curriculum_id', $existingElectiveTwoRow->curriculum_id)->update($electiveTwoPayload);
        if ($existingPsy085Row && (int) $existingPsy085Row->curriculum_id !== (int) $existingElectiveTwoRow->curriculum_id) {
            DB::table('curriculum')->where('curriculum_id', $existingPsy085Row->curriculum_id)->delete();
        }
        $updatedCurriculumRows++;
    } elseif ($existingPsy085Row) {
        DB::table('curriculum')->where('curriculum_id', $existingPsy085Row->curriculum_id)->update($electiveTwoPayload);
        $updatedCurriculumRows++;
    } else {
        DB::table('curriculum')->insert($electiveTwoPayload);
        $insertedCurriculumRows++;
    }

    $requisites = [
        'NST 022' => ['prerequisite' => ['NST 021']],
        'PED 031' => ['prerequisite' => ['PED 030']],
        'PED 032' => ['prerequisite' => ['PED 031']],
        'PSY 021' => ['prerequisite' => ['PSY 068']],
        'PED 033' => ['prerequisite' => ['PED 032']],
        'SSP 006' => ['prerequisite' => ['SSP 005']],
        'PSY 087' => ['prerequisite' => ['PSY 055']],
        'PSY 088' => ['prerequisite' => ['PSY 068', 'PSY 021']],
        'SSP 007' => ['prerequisite' => ['SSP 006']],
        'PSY 084' => ['prerequisite' => ['PSY 087']],
        'PSY 037' => ['prerequisite' => ['PSY 055', 'PSY 087']],
        'SSP 008' => ['prerequisite' => ['SSP 007']],
        'PSY 101' => ['prerequisite' => ['PSY 029', 'PSY 021', 'PSY 068']],
        'PSY 039' => ['prerequisite' => ['PSY 055', 'PSY 084', 'PSY 087']],
        'SSP 009' => ['prerequisite' => ['SSP 008']],
        'PSY 043' => ['prerequisite' => ['PSY 039']],
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
                        'rule_label' => null,
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

    $fourthYearSecondSemRuleSubjects = ['PSY 085', 'PSY 096'];
    $requiredThroughFourthYearFirstSem = DB::table('curriculum')
        ->where('program_id', $programId)
        ->where(function ($query): void {
            $query->where('year_level', '<', 4)
                ->orWhere(function ($subQuery): void {
                    $subQuery->where('year_level', 4)->where('semester_id', 1);
                });
        })
        ->whereNotNull('subject_id')
        ->pluck('subject_id')
        ->map(fn ($id) => (int) $id)
        ->unique()
        ->values();

    $electiveSubjectIdsThroughFourthYearFirstSem = DB::table('curriculum')
        ->join('tbl_elective_subject', 'curriculum.elective_slot_id', '=', 'tbl_elective_subject.elective_slot_id')
        ->where('curriculum.program_id', $programId)
        ->where(function ($query): void {
            $query->where('curriculum.year_level', '<', 4)
                ->orWhere(function ($subQuery): void {
                    $subQuery->where('curriculum.year_level', 4)->where('curriculum.semester_id', 1);
                });
        })
        ->whereNotNull('tbl_elective_subject.subject_id')
        ->pluck('tbl_elective_subject.subject_id')
        ->map(fn ($id) => (int) $id);

    $requiredThroughFourthYearFirstSem = $requiredThroughFourthYearFirstSem
        ->merge($electiveSubjectIdsThroughFourthYearFirstSem)
        ->unique()
        ->values();

    foreach ($fourthYearSecondSemRuleSubjects as $subjectCode) {
        $mainSubjectId = $subjectId($subjectCode);

        DB::table('tbl_prerequisite')
            ->where('subject_id', $mainSubjectId)
            ->where('requisite_type', 'prerequisite')
            ->whereNotIn('requisites_subject_id', $requiredThroughFourthYearFirstSem)
            ->delete();

        $firstRequisiteId = null;
        foreach ($requiredThroughFourthYearFirstSem as $requiredSubjectId) {
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
                    'rule_label' => 'all subjects from 1st year to 4th year 1st semester',
                ]);
                $insertedRequisites++;
            } else {
                $requisiteId = (int) $existing->requisites_id;
                DB::table('tbl_prerequisite')->where('requisites_id', $requisiteId)->update([
                    'rule_label' => 'all subjects from 1st year to 4th year 1st semester',
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
    'elective_slot_id' => $electiveSlotId,
    'elective_2_slot_id' => $electiveTwoSlotId,
    'inserted_subjects' => $insertedSubjects,
    'reused_or_updated_subjects' => $updatedSubjects,
    'inserted_curriculum_rows' => $insertedCurriculumRows,
    'updated_curriculum_rows' => $updatedCurriculumRows,
    'psychology_curriculum_rows' => DB::table('curriculum')->where('program_id', $programId)->count(),
    'inserted_requisites' => $insertedRequisites,
];

echo json_encode($summary, JSON_PRETTY_PRINT) . PHP_EOL;
