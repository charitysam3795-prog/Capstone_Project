<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\SecuritySetting;
use App\Models\TblUser;
use App\Services\AccountMailService;
use App\Services\AuthSecurity;
use App\Services\AuthUnitHelpers;
use App\Services\DeviceLoginChallengeService;
use App\Services\UserSessionLogger;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Tymon\JWTAuth\Facades\JWTAuth;

class JwtAuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate([
            'email' => ['required', 'string', 'max:255'],
            'password' => 'required|string',
        ]);

        $login = trim((string) $request->email);
        $user = AuthController::findUserByLogin($login);

        if (! $user) {
            UserSessionLogger::logFailedLogin($request, $login, 'User not found');

            return response()->json(['error' => 'Invalid credentials'], 401);
        }

        try {
            AuthController::assertPortalLoginUsesEmployeeIdWhenRequired($user, $login);
        } catch (ValidationException $e) {
            UserSessionLogger::logFailedLogin($request, $login, 'Must use Employee ID');

            return response()->json([
                'error' => collect($e->errors())->flatten()->first() ?? 'Sign in with your Employee ID.',
                'errors' => $e->errors(),
            ], 422);
        }

        try {
            AuthSecurity::validateCredentialsForLogin($user, $request->password);
        } catch (ValidationException $e) {
            $msg = collect($e->errors())->flatten()->first() ?? 'Login failed';
            UserSessionLogger::logFailedLogin($request, $login, $msg);

            return response()->json([
                'error' => $msg,
                'errors' => $e->errors(),
            ], 422);
        }

        if (AccountMailService::mustBlockUnverifiedLogin($user)) {
            UserSessionLogger::logFailedLogin($request, $login, 'Email not verified');
            try {
                AccountMailService::sendVerification($user);
            } catch (\Throwable $e) {
                report($e);
            }

            return response()->json([
                'error' => 'Please verify your email before signing in. We sent a new verification link if mail is available.',
                'errors' => [
                    'email' => [
                        'Please verify your email before signing in. We sent a new verification link if mail is available.',
                    ],
                ],
            ], 422);
        }

        $fingerprint = trim((string) $request->input('device_fingerprint', ''));

        if (DeviceLoginChallengeService::requiresDeviceOtp($user)) {
            if ($fingerprint === '') {
                return response()->json([
                    'error' => 'Device identity is missing. Refresh the page and try again.',
                    'errors' => [
                        'device_fingerprint' => ['Device identity is missing. Refresh the page and try again.'],
                    ],
                ], 422);
            }

            $needsChallenge = DeviceLoginChallengeService::mustChallengeEveryLogin()
                || ! DeviceLoginChallengeService::isTrustedDevice($user, $fingerprint);

            if ($needsChallenge) {
                try {
                    $challenge = DeviceLoginChallengeService::startChallenge($user, $fingerprint, $request);
                } catch (ValidationException $e) {
                    return response()->json([
                        'error' => collect($e->errors())->flatten()->first() ?? 'Device verification required',
                        'errors' => $e->errors(),
                    ], 422);
                } catch (\Throwable $e) {
                    report($e);

                    return response()->json([
                        'error' => 'Could not send the device verification code. Try again shortly.',
                    ], 422);
                }

                return response()->json([
                    'requires_device_otp' => true,
                    'challenge_token' => $challenge['challenge_token'],
                    'email_hint' => $challenge['email_hint'],
                    'expires_in' => $challenge['expires_in'],
                    'message' => 'Enter the verification code sent to your email to continue.',
                ]);
            }

            DeviceLoginChallengeService::touchTrustedDevice($user, $fingerprint, $request);
        }

        $token = AuthUnitHelpers::generateSessionTokenForUser($user);
        UserSessionLogger::logSuccessfulLogin($request, $user, $token);

        return response()->json([
            'access_token' => $token,
            'token_type' => 'Bearer',
            'expires_in' => AuthSecurity::tokenExpiresInSeconds($user),
            'user' => AuthController::userPayload($user),
            'security' => AuthSecurity::clientSessionPayload(),
        ]);
    }

    /**
     * Public self-registration is disabled. Create users via Admin → User Management.
     */
    public function register(Request $request)
    {
        return response()->json([
            'error' => 'Public registration is disabled. Ask an administrator to create your account.',
        ], 403);
    }

    public function me(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'user' => AuthController::userPayload($user),
            'security' => AuthSecurity::clientSessionPayload(),
        ]);
    }

    /**
     * Refresh access token. JWT TTL matches Security Settings session timeout
     * (same window the frontend uses for idle logout).
     */
    public function refresh()
    {
        try {
            JWTAuth::parseToken();
            // Allow reading claims from an expired access token within refresh_ttl.
            JWTAuth::manager()->setRefreshFlow(true);
            $payload = JWTAuth::manager()->decode(JWTAuth::getToken());
            $user = TblUser::query()->find($payload->get('sub'));

            AuthSecurity::applyJwtTtlForUser($user);

            $token = JWTAuth::parseToken()->refresh();

            return response()->json([
                'access_token' => $token,
                'token_type' => 'Bearer',
                'expires_in' => AuthSecurity::tokenExpiresInSeconds($user),
                'security' => AuthSecurity::clientSessionPayload(),
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => 'Could not refresh token',
                'message' => $e->getMessage(),
            ], 401);
        }
    }

    public function logout(Request $request)
    {
        $reason = $request->input('reason');
        $user = $request->user();
        $tokenValue = null;

        try {
            $token = JWTAuth::getToken();
            $tokenValue = $token ? $token->get() : null;
            UserSessionLogger::logLogout($request, $user, $tokenValue, is_string($reason) ? $reason : null);
            JWTAuth::parseToken()->invalidate(true);
        } catch (\Throwable) {
            if ($user || $tokenValue) {
                UserSessionLogger::logLogout($request, $user, $tokenValue, is_string($reason) ? $reason : null);
            }
        }

        return response()->json(['message' => 'Successfully logged out']);
    }
}
