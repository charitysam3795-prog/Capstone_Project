<?php

/**
 * Restore non-IT Professional Elective 4 rows accidentally removed by cleanup.
 */

require __DIR__ . '/../../vendor/autoload.php';
$app = require __DIR__ . '/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\ElectiveSlot;
use App\Models\ElectiveSubject;
use App\Models\Subject;

$restore = [
    28 => ['ACC 177'],
    32 => ['MKT ELEC 4'],
    44 => ['HRM 032'],
    59 => ['TOU 058'],
];

foreach ($restore as $slotId => $codes) {
    $slot = ElectiveSlot::with('program')->find($slotId);
    if (! $slot) {
        echo "Missing slot {$slotId}\n";
        continue;
    }

    foreach ($codes as $code) {
        $normalized = strtoupper(preg_replace('/\s+/', '', $code));
        $subject = Subject::query()
            ->whereRaw("UPPER(REPLACE(subject_code, ' ', '')) = ?", [$normalized])
            ->orWhere('subject_code', 'like', $code.'%')
            ->first();

        if (! $subject) {
            echo "Missing subject {$code}\n";
            continue;
        }

        $exists = ElectiveSubject::query()
            ->where('elective_slot_id', $slotId)
            ->where('subject_id', $subject->subject_id)
            ->exists();

        if ($exists) {
            echo "Already exists slot {$slotId} {$subject->subject_code}\n";
            continue;
        }

        $es = ElectiveSubject::create([
            'department_id' => $slot->program->department_id ?? null,
            'program_id' => $slot->program_id,
            'track_id' => null,
            'elective_slot_id' => $slotId,
            'subject_id' => $subject->subject_id,
            'description' => null,
        ]);

        echo "Restored #{$es->elective_subject_id} slot={$slotId} {$slot->slot_name} => {$subject->subject_code}\n";
    }
}

echo "Done.\n";
