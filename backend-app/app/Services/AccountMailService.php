<?php

namespace App\Services;

use App\Mail\ResetPasswordMail;
use App\Mail\VerifyEmailMail;
use App\Models\TblUser;
use App\Support\CachedSchema;
use Illuminate\Mail\Mailable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class AccountMailService
{
    public const PURPOSE_VERIFY = 'verify';

    public const PURPOSE_RESET = 'reset';

    public static function canReceiveMail(TblUser $user): bool
    {
        $email = trim((string) $user->email);
        if ($email === '' || ! AuthUnitHelpers::validateEmailFormat($email)) {
            return false;
        }

        $studentId = null;
        try {
            $user->loadMissing('studentProfile');
            $studentId = $user->studentProfile?->student_id_number;
        } catch (\Throwable) {
            // ignore
        }

        return ! StudentAccountEmail::isLoginPlaceholder($email, $studentId);
    }

    public static function isEmailVerified(TblUser $user): bool
    {
        if (! CachedSchema::hasColumn('tbl_users', 'email_verified_at')) {
            return true;
        }

        return $user->email_verified_at !== null;
    }

    /**
     * Block login when MAIL_REQUIRE_VERIFIED=true and the account has an unverified real email.
     */
    public static function mustBlockUnverifiedLogin(TblUser $user): bool
    {
        if (! config('account_mail.require_verified')) {
            return false;
        }

        if (! self::canReceiveMail($user)) {
            return false;
        }

        return ! self::isEmailVerified($user);
    }

    public static function sendVerification(TblUser $user): bool
    {
        if (! self::canReceiveMail($user)) {
            return false;
        }

        $plain = self::issueToken($user, self::PURPOSE_VERIFY, (int) config('account_mail.verify_expire_minutes', 60));
        $url = config('account_mail.frontend_url').'/verify-email?token='.urlencode($plain);

        self::deliver(new VerifyEmailMail($user, $url), (string) $user->email);

        return true;
    }

    public static function sendPasswordReset(TblUser $user): bool
    {
        if (! self::canReceiveMail($user)) {
            return false;
        }

        $plain = self::issueToken($user, self::PURPOSE_RESET, (int) config('account_mail.reset_expire_minutes', 60));
        $url = config('account_mail.frontend_url')
            .'/reset-password?token='.urlencode($plain)
            .'&email='.urlencode((string) $user->email);

        self::deliver(new ResetPasswordMail($user, $url), (string) $user->email);

        return true;
    }

    /**
     * Send through the Google Apps Script web app when GSCRIPT_WEB_APP_URL is set.
     * Otherwise use Brevo, then the Laravel mailer, then the log mailer.
     */
    public static function deliverMail(Mailable $mailable, string $toEmail): void
    {
        self::deliver($mailable, $toEmail);
    }

    private static function deliver(Mailable $mailable, string $toEmail): void
    {
        $webAppUrl = trim((string) config('services.gscript.url'));
        $secret = (string) config('services.gscript.secret');
        if ($webAppUrl !== '' && $secret !== '') {
            self::deliverViaGoogleAppsScript($mailable, $toEmail, $webAppUrl, $secret);

            return;
        }

        $apiKey = trim((string) config('services.brevo.key'));
        if ($apiKey !== '') {
            $rendered = $mailable->render();
            $subject = $mailable->envelope()->subject ?? config('app.name', 'Academic Evaluation System');

            $response = Http::withHeaders([
                'api-key' => $apiKey,
                'accept' => 'application/json',
                'content-type' => 'application/json',
            ])
                ->timeout((int) env('MAIL_TIMEOUT', 12))
                ->post('https://api.brevo.com/v3/smtp/email', [
                    'sender' => [
                        'name' => (string) config('mail.from.name', config('app.name')),
                        'email' => (string) config('mail.from.address'),
                    ],
                    'to' => [
                        ['email' => $toEmail],
                    ],
                    'subject' => $subject,
                    'htmlContent' => $rendered,
                ]);

            if ($response->failed()) {
                throw new \RuntimeException(
                    'Brevo API mail failed ('.$response->status().'): '.$response->body()
                );
            }

            return;
        }

        try {
            Mail::to($toEmail)->send($mailable);
        } catch (\Throwable $e) {
            report($e);
            // Railway often blocks/hangs SMTP; keep the request from failing hard.
            Mail::mailer('log')->to($toEmail)->send($mailable);
        }
    }

    /**
     * POST JSON to the Apps Script web app. Google answers with a 302 to a
     * result URL that must be followed as GET. Re-posting that redirect returns 405.
     */
    private static function deliverViaGoogleAppsScript(Mailable $mailable, string $toEmail, string $webAppUrl, string $secret): void
    {
        if (! function_exists('curl_init')) {
            throw new \RuntimeException('Google Apps Script mail requires the PHP curl extension.');
        }

        $rendered = $mailable->render();
        $subject = $mailable->envelope()->subject ?? config('app.name', 'Academic Evaluation System');
        $fromName = trim((string) config('services.gscript.from_name'));
        if ($fromName === '') {
            $fromName = (string) config('mail.from.name', 'PHINMA COC');
        }

        $fromEmail = trim((string) config('services.gscript.from_email', 'dmgaludo.coc@phinmaed.com'));

        $payload = json_encode([
            'secret' => $secret,
            'to' => $toEmail,
            'subject' => $subject,
            'body' => self::plainBody($rendered),
            'from_email' => $fromEmail,
            'from_name' => $fromName,
            'html_body' => $rendered,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if ($payload === false) {
            throw new \RuntimeException('Could not encode the email payload.');
        }

        $ch = curl_init($webAppUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_TIMEOUT => max(5, (int) config('services.gscript.timeout', 30)),
            CURLOPT_CONNECTTIMEOUT => 15,
        ]);

        $response = curl_exec($ch);
        $error = curl_error($ch);
        curl_close($ch);

        if ($response === false || $error !== '') {
            throw new \RuntimeException('Google Apps Script mail failed: '.$error);
        }

        $decoded = json_decode($response, true);
        if (! is_array($decoded) || ($decoded['status'] ?? '') !== 'success') {
            $message = is_array($decoded) ? (string) ($decoded['message'] ?? $response) : (string) $response;
            throw new \RuntimeException('Google Apps Script mail failed: '.$message);
        }
    }

    private static function plainBody(string $html): string
    {
        $text = preg_replace('/<br\s*\/?>/i', "\n", $html) ?? $html;
        $text = preg_replace('/<\/p>/i', "\n\n", $text) ?? $text;
        $text = html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace("/[ \t]+/", ' ', $text) ?? $text;
        $text = preg_replace("/\n{3,}/", "\n\n", $text) ?? $text;

        return trim($text);
    }

    public static function consumeToken(string $plainToken, string $purpose): ?TblUser
    {
        $plainToken = trim($plainToken);
        if ($plainToken === '' || ! Schema::hasTable('tbl_account_email_tokens')) {
            return null;
        }

        $hash = hash('sha256', $plainToken);
        $row = DB::table('tbl_account_email_tokens')
            ->where('token_hash', $hash)
            ->where('purpose', $purpose)
            ->first();

        if (! $row) {
            return null;
        }

        if ($row->expires_at && now()->greaterThan($row->expires_at)) {
            DB::table('tbl_account_email_tokens')->where('id', $row->id)->delete();

            return null;
        }

        $user = TblUser::query()->find($row->user_id);
        DB::table('tbl_account_email_tokens')->where('id', $row->id)->delete();

        return $user ?: null;
    }

    private static function issueToken(TblUser $user, string $purpose, int $expireMinutes): string
    {
        if (! Schema::hasTable('tbl_account_email_tokens')) {
            throw new \RuntimeException('Email token table is missing. Run migrations.');
        }

        DB::table('tbl_account_email_tokens')
            ->where('user_id', $user->user_id)
            ->where('purpose', $purpose)
            ->delete();

        $plain = Str::random(64);
        DB::table('tbl_account_email_tokens')->insert([
            'user_id' => $user->user_id,
            'purpose' => $purpose,
            'token_hash' => hash('sha256', $plain),
            'expires_at' => now()->addMinutes(max(5, $expireMinutes)),
            'created_at' => now(),
        ]);

        return $plain;
    }
}
