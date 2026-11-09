<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Support\CachedSchema;
use App\Services\AccountMailService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class EmailVerificationController extends Controller
{
    /**
     * Public: confirm email via token from the verification link.
     */
    public function verify(Request $request)
    {
        $validated = $request->validate([
            'token' => ['required', 'string'],
        ]);

        $user = AccountMailService::consumeToken($validated['token'], AccountMailService::PURPOSE_VERIFY);
        if (! $user) {
            throw ValidationException::withMessages([
                'token' => ['This verification link is invalid or has expired.'],
            ]);
        }

        if (CachedSchema::hasColumn('tbl_users', 'email_verified_at')) {
            $user->email_verified_at = now();
            $user->save();
        }

        return response()->json([
            'message' => 'Email verified successfully. You can sign in.',
        ]);
    }

    /**
     * Public: resend verification (generic response). Accepts email or student ID.
     */
    public function resend(Request $request)
    {
        $request->validate([
            'email' => ['required', 'string', 'max:255'],
        ]);

        return response()->json([
            'message' => 'Sign-in does not send an email. Use Forgot password on the login page if you need a reset link.',
        ]);
    }

    /**
     * Authenticated: send verification to the current user's email.
     */
    public function sendForCurrentUser(Request $request)
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        return response()->json([
            'message' => 'Sign-in does not send an email. Use Forgot password if you need a reset link.',
        ]);
    }
}
