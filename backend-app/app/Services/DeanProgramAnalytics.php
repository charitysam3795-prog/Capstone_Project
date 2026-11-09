<?php

namespace App\Services;

use App\Models\AcademicRecordEvaluationComplete;
use App\Models\AcademicYear;
use App\Models\Curriculum;
use App\Models\Evaluation;
use App\Models\Program;
use App\Models\Semester;
use App\Models\StudentProfile;
use App\Models\Subject;
use App\Models\YearLevel;
use App\Support\CachedSchema;
use App\Support\EvaluationAttemptPicker;
use App\Support\EvaluationStanding;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Dean analytics for one program and one term (school year + optional semester + optional year level).
 *
 * Who belongs to a past term comes from the grades recorded in that term (tbl_evaluation);
 * the current term also counts every current student by their standing. A student's year level
 * in a past term is the curriculum year of most subjects they took that term.
 * Pass / attempt / transfer-credit / Regular-Irregular rules match the evaluation screen.
 */
class DeanProgramAnalytics
{
    private const GRADE_BUCKETS = ['1.00', '1.25', '1.50', '1.75', '2.00', '2.25', '2.50', '2.75', '3.00', '5.00', 'INC', 'DRP'];

    private const TREND_YEARS = 6;

    private const LIST_LIMIT = 100;

    /** @var array<string, array{rows: list<array<string, mixed>>, subject_years: array<int, int>, subjects: array<int, array>}> */
    private array $templates = [];

    public function __construct(
        private readonly StudentCurriculumEvaluationBuilder $builder,
        private readonly GradeScaleHelper $grades,
    ) {
    }

