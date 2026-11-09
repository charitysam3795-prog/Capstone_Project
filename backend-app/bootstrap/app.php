<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Railway / reverse proxies terminate TLS; trust X-Forwarded-* headers.
        $middleware->trustProxies(at: '*');

        $middleware->validateCsrfTokens(except: [
            'api/*',
        ]);

        // API is token-based — never redirect guests to a missing web "login" route (was causing HTTP 500).
        $middleware->redirectGuestsTo(function ($request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return null;
            }

            return '/';
        });

        // Apply security headers to every response
        $middleware->append(\App\Http\Middleware\SecurityHeaders::class);

        // Block HTML/script-like symbols on API writes; normalize contact numbers
        $middleware->appendToGroup('api', \App\Http\Middleware\RejectUnsafeInput::class);

        // Register evaluation access middleware, RBAC, and tymon/jwt-auth (Laravel 11+ router has no aliasMiddleware)
        $middleware->alias([
            'evaluation.access' => \App\Http\Middleware\EvaluationAccessMiddleware::class,
            'permission' => \App\Http\Middleware\CheckPermission::class,
            'jwt.auth' => \Tymon\JWTAuth\Http\Middleware\Authenticate::class,
            'jwt.refresh' => \Tymon\JWTAuth\Http\Middleware\RefreshToken::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (\Illuminate\Auth\AuthenticationException $e, $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json(['message' => 'Unauthenticated'], 401);
            }

            return null;
        });
    })->create();
