<?php
declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__ . '/vendor/autoload.php';

$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$program = DB::table('tbl_program')
    ->where('program_code', 'BSMT')
    ->orWhere('program_name', 'Bachelor of Science in Medical Technology')
    ->first();

if (! $program) {
    throw new RuntimeException('Bachelor of Science in Medical Technology program was not found.');
}

$electiveCodes = ['SCX 010', 'GEN 010', 'ENG 188'];
$updated = 0;

DB::transaction(function () use ($program, $electiveCodes, &$updated): void {
    $subjectIds = DB::table('tbl_subjects')
        ->whereIn('subject_code', $electiveCodes)
        ->pluck('subject_id', 'subject_code');

    foreach ($electiveCodes as $code) {
        $subjectId = $subjectIds[$code] ?? null;
        if (! $subjectId) {
            continue;
        }

        $updated += DB::table('curriculum')
            ->where('program_id', $program->program_id)
            ->where('subject_id', $subjectId)
            ->update([
                'subject_type' => 'elective subject',
            ]);
    }
});

echo json_encode([
    'program_id' => (int) $program->program_id,
    'program_code' => $program->program_code,
    'marked_elective_subjects' => $electiveCodes,
    'updated_curriculum_rows' => $updated,
], JSON_PRETTY_PRINT) . PHP_EOL;
