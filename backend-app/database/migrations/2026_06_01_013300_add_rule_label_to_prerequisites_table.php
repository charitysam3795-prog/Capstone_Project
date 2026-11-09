<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tbl_prerequisite', function (Blueprint $table) {
            if (! Schema::hasColumn('tbl_prerequisite', 'rule_label')) {
                $table->string('rule_label', 100)->nullable()->after('requisites_subject_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tbl_prerequisite', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_prerequisite', 'rule_label')) {
                $table->dropColumn('rule_label');
            }
        });
    }
};