    /**
     * @param  int  $ayId  school year (0 = current)
     * @param  int|null  $semId  semester (0 = whole school year, null = current semester when the year is current)
     * @param  int  $yearFilter  year level (0 = all)
     * @param  list<int>|null  $allowedYears  user's evaluation year scope (null = all), same as the Student list
     */
    public function build(Program $program, int $ayId, ?int $semId, int $yearFilter, ?array $allowedYears = null): array
    {
        $inScope = static fn (int $y): bool => $allowedYears === null || in_array($y, $allowedYears, true);
        $programId = (int) $program->program_id;
        $this->templates = [];

        $academicYears = AcademicYear::forAnalyticsFilters();
        $activeAyId = AcademicYear::resolveCurrentId($academicYears);
        $semesters = Semester::query()->orderBy('semester_id')->get(['semester_id', 'semester_name', 'status']);
        $activeSemId = (int) ($semesters->first(fn ($s) => strtolower(trim((string) $s->status)) === 'active')?->semester_id ?? 0);

        $ayId = $ayId > 0 ? $ayId : $activeAyId;
        if ($semId === null) {
            $semId = $ayId === $activeAyId ? $activeSemId : 0;
        }
        $isCurrentTerm = $ayId === $activeAyId && ($semId === 0 || $semId === $activeSemId);

        $ayStart = $this->academicYearStartMap();
        $yearLabels = YearLevel::query()->orderBy('year_level_id')->pluck('year_level', 'year_level_id')
            ->map(static fn ($l) => (string) $l)->all();

        $students = $this->studentsForProgram($programId);
        $studentIds = $students->pluck('student_id')->map(static fn ($id) => (int) $id)->all();
        $attemptsByStudent = $this->evaluationsByStudent($studentIds);
        $creditsByStudent = $this->transferCreditsByStudent($studentIds);
        $completionsByStudent = $this->completionsByStudent($studentIds, $activeAyId, $activeSemId);

        $upperKey = $semId > 0 ? $this->termKey($ayStart, $ayId, $semId) : (($ayStart[$ayId] ?? 0) * 10 + 9);
        $activeStart = $ayStart[$activeAyId] ?? 0;

        $population = [];
        $evaluation = [];
        $status = [];
        $subjectStats = [];
        $gradeCounts = array_fill_keys(self::GRADE_BUCKETS, 0);
        $trendIds = $academicYears->sortBy(fn ($y) => $y->startYear())->pluck('academic_year_id')
            ->map(static fn ($id) => (int) $id)->take(-self::TREND_YEARS)->values()->all();
        $trend = array_fill_keys($trendIds, []);
        $failedStudents = [];

        foreach ($students as $profile) {
            $sid = (int) $profile->student_id;
            $header = $this->builder->resolveCurriculumHeaderForStudent($profile);
            $template = $this->curriculumTemplate($programId, $header?->curriculum_header_id);
            $attempts = $attemptsByStudent[$sid] ?? [];
            $profileYear = (int) (EvaluationStanding::effectiveYearLevelId($profile) ?? 0);

            foreach ($trendIds as $tAy) {
                $rows = array_filter($attempts, static fn ($a) => (int) $a->academic_year_id === $tAy);
                if ($rows === [] && $tAy !== $activeAyId) {
                    continue;
                }
                $y = $tAy === $activeAyId
                    ? $profileYear
                    : $this->yearInTerm($rows, $template, $profileYear, $activeStart - ($ayStart[$tAy] ?? $activeStart));
                if ($y > 0 && $inScope($y) && (! $yearFilter || $y === $yearFilter)) {
                    $trend[$tAy][$y] = ($trend[$tAy][$y] ?? 0) + 1;
                }
            }

            $termAttempts = array_values(array_filter(
                $attempts,
                static fn ($a) => (int) $a->academic_year_id === $ayId && ($semId === 0 || (int) $a->semester_id === $semId)
            ));
            if ($termAttempts === [] && ! $isCurrentTerm) {
                continue;
            }
            $year = $isCurrentTerm
                ? $profileYear
                : $this->yearInTerm($termAttempts, $template, $profileYear, $activeStart - ($ayStart[$ayId] ?? $activeStart));
            if ($year <= 0 || ! $inScope($year) || ($yearFilter && $year !== $yearFilter)) {
                continue;
            }

            $population[$year] = ($population[$year] ?? 0) + 1;

            $asOf = array_filter(
                $attempts,
                fn ($a) => $a->academic_year_id === null || $this->termKey($ayStart, (int) $a->academic_year_id, (int) $a->semester_id) <= $upperKey
            );
            $classified = $this->classify($template, $asOf, $creditsByStudent[$sid] ?? [], $ayStart);
            $completions = $completionsByStudent[$sid] ?? [];

            // Current term: the saved standing the Student evaluation list filters on.
            // Past terms: rebuilt from the grades and completions recorded in that term.
            if ($isCurrentTerm) {
                $classified['status'] = EvaluationStanding::isIrregular($profile) ? 'Irregular' : 'Regular';
                $evaluated = EvaluationStanding::evaluatedState(
                    $classified['status'] === 'Irregular',
                    array_column($completions, 'notes'),
                    $profile->promoted_next_sem_at
                );
            } else {
                $evaluated = null;
                foreach ($completions as $c) {
                    if ($c['ay'] === $ayId && ($semId === 0 || $c['sem'] === $semId)) {
                        $evaluated = $evaluated === 'manual' || ! $c['auto'] ? 'manual' : 'auto';
                    }
                }
            }
            $evaluation[$year][$evaluated ?? 'unevaluated'] = ($evaluation[$year][$evaluated ?? 'unevaluated'] ?? 0) + 1;

            if ($classified['status'] === 'Irregular') {
                $reason = $classified['failed'] ? 'failed_subject' : 'sequence_gap';
                $status[$year]['irregular'] = ($status[$year]['irregular'] ?? 0) + 1;
                $status[$year][$reason] = ($status[$year][$reason] ?? 0) + 1;
            } else {
                $status[$year]['regular'] = ($status[$year]['regular'] ?? 0) + 1;
            }

            $bySubject = [];
            foreach ($termAttempts as $a) {
                if ($a->subject_id !== null) {
                    $bySubject[(int) $a->subject_id][] = $a;
                }
            }
            $studentFailed = 0;
            foreach ($bySubject as $subjectId => $list) {
                $best = EvaluationAttemptPicker::prefer($list, $ayStart);
                $st = strtolower(trim((string) ($best->evaluation_status ?? '')));
                if (in_array($st, ['credit', 'credited'], true)) {
                    continue;
                }
                $passing = $template['passing'][$subjectId] ?? null;
                $outcome = $this->outcome($best, $passing);
                if (! in_array($outcome, ['passed', 'failed', 'inc', 'dropped'], true)) {
                    continue;
                }
                $s = &$subjectStats[$subjectId];
                $s ??= ['enrolled' => 0, 'passed' => 0, 'failed' => 0, 'inc' => 0, 'dropped' => 0, 'grade_sum' => 0.0, 'grade_n' => 0, 'students' => []];
                $s['enrolled']++;
                $s[$outcome]++;
                $sis = $this->sisGrade($best->grade, $passing);
                if ($sis !== null) {
                    $s['grade_sum'] += $sis;
                    $s['grade_n']++;
                }
                if ($outcome !== 'passed' && count($s['students']) < self::LIST_LIMIT) {
                    $s['students'][] = $this->studentSummary($profile, $year) + [
                        'outcome' => $outcome,
                        'grade' => $this->grades->cleanGrade($best->grade),
                    ];
                }
                unset($s);
                $gradeCounts[$this->gradeBucket($outcome, $sis)]++;
                if ($outcome !== 'passed') {
                    $studentFailed++;
                }
            }
            if ($studentFailed > 0) {
                $failedStudents[] = $this->studentSummary($profile, $year) + [
                    'not_passed' => $studentFailed,
                    'status' => $classified['status'],
                ];
            }
        }

        $years = $this->yearBuckets($population, $yearLabels, $yearFilter);
        $subjects = $this->subjectRows($subjectStats);
        usort($failedStudents, static fn ($a, $b) => $b['not_passed'] <=> $a['not_passed']);

        $ayName = fn (int $id) => (string) ($academicYears->firstWhere('academic_year_id', $id)?->academic_year_name ?? "AY #{$id}");
        $semName = fn (int $id) => (string) ($semesters->firstWhere('semester_id', $id)?->semester_name ?? '');
        $termLabel = $ayName($ayId).($semId > 0 ? ' · '.$semName($semId) : ' · whole school year');

        $result = [
            'filters' => [
                'academic_years' => $academicYears->map(fn ($y) => [
                    'academic_year_id' => (int) $y->academic_year_id,
                    'academic_year_name' => $y->academic_year_name,
                    'is_active' => (int) $y->academic_year_id === $activeAyId,
                ])->values()->all(),
                'semesters' => $semesters->map(fn ($s) => [
                    'semester_id' => (int) $s->semester_id,
                    'semester_name' => $s->semester_name,
                    'is_active' => (int) $s->semester_id === $activeSemId,
                ])->values()->all(),
                'year_levels' => array_map(
                    static fn ($id) => ['year_level_id' => $id, 'label' => $yearLabels[$id] ?? "Year {$id}"],
                    $this->sortedYearIds(array_keys($population))
                ),
                'selected' => ['academic_year_id' => $ayId, 'semester_id' => $semId, 'year_level_id' => $yearFilter],
                'active' => ['academic_year_id' => $activeAyId, 'semester_id' => $activeSemId],
                'is_current_term' => $isCurrentTerm,
                'term_label' => $termLabel,
            ],
            'generated_at' => now()->toIso8601String(),
            'population_by_year' => array_map(fn ($y) => $y + ['count' => $population[$y['year_level_id']] ?? 0], $years),
            'evaluation_by_year' => array_map(fn ($y) => $y + [
                'evaluated_manual' => $evaluation[$y['year_level_id']]['manual'] ?? 0,
                'evaluated_auto' => $evaluation[$y['year_level_id']]['auto'] ?? 0,
                'unevaluated' => $evaluation[$y['year_level_id']]['unevaluated'] ?? 0,
            ], $years),
            'status_by_year' => array_map(fn ($y) => $y + [
                'regular' => $status[$y['year_level_id']]['regular'] ?? 0,
                'irregular' => $status[$y['year_level_id']]['irregular'] ?? 0,
                'failed_subject' => $status[$y['year_level_id']]['failed_subject'] ?? 0,
                'sequence_gap' => $status[$y['year_level_id']]['sequence_gap'] ?? 0,
            ], $years),
            'subject_performance' => $subjects,
            'grade_distribution' => array_map(
                static fn ($label) => ['label' => $label, 'count' => $gradeCounts[$label]],
                self::GRADE_BUCKETS
            ),
            'students_not_passing' => array_slice($failedStudents, 0, self::LIST_LIMIT),
            'trend' => array_map(fn ($tAy) => ['academic_year_id' => $tAy, 'label' => $ayName($tAy)]
                + $this->trendRow($trend[$tAy], $years), $trendIds),
        ];
        $result['kpis'] = $this->kpis($result, $ayId, $trendIds);
        $result['insights'] = $this->insights($result);

        return $result;
    }

