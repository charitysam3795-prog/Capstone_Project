<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Corequisite;
use App\Models\Subject;

class CorequisiteSeeder extends Seeder
{
    public function run(): void
    {
        // Get some sample subjects to create corequisites for
        $subjects = Subject::all();
        
        if ($subjects->count() < 2) {
            $this->command->info('Not enough subjects to create corequisites');
            return;
        }

        // Create some sample corequisites
        $corequisites = [
            [
                'subject_id' => 1,
                'coreq_subject_id' => 2,
            ],
            [
                'subject_id' => 2,
                'coreq_subject_id' => 1,
            ],
            [
                'subject_id' => 3,
                'coreq_subject_id' => 4,
            ],
            [
                'subject_id' => 4,
                'coreq_subject_id' => 3,
            ],
        ];

        foreach ($corequisites as $corequisite) {
            // Only create if both subjects exist
            $subject = Subject::find($corequisite['subject_id']);
            $coreqSubject = Subject::find($corequisite['coreq_subject_id']);
            
            if ($subject && $coreqSubject) {
                Corequisite::firstOrCreate($corequisite);
                $this->command->info("Created corequisite: {$subject->subject_code} <-> {$coreqSubject->subject_code}");
            }
        }
    }
}
