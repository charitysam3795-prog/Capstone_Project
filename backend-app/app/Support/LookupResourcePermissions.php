<?php

namespace App\Support;

/**
 * Granular lookup CRUD permissions: lookup.{slug}.view | lookup.{slug}.manage
 * Legacy lookup.view / lookup.manage still grant broad access (see TblUser::canAccessLookupResource).
 */
final class LookupResourcePermissions
{
    /** @var array<string, string> slug => short label */
    public const SLUGS = [
        'programs' => 'Programs',
        'departments' => 'Departments',
        'subjects' => 'Subjects',
        'year_levels' => 'Year levels',
        'semesters' => 'Semesters',
        'campus' => 'Campus',
        'roles' => 'Roles (lookup table)',
        'sections' => 'Sections',
        'academic_years' => 'Academic years',
        'tracks' => 'Tracks',
        'requisites' => 'Prerequisites & requisites',
        'curriculum_headers' => 'Curriculum headers',
        'offered_subjects' => 'Offered subjects',
        'elective_subjects' => 'Elective subjects',
    ];

    /**
     * @return list<string>
     */
    public static function viewPermissionNames(): array
    {
        $names = [];
        foreach (array_keys(self::SLUGS) as $slug) {
            $names[] = "lookup.{$slug}.view";
        }

        return $names;
    }

    /**
     * @return list<string>
     */
    public static function managePermissionNames(): array
    {
        $names = [];
        foreach (array_keys(self::SLUGS) as $slug) {
            $names[] = "lookup.{$slug}.manage";
        }

        return $names;
    }

    /**
     * @return list<string>
     */
    public static function allGranularPermissionNames(): array
    {
        return array_values(array_unique(array_merge(self::viewPermissionNames(), self::managePermissionNames())));
    }

    public static function isValidSlug(string $slug): bool
    {
        return array_key_exists($slug, self::SLUGS);
    }
}
