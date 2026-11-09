<?php

namespace App\Support;

use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Friendly “cannot delete — still linked to …” responses for Lookup deletes.
 */
final class LookupDeleteGuard
{
    /**
     * @param  array<string, int>  $links  label => count
     */
    public static function message(string $itemLabel, array $links): ?string
    {
        $parts = [];
        foreach ($links as $label => $count) {
            $n = (int) $count;
            if ($n > 0) {
                $parts[] = "{$n} {$label}";
            }
        }
        if ($parts === []) {
            return null;
        }

        return 'Cannot delete '.$itemLabel.' because it is linked to: '
            .implode(', ', $parts)
            .'. Remove or reassign those records first.';
    }

    public static function count(string $table, string $column, int|string $id): int
    {
        if (! Schema::hasTable($table) || ! CachedSchema::hasColumn($table, $column)) {
            return 0;
        }

        return (int) DB::table($table)->where($column, $id)->count();
    }

    /** @return array<string, int> */
    public static function academicYearLinks(int $id): array
    {
        return [
            'curriculum header(s)' => self::count('tbl_curriculum_header', 'academic_year_id', $id),
            'offered subject(s)' => self::count('tbl_offered_subject', 'academic_year_id', $id),
            'evaluation(s)' => self::count('tbl_evaluation', 'academic_year_id', $id),
            'enrollment(s)' => self::count('tbl_enrollments', 'academic_year_id', $id),
            'student profile(s)' => self::count('tbl_student_profile', 'academic_year_id', $id),
        ];
    }

    /** @return array<string, int> */
    public static function campusLinks(int $id): array
    {
        return [
            'department(s)' => self::count('tbl_departments', 'campus_id', $id),
            'program(s)' => self::count('tbl_program', 'campus_id', $id),
        ];
    }

    /** @return array<string, int> */
    public static function departmentLinks(int $id): array
    {
        return [
            'program(s)' => self::count('tbl_program', 'department_id', $id),
            'faculty profile(s)' => self::count('tbl_faculty_profile', 'department_id', $id),
            'program head profile(s)' => self::count('tbl_program_head_profile', 'department_id', $id),
            'secretary profile(s)' => self::count('tbl_secretary_profile', 'department_id', $id),
            'user(s)' => self::count('tbl_users', 'department_id', $id),
            'elective subject(s)' => self::count('tbl_elective_subject', 'department_id', $id),
        ];
    }

    /** @return array<string, int> */
    public static function programLinks(int $id): array
    {
        $studentProgramCol = CachedSchema::hasColumn('tbl_student_profile', 'Current_Program')
            ? 'Current_Program'
            : (CachedSchema::hasColumn('tbl_student_profile', 'current_program') ? 'current_program' : null);

        return [
            'curriculum header(s)' => self::count('tbl_curriculum_header', 'program_id', $id),
            'curriculum row(s)' => self::count('curriculum', 'program_id', $id),
            'student profile(s)' => $studentProgramCol
                ? self::count('tbl_student_profile', $studentProgramCol, $id)
                : 0,
            'track(s)' => self::count('tbl_track', 'program_id', $id),
            'elective slot(s)' => self::count('tbl_elective_slot', 'program_id', $id),
            'elective subject(s)' => self::count('tbl_elective_subject', 'program_id', $id),
            'offered subject(s)' => self::count('tbl_offered_subject', 'program_id', $id),
            'user(s)' => self::count('tbl_users', 'program_id', $id),
            'program head profile(s)' => self::count('tbl_program_head_profile', 'program_id', $id),
            'secretary profile(s)' => self::count('tbl_secretary_profile', 'program_id', $id),
            'faculty profile(s)' => self::count('tbl_faculty_profile', 'program_id', $id),
            'dean profile(s)' => self::count('tbl_dean_profile', 'program_id', $id),
        ];
    }

    /** @return array<string, int> */
    public static function subjectLinks(int $id): array
    {
        return [
            'curriculum row(s)' => self::count('curriculum', 'subject_id', $id),
            'evaluation(s)' => self::count('tbl_evaluation', 'subject_id', $id),
            'offered subject(s)' => self::count('tbl_offered_subject', 'subject_id', $id),
            'elective subject(s)' => self::count('tbl_elective_subject', 'subject_id', $id),
            'prerequisite link(s)' => self::count('tbl_prerequisite', 'subject_id', $id)
                + self::count('tbl_prerequisite', 'requisites_subject_id', $id),
        ];
    }

