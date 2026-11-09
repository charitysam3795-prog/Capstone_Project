<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_student_profile')) {
            return;
        }

        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (! Schema::hasColumn('tbl_student_profile', 'is_simulation')) {
                $table->boolean('is_simulation')->default(false)->after('major_standing_override_keys');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('tbl_student_profile')) {
            return;
        }

        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_student_profile', 'is_simulation')) {
                $table->dropColumn('is_simulation');
            }
        });
    }
};
