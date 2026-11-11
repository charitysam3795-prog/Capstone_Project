<?php

namespace App\Services;

use App\Models\Campus;

/**
 * SIS deliberation filenames encode campus as the last letter of the stem:
 *   2324S1M → Carmen (legacy Main), 2324S2P → Puerto, 2324S1I → Iligan,
 *   2728S1B → Butuan (once "Butuan Campus" exists in Lookup → Campus).
 *
 * Letters are resolved from tbl_campus (first letter of the campus name,
 * ignoring a trailing "Campus"). Legacy alias: M → Carmen (Main).
 */
class CampusFromImportFilename
{
    /**
     * Legacy filename letters that do not match the campus name's first letter.
     *
     * @var array<string, string> letter => name needle
     */
    private const LEGACY_LETTER_ALIASES = [
        'M' => 'carmen', // Main campus files → Carmen Campus
    ];

    /**
     * @return array{campus_id: int, campus_name: string, code: string}|null
     */
    public function resolve(?string $filename): ?array
    {
        $code = $this->campusLetterFromFilename($filename);
        if ($code === null) {
            return null;
        }

        $campus = $this->campusForLetter($code);
        if (! $campus) {
            return null;
        }

        return [
            'campus_id' => (int) $campus->campus_id,
            'campus_name' => (string) $campus->campus_name,
            'code' => $code,
        ];
    }

    public function campusLetterFromFilename(?string $filename): ?string
    {
        $raw = trim((string) $filename);
        if ($raw === '') {
            return null;
        }

        $base = basename(str_replace('\\', '/', $raw));
        $stem = pathinfo($base, PATHINFO_FILENAME);
        $stem = strtoupper(trim((string) $stem));
        if ($stem === '') {
            return null;
        }

        // Ignore trailing version noise: 2324S1M (1), 2324S1M_copy
        $stem = preg_replace('/[\s_\-]*(?:COPY|FINAL|V\d+|\(\d+\))$/i', '', $stem) ?? $stem;
        $stem = rtrim($stem, " ._-\t");
        if ($stem === '') {
            return null;
        }

        $letter = substr($stem, -1);
        if ($letter === '' || ! preg_match('/^[A-Z]$/', $letter)) {
            return null;
        }

        return $letter;
    }

    /**
     * Map filename letter → campus using Lookup campus rows.
     * First letter of each campus name (e.g. Butuan Campus → B, Puerto → P).
     */
    public function campusForLetter(string $letter): ?Campus
    {
        $letter = strtoupper(trim($letter));
        if ($letter === '' || ! preg_match('/^[A-Z]$/', $letter)) {
            return null;
        }

        $map = $this->letterToCampusMap();
        if (isset($map[$letter])) {
            return $map[$letter];
        }

        $needle = self::LEGACY_LETTER_ALIASES[$letter] ?? null;
        if ($needle === null) {
            return null;
        }

        return Campus::query()
            ->where(function ($q) {
                $q->whereNull('status')->orWhereRaw('LOWER(status) <> ?', ['inactive']);
            })
            ->whereRaw('LOWER(campus_name) LIKE ?', ['%'.$needle.'%'])
            ->orderBy('campus_id')
            ->first();
    }

    /**
     * @return array<string, Campus> uppercase letter => campus
     */
    public function letterToCampusMap(): array
    {
        $rows = Campus::query()
            ->where(function ($q) {
                $q->whereNull('status')->orWhereRaw('LOWER(status) <> ?', ['inactive']);
            })
            ->orderBy('campus_id')
            ->get();

        $map = [];
        foreach ($rows as $campus) {
            $code = $this->letterForCampusName((string) $campus->campus_name);
            if ($code === null) {
                continue;
            }
            // First campus registered for a letter wins (stable by campus_id).
            if (! isset($map[$code])) {
                $map[$code] = $campus;
            }
        }

        return $map;
    }

    public function letterForCampusName(string $campusName): ?string
    {
        $name = trim($campusName);
        if ($name === '') {
            return null;
        }

        // "Butuan Campus" → Butuan → B
        $name = preg_replace('/\s+campus\s*$/i', '', $name) ?? $name;
        $name = trim($name);
        if ($name === '') {
            return null;
        }

        if (! preg_match('/([A-Za-z])/', $name, $m)) {
            return null;
        }

        return strtoupper($m[1]);
    }
}
