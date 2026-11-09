<?php

namespace App\Http\Controllers\Administration;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\UserSessionLog;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    private function ensureCanViewAudit(Request $request)
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }
        if (! $user->isAdmin() && ! $user->hasPermission('audit.view') && ! $user->hasPermission('Audit Logs')) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return null;
    }

    public function index(Request $request)
    {
        try {
            if ($resp = $this->ensureCanViewAudit($request)) {
                return $resp;
            }

            $query = AuditLog::with('user');

            // Apply filters
            if ($request->has('user_id')) {
                $query->where('user_id', $request->user_id);
            }

            if ($request->has('table_name')) {
                $query->where('table_name', $request->table_name);
            }

            if ($request->has('actions')) {
                $query->where('actions', 'like', '%'.$request->actions.'%');
            }

            if ($request->has('date_from')) {
                $query->where('action_timestamp', '>=', $request->date_from);
            }

            if ($request->has('date_to')) {
                $query->where('action_timestamp', '<=', $request->date_to);
            }

            $logs = $query->orderBy('action_timestamp', 'desc')
                ->paginate($request->get('per_page', 50));

            return response()->json($logs);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch audit logs', 'message' => $e->getMessage()], 500);
        }
    }

    public function sessions(Request $request)
    {
        try {
            if ($resp = $this->ensureCanViewAudit($request)) {
                return $resp;
            }

            // Close leftover "Active" rows when idle window already elapsed (tab/app closed).
            \App\Services\UserSessionLogger::closeStaleOpenSessions();

            $query = UserSessionLog::with([
                'user.role',
                'user.department',
                'user.studentProfile.program',
                'user.facultyProfile.department',
                'user.deanProfile.department',
                'user.programHeadProfile.department',
                'user.secretaryProfile.department',
            ]);

            if ($request->filled('email')) {
                $query->where('email', 'like', '%'.$request->email.'%');
            }

            if ($request->filled('status')) {
                if ($request->status === 'active') {
                    $query->where('status', 'success')->whereNull('logout_at');
                } elseif ($request->status === 'logged_out') {
                    $query->where('status', 'success')->whereNotNull('logout_at');
                } else {
                    $query->where('status', $request->status);
                }
            }

            if ($request->filled('ip_address')) {
                $query->where('ip_address', 'like', '%'.$request->ip_address.'%');
            }

            if ($request->filled('date_from')) {
                $query->where('login_at', '>=', $request->date_from);
            }

            if ($request->filled('date_to')) {
                $query->where('login_at', '<=', $request->date_to);
            }

            $logs = $query->orderByDesc('login_at')
                ->paginate($request->get('per_page', 50));

            $logs->getCollection()->transform(function (UserSessionLog $row) {
                $actor = \App\Support\SessionActorSummary::fromUser($row->user, $row->email);
                $row->setAttribute('display_name', $actor['display_name']);
                $row->setAttribute('actor_role', $actor['role']);
                $row->setAttribute('affiliation', $actor['affiliation']);
                $row->setAttribute('affiliation_kind', $actor['affiliation_kind']);
                $row->setAttribute('student_id_number', $actor['student_id_number']);
                $row->setAttribute('display_email', $actor['email']);

                return $row;
            });

            return response()->json($logs);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch session logs', 'message' => $e->getMessage()], 500);
        }
    }
}
