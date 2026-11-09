<?php

namespace App\Mail;

use App\Models\TblUser;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class DeviceLoginOtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public TblUser $user,
        public string $code,
        public string $deviceLabel,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'New device sign-in code — '.config('app.name', 'Academic Evaluation System'),
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: $this->htmlBody(),
        );
    }

    private function htmlBody(): string
    {
        $this->user->loadMissing('role');
        $name = e($this->user->displayName());
        $code = e($this->code);
        $device = e($this->deviceLabel);
        $app = e(config('app.name', 'Academic Evaluation System'));
        $role = e((string) ($this->user->role?->role_name ?: 'staff'));
        $minutes = (int) config('account_mail.device_otp_expire_minutes', 10);

        return <<<HTML
        <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.5">
          <h2 style="color:#1b5e20;margin:0 0 12px">Verify this sign-in</h2>
          <p>Hi {$name},</p>
          <p>Someone is signing in to your <strong>{$app}</strong> <strong>{$role}</strong> account and needs an email verification code to continue.</p>
          <p style="margin:8px 0 16px;font-size:13px;color:#64748b">Device: {$device}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#475569">Enter this verification code to continue:</p>
          <p style="font-size:28px;letter-spacing:0.35em;font-weight:700;color:#1b5e20;margin:8px 0 20px">{$code}</p>
          <p style="font-size:13px;color:#64748b">This code expires in {$minutes} minutes. If you did not try to sign in, change your password and contact an administrator.</p>
        </div>
        HTML;
    }
}
