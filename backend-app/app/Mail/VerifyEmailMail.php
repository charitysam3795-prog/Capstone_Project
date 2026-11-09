<?php

namespace App\Mail;

use App\Models\TblUser;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class VerifyEmailMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public TblUser $user,
        public string $verifyUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Verify your email — '.config('app.name', 'Academic Evaluation System'),
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
        $url = e($this->verifyUrl);
        $app = e(config('app.name', 'Academic Evaluation System'));

        return <<<HTML
        <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.5">
          <h2 style="color:#1b5e20;margin:0 0 12px">Verify your email</h2>
          <p>Hi {$name},</p>
          <p>Please confirm this email address for your <strong>{$app}</strong> account.</p>
          <p style="margin:24px 0">
            <a href="{$url}" style="background:#2e7d32;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;font-weight:600">
              Verify email
            </a>
          </p>
          <p style="font-size:13px;color:#64748b">Or open this link:<br><a href="{$url}">{$url}</a></p>
          <p style="font-size:13px;color:#64748b">This link expires soon. If you did not request this, you can ignore this message.</p>
        </div>
        HTML;
    }
}
