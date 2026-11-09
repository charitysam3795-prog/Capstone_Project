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
        // Drop existing foreign keys for program_id if they exist
        // We'll keep program_id for backward compatibility but add curriculum_header_id
        // Note: We're not dropping program_id foreign key to maintain backward compatibility
        
        // Add curriculum_header_id column
        Schema::table('curriculum', function (Blueprint $table) {
            if (!Schema::hasColumn('curriculum', 'curriculum_header_id')) {
                $table->integer('curriculum_header_id')->nullable()->after('curriculum_id');
            }
        });
        
        // Fix semeste_id typo to semester_id if it exists
        if (Schema::hasColumn('curriculum', 'semeste_id') && !Schema::hasColumn('curriculum', 'semester_id')) {
            DB::statement('ALTER TABLE curriculum CHANGE semeste_id semester_id INT NOT NULL');
        }
        
        // Update year_level to reference year_level table's year_level attribute (but we'll keep it as FK to year_level_id)
        // The ERD shows year_level FK pointing to year_level attribute, but we'll use year_level_id for consistency
        
        // Add foreign key for curriculum_header_id
        Schema::table('curriculum', function (Blueprint $table) {
            if (Schema::hasColumn('curriculum', 'curriculum_header_id')) {
                $table->foreign('curriculum_header_id')->references('curriculum_header_id')->on('tbl_curriculum_header')->onDelete('cascade');
            }
        });
        
        // Remove program_id column after data migration (commented out for safety - uncomment after migrating data)
        // Schema::table('curriculum', function (Blueprint $table) {
        //     if (Schema::hasColumn('curriculum', 'program_id')) {
        //         $table->dropColumn('program_id');
        //     }
        // });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('curriculum', function (Blueprint $table) {
            // Drop curriculum_header_id foreign key
            try {
                $table->dropForeign(['curriculum_header_id']);
            } catch (\Exception $e) {
                // Foreign key might not exist
            }
            
            // Drop curriculum_header_id column
            if (Schema::hasColumn('curriculum', 'curriculum_header_id')) {
                $table->dropColumn('curriculum_header_id');
            }
            
            // Re-add program_id if it was dropped
            if (!Schema::hasColumn('curriculum', 'program_id')) {
                $table->integer('program_id')->after('curriculum_id');
                $table->foreign('program_id')->references('program_id')->on('tbl_program')->onDelete('cascade');
            }
        });
        
        // Revert semester_id back to semeste_id if needed
        if (Schema::hasColumn('curriculum', 'semester_id') && !Schema::hasColumn('curriculum', 'semeste_id')) {
            DB::statement('ALTER TABLE curriculum CHANGE semester_id semeste_id INT NOT NULL');
        }
    }
};

