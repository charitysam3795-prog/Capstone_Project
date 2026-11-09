<?php

namespace App\Support;

class FrontendUrl
{
    /**
     * Base URL for links in emails (password reset, verify email).
     * On Railway, RAILWAY_PUBLIC_DOMAIN wins over a stale APP_URL in Variables.
     */
    public static function base(): string
    {
        $frontend = trim((string) env('FRONTEND_URL', ''));
        if ($frontend !== '') {
            return self::normalize($frontend);
        }

        $railwayDomain = trim((string) env('RAILWAY_PUBLIC_DOMAIN', ''));
        if ($railwayDomain !== '') {
            return self::normalize('https://'.$railwayDomain);
        }

        $app = trim((string) env('APP_URL', ''));
        if ($app !== '') {
            return self::normalize($app);
        }

        return 'http://localhost:3000';
    }

    private static function normalize(string $url): string
    {
        $url = trim($url);
        if ($url === '') {
            return 'http://localhost:3000';
        }
        if (! preg_match('#^https?://#i', $url)) {
            $url = 'https://'.$url;
        }

        return rtrim($url, '/');
    }
}
