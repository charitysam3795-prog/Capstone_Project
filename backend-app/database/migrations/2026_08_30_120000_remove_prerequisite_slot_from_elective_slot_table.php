<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('tbl_elective_slot', 'prerequisite_slot_id')) {
            return;
        }

        Schema::table('tbl_elective_slot', function (Blueprint $table) {
            $table->dropForeign(['prerequisite_slot_id']);
            $table->dropColumn('prerequisite_slot_id');
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('tbl_elective_slot', 'prerequisite_slot_id')) {
            return;
        }

        Schema::table('tbl_elective_slot', function (Blueprint $table) {
            $table->integer('prerequisite_slot_id')->nullable()->after('status');

            $table->foreign('prerequisite_slot_id')
                ->references('elective_slot_id')
                ->on('tbl_elective_slot')
                ->nullOnDelete();
        });
    }
};
