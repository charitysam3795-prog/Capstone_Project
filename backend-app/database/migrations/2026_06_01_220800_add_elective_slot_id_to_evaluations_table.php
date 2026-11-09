<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('tbl_evaluation', 'elective_slot_id')) {
            Schema::table('tbl_evaluation', function (Blueprint $table) {
                $table->integer('elective_slot_id')->nullable()->after('subject_id');

                $table->foreign('elective_slot_id')
                    ->references('elective_slot_id')
                    ->on('tbl_elective_slot')
                    ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('tbl_evaluation', 'elective_slot_id')) {
            return;
        }

        Schema::table('tbl_evaluation', function (Blueprint $table) {
            $table->dropForeign(['elective_slot_id']);
            $table->dropColumn('elective_slot_id');
        });
    }
};
