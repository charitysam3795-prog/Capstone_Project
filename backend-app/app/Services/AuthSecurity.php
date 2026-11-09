<?php

namespace App\Services;

use App\Models\SecuritySetting;
use App\Models\TblUser;
use Illuminate\Validation\ValidationException;
use Tymon\JWTAuth\Facades\JWTAuth;

class AuthSecurity
{
    /** Whole minutes until lockout ends (at least 1 while still locked). */
    public static function minutesUntilLockExpires(\DateTimeInterface $lockedUntil): int
    {
        $seconds = max(0, $lockedUntil->getTimestamp() - now()->getTimestamp());

        return max(1, (int) ceil($seconds / 60));
    }

    public static function clientSessionPayload(): array
    {
        $s = SecuritySetting::current();

        $payload = [
            'min_password_length' => $s->minPasswordLength(),
            'session_timeout_minutes' => (int) $s->session_timeout_minutes,
            'student_session_timeout_minutes' => (int) ($s->student_session_timeout_minutes ?? $s->session_timeout_minutes),
        ];

        if (\App\Support\CachedSchema::hasColumn('tbl_security_settings', 'session_warning_minutes_left')) {
            // Stored as minutes of idle before the warning modal opens.
            $payload['session_warning_minutes_left'] = max(
                1,
                (int) ($s->session_warning_minutes_left ?: 1)
            );
        }

        return $payload;
    }

    /**
     * JWT lifetime in minutes, aligned with Security Settings session timeout.
     * Students use student_session_timeout_minutes; everyone else uses session_timeout_minutes.
     */
    public static function jwtTtlMinutesForUser(?TblUser $user = null): int
    {
        try {
            $settings = SecuritySetting::current();
            $minutes = max(1, (int) $settings->session_timeout_minutes);

            if ($user) {
                $user->loadMissing('role');
                $roleName = strtolower(trim((string) ($user->role->role_name ?? '')));
                if ($roleName === 'student') {
                    $minutes = max(1, (int) ($settings->student_session_timeout_minutes ?? $minutes));
                }
            }

            return $minutes;
        } catch (\Throwable) {
            return max(1, (int) config('jwt.ttl', 60));
        }
    }

    /** Apply session-aligned TTL to the JWT factory (login / refresh). */
    public static function applyJwtTtlForUser(?TblUser $user = null): int
    {
        $minutes = self::jwtTtlMinutesForUser($user);

        try {
            JWTAuth::factory()->setTTL($minutes);
        } catch (\Throwable) {
            // Factory may be unavailable in isolated unit tests.
        }

        return $minutes;
    }

    /** Issue a JWT whose exp matches the user's session timeout setting. */
    public static function issueTokenForUser(TblUser $user): string
    {
        self::applyJwtTtlForUser($user);

        return JWTAuth::fromUser($user);
    }

    public static function tokenExpiresInSeconds(?TblUser $user = null): int
    {
        return self::jwtTtlMinutesForUser($user) * 60;
    }

    /**
     * @throws ValidationException
     */
    public static function validateCredentialsForLogin(TblUser $user, string $plainPassword): void
    {
        $settings = SecuritySetting::current();

        if ($user->locked_until && $user->locked_until->isFuture()) {
            $mins = self::minutesUntilLockExpires($user->locked_until);
            $unit = $mins === 1 ? 'minute' : 'minutes';

            throw ValidationException::withMessages([
                'email' => [
                    sprintf(
                        'This account is temporarily locked. You can try again in %d %s.',
                        $mins,
                        $unit
                    ),
                ],
            ]);
        }

        if (! AuthUnitHelpers::verifyPasswordMatch($plainPassword, (string) $user->password)) {
            self::recordFailedLogin($user, $settings);
            $user->refresh();

            $message = 'The provided credentials are incorrect.';
            if ($user->locked_until && $user->locked_until->isFuture()) {
                $mins = self::minutesUntilLockExpires($user->locked_until);
                $unit = $mins === 1 ? 'minute' : 'minutes';
                $message = sprintf(
                    'Too many failed password attempts. Your account is locked. Try again in %d %s.',
                    $mins,
                    $unit
                );
            }

            throw ValidationException::withMessages([
                'email' => [$message],
            ]);
        }

        if ($user->status !== 'active' && $user->status !== null) {
            throw ValidationException::withMessages([
                'email' => ['Your account is not active.'],
            ]);
        }

        // TODO(DEPLOY): Re-enable password expiry before production launch.
        // Search the repo for "TODO(DEPLOY): Re-enable password expiry" when going live.
        // Uncomment the block below and decide policy: all users vs non-admin only (!$user->isAdmin()).
        // $days = (int) $settings->password_expiry_days;
        // if ($days > 0 && ! $user->isAdmin() && $user->password_changed_at) {
        //     if ($user->password_changed_at->copy()->addDays($days)->isPast()) {
        //         throw ValidationException::withMessages([
        //             'email' => ['Your password has expired. Contact an administrator to reset it.'],
        //         ]);
        //     }
        // }

        self::clearLoginState($user);
    }

    public static function clearLoginState(TblUser $user): void
    {
        $user->failed_login_attempts = 0;
        $user->locked_until = null;
        $user->last_login_at = now();
        $user->save();
    }

    protected static function recordFailedLogin(TblUser $user, SecuritySetting $settings): void
    {
        $attempts = (int) $user->failed_login_attempts + 1;
        $user->failed_login_attempts = $attempts;
        $maxAttempts = max(1, (int) $settings->lockout_attempts);
        if ($attempts >= $maxAttempts) {
            $user->locked_until = now()->addMinutes(max(1, (int) $settings->lockout_duration_minutes));
        }
        $user->save();
    }
}
