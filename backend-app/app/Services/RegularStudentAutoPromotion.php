<?php

namespace App\Services;

use App\Models\AcademicRecordEvaluationComplete;
use App\Models\StudentProfile;
use App\Support\CachedSchema;

/**
 * Regular students with a fully passed current-term load advance automatically.
 * Irregular students stay on their standing for manual promotion (failed subjects / prereqs).
 */
class RegularStudentAutoPromotion
{
    public function __construct(
        private StudentCurriculumEvaluationBuilder $builder
    ) {
    }

    /**
     * When a lookup semester is activated: Regulars whose current term is fully passed
     * and whose next curriculum term is that semester are promoted. Irregulars are not moved.
     *
     * @return array{promoted: int, skipped_irregular: int, skipped_incomplete: int, unchanged: int}
     */
    public function advanceOnSemesterActivation(int $activatedSemesterId, ?int $actorUserId = null): array
    {
        $stats = $this->emptyStats();
        $query = StudentProfile::query()->with(['program', 'track']);
        if (CachedSchema::hasColumn('tbl_student_profile', 'is_simulation')) {
            $query->where(function ($q) {
                $q->where('is_simulation', false)->orWhereNull('is_simulation');
            });
        }

        foreach ($query->get() as $profile) {
            $stats[$this->promoteOneStepToSemester($profile, $activatedSemesterId, $actorUserId)]++;
        }

        return $stats;
    }

    public function formatSummary(array $stats): string
    {
        $promoted = (int) ($stats['promoted'] ?? 0);
        $irregular = (int) ($stats['skipped_irregular'] ?? 0);
        $parts = [sprintf('Auto-promoted %d regular student(s) with complete units.', $promoted)];
        if ($irregular > 0) {
            $parts[] = sprintf('%d irregular student(s) were left for manual promotion.', $irregular);
        }

        return implode(' ', $parts);
    }

    /**
     * Fast read-only buckets for Dean analytics (no full curriculum rebuild).
     *
     * @return array{is_irregular: bool, auto_evaluated: bool, auto_promoted: bool, incomplete: bool}
     */
    public function classifyForAnalytics(StudentProfile $profile): array
    {
        $status = strtolower(trim((string) ($profile->academic_status ?? '')));
        $isIrregular = $status === 'irregular';
        $autoPromoted = ! $isIrregular && ! empty($profile->promoted_next_sem_at);

        return [
            'is_irregular' => $isIrregular,
            'auto_evaluated' => $autoPromoted,
            'auto_promoted' => $autoPromoted,
            'incomplete' => ! $isIrregular && ! $autoPromoted,
        ];
    }

    /**
     * @return 'promoted'|'skipped_irregular'|'skipped_incomplete'|'unchanged'
     */
    private function promoteOneStepToSemester(
        StudentProfile $profile,
        int $activatedSemesterId,
        ?int $actorUserId
    ): string {
        $built = $this->builder->buildPayload($profile);
        $this->builder->syncStudentProfileFromCurriculumProgress($profile, $built);
        $profile->refresh();

        $status = strtolower(trim((string) ($built['computed_academic_status'] ?? $profile->academic_status ?? '')));
        if ($status === 'irregular') {
            return 'skipped_irregular';
        }

        $rows = $built['rows'] ?? [];
        $terms = $this->orderedDistinctTermKeys($rows);
        if ($terms === []) {
            return 'unchanged';
        }

        $idx = $this->standingTermIndex($profile, $terms);
        $current = $terms[$idx];
        if (! $this->termFullyPassed($rows, $current['year_level_id'], $current['semester_id'])) {
            return 'skipped_incomplete';
        }
        if (! isset($terms[$idx + 1])) {
            return 'unchanged';
        }
        $next = $terms[$idx + 1];
        if ((int) $next['semester_id'] !== (int) $activatedSemesterId) {
            return 'unchanged';
        }

        return $this->applyStanding($profile, (int) $next['year_level_id'], (int) $next['semester_id'], $actorUserId);
    }

    /**
     * @param  list<array{year_level_id: int, semester_id: int}>  $terms
     */
    private function standingTermIndex(StudentProfile $profile, array $terms): int
    {
        $y = $profile->year_level_id !== null ? (int) $profile->year_level_id : null;
        $s = $profile->semester_id !== null ? (int) $profile->semester_id : null;
        if ($y === null || $s === null) {
            return 0;
        }
        foreach ($terms as $i => $term) {
            if ((int) $term['year_level_id'] === $y && (int) $term['semester_id'] === $s) {
                return $i;
            }
        }

        return 0;
    }

