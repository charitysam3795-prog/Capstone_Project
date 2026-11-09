<?php

/**
 * Remove IT Electives 4 elective-subject rows that are not Digital Arts track.
 * Keep Digi / Digital Arts only.
 *
 * Usage: php scripts/maintenance/cleanup_elective4_non_digi.php
 */

require __DIR__ . '/../../vendor/autoload.php';
$app = require __DIR__ . '/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\ElectiveSlot;
use App\Models\ElectiveSubject;

function isDigiTrack(?object $track): bool
{
    if (! $track) {
        return false;
    }
    $code = strtoupper((string) ($track->track_code ?? ''));
    $name = strtolower((string) ($track->track_name ?? ''));

    return str_contains($code, 'DIGI') || str_contains($name, 'digital art');
}

function isElectiveFourSlot(string $slotName): bool
{
    $name = strtolower(trim($slotName));

    return (bool) preg_match('/electives?\s*4\b/', $name);
}

$slots = ElectiveSlot::query()->get();
$targetSlots = $slots->filter(function ($s) {
    $name = strtolower(trim((string) $s->slot_name));

    // Only IT Electives 4 — never other programs' "Professional Elective 4".
    return (bool) preg_match('/\bit\s*electives?\s*4\b/', $name);
});

if ($targetSlots->isEmpty()) {
    echo "No Elective 4 slots found.\n";
    exit(0);
}

$deleted = 0;
$kept = 0;

foreach ($targetSlots as $slot) {
    echo "Slot #{$slot->elective_slot_id}: {$slot->slot_name}\n";

    $rows = ElectiveSubject::with(['track', 'subject'])
        ->where('elective_slot_id', $slot->elective_slot_id)
        ->get();

    foreach ($rows as $es) {
        $code = $es->subject->subject_code ?? '?';
        $name = $es->subject->subject_name ?? '?';
        $trackLabel = trim(($es->track->track_code ?? '') . ' ' . ($es->track->track_name ?? '')) ?: '(no track)';

        // Free-choice Elective 4 subjects (no track) — keep for SysDev/Cyber/BAM pick list.
        if ($es->track_id === null || (int) $es->track_id === 0) {
            echo "  KEEP  #{$es->elective_subject_id} | {$trackLabel} | {$code} {$name}\n";
            $kept++;
            continue;
        }

        if (isDigiTrack($es->track)) {
            echo "  KEEP  #{$es->elective_subject_id} | {$trackLabel} | {$code} {$name}\n";
            $kept++;
            continue;
        }

        echo "  DELETE #{$es->elective_subject_id} | {$trackLabel} | {$code} {$name}\n";
        $es->delete();
        $deleted++;
    }
}

echo "\nDone. Deleted {$deleted}, kept {$kept} Digi row(s).\n";
