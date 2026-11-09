<?php

namespace App\Http\Controllers\Administration;

use App\Http\Controllers\Controller;
use App\Models\SecuritySetting;
use App\Support\CachedSchema;
use Illuminate\Http\Request;

class SecuritySettingsController extends Controller
{
    public function show(Request $request)
    {
        if (! $request->user()?->canManageSecuritySettings()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json(SecuritySetting::current()->toPublicArray());
    }

    public function update(Request $request)
    {
        if (! $request->user()?->canManageSecuritySettings()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'min_password_length' => 'required|integer|min:6|max:32',
            'password_expiry_days' => 'required|integer|min:0|max:3650',
            // Up to ~140 days so schools can align idle timeout with a semester if desired.
            'session_timeout_minutes' => 'required|integer|min:1|max:200000',
            'student_session_timeout_minutes' => 'required|integer|min:1|max:200000',
            'session_warning_minutes_left' => 'nullable|integer|min:1|max:200000',
            'lockout_attempts' => 'required|integer|min:1|max:50',
            'lockout_duration_minutes' => 'required|integer|min:1|max:1440',
        ]);

        $row = SecuritySetting::current();
        if (! CachedSchema::hasColumn('tbl_security_settings', 'session_warning_minutes_left')) {
            unset($validated['session_warning_minutes_left']);
        }
        $row->fill($validated);
        if (CachedSchema::hasColumn('tbl_security_settings', 'max_password_length')) {
            $row->max_password_length = SecuritySetting::PASSWORD_HARD_MAX;
        }
        $row->save();
        SecuritySetting::forgetCached();

        return response()->json($row->fresh()->toPublicArray());
    }
}
