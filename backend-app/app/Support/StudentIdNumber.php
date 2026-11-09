<?php

namespace App\Support;

/**
 * PHINMA-style student IDs: {campus}-{batchYear}-{serial}, e.g. 02-2324-07413.
 * Login/import often omit a leading campus zero or serial zeros — normalize both ways.
 */
class StudentIdNumber
{
    /**
     * Canonical storage form for campus-code IDs (pad campus to 2 digits).
     * Non-matching formats are returned trimmed (spaces removed).
     */
    public static function canonicalize(string $raw): string
    {
        $raw = self::compact($raw);
        if ($raw === '') {
            return '';
        }

        if (preg_match('/^(\d{1,2})-(\d{4})-(\d+)$/', $raw, $m)) {
            return sprintf('%02d-%s-%s', (int) $m[1], $m[2], $m[3]);
        }

        return $raw;
    }

    /**
     * @return list<string>
     */
    public static function loginCandidates(string $login): array
    {
        $login = self::compact($login);
        if ($login === '') {
            return [];
        }

        $candidates = [$login, self::canonicalize($login)];

        if (preg_match('/^(\d{1,2})-(\d{4})-(\d+)$/', $login, $m)) {
            $campus = (int) $m[1];
            $year = $m[2];
            $serial = $m[3];
            $serialBare = ltrim($serial, '0');
            if ($serialBare === '') {
                $serialBare = '0';
            }

            foreach ([$serial, $serialBare, str_pad($serialBare, 5, '0', STR_PAD_LEFT), str_pad($serialBare, 6, '0', STR_PAD_LEFT)] as $serialVariant) {
                $candidates[] = sprintf('%d-%s-%s', $campus, $year, $serialVariant);
                $candidates[] = sprintf('%02d-%s-%s', $campus, $year, $serialVariant);
            }
        }

        return array_values(array_unique(array_filter($candidates, fn ($c) => $c !== '')));
    }

    /**
     * @return array{campus: int, year: string, serial: int}|null
     */
    public static function parsePhinma(string $id): ?array
    {
        $id = self::compact($id);
        if (! preg_match('/^(\d{1,2})-(\d{4})-(\d+)$/', $id, $m)) {
            return null;
        }

        return [
            'campus' => (int) $m[1],
            'year' => $m[2],
            'serial' => (int) $m[3],
        ];
    }

    public static function compact(string $raw): string
    {
        return trim(preg_replace('/\s+/', '', $raw) ?? '');
    }
}
