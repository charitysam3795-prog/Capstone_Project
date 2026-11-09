<?php

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$tables = [
    'tbl_evaluation',
    'tbl_evaluations',
    'evaluation',
    'tbl_academic_record',
    'tbl_academic_record_evaluation',
    'tbl_academic_record_evaluation_complete',
    'tbl_student_subject',
    'tbl_grades',
];

foreach ($tables as $t) {
    if (! Illuminate\Support\Facades\Schema::hasTable($t)) {
        echo "$t: no\n";
        continue;
    }
    echo "$t: ".implode(', ', Illuminate\Support\Facades\Schema::getColumnListing($t))."\n";
}
