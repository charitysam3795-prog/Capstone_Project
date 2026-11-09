<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tbl_credit_evaluation_details', function (Blueprint $table) {
            $table->integer('credit_eval_id')->nullable()->after('credit_detail_id');
        });

        $details = DB::table('tbl_credit_evaluation_details')
            ->whereNull('credit_eval_id')
            ->get();

        foreach ($details as $d) {
            $eval = DB::table('tbl_credit_evaluation')
                ->where('student_id', $d->student_id)
                ->orderByDesc('credit_eval_id')
                ->first();
            if ($eval) {
                DB::table('tbl_credit_evaluation_details')
                    ->where('credit_detail_id', $d->credit_detail_id)
                    ->update(['credit_eval_id' => $eval->credit_eval_id]);
            }
        }

        Schema::table('tbl_credit_evaluation_details', function (Blueprint $table) {
            $table->foreign('credit_eval_id')
                ->references('credit_eval_id')
                ->on('tbl_credit_evaluation')
                ->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('tbl_credit_evaluation_details', function (Blueprint $table) {
            $table->dropForeign(['credit_eval_id']);
            $table->dropColumn('credit_eval_id');
        });
    }
};
