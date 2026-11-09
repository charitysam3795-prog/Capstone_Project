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
use App\Support\CachedSchema;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Tymon\JWTAuth\Facades\JWTAuth;

class AuthController extends Controller
{
    /**
     * @return array{user_id: int|string|null, role_id: int|string|null, email: mixed, role: mixed, is_admin: bool, permissions: array<int, string>, evaluation_year_level_ids: list<int>|null}
     */
    public static function userPayload(TblUser $user): array
    {
        $permissionNames = $user->permissionNamesForPayload();

        return [
            'user_id' => $user->user_id,
            'role_id' => $user->role_id,
            'email' => $user->email,
            'contact_number' => $user->contact_number,
            'role' => $user->role ? $user->role->role_name : null,
            'department_id' => $user->department_id,
            'department' => $user->department ? [
                'department_id' => $user->department->department_id,
                'department_name' => $user->department->department_name,
                'department_code' => $user->department->department_code,
            ] : null,
            'program_id' => $user->program_id,
            'program' => $user->program ? [
                'program_id' => $user->program->program_id,
                'program_name' => $user->program->program_name,
                'program_code' => $user->program->program_code,
            ] : null,
            'is_admin' => $user->isAdmin(),
            'permissions' => $permissionNames,
            /** null = all year levels; array of year_level_id = restricted (curriculum evaluation roster). */
            'evaluation_year_level_ids' => $user->effectiveEvaluationYearLevelIds(),
            /** Students created with default password must change it before using the portal. */
            'must_change_password' => $user->password_changed_at === null,
            'email_verified' => AccountMailService::isEmailVerified($user),
            'can_receive_mail' => AccountMailService::canReceiveMail($user),
            'avatar_path' => $user->avatar_path,
            'avatar_url' => $user->avatarUrl(),
            'display_name' => $user->displayName(),
        ];
    }

    /**
     * Staff roles that sign in with Employee ID (email is for mail only).
     *
     * @return list<string>
     */
    public static function employeeIdLoginRoles(): array
    {
        return ['Dean', 'Adviser', 'Evaluator', 'Program Head', 'Secretary'];
    }

    public static function usesEmployeeIdLogin(?TblUser $user): bool
    {
        if (! $user) {
            return false;
        }
        $user->loadMissing('role');
        $roleName = trim((string) ($user->role?->role_name ?? ''));
        if ($roleName === '') {
            return false;
        }
        foreach (self::employeeIdLoginRoles() as $role) {
            if (strcasecmp($roleName, $role) === 0) {
                return true;
            }
        }

        return false;
    }

    public static function resolveStaffEmployeeId(TblUser $user): ?string
    {
        $user->loadMissing(['deanProfile', 'facultyProfile', 'programHeadProfile', 'secretaryProfile']);
        $candidates = [
            $user->deanProfile?->employee_id,
            $user->facultyProfile?->employee_id,
            $user->programHeadProfile?->employee_id,
            $user->secretaryProfile?->employee_id,
        ];
        foreach ($candidates as $id) {
            $id = trim((string) ($id ?? ''));
            if ($id !== '') {
                return $id;
            }
        }

        return null;
    }

    /**
     * Portal login: staff with an Employee ID must use that ID (not email).
     * Email remains for password reset / verification / device OTP.
     */
    public static function assertPortalLoginUsesEmployeeIdWhenRequired(TblUser $user, string $login): void
    {
        if (! self::usesEmployeeIdLogin($user)) {
            return;
        }

        $employeeId = self::resolveStaffEmployeeId($user);
        if ($employeeId === null) {
            // Legacy accounts without Employee ID can still use email until an admin sets one.
            return;
        }

        if (strcasecmp(trim($login), $employeeId) === 0) {
            return;
        }

        throw ValidationException::withMessages([
            'email' => [
                'Sign in with your Employee ID. Email is only for password reset and verification codes.',
            ],
        ]);
    }

    /**
     * @return list<string>
     */
    public static function studentIdLoginCandidates(string $login): array
    {
        return \App\Support\StudentIdNumber::loginCandidates($login);
    }

