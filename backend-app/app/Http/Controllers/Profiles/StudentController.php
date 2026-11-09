<?php

namespace App\Http\Controllers\Profiles;

use App\Http\Controllers\Controller;
use App\Models\Curriculum;
use App\Models\Evaluation;
use App\Models\OfferedSubject;
use App\Models\Prerequisite;
use App\Models\Role;
use App\Models\StudentProfile;
use App\Models\Subject;
use App\Models\TblUser;
use App\Models\Track;
use App\Models\YearLevel;
use App\Services\AuthUnitHelpers;
use App\Services\ElectiveSubjectResolver;
use App\Services\IncComplianceExpiryService;
use App\Services\StudentAccountEmail;
use App\Services\StudentCurriculumEvaluationBuilder;
use App\Services\StudentLoginProvisioner;
use App\Support\CachedSchema;
use App\Support\ElectiveSlotPrerequisite;
use App\Support\InputGuards;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class StudentController extends Controller
{
    private const PROGRAM_REQUISITE_SUPPRESSIONS = [
        'BECED' => ['EDU011', 'EDU532'],
        'BSEE' => ['BES024', 'ECO017', 'CPE036'],
        'BSME' => ['BES024', 'ECO017', 'CPE036', 'ECE069', 'GEN006'],
        'BSARCH' => ['BES025'],
        'BSCE' => ['BES024', 'ECE069'],
    ];

    private const PROGRAM_SPECIFIC_REQUISITES = [
        'BSME' => [
            'ECE069' => [
                ['subject_code' => 'BES 062', 'requisite_type' => 'prerequisite', 'rule_label' => null],
            ],
            'GEN006' => [
                ['subject_code' => 'GEN 002', 'requisite_type' => 'prerequisite', 'rule_label' => null],
            ],
        ],
    ];

    /**
     * Program id for curriculum/eligibility (uses StudentProfile accessor; supports current_program column).
     */
    protected function getStudentProgramId(?StudentProfile $profile): ?int
    {
        if (! $profile) {
            return null;
        }
        $v = $profile->current_program;
        if ($v === null || $v === '') {
            return null;
        }

        return (int) $v;
    }

    protected function shouldSuppressSharedSubjectRequisites(?string $programCode, ?string $subjectCode): bool
    {
        $programKey = strtoupper(trim((string) $programCode));
        $subjectKey = strtoupper(str_replace(' ', '', trim((string) $subjectCode)));

        return in_array($subjectKey, self::PROGRAM_REQUISITE_SUPPRESSIONS[$programKey] ?? [], true);
    }

    protected function programSpecificRequisiteRows(?string $programCode, ?string $subjectCode): array
    {
        $programKey = strtoupper(trim((string) $programCode));
        $subjectKey = strtoupper(str_replace(' ', '', trim((string) $subjectCode)));
        $rows = self::PROGRAM_SPECIFIC_REQUISITES[$programKey][$subjectKey] ?? [];

        return array_map(static fn (array $row) => [
            'subject_code' => $row['subject_code'],
            'prereq_subject_code' => $row['subject_code'],
            'requisite_type' => $row['requisite_type'] ?? 'prerequisite',
            'rule_label' => $row['rule_label'] ?? null,
        ], $rows);
    }

    protected function hasAllSubjectsPrerequisiteRule($requisites): bool
    {
        foreach ($requisites ?? [] as $edge) {
            $type = strtolower((string) ($edge->requisite_type ?? 'prerequisite'));
            $label = strtolower(trim((string) ($edge->rule_label ?? '')));
            if ($type !== 'corequisite' && preg_match('/^all\s+subjects?$/', $label)) {
                return true;
            }
        }

        return false;
    }

    protected function standingPrerequisiteRule($requisites): ?array
    {
        foreach ($requisites ?? [] as $edge) {
            $type = strtolower((string) ($edge->requisite_type ?? 'prerequisite'));
            $label = strtolower(trim((string) ($edge->rule_label ?? '')));
            if ($type === 'corequisite' || $label === '') {
                continue;
            }

            if (preg_match('/^(2|2nd|second|3|3rd|third|4|4th|fourth|5|5th|fifth)\s+year\s+standing$/', $label, $match)) {
                $yearWords = [
                    '2' => 2, '2nd' => 2, 'second' => 2,
                    '3' => 3, '3rd' => 3, 'third' => 3,
                    '4' => 4, '4th' => 4, 'fourth' => 4,
                    '5' => 5, '5th' => 5, 'fifth' => 5,
                ];
                $standingYear = $yearWords[$match[1]] ?? null;
                if ($standingYear) {
                    return [
                        'label' => "{$standingYear}".match ($standingYear) {
                            2 => 'nd',
                            3 => 'rd',
                            default => 'th',
                        }.' year standing',
                        'max_year' => $standingYear - 1,
                    ];
                }
            }
        }

        return null;
    }

    protected function isStandingPrerequisiteRuleLabel(?string $ruleLabel): bool
    {
        return preg_match(
            '/^(2|2nd|second|3|3rd|third|4|4th|fourth|5|5th|fifth)\s+year\s+standing$/i',
            trim((string) $ruleLabel)
        ) === 1;
    }

    protected function programPreviousSubjectPrerequisiteRows($curriculumItem): array
    {
        if (! $curriculumItem?->program_id || ! $curriculumItem?->year_level || ! $curriculumItem?->semester_id) {
            return [];
        }

        $currentOrder = ((int) $curriculumItem->year_level * 10)
            + ((int) $curriculumItem->semester_id === 3 ? 0 : (int) $curriculumItem->semester_id);

        return DB::table('curriculum as c')
            ->join('tbl_subjects as s', 's.subject_id', '=', 'c.subject_id')
            ->where('c.program_id', $curriculumItem->program_id)
            ->whereNotNull('c.subject_id')
            ->whereRaw('(c.year_level * 10 + CASE WHEN c.semester_id = 3 THEN 0 ELSE c.semester_id END) < ?', [$currentOrder])
            ->orderBy('c.year_level')
            ->orderByRaw('CASE WHEN c.semester_id = 3 THEN 0 ELSE c.semester_id END')
            ->orderBy('c.curriculum_id')
            ->get(['s.subject_code'])
            ->map(fn ($row) => [
                'subject_code' => trim((string) $row->subject_code),
                'prereq_subject_code' => trim((string) $row->subject_code),
                'requisite_type' => 'prerequisite',
                'rule_label' => 'all subjects',
            ])
            ->all();
    }

    protected function programSubjectsThroughYearPrerequisiteRows($curriculumItem, int $maxYear, string $ruleLabel): array
    {
        if (! $curriculumItem?->program_id || $maxYear < 1) {
            return [];
        }

        return DB::table('curriculum as c')
            ->leftJoin('tbl_subjects as s', 's.subject_id', '=', 'c.subject_id')
            ->leftJoin('tbl_elective_subject as es', 'es.elective_slot_id', '=', 'c.elective_slot_id')
            ->leftJoin('tbl_subjects as choice', 'choice.subject_id', '=', 'es.subject_id')
            ->where('c.program_id', $curriculumItem->program_id)
            ->where('c.year_level', '<=', $maxYear)
            ->where(function ($query) {
                $query->whereNotNull('c.subject_id')
                    ->orWhereNotNull('es.subject_id');
            })
            ->orderBy('c.year_level')
            ->orderByRaw('CASE WHEN c.semester_id = 3 THEN 0 ELSE c.semester_id END')
            ->orderBy('c.curriculum_id')
            ->get([DB::raw('COALESCE(s.subject_code, choice.subject_code) as subject_code')])
            ->map(fn ($row) => trim((string) $row->subject_code))
            ->filter()
            ->unique()
            ->values()
            ->map(fn ($code) => [
                'subject_code' => $code,
                'prereq_subject_code' => $code,
                'requisite_type' => 'prerequisite',
                'rule_label' => $ruleLabel,
            ])
            ->all();
    }

    protected function electiveSlotPrerequisiteRows($slot): array
    {
        return ElectiveSlotPrerequisite::prerequisiteRows($slot);
    }

    /**
     * Get the authenticated student's profile or admin can get by user_id
     */
    public function getProfile(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            // Allow admin / student managers to get profile by user_id; otherwise use authenticated user
            $targetUserId = $request->query('user_id');
            if ($targetUserId && ($user->isAdmin() || $user->canManageStudents())) {
                $userId = $targetUserId;
            } else {
                $userId = $user->user_id;
            }

            $profile = StudentProfile::where('user_id', $userId)
                ->with(['program', 'track'])
                ->first();

            if (! $profile) {
                // Return empty object so the frontend can open the edit modal
                // without throwing a 404 error. The profile can still be created
                // later when admin fills the required fields.
                return response()->json((object) []);
            }

            $built = null;
            try {
                $builder = app(StudentCurriculumEvaluationBuilder::class);
                $built = $builder->buildPayload($profile);
                $builder->syncStudentProfileFromCurriculumProgress($profile, $built);
                $profile->refresh();
            } catch (\Throwable $e) {
                Log::warning('student profile: computed academic status failed', [
                    'user_id' => $userId,
                    'message' => $e->getMessage(),
                ]);
            }

            $data = $profile->toArray();
            if ($built !== null) {
                $data['computed_academic_status'] = $built['computed_academic_status'];
                $data['academic_status_reasons'] = $built['academic_status_reasons'];
            }

            return response()->json($data);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to fetch profile',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Create or update student profile
     */
    public function updateProfile(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $validated = $request->validate([
                'user_id' => 'nullable|integer|exists:tbl_users,user_id', // Allow admin to specify user_id
                'student_id_number' => 'required|string|max:50',
                'first_name' => 'nullable|string|max:50',
                'middle_name' => 'nullable|string|max:50',
                'last_name' => 'nullable|string|max:50',
                'contact_number' => InputGuards::contactNumberRule(false),
                'address' => 'nullable|string',
                'academic_status' => 'nullable|string|max:50',
                // Distinct from academic_status (Regular/Irregular): set when creating the student account.
                'student_entry_type' => 'nullable|string|in:Shiftee,Returnee,Transferee',
                'year_level_id' => 'nullable|integer|exists:year_level,year_level_id',
                'track_id' => 'nullable|integer|exists:tbl_track,track_id',
                'current_program' => 'nullable|integer|exists:tbl_program,program_id',
                'Current_Program' => 'nullable|integer|exists:tbl_program,program_id', // Accept both formats
            ]);

            // Map current_program to Current_Program if provided
            if (isset($validated['current_program'])) {
                $validated['Current_Program'] = $validated['current_program'];
                unset($validated['current_program']);
            }

            // Determine which user_id to use
            $targetUserId = $validated['user_id'] ?? $user->user_id;

            // Allow staff with Student Management to create/update another user's profile
            if ($validated['user_id'] && $targetUserId !== $user->user_id) {
                $canManageOther =
                    $user->isAdmin()
                    || $user->canCreateStudentUsers()
                    || $user->canEditStudentUsers();
                if (! $canManageOther) {
                    return response()->json(['message' => 'Unauthorized'], 403);
                }
            }

            $profile = StudentProfile::where('user_id', $targetUserId)->first();

            if ($profile) {
                // Update existing profile
                // Allow admin to edit Student ID Number, but prevent duplicates.
                $hasStudentIdNumberColumn = CachedSchema::hasColumn('tbl_student_profile', 'student_id_number');
                $hasStudentNumberColumn = CachedSchema::hasColumn('tbl_student_profile', 'student_number');

                $rawStudentIdNumber = \App\Support\StudentIdNumber::canonicalize(
                    (string) ($validated['student_id_number'] ?? '')
                );
                $validated['student_id_number'] = $rawStudentIdNumber;
                $sanitizedStudentNumber = preg_replace('/\D+/', '', $rawStudentIdNumber);

                if ($rawStudentIdNumber === '' || $sanitizedStudentNumber === '') {
                    return response()->json([
                        'error' => 'Invalid Student ID Number',
                        'message' => 'Student ID Number must contain digits (e.g., 02-2324-07413).',
                    ], 422);
                }

                // IDs like "2026-PERSONAL-001" share the same digit fingerprint as "2026001". Enforcing
                // uniqueness on digits-only would false-positive against a legacy row that only has student_number.
                $idHasNonDigitFormat = (bool) preg_match('/\D/', $rawStudentIdNumber);

                // Prevent duplicates for the same value for another student.
                if ($hasStudentIdNumberColumn) {
                    $duplicate = StudentProfile::whereStudentIdNumber($rawStudentIdNumber)
                        ->where('user_id', '!=', $targetUserId)
                        ->exists();
                    if ($duplicate) {
                        return response()->json(['message' => 'Student ID number already exists'], 422);
                    }
                }

                if ($hasStudentNumberColumn && ! $idHasNonDigitFormat) {
                    $duplicate = StudentProfile::where('student_number', $sanitizedStudentNumber)
                        ->where('user_id', '!=', $targetUserId)
                        ->exists();
                    if ($duplicate) {
                        return response()->json(['message' => 'Student ID number already exists'], 422);
                    }
                }

                // Map to the columns we actually have.
                if ($hasStudentNumberColumn) {
                    $validated['student_number'] = $sanitizedStudentNumber;
                }

                // If student_id_number column doesn't exist, remove it to avoid DB errors.
                if (! $hasStudentIdNumberColumn) {
                    unset($validated['student_id_number']);
                }

                unset($validated['user_id']); // Don't allow changing user_id
                $profile->update($validated);
            } else {
                // Create new profile
                // Your tbl_student_profile uses `student_number` (INT) in the current schema,
                // but the frontend captures `student_id_number` like "02-2324-07413".
                // We sanitize to digits only before saving to avoid MySQL truncation warnings.
                $rawStudentIdNumber = \App\Support\StudentIdNumber::canonicalize(
                    (string) ($validated['student_id_number'] ?? '')
                );
                $validated['student_id_number'] = $rawStudentIdNumber;
                $sanitizedStudentNumber = preg_replace('/\D+/', '', $rawStudentIdNumber);
                if ($sanitizedStudentNumber === '') {
                    return response()->json([
                        'error' => 'Invalid Student ID Number',
                        'message' => 'Student ID Number must contain digits (e.g., 02-2324-07413).',
                    ], 422);
                }

                $idHasNonDigitFormat = (bool) preg_match('/\D/', $rawStudentIdNumber);

                // Map payload to the actual DB column name.
                // Your tbl_student_profile table might use `student_number` instead of `student_id_number`.
                $hasStudentIdNumberColumn = CachedSchema::hasColumn('tbl_student_profile', 'student_id_number');
                $hasStudentNumberColumn = CachedSchema::hasColumn('tbl_student_profile', 'student_number');

                // Existence check: full student_id_number first; digits-only column only when ID is purely numeric
                // (avoids "2026-PERSONAL-001" colliding with stored student_number "2026001").
                $exists = false;
                if ($hasStudentIdNumberColumn) {
                    $exists = StudentProfile::whereStudentIdNumber($rawStudentIdNumber)->exists();
                }
                if (! $exists && $hasStudentNumberColumn && ! $idHasNonDigitFormat) {
                    $exists = StudentProfile::where('student_number', $sanitizedStudentNumber)->exists();
                } elseif (! $exists && $hasStudentNumberColumn && $idHasNonDigitFormat && ! $hasStudentIdNumberColumn) {
                    $exists = StudentProfile::where('student_number', $sanitizedStudentNumber)->exists();
                }

                if ($exists) {
                    return response()->json(['message' => 'Student ID number already exists'], 422);
                }

                // Map validated payload to actual DB columns.
                if ($hasStudentNumberColumn) {
                    $validated['student_number'] = $sanitizedStudentNumber;
                }
                if (! $hasStudentIdNumberColumn) {
                    unset($validated['student_id_number']);
                } else {
                    // Store raw input so the admin modal doesn't look blank.
                    $validated['student_id_number'] = (string) $rawStudentIdNumber;
                }

                $validated['user_id'] = $targetUserId;
                $profile = StudentProfile::create($validated);
            }

            $profile->load('program');

            return response()->json($profile);
        } catch (ValidationException $e) {
            return response()->json([
                'error' => 'Validation failed',
                'messages' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to save profile',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Create new student profile
     */
    public function createProfile(Request $request)
    {
        return $this->updateProfile($request);
    }

    /**
     * Get student's evaluations
     */
    public function getEnrollments(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $profile = StudentProfile::where('user_id', $user->user_id)->first();
            if (! $profile) {
                return response()->json(['enrollments' => []]);
            }

            app(IncComplianceExpiryService::class)->expireOverdue($profile->student_id);

            $query = Evaluation::where('student_id', $profile->student_id)
                ->with([
                    'subject',
                    'academicYear',
                    'semester',
                    'section',
                ]);

            // Apply filters
            if ($request->has('academic_year') && $request->academic_year) {
                $query->whereHas('academicYear', function ($q) use ($request) {
                    $q->where('academic_year_name', 'like', '%'.$request->academic_year.'%');
                });
            }

            if ($request->has('semester') && $request->semester) {
                $query->whereHas('semester', function ($q) use ($request) {
                    $q->where('semester_name', 'like', '%'.$request->semester.'%');
                });
            }

            if ($request->has('status') && $request->status) {
                $query->where('evaluation_status', $request->status);
            }

            $evaluations = $query->orderBy('enrolled_date', 'desc')->get();

            // Transform the data to include related information in a flat structure
            // Keep 'enrollment_id' and 'status' in response for backward compatibility with frontend
            $transformed = $evaluations->map(function ($evaluation) {
                return [
                    'enrollment_id' => $evaluation->evaluation_id, // Map for backward compatibility
                    'evaluation_id' => $evaluation->evaluation_id,
                    'student_id' => $evaluation->student_id,
                    'subject_id' => $evaluation->subject_id,
                    'subject_code' => $evaluation->subject->subject_code ?? null,
                    'subject_name' => $evaluation->subject->subject_name ?? null,
                    'units' => $evaluation->subject->number_of_units ?? null,
                    'academic_year_id' => $evaluation->academic_year_id,
                    'academic_year_name' => $evaluation->academicYear->academic_year_name ?? null,
                    'semester_id' => $evaluation->semester_id,
                    'semester_name' => $evaluation->semester->semester_name ?? null,
                    'grade' => $evaluation->grade,
                    'status' => $evaluation->evaluation_status, // Map for backward compatibility
                    'evaluation_status' => $evaluation->evaluation_status,
                    'enrolled_date' => $evaluation->enrolled_date,
                    'section_id' => $evaluation->section_id,
                    'section_name' => $evaluation->section->section_name ?? null,
                    'inc_compliance_deadline' => $evaluation->inc_compliance_deadline
                        ? $evaluation->inc_compliance_deadline->format('Y-m-d')
                        : null,
                    'subject' => $evaluation->subject,
                    'academic_year' => $evaluation->academicYear,
                    'semester' => $evaluation->semester,
                    'section' => $evaluation->section,
                ];
            });

            return response()->json(['enrollments' => $transformed]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to fetch evaluations',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get student's curriculum based on their program
     */
    public function getCurriculum(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $profile = StudentProfile::where('user_id', $user->user_id)
                ->with(['program', 'track', 'yearLevel'])
                ->first();

            $programId = $this->getStudentProgramId($profile);
            if (! $profile) {
                return response()->json([
                    'curriculum' => [],
                    'curriculum_unavailable_reason' => 'no_profile',
                    'curriculum_message' => 'Complete My Profile (name and Student ID number). After that, an administrator must assign your program before courses appear here.',
                ]);
            }
            if (! $programId) {
                return response()->json([
                    'curriculum' => [],
                    'curriculum_unavailable_reason' => 'no_program',
                    'curriculum_message' => 'Your program is not set on your record yet. Ask an administrator to assign your program in User Management, or import it using a student row with program_id in CSV.',
                ]);
            }

            $builder = app(StudentCurriculumEvaluationBuilder::class);
            $curriculumHeader = $builder->resolveCurriculumHeaderForStudent($profile);
            $headerId = $curriculumHeader?->curriculum_header_id !== null
                ? (int) $curriculumHeader->curriculum_header_id
                : null;

            $curriculumQuery = Curriculum::where('program_id', $programId)
                ->with([
                    'subject.prerequisites.requiredSubject',
                    'yearLevel',
                    'semester',
                    'program',
                    'electiveSlot.prerequisiteSlot',
                    'electiveSlot.electiveSubjects.subject',
                    'electiveSlot.electiveSubjects.track',
                ]);
            if ($headerId) {
                $curriculumQuery->where('curriculum_header_id', $headerId);
            }
            $curriculum = $curriculumQuery
                ->orderBy('year_level')
                ->orderByRaw('CASE WHEN semester_id = 3 THEN 0 ELSE semester_id END')
                ->get();

            $studentEvaluations = Evaluation::where('student_id', $profile->student_id)
                ->with('subject')
                ->get();

            $approvedCreditSubjectIds = app(StudentCurriculumEvaluationBuilder::class)
                ->subjectIdsWithTransferCreditForStudent((int) $profile->student_id);

            $studentTrackId = $profile->track_id;

            $transformed = $curriculum
                ->map(function ($item) use ($studentTrackId, $profile, $studentEvaluations, $approvedCreditSubjectIds) {
                    $resolvedSubject = $item->subject;
                    $resolvedTrack = null;
                    $resolvedFromElective = false;
                    $slotPrerequisites = $this->electiveSlotPrerequisiteRows($item->electiveSlot);

                    if (! $resolvedSubject && $item->electiveSlot) {
                        $electiveSubjects = $item->electiveSlot->electiveSubjects ?? collect();
                        $resolvedSubject = ElectiveSubjectResolver::resolveForCurriculumSlot(
                            $electiveSubjects,
                            $studentTrackId !== null ? (int) $studentTrackId : null,
                            $item->semester_id !== null ? (int) $item->semester_id : null,
                            $studentEvaluations,
                            $item->electiveSlot?->slot_name,
                            $item->electiveSlot?->elective_slot_id !== null ? (int) $item->electiveSlot->elective_slot_id : null
                        );
                        if ($resolvedSubject) {
                            $resolvedFromElective = true;
                            $esRow = $electiveSubjects->first(
                                fn ($es) => (int) $es->subject_id === (int) $resolvedSubject->subject_id
                            );
                            $resolvedTrack = $esRow?->track;
                        }
                    }

                    // Prerequisites and corequisites (tbl_prerequisite.requisite_type)
                    $prerequisites = [];
                    $corequisites = [];
                    $suppressSubjectRequisites = $this->shouldSuppressSharedSubjectRequisites(
                        $item->program?->program_code,
                        $resolvedSubject?->subject_code
                    );
                    $useProgramAllSubjectsRule = ! $suppressSubjectRequisites
                        && $resolvedSubject
                        && $this->hasAllSubjectsPrerequisiteRule($resolvedSubject->prerequisites ?? []);
                    $standingRule = ! $suppressSubjectRequisites && $resolvedSubject
                        ? $this->standingPrerequisiteRule($resolvedSubject->prerequisites ?? [])
                        : null;

                    if ($useProgramAllSubjectsRule) {
                        $prerequisites = $this->programPreviousSubjectPrerequisiteRows($item);
                    } elseif ($standingRule) {
                        $prerequisites = $this->programSubjectsThroughYearPrerequisiteRows(
                            $item,
                            (int) $standingRule['max_year'],
                            (string) $standingRule['label']
                        );
                    }

                    foreach ($this->programSpecificRequisiteRows($item->program?->program_code, $resolvedSubject?->subject_code) as $specificRequisite) {
                        if (($specificRequisite['requisite_type'] ?? 'prerequisite') === 'corequisite') {
                            $corequisites[] = $specificRequisite;
                        } else {
                            $prerequisites[] = $specificRequisite;
                        }
                    }

                    if (! $suppressSubjectRequisites && $resolvedSubject && $resolvedSubject->prerequisites) {
                        foreach ($resolvedSubject->prerequisites as $edge) {
                            $type = strtolower((string) ($edge->requisite_type ?? 'prerequisite'));
                            if ($useProgramAllSubjectsRule && $type !== 'corequisite') {
                                continue;
                            }
                            if ($standingRule && $type !== 'corequisite' && $this->isStandingPrerequisiteRuleLabel($edge->rule_label ?? null)) {
                                continue;
                            }
                            $c = $edge->requiredSubject->subject_code ?? null;
                            if ($c === null || trim((string) $c) === '') {
                                continue;
                            }
                            $c = trim((string) $c);
                            $requisiteRow = [
                                'subject_code' => $c,
                                'prereq_subject_code' => $c,
                                'requisite_type' => $type === 'corequisite' ? 'corequisite' : 'prerequisite',
                                'rule_label' => trim((string) ($edge->rule_label ?? '')) ?: null,
                            ];
                            if ($type === 'corequisite') {
                                $corequisites[] = $requisiteRow;
                            } else {
                                $prerequisites[] = $requisiteRow;
                            }
                        }
                    }

                    if (! $resolvedSubject) {
                        if ($item->electiveSlot) {
                            $slot = $item->electiveSlot;

                            return [
                                'curriculum_id' => $item->curriculum_id,
                                'program_id' => $item->program_id,
                                'subject_id' => null,
                                'subject_code' => trim((string) ($slot->slot_name ?? '')) !== ''
                                    ? $slot->slot_name
                                    : 'Elective 1',
                                'subject_name' => 'Pending track selection',
                                'units' => 0,
                                'hours' => null,
                                'year_level_id' => $item->year_level,
                                'year_level_name' => $item->yearLevel->year_level ?? null,
                                'semester_id' => $item->semester_id,
                                'semester_name' => $item->semester->semester_name ?? null,
                                'passing_grade' => $item->passing_grade,
                                'subject_type' => $item->subject_type,
                                'year_level' => $item->yearLevel,
                                'semester' => $item->semester,
                                'subject' => null,
                                'program' => $item->program,
                                'student_track_id' => $profile->track_id,
                                'student_track_name' => $profile->track->track_name ?? null,
                                'resolved_from_elective_slot' => true,
                                'resolved_track' => null,
                                'elective_unresolved' => true,
                                'elective_slot_name' => $slot->slot_name,
                                'prerequisites' => $slotPrerequisites,
                                'corequisites' => [],
                                'passed_via_transfer_credit' => false,
                            ];
                        }

                        return null;
                    }

                    $sid = (int) $resolvedSubject->subject_id;
                    $passedViaTransferCredit = $approvedCreditSubjectIds->contains($sid);

                    return [
                        'curriculum_id' => $item->curriculum_id,
                        'program_id' => $item->program_id,
                        'subject_id' => $resolvedSubject->subject_id,
                        'subject_code' => $resolvedSubject->subject_code ?? null,
                        'subject_name' => $resolvedSubject->subject_name ?? null,
                        'units' => $resolvedSubject->number_of_units ?? null,
                        'hours' => $resolvedSubject->number_of_hrs ?? null,
                        'year_level_id' => $item->year_level,
                        'year_level_name' => $item->yearLevel->year_level ?? null,
                        'semester_id' => $item->semester_id,
                        'semester_name' => $item->semester->semester_name ?? null,
                        'passing_grade' => $item->passing_grade,
                        'subject_type' => $item->subject_type,
                        'year_level' => $item->yearLevel,
                        'semester' => $item->semester,
                        'subject' => $resolvedSubject,
                        'program' => $item->program,
                        'student_track_id' => $profile->track_id,
                        'student_track_name' => $profile->track->track_name ?? null,
                        'resolved_from_elective_slot' => $resolvedFromElective,
                        'elective_slot_id' => $item->electiveSlot?->elective_slot_id,
                        'elective_slot_name' => $item->electiveSlot?->slot_name,
                        'resolved_track' => $resolvedTrack,
                        'prerequisites' => array_merge($slotPrerequisites, $prerequisites),
                        'corequisites' => $corequisites,
                        'passed_via_transfer_credit' => $passedViaTransferCredit,
                    ];
                })
                ->filter();

            if ($transformed->isEmpty() && $curriculum->isNotEmpty()) {
                return response()->json([
                    'curriculum' => [],
                    'curriculum_unavailable_reason' => 'curriculum_unresolved',
                    'curriculum_message' => 'A program is assigned, but no subjects could be loaded (missing subjects, electives, or curriculum data). Ask an administrator to check Curriculum Management for this program.',
                ]);
            }

            if ($transformed->isEmpty()) {
                return response()->json([
                    'curriculum' => [],
                    'curriculum_unavailable_reason' => 'no_curriculum_catalog',
                    'curriculum_message' => 'No curriculum courses are defined for your program yet. An administrator needs to add curriculum entries for this program.',
                ]);
            }

            $promotionTargetYearId = $profile->promotion_target_year_level_id;
            $promotionTargetSemesterId = $profile->promotion_target_semester_id;
            $currentYearId = $profile->year_level_id !== null ? (int) $profile->year_level_id : null;
            if (
                $currentYearId !== null
                && (
                    $promotionTargetYearId === null
                    || (int) $promotionTargetYearId < $currentYearId
                )
            ) {
                $promotionTargetYearId = $currentYearId;
                $promotionTargetSemesterId = $curriculum
                    ->where('year_level', $currentYearId)
                    ->sortBy(fn ($row) => $this->semesterSortValue(
                        (int) $row->semester_id,
                        $row->semester?->semester_name
                    ))
                    ->first()?->semester_id;
            }

            return response()->json([
                'curriculum' => $transformed,
                'promotion' => [
                    'promoted_at' => $profile->promoted_next_sem_at?->toIso8601String(),
                    'target_year_level_id' => $promotionTargetYearId,
                    'target_semester_id' => $promotionTargetSemesterId,
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to fetch curriculum',
                'message' => $e->getMessage(),
            ], 500);
        }
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
     * Get lookup options used in student profile forms.
     */
    public function getProfileOptions(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            return response()->json([
                'year_levels' => YearLevel::select('year_level_id', 'year_level')->orderBy('year_level_id')->get(),
                'tracks' => Track::select('track_id', 'track_code', 'track_name')->orderBy('track_name')->get(),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to fetch profile options',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Student Management directory: login accounts plus imported profiles that have no email yet.
     */
    public function directory(Request $request)
    {
        $actor = $request->user();
        if (! $actor?->canAccessUserDirectory()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $studentRole = Role::query()->where('role_name', 'Student')->first();
        if (! $studentRole) {
            return response()->json([]);
        }

        $users = TblUser::with([
            'role',
            'studentProfile.program',
        ])->where('role_id', (int) $studentRole->role_id)->get()->keyBy('user_id');

        $profiles = StudentProfile::with('program')->get();
        if (CachedSchema::hasColumn('tbl_student_profile', 'is_simulation')) {
            $profiles = $profiles->filter(fn ($p) => ! ($p->is_simulation ?? false))->values();
        }

        $rows = collect();
        $linkedUserIds = [];

        foreach ($profiles as $profile) {
            $user = $profile->user_id ? $users->get($profile->user_id) : null;
            if ($user) {
                $linkedUserIds[] = (int) $user->user_id;
                $rows->push($this->studentDirectoryRow($user, $profile, $studentRole));
            } else {
                $rows->push($this->studentDirectoryRow(null, $profile, $studentRole));
            }
        }

        foreach ($users as $user) {
            if (in_array((int) $user->user_id, $linkedUserIds, true)) {
                continue;
            }
            $rows->push($this->studentDirectoryRow($user, $user->studentProfile, $studentRole));
        }

        return response()->json($rows->values());
    }

    public function updateDirectory(Request $request, int $studentId)
    {
        $actor = $request->user();
        if (! $actor?->canAccessUserDirectory()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }
        if (! $actor->isAdmin() && ! $actor->canEditStudentUsers()) {
            return response()->json(['message' => 'View-only access: you cannot edit students.'], 403);
        }

        $profile = StudentProfile::with('program')->where('student_id', $studentId)->firstOrFail();
        if ($profile->is_simulation ?? false) {
            return response()->json(['message' => 'Simulation dummies are not managed here.'], 422);
        }

        $user = $profile->user_id ? TblUser::with('role')->find($profile->user_id) : null;

        $validated = $request->validate([
            'email' => [
                'nullable',
                'string',
                'max:100',
                Rule::unique('tbl_users', 'email')->ignore($user?->user_id, 'user_id'),
            ],
            'password' => ['nullable', 'string'],
        ]);

        // Edit Student may only change login email and password; profile data is read-only here.
        $sid = trim((string) ($profile->student_id_number ?? ''));
        $email = trim((string) ($validated['email'] ?? ''));
        if ($this->isPlaceholderStudentEmail($email, $sid)) {
            $email = '';
        }

        DB::beginTransaction();
        try {
            $studentRoleId = Role::query()->where('role_name', 'Student')->value('role_id');
            if (! $studentRoleId) {
                DB::rollBack();

                return response()->json(['message' => 'Student role is missing from the system.'], 500);
            }

            if (! $user) {
                $password = trim((string) ($validated['password'] ?? ''));
                if ($password === '') {
                    $password = StudentLoginProvisioner::defaultPassword($profile->first_name);
                }
                $loginEmail = $email !== ''
                    ? $email
                    : StudentAccountEmail::loginEmailForNewStudent($sid);
                $user = TblUser::create([
                    'email' => $loginEmail,
                    'password' => AuthUnitHelpers::hashUserPassword($password),
                    'contact_number' => $profile->contact_number,
                    'role_id' => (int) $studentRoleId,
                    'status' => 'active',
                    'password_changed_at' => null,
                ]);
                $profile->user_id = $user->user_id;
                $profile->save();
            } else {
                if ($email !== '') {
                    $user->email = $email;
                }
                if (! empty(trim((string) ($validated['password'] ?? '')))) {
                    $user->password = AuthUnitHelpers::hashUserPassword($validated['password']);
                    $user->password_changed_at = now();
                }
                $user->save();
            }

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();

            return response()->json([
                'error' => 'Failed to update student',
                'message' => $e->getMessage(),
            ], 500);
        }

        $freshUser = $profile->user_id ? TblUser::with('role', 'studentProfile.program')->find($profile->user_id) : null;
        $profile->load('program');
        $role = $freshUser?->role ?: Role::query()->where('role_name', 'Student')->first();

        return response()->json($this->studentDirectoryRow($freshUser, $profile, $role));
    }

    private function studentDirectoryRow(?TblUser $user, ?StudentProfile $profile, Role $studentRole): array
    {
        $sid = trim((string) ($profile?->student_id_number ?? ''));
        $rawEmail = (string) ($user?->email ?? '');
        $email = StudentAccountEmail::displayEmail($rawEmail, $sid);

        return [
            'user_id' => $user?->user_id,
            'student_id' => $profile?->student_id,
            'email' => $email,
            'contact_number' => $user?->contact_number ?? $profile?->contact_number,
            'role_id' => $user?->role_id ?? $studentRole->role_id,
            'role' => $user?->role ?? $studentRole,
            'status' => $user?->status ?? 'active',
            'studentProfile' => $profile,
            'student_profile' => $profile,
            'needs_login' => $user === null,
        ];
    }

    private function isPlaceholderStudentEmail(?string $email, ?string $studentIdNumber = null): bool
    {
        return StudentAccountEmail::isLoginPlaceholder($email, $studentIdNumber);
    }

    /**
     * Get eligible subjects for enrollment based on year level, semester, offered status, and prerequisite validation
     * This implements the instructor's requirement:
     * 1. Get subjects from curriculum based on year level and semester
     * 2. Check if each subject is offered
     * 3. Check prerequisites recursively for each subject
     * 4. Validate which subjects can be taken (passed prerequisite validation)
     */
    public function getEligibleSubjects(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            // Get student profile
            $profile = StudentProfile::where('user_id', $user->user_id)->first();
            $programId = $this->getStudentProgramId($profile);
            if (! $profile || ! $programId) {
                return response()->json(['message' => 'Student profile or program not found'], 404);
            }

            // Get parameters from request
            $yearLevelId = $request->input('year_level_id');
            $semesterId = $request->input('semester_id');
            $academicYearId = $request->input('academic_year_id');

            if (! $yearLevelId || ! $semesterId) {
                return response()->json([
                    'error' => 'year_level_id and semester_id are required',
                ], 400);
            }

            // Get all completed subjects from tbl_evaluation
            // A subject is considered passed if:
            // 1. evaluation_status is 'Passed', 'Pass', or 'Credit'
            // 2. OR grade >= 75 (default passing grade)
            $completedSubjects = Evaluation::where('student_id', $profile->student_id)
                ->where(function ($query) {
                    $query->whereIn('evaluation_status', ['Passed', 'Pass', 'Credit', 'passed', 'pass', 'credit'])
                        ->orWhere(function ($q) {
                            $q->whereNotNull('grade')
                                ->whereRaw('CAST(grade AS DECIMAL(10,2)) >= 75');
                        });
                })
                ->pluck('subject_id')
                ->toArray();

            // Get subjects from curriculum based on year level and semester
            $curriculumSubjects = Curriculum::where('program_id', $programId)
                ->where('year_level', $yearLevelId)
                ->where('semester_id', $semesterId)
                ->with([
                    'subject.prerequisites.requiredSubject',
                    'subject.offeredSubjects' => function ($query) use ($academicYearId, $semesterId) {
                        if ($academicYearId) {
                            $query->where('academic_year_id', $academicYearId);
                        }
                        if ($semesterId) {
                            $query->where('semester_id', $semesterId);
                        }
                        $query->where('status', 'active');
                    },
                ])
                ->get();

            $eligibleSubjects = [];

            foreach ($curriculumSubjects as $curriculumItem) {
                $subject = $curriculumItem->subject;
                if (! $subject) {
                    continue;
                }

                $subjectId = $subject->subject_id;

                // Step 2: Check if subject is offered
                $isOffered = false;
                if ($academicYearId) {
                    $offeredSubject = OfferedSubject::where('subject_id', $subjectId)
                        ->where('academic_year_id', $academicYearId)
                        ->where('semester_id', $semesterId)
                        ->where('status', 'active')
                        ->where('program_id', $programId)
                        ->first();
                    $isOffered = $offeredSubject !== null;
                } else {
                    // If no academic year specified, check if it's offered in any active academic year
                    $offeredSubject = OfferedSubject::where('subject_id', $subjectId)
                        ->where('semester_id', $semesterId)
                        ->where('status', 'active')
                        ->where('program_id', $programId)
                        ->first();
                    $isOffered = $offeredSubject !== null;
                }

                if (! $isOffered) {
                    continue; // Skip subjects that are not offered
                }

                // Step 3: Check prerequisites recursively
                $prerequisiteValidation = $this->validatePrerequisitesRecursive(
                    $subjectId,
                    $completedSubjects,
                    []
                );

                // Step 4: Validate if subject can be taken (all prerequisites passed)
                $canTake = $prerequisiteValidation['allPassed'];
                $missingPrerequisites = $prerequisiteValidation['missing'];

                $eligibleSubjects[] = [
                    'curriculum_id' => $curriculumItem->curriculum_id,
                    'subject_id' => $subjectId,
                    'subject_code' => $subject->subject_code,
                    'subject_name' => $subject->subject_name,
                    'number_of_units' => $subject->number_of_units,
                    'number_of_hrs' => $subject->number_of_hrs,
                    'is_offered' => $isOffered,
                    'can_take' => $canTake,
                    'missing_prerequisites' => $missingPrerequisites,
                    'all_prerequisites' => $prerequisiteValidation['allPrerequisites'],
                    'passing_grade' => $curriculumItem->passing_grade,
                    'subject_type' => $curriculumItem->subject_type,
                ];
            }

            return response()->json([
                'eligible_subjects' => $eligibleSubjects,
                'year_level_id' => $yearLevelId,
                'semester_id' => $semesterId,
                'academic_year_id' => $academicYearId,
                'completed_subjects_count' => count($completedSubjects),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to fetch eligible subjects',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Recursively validate prerequisites for a subject
     * Returns array with:
     * - allPassed: boolean indicating if all prerequisites are met
     * - missing: array of missing prerequisite subject codes
     * - allPrerequisites: array of all prerequisite subject codes (for display)
     */
    private function validatePrerequisitesRecursive($subjectId, $completedSubjects, $visited = [])
    {
        // Prevent infinite loops in case of circular dependencies
        if (in_array($subjectId, $visited)) {
            return [
                'allPassed' => true, // Assume passed to avoid blocking
                'missing' => [],
                'allPrerequisites' => [],
            ];
        }

        $visited[] = $subjectId;

        // Get all prerequisites for this subject
        $prerequisites = Prerequisite::where('subject_id', $subjectId)
            ->where('requisite_type', 'prerequisite')
            ->with('requiredSubject')
            ->get();

        $allPrerequisites = [];
        $missingPrerequisites = [];

        foreach ($prerequisites as $prereq) {
            $requiredSubjectId = $prereq->requisites_subject_id;
            $requiredSubject = $prereq->requiredSubject;

            if (! $requiredSubject) {
                continue;
            }

            $requiredSubjectCode = $requiredSubject->subject_code;

            // Recursively check if the prerequisite's prerequisites are met
            $nestedValidation = $this->validatePrerequisitesRecursive(
                $requiredSubjectId,
                $completedSubjects,
                $visited
            );

            // Collect all prerequisites (including nested ones)
            $allPrerequisites[] = $requiredSubjectCode;
            $allPrerequisites = array_merge($allPrerequisites, $nestedValidation['allPrerequisites']);

            // Check if the prerequisite itself is completed
            if (in_array($requiredSubjectId, $completedSubjects)) {
                // Prerequisite is completed, but check if nested prerequisites are also met
                if (! $nestedValidation['allPassed']) {
                    $missingPrerequisites = array_merge($missingPrerequisites, $nestedValidation['missing']);
                }

                // If both the prerequisite and its nested prerequisites are met, continue
                continue;
            }

            // Prerequisite is not completed
            // If nested prerequisites are also not all passed, add both this and nested missing prerequisites
            if (! $nestedValidation['allPassed']) {
                $missingPrerequisites[] = $requiredSubjectCode;
                $missingPrerequisites = array_merge($missingPrerequisites, $nestedValidation['missing']);
            } else {
                // Nested prerequisites are met, but this prerequisite itself is missing
                $missingPrerequisites[] = $requiredSubjectCode;
            }
        }

        return [
            'allPassed' => empty($missingPrerequisites),
            'missing' => array_unique($missingPrerequisites),
            'allPrerequisites' => array_unique($allPrerequisites),
        ];
    }
}
