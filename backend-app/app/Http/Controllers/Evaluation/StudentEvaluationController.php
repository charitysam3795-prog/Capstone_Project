<?php

namespace App\Http\Controllers\Evaluation;

use App\Http\Controllers\Controller;
use App\Models\AcademicRecordEvaluationComplete;
use App\Models\Curriculum;
use App\Models\DeanProfile;
use App\Models\Evaluation;
use App\Models\Program;
use App\Models\StudentProfile;
use App\Models\TblUser;
use App\Models\YearLevel;
use App\Services\GradeScaleHelper;
use App\Services\StudentCurriculumEvaluationBuilder;
use App\Support\CachedSchema;
use App\Support\EvaluationStanding;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StudentEvaluationController extends Controller
{
    private function effectiveEvaluationYearLevelId(StudentProfile $profile): ?int
    {
        return EvaluationStanding::effectiveYearLevelId($profile);
    }

    /**
     * Get curriculum + enrollment based evaluation for a student
     * looked up by their student_id_number (e.g. 02-2324-07413).
     *
     * This endpoint is intended for admins, deans, and faculty to
     * monitor a student's progress.
     */
    public function getByStudentIdNumber(Request $request, string $studentIdNumber)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $isStaff = $user->canWorkOnStudentEvaluations();

            if ($user->hasRole('Student')) {
                $profile = StudentProfile::where('user_id', $user->user_id)->with(['program', 'track', 'previousProgram', 'yearLevel', 'semester', 'academicYear'])->first();
                if (! $profile) {
                    return response()->json(['message' => 'Student profile not found'], 404);
                }
                $ownNum = (string) ($profile->student_id_number ?? $profile->student_number ?? '');
                if (trim($ownNum) !== trim((string) $studentIdNumber)) {
                    return response()->json(['message' => 'Forbidden'], 403);
                }
            } elseif (! $isStaff) {
                return response()->json(['message' => 'Forbidden'], 403);
            } else {
                $profile = StudentProfile::whereStudentIdNumber($studentIdNumber)
                    ->with(['program', 'track', 'previousProgram', 'yearLevel', 'semester', 'academicYear'])
                    ->first();

                if (! $profile) {
                    return response()->json(['message' => 'Student not found'], 404);
                }

                if ($denied = $this->gateStaffStudentEvaluation($user, $profile, null, true)) {
                    return $denied;
                }

                $yearAllowed = ($profile->is_simulation ?? false) || $user->mayEvaluateStudentYearLevel(
                    $this->effectiveEvaluationYearLevelId($profile)
                );
                $completedByThisUser = AcademicRecordEvaluationComplete::query()
                    ->where('student_id', $profile->student_id)
                    ->where('completed_by', $user->user_id)
                    ->exists();
                if (! $yearAllowed && ! $completedByThisUser) {
                    return response()->json([
                        'message' => 'You are not permitted to evaluate students in this year level.',
                    ], 403);
                }
            }

            $payload = app(StudentCurriculumEvaluationBuilder::class)->buildPayload($profile);

            return response()->json($payload);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to compute student evaluation',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Preview curriculum + evaluations for a student on a different program without saving.
     */
    public function previewStudentProgram(Request $request, string $studentIdNumber)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $validated = $request->validate([
                'program_id' => 'required|integer|exists:tbl_program,program_id',
            ]);

            if ($user->hasRole('Student')) {
                return response()->json(['message' => 'Forbidden'], 403);
            }

            if (! $user->canWorkOnStudentEvaluations()) {
                return response()->json(['message' => 'Forbidden'], 403);
            }

            $profile = StudentProfile::whereStudentIdNumber($studentIdNumber)
                ->with(['program', 'track', 'previousProgram'])
                ->first();

            if (! $profile) {
                return response()->json(['message' => 'Student not found'], 404);
            }

            if ($denied = $this->gateStaffStudentEvaluation($user, $profile, null, true)) {
                return $denied;
            }

            $yearAllowed = ($profile->is_simulation ?? false) || $user->mayEvaluateStudentYearLevel(
                $this->effectiveEvaluationYearLevelId($profile)
            );
            $completedByThisUser = AcademicRecordEvaluationComplete::query()
                ->where('student_id', $profile->student_id)
                ->where('completed_by', $user->user_id)
                ->exists();
            if (! $yearAllowed && ! $completedByThisUser) {
                return response()->json([
                    'message' => 'You are not permitted to evaluate students in this year level.',
                ], 403);
            }

            $previewProgramId = (int) $validated['program_id'];
            $savedProgramId = $profile->current_program !== null ? (int) $profile->current_program : null;
            if ($savedProgramId !== null && $savedProgramId === $previewProgramId) {
                $payload = app(StudentCurriculumEvaluationBuilder::class)->buildPayload($profile);

                return response()->json($payload);
            }

            $payload = app(StudentCurriculumEvaluationBuilder::class)
                ->buildPayloadForProgramPreview($profile, $previewProgramId);

            return response()->json($payload);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to preview student program',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get list of students for evaluation view
     * For deans, filter by their assigned program
     * For admins and faculty, show all students
     */
    public function listStudents(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            if (! $user->canWorkOnStudentEvaluations()) {
                return response()->json(['message' => 'Forbidden'], 403);
            }

            $query = StudentProfile::with([
                'program:program_id,program_name,program_code,department_id',
                'yearLevel:year_level_id,year_level',
            ]);

            /** Role scope (department / assigned program / year levels) — practice students bypass it. */
            $scopeFilters = [];
            $noScopedStudents = false;

            // If user is a dean, filter by assigned department; old program assignment is a fallback.
            if ($user->hasRole('Dean')) {
                $deanProfile = DeanProfile::where('user_id', $user->user_id)->first();
                if ($deanProfile && $deanProfile->department_id) {
                    $scopeFilters[] = function ($q) use ($deanProfile) {
                        $q->whereHas('program', function ($p) use ($deanProfile) {
                            $p->where('department_id', $deanProfile->department_id);
                        });
                    };
                } elseif ($deanProfile && $deanProfile->program_id) {
                    $scopeFilters[] = function ($q) use ($deanProfile) {
                        $q->where(function ($inner) use ($deanProfile) {
                            $inner->where('Current_Program', $deanProfile->program_id)
                                ->orWhere('current_program', $deanProfile->program_id);
                        });
                    };
                }
            }

            if ($this->requiresAssignedProgramScope($user)) {
                $assignedProgramId = $this->assignedEvaluationProgramId($user);
                if (! $assignedProgramId) {
                    $noScopedStudents = true;
                } else {
                    $scopeFilters[] = function ($q) use ($assignedProgramId) {
                        $q->where(function ($inner) use ($assignedProgramId) {
                            $inner->where('Current_Program', $assignedProgramId)
                                ->orWhere('current_program', $assignedProgramId);
                        });
                    };
                }
            }

            // Apply search filter if provided
            $search = trim((string) $request->query('search', ''));
            if ($search !== '') {
                $like = '%'.$search.'%';
                $query->where(function ($q) use ($like) {
                    $q->where('student_id_number', 'like', $like)
                        ->orWhere('first_name', 'like', $like)
                        ->orWhere('middle_name', 'like', $like)
                        ->orWhere('last_name', 'like', $like);
                });
            }

            // Apply program filter if provided
            $programId = $request->query('program_id');
            if ($programId) {
                $query->where(function ($q) use ($programId) {
                    $q->where('Current_Program', $programId)->orWhere('current_program', $programId);
                });
            }

            $academicRecord = $request->query('academic_record', 'all');
            if ($academicRecord === 'completed') {
                $query->whereExists(function ($q) {
                    $q->select(DB::raw(1))
                        ->from('tbl_academic_record_evaluation_complete as arc')
                        ->whereColumn('arc.student_id', 'tbl_student_profile.student_id');
                });
            } elseif ($academicRecord === 'pending') {
                $query->whereNotExists(function ($q) {
                    $q->select(DB::raw(1))
                        ->from('tbl_academic_record_evaluation_complete as arc')
                        ->whereColumn('arc.student_id', 'tbl_student_profile.student_id');
                });
            }

            $allowedYears = $user->hasRole('Dean') ? null : $user->effectiveEvaluationYearLevelIds();
            if ($allowedYears !== null) {
                if ($allowedYears === []) {
                    $noScopedStudents = true;
                } elseif ($academicRecord === 'completed') {
                    $scopeFilters[] = function ($q) use ($allowedYears, $user) {
                        $q->where(function ($inner) use ($allowedYears, $user) {
                            $inner->whereIn(DB::raw('COALESCE(promotion_target_year_level_id, year_level_id)'), $allowedYears)
                                ->orWhereIn('student_id', AcademicRecordEvaluationComplete::query()
                                    ->select('student_id')
                                    ->where('completed_by', $user->user_id));
                        });
                    };
                } else {
                    $scopeFilters[] = function ($q) use ($allowedYears) {
                        $q->whereIn(DB::raw('COALESCE(promotion_target_year_level_id, year_level_id)'), $allowedYears);
                    };
                }
            }

            $applyScope = function ($q) use ($scopeFilters, $noScopedStudents) {
                if ($noScopedStudents) {
                    $q->whereRaw('1 = 0');

                    return;
                }
                foreach ($scopeFilters as $filter) {
                    $filter($q);
                }
            };
            $hasSimulationColumn = CachedSchema::hasColumn('tbl_student_profile', 'is_simulation');
            if ($hasSimulationColumn && $academicRecord !== 'completed') {
                $query->where(function ($q) use ($applyScope) {
                    $q->where('is_simulation', true)
                        ->orWhere(function ($scoped) use ($applyScope) {
                            $applyScope($scoped);
                        });
                });
            } else {
                if ($noScopedStudents) {
                    return response()->json(['students' => []]);
                }
                $applyScope($query);
            }

            $total = (clone $query)->count();

            $defaultLimit = $search !== '' ? 200 : 2000;
            $limit = (int) $request->query('limit', $defaultLimit);
            $limit = max(1, min(5000, $limit > 0 ? $limit : $defaultLimit));

            $students = $query->orderByDesc('is_simulation')
                ->orderBy('last_name')
                ->orderBy('first_name')
                ->limit($limit)
                ->get([
                    'student_id',
                    'student_id_number',
                    'first_name',
                    'middle_name',
                    'last_name',
                    'academic_status',
                    'student_entry_type',
                    'Current_Program',
                    'year_level_id',
                    'promotion_target_year_level_id',
                    'promoted_next_sem_at',
                    'is_simulation',
                ]);

            $studentIds = $students->pluck('student_id')->all();
            $lastCompletedByStudent = [];
            /** @var array<int, list<string|null>> */
            $completionNotesByStudent = [];
            if ($studentIds !== []) {
                $completionRows = AcademicRecordEvaluationComplete::query()
                    ->select('student_id', 'completed_at', 'notes')
                    ->whereIn('student_id', $studentIds)
                    ->orderByDesc('completed_at')
                    ->get();

                foreach ($completionRows as $row) {
                    $sid = (int) $row->student_id;
                    if (! array_key_exists($sid, $lastCompletedByStudent)) {
                        $lastCompletedByStudent[$sid] = $row->completed_at;
                    }
                    $completionNotesByStudent[$sid][] = $row->notes;
                }
            }

            $extraYearIds = [];
            foreach ($students as $student) {
                $effectiveYearLevelId = $this->effectiveEvaluationYearLevelId($student);
                if (
                    $effectiveYearLevelId !== null
                    && (int) ($student->year_level_id ?? 0) !== (int) $effectiveYearLevelId
                ) {
                    $extraYearIds[] = (int) $effectiveYearLevelId;
                }
            }
            $extraYearNames = $extraYearIds === []
                ? collect()
                : YearLevel::query()
                    ->whereIn('year_level_id', array_values(array_unique($extraYearIds)))
                    ->pluck('year_level', 'year_level_id');

            $students = $students->map(function ($student) use (
                $lastCompletedByStudent,
                $completionNotesByStudent,
                $extraYearNames
            ) {
                $fullName = trim(
                    ($student->last_name ? $student->last_name.', ' : '').
                    ($student->first_name ?? '').
                    ($student->middle_name ? ' '.$student->middle_name : '')
                );

                $sid = (int) $student->student_id;
                $lastAt = $lastCompletedByStudent[$sid] ?? null;
                $isEvaluated = EvaluationStanding::evaluatedState(
                    EvaluationStanding::isIrregular($student),
                    $completionNotesByStudent[$sid] ?? [],
                    $student->promoted_next_sem_at
                ) !== null;
                $effectiveYearLevelId = $this->effectiveEvaluationYearLevelId($student);
                $effectiveYearLevelName = $student->yearLevel?->year_level;
                if (
                    $effectiveYearLevelId !== null
                    && (int) ($student->year_level_id ?? 0) !== (int) $effectiveYearLevelId
                ) {
                    $effectiveYearLevelName = $extraYearNames[(int) $effectiveYearLevelId] ?? $effectiveYearLevelName;
                }

                return [
                    'student_id' => $student->student_id,
                    'student_id_number' => $student->student_id_number,
                    'first_name' => $student->first_name,
                    'middle_name' => $student->middle_name,
                    'last_name' => $student->last_name,
                    'full_name' => $fullName ?: 'N/A',
                    'academic_status' => $student->academic_status,
                    'student_entry_type' => $student->student_entry_type,
                    'program' => $student->program,
                    'program_name' => $student->program->program_name ?? 'N/A',
                    'year_level_id' => $effectiveYearLevelId,
                    'year_level_name' => $effectiveYearLevelName,
                    'academic_record_completed_at' => $lastAt,
                    'academic_record_evaluated' => $isEvaluated,
                    'is_simulation' => (bool) ($student->is_simulation ?? false),
                ];
            });

            return response()->json([
                'students' => $students,
                'total' => $total,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to fetch students',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * @return JsonResponse|null JSON error response, or null if allowed
     */
    private function gateStaffStudentEvaluation(TblUser $user, StudentProfile $profile, ?int $yearLevelOverride = null, bool $skipYearLevelGate = false): ?JsonResponse
    {
        if ($user->hasRole('Student')) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $isStaff =
            $user->canWorkOnStudentEvaluations();

        if (! $isStaff) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        // Practice ([SIM]) students back the Guide walkthrough for every evaluating role.
        if ($profile->is_simulation ?? false) {
            return null;
        }

        if ($user->hasRole('Dean')) {
            $dean = DeanProfile::where('user_id', $user->user_id)->first();
            if ($dean && $dean->department_id) {
                $profile->loadMissing('program');
                if ((int) ($profile->program?->department_id ?? 0) !== (int) $dean->department_id) {
                    return response()->json(['message' => 'Student is not in your department'], 403);
                }
            } elseif ($dean && $dean->program_id) {
                $pid = $profile->current_program;
                if ((int) $pid !== (int) $dean->program_id) {
                    return response()->json(['message' => 'Student is not in your program'], 403);
                }
            }
        }

        if ($this->requiresAssignedProgramScope($user)) {
            $assignedProgramId = $this->assignedEvaluationProgramId($user);
            if (! $assignedProgramId || (int) $profile->current_program !== (int) $assignedProgramId) {
                return response()->json(['message' => 'Student is not in your assigned program'], 403);
            }
        }

        $yearLevelForGate = $yearLevelOverride ?? ($profile->year_level_id !== null ? (int) $profile->year_level_id : null);
        if (! $skipYearLevelGate && ! $user->mayEvaluateStudentYearLevel($yearLevelForGate)) {
            return response()->json([
                'message' => 'You are not permitted to evaluate students in this year level.',
            ], 403);
        }

        return null;
    }

    private function requiresAssignedProgramScope(TblUser $user): bool
    {
        return $user->isEvaluatorLike() || $user->hasRole('Program Head');
    }

    private function assignedEvaluationProgramId(TblUser $user): ?int
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

    /**
     * Record that the student is promoted to the next curriculum term (audit + profile sync).
     */
    public function promoteNextSemester(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $validated = $request->validate([
                'student_id' => 'required|integer|exists:tbl_student_profile,student_id',
                'evaluated_by' => 'required|string|max:150',
                'target_year_level_id' => 'required|integer|exists:year_level,year_level_id',
                'target_semester_id' => 'required|integer|exists:tbl_semester,semester_id',
                'track_id' => 'nullable|integer|exists:tbl_track,track_id',
            ]);

            $profile = StudentProfile::where('student_id', $validated['student_id'])
                ->with(['program', 'track'])
                ->firstOrFail();

            if ($denied = $this->gateStaffStudentEvaluation($user, $profile, null, true)) {
                return $denied;
            }

            $builder = app(StudentCurriculumEvaluationBuilder::class);
            $built = $builder->buildPayload($profile);
            $rows = $built['rows'] ?? [];
            $allowed = false;
            foreach ($rows as $row) {
                if ((int) ($row['year_level_id'] ?? 0) === (int) $validated['target_year_level_id']
                    && (int) ($row['semester_id'] ?? 0) === (int) $validated['target_semester_id']) {
                    $allowed = true;
                    break;
                }
            }

            if (! $allowed) {
                return response()->json([
                    'message' => 'The selected year and semester are not part of this student’s curriculum.',
                ], 422);
            }

            $terms = $this->orderedDistinctTermKeys($rows);
            $targetY = (int) $validated['target_year_level_id'];
            $targetS = (int) $validated['target_semester_id'];
            $targetIdx = null;
            foreach ($terms as $i => $t) {
                if ($t['year_level_id'] === $targetY && $t['semester_id'] === $targetS) {
                    $targetIdx = $i;
                    break;
                }
            }
            if ($targetIdx === null || $targetIdx < 1) {
                return response()->json([
                    'message' => 'Invalid promotion target.',
                ], 422);
            }
            $prev = $terms[$targetIdx - 1];
            if ($denied = $this->gateStaffStudentEvaluation($user, $profile, $prev['year_level_id'])) {
                return $denied;
            }
            $deferredKeys = is_array($profile->standing_deferred_keys)
                ? $profile->standing_deferred_keys
                : [];
            if (! $this->curriculumTermAllowsPromotionFrom(
                $rows,
                $prev['year_level_id'],
                $prev['semester_id'],
                $deferredKeys
            )) {
                return response()->json([
                    'message' => 'The previous term load is not fully recorded on file. Each subject taken this standing needs a grade or a final outcome (Passed, Failed, Incomplete, Dropped, or transfer credit). Subjects deferred in Current subjects (e.g. skipped for an off-sem prereq retake) do not block promotion — place them later via MOVE TO.',
                ], 422);
            }

            $samePromotionAlreadyLogged = AcademicRecordEvaluationComplete::query()
                ->where('student_id', $profile->student_id)
                ->where('completed_by', $user->user_id)
                ->where('notes', 'like', sprintf('%%target year level %d, semester %d%%', $targetY, $targetS))
                ->exists();
            if ($samePromotionAlreadyLogged) {
                // Idempotent repair: keep the evaluated-students log, but ensure
                // profile standing / promotion targets match the requested term.
                if (array_key_exists('track_id', $validated) && $validated['track_id'] !== null) {
                    $profile->track_id = (int) $validated['track_id'];
                }
                $profile->promoted_next_sem_at = $profile->promoted_next_sem_at ?? now();
                $profile->promoted_next_sem_by = $profile->promoted_next_sem_by ?? $user->user_id;
                $profile->promotion_evaluated_by = $user->displayName();
                $profile->year_level_id = $targetY;
                $profile->semester_id = $targetS;
                $profile->promotion_target_year_level_id = $targetY;
                $profile->promotion_target_semester_id = $targetS;
                $profile->save();

                $fresh = StudentProfile::where('student_id', $profile->student_id)
                    ->with(['program', 'track'])
                    ->firstOrFail();

                return response()->json([
                    'message' => 'Promotion already recorded; student standing refreshed to the promotion target.',
                    'student' => $builder->buildPayload($fresh)['student'],
                    'already_stored' => true,
                ]);
            }

            DB::beginTransaction();

            if (array_key_exists('track_id', $validated) && $validated['track_id'] !== null) {
                $profile->track_id = (int) $validated['track_id'];
            }

            $evaluatorName = trim($user->displayName());
            if ($evaluatorName === '') {
                $evaluatorName = trim((string) ($validated['evaluated_by'] ?? ''));
            }

            $profile->promoted_next_sem_at = now();
            $profile->promoted_next_sem_by = $user->user_id;
            $profile->promotion_evaluated_by = $evaluatorName;
            $profile->year_level_id = (int) $validated['target_year_level_id'];
            $profile->semester_id = (int) $validated['target_semester_id'];
            $profile->promotion_target_year_level_id = (int) $validated['target_year_level_id'];
            $profile->promotion_target_semester_id = (int) $validated['target_semester_id'];
            $profile->save();

            $builder->syncStudentProfileFromCurriculumProgress($profile);
            $profile->refresh();

            $statusAfter = strtolower(trim((string) ($profile->academic_status ?? '')));
            $isIrregularPromote = $statusAfter === 'irregular';
            $promotionNote = sprintf(
                ($isIrregularPromote
                    ? 'Irregular manual promotion — target year level %d, semester %d. Evaluated by: %s'
                    : 'Semester promotion — target year level %d, semester %d. Evaluated by: %s'),
                (int) $validated['target_year_level_id'],
                (int) $validated['target_semester_id'],
                $evaluatorName
            );

            AcademicRecordEvaluationComplete::create([
                'student_id' => $profile->student_id,
                'completed_at' => now(),
                'completed_by' => $user->user_id,
                'notes' => $promotionNote,
            ] + AcademicRecordEvaluationComplete::currentTermAttributes());

            DB::commit();

            $fresh = StudentProfile::where('student_id', $profile->student_id)
                ->with(['program', 'track'])
                ->firstOrFail();

            return response()->json([
                'message' => 'Student marked as promoted for the next semester.',
                'student' => $builder->buildPayload($fresh)['student'],
            ]);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'error' => 'Failed to record promotion',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Persist student standing: year level + semester.
     * Academic year is taken from the bound Curriculum header (not a separate filter).
     *
     * Dean / Program Head / Admin may freely promote or demote Irregular students
     * via Year + Semester (sets profile standing + promotion targets).
     * Regular students keep the anti-demote guard after an explicit Promote.
     */
    public function updateStudentStanding(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $validated = $request->validate([
                'student_id' => 'required|integer|exists:tbl_student_profile,student_id',
                'year_level_id' => 'required|integer|exists:year_level,year_level_id',
                'semester_id' => 'required|integer|exists:tbl_semester,semester_id',
            ]);

            $profile = StudentProfile::where('student_id', $validated['student_id'])
                ->with(['program', 'track', 'previousProgram', 'yearLevel', 'semester', 'academicYear'])
                ->firstOrFail();

            if ($denied = $this->gateStaffStudentEvaluation($user, $profile, null, true)) {
                return $denied;
            }

            $builder = app(StudentCurriculumEvaluationBuilder::class);
            $built = $builder->buildPayload($profile);
            $computedStatus = strtolower(trim((string) ($built['computed_academic_status'] ?? '')));
            $storedStatus = strtolower(trim((string) ($profile->academic_status ?? '')));
            $isIrregular = $computedStatus === 'irregular' || $storedStatus === 'irregular';

            $canManualIrregularStanding =
                $user->hasRole('Admin')
                || $user->hasRole('Dean')
                || $user->hasRole('Program Head');

            $newY = (int) $validated['year_level_id'];
            $newS = (int) $validated['semester_id'];
            $oldY = $profile->year_level_id !== null ? (int) $profile->year_level_id : null;
            $oldS = $profile->semester_id !== null ? (int) $profile->semester_id : null;

            // Academic year comes from Curriculum ↔ Academic Year binding on the header.
            $header = $builder->resolveCurriculumHeaderForStudent($profile);
            if ($header && $header->academic_year_id) {
                $profile->academic_year_id = (int) $header->academic_year_id;
            }

            if ($canManualIrregularStanding && $isIrregular) {
                $profile->year_level_id = $newY;
                $profile->semester_id = $newS;
                $profile->promotion_target_year_level_id = $newY;
                $profile->promotion_target_semester_id = $newS;
                $profile->promoted_next_sem_at = $profile->promoted_next_sem_at ?? now();
                $profile->promoted_next_sem_by = $profile->promoted_next_sem_by ?? $user->user_id;
                // Standing moved — clear term load plan for the previous standing.
                if ($oldY !== $newY || $oldS !== $newS) {
                    $profile->standing_term_load = null;
                    $profile->standing_deferred_keys = [];
                }
                $profile->save();
            } else {
                $profile->year_level_id = $newY;
                $profile->semester_id = $newS;

                // Align promotion targets with standing when advancing or when none set.
                // Never move promotion targets (or standing) backward after an explicit Promote
                // for Regular (or non-manual) students.
                $curY = $profile->getOriginal('promotion_target_year_level_id');
                $curS = $profile->getOriginal('promotion_target_semester_id');
                $curY = $curY !== null ? (int) $curY : null;
                $curS = $curS !== null ? (int) $curS : null;
                $shouldUpdateTargets = true;
                if ($profile->promoted_next_sem_at && $curY !== null && $curS !== null) {
                    if ($newY < $curY || ($newY === $curY && $newS < $curS)) {
                        $shouldUpdateTargets = false;
                        $profile->year_level_id = $curY;
                        $profile->semester_id = $curS;
                    }
                }
                if ($shouldUpdateTargets) {
                    $profile->promotion_target_year_level_id = $newY;
                    $profile->promotion_target_semester_id = $newS;
                }
                $profile->save();
            }

            $fresh = StudentProfile::where('student_id', $profile->student_id)
                ->with(['program', 'track', 'previousProgram', 'yearLevel', 'semester', 'academicYear'])
                ->firstOrFail();
            $payload = $builder->buildPayload($fresh);

            return response()->json([
                'message' => ($canManualIrregularStanding && $isIrregular)
                    ? 'Irregular student standing updated (promote/demote).'
                    : 'Student standing updated.',
                'student' => $payload['student'],
                'curriculum' => $payload['curriculum'] ?? null,
            ]);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to update student standing',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Persist Current-subjects load plan: which eligible backlog/current-term
     * subjects the dean deferred (dropped from this standing unit load).
     */
    public function updateStudentStandingLoad(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $validated = $request->validate([
                'student_id' => 'required|integer|exists:tbl_student_profile,student_id',
                'deferred_keys' => 'present|array',
                'deferred_keys.*' => 'string|max:80',
                'take_keys' => 'nullable|array',
                'take_keys.*' => 'string|max:80',
                'year_level_id' => 'nullable|integer',
                'semester_id' => 'nullable|integer',
                'prior_flags' => 'nullable|array',
            ]);

            $profile = StudentProfile::where('student_id', $validated['student_id'])
                ->with(['program', 'track', 'previousProgram', 'yearLevel', 'semester', 'academicYear'])
                ->firstOrFail();

            if ($denied = $this->gateStaffStudentEvaluation($user, $profile, null, true)) {
                return $denied;
            }

            $keys = array_values(array_unique(array_filter(array_map(
                static fn ($k) => trim((string) $k),
                $validated['deferred_keys']
            ), static fn ($k) => $k !== '')));

            $takeKeys = array_values(array_unique(array_filter(array_map(
                static fn ($k) => trim((string) $k),
                is_array($validated['take_keys'] ?? null) ? $validated['take_keys'] : []
            ), static fn ($k) => $k !== '')));

            $priorFlags = [];
            if (is_array($validated['prior_flags'] ?? null)) {
                foreach ($validated['prior_flags'] as $rowKey => $flag) {
                    $k = trim((string) $rowKey);
                    if ($k === '' || ! is_array($flag)) {
                        continue;
                    }
                    $mode = strtolower(trim((string) ($flag['mode'] ?? 'offsem')));
                    if (! in_array($mode, ['offsem', 'semestral'], true)) {
                        $mode = 'offsem';
                    }
                    $priorFlags[$k] = [
                        'mode' => $mode,
                        'standingYearId' => isset($flag['standingYearId']) ? (string) $flag['standingYearId'] : null,
                        'standingSemId' => isset($flag['standingSemId']) ? (string) $flag['standingSemId'] : null,
                        'standingYearLabel' => isset($flag['standingYearLabel']) ? (string) $flag['standingYearLabel'] : null,
                        'standingSemLabel' => isset($flag['standingSemLabel']) ? (string) $flag['standingSemLabel'] : null,
                        'homeYearLabel' => isset($flag['homeYearLabel']) ? (string) $flag['homeYearLabel'] : null,
                        'homeSemLabel' => isset($flag['homeSemLabel']) ? (string) $flag['homeSemLabel'] : null,
                        'schoolYearLabel' => isset($flag['schoolYearLabel']) ? (string) $flag['schoolYearLabel'] : null,
                        'takenSemLabel' => isset($flag['takenSemLabel']) ? (string) $flag['takenSemLabel'] : null,
                    ];
                }
            }

            $termLoad = [
                'year_level_id' => isset($validated['year_level_id']) ? (int) $validated['year_level_id'] : null,
                'semester_id' => isset($validated['semester_id']) ? (int) $validated['semester_id'] : null,
                'take_keys' => $takeKeys,
                'deferred_keys' => $keys,
                'prior_flags' => $priorFlags,
                'saved_at' => now()->toIso8601String(),
            ];

            $profile->standing_deferred_keys = $keys;
            $profile->standing_term_load = $termLoad;
            $profile->save();

            $builder = app(StudentCurriculumEvaluationBuilder::class);
            $fresh = StudentProfile::where('student_id', $profile->student_id)
                ->with(['program', 'track', 'previousProgram', 'yearLevel', 'semester', 'academicYear'])
                ->firstOrFail();
            $payload = $builder->buildPayload($fresh);

            return response()->json([
                'message' => 'Standing load plan updated.',
                'student' => $payload['student'],
            ]);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to update standing load plan',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Create a practice / simulation student for Dean / PH / Admin
     * so evaluation flows can be tested without altering real students.
     */
    public function createSimulationDummy(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            if (
                ! $user->hasRole('Admin')
                && ! $user->hasRole('Dean')
                && ! $user->hasRole('Program Head')
            ) {
                return response()->json([
                    'message' => 'Only Dean, Program Head, or Admin may create simulation dummies.',
                ], 403);
            }

            if (! CachedSchema::hasColumn('tbl_student_profile', 'is_simulation')) {
                return response()->json([
                    'message' => 'Simulation support is not installed. Run migrations first.',
                ], 500);
            }

            $validated = $request->validate([
                'program_id' => 'nullable|integer|exists:tbl_program,program_id',
                'year_level_id' => 'nullable|integer|exists:year_level,year_level_id',
                'semester_id' => 'nullable|integer|exists:tbl_semester,semester_id',
            ]);

            $programId = isset($validated['program_id']) ? (int) $validated['program_id'] : null;

            if (! $programId && $user->hasRole('Dean')) {
                $dean = DeanProfile::where('user_id', $user->user_id)->first();
                if ($dean?->program_id) {
                    $programId = (int) $dean->program_id;
                } elseif ($dean?->department_id) {
                    $programId = (int) (Program::where('department_id', $dean->department_id)
                        ->orderBy('program_id')
                        ->value('program_id') ?: 0) ?: null;
                }
            }

            if (! $programId && $this->requiresAssignedProgramScope($user)) {
                $programId = $this->assignedEvaluationProgramId($user);
            }

            if (! $programId) {
                $programId = (int) (Program::query()->orderBy('program_id')->value('program_id') ?: 0) ?: null;
            }

            if (! $programId) {
                return response()->json(['message' => 'No program available to attach the simulation student.'], 422);
            }

            // Re-check dean/PH scope against chosen program.
            $probe = new StudentProfile([
                'Current_Program' => $programId,
                'year_level_id' => $validated['year_level_id'] ?? 1,
            ]);
            $probe->setRelation('program', Program::find($programId));
            if ($denied = $this->gateStaffStudentEvaluation($user, $probe, null, true)) {
                return $denied;
            }

            $seq = (int) StudentProfile::query()->where('is_simulation', true)->count() + 1;
            $stamp = now()->format('ymdHis');
            $studentIdNumber = sprintf('SIM-%s-%02d', $stamp, $seq % 100);

            while (
                StudentProfile::query()->whereStudentIdNumber($studentIdNumber)->exists()
            ) {
                $stamp = now()->format('ymdHis').random_int(10, 99);
                $studentIdNumber = sprintf('SIM-%s', $stamp);
            }

            $yearLevelId = isset($validated['year_level_id'])
                ? (int) $validated['year_level_id']
                : (int) (YearLevel::query()->orderBy('year_level_id')->value('year_level_id') ?: 1);
            $semesterId = isset($validated['semester_id'])
                ? (int) $validated['semester_id']
                : 1;

            $created = null;
            DB::transaction(function () use (
                $studentIdNumber,
                $seq,
                $programId,
                $yearLevelId,
                $semesterId,
                &$created
            ) {
                $profileData = [
                    'user_id' => null,
                    'first_name' => 'Dummy '.$seq,
                    'last_name' => 'SIMULATION',
                    'middle_name' => null,
                    'academic_status' => null,
                    'student_entry_type' => null,
                    'Current_Program' => $programId,
                    'year_level_id' => $yearLevelId,
                    'semester_id' => $semesterId,
                    'is_simulation' => true,
                    'standing_deferred_keys' => [],
                    'standing_term_load' => null,
                    'major_standing_override_keys' => [],
                ];

                if (CachedSchema::hasColumn('tbl_student_profile', 'student_id_number')) {
                    $profileData['student_id_number'] = $studentIdNumber;
                }
                if (CachedSchema::hasColumn('tbl_student_profile', 'student_number')) {
                    $profileData['student_number'] = preg_replace('/\D+/', '', $studentIdNumber) ?: (string) random_int(100000000, 999999999);
                }

                $created = StudentProfile::create($profileData);
            });

            $fresh = StudentProfile::where('student_id', $created->student_id)
                ->with(['program', 'track', 'previousProgram', 'yearLevel', 'semester', 'academicYear'])
                ->firstOrFail();

            $fullName = trim(
                ($fresh->last_name ? $fresh->last_name.', ' : '').
                ($fresh->first_name ?? '')
            );

            return response()->json([
                'message' => 'Simulation dummy saved. This is a practice record only — no login account is created.',
                'student' => [
                    'student_id' => $fresh->student_id,
                    'student_id_number' => $fresh->student_id_number,
                    'first_name' => $fresh->first_name,
                    'last_name' => $fresh->last_name,
                    'full_name' => $fullName ?: 'SIMULATION Dummy',
                    'program' => $fresh->program,
                    'program_name' => $fresh->program->program_name ?? null,
                    'year_level_id' => $fresh->year_level_id,
                    'year_level_name' => $fresh->yearLevel?->year_level,
                    'is_simulation' => true,
                ],
            ], 201);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to save simulation dummy',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Rename a simulation dummy (practice record only).
     */
    public function updateSimulationDummyProfile(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            if (
                ! $user->hasRole('Admin')
                && ! $user->hasRole('Dean')
                && ! $user->hasRole('Program Head')
            ) {
                return response()->json([
                    'message' => 'Only Dean, Program Head, or Admin may edit simulation dummies.',
                ], 403);
            }

            $validated = $request->validate([
                'student_id' => 'required|integer|exists:tbl_student_profile,student_id',
                'first_name' => 'required|string|max:50',
                'last_name' => 'required|string|max:50',
                'middle_name' => 'nullable|string|max:50',
            ]);

            $profile = StudentProfile::where('student_id', $validated['student_id'])->firstOrFail();
            if (! ($profile->is_simulation ?? false)) {
                return response()->json([
                    'message' => 'Only simulation dummy names can be edited here.',
                ], 422);
            }

            if ($denied = $this->gateStaffStudentEvaluation($user, $profile, null, true)) {
                return $denied;
            }

            $profile->first_name = trim((string) $validated['first_name']);
            $profile->last_name = trim((string) $validated['last_name']);
            $middle = trim((string) ($validated['middle_name'] ?? ''));
            $profile->middle_name = $middle !== '' ? $middle : null;
            $profile->save();

            $builder = app(StudentCurriculumEvaluationBuilder::class);
            $fresh = StudentProfile::where('student_id', $profile->student_id)
                ->with(['program', 'track', 'previousProgram', 'yearLevel', 'semester', 'academicYear'])
                ->firstOrFail();
            $payload = $builder->buildPayload($fresh);

            return response()->json([
                'message' => 'Simulation dummy name saved.',
                'student' => $payload['student'],
            ]);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to update simulation dummy',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Remove a simulation dummy and its practice evaluation rows.
     */
    public function deleteSimulationDummy(Request $request, int $studentId)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            if (
                ! $user->hasRole('Admin')
                && ! $user->hasRole('Dean')
                && ! $user->hasRole('Program Head')
            ) {
                return response()->json([
                    'message' => 'Only Dean, Program Head, or Admin may delete simulation dummies.',
                ], 403);
            }

            $profile = StudentProfile::where('student_id', $studentId)->firstOrFail();
            if (! ($profile->is_simulation ?? false)) {
                return response()->json([
                    'message' => 'Only simulation dummy accounts can be deleted from here.',
                ], 422);
            }

            if ($denied = $this->gateStaffStudentEvaluation($user, $profile, null, true)) {
                return $denied;
            }

            $userId = $profile->user_id;
            DB::transaction(function () use ($profile, $userId) {
                Evaluation::where('student_id', $profile->student_id)->delete();
                AcademicRecordEvaluationComplete::where('student_id', $profile->student_id)->delete();
                $profile->delete();
                if ($userId) {
                    TblUser::where('user_id', $userId)->delete();
                }
            });

            return response()->json([
                'message' => 'Simulation dummy removed.',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to delete simulation dummy',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Dean / Program Head prerogative: unlock a major subject blocked by year-standing
     * when lower-year majors are already complete (even if earned units are short).
     */
    public function updateMajorStandingOverride(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            if (
                ! $user->hasRole('Admin')
                && ! $user->hasRole('Dean')
                && ! $user->hasRole('Program Head')
            ) {
                return response()->json([
                    'message' => 'Only Dean, Program Head, or Admin may grant major standing overrides.',
                ], 403);
            }

            $validated = $request->validate([
                'student_id' => 'required|integer|exists:tbl_student_profile,student_id',
                'row_key' => 'required|string|max:80',
                'enabled' => 'required|boolean',
                'acknowledge_units_short' => 'sometimes|boolean',
            ]);

            $profile = StudentProfile::where('student_id', $validated['student_id'])
                ->with(['program', 'track', 'previousProgram', 'yearLevel', 'semester', 'academicYear'])
                ->firstOrFail();

            if ($denied = $this->gateStaffStudentEvaluation($user, $profile, null, true)) {
                return $denied;
            }

            $builder = app(StudentCurriculumEvaluationBuilder::class);
            $built = $builder->buildPayload($profile);
            $rows = $built['rows'] ?? [];
            $rowKey = trim((string) $validated['row_key']);
            $target = null;
            foreach ($rows as $r) {
                if ($builder->evaluationRowKeyForPayload($r) === $rowKey) {
                    $target = $r;
                    break;
                }
            }
            if ($target === null) {
                return response()->json([
                    'message' => 'Curriculum subject row not found for this student.',
                ], 422);
            }

            $keys = array_values(array_filter(array_map(
                static fn ($k) => trim((string) $k),
                is_array($profile->major_standing_override_keys) ? $profile->major_standing_override_keys : []
            ), static fn ($k) => $k !== ''));

            if (! $validated['enabled']) {
                $keys = array_values(array_filter($keys, static fn ($k) => $k !== $rowKey));
                $profile->major_standing_override_keys = $keys;
                $profile->save();

                $fresh = StudentProfile::where('student_id', $profile->student_id)
                    ->with(['program', 'track', 'previousProgram', 'yearLevel', 'semester', 'academicYear'])
                    ->firstOrFail();
                $payload = $builder->buildPayload($fresh);

                return response()->json([
                    'message' => 'Major standing override cleared.',
                    'student' => $payload['student'],
                ]);
            }

            if (! $builder->isMajorEvaluationRow($target)) {
                return response()->json([
                    'message' => 'Override applies only to major / professional subjects (not GE).',
                ], 422);
            }

            $targetYearId = (int) ($target['year_level_id'] ?? 0);
            if (! $builder->lowerYearMajorsComplete($rows, $targetYearId)) {
                return response()->json([
                    'message' => 'Lower-year major subjects are not all complete. Finish those majors before unlocking this subject.',
                ], 422);
            }

            $earned = (float) ($built['summary']['total_units_earned'] ?? 0);
            $unitsStanding = 1;
            if ($earned >= 132) {
                $unitsStanding = 4;
            } elseif ($earned >= 94) {
                $unitsStanding = 3;
            } elseif ($earned >= 46) {
                $unitsStanding = 2;
            }
            // Approximate year ordinal from year_level_id when ids are 1..4; otherwise use name.
            $targetYearOrd = $targetYearId;
            $ylName = strtolower((string) ($target['year_level_name'] ?? ''));
            if (preg_match('/(\d)/', $ylName, $m)) {
                $targetYearOrd = (int) $m[1];
            }
            $unitsShort = $targetYearOrd > $unitsStanding;
            if ($unitsShort && empty($validated['acknowledge_units_short'])) {
                return response()->json([
                    'message' => 'Student earned units are short for this subject’s year standing. Confirm to proceed.',
                    'requires_units_ack' => true,
                    'earned_units' => $earned,
                    'units_year_standing' => $unitsStanding,
                    'subject_year_standing' => $targetYearOrd,
                    'lower_year_majors_ok' => true,
                ], 422);
            }

            if (! in_array($rowKey, $keys, true)) {
                $keys[] = $rowKey;
            }
            $profile->major_standing_override_keys = array_values($keys);
            $profile->save();

            $fresh = StudentProfile::where('student_id', $profile->student_id)
                ->with(['program', 'track', 'previousProgram', 'yearLevel', 'semester', 'academicYear'])
                ->firstOrFail();
            $payload = $builder->buildPayload($fresh);

            return response()->json([
                'message' => $unitsShort
                    ? 'Major standing override granted (units short acknowledged; lower-year majors OK).'
                    : 'Major standing override granted.',
                'student' => $payload['student'],
            ]);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to update major standing override',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Assign or clear the student's program track (unlocks elective slot → concrete subject in curriculum rows).
     */
    public function setStudentTrack(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $validated = $request->validate([
                'student_id' => 'required|integer|exists:tbl_student_profile,student_id',
                'track_id' => 'sometimes|nullable|integer|exists:tbl_track,track_id',
            ]);

            $profile = StudentProfile::where('student_id', $validated['student_id'])
                ->with(['program', 'track'])
                ->firstOrFail();

            if ($denied = $this->gateStaffStudentEvaluation($user, $profile)) {
                return $denied;
            }

            if (array_key_exists('track_id', $validated)) {
                $profile->track_id = $validated['track_id'];
            }
            $profile->save();

            $builder = app(StudentCurriculumEvaluationBuilder::class);
            $fresh = StudentProfile::where('student_id', $profile->student_id)
                ->with(['program', 'track'])
                ->firstOrFail();

            return response()->json([
                'message' => 'Track updated.',
                'evaluation' => $builder->buildPayload($fresh),
            ]);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to update track',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Shift a student to a new program: store previous program, auto-tag passed
     * subjects from the old course, and return refreshed evaluation payload.
     */
    public function changeStudentProgram(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $validated = $request->validate([
                'student_id' => 'required|integer|exists:tbl_student_profile,student_id',
                'program_id' => 'required|integer|exists:tbl_program,program_id',
            ]);

            $profile = StudentProfile::where('student_id', $validated['student_id'])
                ->with(['program', 'track', 'previousProgram'])
                ->firstOrFail();

            if ($denied = $this->gateStaffStudentEvaluation($user, $profile)) {
                return $denied;
            }

            $newProgramId = (int) $validated['program_id'];
            $oldProgramId = $profile->current_program !== null ? (int) $profile->current_program : null;

            if ($oldProgramId !== null && $newProgramId === $oldProgramId) {
                $builder = app(StudentCurriculumEvaluationBuilder::class);

                return response()->json([
                    'message' => 'Student is already on this program.',
                    'evaluation' => $builder->buildPayload($profile),
                ]);
            }

            DB::beginTransaction();

            if ($oldProgramId) {
                $oldCurriculumSubjectIds = Curriculum::where('program_id', $oldProgramId)
                    ->whereNotNull('subject_id')
                    ->pluck('subject_id')
                    ->map(fn ($id) => (int) $id)
                    ->filter()
                    ->values();

                $gradeHelper = app(GradeScaleHelper::class);
                $evaluations = Evaluation::where('student_id', $profile->student_id)->get();

                foreach ($evaluations as $evaluation) {
                    $subjectId = $evaluation->subject_id !== null ? (int) $evaluation->subject_id : null;
                    if ($subjectId === null || ! $oldCurriculumSubjectIds->contains($subjectId)) {
                        continue;
                    }

                    // Keep carry-over grades tagged to the program they were earned under.
                    if ($evaluation->graded_under_program_id === null || $evaluation->graded_under_program_id === '') {
                        $evaluation->graded_under_program_id = $oldProgramId;
                    }

                    $status = strtolower((string) ($evaluation->evaluation_status ?? ''));
                    $alreadyPassed = in_array($status, ['passed', 'pass', 'credit', 'complete', 'completed'], true);
                    if ($alreadyPassed) {
                        if ($evaluation->isDirty()) {
                            $evaluation->save();
                        }

                        continue;
                    }

                    if ($gradeHelper->gradeIndicatesPass($evaluation->grade, 50, $evaluation->evaluation_status)) {
                        $evaluation->evaluation_status = 'passed';
                    }

                    if ($evaluation->isDirty()) {
                        $evaluation->save();
                    }
                }

                $profile->Previous_Program = $oldProgramId;
            }

            $profile->Current_Program = $newProgramId;
            $profile->student_entry_type = 'Shiftee';
            $profile->save();

            DB::commit();

            $builder = app(StudentCurriculumEvaluationBuilder::class);
            $fresh = StudentProfile::where('student_id', $profile->student_id)
                ->with(['program', 'track', 'previousProgram'])
                ->firstOrFail();

            return response()->json([
                'message' => 'Student program updated. Matching subjects from the previous program keep their grades.',
                'evaluation' => $builder->buildPayload($fresh),
            ]);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'error' => 'Failed to change student program',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function markAcademicRecordComplete(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $validated = $request->validate([
                'student_id' => 'required|integer|exists:tbl_student_profile,student_id',
                'notes' => 'nullable|string|max:2000',
            ]);

            $profile = StudentProfile::where('student_id', $validated['student_id'])
                ->with(['program', 'track'])
                ->firstOrFail();

            if ($denied = $this->gateStaffStudentEvaluation($user, $profile)) {
                return $denied;
            }

            $record = AcademicRecordEvaluationComplete::create([
                'student_id' => $profile->student_id,
                'completed_at' => now(),
                'completed_by' => $user->user_id,
                'notes' => $validated['notes'] ?? null,
            ] + AcademicRecordEvaluationComplete::currentTermAttributes());

            $record->load('completedByUser');

            return response()->json([
                'message' => 'Academic record evaluation stored successfully.',
                'record' => [
                    'academic_record_complete_id' => $record->academic_record_complete_id,
                    'student_id' => $record->student_id,
                    'completed_at' => $record->completed_at,
                    'notes' => $record->notes,
                    'completed_by_email' => $record->completedByUser?->email,
                ],
            ], 201);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to record evaluation',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function listAcademicRecordCompletions(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $isAllowed =
                $user->canWorkOnStudentEvaluations();

            if (! $isAllowed) {
                return response()->json(['message' => 'Forbidden'], 403);
            }

            $q = AcademicRecordEvaluationComplete::query()
                ->with(['student.program', 'completedByUser'])
                ->orderByDesc('completed_at');

            if ($request->filled('student_id')) {
                $q->where('student_id', (int) $request->query('student_id'));
            }

            if ($user->hasRole('Dean')) {
                $dean = DeanProfile::where('user_id', $user->user_id)->first();
                if ($dean && $dean->department_id) {
                    $q->whereHas('student.program', function ($p) use ($dean) {
                        $p->where('department_id', $dean->department_id);
                    });
                } elseif ($dean && $dean->program_id) {
                    $q->whereHas('student', function ($sq) use ($dean) {
                        $sq->where(function ($w) use ($dean) {
                            $w->where('Current_Program', $dean->program_id)
                                ->orWhere('current_program', $dean->program_id);
                        });
                    });
                }
            }

            if ($this->requiresAssignedProgramScope($user)) {
                $assignedProgramId = $this->assignedEvaluationProgramId($user);
                if (! $assignedProgramId) {
                    return response()->json(['completions' => []]);
                }
                $q->whereHas('student', function ($sq) use ($assignedProgramId) {
                    $sq->where(function ($w) use ($assignedProgramId) {
                        $w->where('Current_Program', $assignedProgramId)
                            ->orWhere('current_program', $assignedProgramId);
                    });
                });
            }

            $rows = $q->limit(200)->get()->map(function ($r) {
                return [
                    'academic_record_complete_id' => $r->academic_record_complete_id,
                    'student_id' => $r->student_id,
                    'completed_at' => $r->completed_at,
                    'notes' => $r->notes,
                    'student_name' => $r->student
                        ? trim(
                            ($r->student->last_name ? $r->student->last_name.', ' : '').
                            ($r->student->first_name ?? '')
                        )
                        : null,
                    'student_id_number' => $r->student->student_id_number ?? null,
                    'completed_by_email' => $r->completedByUser?->email,
                ];
            });

            return response()->json(['completions' => $rows]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to list completions',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function deleteAcademicRecordCompletion(Request $request, int $recordId)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            if (! $user->canDeleteEvaluationsOrDeanAcademicRecords()) {
                return response()->json([
                    'message' => 'Forbidden — only administrators or users with Dean academic approvals may remove stored records',
                ], 403);
            }

            $record = AcademicRecordEvaluationComplete::with('student')->findOrFail($recordId);

            if ($record->student && ($denied = $this->gateStaffStudentEvaluation($user, $record->student))) {
                return $denied;
            }

            $record->delete();

            return response()->json(['message' => 'Stored evaluation record removed.']);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to delete',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return list<array{year_level_id: int, semester_id: int, semester_name?: string|null}>
     */
    private function orderedDistinctTermKeys(array $rows): array
    {
        $seen = [];
        $out = [];
        foreach ($rows as $r) {
            $y = $r['year_level_id'] ?? null;
            $s = $r['semester_id'] ?? null;
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
                'semester_name' => $r['semester_name'] ?? null,
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
     * Stable row key — must match front-end getEvaluationRowKey().
     *
     * @param  array<string, mixed>  $row
     */
    private function evaluationRowKey(array $row): string
    {
        if (isset($row['curriculum_id']) && $row['curriculum_id'] !== '' && $row['curriculum_id'] !== null) {
            return 'cur-'.$row['curriculum_id'];
        }
        if (! empty($row['evaluation_id'])) {
            return 'eval-'.$row['evaluation_id'];
        }

        return 'new-'.($row['subject_id'] ?? '').'-'.($row['academic_year_id'] ?? '').'-'.($row['semester_id'] ?? '');
    }

    /**
     * Every recorded subject in the term must have a final outcome.
     * Untaken blanks (no grade/status) and standing_deferred_keys are skipped —
     * those can be taken later (summer / next year) via MOVE TO.
     *
     * @param  list<array<string, mixed>>  $rows
     * @param  list<string|int>  $deferredKeys
     */
    private function curriculumTermAllowsPromotionFrom(
        array $rows,
        int $yearLevelId,
        int $semesterId,
        array $deferredKeys = []
    ): bool {
        $deferred = [];
        foreach ($deferredKeys as $k) {
            $key = trim((string) $k);
            if ($key !== '') {
                $deferred[$key] = true;
            }
        }

        $termRows = array_values(array_filter($rows, function ($r) use ($yearLevelId, $semesterId, $deferred) {
            $key = $this->evaluationRowKey($r);
            if (isset($deferred[$key])) {
                return false;
            }

            return (int) ($r['year_level_id'] ?? 0) === $yearLevelId
                && (int) ($r['semester_id'] ?? 0) === $semesterId;
        }));

        $actionable = [];
        foreach ($termRows as $r) {
            if ($this->evaluationRowIsUntakenBlank($r)) {
                continue;
            }
            $actionable[] = $r;
        }

        if ($actionable === []) {
            return false;
        }

        foreach ($actionable as $r) {
            if ($this->evaluationRowBlocksPromotion($r)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function evaluationRowIsUntakenBlank(array $row): bool
    {
        if (! empty($row['passed_via_transfer_credit'])
            || strtolower(trim((string) ($row['status'] ?? ''))) === 'credit') {
            return false;
        }
        $sid = $row['subject_id'] ?? null;
        if ($sid === null || $sid === '') {
            return false;
        }
        $status = strtolower(trim((string) ($row['status'] ?? '')));
        if ($status === 'ongoing' || $status !== '') {
            return false;
        }
        $grade = $row['grade'] ?? null;

        return $grade === null || trim((string) $grade) === '';
    }

    /**
     * Same completion rules as the evaluation UI (gradable subjects need grade or P/F/INC/credit).
     *
     * @param  array<string, mixed>  $row
     */
    private function evaluationRowIsCompleteForSemesterPromotion(array $row): bool
    {
        if (! empty($row['passed_via_transfer_credit'])
            || strtolower(trim((string) ($row['status'] ?? ''))) === 'credit') {
            return true;
        }
        $sid = $row['subject_id'] ?? null;
        if ($sid === null || $sid === '') {
            return true;
        }
        $status = strtolower(trim((string) ($row['status'] ?? '')));
        if ($status === 'ongoing') {
            return false;
        }
        $terminal = ['passed', 'pass', 'failed', 'fail', 'f', 'inc', 'incomplete', 'dropped', 'drop'];
        if (in_array($status, $terminal, true)) {
            return true;
        }
        $grade = $row['grade'] ?? null;

        return $grade !== null && trim((string) $grade) !== '';
    }

    /** @param  array<string, mixed>  $row */
    private function evaluationRowBlocksPromotion(array $row): bool
    {
        return ! $this->evaluationRowIsCompleteForSemesterPromotion($row);
    }
}
