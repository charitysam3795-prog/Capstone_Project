<?php

namespace App\Http\Controllers\Evaluation;

use App\Http\Controllers\Controller;
use App\Models\Evaluation;
use App\Models\StudentProfile;
use App\Services\GradeScaleHelper;
use App\Services\IncComplianceExpiryService;
use App\Services\StudentCurriculumEvaluationBuilder;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class EvaluationController extends Controller
{
    public function index(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user || (! $user->canWorkOnStudentEvaluations())) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $query = Evaluation::with(['student', 'subject', 'academicYear', 'semester', 'section', 'evaluatedBy']);

            if ($this->requiresAssignedProgramScope($user)) {
                $assignedProgramId = $this->assignedEvaluationProgramId($user);
                if (! $assignedProgramId) {
                    return response()->json($query->whereRaw('1 = 0')->paginate($request->get('per_page', 15)));
                }
                $query->whereHas('student', function ($sq) use ($assignedProgramId) {
                    $sq->where(function ($w) use ($assignedProgramId) {
                        $w->where('Current_Program', $assignedProgramId)
                            ->orWhere('current_program', $assignedProgramId);
                    });
                });
            }

            // Apply filters
            if ($request->has('student_id')) {
                $query->where('student_id', $request->student_id);
            }
            if ($request->has('subject_id')) {
                $query->where('subject_id', $request->subject_id);
            }
            if ($request->has('academic_year_id')) {
                $query->where('academic_year_id', $request->academic_year_id);
            }
            if ($request->has('semester_id')) {
                $query->where('semester_id', $request->semester_id);
            }
            if ($request->has('evaluation_status')) {
                $query->where('evaluation_status', $request->evaluation_status);
            }

            $evaluations = $query->orderBy('evaluation_date', 'desc')
                ->paginate($request->get('per_page', 15));

            return response()->json($evaluations);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to fetch evaluations',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function store(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user || (! $user->canWorkOnStudentEvaluations())) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $validated = $request->validate([
                'student_id' => 'required|exists:tbl_student_profile,student_id',
                'subject_id' => 'required|exists:tbl_subjects,subject_id',
                'elective_slot_id' => 'nullable|exists:tbl_elective_slot,elective_slot_id',
                'academic_year_id' => 'required|exists:tbl_academic_year,academic_year_id',
                'semester_id' => 'required|exists:tbl_semester,semester_id',
                'section_id' => 'nullable|exists:tbl_section,section_id',
                'elective_slot_id' => 'nullable|exists:tbl_elective_slot,elective_slot_id',
                'grade' => 'nullable|string|max:20',
                'evaluation_status' => 'nullable|string|in:passed,failed,ongoing,dropped,incomplete,inc,complete',
                'evaluated_by' => 'nullable|exists:tbl_users,user_id',
                'modality_id' => 'nullable|exists:tbl_modality,modality_id',
                'evaluation_date' => 'nullable|date',
                'enrolled_date' => 'nullable|date',
                'inc_compliance_deadline' => 'nullable|date',
            ]);

            $studentProfile = StudentProfile::query()->find($validated['student_id']);
            if (! $studentProfile || ! $user->mayEvaluateStudentYearLevel(
                $studentProfile->year_level_id !== null ? (int) $studentProfile->year_level_id : null
            )) {
                return response()->json([
                    'message' => 'You are not permitted to evaluate students in this year level.',
                ], 403);
            }
            if ($denied = $this->denyOutsideAssignedProgram($user, $studentProfile)) {
                return $denied;
            }

            DB::beginTransaction();
            $validated['evaluated_by'] = $validated['evaluated_by'] ?? $user->user_id;
            if ($studentProfile->current_program !== null && $studentProfile->current_program !== '') {
                $validated['graded_under_program_id'] = (int) $studentProfile->current_program;
            }
            if (array_key_exists('evaluation_status', $validated)) {
                $validated['evaluation_status'] = $this->normalizeEvaluationStatus($validated['evaluation_status']);
            }
            app(GradeScaleHelper::class)->applyManualEvaluationNormalization(
                $validated,
                $studentProfile->current_program !== null ? (int) $studentProfile->current_program : null,
                (int) $validated['subject_id']
            );
            $this->assertPrerequisitesAllowGradeOutcome(
                (int) $validated['student_id'],
                (int) $validated['subject_id'],
                (int) $validated['semester_id'],
                $validated['grade'] ?? null,
                $validated['evaluation_status'] ?? null
            );
            $this->rejectPastIncDeadlineFromRequest($validated);
            $this->applyIncComplianceDeadlineForCreate($validated);
            $this->ensureIncDeadlineNotBeforeToday($validated);
            $evaluation = Evaluation::create($validated);

            DB::commit();

            $this->syncStudentYearLevelFromEvaluations($evaluation->student_id);

            return response()->json([
                'message' => 'Evaluation created successfully',
                'evaluation' => $evaluation->load(['student', 'subject', 'academicYear', 'semester']),
            ], 201);

        } catch (ValidationException $e) {
            DB::rollBack();

            return response()->json([
                'error' => 'Validation failed',
                'messages' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'error' => 'Failed to create evaluation',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function show(string $id)
    {
        try {
            $user = request()->user();
            if (! $user || (! $user->canWorkOnStudentEvaluations())) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $evaluation = Evaluation::with([
                'student',
                'subject',
                'academicYear',
                'semester',
            ])->findOrFail($id);

            if ($evaluation->student && ($denied = $this->denyOutsideAssignedProgram($user, $evaluation->student))) {
                return $denied;
            }

            return response()->json($evaluation);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Evaluation not found',
                'message' => $e->getMessage(),
            ], 404);
        }
    }

    public function update(Request $request, string $id)
    {
        try {
            $user = $request->user();
            if (! $user || (! $user->canWorkOnStudentEvaluations())) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $evaluation = Evaluation::findOrFail($id);

            $studentProfile = StudentProfile::query()->find($evaluation->student_id);
            if (! $studentProfile || ! $user->mayEvaluateStudentYearLevel(
                $studentProfile->year_level_id !== null ? (int) $studentProfile->year_level_id : null
            )) {
                return response()->json([
                    'message' => 'You are not permitted to evaluate students in this year level.',
                ], 403);
            }
            if ($denied = $this->denyOutsideAssignedProgram($user, $studentProfile)) {
                return $denied;
            }

            $validated = $request->validate([
                'section_id' => 'nullable|exists:tbl_section,section_id',
                'grade' => 'nullable|string|max:20',
                'evaluation_status' => 'nullable|string|in:passed,failed,ongoing,dropped,incomplete,inc,complete',
                'evaluated_by' => 'nullable|exists:tbl_users,user_id',
                'modality_id' => 'nullable|exists:tbl_modality,modality_id',
                'evaluation_date' => 'nullable|date',
                'enrolled_date' => 'nullable|date',
                'inc_compliance_deadline' => 'nullable|date',
            ]);

            DB::beginTransaction();

            $validated['evaluated_by'] = $validated['evaluated_by'] ?? $user->user_id;
            if ($studentProfile->current_program !== null && $studentProfile->current_program !== '') {
                $validated['graded_under_program_id'] = (int) $studentProfile->current_program;
            }
            if (array_key_exists('evaluation_status', $validated)) {
                $validated['evaluation_status'] = $this->normalizeEvaluationStatus($validated['evaluation_status']);
            }
            app(GradeScaleHelper::class)->applyManualEvaluationNormalization(
                $validated,
                $studentProfile->current_program !== null ? (int) $studentProfile->current_program : null,
                (int) $evaluation->subject_id
            );
            $this->rejectPastIncDeadlineOnUpdate($evaluation, $validated);
            $this->mergeIncComplianceDeadlineForUpdate($evaluation, $validated);
            $effectiveStatus = array_key_exists('evaluation_status', $validated)
                ? $validated['evaluation_status']
                : $this->normalizeEvaluationStatus($evaluation->evaluation_status);
            $this->ensureIncDeadlineNotBeforeToday($validated, $effectiveStatus);
            $mergedGrade = array_key_exists('grade', $validated) ? $validated['grade'] : $evaluation->grade;
            $mergedStatus = array_key_exists('evaluation_status', $validated)
                ? $validated['evaluation_status']
                : $evaluation->evaluation_status;
            $this->assertPrerequisitesAllowGradeOutcome(
                (int) $evaluation->student_id,
                (int) $evaluation->subject_id,
                (int) $evaluation->semester_id,
                ($mergedGrade === '' ? null : $mergedGrade),
                ($mergedStatus === '' ? null : $mergedStatus)
            );
            $evaluation->update($validated);

            DB::commit();

            $this->syncStudentYearLevelFromEvaluations($evaluation->student_id);

            return response()->json([
                'message' => 'Evaluation updated successfully',
                'evaluation' => $evaluation->load(['student', 'subject', 'academicYear', 'semester']),
            ]);

        } catch (ValidationException $e) {
            DB::rollBack();

            return response()->json([
                'error' => 'Validation failed',
                'messages' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'error' => 'Failed to update evaluation',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function destroy(string $id)
    {
        try {
            $user = request()->user();
            if (! $user || ! $user->canDeleteEvaluationsOrDeanAcademicRecords()) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $evaluation = Evaluation::findOrFail($id);
            $studentTableId = (int) $evaluation->student_id;

            DB::beginTransaction();

            // Delete related evaluation scores
            // No longer needed since we removed evaluation scores table

            $evaluation->delete();

            DB::commit();

            $this->syncStudentYearLevelFromEvaluations($studentTableId);

            return response()->json(['message' => 'Evaluation deleted successfully']);

        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'error' => 'Failed to delete evaluation',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function getEvaluationCriteria(Request $request)
    {
        // Removed - no longer needed
        return response()->json([]);
    }

    public function getEvaluationPeriods(Request $request)
    {
        // Removed - no longer needed
        return response()->json([]);
    }

    public function getStudentEvaluationSummary(Request $request, $studentId)
    {
        try {
            $user = $request->user();
            if (! $user || (! $user->canWorkOnStudentEvaluations())) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $student = StudentProfile::with(['program'])->findOrFail($studentId);

            if (! $user->mayEvaluateStudentYearLevel(
                $student->year_level_id !== null ? (int) $student->year_level_id : null
            )) {
                return response()->json([
                    'message' => 'You are not permitted to evaluate students in this year level.',
                ], 403);
            }

            app(IncComplianceExpiryService::class)->expireOverdue((int) $studentId);

            $evaluations = Evaluation::where('student_id', $studentId)
                ->with(['subject', 'academicYear', 'semester'])
                ->get();

            $summary = [
                'total_evaluations' => $evaluations->count(),
                'passed_evaluations' => $evaluations->where('evaluation_status', 'passed')->count(),
                'failed_evaluations' => $evaluations->where('evaluation_status', 'failed')->count(),
                'ongoing_evaluations' => $evaluations->where('evaluation_status', 'ongoing')->count(),
                'average_grade' => $evaluations->whereNotNull('grade')->avg('grade'),
            ];

            return response()->json([
                'student' => $student,
                'summary' => $summary,
                'evaluations' => $evaluations,
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to fetch student evaluation summary',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    private function normalizeEvaluationStatus(?string $status): ?string
    {
        if ($status === null) {
            return null;
        }
        $t = strtolower(trim($status));
        if ($t === '') {
            return null;
        }

        return $t === 'inc' ? 'incomplete' : $t;
    }

    private function statusIsIncomplete(?string $status): bool
    {
        return $this->normalizeEvaluationStatus($status) === 'incomplete';
    }

    private function applyIncComplianceDeadlineForCreate(array &$validated): void
    {
        $status = $this->normalizeEvaluationStatus($validated['evaluation_status'] ?? null);
        $validated['evaluation_status'] = $status;

        if (! $this->statusIsIncomplete($status)) {
            $validated['inc_compliance_deadline'] = null;

            return;
        }

        $raw = $validated['inc_compliance_deadline'] ?? null;
        if ($raw !== null && $raw !== '') {
            $validated['inc_compliance_deadline'] = Carbon::parse($raw)->format('Y-m-d');

            return;
        }

        $anchor = Carbon::parse($validated['evaluation_date'] ?? now())->startOfDay();
        $validated['inc_compliance_deadline'] = $this->defaultIncDeadlineFromAnchor($anchor);
    }

    private function mergeIncComplianceDeadlineForUpdate(Evaluation $evaluation, array &$updates): void
    {
        $newStatus = array_key_exists('evaluation_status', $updates)
            ? $updates['evaluation_status']
            : $this->normalizeEvaluationStatus($evaluation->evaluation_status);

        if (! $this->statusIsIncomplete($newStatus)) {
            $updates['inc_compliance_deadline'] = null;

            return;
        }

        $deadlineKeyPresent = array_key_exists('inc_compliance_deadline', $updates);
        $deadlineVal = $deadlineKeyPresent ? $updates['inc_compliance_deadline'] : null;
        $wasIncomplete = $this->statusIsIncomplete($evaluation->evaluation_status);

        if ($deadlineKeyPresent && $deadlineVal !== null && $deadlineVal !== '') {
            $updates['inc_compliance_deadline'] = Carbon::parse($deadlineVal)->format('Y-m-d');

            return;
        }

        if ($deadlineKeyPresent && ($deadlineVal === null || $deadlineVal === '')) {
            $anchorRaw = $updates['evaluation_date'] ?? $evaluation->evaluation_date ?? now();
            $anchor = Carbon::parse($anchorRaw)->startOfDay();
            $updates['inc_compliance_deadline'] = $this->defaultIncDeadlineFromAnchor($anchor);

            return;
        }

        if ($wasIncomplete && $evaluation->inc_compliance_deadline) {
            unset($updates['inc_compliance_deadline']);

            return;
        }

        $anchorRaw = $updates['evaluation_date'] ?? $evaluation->evaluation_date ?? now();
        $anchor = Carbon::parse($anchorRaw)->startOfDay();
        $updates['inc_compliance_deadline'] = $this->defaultIncDeadlineFromAnchor($anchor);
    }

    private function defaultIncDeadlineFromAnchor(Carbon $anchor): string
    {
        $days = $this->incDefaultComplianceDays();
        $proposed = $anchor->copy()->addDays($days);
        $today = Carbon::today();

        if ($proposed->lt($today)) {
            return $today->copy()->addDays($days)->format('Y-m-d');
        }

        return $proposed->format('Y-m-d');
    }

    private function rejectIncDeadlineInPast(string $raw): void
    {
        if (Carbon::parse($raw)->startOfDay()->lt(Carbon::today())) {
            throw ValidationException::withMessages([
                'inc_compliance_deadline' => ['The comply-by date cannot be before today.'],
            ]);
        }
    }

    private function rejectPastIncDeadlineFromRequest(array $validated): void
    {
        $st = $this->normalizeEvaluationStatus($validated['evaluation_status'] ?? null);
        if (! $this->statusIsIncomplete($st)) {
            return;
        }
        $raw = $validated['inc_compliance_deadline'] ?? null;
        if ($raw === null || $raw === '') {
            return;
        }
        $this->rejectIncDeadlineInPast((string) $raw);
    }

    private function rejectPastIncDeadlineOnUpdate(Evaluation $evaluation, array $validated): void
    {
        if (! array_key_exists('inc_compliance_deadline', $validated)) {
            return;
        }
        $deadlineVal = $validated['inc_compliance_deadline'];
        if ($deadlineVal === null || $deadlineVal === '') {
            return;
        }
        $effectiveStatus = array_key_exists('evaluation_status', $validated)
            ? $validated['evaluation_status']
            : $this->normalizeEvaluationStatus($evaluation->evaluation_status);
        if (! $this->statusIsIncomplete($effectiveStatus)) {
            return;
        }
        $this->rejectIncDeadlineInPast((string) $deadlineVal);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function ensureIncDeadlineNotBeforeToday(array &$data, ?string $effectiveStatus = null): void
    {
        $st = $effectiveStatus !== null
            ? $this->normalizeEvaluationStatus($effectiveStatus)
            : $this->normalizeEvaluationStatus($data['evaluation_status'] ?? null);
        if (! $this->statusIsIncomplete($st)) {
            return;
        }
        $d = $data['inc_compliance_deadline'] ?? null;
        if ($d === null || $d === '') {
            return;
        }
        if (Carbon::parse($d)->startOfDay()->lt(Carbon::today())) {
            $days = $this->incDefaultComplianceDays();
            $data['inc_compliance_deadline'] = Carbon::today()->copy()->addDays($days)->format('Y-m-d');
        }
    }

    private function incDefaultComplianceDays(): int
    {
        return (int) config('academic.inc_default_compliance_days', 30);
    }

    /**
     * Block creating/updating a grade or outcome when curriculum prerequisites are not met (except when clearing both).
     */
    private function assertPrerequisitesAllowGradeOutcome(
        int $studentId,
        int $subjectId,
        int $semesterId,
        ?string $newGrade,
        ?string $newStatus
    ): void {
        $gradeEmpty = $newGrade === null || $newGrade === '';
        $statusEmpty = $newStatus === null || $newStatus === '';
        if ($gradeEmpty && $statusEmpty) {
            return;
        }

        $profile = StudentProfile::query()->where('student_id', $studentId)->first();
        if (! $profile) {
            return;
        }

        $builder = app(StudentCurriculumEvaluationBuilder::class);
        $built = $builder->buildPayload($profile);
        $rows = $built['rows'] ?? [];
        $slot = null;
        foreach ($rows as $r) {
            if ((int) ($r['subject_id'] ?? 0) === $subjectId && (int) ($r['semester_id'] ?? 0) === $semesterId) {
                $slot = $r;
                break;
            }
        }
        if ($slot === null) {
            return;
        }
        $overrideKeys = is_array($profile->major_standing_override_keys)
            ? $profile->major_standing_override_keys
            : [];
        if (! $builder->rowPrerequisitesMet($rows, $slot, $overrideKeys)) {
            throw ValidationException::withMessages([
                'evaluation_status' => [
                    'Prerequisites for this subject are not satisfied. Pass or credit required subjects first, or clear this row.',
                ],
            ]);
        }
    }

    private function syncStudentYearLevelFromEvaluations(int $studentTableId): void
    {
        $profile = StudentProfile::query()->where('student_id', $studentTableId)->first();
        if ($profile) {
            app(StudentCurriculumEvaluationBuilder::class)->syncStudentProfileFromCurriculumProgress($profile);
        }
    }

    private function requiresAssignedProgramScope($user): bool
    {
        return $user->isEvaluatorLike() || $user->hasRole('Program Head');
    }

    private function assignedEvaluationProgramId($user): ?int
    {
        if ($user->isEvaluatorLike()) {
            $programId = $user->facultyProfile()->value('program_id');

            return $programId ? (int) $programId : null;
        }

        if ($user->hasRole('Program Head')) {
            return $user->program_id ? (int) $user->program_id : null;
        }

        return null;
    }

    private function denyOutsideAssignedProgram($user, StudentProfile $profile): ?JsonResponse
    {
        if (! $this->requiresAssignedProgramScope($user)) {
            return null;
        }

        $assignedProgramId = $this->assignedEvaluationProgramId($user);
        if (! $assignedProgramId || (int) $profile->current_program !== (int) $assignedProgramId) {
            return response()->json(['message' => 'Student is not in your assigned program'], 403);
        }

        return null;
    }
}