    // ---------------------------------------------------------------------
    // Data loading
    // ---------------------------------------------------------------------

    /** @return Collection<int, StudentProfile> */
    private function studentsForProgram(int $programId): Collection
    {
        $query = StudentProfile::query()->where(function ($q) use ($programId) {
            $q->where('Current_Program', $programId)->orWhere('current_program', $programId);
        });
        if (CachedSchema::hasColumn('tbl_student_profile', 'is_simulation')) {
            $query->where(function ($q) {
                $q->where('is_simulation', false)->orWhereNull('is_simulation');
            });
        }

        return $query->orderBy('student_id')->get();
    }

    /**
     * @param  list<int>  $studentIds
     * @return array<int, list<Evaluation>>
     */
    private function evaluationsByStudent(array $studentIds): array
    {
        $out = [];
        foreach (array_chunk($studentIds, 800) as $chunk) {
            $rows = Evaluation::query()
                ->whereIn('student_id', $chunk)
                ->get(['evaluation_id', 'student_id', 'subject_id', 'grade', 'evaluation_status', 'academic_year_id', 'semester_id']);
            foreach ($rows as $row) {
                if ($row->subject_id !== null) {
                    $out[(int) $row->student_id][] = $row;
                }
            }
        }

        return $out;
    }

    /**
     * Approved, active transfer credits (same rule as the evaluation builder).
     *
     * @param  list<int>  $studentIds
     * @return array<int, array<int, true>>
     */
    private function transferCreditsByStudent(array $studentIds): array
    {
        $out = [];
        $idSet = array_fill_keys($studentIds, true);
        foreach (array_chunk($studentIds, 800) as $chunk) {
            $rows = DB::table('tbl_credit_evaluation_details as d')
                ->join('tbl_credit_evaluation as e', 'd.credit_eval_id', '=', 'e.credit_eval_id')
                ->where(function ($q) use ($chunk) {
                    $q->whereIn('e.student_id', $chunk)->orWhereIn('d.student_id', $chunk);
                })
                ->where('e.is_active', true)
                ->whereNotNull('d.subject_id')
                ->whereRaw('LOWER(TRIM(e.status)) = ?', ['approved'])
                ->get(['e.student_id as e_student_id', 'd.student_id as d_student_id', 'd.subject_id']);
            foreach ($rows as $row) {
                foreach ([$row->e_student_id, $row->d_student_id] as $owner) {
                    if ($owner !== null && isset($idSet[(int) $owner])) {
                        $out[(int) $owner][(int) $row->subject_id] = true;
                    }
                }
            }
        }

        return $out;
    }

