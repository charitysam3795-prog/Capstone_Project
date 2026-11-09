<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class AddRizalSubjectSeeder extends Seeder
{
    /**
     * Add HIS 007 - Life and Works of Rizal to 2nd Year 1st Semester curriculum
     */
    public function run(): void
    {
        // 1. Add the subject if it doesn't exist
        $subjectCode = 'HIS 007';
        $subjectName = 'Life and Works of Rizal';
        
        $existingSubject = DB::table('tbl_subjects')
            ->where('subject_code', $subjectCode)
            ->first();
        
        if (!$existingSubject) {
            $subjectId = DB::table('tbl_subjects')->insertGetId([
                'subject_code' => $subjectCode,
                'subject_name' => $subjectName,
                'number_of_units' => 3,
                'number_of_hrs' => 3,
            ]);
            $this->command->info("Subject {$subjectCode} - {$subjectName} created with ID: {$subjectId}");
        } else {
            $subjectId = $existingSubject->subject_id;
            $this->command->info("Subject {$subjectCode} already exists with ID: {$subjectId}");
        }

        // 2. Get program, year level, and semester IDs
        // Information Technology program (assuming program_id = 1 based on typical setup)
        $program = DB::table('tbl_program')
            ->where('program_name', 'like', '%Information Technology%')
            ->orWhere('program_code', 'like', '%IT%')
            ->first();
        
        if (!$program) {
            $program = DB::table('tbl_program')->first();
        }
        
        if (!$program) {
            $this->command->error('No program found. Please create a program first.');
            return;
        }
        
        // Get 2nd year level
        $yearLevel = DB::table('year_level')
            ->where('year_level', 'like', '%2nd%')
            ->orWhere('year_level', 'like', '%Second%')
            ->orWhere('year_level_id', 2)
            ->first();
        
        if (!$yearLevel) {
            $yearLevel = DB::table('year_level')->where('year_level_id', 2)->first();
        }
        
        if (!$yearLevel) {
            $this->command->error('2nd year level not found.');
            return;
        }
        
        // Get 1st semester
        $semester = DB::table('tbl_semester')
            ->where('semester_name', 'like', '%1st%')
            ->orWhere('semester_name', 'like', '%First%')
            ->orWhere('semester_id', 1)
            ->first();
        
        if (!$semester) {
            $semester = DB::table('tbl_semester')->where('semester_id', 1)->first();
        }
        
        if (!$semester) {
            $this->command->error('1st semester not found.');
            return;
        }
        
        // Get curriculum header for the program
        $curriculumHeader = DB::table('tbl_curriculum_header')
            ->where('program_id', $program->program_id)
            ->orderBy('curriculum_header_id', 'desc')
            ->first();
        
        // 3. Check if curriculum entry already exists
        $existingCurriculum = DB::table('curriculum')
            ->where('program_id', $program->program_id)
            ->where('subject_id', $subjectId)
            ->where('year_level', $yearLevel->year_level_id)
            ->where('semester_id', $semester->semester_id)
            ->first();
        
        if ($existingCurriculum) {
            $this->command->info("Curriculum entry already exists for {$subjectCode} in 2nd Year 1st Semester");
            return;
        }
        
        // 4. Add to curriculum
        DB::table('curriculum')->insert([
            'program_id' => $program->program_id,
            'subject_id' => $subjectId,
            'year_level' => $yearLevel->year_level_id,
            'semester_id' => $semester->semester_id,
            'curriculum_header_id' => $curriculumHeader?->curriculum_header_id,
            'passing_grade' => 50,
            'subject_type' => 'minor',
        ]);
        
        $this->command->info("Successfully added {$subjectCode} - {$subjectName} to 2nd Year 1st Semester!");
    }
}
