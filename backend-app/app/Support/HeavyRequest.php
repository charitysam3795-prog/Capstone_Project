<?php

namespace App\Support;

/**
 * Shared CPU/memory budget for endpoints that grow with student volume
 * (imports, lists, analytics, semester activation). Call once at the start
 * of the request — safe to invoke multiple times.
 */
final class HeavyRequest
{
    public const MEMORY_LIST = '512M';

    public const MEMORY_ANALYTICS = '512M';

    public const MEMORY_IMPORT = '1024M';

    public const MEMORY_BATCH = '512M';

    public const SECONDS_LIST = 180;

    public const SECONDS_ANALYTICS = 300;

    public const SECONDS_IMPORT = 0;

    public const SECONDS_BATCH = 300;

    /** Typical chunk size when walking student ids / profiles. */
    public const STUDENT_CHUNK = 200;

    public static function raise(
        string $memory = self::MEMORY_LIST,
        int $seconds = self::SECONDS_LIST
    ): void {
        if ($seconds <= 0) {
            @set_time_limit(0);
            @ini_set('max_execution_time', '0');
        } else {
            @set_time_limit($seconds);
            @ini_set('max_execution_time', (string) $seconds);
        }

        if (function_exists('ini_set')) {
            @ini_set('memory_limit', $memory);
        }
    }

    public static function forList(): void
    {
        self::raise(self::MEMORY_LIST, self::SECONDS_LIST);
    }

    public static function forAnalytics(): void
    {
        self::raise(self::MEMORY_ANALYTICS, self::SECONDS_ANALYTICS);
    }

    public static function forImport(): void
    {
        self::raise(self::MEMORY_IMPORT, self::SECONDS_IMPORT);
        @ignore_user_abort(true);
    }

    public static function forBatch(): void
    {
        self::raise(self::MEMORY_BATCH, self::SECONDS_BATCH);
    }
}
