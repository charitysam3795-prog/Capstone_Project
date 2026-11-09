<?php

namespace App\Mail;

use App\Models\TblUser;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class ResetPasswordMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public TblUser $user,
        public string $resetUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Reset your password — '.config('app.name', 'Academic Evaluation System'),
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
        $name = e($this->user->displayName());
        $url = e($this->resetUrl);
        $app = e(config('app.name', 'Academic Evaluation System'));

        return <<<HTML
        <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.5">
          <h2 style="color:#1b5e20;margin:0 0 12px">Reset your password</h2>
          <p>Hi {$name},</p>
          <p>We received a request to reset the password for your <strong>{$app}</strong> account.</p>
          <p style="margin:24px 0">
            <a href="{$url}" style="background:#2e7d32;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;font-weight:600">
              Reset password
            </a>
          </p>
          <p style="font-size:13px;color:#64748b">Or open this link:<br><a href="{$url}">{$url}</a></p>
          <p style="font-size:13px;color:#64748b">If you did not request a reset, you can ignore this email. Your password will stay the same.</p>
        </div>
        HTML;
    }
}
