<?php

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$hasSim = Schema::hasColumn('tbl_student_profile', 'is_simulation');
echo "has_is_simulation=".($hasSim ? '1' : '0')."\n";

if ($hasSim) {
    $sim = DB::table('tbl_student_profile')->where('is_simulation', 1)->count();
    echo "sim_profiles={$sim}\n";
    $simEvals = DB::table('tbl_evaluation as e')
        ->join('tbl_student_profile as s', 's.student_id', '=', 'e.student_id')
        ->where('s.is_simulation', 1)
        ->count();
    echo "sim_evals={$simEvals}\n";
}

$sample = DB::table('tbl_student_profile')
    ->where(function ($q) {
        $q->where('student_id_number', '900001')
            ->orWhere(function ($q2) {
                $q2->whereRaw('LOWER(first_name)=?', ['sample'])
                    ->whereRaw('LOWER(last_name)=?', ['student']);
            })
            ->orWhere('student_id_number', 'like', 'SIM-%')
            ->orWhere('student_id_number', 'like', '2026-%');
    })
    ->get(['student_id', 'student_id_number', 'first_name', 'last_name', 'is_simulation']);

foreach ($sample as $r) {
    echo "S|{$r->student_id}|{$r->student_id_number}|{$r->last_name}, {$r->first_name}|sim=".($r->is_simulation ?? '?')."\n";
}

$row = DB::table('tbl_student_profile')->where('student_id', 1)->first();
echo "id1=".json_encode($row)."\n";
