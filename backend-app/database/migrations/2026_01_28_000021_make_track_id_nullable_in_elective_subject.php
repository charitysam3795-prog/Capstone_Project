<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('tbl_elective_subject', function (Blueprint $table) {
            // Make track_id nullable if it's not already
            if (Schema::hasColumn('tbl_elective_subject', 'track_id')) {
                $table->integer('track_id')->nullable()->change();
            }
        });
    }

    public function down()
    {
        Schema::table('tbl_elective_subject', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_elective_subject', 'track_id')) {
                $table->integer('track_id')->nullable(false)->change();
            }
        });
    }
};

