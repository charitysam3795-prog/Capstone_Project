<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CheckPermission
{
    /**
     * Handle an incoming request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure  $next
     * @param  string  $permission
     * @return mixed
     */
    public function handle(Request $request, Closure $next, string $permission)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'error' => 'Unauthorized',
                'message' => 'You must be logged in to access this resource.'
            ], 401);
        }

        // Admin bypass - admins have all permissions
        if ($user->isAdmin()) {
            return $next($request);
        }

        // Check specific permission
        if (!$user->hasPermission($permission)) {
            return response()->json([
                'error' => 'Forbidden',
                'message' => 'You do not have permission to perform this action.',
                'required_permission' => $permission
            ], 403);
        }

        return $next($request);
    }
}
