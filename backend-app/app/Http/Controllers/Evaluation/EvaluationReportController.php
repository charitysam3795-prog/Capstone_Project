<?php

namespace App\Http\Controllers\Evaluation;

use App\Http\Controllers\Controller;
use App\Models\AcademicRecordEvaluationComplete;
use App\Models\AcademicYear;
use App\Models\DeanProfile;
use App\Models\Evaluation;
use App\Models\Program;
use App\Models\StudentProfile;
use App\Models\Subject;
use App\Models\TblUser;
use App\Models\YearLevel;
use App\Services\DeanProgramAnalytics;
use App\Services\RegularStudentAutoPromotion;
use App\Support\CachedSchema;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class EvaluationReportController extends Controller
{
    private function assertEvaluationAccess(Request $request): ?JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }
        if (! $user->canWorkOnStudentEvaluations()) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        return null;
    }

    /** Program Head / Secretary: fixed program from tbl_users.program_id. */
    private function staffAssignedProgramId($user): ?int
    {
        if ($user->isAdmin()) {
            return null;
        }
        if ($user->hasRole('Program Head') || $user->hasRole('Secretary')) {
            $pid = $user->program_id;

            return $pid ? (int) $pid : null;
        }

        return null;
    }

    /** Scope student queries: Dean → assigned department; PH/Secretary → assigned program. */
    private function applyDeanProgramScope(Builder $query, Request $request, $user): void
    {
        // Practice / simulation dummies are for Guide walkthroughs only — never count in dashboards or reports.
        if (CachedSchema::hasColumn('tbl_student_profile', 'is_simulation')) {
            $query->where(function ($q) {
                $q->where('is_simulation', false)->orWhereNull('is_simulation');
            });
        }

        if ($user->hasRole('Dean') && ! $user->isAdmin()) {
            $deanProfile = DeanProfile::where('user_id', $user->user_id)->first();
            if ($deanProfile && $deanProfile->department_id) {
                $departmentId = $deanProfile->department_id;
                $query->whereHas('program', function ($q) use ($departmentId) {
                    $q->where('department_id', $departmentId);
                });
            } elseif ($deanProfile && $deanProfile->program_id) {
                $pid = $deanProfile->program_id;
                $query->where(function ($q) use ($pid) {
                    $q->where('Current_Program', $pid)->orWhere('current_program', $pid);
                });
            }

            return;
        }

        $staffPid = $this->staffAssignedProgramId($user);
        if ($staffPid) {
            $query->where(function ($q) use ($staffPid) {
                $q->where('Current_Program', $staffPid)->orWhere('current_program', $staffPid);
            });

            return;
        }

        if ($request->filled('program_id')) {
            $pid = (int) $request->query('program_id');
            $query->where(function ($q) use ($pid) {
                $q->where('Current_Program', $pid)->orWhere('current_program', $pid);
            });
        }
    }

    private function evaluationQuery(Request $request, $user): Builder
    {
        $q = Evaluation::query();

        $q->whereHas('student', function (Builder $s) use ($request, $user) {
            $this->applyDeanProgramScope($s, $request, $user);
        });

        if ($request->filled('academic_year_id')) {
            $q->where('academic_year_id', (int) $request->query('academic_year_id'));
        }
        if ($request->filled('semester_id')) {
            $q->where('semester_id', (int) $request->query('semester_id'));
        }

        return $q;
    }

    private function rowPassed(?string $status, $grade): bool
    {
        $st = strtolower(trim((string) $status));
        if (in_array($st, ['passed', 'pass', 'credit'], true)) {
            return true;
        }
        if (in_array($st, ['failed', 'fail', 'f', 'dropped'], true)) {
            return false;
        }
        if ($grade !== null && $grade !== '' && is_numeric($grade)) {
            return (float) $grade >= 75.0;
        }

        return false;
    }

    private function rowFailed(?string $status, $grade): bool
    {
        $st = strtolower(trim((string) $status));
        if (in_array($st, ['failed', 'fail', 'f'], true)) {
            return true;
        }
        if ($grade !== null && $grade !== '' && is_numeric($grade)) {
            return (float) $grade < 75.0;
        }

        return false;
    }

    public function getEvaluationSummary(Request $request)
    {
        if ($resp = $this->assertEvaluationAccess($request)) {
            return $resp;
        }
        $user = $request->user();

        $total = 0;
        $passed = 0;
        $failed = 0;
        $other = 0;

        $this->evaluationQuery($request, $user)
            ->whereNotNull('subject_id')
            ->select(['evaluation_id', 'evaluation_status', 'grade'])
            ->chunkById(500, function ($rows) use (&$total, &$passed, &$failed, &$other) {
                foreach ($rows as $row) {
                    $total++;
                    if ($this->rowPassed($row->evaluation_status, $row->grade)) {
                        $passed++;
                    } elseif ($this->rowFailed($row->evaluation_status, $row->grade)) {
                        $failed++;
                    } else {
                        $other++;
                    }
                }
            }, 'evaluation_id');

        $decided = $passed + $failed;
        $passRate = $decided > 0 ? round(($passed / $decided) * 1000) / 10 : null;

        return response()->json([
            'total_evaluations' => $total,
            'passed' => $passed,
            'failed' => $failed,
            'other' => $other,
            'pass_rate_percent' => $passRate,
            'failure_rate_percent' => $decided > 0 ? round(1000 - ($passRate * 10)) / 10 : null,
        ]);
    }

    public function getDepartmentAnalytics(Request $request)
    {
        if ($resp = $this->assertEvaluationAccess($request)) {
            return $resp;
        }
        $user = $request->user();

        $byProgram = [];

        $this->evaluationQuery($request, $user)
            ->whereNotNull('subject_id')
            ->with(['student.program'])
            ->chunkById(500, function ($rows) use (&$byProgram) {
                foreach ($rows as $row) {
                    $prog = $row->student?->program;
                    $key = $prog ? (string) $prog->program_id : '0';
                    $code = $prog->program_code ?? '—';
                    $name = $prog->program_name ?? 'Unknown';
                    if (! isset($byProgram[$key])) {
                        $byProgram[$key] = [
                            'program_id' => $prog?->program_id,
                            'program_code' => $code,
                            'program_name' => $name,
                            'evaluation_count' => 0,
                            'passed' => 0,
                            'failed' => 0,
                        ];
                    }
                    $byProgram[$key]['evaluation_count']++;
                    if ($this->rowPassed($row->evaluation_status, $row->grade)) {
                        $byProgram[$key]['passed']++;
                    } elseif ($this->rowFailed($row->evaluation_status, $row->grade)) {
                        $byProgram[$key]['failed']++;
                    }
                }
            }, 'evaluation_id');

        $list = array_values($byProgram);
        usort($list, fn ($a, $b) => $b['evaluation_count'] <=> $a['evaluation_count']);

        return response()->json(['programs' => $list]);
    }

    public function getStudentPerformanceReport(Request $request, int|string $studentId)
    {
        if ($resp = $this->assertEvaluationAccess($request)) {
            return $resp;
        }
        $user = $request->user();

        $student = StudentProfile::with('program')->where('student_id', $studentId)->first();
        if (! $student) {
            return response()->json(['message' => 'Student not found'], 404);
        }

        if ($user->hasRole('Dean') && ! $user->isAdmin()) {
            $deanProfile = DeanProfile::where('user_id', $user->user_id)->first();
            if ($deanProfile && $deanProfile->department_id) {
                $student->loadMissing('program');
                if ((int) ($student->program?->department_id ?? 0) !== (int) $deanProfile->department_id) {
                    return response()->json(['message' => 'Forbidden'], 403);
                }
            } elseif ($deanProfile && $deanProfile->program_id) {
                $pid = $deanProfile->program_id;
                $sid = $student->getAttributes()['current_program']
                    ?? $student->getAttributes()['Current_Program']
                    ?? $student->current_program
                    ?? null;
                if ((int) $sid !== (int) $pid) {
                    return response()->json(['message' => 'Forbidden'], 403);
                }
            }
        }

        $q = Evaluation::query()->where('student_id', $studentId);
        if ($request->filled('academic_year_id')) {
            $q->where('academic_year_id', (int) $request->query('academic_year_id'));
        }
        if ($request->filled('semester_id')) {
            $q->where('semester_id', (int) $request->query('semester_id'));
        }

        $rows = $q->with(['subject'])->get();
        $passed = $rows->filter(fn ($r) => $this->rowPassed($r->evaluation_status, $r->grade))->count();
        $failed = $rows->filter(fn ($r) => $this->rowFailed($r->evaluation_status, $r->grade))->count();

        return response()->json([
            'student_id' => (int) $studentId,
            'total' => $rows->count(),
            'passed' => $passed,
            'failed' => $failed,
        ]);
    }

    public function getSubjectPerformanceReport(Request $request, int|string $subjectId)
    {
        if ($resp = $this->assertEvaluationAccess($request)) {
            return $resp;
        }
        $user = $request->user();

        $q = $this->evaluationQuery($request, $user)->where('subject_id', $subjectId);
        $rows = $q->get(['evaluation_status', 'grade']);
        $passed = $rows->filter(fn ($r) => $this->rowPassed($r->evaluation_status, $r->grade))->count();
        $failed = $rows->filter(fn ($r) => $this->rowFailed($r->evaluation_status, $r->grade))->count();

        return response()->json([
            'subject_id' => (int) $subjectId,
            'total' => $rows->count(),
            'passed' => $passed,
            'failed' => $failed,
        ]);
    }

    /**
     * Dean / program dashboard: counts + recent stored academic-record completions.
     */
    public function deanDashboard(Request $request)
    {
        if ($resp = $this->assertEvaluationAccess($request)) {
            return $resp;
        }
        $user = $request->user();

        $studentQ = StudentProfile::query();
        $this->applyDeanProgramScope($studentQ, $request, $user);
        $totalStudents = $studentQ->count();

        $evaluatedStudents = AcademicRecordEvaluationComplete::query()
            ->whereHas('student', function (Builder $s) use ($request, $user) {
                $this->applyDeanProgramScope($s, $request, $user);
            })
            ->distinct()
            ->count('student_id');

        $evaluatorRoles = TblUser::query()
            ->whereHas('role', fn ($r) => $r->whereIn('role_name', ['Adviser']))
            ->count();

        $recent = AcademicRecordEvaluationComplete::query()
            ->with(['student', 'completedByUser'])
            ->whereHas('student', function (Builder $s) use ($request, $user) {
                $this->applyDeanProgramScope($s, $request, $user);
            })
            ->orderByDesc('completed_at')
            ->limit(10)
            ->get()
            ->map(function (AcademicRecordEvaluationComplete $c) {
                $stu = $c->student;
                $name = $stu
                    ? trim(($stu->last_name ?? '').', '.($stu->first_name ?? '').' '.($stu->middle_name ?? ''))
                    : 'Student';
                $when = $c->completed_at ? $c->completed_at->diffForHumans() : '';

                return [
                    'academic_record_complete_id' => $c->academic_record_complete_id,
                    'student_name' => $name ?: 'Student',
                    'completed_at' => $c->completed_at?->toIso8601String(),
                    'completed_at_human' => $when,
                    'subtitle' => 'Academic record evaluation stored',
                ];
            });

        return response()->json([
            'total_students' => $totalStudents,
            'evaluated_students' => $evaluatedStudents,
            'evaluators_count' => $evaluatorRoles,
            'recent_activity' => $recent,
        ]);
    }

    /** Top failed/passed subjects + average numeric grade per subject (scoped). */
    public function subjectInsights(Request $request)
    {
        if ($resp = $this->assertEvaluationAccess($request)) {
            return $resp;
        }
        $user = $request->user();

        $failCounts = [];
        $passCounts = [];
        $gradeSum = [];
        $gradeN = [];

        $this->evaluationQuery($request, $user)
            ->whereNotNull('subject_id')
            ->chunkById(500, function ($rows) use (&$failCounts, &$passCounts, &$gradeSum, &$gradeN) {
                foreach ($rows as $row) {
                    $sid = (int) $row->subject_id;
                    if ($this->rowFailed($row->evaluation_status, $row->grade)) {
                        $failCounts[$sid] = ($failCounts[$sid] ?? 0) + 1;
                    }
                    if ($this->rowPassed($row->evaluation_status, $row->grade)) {
                        $passCounts[$sid] = ($passCounts[$sid] ?? 0) + 1;
                    }
                    if ($row->grade !== null && $row->grade !== '' && is_numeric($row->grade)) {
                        $g = (float) $row->grade;
                        if ($g >= 1 && $g <= 5) {
                            $gradeSum[$sid] = ($gradeSum[$sid] ?? 0) + $g;
                            $gradeN[$sid] = ($gradeN[$sid] ?? 0) + 1;
                        }
                    }
                }
            }, 'evaluation_id');

        arsort($failCounts);
        arsort($passCounts);

        $subjectIdsForLabels = array_unique(array_merge(
            array_keys(array_slice($failCounts, 0, 5, true)),
            array_keys(array_slice($passCounts, 0, 5, true)),
            array_keys($gradeN)
        ));
        $subjectCodes = $subjectIdsForLabels === []
            ? []
            : Subject::query()->whereIn('subject_id', $subjectIdsForLabels)->pluck('subject_code', 'subject_id')->all();

        $topFailed = [];
        foreach (array_slice($failCounts, 0, 5, true) as $sid => $n) {
            $topFailed[] = [
                'subject_id' => $sid,
                'subject_code' => $subjectCodes[$sid] ?? '—',
                'count' => $n,
            ];
        }

        $topPassed = [];
        foreach (array_slice($passCounts, 0, 5, true) as $sid => $n) {
            $topPassed[] = [
                'subject_id' => $sid,
                'subject_code' => $subjectCodes[$sid] ?? '—',
                'count' => $n,
            ];
        }

        $avgGrades = [];
        foreach ($gradeN as $sid => $n) {
            if ($n < 1) {
                continue;
            }
            $avgGrades[] = [
                'subject_id' => (int) $sid,
                'subject_code' => $subjectCodes[$sid] ?? '—',
                'average' => round($gradeSum[$sid] / $n, 2),
                'sample_size' => $n,
            ];
        }
        usort($avgGrades, fn ($a, $b) => $b['sample_size'] <=> $a['sample_size']);
        $avgGrades = array_slice($avgGrades, 0, 12);

        return response()->json([
            'top_failed_subjects' => $topFailed,
            'top_passed_subjects' => $topPassed,
            'average_grade_by_subject' => $avgGrades,
        ]);
    }

    /** Students with two or more failed evaluation rows (scoped). */
    public function atRiskStudents(Request $request)
    {
        if ($resp = $this->assertEvaluationAccess($request)) {
            return $resp;
        }
        $user = $request->user();

        $fails = [];

        $this->evaluationQuery($request, $user)
            ->whereNotNull('subject_id')
            ->chunkById(500, function ($rows) use (&$fails) {
                foreach ($rows as $row) {
                    if (! $this->rowFailed($row->evaluation_status, $row->grade)) {
                        continue;
                    }
                    $sid = (int) $row->student_id;
                    $fails[$sid] = ($fails[$sid] ?? 0) + 1;
                }
            }, 'evaluation_id');

        $atRiskIds = array_keys(array_filter($fails, fn ($n) => $n >= 2));
        $studentsById = $atRiskIds === []
            ? collect()
            : StudentProfile::query()
                ->with('program')
                ->whereIn('student_id', $atRiskIds)
                ->get()
                ->keyBy('student_id');

        $atRisk = [];
        foreach ($fails as $studentId => $n) {
            if ($n < 2) {
                continue;
            }
            $stu = $studentsById->get($studentId);
            if (! $stu) {
                continue;
            }
            $name = trim(
                ($stu->last_name ? $stu->last_name.', ' : '').
                ($stu->first_name ?? '').
                ($stu->middle_name ? ' '.$stu->middle_name : '')
            );
            $atRisk[] = [
                'student_id' => $studentId,
                'student_id_number' => $stu->student_id_number ?? $stu->student_number ?? '',
                'full_name' => $name ?: '—',
                'program_code' => $stu->program->program_code ?? '—',
                'failed_subject_evaluations' => $n,
            ];
        }

        usort($atRisk, fn ($a, $b) => $b['failed_subject_evaluations'] <=> $a['failed_subject_evaluations']);

        $search = strtolower(trim((string) $request->query('search', '')));
        if ($search !== '') {
            $atRisk = array_values(array_filter($atRisk, function ($r) use ($search) {
                return str_contains(strtolower($r['full_name']), $search)
                    || str_contains(strtolower((string) $r['student_id_number']), $search);
            }));
        }

        return response()->json(['students' => array_values($atRisk)]);
    }

    /**
     * Adviser-scoped analytics: year-level + program scope with auto/manual/unevaluated buckets.
     */
    public function adviserAnalytics(Request $request)
    {
        if ($resp = $this->assertEvaluationAccess($request)) {
            return $resp;
        }
        $user = $request->user();
        if (! $user->isEvaluatorLike()) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $user->loadMissing('facultyProfile');
        $programId = $user->facultyProfile?->program_id ? (int) $user->facultyProfile->program_id : null;
        $program = $programId ? Program::query()->find($programId) : null;

        $allowedYears = $user->effectiveEvaluationYearLevelIds();
        if ($allowedYears === []) {
            return response()->json([
                'program' => null,
                'year_scope' => [],
                'totals' => [
                    'in_scope' => 0,
                    'auto_evaluated' => 0,
                    'manual_evaluated' => 0,
                    'needs_evaluation' => 0,
                    'regular' => 0,
                    'irregular' => 0,
                ],
                'by_year' => ['series' => [], 'insight' => 'No year levels assigned to your adviser account.', 'totals' => []],
            ]);
        }

        $yearLevelQuery = YearLevel::query()->orderBy('year_level_id');
        if ($allowedYears !== null) {
            $yearLevelQuery->whereIn('year_level_id', $allowedYears);
        }
        $yearLevels = $yearLevelQuery->get(['year_level_id', 'year_level']);
        $yearBuckets = $yearLevels->map(fn ($y) => [
            'year_level_id' => (int) $y->year_level_id,
            'label' => (string) ($y->year_level ?: "Year {$y->year_level_id}"),
        ])->values()->all();

        $studentBase = $this->buildAdviserStudentBase($user);
        if (! $studentBase) {
            return response()->json([
                'program' => $program ? [
                    'program_id' => (int) $program->program_id,
                    'program_code' => $program->program_code,
                    'program_name' => $program->program_name,
                ] : null,
                'year_scope' => $yearBuckets,
                'totals' => [
                    'in_scope' => 0,
                    'auto_evaluated' => 0,
                    'manual_evaluated' => 0,
                    'needs_evaluation' => 0,
                    'regular' => 0,
                    'irregular' => 0,
                ],
                'by_year' => [
                    'series' => [],
                    'insight' => $programId
                        ? 'No students in your assigned program and year scope.'
                        : 'Assign a program on your adviser profile to see analytics.',
                    'totals' => [],
                ],
            ]);
        }

        $evaluatedIds = AcademicRecordEvaluationComplete::query()
            ->whereIn('student_id', (clone $studentBase)->select('student_id'))
            ->where(function ($q) {
                $q->whereNull('notes')
                    ->orWhere('notes', '')
                    ->orWhere('notes', 'like', '%Irregular manual promotion%')
                    ->orWhere(function ($inner) {
                        $inner->where('notes', 'not like', '%Auto-promoted on semester activation%')
                            ->where('notes', 'not like', '%Semester promotion%');
                    });
            })
            ->distinct()
            ->pluck('student_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $evaluatedSet = array_fill_keys($evaluatedIds, true);

        $byYear = $this->buildUnevaluatedByYear($studentBase, $yearBuckets, $evaluatedSet);

        $manualEvaluated = 0;
        $inScope = 0;
        foreach ($byYear['series'] as $row) {
            $manualEvaluated += (int) ($row['manual_evaluated'] ?? 0);
            $inScope += (int) ($row['total_students'] ?? 0);
        }

        $statusCounts = ['regular' => 0, 'irregular' => 0, 'other' => 0];
        (clone $studentBase)
            ->select(['academic_status'])
            ->cursor()
            ->each(function ($student) use (&$statusCounts) {
                $status = strtolower(trim((string) ($student->academic_status ?? '')));
                if ($status === 'irregular') {
                    $statusCounts['irregular']++;
                } elseif ($status === 'regular') {
                    $statusCounts['regular']++;
                } else {
                    $statusCounts['other']++;
                }
            });

        return response()->json([
            'program' => $program ? [
                'program_id' => (int) $program->program_id,
                'program_code' => $program->program_code,
                'program_name' => $program->program_name,
            ] : null,
            'year_scope' => $yearBuckets,
            'totals' => [
                'in_scope' => $inScope,
                'auto_evaluated' => (int) ($byYear['totals']['auto_evaluated'] ?? 0),
                'manual_evaluated' => $manualEvaluated,
                'needs_evaluation' => (int) ($byYear['totals']['unevaluated'] ?? 0),
                'regular' => $statusCounts['regular'],
                'irregular' => $statusCounts['irregular'],
            ],
            'by_year' => $byYear,
        ]);
    }

    /** @return Builder<StudentProfile>|null */
    private function buildAdviserStudentBase(TblUser $user): ?Builder
    {
        if (! $user->isEvaluatorLike()) {
            return null;
        }

        $user->loadMissing('facultyProfile');
        $programId = $user->facultyProfile?->program_id ? (int) $user->facultyProfile->program_id : null;
        if (! $programId) {
            return null;
        }

        $allowedYears = $user->effectiveEvaluationYearLevelIds();
        if ($allowedYears === []) {
            return null;
        }

        $query = StudentProfile::query();
        $query->where(function ($q) use ($programId) {
            $q->where('Current_Program', $programId)->orWhere('current_program', $programId);
        });

        if (CachedSchema::hasColumn('tbl_student_profile', 'is_simulation')) {
            $query->where(function ($q) {
                $q->where('is_simulation', false)->orWhereNull('is_simulation');
            });
        }

        if ($allowedYears !== null) {
            $query->whereIn(
                DB::raw('COALESCE(promotion_target_year_level_id, year_level_id)'),
                $allowedYears
            );
        }

        return $query;
    }

    /**
     * Program analytics: subject performance, prerequisite blockers, regular/irregular,
     * student progress, progress by year level, and load plans. Filter: one program.
     */
    public function deanProgramAnalytics(Request $request, DeanProgramAnalytics $analytics)
    {
        if ($resp = $this->assertEvaluationAccess($request)) {
            return $resp;
        }
        $user = $request->user();

        // Always the user's own assigned program (no program picker on this page).
        $programs = $this->programsInDeanScope($request, $user);
        $programId = $this->staffAssignedProgramId($user)
            ?? $this->adviserAssignedProgramId($user)
            ?? $this->deanAssignedProgramId($user, $programs);
        if (! $programId && $user->isAdmin() && $request->filled('program_id')) {
            $programId = (int) $request->query('program_id');
        }
        $programId = $programId ?: (int) ($programs[0]['program_id'] ?? 0);

        $allowed = collect($programs)->pluck('program_id')->map(fn ($id) => (int) $id)->all();
        if ($programId > 0 && $allowed !== [] && ! in_array($programId, $allowed, true)) {
            return response()->json(['message' => 'Program is outside your scope.'], 403);
        }

        $program = $programId > 0 ? Program::query()->find($programId) : null;
        $meta = [
            'programs' => $programs,
            'selected_program_id' => $program ? (int) $program->program_id : null,
            'selected_program' => $program ? [
                'program_id' => (int) $program->program_id,
                'program_code' => $program->program_code,
                'program_name' => $program->program_name,
            ] : null,
        ];
        if (! $program) {
            return response()->json($meta);
        }

        $ayId = (int) $request->query('academic_year_id', 0);
        $semId = $request->filled('semester_id') ? (int) $request->query('semester_id') : null;
        $yearId = (int) $request->query('year_level_id', 0);

        // Same year scope the Student evaluation list applies (User permissions → year levels).
        $allowedYears = $user->hasRole('Dean') ? null : $user->effectiveEvaluationYearLevelIds();

        // Not cached: counts must match the Student evaluation list right after each evaluation.
        @set_time_limit(120);
        try {
            $data = $analytics->build($program, $ayId, $semId, $yearId, $allowedYears);
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['message' => 'Could not compute program analytics.'], 500);
        }

        return response()->json($meta + $data);
    }

    /**
     * Dean decision analytics (workload, enrollment compare, unevaluated,
     * evaluator capacity, evaluation-rush forecast). Filter: one program.
     */
    public function deanDecisionAnalytics(Request $request)
    {
        if ($resp = $this->assertEvaluationAccess($request)) {
            return $resp;
        }
        $user = $request->user();

        $programs = $this->programsInDeanScope($request, $user);
        $staffPid = $this->staffAssignedProgramId($user);
        if ($staffPid) {
            $programId = $staffPid;
        } elseif ($request->filled('program_id')) {
            $programId = (int) $request->query('program_id');
        } else {
            $programId = (int) ($programs[0]['program_id'] ?? 0);
        }

        if ($programId > 0) {
            $allowed = collect($programs)->pluck('program_id')->map(fn ($id) => (int) $id)->all();
            if ($allowed !== [] && ! in_array($programId, $allowed, true)) {
                return response()->json(['message' => 'Program is outside your scope.'], 403);
            }
        }

        $program = $programId > 0
            ? Program::query()->find($programId)
            : null;

        $yearLevels = YearLevel::query()
            ->whereIn('year_level_id', [1, 2, 3, 4])
            ->orderBy('year_level_id')
            ->get(['year_level_id', 'year_level']);

        $yearBuckets = $yearLevels->map(fn ($y) => [
            'year_level_id' => (int) $y->year_level_id,
            'label' => (string) ($y->year_level ?: "Year {$y->year_level_id}"),
        ])->values()->all();

        $academicYears = AcademicYear::forAnalyticsFilters();

        $thisAyId = $request->filled('academic_year_id')
            ? (int) $request->query('academic_year_id')
            : AcademicYear::resolveCurrentId($academicYears);
        $lastAyId = $request->filled('compare_academic_year_id')
            ? (int) $request->query('compare_academic_year_id')
            : $this->previousAcademicYearId($academicYears, $thisAyId);

        $studentBase = StudentProfile::query();
        $this->applyDeanProgramScope($studentBase, $request, $user);
        if ($programId > 0) {
            $studentBase->where(function ($q) use ($programId) {
                $q->where('Current_Program', $programId)->orWhere('current_program', $programId);
            });
        }
        // Exclude simulation dummies from decision analytics when column exists.
        if (CachedSchema::hasColumn('tbl_student_profile', 'is_simulation')) {
            $studentBase->where(function ($q) {
                $q->where('is_simulation', false)->orWhereNull('is_simulation');
            });
        }

        $evaluatedIds = AcademicRecordEvaluationComplete::query()
            ->whereIn('student_id', (clone $studentBase)->select('student_id'))
            ->where(function ($q) {
                $q->whereNull('notes')
                    ->orWhere('notes', '')
                    ->orWhere('notes', 'like', '%Irregular manual promotion%')
                    ->orWhere(function ($inner) {
                        $inner->where('notes', 'not like', '%Auto-promoted on semester activation%')
                            ->where('notes', 'not like', '%Semester promotion%');
                    });
            })
            ->distinct()
            ->pluck('student_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $evaluatedSet = array_fill_keys($evaluatedIds, true);

        // 1) Workload Mon–Fri (current week + today)
        $workload = $this->buildWorkloadSection($studentBase, $program);

        // 2) Enrollment by year: last AY vs this AY
        $enrollment = $this->buildEnrollmentCompare(
            $studentBase,
            $yearBuckets,
            $thisAyId,
            $lastAyId,
            $academicYears
        );

        // 3 + 4b) Unevaluated irregulars vs auto-evaluated regulars (system)
        $unevaluated = $this->buildUnevaluatedByYear($studentBase, $yearBuckets, $evaluatedSet);

        // 4a) Evaluators assigned by year level
        $evaluators = $this->buildEvaluatorsByYear(
            $yearBuckets,
            $user,
            $programId > 0 ? $programId : null,
            $program?->department_id ? (int) $program->department_id : null
        );

        // 5) Rush forecast (weeks + weekdays)
        $forecast = $this->buildRushForecast($studentBase);

        $decisionHints = $this->buildDecisionHints(
            $workload,
            $enrollment,
            $unevaluated,
            $evaluators,
            $forecast,
            $program
        );

        return response()->json([
            'programs' => $programs,
            'selected_program_id' => $programId ?: null,
            'selected_program' => $program ? [
                'program_id' => (int) $program->program_id,
                'program_code' => $program->program_code,
                'program_name' => $program->program_name,
            ] : null,
            'academic_years' => $academicYears->map(fn ($y) => [
                'academic_year_id' => (int) $y->academic_year_id,
                'academic_year_name' => $y->academic_year_name,
            ])->values()->all(),
            'this_academic_year_id' => $thisAyId ?: null,
            'compare_academic_year_id' => $lastAyId ?: null,
            'year_levels' => $yearBuckets,
            'workload' => $workload,
            'enrollment_compare' => $enrollment,
            'unevaluated_by_year' => $unevaluated,
            'evaluators_by_year' => $evaluators,
            'rush_forecast' => $forecast,
            'decision_hints' => $decisionHints,
        ]);
    }

    /**
     * @return list<array{program_id:int,program_code:?string,program_name:?string}>
     */
    /** Dean's own program from their profile, when it is inside their scope. */
    /** Adviser: program on their faculty profile (same as the Student evaluation list). */
    private function adviserAssignedProgramId($user): ?int
    {
        if ($user->isAdmin() || ! $user->isEvaluatorLike()) {
            return null;
        }
        $pid = (int) ($user->facultyProfile()->value('program_id') ?? 0);

        return $pid > 0 ? $pid : null;
    }

    private function deanAssignedProgramId($user, array $programs): ?int
    {
        if (! $user->hasRole('Dean') || $user->isAdmin()) {
            return null;
        }
        $pid = (int) (DeanProfile::where('user_id', $user->user_id)->value('program_id') ?? 0);
        $inScope = collect($programs)->contains(fn ($p) => (int) $p['program_id'] === $pid);

        return $pid > 0 && $inScope ? $pid : null;
    }

    private function programsInDeanScope(Request $request, $user): array
    {
        $q = Program::query()->orderBy('program_code');

        $staffPid = $this->staffAssignedProgramId($user);
        if ($staffPid) {
            $q->where('program_id', $staffPid);
        } elseif (! $user->isAdmin() && $user->isEvaluatorLike()) {
            // Adviser with no program on their profile sees nothing (matches the Student list).
            $q->where('program_id', $this->adviserAssignedProgramId($user) ?? 0);
        } elseif ($user->hasRole('Dean') && ! $user->isAdmin()) {
            $deanProfile = DeanProfile::where('user_id', $user->user_id)->first();
            if ($deanProfile && $deanProfile->department_id) {
                $q->where('department_id', $deanProfile->department_id);
            } elseif ($deanProfile && $deanProfile->program_id) {
                $q->where('program_id', $deanProfile->program_id);
            }
        }

        return $q->get(['program_id', 'program_code', 'program_name'])
            ->map(fn ($p) => [
                'program_id' => (int) $p->program_id,
                'program_code' => $p->program_code,
                'program_name' => $p->program_name,
            ])
            ->values()
            ->all();
    }

    private function previousAcademicYearId($academicYears, int $thisAyId): int
    {
        if ($thisAyId <= 0) {
            return (int) ($academicYears->skip(1)->first()?->academic_year_id ?? 0);
        }
        $ids = $academicYears->pluck('academic_year_id')->map(fn ($id) => (int) $id)->values();
        $idx = $ids->search($thisAyId);
        if ($idx === false) {
            return (int) ($ids->skip(1)->first() ?? 0);
        }

        return (int) ($ids->get($idx + 1) ?? 0);
    }

    private function buildWorkloadSection(Builder $studentBase, $program): array
    {
        // Campus ops are PH time; app default may be UTC on Railway.
        $tz = 'Asia/Manila';
        $today = now($tz)->startOfDay();
        $weekStart = $today->copy()->startOfWeek(Carbon::MONDAY)->startOfDay();
        $weekEnd = $today->copy()->endOfWeek(Carbon::SUNDAY)->endOfDay();

        $completions = AcademicRecordEvaluationComplete::query()
            ->whereIn('student_id', (clone $studentBase)->select('student_id'))
            ->whereBetween('completed_at', [
                $weekStart->copy()->utc(),
                $weekEnd->copy()->utc(),
            ])
            ->get(['completed_at', 'student_id']);

        $byDow = [
            1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0, 6 => 0, 7 => 0,
        ];
        $todayCount = 0;
        foreach ($completions as $c) {
            if (! $c->completed_at) {
                continue;
            }
            $local = $c->completed_at->copy()->timezone($tz);
            $dow = (int) $local->dayOfWeekIso; // 1=Mon … 7=Sun
            if ($dow >= 1 && $dow <= 7) {
                $byDow[$dow]++;
            }
            if ($local->isSameDay($today)) {
                $todayCount++;
            }
        }

        $days = [
            ['key' => 'mon', 'label' => 'Mon', 'count' => $byDow[1]],
            ['key' => 'tue', 'label' => 'Tue', 'count' => $byDow[2]],
            ['key' => 'wed', 'label' => 'Wed', 'count' => $byDow[3]],
            ['key' => 'thu', 'label' => 'Thu', 'count' => $byDow[4]],
            ['key' => 'fri', 'label' => 'Fri', 'count' => $byDow[5]],
            ['key' => 'sat', 'label' => 'Sat', 'count' => $byDow[6]],
            // Sunday is still counted in week_total / today_count, but omitted from the chart (non-working day).
        ];

        $code = $program->program_code ?? 'Program';
        $weekTotal = array_sum($byDow);

        return [
            'week_label' => $weekStart->toDateString().' → '.$weekEnd->toDateString(),
            'today_count' => $todayCount,
            'week_total' => $weekTotal,
            'by_weekday' => $days,
            'insight' => $todayCount > 0
                ? "{$code} had {$todayCount} evaluation".($todayCount === 1 ? '' : 's').' today (Promote / Complete logged).'
                : (
                    $weekTotal > 0
                        ? "{$code} has {$weekTotal} evaluation".($weekTotal === 1 ? '' : 's').' this week, but none logged yet today.'
                        : "No {$code} academic-record evaluations logged this week yet. Workload counts Promote and Complete — saving grades alone is not enough until the student is stored as evaluated."
                ),
        ];
    }

    private function buildEnrollmentCompare(
        Builder $studentBase,
        array $yearBuckets,
        int $thisAyId,
        int $lastAyId,
        $academicYears
    ): array {
        $countByYear = function (int $ayId) use ($studentBase, $yearBuckets): array {
            $rows = [];
            foreach ($yearBuckets as $bucket) {
                $rows[(int) $bucket['year_level_id']] = 0;
            }
            if ($ayId <= 0) {
                return $rows;
            }
            $counts = (clone $studentBase)
                ->where('academic_year_id', $ayId)
                ->whereIn('year_level_id', array_keys($rows))
                ->selectRaw('year_level_id, COUNT(*) as c')
                ->groupBy('year_level_id')
                ->pluck('c', 'year_level_id');
            foreach ($counts as $yl => $c) {
                $rows[(int) $yl] = (int) $c;
            }

            return $rows;
        };

        // Fallback: if AY filter yields empty “this year”, show current standing snapshot.
        $thisCounts = $countByYear($thisAyId);
        $lastCounts = $countByYear($lastAyId);
        if (array_sum($thisCounts) === 0) {
            $rows = [];
            foreach ($yearBuckets as $bucket) {
                $rows[(int) $bucket['year_level_id']] = 0;
            }
            $counts = (clone $studentBase)
                ->whereIn('year_level_id', array_keys($rows))
                ->selectRaw('year_level_id, COUNT(*) as c')
                ->groupBy('year_level_id')
                ->pluck('c', 'year_level_id');
            foreach ($counts as $yl => $c) {
                $rows[(int) $yl] = (int) $c;
            }
            $thisCounts = $rows;
        }

        $ayName = fn (int $id) => $academicYears->firstWhere('academic_year_id', $id)?->academic_year_name
            ?? ($id > 0 ? "AY #{$id}" : '—');

        $series = [];
        foreach ($yearBuckets as $bucket) {
            $yl = (int) $bucket['year_level_id'];
            $series[] = [
                'year_level_id' => $yl,
                'label' => $bucket['label'],
                'last_year' => $lastCounts[$yl] ?? 0,
                'this_year' => $thisCounts[$yl] ?? 0,
            ];
        }

        $peak = collect($series)->sortByDesc(fn ($r) => abs(($r['this_year'] ?? 0) - ($r['last_year'] ?? 0)))->first();
        $insight = 'Compare last period vs current after enrollment settles.';
        if ($peak && (($peak['this_year'] ?? 0) > ($peak['last_year'] ?? 0) * 1.25) && ($peak['this_year'] ?? 0) >= 5) {
            $insight = "{$peak['label']} grew from {$peak['last_year']} to {$peak['this_year']} — consider asking the evaluators to report for work to support the need for more instructors.";
        } elseif ($peak && (($peak['last_year'] ?? 0) > ($peak['this_year'] ?? 0) * 1.25) && ($peak['last_year'] ?? 0) >= 5) {
            $insight = "{$peak['label']} dropped from {$peak['last_year']} to {$peak['this_year']} — review intake and retention.";
        }

        return [
            'last_year_label' => $ayName($lastAyId),
            'this_year_label' => $ayName($thisAyId) ?: 'Current standing',
            'series' => $series,
            'insight' => $insight,
        ];
    }

    private function buildUnevaluatedByYear(Builder $studentBase, array $yearBuckets, array $evaluatedSet): array
    {
        $classifier = app(RegularStudentAutoPromotion::class);
        $students = (clone $studentBase)
            ->select([
                'student_id',
                'year_level_id',
                'promotion_target_year_level_id',
                'academic_status',
                'promoted_next_sem_at',
            ])
            ->get();

        $totals = [];
        $uneval = [];
        $auto = [];
        $promoted = [];
        $manual = [];
        $incomplete = [];
        foreach ($yearBuckets as $bucket) {
            $yl = (int) $bucket['year_level_id'];
            $totals[$yl] = 0;
            $uneval[$yl] = 0;
            $auto[$yl] = 0;
            $promoted[$yl] = 0;
            $manual[$yl] = 0;
            $incomplete[$yl] = 0;
        }

        foreach ($students as $stu) {
            $yl = (int) ($stu->promotion_target_year_level_id ?: $stu->year_level_id ?: 0);
            if (! array_key_exists($yl, $totals)) {
                continue;
            }
            $totals[$yl]++;
            try {
                $bucket = $classifier->classifyForAnalytics($stu);
            } catch (\Throwable $e) {
                $uneval[$yl]++;

                continue;
            }
            $hasManual = isset($evaluatedSet[(int) $stu->student_id]);

            if ($bucket['auto_promoted']) {
                $promoted[$yl]++;
            }
            if ($bucket['auto_evaluated']) {
                $auto[$yl]++;

                continue;
            }
            if ($hasManual) {
                $manual[$yl]++;

                continue;
            }
            if ($bucket['is_irregular']) {
                $uneval[$yl]++;

                continue;
            }
            $incomplete[$yl]++;
            $uneval[$yl]++;
        }

        $series = [];
        $maxUneval = 0;
        $maxLabel = null;
        $sumUneval = 0;
        $sumAuto = 0;
        $sumPromoted = 0;
        $sumManual = 0;
        foreach ($yearBuckets as $bucket) {
            $yl = (int) $bucket['year_level_id'];
            $unevalCount = $uneval[$yl] ?? 0;
            $autoCount = $auto[$yl] ?? 0;
            $manualCount = $manual[$yl] ?? 0;
            $series[] = [
                'year_level_id' => $yl,
                'label' => $bucket['label'],
                'unevaluated' => $unevalCount,
                'auto_evaluated' => $autoCount,
                'auto_promoted' => $promoted[$yl] ?? 0,
                'manual_evaluated' => $manualCount,
                'incomplete_regular' => $incomplete[$yl] ?? 0,
                'total_students' => $totals[$yl] ?? 0,
                'evaluated' => $autoCount + $manualCount,
            ];
            $sumUneval += $unevalCount;
            $sumAuto += $autoCount;
            $sumPromoted += $promoted[$yl] ?? 0;
            $sumManual += $manualCount;
            if ($unevalCount > $maxUneval) {
                $maxUneval = $unevalCount;
                $maxLabel = $bucket['label'];
            }
        }

        $insightParts = [];
        if ($maxUneval > 0 && $maxLabel) {
            $insightParts[] = "{$maxLabel} still has {$maxUneval} unevaluated student".($maxUneval === 1 ? '' : 's').' (irregular / incomplete load) needing evaluator action.';
        } else {
            $insightParts[] = 'No remaining unevaluated irregulars in this program filter.';
        }
        if ($sumAuto > 0 || $sumManual > 0) {
            $insightParts[] = "Evaluated so far: {$sumAuto} auto (system) and {$sumManual} manual (evaluator). Auto-promoted when the next semester is activated: {$sumPromoted}.";
        } else {
            $insightParts[] = 'Regulars who pass all subjects are auto-evaluated (and auto-promoted when the next semester is activated). Irregulars are evaluated manually.';
        }

        return [
            'series' => $series,
            'insight' => implode(' ', $insightParts),
            'totals' => [
                'unevaluated' => $sumUneval,
                'auto_evaluated' => $sumAuto,
                'auto_promoted' => $sumPromoted,
                'manual_evaluated' => $sumManual,
            ],
        ];
    }

    private function buildEvaluatorsByYear(
        array $yearBuckets,
        $user,
        ?int $programId = null,
        ?int $departmentId = null
    ): array {
        $adviserQuery = TblUser::query()
            ->with(['role', 'facultyProfile'])
            ->whereHas('role', fn ($r) => $r->whereIn('role_name', ['Adviser', 'Evaluator', 'Faculty']))
            ->where(function ($q) {
                $q->whereRaw('LOWER(status) = ?', ['active'])
                    ->orWhereNull('status');
            });

        // Capacity chart should follow selected program scope.
        if ($programId) {
            $adviserQuery->whereHas('facultyProfile', function ($q) use ($programId, $departmentId) {
                $q->where('program_id', $programId);
                if ($departmentId) {
                    // Include department-level evaluators with no fixed program assignment.
                    $q->orWhere(function ($inner) use ($departmentId) {
                        $inner->whereNull('program_id')->where('department_id', $departmentId);
                    });
                }
            });
        } elseif ($user->hasRole('Dean') && ! $user->isAdmin()) {
            $deanProfile = DeanProfile::where('user_id', $user->user_id)->first();
            if ($deanProfile && $deanProfile->department_id) {
                $adviserQuery->whereHas('facultyProfile', function ($q) use ($deanProfile) {
                    $q->where('department_id', $deanProfile->department_id);
                });
            } elseif ($deanProfile && $deanProfile->program_id) {
                $adviserQuery->whereHas('facultyProfile', function ($q) use ($deanProfile) {
                    $q->where('program_id', $deanProfile->program_id);
                });
            }
        }

        $advisers = $adviserQuery->get();

        $byYear = [];
        foreach ($yearBuckets as $bucket) {
            $byYear[(int) $bucket['year_level_id']] = [
                'year_level_id' => (int) $bucket['year_level_id'],
                'label' => $bucket['label'],
                'evaluators' => [],
                'count' => 0,
            ];
        }

        foreach ($advisers as $adv) {
            $ids = $adv->effectiveEvaluationYearLevelIds();
            $name = trim(
                ($adv->facultyProfile->first_name ?? '').' '.($adv->facultyProfile->last_name ?? '')
            );
            if ($name === '') {
                $name = $adv->email ?? "User #{$adv->user_id}";
            }
            $entry = [
                'user_id' => (int) $adv->user_id,
                'name' => $name,
                'email' => $adv->email,
            ];
            if ($ids === null || $ids === []) {
                // Unrestricted → appears under every year bucket as available capacity.
                foreach ($byYear as $yl => $_) {
                    $byYear[$yl]['evaluators'][] = $entry + ['scope' => 'all_years'];
                }
            } else {
                foreach ($ids as $yl) {
                    if (! isset($byYear[$yl])) {
                        continue;
                    }
                    $byYear[$yl]['evaluators'][] = $entry + ['scope' => 'assigned'];
                }
            }
        }

        $series = [];
        foreach ($byYear as $yl => $row) {
            // Dedupe by user_id
            $seen = [];
            $unique = [];
            foreach ($row['evaluators'] as $ev) {
                $uid = (int) $ev['user_id'];
                if (isset($seen[$uid])) {
                    continue;
                }
                $seen[$uid] = true;
                $unique[] = $ev;
            }
            $row['evaluators'] = $unique;
            $row['count'] = count($unique);
            $series[] = $row;
        }

        return ['series' => $series];
    }

    private function buildRushForecast(Builder $studentBase): array
    {
        $tz = 'Asia/Manila';
        $today = now($tz)->startOfDay();
        // Calendar weeks: Mon–Sun, ending with the week that contains today.
        $thisWeekStart = $today->copy()->startOfWeek(Carbon::MONDAY);
        $windowStart = $thisWeekStart->copy()->subWeeks(3);
        $windowEnd = $today->copy()->endOfDay();

        $weekBuckets = [];
        $byDowPerWeek = [];
        for ($i = 0; $i < 4; $i++) {
            $weekStart = $windowStart->copy()->addWeeks($i);
            $weekEnd = $weekStart->copy()->endOfWeek(Carbon::SUNDAY);
            $key = 'w'.$weekStart->format('o').'_'.$weekStart->isoWeek();
            $shortRange = $weekStart->format('M j').'–'.$weekEnd->format('j');
            if ($weekStart->format('M') !== $weekEnd->format('M')) {
                $shortRange = $weekStart->format('M j').'–'.$weekEnd->format('M j');
            }
            $isCurrent = $weekStart->equalTo($thisWeekStart);
            $weekBuckets[] = [
                'key' => $key,
                'label' => $shortRange,
                'full_label' => $weekStart->toDateString().' → '.$weekEnd->toDateString(),
                'iso_week' => (int) $weekStart->isoWeek(),
                'iso_year' => (int) $weekStart->isoWeekYear(),
                'start' => $weekStart->toDateString(),
                'end' => $weekEnd->toDateString(),
                'is_current' => $isCurrent,
                'count' => 0,
            ];
            $byDowPerWeek[$key] = [
                1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0, 6 => 0, 7 => 0,
            ];
        }

        $completions = AcademicRecordEvaluationComplete::query()
            ->whereIn('student_id', (clone $studentBase)->select('student_id'))
            ->whereBetween('completed_at', [
                $windowStart->copy()->startOfDay()->utc(),
                $windowEnd->copy()->utc(),
            ])
            ->get(['completed_at']);

        $emptyDow = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0, 6 => 0, 7 => 0];
        $byDow = $emptyDow;
        $weekIndexByKey = [];
        foreach ($weekBuckets as $idx => $bucket) {
            $weekIndexByKey[$bucket['key']] = $idx;
        }

        foreach ($completions as $c) {
            if (! $c->completed_at) {
                continue;
            }
            $local = $c->completed_at->copy()->timezone($tz);
            $localDay = $local->copy()->startOfDay();
            if ($localDay->lt($windowStart) || $localDay->gt($today)) {
                continue;
            }

            $weekStart = $localDay->copy()->startOfWeek(Carbon::MONDAY);
            $weekKey = 'w'.$weekStart->format('o').'_'.$weekStart->isoWeek();
            if (! isset($weekIndexByKey[$weekKey])) {
                continue;
            }

            $weekBuckets[$weekIndexByKey[$weekKey]]['count']++;

            $dow = (int) $local->dayOfWeekIso;
            if ($dow >= 1 && $dow <= 7) {
                $byDow[$dow]++;
                $byDowPerWeek[$weekKey][$dow]++;
            }
        }

        $weekdayFromDow = static function (array $byDowMap, ?Carbon $weekStart = null): array {
            // Working-day chart only (Mon–Sat). Sunday evaluations still count in weekly totals.
            $names = [
                1 => ['mon', 'Mon'],
                2 => ['tue', 'Tue'],
                3 => ['wed', 'Wed'],
                4 => ['thu', 'Thu'],
                5 => ['fri', 'Fri'],
                6 => ['sat', 'Sat'],
            ];
            $out = [];
            foreach ($names as $iso => [$key, $short]) {
                $label = $short;
                if ($weekStart) {
                    $day = $weekStart->copy()->addDays($iso - 1);
                    $label = $short.' '.$day->format('j');
                }
                $out[] = [
                    'key' => $key,
                    'label' => $label,
                    'count' => $byDowMap[$iso] ?? 0,
                ];
            }

            return $out;
        };

        $weekday = $weekdayFromDow($byDow);
        $weekdayByWeek = [];
        foreach ($weekBuckets as $bucket) {
            $weekKey = $bucket['key'];
            $weekStart = Carbon::parse($bucket['start'], $tz)->startOfDay();
            $days = $weekdayFromDow($byDowPerWeek[$weekKey], $weekStart);
            $peakDay = collect($days)->sortByDesc('count')->first();
            $weekdayByWeek[$weekKey] = [
                'by_weekday' => $days,
                'range_label' => $bucket['full_label'],
                'insight_day' => ($peakDay && ($peakDay['count'] ?? 0) > 0)
                    ? "{$peakDay['label']} is the busiest day ({$peakDay['count']}) in {$bucket['label']} — put extra evaluators that day."
                    : "No day peak in {$bucket['label']} yet.",
            ];
        }

        // Prefer current calendar week label in charts.
        foreach ($weekBuckets as &$bucket) {
            if (! empty($bucket['is_current'])) {
                $bucket['label'] = $bucket['label'].' · now';
            }
        }
        unset($bucket);

        $peakWeek = collect($weekBuckets)->sortByDesc('count')->first();
        $peakDay = collect($weekday)->sortByDesc('count')->first();

        return [
            'range_label' => $windowStart->toDateString().' → '.$today->toDateString(),
            'by_week' => array_values($weekBuckets),
            'by_weekday' => $weekday,
            'by_weekday_by_week' => $weekdayByWeek,
            'insight_week' => ($peakWeek && ($peakWeek['count'] ?? 0) > 0)
                ? "{$peakWeek['label']} is highest ({$peakWeek['count']}) — assign more evaluators if that calendar week’s rush repeats."
                : 'Not enough completion history yet for a rush pattern.',
            'insight_day' => ($peakDay && ($peakDay['count'] ?? 0) > 0)
                ? "{$peakDay['label']} is the busiest weekday ({$peakDay['count']}) across the current calendar window — put extra evaluators that day."
                : 'No day peak yet — keep logging completed evaluations.',
        ];
    }

    private function buildDecisionHints(
        array $workload,
        array $enrollment,
        array $unevaluated,
        array $evaluators,
        array $forecast,
        $program
    ): array {
        $hints = [];
        if (! empty($workload['insight'])) {
            $hints[] = ['section' => 'workload', 'text' => $workload['insight']];
        }
        if (! empty($enrollment['insight'])) {
            $hints[] = ['section' => 'enrollment', 'text' => $enrollment['insight']];
        }
        if (! empty($unevaluated['insight'])) {
            $hints[] = ['section' => 'unevaluated', 'text' => $unevaluated['insight']];
        }

        $evalSeries = $evaluators['series'] ?? [];
        $unevalSeries = $unevaluated['series'] ?? [];
        $unevalMap = [];
        foreach ($unevalSeries as $row) {
            $unevalMap[(int) $row['year_level_id']] = (int) ($row['unevaluated'] ?? 0);
        }
        $worst = null;
        foreach ($evalSeries as $row) {
            $yl = (int) $row['year_level_id'];
            $evCount = max(1, (int) ($row['count'] ?? 0));
            $left = $unevalMap[$yl] ?? 0;
            $load = $left / $evCount;
            if ($left <= 0) {
                continue;
            }
            if ($worst === null || $load > $worst['load']) {
                $worst = [
                    'label' => $row['label'],
                    'evaluators' => (int) ($row['count'] ?? 0),
                    'unevaluated' => $left,
                    'load' => $load,
                ];
            }
        }
        if ($worst && $worst['evaluators'] <= 1 && $worst['unevaluated'] >= 5) {
            $hints[] = [
                'section' => 'capacity',
                'text' => "{$worst['label']} still has {$worst['unevaluated']} unevaluated with only {$worst['evaluators']} evaluator — assign more people to that year level.",
            ];
        } elseif ($worst && $worst['load'] >= 20) {
            $hints[] = [
                'section' => 'capacity',
                'text' => "{$worst['label']} has high remaining load ({$worst['unevaluated']} students / {$worst['evaluators']} evaluators).",
            ];
        }

        if (! empty($forecast['insight_week'])) {
            $hints[] = ['section' => 'forecast', 'text' => $forecast['insight_week']];
        }
        if (! empty($forecast['insight_day'])) {
            $hints[] = ['section' => 'forecast', 'text' => $forecast['insight_day']];
        }

        return $hints;
    }
}
