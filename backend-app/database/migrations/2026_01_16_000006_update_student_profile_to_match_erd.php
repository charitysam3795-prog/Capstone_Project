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
        // First, drop existing foreign key if it exists
        try {
            Schema::table('tbl_student_profile', function (Blueprint $table) {
                $table->dropForeign(['current_program']);
            });
        } catch (\Exception $e) {
            // Foreign key might not exist or have different name
            try {
                DB::statement('ALTER TABLE tbl_student_profile DROP FOREIGN KEY fk_student_program');
            } catch (\Exception $e2) {
                // Ignore if it doesn't exist
            }
        }
        
        // Add new columns and modify existing ones
        Schema::table('tbl_student_profile', function (Blueprint $table) {
            // Add first_name, middle_name, last_name if they don't exist
            if (!Schema::hasColumn('tbl_student_profile', 'first_name')) {
                $table->string('first_name', 100)->nullable()->after('student_number');
            }
            if (!Schema::hasColumn('tbl_student_profile', 'middle_name')) {
                $table->string('middle_name', 100)->nullable()->after('first_name');
            }
            if (!Schema::hasColumn('tbl_student_profile', 'last_name')) {
                $table->string('last_name', 100)->nullable()->after('middle_name');
            }
            
            // Add address if missing
            if (!Schema::hasColumn('tbl_student_profile', 'address')) {
                $table->string('address', 255)->nullable()->after('last_name');
            }
            
            // Add year_level_id if missing
            if (!Schema::hasColumn('tbl_student_profile', 'year_level_id')) {
                $table->integer('year_level_id')->nullable()->after('academic_status');
            }
            
            // Add track_id if missing
            if (!Schema::hasColumn('tbl_student_profile', 'track_id')) {
                $table->integer('track_id')->nullable()->after('year_level_id');
            }
        });
        
        // Rename current_program to Current_Program using raw SQL
        if (Schema::hasColumn('tbl_student_profile', 'current_program') && !Schema::hasColumn('tbl_student_profile', 'Current_Program')) {
            DB::statement('ALTER TABLE tbl_student_profile CHANGE current_program Current_Program INT NULL');
        }
        
        // Drop full_name column if it exists (after data migration would be done separately)
        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_student_profile', 'full_name')) {
                $table->dropColumn('full_name');
            }
        });
        
        // Add foreign keys
        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (Schema::hasColumn('tbl_student_profile', 'year_level_id')) {
                $table->foreign('year_level_id')->references('year_level_id')->on('year_level')->onDelete('set null');
            }
            
            if (Schema::hasColumn('tbl_student_profile', 'track_id')) {
                $table->foreign('track_id')->references('track_id')->on('tbl_track')->onDelete('set null');
            }
            
            if (Schema::hasColumn('tbl_student_profile', 'Current_Program')) {
                $table->foreign('Current_Program')->references('program_id')->on('tbl_program')->onDelete('set null');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tbl_student_profile', function (Blueprint $table) {
            // Drop foreign keys
            $foreignKeys = ['year_level_id', 'track_id', 'Current_Program'];
            foreach ($foreignKeys as $column) {
                if (Schema::hasColumn('tbl_student_profile', $column)) {
                    try {
                        $table->dropForeign([$column]);
                    } catch (\Exception $e) {
                        // Foreign key might not exist
                    }
                }
            }
            
            // Drop columns
            $columnsToDrop = ['first_name', 'middle_name', 'last_name', 'address', 'year_level_id', 'track_id'];
            foreach ($columnsToDrop as $column) {
                if (Schema::hasColumn('tbl_student_profile', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
        
        // Rename Current_Program back to current_program
        if (Schema::hasColumn('tbl_student_profile', 'Current_Program')) {
            DB::statement('ALTER TABLE tbl_student_profile CHANGE Current_Program current_program INT NULL');
        }
        
        // Re-add full_name
        Schema::table('tbl_student_profile', function (Blueprint $table) {
            if (!Schema::hasColumn('tbl_student_profile', 'full_name')) {
                $table->string('full_name', 150)->nullable()->after('student_number');
            }
        });
    }
};

