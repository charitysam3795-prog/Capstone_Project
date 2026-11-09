<?php

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Http\Controllers\Administration\DataExportController;
use App\Models\Evaluation;
use Illuminate\Database\Eloquent\Builder;
use ReflectionMethod;

$c = app(DataExportController::class);
$m = new ReflectionMethod($c, 'excludeSampleStudentProfiles');
$m->setAccessible(true);

$query = Evaluation::query()->whereHas('student', function (Builder $q) use ($m, $c) {
    $m->invoke($c, $q);
});

$first = (clone $query)->with('student')->orderBy('student_id')->first();
$count = (clone $query)->count();
$sampleStill = (clone $query)->whereHas('student', function (Builder $q) {
    $q->whereRaw('LOWER(first_name)=?', ['sample'])->whereRaw('LOWER(last_name)=?', ['student']);
})->count();

echo "export_evals={$count}\n";
echo "sample_still={$sampleStill}\n";
if ($first) {
    $p = $first->student;
    echo "first={$p->student_id}|{$p->student_id_number}|{$p->last_name}, {$p->first_name}\n";
}