    /**
     * Resolve login by email/username, student ID number, or staff employee ID.
     * Password reset / verification may still resolve staff by email.
     */
    public static function findUserByLogin(string $login): ?TblUser
    {
        $login = trim($login);
        if ($login === '') {
            return null;
        }

        $with = ['role', 'department', 'program', 'deanProfile', 'facultyProfile', 'programHeadProfile', 'secretaryProfile'];

        // Prefer Employee ID for staff (primary portal login).
        $byEmployeeId = TblUser::query()
            ->with($with)
            ->where(function ($q) use ($login) {
                $q->whereHas('deanProfile', fn ($p) => $p->where('employee_id', $login))
                    ->orWhereHas('facultyProfile', fn ($p) => $p->where('employee_id', $login))
                    ->orWhereHas('programHeadProfile', fn ($p) => $p->where('employee_id', $login))
                    ->orWhereHas('secretaryProfile', fn ($p) => $p->where('employee_id', $login));
            })
            ->first();
        if ($byEmployeeId) {
            return $byEmployeeId;
        }

        $studentIdCandidates = self::studentIdLoginCandidates($login);
        $applyNonSimulation = function ($q) {
            if (CachedSchema::hasColumn('tbl_student_profile', 'is_simulation')) {
                $q->where(function ($inner) {
                    $inner->where('is_simulation', false)->orWhereNull('is_simulation');
                });
            }
        };

        if ($studentIdCandidates !== []) {
            $byStudentId = TblUser::query()
                ->with($with)
                ->whereHas('studentProfile', function ($q) use ($studentIdCandidates, $applyNonSimulation) {
                    $q->whereIn('student_id_number', $studentIdCandidates);
                    $applyNonSimulation($q);
                })
                ->first();
            if ($byStudentId) {
                return $byStudentId;
            }
        }

        // Numeric-equivalent match for any PHINMA-style ID (all current + future students).
        $phinma = \App\Support\StudentIdNumber::parsePhinma($login);
        if ($phinma !== null) {
            $byStudentId = TblUser::query()
                ->with($with)
                ->whereHas('studentProfile', function ($q) use ($phinma, $applyNonSimulation) {
                    $q->whereRaw(
                        "student_id_number REGEXP '^[0-9]{1,2}-[0-9]{4}-[0-9]+$'
                         AND CAST(SUBSTRING_INDEX(student_id_number, '-', 1) AS UNSIGNED) = ?
                         AND SUBSTRING_INDEX(SUBSTRING_INDEX(student_id_number, '-', 2), '-', -1) = ?
                         AND CAST(SUBSTRING_INDEX(student_id_number, '-', -1) AS UNSIGNED) = ?",
                        [$phinma['campus'], $phinma['year'], $phinma['serial']]
                    );
                    $applyNonSimulation($q);
                })
                ->first();
            if ($byStudentId) {
                return $byStudentId;
            }
        }

        $user = TblUser::whereEmail($login)->with($with)->first();
        if ($user) {
            if (CachedSchema::hasColumn('tbl_student_profile', 'is_simulation')) {
                $sim = $user->studentProfile;
                if ($sim && ($sim->is_simulation ?? false)) {
                    return null;
                }
            }

            return $user;
        }

        return null;
    }

