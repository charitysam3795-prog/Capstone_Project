<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Schema;
use App\Models\TblUser;
use App\Models\Role;
use App\Models\StudentProfile;
use App\Models\Program;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class StudentTestSeeder extends Seeder
{
    /**
     * Creates a test student (student@example.com) with a profile and program
     * so the evaluation flow can be tested.
     */
    public function run(): void
    {
        $studentRole = Role::firstOrCreate(
            ['role_name' => 'Student'],
            [
                'access_level' => 5,
                'description' => 'Student user',
            ]
        );

        $studentEmail = 'student@example.com';
        $studentPasswordHash = Hash::make('student123');
        $studentUser = TblUser::whereEmail($studentEmail)->first();

        if (!$studentUser) {
            $studentUser = TblUser::create([
                'email' => $studentEmail,
                'password' => 'student123',
                'role_id' => $studentRole->role_id,
                'status' => 'active',
            ]);
            DB::table('tbl_users')->where('user_id', $studentUser->user_id)->update([
                'Password' => $studentPasswordHash,
            ]);
        } else {
            DB::table('tbl_users')->where('user_id', $studentUser->user_id)->update([
                'Password' => $studentPasswordHash,
                'Email' => $studentEmail,
            ]);
        }

        $program = Program::first();
        if (!$program) {
            $this->command->warn('No program found. Create a program (e.g. Information Technology) so the student can be assigned.');
        }

        $studentIdNumber = '07413';
        $profile = StudentProfile::where('user_id', $studentUser->user_id)->first();

        $profileData = [
            'user_id' => $studentUser->user_id,
            'first_name' => 'Test',
            'last_name' => 'Student',
            'Current_Program' => $program ? $program->program_id : null,
        ];

        if (Schema::hasColumn('tbl_student_profile', 'student_id_number')) {
            $profileData['student_id_number'] = $studentIdNumber;
        }
        if (Schema::hasColumn('tbl_student_profile', 'student_number')) {
            $profileData['student_number'] = $studentIdNumber;
        }

        if ($profile) {
            $profile->update($profileData);
            if ($program && Schema::hasColumn('tbl_student_profile', 'Current_Program')) {
                DB::table('tbl_student_profile')->where('student_id', $profile->student_id)->update([
                    'Current_Program' => $program->program_id,
                ]);
            }
        } else {
            StudentProfile::create($profileData);
        }

        $this->command->info('Test student ready: student@example.com / student123');
        $this->command->info('Student ID number for evaluation: ' . $studentIdNumber);
    }
}
