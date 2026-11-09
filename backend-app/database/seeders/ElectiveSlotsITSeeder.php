<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Ensures elective slots exist for IT program (program_id = 1) where the curriculum
 * uses elective clusters (e.g. IT Electives 1 in 3rd Year / 1st Sem) but tbl_elective_slot had no row.
 */
class ElectiveSlotsITSeeder extends Seeder
{
    public function run(): void
    {
        $slots = [
            [
                'program_id' => 1,
                'year_level_id' => 3,
                'semester_id' => 1,
                'slot_name' => 'IT Electives 1',
                'status' => 'active',
            ],
            [
                'program_id' => 1,
                'year_level_id' => 3,
                'semester_id' => 2,
                'slot_name' => 'IT Electives 2',
                'status' => 'active',
            ],
            [
                'program_id' => 1,
                'year_level_id' => 3,
                'semester_id' => 2,
                'slot_name' => 'IT Electives 3',
                'status' => 'active',
            ],
            [
                'program_id' => 1,
                'year_level_id' => 4,
                'semester_id' => 1,
                'slot_name' => 'IT Electives 4',
                'status' => 'active',
            ],
            [
                'program_id' => 1,
                'year_level_id' => 2,
                'semester_id' => 1,
                'slot_name' => 'IT Electives (2nd Year / 1st Sem)',
                'status' => 'active',
            ],
            [
                'program_id' => 1,
                'year_level_id' => 2,
                'semester_id' => 2,
                'slot_name' => 'IT Electives (2nd Year / 2nd Sem)',
                'status' => 'active',
            ],
        ];

        foreach ($slots as $row) {
            $exists = DB::table('tbl_elective_slot')
                ->where('program_id', $row['program_id'])
                ->where('year_level_id', $row['year_level_id'])
                ->where('semester_id', $row['semester_id'])
                ->where('slot_name', $row['slot_name'])
                ->exists();

            if (!$exists) {
                DB::table('tbl_elective_slot')->insert($row);
            }
        }

        $slotFourId = DB::table('tbl_elective_slot')
            ->where('program_id', 1)
            ->where('slot_name', 'IT Electives 4')
            ->value('elective_slot_id');

        if ($slotFourId) {
            $digitalTrackId = DB::table('tbl_track')
                ->where(function ($q) {
                    $q->where('track_code', 'DA')
                        ->orWhere('track_code', 'like', '%DIGI%')
                        ->orWhere('track_name', 'like', '%Digital%');
                })
                ->value('track_id');

            // For SysDev, Cyber, and BAM: Elective 4 can be any IT elective subject.
            // Digital Arts auto-assigns ITE388 (4th Digi elective).
            $slotFourSubjects = [
                ['code' => 'BAM285', 'track_id' => null],
                ['code' => 'BAM286', 'track_id' => null],
                ['code' => 'ITE382', 'track_id' => null],
                ['code' => 'ITE383', 'track_id' => null],
                ['code' => 'ITE384', 'track_id' => null],
                ['code' => 'ITE385', 'track_id' => null],
                ['code' => 'ITE387', 'track_id' => null],
                ['code' => 'ITE235', 'track_id' => null],
                ['code' => 'ITE386', 'track_id' => null],
                ['code' => 'ITE391', 'track_id' => null],
                ['code' => 'ITE392', 'track_id' => null],
                ['code' => 'ITE240', 'track_id' => null],
                ['code' => 'ITE388', 'track_id' => null],
                ['code' => 'ITE388', 'track_id' => $digitalTrackId ? (int) $digitalTrackId : null],
            ];

            foreach ($slotFourSubjects as $subjectRow) {
                $subjectId = DB::table('tbl_subjects')
                    ->whereRaw('REPLACE(UPPER(subject_code), " ", "") = ?', [$subjectRow['code']])
                    ->value('subject_id');

                if (! $subjectId) {
                    continue;
                }

                DB::table('tbl_elective_subject')->updateOrInsert(
                    [
                        'elective_slot_id' => $slotFourId,
                        'subject_id' => $subjectId,
                        'track_id' => $subjectRow['track_id'],
                    ],
                    [
                        'department_id' => DB::table('tbl_program')->where('program_id', 1)->value('department_id'),
                        'program_id' => 1,
                        'description' => null,
                    ]
                );
            }
        }
    }
}
