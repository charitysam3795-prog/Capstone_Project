<?php

namespace App\Support;

use App\Models\StudentProfile;

/**
 * Standing rules shared by the Student evaluation list and Dean analytics,
 * so both screens always count the same students the same way.
 */
final class EvaluationStanding
{
    /** Year level the student is evaluated under (promotion target first). */
    public static function effectiveYearLevelId(StudentProfile $profile): ?int
    {
        $target = $profile->promotion_target_year_level_id ?? null;
        if ($target !== null && $target !== '') {
            return (int) $target;
        }

        return $profile->year_level_id !== null ? (int) $profile->year_level_id : null;
    }

    public static function isIrregular(StudentProfile $profile): bool
    {
        return strtolower(trim((string) ($profile->academic_status ?? ''))) === 'irregular';
    }

    /** Staff Complete / manual promote — not auto-promote or Regular-era "Semester promotion" leftovers. */
    public static function isManualCompletionNote(?string $notes): bool
    {
        $notes = (string) $notes;
        if (str_contains($notes, 'Irregular manual promotion') || trim($notes) === '') {
            return true;
        }

        return ! str_contains($notes, 'Auto-promoted on semester activation')
            && ! str_contains($notes, 'Semester promotion');
    }

    /**
     * Irregulars count as evaluated only after a manual promote / Complete.
     * Regulars count after any completion log or an auto-promotion.
     *
     * @param  iterable<string|null>  $completionNotes
     * @return 'manual'|'auto'|null
     */
    public static function evaluatedState(bool $irregular, iterable $completionNotes, mixed $promotedNextSemAt): ?string
    {
        $hasAny = false;
        $hasManual = false;
        foreach ($completionNotes as $notes) {
            $hasAny = true;
            $hasManual = $hasManual || self::isManualCompletionNote($notes);
        }

        if ($irregular) {
            return $hasManual ? 'manual' : null;
        }
        if ($hasManual) {
            return 'manual';
        }

        return $hasAny || ! empty($promotedNextSemAt) ? 'auto' : null;
    }
}