    /** @return array<string, int> */
    public static function yearLevelLinks(int $id): array
    {
        return [
            'curriculum row(s)' => self::count('curriculum', 'year_level', $id)
                + self::count('curriculum', 'year_level_id', $id),
            'elective slot(s)' => self::count('tbl_elective_slot', 'year_level_id', $id),
            'student profile(s)' => self::count('tbl_student_profile', 'year_level_id', $id),
            'offered subject(s)' => self::count('tbl_offered_subject', 'year_level_id', $id),
        ];
    }

    /** @return array<string, int> */
    public static function semesterLinks(int $id): array
    {
        return [
            'curriculum row(s)' => self::count('curriculum', 'semester_id', $id),
            'evaluation(s)' => self::count('tbl_evaluation', 'semester_id', $id),
            'elective slot(s)' => self::count('tbl_elective_slot', 'semester_id', $id),
            'offered subject(s)' => self::count('tbl_offered_subject', 'semester_id', $id),
            'student profile(s)' => self::count('tbl_student_profile', 'semester_id', $id),
        ];
    }

    /** @return array<string, int> */
    public static function roleLinks(int $id): array
    {
        return [
            'user(s)' => self::count('tbl_users', 'role_id', $id),
        ];
    }

    /** @return array<string, int> */
    public static function trackLinks(int $id): array
    {
        return [
            'elective subject(s)' => self::count('tbl_elective_subject', 'track_id', $id),
            'student profile(s)' => self::count('tbl_student_profile', 'track_id', $id),
            'offered subject(s)' => self::count('tbl_offered_subject', 'track_id', $id),
        ];
    }

    /** @return array<string, int> */
    public static function curriculumHeaderLinks(int $id): array
    {
        return [
            'curriculum row(s)' => self::count('curriculum', 'curriculum_header_id', $id),
        ];
    }

    /** @return array<string, int> */
    public static function offeredSubjectLinks(int $id): array
    {
        return [
            'evaluation(s)' => self::count('tbl_evaluation', 'offered_subject_id', $id),
        ];
    }

    /** @return array<string, int> */
    public static function electiveSubjectLinks(int $id): array
    {
        return [
            'curriculum row(s)' => self::count('curriculum', 'elective_subject_id', $id),
            'evaluation(s)' => self::count('tbl_evaluation', 'elective_subject_id', $id),
        ];
    }

    /** @return array<string, int> */
    public static function sectionLinks(int $id): array
    {
        return [
            'evaluation(s)' => self::count('tbl_evaluation', 'section_id', $id),
            'enrollment(s)' => self::count('tbl_enrollments', 'section_id', $id),
        ];
    }

    /** @return array<string, int> */
    public static function electiveSlotLinks(int $id): array
    {
        return [
            'elective subject(s)' => self::count('tbl_elective_subject', 'elective_slot_id', $id),
            'curriculum row(s)' => self::count('curriculum', 'elective_slot_id', $id),
            'evaluation(s)' => self::count('tbl_evaluation', 'elective_slot_id', $id),
        ];
    }

    /**
     * @param  array<string, int>  $links
     * @param  callable():mixed  $delete
     */
    public static function deleteOrConflict(string $itemLabel, array $links, callable $delete): JsonResponse
    {
        $blocked = self::message($itemLabel, $links);
        if ($blocked !== null) {
            return response()->json(['message' => $blocked], 409);
        }

        try {
            $delete();
        } catch (QueryException $e) {
            $raw = $e->getMessage();
            if (stripos($raw, 'foreign key') !== false || stripos($raw, 'constraint') !== false) {
                return response()->json([
                    'message' => 'Cannot delete '.$itemLabel
                        .' because it is still linked to other records. Remove or reassign those links first.',
                ], 409);
            }

            throw $e;
        }

        return response()->json(['message' => ucfirst($itemLabel).' deleted successfully']);
    }
}
