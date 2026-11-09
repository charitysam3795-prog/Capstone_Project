<?php

use App\Support\FrontendUrl;

return [

    /*
    |--------------------------------------------------------------------------
    | Front-end URL (password reset & email verification links)
    |--------------------------------------------------------------------------
    */
    'frontend_url' => FrontendUrl::base(),

    /*
    |--------------------------------------------------------------------------
    | Token lifetimes (minutes)
    |--------------------------------------------------------------------------
    */
    'verify_expire_minutes' => (int) env('MAIL_VERIFY_EXPIRE_MINUTES', 60),
    'reset_expire_minutes' => (int) env('MAIL_RESET_EXPIRE_MINUTES', 60),

    /*
    |--------------------------------------------------------------------------
    | When true, staff with a real email must verify before login.
    | Left off: sign-in does not send email. Forgot password is the mail that stays.
    |--------------------------------------------------------------------------
    */
    'require_verified' => filter_var(env('MAIL_REQUIRE_VERIFIED', false), FILTER_VALIDATE_BOOL),

    /*
    |--------------------------------------------------------------------------
    | Login email OTP
    |--------------------------------------------------------------------------
    | Off for every role. Login does not email a code. Set DEVICE_OTP_ENABLED=true
    | only if that code should come back. Forgot password is the email that stays.
    */
    'device_otp_enabled' => filter_var(env('DEVICE_OTP_ENABLED', false), FILTER_VALIDATE_BOOL),
    'device_otp_roles' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('DEVICE_OTP_ROLES', ''))
    ))),
    'device_otp_exempt_roles' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('DEVICE_OTP_EXEMPT_ROLES', 'Student'))
    ))),
    'device_otp_expire_minutes' => (int) env('DEVICE_OTP_EXPIRE_MINUTES', 10),
    /*
    | When true, OTP is required on every login (even previously trusted devices).
    | When false, only untrusted / new browsers require OTP.
    */
    'device_otp_every_login' => filter_var(env('DEVICE_OTP_EVERY_LOGIN', true), FILTER_VALIDATE_BOOL),

];