    /**
     * "Academic record evaluated" marks with their term. Marks saved before terms were recorded
     * count for the current term.
     *
     * @param  list<int>  $studentIds
     * @return array<int, list<array{ay: int, sem: int, auto: bool}>>
     */
    private function completionsByStudent(array $studentIds, int $activeAyId, int $activeSemId): array
    {
        $table = 'tbl_academic_record_evaluation_complete';
        $hasTerm = CachedSchema::hasColumn($table, 'academic_year_id');
        $columns = ['student_id', 'notes'];
        if ($hasTerm) {
            $columns[] = 'academic_year_id';
            $columns[] = 'semester_id';
        }
        $out = [];
        foreach (array_chunk($studentIds, 800) as $chunk) {
            foreach (AcademicRecordEvaluationComplete::query()->whereIn('student_id', $chunk)->get($columns) as $c) {
                $out[(int) $c->student_id][] = [
                    'ay' => (int) ($hasTerm && $c->academic_year_id ? $c->academic_year_id : $activeAyId),
                    'sem' => (int) ($hasTerm && $c->semester_id ? $c->semester_id : $activeSemId),
                    'auto' => ! EvaluationStanding::isManualCompletionNote($c->notes),
                    'notes' => $c->notes,
                ];
            }
        }

        return $out;
    }

