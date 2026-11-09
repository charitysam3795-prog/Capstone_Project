<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Align permissions with faculty portal: no My Classes / Grade Management / Credit eval there.
     */
    public function up(): void
    {
        $permTable = 'tbl_permission';
        $rpTable = 'tbl_role_permissions';
        $rolesTable = 'tbl_roles';

        $gradesId = DB::table($permTable)->where('permission_name', 'faculty.grades')->value('permission_id');
        if ($gradesId) {
            DB::table($rpTable)->where('permission_id', $gradesId)->delete();
            DB::table($permTable)->where('permission_id', $gradesId)->delete();
        }

        $creditNames = ['credit_eval.view', 'credit_eval.create', 'credit_eval.approve'];
        $creditIds = DB::table($permTable)->whereIn('permission_name', $creditNames)->pluck('permission_id');
        $facultyRoleId = DB::table($rolesTable)->where('role_name', 'Faculty')->value('role_id');
        $adviserRoleId = DB::table($rolesTable)->where('role_name', 'Adviser')->value('role_id');
        foreach (array_filter([$facultyRoleId, $adviserRoleId]) as $roleId) {
            DB::table($rpTable)
                ->where('role_id', $roleId)
                ->whereIn('permission_id', $creditIds)
                ->delete();
        }

        $evaluationMap = [
            'evaluation.view' => ['category' => 'Student Evaluation', 'description' => 'View student evaluations'],
            'evaluation.create' => ['category' => 'Student Evaluation', 'description' => 'Create student evaluations'],
            'evaluation.edit' => ['category' => 'Student Evaluation', 'description' => 'Edit student evaluations'],
            'evaluation.approve' => ['category' => 'Student Evaluation', 'description' => 'Approve student evaluations'],
        ];
        foreach ($evaluationMap as $name => $cols) {
            DB::table($permTable)->where('permission_name', $name)->update($cols);
        }

        DB::table($permTable)->where('permission_name', 'credit_eval.view')->update([
            'description' => 'View transfer credit evaluations',
        ]);
        DB::table($permTable)->where('permission_name', 'credit_eval.create')->update([
            'description' => 'Create transfer credit evaluations',
        ]);
        DB::table($permTable)->where('permission_name', 'credit_eval.approve')->update([
            'description' => 'Approve transfer credit evaluations',
        ]);

        DB::table($permTable)->where('permission_name', 'faculty.view')->update([
            'category' => 'Faculty Portal',
            'description' => 'Faculty portal access (e.g. profile)',
        ]);
        DB::table($permTable)->where('permission_name', 'faculty.manage')->update([
            'category' => 'Faculty Portal',
            'description' => 'Manage faculty assignments (admin)',
        ]);

        DB::table($permTable)->where('permission_name', 'Credit Evaluation')->update([
            'description' => 'Transfer / advanced standing credit (Dean portal and Academic Management)',
        ]);
        DB::table($permTable)->where('permission_name', 'Student Evaluation')->update([
            'description' => 'Student curriculum evaluation and grades (Faculty and Dean portals)',
        ]);
    }

    public function down(): void
    {
        // Intentionally empty — re-add faculty.grades via old seed if ever needed.
    }
};
