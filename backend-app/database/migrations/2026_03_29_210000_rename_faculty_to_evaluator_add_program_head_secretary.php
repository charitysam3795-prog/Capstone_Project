<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $table = 'tbl_roles';

        if (DB::getSchemaBuilder()->hasTable($table)) {
            DB::table($table)
                ->where('role_name', 'Faculty')
                ->update([
                    'role_name' => 'Evaluator',
                    'description' => 'Evaluator — student curriculum evaluation',
                ]);

            $exists = DB::table($table)->where('role_name', 'Program Head')->exists();
            if (! $exists) {
                DB::table($table)->insert([
                    'role_name' => 'Program Head',
                    'access_level' => 7,
                    'description' => 'Program head — curriculum and academic oversight',
                ]);
            }

            $existsSec = DB::table($table)->where('role_name', 'Secretary')->exists();
            if (! $existsSec) {
                DB::table($table)->insert([
                    'role_name' => 'Secretary',
                    'access_level' => 4,
                    'description' => 'Secretary — records, lookup, and student data entry',
                ]);
            }
        }
    }

    public function down(): void
    {
        $table = 'tbl_roles';
        if (! DB::getSchemaBuilder()->hasTable($table)) {
            return;
        }

        DB::table($table)->where('role_name', 'Program Head')->delete();
        DB::table($table)->where('role_name', 'Secretary')->delete();

        DB::table($table)
            ->where('role_name', 'Evaluator')
            ->update([
                'role_name' => 'Faculty',
                'description' => 'Faculty',
            ]);
    }
};
