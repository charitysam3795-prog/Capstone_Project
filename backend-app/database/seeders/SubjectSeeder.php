<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class SubjectSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $subjects = [
            ['subject_id' => 1, 'subject_code' => 'ITE 366', 'subject_name' => 'Introduction to Computing (Including IT Fundamentals)', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 2, 'subject_code' => 'ITE 260', 'subject_name' => 'Computer Programming 1', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 3, 'subject_code' => 'ITE 186', 'subject_name' => 'Computer Programming 2', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 4, 'subject_code' => 'ITE 399', 'subject_name' => 'Human Computer Interaction 1', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 5, 'subject_code' => 'GEN 002', 'subject_name' => 'UNDERSTAND THE SELF', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 6, 'subject_code' => 'MAT 152', 'subject_name' => 'Mathematics in the Modern World', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 7, 'subject_code' => 'GEN 001', 'subject_name' => 'Purposive Communication', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 8, 'subject_code' => 'GEN 006', 'subject_name' => 'Ethics', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 9, 'subject_code' => 'PED 030', 'subject_name' => 'Physical Activities Towards Health and Fitness(PATHFit1) Movement Competency Training', 'number_of_units' => 2, 'number_of_hrs' => 2],
            ['subject_id' => 10, 'subject_code' => 'NST 021', 'subject_name' => 'National Service Training Program 1', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 11, 'subject_code' => 'ITE 186', 'subject_name' => 'Computer Programming 2', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 12, 'subject_code' => 'ITE 399', 'subject_name' => 'Human Computer Interaction 1', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 13, 'subject_code' => 'ITE 048', 'subject_name' => 'Discrete Structures', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 14, 'subject_code' => 'GEN 008', 'subject_name' => 'Living in the IT Era', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 15, 'subject_code' => 'ART 002', 'subject_name' => 'Art Appreciation', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 16, 'subject_code' => 'GEN 005', 'subject_name' => 'The Contemporary World', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 17, 'subject_code' => 'PED 031', 'subject_name' => 'Physical Activities Towards Health and Fitness 2 (PATHFit 2) Exercise-based Fitness Activity', 'number_of_units' => 2, 'number_of_hrs' => 2],
            ['subject_id' => 18, 'subject_code' => 'NST 022', 'subject_name' => 'National Service Training Program 2', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 19, 'subject_code' => 'ITE 298', 'subject_name' => 'Information Management (Including Fundamentals of Database Systems)', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 20, 'subject_code' => 'ITE 300', 'subject_name' => 'Object-Oriented Programming', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 21, 'subject_code' => 'ITE 292', 'subject_name' => 'Networking 1', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 22, 'subject_code' => 'ITE 031', 'subject_name' => 'Data Structure and Algorithms', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 23, 'subject_code' => 'ITE 083', 'subject_name' => 'IT Project Management', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 24, 'subject_code' => 'GEN 003', 'subject_name' => 'Science, Technology, and Society', 'number_of_units' => 3, 'number_of_hrs' => 3],
            ['subject_id' => 25, 'subject_code' => 'PED 032', 'subject_name' => 'Physical Activities Towards Health and Fitness (PATHFit 3) Individual and Dual Sports', 'number_of_units' => 2, 'number_of_hrs' => 2],
            ['subject_id' => 26, 'subject_code' => 'SSP 005', 'subject_name' => 'Student Success Program 1', 'number_of_units' => 1, 'number_of_hrs' => 1],
        ];

        DB::table('tbl_subjects')->insert($subjects);
    }
}
