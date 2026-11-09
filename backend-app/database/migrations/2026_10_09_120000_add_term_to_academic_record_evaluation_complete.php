<?php

use App\Models\AcademicYear;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tag each "academic record evaluated" mark with the school year + semester it was done in,
 * so analytics can report evaluated / unevaluated per term. Existing marks get the term that
 * is active when this migration runs.
 */
return new class extends Migration
{
    public function up(): void
    {
        $table = 'tbl_academic_record_evaluation_complete';
        if (! Schema::hasTable($table)) {
            return;
        }

        Schema::table($table, function (Blueprint $t) use ($table) {
            if (! Schema::hasColumn($table, 'academic_year_id')) {
                $t->unsignedBigInteger('academic_year_id')->nullable()->after('notes');
            }
            if (! Schema::hasColumn($table, 'semester_id')) {
                $t->unsignedBigInteger('semester_id')->nullable()->after('academic_year_id');
            }
        });

        $ayId = $this->activeAcademicYearId();
        $semId = DB::table('tbl_semester')->where('status', 'active')->orderBy('semester_id')->value('semester_id');
        if ($ayId) {
            DB::table($table)->whereNull('academic_year_id')->update(['academic_year_id' => $ayId]);
        }
        if ($semId) {
            DB::table($table)->whereNull('semester_id')->update(['semester_id' => (int) $semId]);
        }
    }

    public function down(): void
    {
        $table = 'tbl_academic_record_evaluation_complete';
        if (! Schema::hasTable($table)) {
            return;
        }
        Schema::table($table, function (Blueprint $t) use ($table) {
            if (Schema::hasColumn($table, 'semester_id')) {
                $t->dropColumn('semester_id');
            }
            if (Schema::hasColumn($table, 'academic_year_id')) {
                $t->dropColumn('academic_year_id');
            }
        });
    }

    private function activeAcademicYearId(): ?int
    {
        if (! Schema::hasTable('tbl_academic_year')) {
            return null;
        }
        $id = AcademicYear::currentId();

        return $id > 0 ? $id : null;
    }
};
