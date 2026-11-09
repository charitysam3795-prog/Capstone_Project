<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('tbl_section')) {
            Schema::create('tbl_section', function (Blueprint $table) {
                $table->id('section_id');
                $table->string('section_name', 100);
                $table->unsignedBigInteger('program_id')->nullable();
                $table->unsignedBigInteger('year_level_id')->nullable();
                $table->unsignedBigInteger('semester_id')->nullable();
                $table->unsignedBigInteger('academic_year_id')->nullable();
                $table->unsignedBigInteger('faculty_id')->nullable();
            });
        }

        if (!Schema::hasTable('tbl_modality')) {
            Schema::create('tbl_modality', function (Blueprint $table) {
                $table->id('modality_id');
                $table->string('modality_name', 100);
            });
        }

        if (Schema::hasTable('tbl_evaluation')) {
            Schema::table('tbl_evaluation', function (Blueprint $table) {
                if (!Schema::hasColumn('tbl_evaluation', 'section_id')) {
                    $table->unsignedBigInteger('section_id')->nullable()->after('semester_id');
                }
                if (!Schema::hasColumn('tbl_evaluation', 'evaluated_by')) {
                    $table->unsignedBigInteger('evaluated_by')->nullable()->after('evaluation_status');
                }
                if (!Schema::hasColumn('tbl_evaluation', 'modality_id')) {
                    $table->unsignedBigInteger('modality_id')->nullable()->after('evaluated_by');
                }
                if (!Schema::hasColumn('tbl_evaluation', 'evaluation_date')) {
                    $table->date('evaluation_date')->nullable()->after('modality_id');
                }
            });

            if (Schema::hasColumn('tbl_evaluation', 'evaluation_date') && Schema::hasColumn('tbl_evaluation', 'enrolled_date')) {
                DB::statement("UPDATE tbl_evaluation SET evaluation_date = enrolled_date WHERE evaluation_date IS NULL");
            }
        }

        if (!Schema::hasTable('tbl_grade_components')) {
            Schema::create('tbl_grade_components', function (Blueprint $table) {
                $table->id('grade_component_id');
                $table->unsignedBigInteger('evaluation_id');
                $table->string('component_name', 100);
                $table->string('grade', 20)->nullable();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('tbl_grade_components')) {
            Schema::drop('tbl_grade_components');
        }
        if (Schema::hasTable('tbl_modality')) {
            Schema::drop('tbl_modality');
        }
        if (Schema::hasTable('tbl_section')) {
            Schema::drop('tbl_section');
        }

        if (Schema::hasTable('tbl_evaluation')) {
            Schema::table('tbl_evaluation', function (Blueprint $table) {
                if (Schema::hasColumn('tbl_evaluation', 'evaluation_date')) {
                    $table->dropColumn('evaluation_date');
                }
                if (Schema::hasColumn('tbl_evaluation', 'modality_id')) {
                    $table->dropColumn('modality_id');
                }
                if (Schema::hasColumn('tbl_evaluation', 'evaluated_by')) {
                    $table->dropColumn('evaluated_by');
                }
                if (Schema::hasColumn('tbl_evaluation', 'section_id')) {
                    $table->dropColumn('section_id');
                }
            });
        }
    }
};
