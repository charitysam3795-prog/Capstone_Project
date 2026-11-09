<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

class AcademicYear extends Model
{
    protected $table = 'tbl_academic_year';
    protected $primaryKey = 'academic_year_id';
    public $incrementing = true;
    public $timestamps = false;

    protected $fillable = [
        'academic_year_name',
        'status',
    ];

    // convenience accessor
    protected $appends = ['name'];

    public function getNameAttribute()
    {
        return $this->attributes['academic_year_name'] ?? null;
    }

    /**
     * Parse "2025-2026" style labels. Returns [start, end] or null.
     *
     * @return array{0: int, 1: int}|null
     */
    public static function parseYearRange(?string $name): ?array
    {
        if ($name === null || $name === '') {
            return null;
        }
        if (! preg_match('/(\d{4})\s*[-–\/]\s*(\d{4})/', $name, $m)) {
            return null;
        }

        return [(int) $m[1], (int) $m[2]];
    }

    /** Start year for sorting; unknown labels sort last. */
    public function startYear(): int
    {
        $range = self::parseYearRange((string) ($this->academic_year_name ?? ''));

        return $range[0] ?? 0;
    }

    public function isActive(): bool
    {
        $status = strtolower(trim((string) ($this->status ?? '')));

        return in_array($status, ['active', 'open', 'current'], true);
    }

    /**
     * Plausible years for filters (drops far-future demo rows like 2099-2099).
     * Inactive past years stay listed so history remains filterable.
     *
     * @return Collection<int, self>
     */
    public static function forAnalyticsFilters(?int $referenceYear = null): Collection
    {
        $ref = $referenceYear ?? (int) date('Y');
        $maxStart = $ref + 1;

        return self::query()
            ->get(['academic_year_id', 'academic_year_name', 'status'])
            ->filter(function (self $y) use ($maxStart) {
                if ($y->isActive()) {
                    return true;
                }
                $range = self::parseYearRange((string) $y->academic_year_name);
                if ($range === null) {
                    return true;
                }

                return $range[0] <= $maxStart;
            })
            ->sortByDesc(fn (self $y) => $y->startYear())
            ->values();
    }

    /** The present school year: the active Lookup academic year. */
    public static function currentId(): int
    {
        return self::resolveCurrentId(self::forAnalyticsFilters());
    }

    /**
     * The active year is the current school year. If several are active, prefer the
     * one whose range contains today, then the latest start.
     *
     * @param  Collection<int, self>  $years
     */
    public static function resolveCurrentId(Collection $years, ?int $referenceYear = null): int
    {
        if ($years->isEmpty()) {
            return 0;
        }
        $active = $years->filter(fn ($y) => $y instanceof self ? $y->isActive() : false)->values();
        if ($active->count() === 1) {
            return (int) $active->first()->academic_year_id;
        }
        if ($active->isNotEmpty()) {
            $years = $active;
        }
        $ref = $referenceYear ?? (int) date('Y');
        foreach ($years as $y) {
            $range = self::parseYearRange((string) $y->academic_year_name);
            if ($range && $ref >= $range[0] && $ref <= $range[1]) {
                return (int) $y->academic_year_id;
            }
        }

        return (int) ($years->first()?->academic_year_id ?? 0);
    }
}
