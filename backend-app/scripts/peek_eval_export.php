<?php

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$e = App\Models\Evaluation::with([
    'student.program.department',
    'student.yearLevel',
    'subject',
    'academicYear',
    'semester',
    'section.faculty',
    'modality',
    'evaluatedBy.facultyProfile',
    'evaluatedBy.deanProfile',
    'evaluatedBy.programHeadProfile',
    'evaluatedBy.secretaryProfile',
    'gradeComponents',
])->first();

if (! $e) {
    echo "NO_EVALS\n";
    exit(0);
}

$c = app(App\Http\Controllers\Administration\DataExportController::class);
$m = new ReflectionMethod($c, 'gradeDeliberationRow');
$m->setAccessible(true);
$row = $m->invoke($c, $e);

echo 'cols='.count($row)."\n";
echo implode(' | ', array_map(static fn ($v) => (string) $v, $row))."\n";