    public function login(Request $request)
    {
        $request->validate([
            'email' => ['required', 'string', 'max:255'],
            'password' => 'required',
        ]);

        $login = trim((string) $request->email);
        $user = self::findUserByLogin($login);

        if (! $user) {
            UserSessionLogger::logFailedLogin($request, $login, 'User not found');
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        try {
            self::assertPortalLoginUsesEmployeeIdWhenRequired($user, $login);
        } catch (ValidationException $e) {
            UserSessionLogger::logFailedLogin($request, $login, 'Must use Employee ID');
            throw $e;
        }

        try {
            AuthSecurity::validateCredentialsForLogin($user, $request->password);
        } catch (ValidationException $e) {
            $reason = collect($e->errors())->flatten()->first() ?? 'Login failed';
            UserSessionLogger::logFailedLogin($request, $login, $reason);
            throw $e;
        }

        if (AccountMailService::mustBlockUnverifiedLogin($user)) {
            UserSessionLogger::logFailedLogin($request, $login, 'Email not verified');
            try {
                AccountMailService::sendVerification($user);
            } catch (\Throwable $e) {
                report($e);
            }

            throw ValidationException::withMessages([
                'email' => [
                    'Please verify your email before signing in. We sent a new verification link if mail is available.',
                ],
            ]);
        }

        $fingerprint = trim((string) $request->input('device_fingerprint', ''));

        if (DeviceLoginChallengeService::requiresDeviceOtp($user)) {
            if ($fingerprint === '') {
                throw ValidationException::withMessages([
                    'device_fingerprint' => ['Device identity is missing. Refresh the page and try again.'],
                ]);
            }

            $needsChallenge = DeviceLoginChallengeService::mustChallengeEveryLogin()
                || ! DeviceLoginChallengeService::isTrustedDevice($user, $fingerprint);

            if ($needsChallenge) {
                try {
                    $challenge = DeviceLoginChallengeService::startChallenge($user, $fingerprint, $request);
                } catch (ValidationException $e) {
                    throw $e;
                } catch (\Throwable $e) {
                    report($e);
                    throw ValidationException::withMessages([
                        'email' => ['Could not send the device verification code. Try again shortly or contact an administrator.'],
                    ]);
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

        return $this->issueLoginSuccessResponse($request, $user);
    }

    public function verifyDeviceOtp(Request $request)
    {
        $request->validate([
            'challenge_token' => ['required', 'string', 'max:128'],
            'otp_code' => ['required', 'string', 'max:12'],
            'device_fingerprint' => ['required', 'string', 'min:8', 'max:128'],
        ]);

        try {
            $user = DeviceLoginChallengeService::verifyChallenge(
                (string) $request->input('challenge_token'),
                (string) $request->input('otp_code'),
                (string) $request->input('device_fingerprint'),
                $request
            );
        } catch (ValidationException $e) {
            $reason = collect($e->errors())->flatten()->first() ?? 'Device verification failed';
            UserSessionLogger::logFailedLogin($request, null, $reason);
            throw $e;
        }

        return $this->issueLoginSuccessResponse($request, $user);
    }

    public function resendDeviceOtp(Request $request)
    {
        $request->validate([
            'challenge_token' => ['required', 'string', 'max:128'],
            'device_fingerprint' => ['required', 'string', 'min:8', 'max:128'],
        ]);

        try {
            $challenge = DeviceLoginChallengeService::resendChallenge(
                (string) $request->input('challenge_token'),
                (string) $request->input('device_fingerprint'),
                $request
            );
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            report($e);
            throw ValidationException::withMessages([
                'otp_code' => ['Could not resend the code. Try again shortly.'],
            ]);
        }

        return response()->json([
            'requires_device_otp' => true,
            'challenge_token' => $challenge['challenge_token'],
            'email_hint' => $challenge['email_hint'],
            'expires_in' => $challenge['expires_in'],
            'message' => 'A new verification code was sent to your email.',
        ]);
    }

    private function issueLoginSuccessResponse(Request $request, TblUser $user)
    {
        $token = AuthUnitHelpers::generateSessionTokenForUser($user);
        UserSessionLogger::logSuccessfulLogin($request, $user, $token);

        return response()->json([
            'user' => self::userPayload($user),
            'access_token' => $token,
            'token_type' => 'Bearer',
            'expires_in' => AuthSecurity::tokenExpiresInSeconds($user),
            'message' => 'Login successful',
            'security' => AuthSecurity::clientSessionPayload(),
        ]);
    }

    public function changePassword(Request $request)
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $settings = SecuritySetting::current();
        $minLen = $settings->minPasswordLength();
        $maxLen = $settings->maxPasswordLength();
        $mustChangeDefault = $user->password_changed_at === null;

        $rules = [
            'password' => ['required', 'string', 'min:'.$minLen, 'max:'.$maxLen, 'confirmed', AuthUnitHelpers::passwordStrengthRule()],
        ];
        if (! $mustChangeDefault) {
            $rules['current_password'] = 'required|string';
        }

        $validated = $request->validate($rules);

        if (! $mustChangeDefault) {
            if (! AuthUnitHelpers::verifyPasswordMatch($validated['current_password'], (string) $user->password)) {
                throw ValidationException::withMessages([
                    'current_password' => ['The current password is incorrect.'],
                ]);
            }
        }

        $user->password = AuthUnitHelpers::hashUserPassword($validated['password']);
        $user->password_changed_at = now();
        $user->save();

        return response()->json([
            'message' => 'Password updated successfully',
            'user' => self::userPayload($user->fresh(['role', 'department', 'program'])),
        ]);
    }

    public function logout(Request $request)
    {
        $tokenValue = null;
        $user = $request->user();
        $reason = $request->input('reason');

        try {
            $token = JWTAuth::getToken();
            $tokenValue = $token ? $token->get() : null;
            UserSessionLogger::logLogout($request, $user, $tokenValue, is_string($reason) ? $reason : null);
            JWTAuth::parseToken()->invalidate(true);
        } catch (\Throwable) {
            // Token missing or already invalid — still try to close the open session row.
            if ($user || $tokenValue) {
                UserSessionLogger::logLogout($request, $user, $tokenValue, is_string($reason) ? $reason : null);
            }
        }

        return response()->json(['message' => 'Logged out successfully']);
    }

    public function user(Request $request)
    {
        try {
            $user = $request->user();

            if (! $user) {
                return response()->json(['user' => null], 401);
            }

            return response()->json([
                'user' => self::userPayload($user),
                'security' => AuthSecurity::clientSessionPayload(),
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to get user', 'message' => $e->getMessage()], 500);
        }
    }
}
