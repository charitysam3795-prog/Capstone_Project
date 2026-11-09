<?php

namespace Database\Seeders;

use App\Models\CreditEvaluation;
use App\Models\CreditEvaluationDetail;
use App\Models\OtherSchoolSubject;
use App\Models\School;
use App\Models\StudentProfile;
use App\Models\Subject;
use App\Models\SubjectEquivalence;
use App\Models\TblUser;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Demo data for transfer / subject crediting (schools, external subjects, equivalences, optional sample request).
 *
 * Use with test student from StudentTestSeeder:
 *   student@example.com / student123 — ID number 07413
 * Admin (create or approve flows): admin@example.com / admin123
 */
class CreditEvaluationDemoSeeder extends Seeder
{
    public function run(): void
    {
        $school = School::firstOrCreate(
            ['school_name' => 'Demo State University (Transfer Test)'],
            [
                'school_program' => 'BS Information Technology (aligned for demo)',
                'school_curriculum' => 'CHED-aligned general education (demo)',
            ]
        );

        $other = OtherSchoolSubject::firstOrCreate(
            [
                'school_id' => $school->school_id,
                'subject_code' => 'OSTU-GEN005',
            ],
            [
                'subject_name' => 'The Contemporary World (taken at previous school)',
                'units' => 3,
                'hours' => 3,
                'description' => 'Demo external course for credit evaluation testing',
            ]
        );

        $local = Subject::where('subject_code', 'GEN 005')->first()
            ?? Subject::orderBy('subject_id')->first();

        if (!$local) {
            $this->command->warn('No subjects in tbl_subjects — run SubjectSeeder or add subjects first.');

            return;
        }

        SubjectEquivalence::firstOrCreate(
            [
                'other_school_subject' => $other->other_subject_id,
                'subject_id' => $local->subject_id,
            ],
            [
                'credited_units' => 3,
                'credit_basis' => 'Curriculum match',
                'status' => 'active',
                'remarks' => 'Seeded for capstone credit evaluation demo',
            ]
        );

        $studentUser = TblUser::whereEmail('student@example.com')->first();
        $adminUser = TblUser::whereEmail('admin@example.com')->first();
        $profile = $studentUser
            ? StudentProfile::where('user_id', $studentUser->user_id)->first()
            : null;

        if (!$profile || !$adminUser) {
            $this->command->warn('Skipping sample credit request — need student@example.com profile and admin@example.com user.');
            $this->printSummary($school, $other, $local, null);

            return;
        }

        $existingPending = CreditEvaluation::where('student_id', $profile->student_id)
            ->where('school_id', $school->school_id)
            ->whereRaw('LOWER(TRIM(status)) = ?', ['pending'])
            ->first();

        if (!$existingPending) {
            DB::transaction(function () use ($profile, $school, $adminUser, $other, $local) {
                $eval = CreditEvaluation::create([
                    'student_id' => $profile->student_id,
                    'school_id' => $school->school_id,
                    'credit_type' => 'Transfer',
                    'evaluated_by' => $adminUser->user_id,
                    'evaluation_date' => now()->toDateString(),
                    'status' => 'pending',
                    'remarks' => 'Seeded pending request — approve as Dean/Admin to test student curriculum credit.',
                    'is_active' => true,
                ]);

                CreditEvaluationDetail::create([
                    'credit_eval_id' => $eval->credit_eval_id,
                    'student_id' => $profile->student_id,
                    'other_subject_id' => $other->other_subject_id,
                    'subject_id' => $local->subject_id,
                    'credited_units' => 3,
                    'credit_basis' => 'Equivalence table',
                    'remarks' => 'Demo detail row',
                ]);
            });
        }

        $this->printSummary($school, $other, $local, $profile);
    }

    private function printSummary(School $school, OtherSchoolSubject $other, Subject $local, ?StudentProfile $profile): void
    {
        $this->command->info('--- Credit evaluation demo data ---');
        $this->command->info("School: {$school->school_name} (school_id={$school->school_id})");
        $this->command->info("External subject: {$other->subject_code} — {$other->subject_name} (other_subject_id={$other->other_subject_id})");
        $this->command->info("Local equivalent: {$local->subject_code} — {$local->subject_name} (subject_id={$local->subject_id})");
        if ($profile) {
            $this->command->info("Test student: student@example.com / student123 | student_id={$profile->student_id} | ID number: ".($profile->student_id_number ?? $profile->student_number ?? 'n/a'));
        }
        $this->command->info('Admin: admin@example.com / admin123');
    }
}
