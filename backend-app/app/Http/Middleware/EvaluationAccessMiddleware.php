<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use App\Models\DeanProfile;

class EvaluationAccessMiddleware
{
    /**
     * Handle an incoming request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure(\Illuminate\Http\Request): (\Illuminate\Http\Response|\Illuminate\Http\RedirectResponse)  $next
     * @return \Illuminate\Http\Response|\Illuminate\Http\RedirectResponse
     */
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();
        
        if (!$user) {
            return response()->json(['message' => 'Unauthorized - No user authenticated'], 401);
        }

        // Check if user has required role for evaluation access
        $hasAccess = $user->canWorkOnStudentEvaluations();
        
        if (!$hasAccess) {
            return response()->json(['message' => 'Forbidden - Insufficient privileges for evaluation access'], 403);
        }

        // Additional checks for specific evaluation operations
        $method = $request->method();
        
        if ($method === 'DELETE') {
            if (! $user->canDeleteEvaluationsOrDeanAcademicRecords()) {
                return response()->json([
                    'message' => 'Forbidden — only administrators or users with Dean academic approvals may delete evaluations',
                ], 403);
            }
        }

        if (in_array($method, ['POST', 'PUT', 'PATCH'], true) && ! $user->canEditStudentGrades()) {
            $isPromote = $request->is('*evaluation/student/promote-next-semester');
            // Elective 4 subject pick saved right after promotion (no grade / remark).
            $isUngradedSubjectPick = $method === 'POST'
                && $request->is('*evaluation')
                && $request->input('grade') === null
                && $request->input('evaluation_status') === null;

            if (! (($isPromote || $isUngradedSubjectPick) && $user->canPromoteStudents())) {
                return response()->json([
                    'message' => $user->canPromoteStudents()
                        ? 'Forbidden — your access is Promote only. You cannot add or change grades.'
                        : 'Forbidden — your access is View only.',
                ], 403);
            }
        }

        // Evaluator / adviser writes are allowed when canWorkOnStudentEvaluations() is true.
        // A tbl_faculty_profile row is optional (used by My Profile / faculty roster), not required to save grades.

        // For dean users, check if they have access to their assigned program's evaluations
        if ($user->hasRole('Dean')) {
            $deanProfile = DeanProfile::where('user_id', $user->user_id)->first();
            
            if (!$deanProfile) {
                return response()->json(['message' => 'Forbidden - Dean profile not found'], 403);
            }

            // Add program-specific access logic here if needed
            // For now, we'll allow deans to access all evaluations
        }

        return $next($request);
    }
}
