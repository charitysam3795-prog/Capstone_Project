<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('tbl_academic_record_evaluation_complete')) {
            return;
        }

        Schema::create('tbl_academic_record_evaluation_complete', function (Blueprint $table) {
            $table->id('academic_record_complete_id');
            $table->integer('student_id');
            $table->timestamp('completed_at');
            // Match tbl_users.user_id (often INT); avoid FK mismatch across legacy schemas
            $table->unsignedInteger('completed_by')->nullable();
            $table->text('notes')->nullable();

            $table->foreign('student_id')
                ->references('student_id')
                ->on('tbl_student_profile')
                ->onDelete('cascade');

            $table->index('completed_by');
            $table->index(['student_id', 'completed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tbl_academic_record_evaluation_complete');
    }
};