    /** @return array<int, int> academic_year_id => start calendar year */
    private function academicYearStartMap(): array
    {
        $map = [];
        foreach (DB::table('tbl_academic_year')->get(['academic_year_id', 'academic_year_name']) as $row) {
            $range = AcademicYear::parseYearRange((string) ($row->academic_year_name ?? ''));
            $map[(int) $row->academic_year_id] = $range[0] ?? (int) $row->academic_year_id;
        }

        return $map;
    }

    /**
     * Curriculum rows for one program / curriculum version, plus subject → curriculum year lookups.
     *
     * @return array{rows: list<array<string, mixed>>, subject_years: array<int, int>, subjects: array<int, array>, passing: array<int, mixed>}
     */
    private function curriculumTemplate(int $programId, ?int $headerId): array
    {
        $cacheKey = $programId.':'.($headerId ?? 0);
        if (isset($this->templates[$cacheKey])) {
            return $this->templates[$cacheKey];
        }

        $query = Curriculum::query()
            ->where('program_id', $programId)
            ->with(['subject', 'electiveSlot.electiveSubjects.subject']);
        if ($headerId) {
            $query->where('curriculum_header_id', $headerId);
        }
        $items = $query
            ->orderBy('year_level')
            ->orderByRaw('CASE WHEN semester_id = 3 THEN 0 ELSE semester_id END')
            ->orderBy('curriculum_id')
            ->get();

        $rows = [];
        $subjectYears = [];
        $subjects = [];
        $passing = [];
        foreach ($items as $item) {
            $year = (int) ($item->year_level ?? 0);
            $row = [
                'year' => $year,
                'passing_grade' => $item->passing_grade,
                'subject_id' => null,
                'choices' => [],
            ];
            if ($item->subject) {
                $id = (int) $item->subject->subject_id;
                $row['subject_id'] = $id;
                $subjects[$id] = $this->subjectMeta($item->subject, $year);
                $subjectYears[$id] ??= $year;
                $passing[$id] ??= $item->passing_grade;
            } elseif ($item->electiveSlot) {
                foreach ($item->electiveSlot->electiveSubjects ?? [] as $es) {
                    if ($es->subject) {
                        $id = (int) $es->subject->subject_id;
                        $row['choices'][] = $id;
                        $subjects[$id] ??= $this->subjectMeta($es->subject, $year);
                        $subjectYears[$id] ??= $year;
                        $passing[$id] ??= $item->passing_grade;
                    }
                }
            }
            $rows[] = $row;
        }

        return $this->templates[$cacheKey] = [
            'rows' => $rows,
            'subject_years' => $subjectYears,
            'subjects' => $subjects,
            'passing' => $passing,
        ];
    }

    private function subjectMeta(Subject $subject, int $year): array
    {
        return [
            'code' => trim((string) ($subject->subject_code ?? '')),
            'name' => trim((string) ($subject->subject_name ?? '')),
            'year' => $year,
        ];
    }

    // ---------------------------------------------------------------------
    // Per-student helpers
    // ---------------------------------------------------------------------

    /**
     * Year level during a past term: curriculum year of most subjects taken that term
     * (ties go to the higher year, since retakes are lower-year subjects).
     *
     * @param  array<int, Evaluation>  $termAttempts
     */
    private function yearInTerm(array $termAttempts, array $template, int $profileYear, int $yearsAgo): int
    {
        $counts = [];
        foreach ($termAttempts as $a) {
            $y = $template['subject_years'][(int) $a->subject_id] ?? null;
            if ($y) {
                $counts[$y] = ($counts[$y] ?? 0) + 1;
            }
        }
        if ($counts !== []) {
            $max = max($counts);
            $best = 0;
            foreach ($counts as $y => $n) {
                if ($n === $max && $y > $best) {
                    $best = $y;
                }
            }

            return $best;
        }

        return $profileYear > 0 ? max(1, $profileYear - max(0, $yearsAgo)) : 0;
    }

