<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('year_level')) {
            return;
        }

        $labels = [
            6 => '6th Year',
            7 => '7th Year',
            8 => '8th Year',
            9 => '9th Year',
            10 => '10th Year',
        ];

        foreach ($labels as $id => $label) {
            $exists = DB::table('year_level')->where('year_level_id', $id)->exists();
            if ($exists) {
                continue;
            }
            DB::table('year_level')->insert([
                'year_level_id' => $id,
                'year_level' => $label,
            ]);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('year_level')) {
            return;
        }

        DB::table('year_level')->whereIn('year_level_id', [6, 7, 8, 9, 10])->delete();
    }
};
