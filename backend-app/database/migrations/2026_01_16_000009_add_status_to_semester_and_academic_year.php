<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('tbl_semester', function (Blueprint $table) {
            if (!Schema::hasColumn('tbl_semester', 'status')) {
                $table->string('status', 50)->nullable()->after('semester_name');
            }
        });
        
        Schema::table('tbl_academic_year', function (Blueprint $table) {
            if (!Schema::hasColumn('tbl_academic_year', 'status')) {
                $table->string('status', 50)->nullable()->after('academic_year_name');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tbl_semester', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_semester', 'status')) {
                $table->dropColumn('status');
            }
        });
        
        Schema::table('tbl_academic_year', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_academic_year', 'status')) {
                $table->dropColumn('status');
            }
        });
    }
};

