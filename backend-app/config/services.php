<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
    | Brevo (Sendinblue) transactional HTTP API — used only when Google Apps Script is not set.
    | Create an API key in Brevo → SMTP & API → API Keys (starts with xkeysib-).
    */
    'brevo' => [
        'key' => env('BREVO_API_KEY'),
    ],

    /*
    | Google Apps Script web app (GmailApp.sendEmail).
    | Deploy scripts/gscript/Code.gs as a web app, then set the exec URL and the same secret here.
    */
    'gscript' => [
        'url' => env('GSCRIPT_WEB_APP_URL'),
        'secret' => env('GSCRIPT_SECRET'),
        'from_email' => env('GSCRIPT_FROM_EMAIL', 'dmgaludo.coc@phinmaed.com'),
        'from_name' => env('GSCRIPT_FROM_NAME', 'PHINMA COC'),
        'timeout' => (int) env('GSCRIPT_TIMEOUT', 30),
    ],

];
