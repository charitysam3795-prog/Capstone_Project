<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('curriculum', function (Blueprint $table) {
            if (!Schema::hasColumn('curriculum', 'elective_slot_id')) {
                $table->integer('elective_slot_id')->nullable()->after('subject_id');
                $table->foreign('elective_slot_id')->references('elective_slot_id')->on('tbl_elective_slot')->onDelete('set null');
            }
        });
    }

    public function down()
    {
        Schema::table('curriculum', function (Blueprint $table) {
            if (Schema::hasColumn('curriculum', 'elective_slot_id')) {
                $table->dropForeign(['elective_slot_id']);
                $table->dropColumn('elective_slot_id');
            }
        });
    }
};

