<?php

namespace App\Support;

/**
 * When a student has multiple evaluation rows for the same subject
 * (fail then OFFSEM/retake import), decide which grade the curriculum UI shows.
 */
final class EvaluationAttemptPicker
{
    /**
     * @param  iterable<int, object>  $attempts  Evaluation-like objects with
     *                                          evaluation_status, academic_year_id,
     *                                          semester_id, evaluation_id
     * @param  array<int, int>  $academicYearStartById  academic_year_id => start calendar year
     */
    public static function prefer(iterable $attempts, array $academicYearStartById = []): mixed
    {
        $list = [];
        foreach ($attempts as $attempt) {
            if ($attempt !== null) {
                $list[] = $attempt;
            }
        }
        if ($list === []) {
            return null;
        }

        usort($list, static function ($a, $b) use ($academicYearStartById) {
            $rank = self::statusRank($b) <=> self::statusRank($a);
            if ($rank !== 0) {
                return $rank;
            }

            $ayA = self::academicYearSortKey($a, $academicYearStartById);
            $ayB = self::academicYearSortKey($b, $academicYearStartById);
            if ($ayA !== $ayB) {
                return $ayB <=> $ayA;
            }

            $sem = ((int) ($b->semester_id ?? 0)) <=> ((int) ($a->semester_id ?? 0));
            if ($sem !== 0) {
                return $sem;
            }

            return ((int) ($b->evaluation_id ?? 0)) <=> ((int) ($a->evaluation_id ?? 0));
        });

        return $list[0];
    }

    private static function statusRank(object $evaluation): int
    {
        $status = strtolower(trim((string) ($evaluation->evaluation_status ?? '')));
        if (in_array($status, ['passed', 'complete', 'credited'], true)) {
            return 3;
        }
        if (in_array($status, ['failed', 'dropped'], true)) {
            return 1;
        }

        return 2;
    }

    /**
     * @param  array<int, int>  $academicYearStartById
     */
    private static function academicYearSortKey(object $evaluation, array $academicYearStartById): int
    {
        $ayId = (int) ($evaluation->academic_year_id ?? 0);
        if ($ayId > 0 && isset($academicYearStartById[$ayId])) {
            return (int) $academicYearStartById[$ayId];
        }

        // Fallback when AY map missing: higher id is usually a later-created year row.
        return $ayId;
    }
}