    /**
     * Regular / Irregular from the records available up to the selected term.
     *
     * @param  array<int, Evaluation>  $attempts
     * @param  array<int, true>  $credits
     * @return array{status: string, failed: bool}
     */
    private function classify(array $template, array $attempts, array $credits, array $ayStart): array
    {
        $bySubject = [];
        foreach ($attempts as $a) {
            $bySubject[(int) $a->subject_id][] = $a;
        }
        $preferred = [];
        foreach ($bySubject as $id => $list) {
            $preferred[$id] = EvaluationAttemptPicker::prefer($list, $ayStart);
        }

        $passedSeq = [];
        $rows = [];
        $used = [];
        foreach ($template['rows'] as $t) {
            $id = $t['subject_id'];
            if ($id === null && $t['choices'] !== []) {
                foreach ($t['choices'] as $choice) {
                    if (! isset($used[$choice]) && (isset($credits[$choice]) || isset($preferred[$choice]))) {
                        $id = $choice;
                        $used[$choice] = true;
                        break;
                    }
                }
            }
            $evaluation = $id !== null ? ($preferred[$id] ?? null) : null;
            $credited = $id !== null && isset($credits[$id]);
            $outcome = $this->outcome($evaluation, $t['passing_grade']);
            $passedSeq[] = $credited || $outcome === 'passed';
            $rows[] = [
                'elective_pending' => $id === null,
                'grade' => $evaluation ? $this->grades->cleanGrade($evaluation->grade) : null,
                'passing_grade' => $t['passing_grade'],
                'status' => $credited && $outcome !== 'passed' ? 'Credit' : ($evaluation?->evaluation_status ?? null),
            ];
        }

        $result = AcademicStatusClassifier::fromPassSequence($passedSeq, $rows);
        $failed = false;
        foreach ($result['reasons'] as $reason) {
            if (stripos($reason, 'failing') !== false) {
                $failed = true;
            }
        }

        return ['status' => $result['status'], 'failed' => $failed];
    }

    /** passed | failed | inc | dropped | ongoing | null (no record). */
    private function outcome(mixed $evaluation, mixed $passingGrade): ?string
    {
        if ($evaluation === null) {
            return null;
        }
        $grade = $this->grades->cleanGrade($evaluation->grade);
        $status = strtolower(trim((string) ($evaluation->evaluation_status ?? '')));
        if ($grade === null && $status === '') {
            return null;
        }
        if (in_array($status, ['passed', 'pass', 'credit', 'complete', 'completed'], true)
            || $this->grades->gradeIndicatesPass($evaluation->grade, $passingGrade, $evaluation->evaluation_status)) {
            return 'passed';
        }
        if (in_array($status, ['incomplete', 'inc'], true)) {
            return 'inc';
        }
        if (in_array($status, ['dropped', 'drop'], true)) {
            return 'dropped';
        }
        if (in_array($status, ['failed', 'fail', 'f'], true)) {
            return 'failed';
        }
        if ($grade !== null) {
            $upper = strtoupper($grade);
            if ($upper === 'INC') {
                return 'inc';
            }
            if (in_array($upper, ['DRP', 'DROP', 'DROPPED', 'UD', 'OD'], true)) {
                return 'dropped';
            }

            return 'failed';
        }

        return 'ongoing';
    }

    private function sisGrade(mixed $grade, mixed $passing): ?float
    {
        $sis = $this->grades->coerceToSisGrade($grade, $passing ?? 50);
        if ($sis === null || ! $this->grades->isNumericalGradeScale($sis)) {
            return null;
        }
        $g = (float) str_replace(',', '.', $sis);

        return $g >= 1 && $g <= 5 ? $g : null;
    }

    private function gradeBucket(string $outcome, ?float $sis): string
    {
        if ($outcome === 'inc') {
            return 'INC';
        }
        if ($outcome === 'dropped') {
            return 'DRP';
        }
        if ($sis === null) {
            return $outcome === 'passed' ? '3.00' : '5.00';
        }
        if ($sis > 3.0) {
            return '5.00';
        }

        return number_format(round($sis * 4) / 4, 2);
    }

    private function studentSummary(StudentProfile $profile, int $year): array
    {
        $name = trim(
            ($profile->last_name ? $profile->last_name.', ' : '').
            ($profile->first_name ?? '').
            ($profile->middle_name ? ' '.$profile->middle_name : '')
        );

        return [
            'student_id' => (int) $profile->student_id,
            'student_id_number' => (string) ($profile->student_id_number ?? ''),
            'name' => $name !== '' ? $name : 'Student #'.$profile->student_id,
            'year' => $year,
        ];
    }

    // ---------------------------------------------------------------------
    // Output shaping
    // ---------------------------------------------------------------------

