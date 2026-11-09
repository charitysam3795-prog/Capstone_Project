<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('tbl_elective_slot', 'prerequisite_slot_id')) {
            Schema::table('tbl_elective_slot', function (Blueprint $table) {
                $table->integer('prerequisite_slot_id')->nullable()->after('status');

                $table->foreign('prerequisite_slot_id')
                    ->references('elective_slot_id')
                    ->on('tbl_elective_slot')
                    ->nullOnDelete();
            });
        }

        $itElectivesOneIds = DB::table('tbl_elective_slot')
            ->where('slot_name', 'IT Electives 1')
            ->pluck('elective_slot_id', 'program_id');

        foreach ($itElectivesOneIds as $programId => $prerequisiteSlotId) {
            DB::table('tbl_elective_slot')
                ->where('program_id', $programId)
                ->whereIn('slot_name', ['IT Electives 2', 'IT Electives 3'])
                ->update(['prerequisite_slot_id' => $prerequisiteSlotId]);
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('tbl_elective_slot', 'prerequisite_slot_id')) {
            return;
        }

        Schema::table('tbl_elective_slot', function (Blueprint $table) {
            $table->dropForeign(['prerequisite_slot_id']);
            $table->dropColumn('prerequisite_slot_id');
        });
    }
};
