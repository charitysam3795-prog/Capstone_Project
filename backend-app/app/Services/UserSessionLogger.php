<?php

namespace App\Services;

use App\Models\SecuritySetting;
use App\Models\TblUser;
use App\Models\UserSessionLog;
use Illuminate\Http\Request;

class UserSessionLogger
{
    public const REASON_MANUAL = 'manual logout';

    public const REASON_IDLE = 'idle timeout';

    public const REASON_EXPIRED = 'session expired';
    public static function logSuccessfulLogin(Request $request, TblUser $user, ?string $token = null): void
    {
        try {
            $client = self::clientDetails($request);

            UserSessionLog::create(array_merge($client, [
                'user_id' => $user->user_id,
                'email' => $user->email,
                'status' => 'success',
                'token_hash' => self::tokenHash($token),
                'login_at' => now(),
            ]));
        } catch (\Throwable) {
            // Authentication must not fail because audit/session logging failed.
        }
    }

    public static function logFailedLogin(Request $request, ?string $email, string $reason): void
    {
        try {
            $client = self::clientDetails($request);

            UserSessionLog::create(array_merge($client, [
                'email' => $email,
                'status' => 'failed',
                'failure_reason' => substr($reason, 0, 255),
                'login_at' => now(),
            ]));
        } catch (\Throwable) {
            //
        }
    }

    public static function logLogout(
        Request $request,
        ?TblUser $user = null,
        ?string $token = null,
        ?string $reason = null
    ): void {
        try {
            $hash = self::tokenHash($token);
            $query = UserSessionLog::query()
                ->where('status', 'success')
                ->whereNull('logout_at');

            if ($hash) {
                $query->where('token_hash', $hash);
            } elseif ($user) {
                $query->where('user_id', $user->user_id);
            } else {
                return;
            }

            $session = $query->latest('login_at')->first();
            if (! $session) {
                return;
            }

            $session->logout_at = now();
            $session->logout_reason = self::normalizeReason($reason);
            $session->save();
        } catch (\Throwable) {
            //
        }
    }

    /**
     * Close "Active" rows that already outlived the configured idle window
     * (tab closed / phone killed the app without calling /logout).
     *
     * @return int number of rows closed
     */
    public static function closeStaleOpenSessions(?int $timeoutMinutes = null): int
    {
        try {
            $settings = SecuritySetting::current();
            $staff = max(1, (int) ($settings->session_timeout_minutes ?? 30));
            $student = max(1, (int) ($settings->student_session_timeout_minutes ?? $staff));
            $minutes = max(1, $timeoutMinutes ?? max($staff, $student));

            $cutoff = now()->subMinutes($minutes);
            $rows = UserSessionLog::query()
                ->where('status', 'success')
                ->whereNull('logout_at')
                ->where('login_at', '<=', $cutoff)
                ->get();

            $closed = 0;
            foreach ($rows as $session) {
                $loginAt = $session->login_at;
                $estimatedEnd = $loginAt
                    ? $loginAt->copy()->addMinutes($minutes)
                    : now();
                if ($estimatedEnd->greaterThan(now())) {
                    $estimatedEnd = now();
                }

                $session->logout_at = $estimatedEnd;
                $session->logout_reason = self::REASON_IDLE;
                $session->save();
                $closed++;
            }

            return $closed;
        } catch (\Throwable) {
            return 0;
        }
    }

    public static function normalizeReason(?string $reason): string
    {
        $reason = strtolower(trim((string) $reason));

        return match (true) {
            $reason === '' => self::REASON_MANUAL,
            str_contains($reason, 'idle') => self::REASON_IDLE,
            str_contains($reason, 'expir') => self::REASON_EXPIRED,
            str_contains($reason, 'manual') => self::REASON_MANUAL,
            default => substr($reason, 0, 255),
        };
    }

    private static function tokenHash(?string $token): ?string
    {
        $token = trim((string) $token);

        return $token !== '' ? hash('sha256', $token) : null;
    }

    /**
     * @return array{ip_address: ?string, user_agent: ?string, browser: string, platform: string, device: string}
     */
    public static function clientDetails(Request $request): array
    {
        $ua = (string) $request->userAgent();

        return [
            'ip_address' => $request->ip(),
            'user_agent' => $ua !== '' ? $ua : null,
            'browser' => self::detectBrowser($ua),
            'platform' => self::detectPlatform($ua),
            'device' => self::detectDevice($ua),
        ];
    }

    private static function detectBrowser(string $ua): string
    {
        return match (true) {
            stripos($ua, 'Edg/') !== false => 'Microsoft Edge',
            stripos($ua, 'Chrome/') !== false && stripos($ua, 'Chromium/') === false => 'Chrome',
            stripos($ua, 'Firefox/') !== false => 'Firefox',
            stripos($ua, 'Safari/') !== false && stripos($ua, 'Chrome/') === false => 'Safari',
            stripos($ua, 'OPR/') !== false || stripos($ua, 'Opera') !== false => 'Opera',
            default => 'Unknown',
        };
    }

    private static function detectPlatform(string $ua): string
    {
        return match (true) {
            stripos($ua, 'Windows') !== false => 'Windows',
            stripos($ua, 'Mac OS') !== false || stripos($ua, 'Macintosh') !== false => 'macOS',
            stripos($ua, 'Android') !== false => 'Android',
            stripos($ua, 'iPhone') !== false || stripos($ua, 'iPad') !== false => 'iOS',
            stripos($ua, 'Linux') !== false => 'Linux',
            default => 'Unknown',
        };
    }

    private static function detectDevice(string $ua): string
    {
        return match (true) {
            stripos($ua, 'iPad') !== false || stripos($ua, 'Tablet') !== false => 'Tablet',
            stripos($ua, 'Mobile') !== false || stripos($ua, 'Android') !== false || stripos($ua, 'iPhone') !== false => 'Mobile',
            $ua !== '' => 'Desktop',
            default => 'Unknown',
        };
    }
}