    /** @return list<int> */
    private function sortedYearIds(array $extra): array
    {
        $ids = array_values(array_unique(array_merge([1, 2, 3, 4], array_map('intval', $extra))));
        sort($ids);

        return $ids;
    }

    /** @return list<array{year_level_id: int, label: string}> */
    private function yearBuckets(array $population, array $yearLabels, int $yearFilter): array
    {
        $ids = $yearFilter ? [$yearFilter] : $this->sortedYearIds(array_keys($population));

        return array_map(static fn ($id) => [
            'year_level_id' => $id,
            'label' => $yearLabels[$id] ?? "Year {$id}",
        ], $ids);
    }

    private function trendRow(array $counts, array $years): array
    {
        $row = ['total' => 0];
        foreach ($years as $y) {
            $n = $counts[$y['year_level_id']] ?? 0;
            $row['y'.$y['year_level_id']] = $n;
            $row['total'] += $n;
        }

        return $row;
    }

    private function subjectRows(array $stats): array
    {
        if ($stats === []) {
            return [];
        }
        $meta = [];
        foreach ($this->templates as $template) {
            $meta += $template['subjects'];
        }
        $missing = array_diff(array_keys($stats), array_keys($meta));
        if ($missing !== []) {
            foreach (Subject::query()->whereIn('subject_id', $missing)->get(['subject_id', 'subject_code', 'subject_name']) as $s) {
                $meta[(int) $s->subject_id] = $this->subjectMeta($s, 0);
            }
        }

        $rows = [];
        foreach ($stats as $id => $s) {
            $m = $meta[$id] ?? ['code' => "#{$id}", 'name' => '', 'year' => 0];
            $rows[] = [
                'subject_id' => $id,
                'code' => $m['code'],
                'name' => $m['name'],
                'year' => $m['year'],
                'enrolled' => $s['enrolled'],
                'passed' => $s['passed'],
                'failed' => $s['failed'],
                'inc' => $s['inc'],
                'dropped' => $s['dropped'],
                'pass_rate' => round($s['passed'] / $s['enrolled'] * 100, 1),
                'avg_grade' => $s['grade_n'] > 0 ? round($s['grade_sum'] / $s['grade_n'], 2) : null,
                'students' => $s['students'],
            ];
        }
        usort($rows, static fn ($a, $b) => [$a['pass_rate'], -$a['enrolled']] <=> [$b['pass_rate'], -$b['enrolled']]);

        return $rows;
    }

    private function kpis(array $r, int $ayId, array $trendIds): array
    {
        $sum = static fn (array $rows, string $key) => array_sum(array_column($rows, $key));
        $students = $sum($r['population_by_year'], 'count');
        $manual = $sum($r['evaluation_by_year'], 'evaluated_manual');
        $auto = $sum($r['evaluation_by_year'], 'evaluated_auto');
        $irregular = $sum($r['status_by_year'], 'irregular');
        $enrolled = $sum($r['subject_performance'], 'enrolled');
        $passed = $sum($r['subject_performance'], 'passed');

        $prev = null;
        $idx = array_search($ayId, $trendIds, true);
        if ($idx !== false && $idx > 0) {
            $row = $r['trend'][$idx - 1];
            $prev = ['label' => $row['label'], 'students' => $row['total']];
        }

        return [
            'students' => $students,
            'evaluated' => $manual + $auto,
            'evaluated_manual' => $manual,
            'evaluated_auto' => $auto,
            'unevaluated' => $sum($r['evaluation_by_year'], 'unevaluated'),
            'evaluated_pct' => $this->pct($manual + $auto, $students),
            'regular' => $sum($r['status_by_year'], 'regular'),
            'irregular' => $irregular,
            'irregular_pct' => $this->pct($irregular, $students),
            'failed_subject' => $sum($r['status_by_year'], 'failed_subject'),
            'sequence_gap' => $sum($r['status_by_year'], 'sequence_gap'),
            'graded_results' => $enrolled,
            'pass_rate' => $enrolled > 0 ? $this->pct($passed, $enrolled) : null,
            'subjects_graded' => count($r['subject_performance']),
            'previous_year' => $prev,
        ];
    }

