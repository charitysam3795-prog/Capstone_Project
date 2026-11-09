<?php
declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__ . '/vendor/autoload.php';

$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$slotDefinitions = [
    'BSMT' => [
        1 => ['year' => 2, 'semester' => 1],
        2 => ['year' => 2, 'semester' => 3],
        3 => ['year' => 3, 'semester' => 3],
    ],
    'BSN' => [
        1 => ['year' => 2, 'semester' => 2],
        2 => ['year' => 3, 'semester' => 2],
        3 => ['year' => 2, 'semester' => 3],
    ],
    'BSPHARM' => [
        1 => ['year' => 2, 'semester' => 1],
        2 => ['year' => 2, 'semester' => 2],
        3 => ['year' => 2, 'semester' => 2],
    ],
    'BSPSY' => [
        1 => ['year' => 2, 'semester' => 1],
        2 => ['year' => 2, 'semester' => 2],
        3 => ['year' => 2, 'semester' => 2],
    ],
];

$programCodes = array_keys($slotDefinitions);

$programs = DB::table('tbl_program')
    ->whereIn('program_code', $programCodes)
    ->get()
    ->keyBy('program_code');

$renamed = [];
$missing = [];

DB::transaction(function () use ($slotDefinitions, $programs, &$renamed, &$missing): void {
    foreach ($slotDefinitions as $programCode => $slotsByNumber) {
        $program = $programs[$programCode] ?? null;
        if (! $program) {
            $missing[] = "{$programCode}: program not found";
            continue;
        }

        foreach ($slotsByNumber as $n => $term) {
            $oldNames = [
                "CAHS Electives {$n}",
                "GEC Elective {$n}",
                "{$programCode} Elective {$n}",
                "{$programCode} GEC Elective {$n}",
            ];
            $newName = "{$programCode} GEC Elective {$n}";

            $slot = DB::table('tbl_elective_slot')
                ->where('program_id', $program->program_id)
                ->where('year_level_id', $term['year'])
                ->where('semester_id', $term['semester'])
                ->whereIn('slot_name', $oldNames)
                ->orderByRaw("CASE WHEN slot_name = ? THEN 0 ELSE 1 END", [$newName])
                ->first();

            if (! $slot) {
                $missing[] = "{$programCode} Elective {$n}: slot not found";
                continue;
            }

            if ($slot->slot_name === $newName) {
                continue;
            }

            DB::table('tbl_elective_slot')
                ->where('elective_slot_id', $slot->elective_slot_id)
                ->update([
                    'slot_name' => $newName,
                    'status' => 'active',
                ]);

            $renamed[] = [
                'elective_slot_id' => (int) $slot->elective_slot_id,
                'program_code' => $programCode,
                'old_name' => $slot->slot_name,
                'new_name' => $newName,
            ];
        }
    }
});

echo json_encode([
    'renamed_count' => count($renamed),
    'renamed' => $renamed,
    'missing' => $missing,
], JSON_PRETTY_PRINT) . PHP_EOL;