    /**
     * @return 'promoted'|'unchanged'
     */
    private function applyStanding(StudentProfile $profile, int $newY, int $newS, ?int $actorUserId): string
    {
        $oldY = $profile->year_level_id !== null ? (int) $profile->year_level_id : null;
        $oldS = $profile->semester_id !== null ? (int) $profile->semester_id : null;
        if ($oldY === $newY && $oldS === $newS) {
            return 'unchanged';
        }

        $header = $this->builder->resolveCurriculumHeaderForStudent($profile);
        if ($header && $header->academic_year_id) {
            $profile->academic_year_id = (int) $header->academic_year_id;
        }

        $profile->year_level_id = $newY;
        $profile->semester_id = $newS;
        $profile->promotion_target_year_level_id = $newY;
        $profile->promotion_target_semester_id = $newS;
        $profile->promoted_next_sem_at = now();
        $profile->promoted_next_sem_by = $actorUserId ?: $profile->promoted_next_sem_by;
        $profile->standing_term_load = null;
        $profile->standing_deferred_keys = [];
        $profile->save();

        // Mark as evaluated so Curriculum Evaluation "Unevaluated" no longer lists them.
        $alreadyLogged = AcademicRecordEvaluationComplete::query()
            ->where('student_id', $profile->student_id)
            ->where('notes', 'like', sprintf(
                '%%Auto-promoted on semester activation — target year level %d, semester %d%%',
                $newY,
                $newS
            ))
            ->exists();
        if (! $alreadyLogged) {
            AcademicRecordEvaluationComplete::create([
                'student_id' => $profile->student_id,
                'completed_at' => now(),
                'completed_by' => $actorUserId,
                'notes' => sprintf(
                    'Auto-promoted on semester activation — target year level %d, semester %d.',
                    $newY,
                    $newS
                ),
            ] + AcademicRecordEvaluationComplete::currentTermAttributes());
        }

        return 'promoted';
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     */
    private function termFullyPassed(array $rows, int $yearLevelId, int $semesterId): bool
    {
        $termRows = array_values(array_filter($rows, function ($row) use ($yearLevelId, $semesterId) {
            return (int) ($row['year_level_id'] ?? 0) === $yearLevelId
                && (int) ($row['semester_id'] ?? 0) === $semesterId;
        }));

        if ($termRows === []) {
            return false;
        }

        foreach ($termRows as $row) {
            if (! empty($row['elective_pending'])) {
                return false;
            }
            if (! $this->builder->curriculumRowIndicatesPassed($row)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return list<array{year_level_id: int, semester_id: int, semester_name?: string|null}>
     */
    private function orderedDistinctTermKeys(array $rows): array
    {
        $seen = [];
        $out = [];
        foreach ($rows as $row) {
            $y = $row['year_level_id'] ?? null;
            $s = $row['semester_id'] ?? null;
            if ($y === null || $y === '' || $s === null || $s === '') {
                continue;
            }
            $y = (int) $y;
            $s = (int) $s;
            $k = $y.'-'.$s;
            if (isset($seen[$k])) {
                continue;
            }
            $seen[$k] = true;
            $out[] = [
                'year_level_id' => $y,
                'semester_id' => $s,
                'semester_name' => $row['semester_name'] ?? null,
            ];
        }
        usort($out, function ($a, $b) {
            if ($a['year_level_id'] !== $b['year_level_id']) {
                return $a['year_level_id'] <=> $b['year_level_id'];
            }

            return $this->semesterSortValue($a['semester_id'], $a['semester_name'] ?? null)
                <=> $this->semesterSortValue($b['semester_id'], $b['semester_name'] ?? null);
        });

        return $out;
    }

    private function semesterSortValue(int $semesterId, ?string $semesterName = null): int
    {
        $name = strtolower(trim((string) $semesterName));
        if (str_contains($name, 'summer') || $semesterId === 3) {
            return 0;
        }

        return $semesterId;
    }

    /**
     * @return array{promoted: int, skipped_irregular: int, skipped_incomplete: int, unchanged: int}
     */
    private function emptyStats(): array
    {
        return [
            'promoted' => 0,
            'skipped_irregular' => 0,
            'skipped_incomplete' => 0,
            'unchanged' => 0,
        ];
    }
}