    private function insights(array $r): array
    {
        $k = $r['kpis'];
        $out = [];

        $pop = $r['population_by_year'];
        $largest = $pop === [] ? null : array_reduce($pop, static fn ($c, $y) => $c === null || $y['count'] > $c['count'] ? $y : $c);
        $out['population'] = $k['students'] === 0
            ? 'No students recorded for this term yet.'
            : sprintf('%d students this term. %s is the largest group (%d, %s%%).',
                $k['students'], $largest['label'], $largest['count'], $this->pct($largest['count'], $k['students']));
        if ($k['previous_year'] && $k['previous_year']['students'] > 0) {
            $diff = $k['students'] - $k['previous_year']['students'];
            $out['population'] .= sprintf(' %s %d vs %s.', $diff >= 0 ? 'Up' : 'Down', abs($diff), $k['previous_year']['label']);
        }

        $worstEval = null;
        foreach ($r['evaluation_by_year'] as $y) {
            $total = $y['evaluated_manual'] + $y['evaluated_auto'] + $y['unevaluated'];
            if ($total > 0 && ($worstEval === null || $y['unevaluated'] / $total > $worstEval['ratio'])) {
                $worstEval = ['label' => $y['label'], 'n' => $y['unevaluated'], 'ratio' => $y['unevaluated'] / $total];
            }
        }
        $out['evaluation'] = $k['students'] === 0
            ? 'No students to evaluate for this term.'
            : ($k['unevaluated'] === 0
                ? 'Every student in this term has been evaluated.'
                : sprintf('%s%% evaluated. %s needs the most attention: %d students (%s%%) still unevaluated.',
                    $k['evaluated_pct'], $worstEval['label'], $worstEval['n'], round($worstEval['ratio'] * 100, 1)));

        $worstStatus = null;
        foreach ($r['status_by_year'] as $y) {
            $total = $y['regular'] + $y['irregular'];
            if ($total > 0 && ($worstStatus === null || $y['irregular'] / $total > $worstStatus['ratio'])) {
                $worstStatus = ['label' => $y['label'], 'n' => $y['irregular'], 'ratio' => $y['irregular'] / $total];
            }
        }
        $out['status'] = $k['irregular'] === 0
            ? 'All students in this term are regular.'
            : sprintf('%d irregular students (%s%%). %s has the highest share (%d, %s%%) and may need academic guidance. Main cause: %s.',
                $k['irregular'], $k['irregular_pct'], $worstStatus['label'], $worstStatus['n'], round($worstStatus['ratio'] * 100, 1),
                $k['failed_subject'] >= $k['sequence_gap'] ? 'failed subjects' : 'subjects taken out of curriculum order');

        $low = array_values(array_filter($r['subject_performance'], static fn ($s) => $s['enrolled'] >= 10));
        $out['subjects'] = $low === []
            ? ($r['subject_performance'] === [] ? 'No final grades recorded for this term yet.' : 'No subject has 10 or more graded students in this term.')
            : ($low[0]['pass_rate'] < 75
                ? sprintf('%s – %s has the highest failure rate (%d of %d did not pass, %s%% pass rate) and may require academic intervention.',
                    $low[0]['code'], $low[0]['name'], $low[0]['enrolled'] - $low[0]['passed'], $low[0]['enrolled'], $low[0]['pass_rate'])
                : sprintf('Every subject with 10+ students passes at least 75%%. Lowest: %s at %s%%.', $low[0]['code'], $low[0]['pass_rate']));

        $dist = array_column($r['grade_distribution'], 'count', 'label');
        $graded = array_sum($dist);
        arsort($dist);
        $out['grades'] = $graded === 0
            ? 'No grades recorded for this term yet.'
            : sprintf('Most common grade: %s (%d of %d results). %s%% of results are failing, INC or dropped.',
                array_key_first($dist), reset($dist), $graded,
                $this->pct(($dist['5.00'] ?? 0) + ($dist['INC'] ?? 0) + ($dist['DRP'] ?? 0), $graded));

        return $out;
    }

    /** Chronological order: school year, then 1st sem, 2nd sem, summer. */
    private function termKey(array $ayStart, int $ayId, int $semId): int
    {
        return ($ayStart[$ayId] ?? 0) * 10 + max(0, min(9, $semId));
    }

    private function pct(int $part, int $whole): float
    {
        return $whole > 0 ? round($part / $whole * 100, 1) : 0.0;
    }
}
