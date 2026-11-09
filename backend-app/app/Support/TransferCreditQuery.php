<?php

namespace App\Support;

use App\Models\CreditEvaluationDetail;
use Illuminate\Database\Eloquent\Builder;

/**
 * Shared filters for student transfer intake vs global OSS catalog.
 */
final class TransferCreditQuery
{
    public static function approvedActiveEvaluation(Builder $query): Builder
    {
        return $query->whereHas('creditEvaluation', function ($q) {
            $q->where('is_active', true)
                ->whereRaw('LOWER(TRIM(status)) = ?', ['approved']);
        });
    }

    /**
     * Credit lines this student may pick when applying transfer credit:
     * - linked to the student on the detail or parent evaluation
     * - OR unlinked Student information intake (no roster student on eval/detail yet)
     */
    public static function scopePickableForStudent(Builder $query, int $studentId): Builder
    {
        return $query->where(function ($q) use ($studentId) {
            $q->where('student_id', $studentId)
                ->orWhereHas('creditEvaluation', fn ($e) => $e->where('student_id', $studentId))
                ->orWhere(function ($q2) {
                    $q2->whereNull('student_id')
                        ->whereHas('creditEvaluation', fn ($e) => $e->whereNull('student_id'));
                });
        });
    }

    /** @return list<int> */
    public static function pickableOtherSubjectIdsForStudent(int $studentId): array
    {
        $query = CreditEvaluationDetail::query()->whereNotNull('other_subject_id');
        $query = self::approvedActiveEvaluation($query);
        $query = self::scopePickableForStudent($query, $studentId);

        return $query->distinct()
            ->pluck('other_subject_id')
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values()
            ->all();
    }

    public static function pickableDetailExists(int $studentId, int $otherSubjectId): bool
    {
        $query = CreditEvaluationDetail::query()->where('other_subject_id', $otherSubjectId);
        $query = self::approvedActiveEvaluation($query);
        $query = self::scopePickableForStudent($query, $studentId);

        return $query->exists();
    }
}
