<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Bind each curriculum header to a Lookup Academic Year so subject sets are
 * determined by Curriculum + Academic Year together.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_curriculum_header')) {
            return;
        }

        if (! Schema::hasColumn('tbl_curriculum_header', 'academic_year_id')) {
            Schema::table('tbl_curriculum_header', function (Blueprint $table) {
                $table->unsignedBigInteger('academic_year_id')->nullable()->after('Effective_Year');
            });
        }

        if (! Schema::hasTable('tbl_academic_year')) {
            return;
        }

        $years = DB::table('tbl_academic_year')->get(['academic_year_id', 'academic_year_name']);
        $headers = DB::table('tbl_curriculum_header')
            ->whereNull('academic_year_id')
            ->get(['curriculum_header_id', 'Effective_Year']);

        foreach ($headers as $header) {
            $start = (int) $header->Effective_Year;
            if ($start <= 0) {
                continue;
            }
            $label = sprintf('%d-%d', $start, $start + 1);
            $match = $years->first(function ($ay) use ($label, $start) {
                $name = trim((string) $ay->academic_year_name);
                if ($name === $label) {
                    return true;
                }
                if (stripos($name, (string) $start) !== false && stripos($name, (string) ($start + 1)) !== false) {
                    return true;
                }

                return false;
            });
            if ($match) {
                DB::table('tbl_curriculum_header')
                    ->where('curriculum_header_id', $header->curriculum_header_id)
                    ->update(['academic_year_id' => $match->academic_year_id]);
            }
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('tbl_curriculum_header')) {
            return;
        }
        if (! Schema::hasColumn('tbl_curriculum_header', 'academic_year_id')) {
            return;
        }

        Schema::table('tbl_curriculum_header', function (Blueprint $table) {
            $table->dropColumn('academic_year_id');
        });
    }
};
