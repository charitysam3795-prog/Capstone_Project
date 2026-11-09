<?php

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$rows = Illuminate\Support\Facades\DB::table('tbl_evaluation as e')
    ->join('tbl_student_profile as s', 's.student_id', '=', 'e.student_id')
    ->leftJoin('tbl_users as u', 'u.user_id', '=', 's.user_id')
    ->select(
        's.student_id',
        's.student_id_number',
        's.first_name',
        's.last_name',
        'u.Email as user_email',
        Illuminate\Support\Facades\DB::raw('count(*) as n')
    )
    ->groupBy('s.student_id', 's.student_id_number', 's.first_name', 's.last_name', 'u.Email')
    ->orderByDesc('n')
    ->get();

foreach ($rows as $r) {
    echo "{$r->student_id}|{$r->student_id_number}|{$r->last_name}, {$r->first_name}|{$r->user_email}|{$r->n}\n";
}
echo "TOTAL_STUDENTS=".count($rows)."\n";
echo "TOTAL_EVALS=".Illuminate\Support\Facades\DB::table('tbl_evaluation')->count()."\n";
