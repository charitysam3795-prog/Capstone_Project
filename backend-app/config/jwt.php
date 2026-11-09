<?php

/*
 * JWT config (tymon/jwt-auth). Published from package; kept in repo for consistent defaults.
 * Run: php artisan jwt:secret
 */

return [

    'secret' => env('JWT_SECRET'),

    'keys' => [
        'public' => env('JWT_PUBLIC_KEY'),
        'private' => env('JWT_PRIVATE_KEY'),
        'passphrase' => env('JWT_PASSPHRASE'),
    ],

    /*
    | Default JWT TTL in minutes (fallback only).
    | At runtime, AuthSecurity overrides this with Security Settings
    | session_timeout_minutes / student_session_timeout_minutes so JWT
    | expiry stays aligned with idle session timeout.
    */
    'ttl' => (int) env('JWT_TTL', 60),

    'refresh_ttl' => env('JWT_REFRESH_TTL', 20160),

    'algo' => env('JWT_ALGO', 'HS256'),

    'required_claims' => [
        'iss',
        'iat',
        'exp',
        'nbf',
        'sub',
        'jti',
    ],

    'persistent_claims' => [
        'email',
        'role_id',
    ],

    'lock_subject' => true,

    'leeway' => env('JWT_LEEWAY', 0),

    'blacklist_enabled' => env('JWT_BLACKLIST_ENABLED', true),

    'blacklist_grace_period' => env('JWT_BLACKLIST_GRACE_PERIOD', 0),

    'decrypt_cookies' => false,

    'providers' => [
        'jwt' => Tymon\JWTAuth\Providers\JWT\Lcobucci::class,
        'auth' => Tymon\JWTAuth\Providers\Auth\Illuminate::class,
        'storage' => Tymon\JWTAuth\Providers\Storage\Illuminate::class,
    ],

];
