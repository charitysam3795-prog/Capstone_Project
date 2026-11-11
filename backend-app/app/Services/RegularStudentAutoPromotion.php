<?php

namespace App\Services;

use App\Models\AcademicRecordEvaluationComplete;
use App\Models\Evaluation;
use App\Models\StudentProfile;
use App\Support\CachedSchema;
use App\Support\HeavyRequest;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

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
     * Uses lightweight term/grade checks — does not call buildPayload() per student.
     *
     * @return array{promoted: int, skipped_irregular: int, skipped_incomplete: int, unchanged: int}
     */
    public function advanceOnSemesterActivation(int $activatedSemesterId, ?int $actorUserId = null): array
    {
        $this->raiseResourceLimits();

        $stats = $this->emptyStats();
        $termCache = [];

        $query = StudentProfile::query();
        if (CachedSchema::hasColumn('tbl_student_profile', 'is_simulation')) {
            $query->where(function ($q) {
                $q->where('is_simulation', false)->orWhereNull('is_simulation');
            });
        }

        AuditTrailService::suppress();
        try {
            $query->orderBy('student_id')->chunkById(HeavyRequest::STUDENT_CHUNK, function ($profiles) use (
                $activatedSemesterId,
                $actorUserId,
                &$stats,
                &$termCache
            ) {
                $this->processChunk($profiles, $activatedSemesterId, $actorUserId, $stats, $termCache);
            }, 'student_id');
        } catch (\Throwable $e) {
            Log::error('RegularStudentAutoPromotion failed during semester activation', [
                'activated_semester_id' => $activatedSemesterId,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        } finally {
            AuditTrailService::resume();
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
     * @param  \Illuminate\Support\Collection<int, StudentProfile>  $profiles
     * @param  array{promoted: int, skipped_irregular: int, skipped_incomplete: int, unchanged: int}  $stats
     * @param  array<string, list<array{year_level_id: int, semester_id: int, semester_name?: string|null}>>  $termCache
     */
    private function processChunk(
        $profiles,
        int $activatedSemesterId,
        ?int $actorUserId,
        array &$stats,
        array &$termCache
    ): void {
        /** @var list<array{profile: StudentProfile, current: array{year_level_id: int, semester_id: int}, next: array{year_level_id: int, semester_id: int}}> $candidates */
        $candidates = [];

        foreach ($profiles as $profile) {
            $status = strtolower(trim((string) ($profile->academic_status ?? '')));
            if ($status === 'irregular') {
                $stats['skipped_irregular']++;
                continue;
            }

            $programId = (int) ($profile->current_program ?? 0);
            if ($programId <= 0) {
                $stats['unchanged']++;
                continue;
            }

            $header = $this->builder->resolveCurriculumHeaderForStudent($profile);
            $headerId = $header?->curriculum_header_id !== null
                ? (int) $header->curriculum_header_id
                : null;
            $cacheKey = $programId.'-'.($headerId ?? 0);

            if (! isset($termCache[$cacheKey])) {
                $termCache[$cacheKey] = $this->builder->orderedCurriculumTermsForProgram($programId, $headerId);
            }
            $terms = $termCache[$cacheKey];
            if ($terms === []) {
                $stats['unchanged']++;
                continue;
            }

            $idx = $this->standingTermIndex($profile, $terms);
            $current = $terms[$idx];
            if (! isset($terms[$idx + 1])) {
                $stats['unchanged']++;
                continue;
            }
            $next = $terms[$idx + 1];
            if ((int) $next['semester_id'] !== (int) $activatedSemesterId) {
                $stats['unchanged']++;
                continue;
            }

            $candidates[] = [
                'profile' => $profile,
                'current' => $current,
                'next' => $next,
            ];
        }

        if ($candidates === []) {
            return;
        }

        $studentIds = array_map(
            static fn (array $c) => (int) $c['profile']->student_id,
            $candidates
        );

        $evaluationsByStudent = Evaluation::query()
            ->whereIn('student_id', $studentIds)
            ->get([
                'evaluation_id',
                'student_id',
                'subject_id',
                'grade',
                'evaluation_status',
                'academic_year_id',
                'semester_id',
            ])
            ->groupBy('student_id');

        $transferByStudent = $this->transferCreditsForStudents($studentIds);

        foreach ($candidates as $candidate) {
            /** @var StudentProfile $profile */
            $profile = $candidate['profile'];
            $studentId = (int) $profile->student_id;
            /** @var Collection<int, Evaluation> $evals */
            $evals = $evaluationsByStudent->get($studentId, collect());
            $credits = $transferByStudent[$studentId] ?? collect();

            $passed = $this->builder->isTermFullyPassedForStudent(
                $profile,
                (int) $candidate['current']['year_level_id'],
                (int) $candidate['current']['semester_id'],
                $evals,
                $credits
            );

            if (! $passed) {
                $stats['skipped_incomplete']++;
                continue;
            }

            $stats[$this->applyStanding(
                $profile,
                (int) $candidate['next']['year_level_id'],
                (int) $candidate['next']['semester_id'],
                $actorUserId
            )]++;
        }
    }

    /**
     * @param  list<int>  $studentIds
     * @return array<int, \Illuminate\Support\Collection<int, mixed>>
     */
    private function transferCreditsForStudents(array $studentIds): array
    {
        if ($studentIds === []) {
            return [];
        }

        $rows = DB::table('tbl_credit_evaluation_details as d')
            ->join('tbl_credit_evaluation as e', 'd.credit_eval_id', '=', 'e.credit_eval_id')
            ->where(function ($q) use ($studentIds) {
                $q->whereIn('e.student_id', $studentIds)
                    ->orWhereIn('d.student_id', $studentIds);
            })
            ->where('e.is_active', true)
            ->whereNotNull('d.subject_id')
            ->whereRaw('LOWER(TRIM(e.status)) = ?', ['approved'])
            ->get(['e.student_id as eval_student_id', 'd.student_id as detail_student_id', 'd.subject_id']);

        $map = [];
        foreach ($rows as $row) {
            $sid = (int) ($row->eval_student_id ?: $row->detail_student_id);
            if ($sid <= 0) {
                continue;
            }
            $map[$sid] ??= collect();
            $map[$sid]->push((int) $row->subject_id);
        }

        foreach ($map as $sid => $collection) {
            $map[$sid] = $collection->unique()->values();
        }

        return $map;
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

    private function raiseResourceLimits(): void
    {
        HeavyRequest::forBatch();
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
