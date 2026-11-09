<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\SecuritySetting;
use App\Models\TblUser;
use App\Services\AccountMailService;
use App\Services\AuthUnitHelpers;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class PasswordResetController extends Controller
{
    /**
     * Always returns a generic success message (do not reveal whether the email exists).
     */
    public function requestReset(Request $request)
    {
        $validated = $request->validate([
            'email' => ['required', 'string', 'max:255'],
        ]);

        $login = trim($validated['email']);
        $user = AuthController::findUserByLogin($login);

        if ($user && AccountMailService::canReceiveMail($user)) {
            try {
                AccountMailService::sendPasswordReset($user);
            } catch (\Throwable $e) {
                report($e);

                // Do not leave the UI spinning on SMTP/API outages. Token may still
                // have been created; admin can check logs. Generic message either way.
                return response()->json([
                    'message' => 'If an account with a valid email exists for that login, a password reset link has been sent.',
                    'mail_warning' => 'Email delivery may be delayed. If nothing arrives, contact an administrator.',
                ]);
            }
        }

        return response()->json([
            'message' => 'If an account with a valid email exists for that login, a password reset link has been sent.',
        ]);
    }

    public function reset(Request $request)
    {
        $settings = SecuritySetting::current();
        $minLen = $settings->minPasswordLength();
        $maxLen = $settings->maxPasswordLength();

        $validated = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'min:'.$minLen, 'max:'.$maxLen, 'confirmed', AuthUnitHelpers::passwordStrengthRule()],
        ]);

        $user = AccountMailService::consumeToken($validated['token'], AccountMailService::PURPOSE_RESET);
        if (! $user) {
            throw ValidationException::withMessages([
                'token' => ['This reset link is invalid or has expired. Request a new one.'],
            ]);
        }

        $email = trim($validated['email']);
        if (strcasecmp((string) $user->email, $email) !== 0) {
            throw ValidationException::withMessages([
                'email' => ['This reset link does not match the email provided.'],
            ]);
        }

        $user->password = AuthUnitHelpers::hashUserPassword($validated['password']);
        $user->password_changed_at = now();
        $user->failed_login_attempts = 0;
        $user->locked_until = null;
        $user->save();

        return response()->json([
            'message' => 'Password updated. You can sign in with your new password.',
        ]);
    }
}
