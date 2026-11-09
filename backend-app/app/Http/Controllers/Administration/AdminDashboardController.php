<?php

namespace App\Http\Controllers\Administration;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\AuditLog;
use App\Models\Curriculum;
use App\Models\CurriculumHeader;
use App\Models\Department;
use App\Models\Program;
use App\Models\Role;
use App\Models\StudentProfile;
use App\Models\Subject;
use App\Models\TblUser;
use App\Models\UserSessionLog;
use App\Support\CachedSchema;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class AdminDashboardController extends Controller
{
    /**
     * System snapshot for the Admin Panel dashboard.
     */
    public function overview(Request $request)
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        // Admin shell users (Admin role, or staff with directory/settings access).
        $allowed = $user->isAdmin()
            || $user->canAccessUserDirectory()
            || $user->canManageSecuritySettings()
            || $user->hasPermission('lookup.view')
            || $user->hasPermission('lookup.manage')
            || $user->hasPermission('Curriculum Management')
            || $user->hasPermission('System Management');

        if (! $allowed) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $usersTotal = TblUser::query()->count();
        $usersActive = TblUser::query()
            ->where(function ($q) {
                $q->whereNull('status')->orWhereRaw('LOWER(status) = ?', ['active']);
            })
            ->count();
        $usersInactive = max(0, $usersTotal - $usersActive);

        $studentsTotal = StudentProfile::query()->count();
        if (CachedSchema::hasColumn('tbl_student_profile', 'is_simulation')) {
            $studentsTotal = StudentProfile::query()
                ->where(function ($q) {
                    $q->where('is_simulation', false)->orWhereNull('is_simulation');
                })
                ->count();
        }

        $roleCounts = Role::query()
            ->orderBy('role_name')
            ->get(['role_id', 'role_name'])
            ->map(function (Role $role) {
                return [
                    'role_id' => $role->role_id,
                    'role_name' => $role->role_name,
                    'count' => TblUser::query()->where('role_id', $role->role_id)->count(),
                ];
            })
            ->values()
            ->all();

        $programs = Schema::hasTable('tbl_program') ? Program::query()->count() : 0;
        $departments = Schema::hasTable('tbl_departments') ? Department::query()->count() : 0;
        $subjects = Schema::hasTable('tbl_subjects') ? Subject::query()->count() : 0;
        $curriculumRows = Schema::hasTable('tbl_curriculum') ? Curriculum::query()->count() : 0;
        $curriculumHeaders = Schema::hasTable('tbl_curriculum_header') ? CurriculumHeader::query()->count() : 0;
        $academicYears = Schema::hasTable('tbl_academic_year') ? AcademicYear::query()->count() : 0;

        $recentLogins = [];
        if (Schema::hasTable('user_session_logs')) {
            $recentLogins = UserSessionLog::query()
                ->with([
                    'user.role',
                    'user.department',
                    'user.studentProfile.program',
                    'user.facultyProfile.department',
                    'user.deanProfile.department',
                    'user.programHeadProfile.department',
                    'user.secretaryProfile.department',
                ])
                ->where('status', 'success')
                ->orderByDesc('login_at')
                ->limit(8)
                ->get()
                ->map(function (UserSessionLog $row) {
                    $actor = \App\Support\SessionActorSummary::fromUser($row->user, $row->email);

                    return [
                        'display_name' => $actor['display_name'],
                        'role' => $actor['role'],
                        'affiliation' => $actor['affiliation'],
                        'affiliation_kind' => $actor['affiliation_kind'],
                        'student_id_number' => $actor['student_id_number'],
                        'email' => $actor['email'],
                        'browser' => $row->browser,
                        'platform' => $row->platform,
                        'login_at' => optional($row->login_at)?->toIso8601String(),
                    ];
                })
                ->all();
        }

        $recentAudits = [];
        if (Schema::hasTable('audit_logs')) {
            try {
                $recentAudits = AuditLog::query()
                    ->orderByDesc('action_timestamp')
                    ->limit(8)
                    ->get(['actions', 'table_name', 'action_timestamp'])
                    ->map(fn (AuditLog $row) => [
                        'actions' => $row->actions,
                        'table_name' => $row->table_name,
                        'action_timestamp' => optional($row->action_timestamp)?->toIso8601String(),
                    ])
                    ->all();
            } catch (\Throwable) {
                $recentAudits = [];
            }
        }

        return response()->json([
            'users' => [
                'total' => $usersTotal,
                'active' => $usersActive,
                'inactive' => $usersInactive,
            ],
            'students' => [
                'total' => $studentsTotal,
            ],
            'catalog' => [
                'programs' => $programs,
                'departments' => $departments,
                'subjects' => $subjects,
                'curriculum_rows' => $curriculumRows,
                'curriculum_headers' => $curriculumHeaders,
                'academic_years' => $academicYears,
            ],
            'roles' => $roleCounts,
            'recent_logins' => $recentLogins,
            'recent_audits' => $recentAudits,
        ]);
    }
}
