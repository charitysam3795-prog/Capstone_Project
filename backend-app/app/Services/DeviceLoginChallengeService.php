<?php

namespace App\Services;

use App\Mail\DeviceLoginOtpMail;
use App\Models\TblUser;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class DeviceLoginChallengeService
{
    public static function ensureTables(): void
    {
        static $checked = false;
        if ($checked) {
            return;
        }
        $checked = true;

        if (! Schema::hasTable('tbl_trusted_devices')) {
            Schema::create('tbl_trusted_devices', function ($table) {
                $table->bigIncrements('trusted_device_id');
                $table->integer('user_id');
                $table->string('fingerprint_hash', 64);
                $table->string('device_label', 120)->nullable();
                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->timestamp('last_used_at')->nullable();
                $table->timestamp('trusted_at')->nullable();
                $table->timestamps();
                $table->unique(['user_id', 'fingerprint_hash'], 'uq_trusted_device_user_fp');
                $table->index('user_id', 'idx_trusted_device_user');
            });
        }

        if (! Schema::hasTable('tbl_device_login_challenges')) {
            Schema::create('tbl_device_login_challenges', function ($table) {
                $table->bigIncrements('challenge_id');
                $table->integer('user_id');
                $table->string('challenge_token_hash', 64);
                $table->string('code_hash', 64);
                $table->string('fingerprint_hash', 64);
                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->unsignedTinyInteger('attempts')->default(0);
                $table->timestamp('expires_at');
                $table->timestamp('created_at')->nullable();
                $table->unique('challenge_token_hash', 'uq_device_challenge_token');
                $table->index(['user_id', 'fingerprint_hash'], 'idx_device_challenge_user_fp');
            });
        }
    }

    /** Explicit allow-list of roles that require OTP (empty = all non-exempt roles). */
    public static function rolesRequiringDeviceOtp(): array
    {
        $configured = config('account_mail.device_otp_roles', []);
        if (! is_array($configured)) {
            return [];
        }

        return array_values(array_filter(array_map('strval', $configured)));
    }

    /** Roles that skip login email OTP (Student by default). */
    public static function rolesExemptFromDeviceOtp(): array
    {
        $configured = config('account_mail.device_otp_exempt_roles', ['Student']);
        if (! is_array($configured) || $configured === []) {
            return ['Student'];
        }

        return array_values(array_filter(array_map('strval', $configured)));
    }

    public static function requiresDeviceOtp(TblUser $user): bool
    {
        if (! config('account_mail.device_otp_enabled', false)) {
            return false;
        }

        try {
            self::ensureTables();
        } catch (\Throwable $e) {
            report($e);

            return false;
        }

        if (! Schema::hasTable('tbl_trusted_devices') || ! Schema::hasTable('tbl_device_login_challenges')) {
            return false;
        }

        $user->loadMissing('role');
        $roleName = (string) ($user->role?->role_name ?? '');
        if ($roleName === '') {
            return false;
        }

        foreach (self::rolesExemptFromDeviceOtp() as $role) {
            if (strcasecmp($roleName, $role) === 0) {
                return false;
            }
        }

        $allowList = self::rolesRequiringDeviceOtp();
        if ($allowList === []) {
            return true;
        }

        foreach ($allowList as $role) {
            if (strcasecmp($roleName, $role) === 0) {
                return true;
            }
        }

        return false;
    }

    public static function mustChallengeEveryLogin(): bool
    {
        return (bool) config('account_mail.device_otp_every_login', true);
    }

    public static function fingerprintHash(TblUser $user, string $fingerprint): string
    {
        return hash('sha256', (string) $user->user_id.'|'.trim($fingerprint));
    }

    public static function isTrustedDevice(TblUser $user, string $fingerprint): bool
    {
        $fingerprint = trim($fingerprint);
        if ($fingerprint === '' || ! Schema::hasTable('tbl_trusted_devices')) {
            return false;
        }

        return DB::table('tbl_trusted_devices')
            ->where('user_id', $user->user_id)
            ->where('fingerprint_hash', self::fingerprintHash($user, $fingerprint))
            ->exists();
    }

    public static function touchTrustedDevice(TblUser $user, string $fingerprint, Request $request): void
    {
        if (! Schema::hasTable('tbl_trusted_devices')) {
            return;
        }

        $fingerprint = trim($fingerprint);
        if ($fingerprint === '') {
            return;
        }

        $hash = self::fingerprintHash($user, $fingerprint);
        $now = now();
        $existing = DB::table('tbl_trusted_devices')
            ->where('user_id', $user->user_id)
            ->where('fingerprint_hash', $hash)
            ->first();

        $meta = UserSessionLogger::clientDetails($request);
        $payload = [
            'device_label' => trim(($meta['device'] ?? 'Device').' · '.($meta['browser'] ?? 'Browser')),
            'ip_address' => $meta['ip_address'] ?? $request->ip(),
            'user_agent' => substr((string) ($request->userAgent() ?? ''), 0, 2000),
            'last_used_at' => $now,
            'updated_at' => $now,
        ];

        if ($existing) {
            DB::table('tbl_trusted_devices')
                ->where('trusted_device_id', $existing->trusted_device_id)
                ->update($payload);

            return;
        }

        DB::table('tbl_trusted_devices')->insert(array_merge($payload, [
            'user_id' => $user->user_id,
            'fingerprint_hash' => $hash,
            'trusted_at' => $now,
            'created_at' => $now,
        ]));
    }

    /**
     * Start a device OTP challenge and email the code.
     *
     * @return array{challenge_token: string, email_hint: string, expires_in: int}
     */
    public static function startChallenge(TblUser $user, string $fingerprint, Request $request): array
    {
        if (! AccountMailService::canReceiveMail($user)) {
            throw ValidationException::withMessages([
                'email' => [
                    'This account must verify new devices by email, but no deliverable email is on file. Ask an admin to set a real contact email.',
                ],
            ]);
        }

        $fingerprint = trim($fingerprint);
        if (strlen($fingerprint) < 8 || strlen($fingerprint) > 128) {
            throw ValidationException::withMessages([
                'device_fingerprint' => ['Device identity is missing. Refresh the page and try again.'],
            ]);
        }

        $expireMinutes = max(5, (int) config('account_mail.device_otp_expire_minutes', 10));
        $code = (string) random_int(100000, 999999);
        $challengeToken = Str::random(64);
        $fpHash = self::fingerprintHash($user, $fingerprint);
        $meta = UserSessionLogger::clientDetails($request);
        $deviceLabel = trim(($meta['device'] ?? 'Unknown device').' · '.($meta['browser'] ?? 'Unknown browser'));

        DB::table('tbl_device_login_challenges')
            ->where('user_id', $user->user_id)
            ->where('fingerprint_hash', $fpHash)
            ->delete();

        DB::table('tbl_device_login_challenges')->insert([
            'user_id' => $user->user_id,
            'challenge_token_hash' => hash('sha256', $challengeToken),
            'code_hash' => hash('sha256', $code),
            'fingerprint_hash' => $fpHash,
            'ip_address' => $meta['ip_address'] ?? $request->ip(),
            'user_agent' => substr((string) ($request->userAgent() ?? ''), 0, 2000),
            'attempts' => 0,
            'expires_at' => now()->addMinutes($expireMinutes),
            'created_at' => now(),
        ]);

        AccountMailService::deliverMail(
            new DeviceLoginOtpMail($user, $code, $deviceLabel),
            (string) $user->email
        );

        $email = (string) $user->email;
        $hint = self::maskEmail($email);

        return [
            'challenge_token' => $challengeToken,
            'email_hint' => $hint,
            'expires_in' => $expireMinutes * 60,
        ];
    }

    /**
     * @return TblUser
     */
    public static function verifyChallenge(
        string $challengeToken,
        string $code,
        string $fingerprint,
        Request $request
    ): TblUser {
        $challengeToken = trim($challengeToken);
        $code = preg_replace('/\D+/', '', trim($code)) ?? '';
        $fingerprint = trim($fingerprint);

        if ($challengeToken === '' || strlen($code) !== 6 || strlen($fingerprint) < 8) {
            throw ValidationException::withMessages([
                'otp_code' => ['Enter the 6-digit code from your email.'],
            ]);
        }

        $row = DB::table('tbl_device_login_challenges')
            ->where('challenge_token_hash', hash('sha256', $challengeToken))
            ->first();

        if (! $row) {
            throw ValidationException::withMessages([
                'otp_code' => ['This verification session expired. Sign in again.'],
            ]);
        }

        if ($row->expires_at && now()->greaterThan($row->expires_at)) {
            DB::table('tbl_device_login_challenges')->where('challenge_id', $row->challenge_id)->delete();
            throw ValidationException::withMessages([
                'otp_code' => ['This code expired. Sign in again to get a new one.'],
            ]);
        }

        if ((int) $row->attempts >= 5) {
            DB::table('tbl_device_login_challenges')->where('challenge_id', $row->challenge_id)->delete();
            throw ValidationException::withMessages([
                'otp_code' => ['Too many incorrect attempts. Sign in again.'],
            ]);
        }

        $actualFp = hash('sha256', (string) $row->user_id.'|'.$fingerprint);
        if (! hash_equals((string) $row->fingerprint_hash, $actualFp)) {
            throw ValidationException::withMessages([
                'otp_code' => ['This verification does not match this device. Sign in again on this browser.'],
            ]);
        }

        if (! hash_equals((string) $row->code_hash, hash('sha256', $code))) {
            DB::table('tbl_device_login_challenges')
                ->where('challenge_id', $row->challenge_id)
                ->update(['attempts' => (int) $row->attempts + 1]);

            throw ValidationException::withMessages([
                'otp_code' => ['Incorrect code. Check your email and try again.'],
            ]);
        }

        $user = TblUser::query()->with(['role', 'department', 'program'])->find($row->user_id);
        DB::table('tbl_device_login_challenges')->where('challenge_id', $row->challenge_id)->delete();

        if (! $user) {
            throw ValidationException::withMessages([
                'otp_code' => ['Account not found. Contact an administrator.'],
            ]);
        }

        self::touchTrustedDevice($user, $fingerprint, $request);

        return $user;
    }

    /**
     * @return array{challenge_token: string, email_hint: string, expires_in: int}
     */
    public static function resendChallenge(string $challengeToken, string $fingerprint, Request $request): array
    {
        $challengeToken = trim($challengeToken);
        $fingerprint = trim($fingerprint);

        $row = DB::table('tbl_device_login_challenges')
            ->where('challenge_token_hash', hash('sha256', $challengeToken))
            ->first();

        if (! $row) {
            throw ValidationException::withMessages([
                'otp_code' => ['This verification session expired. Sign in again.'],
            ]);
        }

        $user = TblUser::query()->with('role')->find($row->user_id);
        if (! $user) {
            throw ValidationException::withMessages([
                'otp_code' => ['Account not found. Contact an administrator.'],
            ]);
        }

        $actualFp = hash('sha256', (string) $row->user_id.'|'.$fingerprint);
        if (! hash_equals((string) $row->fingerprint_hash, $actualFp)) {
            throw ValidationException::withMessages([
                'otp_code' => ['This verification does not match this device. Sign in again on this browser.'],
            ]);
        }

        return self::startChallenge($user, $fingerprint, $request);
    }

    public static function maskEmail(string $email): string
    {
        $email = trim($email);
        $at = strpos($email, '@');
        if ($at === false) {
            return '***';
        }
        $local = substr($email, 0, $at);
        $domain = substr($email, $at + 1);
        $keep = max(1, min(2, strlen($local)));

        return substr($local, 0, $keep).str_repeat('*', max(1, strlen($local) - $keep)).'@'.$domain;
    }
}
