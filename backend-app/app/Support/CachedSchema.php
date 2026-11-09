<?php

namespace App\Support;

use Illuminate\Support\Facades\Schema;

/**
 * Schema::hasColumn hits information_schema; cache for the PHP process.
 */
final class CachedSchema
{
    /** @var array<string, bool> */
    private static array $columns = [];

    public static function hasColumn(string $table, string $column): bool
    {
        $key = $table.'.'.$column;
        if (! array_key_exists($key, self::$columns)) {
            self::$columns[$key] = Schema::hasColumn($table, $column);
        }

        return self::$columns[$key];
    }
}
