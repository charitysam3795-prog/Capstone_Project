<?php

namespace App\Http\Controllers\Curriculum;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\Campus;
use App\Models\Curriculum;
use App\Models\CurriculumHeader;
use App\Models\Department;
use App\Models\ElectiveSlot;
use App\Models\ElectiveSubject;
use App\Models\OfferedSubject;
use App\Models\Prerequisite;
use App\Models\Program;
use App\Models\Role;
use App\Models\Section;
use App\Models\Semester;
use App\Models\Subject;
use App\Models\Track;
use App\Models\YearLevel;
use App\Services\RegularStudentAutoPromotion;
use App\Support\LookupDeleteGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class LookupDataController extends Controller
{
    private function normalizedSemesterStatus(?string $status): string
    {
        $s = strtolower(trim((string) ($status ?? '')));

        return $s === 'active' ? 'active' : 'inactive';
    }

    /** Parse 1–10 from labels like "4th Year" / "Fourth Year". */
    private function parseCollegeYearLevelNumber(?string $label): ?int
    {
        $text = strtolower(trim((string) ($label ?? '')));
        if ($text === '') {
            return null;
        }
        $patterns = [
            1 => '/(^|\D)(1|1st|first)(\D|$)/',
            2 => '/(^|\D)(2|2nd|second)(\D|$)/',
            3 => '/(^|\D)(3|3rd|third)(\D|$)/',
            4 => '/(^|\D)(4|4th|fourth)(\D|$)/',
            5 => '/(^|\D)(5|5th|fifth)(\D|$)/',
            6 => '/(^|\D)(6|6th|sixth)(\D|$)/',
            7 => '/(^|\D)(7|7th|seventh)(\D|$)/',
            8 => '/(^|\D)(8|8th|eighth)(\D|$)/',
            9 => '/(^|\D)(9|9th|ninth)(\D|$)/',
            10 => '/(^|\D)(10|10th|tenth)(\D|$)/',
        ];
        foreach ($patterns as $num => $pattern) {
            if (preg_match($pattern, $text)) {
                return $num;
            }
        }
        if (is_numeric($text)) {
            $n = (int) $text;

            return $n > 0 ? $n : null;
        }

        return null;
    }

    private function isInformationTechnologyProgram(?Program $program): bool
    {
        if (! $program) {
            return false;
        }

        $code = strtolower((string) $program->program_code);
        $name = strtolower((string) $program->program_name);

        return str_contains($code, 'it') || str_contains($name, 'information technology');
    }

    /** Ensure only one semester is active: deactivate all except $exceptSemesterId (when not null). */
    private function deactivateAllSemestersExcept(?int $exceptSemesterId): void
    {
        $q = Semester::query();
        if ($exceptSemesterId !== null) {
            $q->where('semester_id', '!=', $exceptSemesterId);
        }
        $q->update(['status' => 'inactive']);
    }

    /** Only one academic year is active: the current school year. */
    private function deactivateAllAcademicYearsExcept(?int $exceptAcademicYearId): void
    {
        $q = AcademicYear::query();
        if ($exceptAcademicYearId !== null) {
            $q->where('academic_year_id', '!=', $exceptAcademicYearId);
        }
        $q->update(['status' => 'inactive']);
    }

    private function ensureLookupAccess(Request $request, string $slug, bool $write = false): ?JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }
        if (! $user->canAccessLookupResource($slug, $write)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        return null;
    }

    /**
     * Activate / deactivate a Lookup Data row.
     * URL resource matches frontend paths (programs, year-levels, …).
     *
     * @return array{model: class-string, pk: string, slug: string, label: string}|null
     */
    private function lookupStatusResourceMap(string $lookupResource): ?array
    {
        return match ($lookupResource) {
            'programs' => ['model' => Program::class, 'pk' => 'program_id', 'slug' => 'programs', 'label' => 'program'],
            'departments' => ['model' => Department::class, 'pk' => 'department_id', 'slug' => 'departments', 'label' => 'department'],
            'subjects' => ['model' => Subject::class, 'pk' => 'subject_id', 'slug' => 'subjects', 'label' => 'subject'],
            'year-levels' => ['model' => YearLevel::class, 'pk' => 'year_level_id', 'slug' => 'year_levels', 'label' => 'year level'],
            'semesters' => ['model' => Semester::class, 'pk' => 'semester_id', 'slug' => 'semesters', 'label' => 'semester'],
            'campus' => ['model' => Campus::class, 'pk' => 'campus_id', 'slug' => 'campus', 'label' => 'campus'],
            'roles' => ['model' => Role::class, 'pk' => 'role_id', 'slug' => 'roles', 'label' => 'role'],
            'academic-years' => ['model' => AcademicYear::class, 'pk' => 'academic_year_id', 'slug' => 'academic_years', 'label' => 'academic year'],
            'tracks' => ['model' => Track::class, 'pk' => 'track_id', 'slug' => 'tracks', 'label' => 'track'],
            'curriculum-headers' => ['model' => CurriculumHeader::class, 'pk' => 'curriculum_header_id', 'slug' => 'curriculum_headers', 'label' => 'curriculum header'],
            'offered-subjects' => ['model' => OfferedSubject::class, 'pk' => 'offered_subject_id', 'slug' => 'offered_subjects', 'label' => 'offered subject'],
            'elective-subjects' => ['model' => ElectiveSubject::class, 'pk' => 'elective_subject_id', 'slug' => 'elective_subjects', 'label' => 'elective subject'],
            default => null,
        };
    }

    public function setLookupStatus(Request $request, string $lookupResource, $id)
    {
        $meta = $this->lookupStatusResourceMap($lookupResource);
        if ($meta === null) {
            return response()->json(['message' => 'Unknown lookup resource'], 404);
        }
        if ($resp = $this->ensureLookupAccess($request, $meta['slug'], true)) {
            return $resp;
        }

        $validated = $request->validate([
            'status' => 'required|in:active,inactive',
        ]);
        $status = $validated['status'];

        /** @var \Illuminate\Database\Eloquent\Model $modelClass */
        $modelClass = $meta['model'];
        $row = $modelClass::query()->findOrFail($id);

        $promotionStats = null;
        if ($lookupResource === 'semesters') {
            $promotionStats = [
                'promoted' => 0,
                'skipped_irregular' => 0,
                'skipped_incomplete' => 0,
                'unchanged' => 0,
            ];
            DB::transaction(function () use ($row, $id, $status, $request, &$promotionStats) {
                if ($status === 'active') {
                    $this->deactivateAllSemestersExcept((int) $id);
                }
                $row->update(['status' => $status]);
                if ($status === 'active') {
                    $promotionStats = app(RegularStudentAutoPromotion::class)
                        ->advanceOnSemesterActivation((int) $id, $request->user()?->user_id);
                }
            });
            $row->refresh();
            $auto = app(RegularStudentAutoPromotion::class);
            $message = $status === 'active'
                ? trim(($row->semester_name ?? 'Semester').' activated. '.$auto->formatSummary($promotionStats))
                : 'Semester deactivated.';

            return response()->json([
                'message' => $message,
                'status' => $status,
                $meta['pk'] => $row->{$meta['pk']},
                'auto_promotion' => $promotionStats,
            ]);
        }

        if ($lookupResource === 'academic-years') {
            DB::transaction(function () use ($row, $id, $status) {
                if ($status === 'active') {
                    $this->deactivateAllAcademicYearsExcept((int) $id);
                }
                $row->update(['status' => $status]);
            });

            return response()->json([
                'message' => $status === 'active'
                    ? trim(($row->academic_year_name ?? 'Academic year').' is now the current school year.')
                    : 'Academic year deactivated.',
                'status' => $status,
                $meta['pk'] => $row->{$meta['pk']},
            ]);
        }

        $row->update(['status' => $status]);

        return response()->json([
            'message' => ucfirst($meta['label']).' '.($status === 'active' ? 'activated' : 'deactivated'),
            'status' => $status,
            $meta['pk'] => $row->{$meta['pk']},
        ]);
    }

    /** Whether the user may read a lookup sidebar resource (same rules as individual GET endpoints). */
    private function canReadLookup(Request $request, string $slug): bool
    {
        $user = $request->user();
        if (! $user) {
            return false;
        }

        return $user->canAccessLookupResource($slug, false);
    }

    /** Same visibility rules as ElectiveSlotController::index. */
    private function canListElectiveSlotsBundle(Request $request): bool
    {
        $user = $request->user();
        if (! $user) {
            return false;
        }
        if ($user->isAdmin()) {
            return true;
        }

        return $user->hasAnyPermission([
            'Elective Slots',
            'electives.view',
            'electives.manage',
            'curriculum.view',
            'Curriculum Management',
        ]) || $user->canAccessLookupResource('elective_subjects', false);
    }

    /**
     * Single JSON payload for admin Lookup Data + Curriculum Management initial load (one HTTP round-trip).
     */
    public function getLookupPageBundle(Request $request)
    {
        try {
            if (! $request->user()) {
                return response()->json(['message' => 'Unauthenticated'], 401);
            }

            $programs = $this->canReadLookup($request, 'programs')
                ? Program::with('department')->orderByDesc('program_id')->get()
                : collect([]);
            $subjects = $this->canReadLookup($request, 'subjects')
                ? Subject::select('subject_id', 'subject_code', 'subject_name', 'number_of_units', 'number_of_hrs', 'status')
                    ->orderByDesc('subject_id')
                    ->get()
                : collect([]);
            $yearLevels = $this->canReadLookup($request, 'year_levels')
                ? YearLevel::select('year_level_id', 'year_level', 'status')->orderByDesc('year_level_id')->get()
                : collect([]);
            $semesters = $this->canReadLookup($request, 'semesters')
                ? Semester::select('semester_id', 'semester_name', 'status')
                    ->orderByDesc('semester_id')
                    ->get()
                    ->map(function ($semester) {
                        if ($semester->status === null || $semester->status === '') {
                            $semester->status = 'inactive';
                        }

                        return $semester;
                    })
                : collect([]);
            $requisites = $this->canReadLookup($request, 'requisites')
                ? Prerequisite::with(['subject', 'requiredSubject'])->orderByDesc('requisites_id')->get()
                : collect([]);
            $campus = $this->canReadLookup($request, 'campus')
                ? Campus::orderByDesc('campus_id')->get()
                : collect([]);
            $departments = $this->canReadLookup($request, 'departments')
                ? Department::with('campus')->orderByDesc('department_id')->get()
                : collect([]);
            $academicYears = $this->canReadLookup($request, 'academic_years')
                ? AcademicYear::orderByDesc('academic_year_id')
                    ->get()
                    ->map(function ($y) {
                        $status = strtolower(trim((string) ($y->status ?? '')));

                        return [
                            'academic_year_id' => $y->academic_year_id,
                            'academic_year_name' => $y->academic_year_name,
                            'name' => $y->academic_year_name,
                            'status' => $status === 'active' ? 'active' : ($status === '' ? 'active' : 'inactive'),
                        ];
                    })
                : collect([]);
            $roles = $this->canReadLookup($request, 'roles')
                ? Role::orderByDesc('role_id')->get()
                : collect([]);
            $tracks = $this->canReadLookup($request, 'tracks')
                ? Track::orderByDesc('track_id')->get()
                : collect([]);
            $curriculumHeaders = $this->canReadLookup($request, 'curriculum_headers')
                ? CurriculumHeader::with(['program', 'academicYear'])
                    ->orderByDesc('curriculum_header_id')
                    ->get()
                : collect([]);
            $curriculums = ($this->canReadLookup($request, 'curriculum_headers') || $this->canReadLookup($request, 'requisites'))
                ? Curriculum::with(['subject', 'program', 'yearLevel', 'semester', 'curriculumHeader'])
                    ->orderBy('program_id')
                    ->orderBy('year_level')
                    ->orderBy('semester_id')
                    ->orderBy('curriculum_id')
                    ->get()
                : collect([]);
            $offeredSubjects = $this->canReadLookup($request, 'offered_subjects')
                ? OfferedSubject::with(['subject', 'academicYear', 'semester', 'program', 'track', 'yearLevel'])
                    ->orderByDesc('offered_subject_id')
                    ->get()
                : collect([]);
            $electiveSubjects = $this->canReadLookup($request, 'elective_subjects')
                ? ElectiveSubject::with(['department', 'program', 'track', 'subject', 'electiveSlot'])
                    ->orderByDesc('elective_subject_id')
                    ->get()
                : collect([]);

            $electiveSlots = collect([]);
            if ($this->canListElectiveSlotsBundle($request)) {
                $slots = ElectiveSlot::with([
                    'program',
                    'semester',
                    'yearLevel',
                    'electiveSubjects.department',
                    'electiveSubjects.program',
                    'electiveSubjects.subject',
                    'electiveSubjects.track',
                ])
                    ->orderByDesc('elective_slot_id')
                    ->get();
                $electiveSlots = $slots->map(function ($slot) {
                    return [
                        'elective_slot_id' => $slot->elective_slot_id,
                        'program_id' => $slot->program_id,
                        'semester_id' => $slot->semester_id,
                        'year_level_id' => $slot->year_level_id,
                        'slot_name' => $slot->slot_name,
                        'status' => $slot->status,
                        'program' => $slot->program,
                        'semester' => $slot->semester,
                        'yearLevel' => $slot->yearLevel,
                        'electiveSubjects' => $slot->electiveSubjects->map(function ($es) {
                            return [
                                'elective_subject_id' => $es->elective_subject_id,
                                'elective_slot_id' => $es->elective_slot_id,
                                'subject_id' => $es->subject_id,
                                'department_id' => $es->department_id,
                                'program_id' => $es->program_id,
                                'track_id' => $es->track_id,
                                'description' => $es->description,
                                'department' => $es->department,
                                'program' => $es->program,
                                'subject' => $es->subject,
                                'track' => $es->track,
                            ];
                        }),
                    ];
                });
            }

            return response()->json([
                'programs' => $programs,
                'subjects' => $subjects,
                'yearLevels' => $yearLevels,
                'semesters' => $semesters,
                'requisites' => $requisites,
                'campus' => $campus,
                'departments' => $departments,
                'academicYears' => $academicYears,
                'roles' => $roles,
                'tracks' => $tracks,
                'curriculumHeaders' => $curriculumHeaders,
                'curriculums' => $curriculums,
                'offeredSubjects' => $offeredSubjects,
                'electiveSubjects' => $electiveSubjects,
                'electiveSlots' => $electiveSlots,
            ]);
        } catch (\Exception $e) {
            \Log::error('LookupDataController@getLookupPageBundle: '.$e->getMessage());

            return response()->json(['message' => 'Failed to load lookup bundle', 'error' => $e->getMessage()], 500);
        }
    }

    // Campus Management
    public function getCampus(Request $request)
    {
        try {
            if ($resp = $this->ensureLookupAccess($request, 'campus')) {
                return $resp;
            }

            return response()->json(Campus::orderByDesc('campus_id')->get());
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch campus', 'message' => $e->getMessage()], 500);
        }
    }

    public function createCampus(Request $request)
    {
        if ($resp = $this->ensureLookupAccess($request, 'campus', true)) {
            return $resp;
        }
        $validated = $request->validate(['campus_name' => 'required|string|max:100']);
        $campus = Campus::create([...$validated, 'status' => 'active']);

        return response()->json($campus, 201);
    }

    public function updateCampus(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'campus', true)) {
            return $resp;
        }
        $campus = Campus::findOrFail($id);
        $validated = $request->validate(['campus_name' => 'required|string|max:100']);
        $campus->update($validated);

        return response()->json($campus);
    }

    public function deleteCampus(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'campus', true)) {
            return $resp;
        }
        $campus = Campus::findOrFail($id);

        return LookupDeleteGuard::deleteOrConflict(
            'this campus',
            LookupDeleteGuard::campusLinks((int) $id),
            static fn () => $campus->delete()
        );
    }

    // Department Management
    public function getDepartments(Request $request)
    {
        try {
            if ($resp = $this->ensureLookupAccess($request, 'departments')) {
                return $resp;
            }

            return response()->json(Department::with('campus')->orderByDesc('department_id')->get());
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch departments', 'message' => $e->getMessage()], 500);
        }
    }

    public function createDepartment(Request $request)
    {
        try {
            \Log::info('Creating department with data:', $request->all());

            if ($resp = $this->ensureLookupAccess($request, 'departments', true)) {
                return $resp;
            }

            $validated = $request->validate([
                'campus_id' => 'required|exists:tbl_campus,campus_id',
                'department_name' => 'required|string|max:100',
                'department_code' => 'required|string|max:255',
            ]);

            \Log::info('Validated data:', $validated);

            $department = Department::create([...$validated, 'status' => 'active']);
            $department->load('campus');
            \Log::info('Department created:', $department->toArray());

            return response()->json($department, 201);
        } catch (ValidationException $e) {
            return response()->json([
                'error' => 'Validation failed',
                'messages' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            \Log::error('Error creating department: '.$e->getMessage());

            return response()->json(['error' => 'Failed to create department', 'message' => $e->getMessage()], 500);
        }
    }

    public function updateDepartment(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'departments', true)) {
            return $resp;
        }
        $department = Department::findOrFail($id);
        $validated = $request->validate([
            'campus_id' => 'required|exists:tbl_campus,campus_id',
            'department_name' => 'required|string|max:100',
            'department_code' => 'required|string|max:255',
        ]);
        $department->update($validated);
        $department->load('campus');

        return response()->json($department);
    }

    public function deleteDepartment(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'departments', true)) {
            return $resp;
        }
        $department = Department::findOrFail($id);

        return LookupDeleteGuard::deleteOrConflict(
            'this department',
            LookupDeleteGuard::departmentLinks((int) $id),
            static fn () => $department->delete()
        );
    }

    // Program Management
    public function getPrograms(Request $request)
    {
        try {
            if ($resp = $this->ensureLookupAccess($request, 'programs')) {
                return $resp;
            }

            return response()->json(Program::with('department')->orderByDesc('program_id')->get());
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch programs', 'message' => $e->getMessage()], 500);
        }
    }

    public function createProgram(Request $request)
    {
        if ($resp = $this->ensureLookupAccess($request, 'programs', true)) {
            return $resp;
        }
        $validated = $request->validate([
            'department_id' => 'required|exists:tbl_departments,department_id',
            'program_code' => 'nullable|string|max:50',
            'program_name' => 'nullable|string|max:100',
            'total_units_required' => 'nullable|integer',
        ]);

        // Get campus_id from the department
        $department = Department::find($validated['department_id']);
        $campusId = $department->campus_id;

        // Fallback: if department has no campus, use the first available campus
        if (! $campusId) {
            $campus = Campus::first();
            if (! $campus) {
                return response()->json(['error' => 'No campus found. Please create a campus first.'], 400);
            }
            $campusId = $campus->campus_id;
        }

        $validated['campus_id'] = $campusId;
        $validated['status'] = 'active';

        $program = Program::create($validated);
        $program->load('department');

        return response()->json($program, 201);
    }

    public function updateProgram(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'programs', true)) {
            return $resp;
        }
        $program = Program::findOrFail($id);
        $validated = $request->validate([
            'department_id' => 'required|exists:tbl_departments,department_id',
            'program_code' => 'nullable|string|max:50',
            'program_name' => 'nullable|string|max:100',
            'total_units_required' => 'nullable|integer',
        ]);

        // Get campus_id from the department if department changed
        $department = Department::find($validated['department_id']);
        $campusId = $department->campus_id;

        // Fallback: if department has no campus, use the first available campus
        if (! $campusId) {
            $campus = Campus::first();
            if (! $campus) {
                return response()->json(['error' => 'No campus found. Please create a campus first.'], 400);
            }
            $campusId = $campus->campus_id;
        }

        $validated['campus_id'] = $campusId;

        $program->update($validated);
        $program->load('department');

        return response()->json($program);
    }

    public function deleteProgram(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'programs', true)) {
            return $resp;
        }
        $program = Program::findOrFail($id);

        return LookupDeleteGuard::deleteOrConflict(
            'this program',
            LookupDeleteGuard::programLinks((int) $id),
            static fn () => $program->delete()
        );
    }

    // Subject Management
    public function getSubjects(Request $request)
    {
        try {
            if ($resp = $this->ensureLookupAccess($request, 'subjects')) {
                return $resp;
            }

            return response()->json(Subject::orderByDesc('subject_id')->get());
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch subjects', 'message' => $e->getMessage()], 500);
        }
    }

    public function createSubject(Request $request)
    {
        if ($resp = $this->ensureLookupAccess($request, 'subjects', true)) {
            return $resp;
        }
        $validated = $request->validate([
            'subject_code' => [
                'required',
                'string',
                'max:50',
                Rule::unique('tbl_subjects', 'subject_code'),
                'not_regex:/[<>`\\\\]/i',
            ],
            'subject_name' => 'required|string|max:100|not_regex:/[<>`\\\\]/i',
            'number_of_units' => 'nullable|integer',
            'number_of_hrs' => 'nullable|integer',
        ]);
        $subject = Subject::create([...$validated, 'status' => 'active']);

        return response()->json($subject, 201);
    }

    public function updateSubject(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'subjects', true)) {
            return $resp;
        }
        $subject = Subject::findOrFail($id);
        $validated = $request->validate([
            'subject_code' => [
                'required',
                'string',
                'max:50',
                Rule::unique('tbl_subjects', 'subject_code')->ignore((int) $id, 'subject_id'),
                'not_regex:/[<>`\\\\]/i',
            ],
            'subject_name' => 'required|string|max:100|not_regex:/[<>`\\\\]/i',
            'number_of_units' => 'nullable|integer',
            'number_of_hrs' => 'nullable|integer',
        ]);
        $subject->update($validated);

        return response()->json($subject);
    }

    public function deleteSubject(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'subjects', true)) {
            return $resp;
        }
        $subject = Subject::findOrFail($id);

        return LookupDeleteGuard::deleteOrConflict(
            'this subject',
            LookupDeleteGuard::subjectLinks((int) $id),
            static fn () => $subject->delete()
        );
    }

    // Year Level Management
    public function getYearLevels(Request $request)
    {
        try {
            if ($resp = $this->ensureLookupAccess($request, 'year_levels')) {
                return $resp;
            }

            return response()->json(YearLevel::orderByDesc('year_level_id')->get());
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch year levels', 'message' => $e->getMessage()], 500);
        }
    }

    public function createYearLevel(Request $request)
    {
        if ($resp = $this->ensureLookupAccess($request, 'year_levels', true)) {
            return $resp;
        }
        $validated = $request->validate(['year_level' => 'required|string|max:50']);
        $yearNum = $this->parseCollegeYearLevelNumber($validated['year_level']);
        if ($yearNum !== null && $yearNum > 5) {
            return response()->json([
                'error' => 'Validation failed',
                'messages' => [
                    'year_level' => [
                        'College year levels are 1st–4th Year (5th Year only for Architecture). Retakes use Extended study containers on evaluation — do not add 6th–10th year levels.',
                    ],
                ],
            ], 422);
        }
        $yearLevel = YearLevel::create([...$validated, 'status' => 'active']);

        return response()->json($yearLevel, 201);
    }

    public function updateYearLevel(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'year_levels', true)) {
            return $resp;
        }
        $yearLevel = YearLevel::findOrFail($id);
        $validated = $request->validate(['year_level' => 'required|string|max:50']);
        $yearNum = $this->parseCollegeYearLevelNumber($validated['year_level']);
        if ($yearNum !== null && $yearNum > 5) {
            return response()->json([
                'error' => 'Validation failed',
                'messages' => [
                    'year_level' => [
                        'College year levels are 1st–4th Year (5th Year only for Architecture). Retakes use Extended study containers on evaluation — do not add 6th–10th year levels.',
                    ],
                ],
            ], 422);
        }
        $yearLevel->update($validated);

        return response()->json($yearLevel);
    }

    public function deleteYearLevel(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'year_levels', true)) {
            return $resp;
        }
        $yearLevel = YearLevel::findOrFail($id);

        return LookupDeleteGuard::deleteOrConflict(
            'this year level',
            LookupDeleteGuard::yearLevelLinks((int) $id),
            static fn () => $yearLevel->delete()
        );
    }

    // Semester Management
    public function getSemesters(Request $request)
    {
        try {
            if ($resp = $this->ensureLookupAccess($request, 'semesters')) {
                return $resp;
            }
            $semesters = Semester::orderByDesc('semester_id')->get()->map(function ($semester) {
                if ($semester->status === null || $semester->status === '') {
                    $semester->status = 'inactive';
                }

                return $semester;
            });

            return response()->json($semesters);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch semesters', 'message' => $e->getMessage()], 500);
        }
    }

    // Academic Year Management
    public function getAcademicYears(Request $request)
    {
        try {
            if ($resp = $this->ensureLookupAccess($request, 'academic_years')) {
                return $resp;
            }
            $years = AcademicYear::orderByDesc('academic_year_id')
                ->get()
                ->map(function ($y) {
                    $status = strtolower(trim((string) ($y->status ?? '')));

                    return [
                        'academic_year_id' => $y->academic_year_id,
                        'academic_year_name' => $y->academic_year_name,
                        'name' => $y->academic_year_name,
                        'status' => $status === 'active' ? 'active' : ($status === '' ? 'active' : 'inactive'),
                    ];
                });

            return response()->json($years);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch academic years', 'message' => $e->getMessage()], 500);
        }
    }

    public function createAcademicYear(Request $request)
    {
        if ($resp = $this->ensureLookupAccess($request, 'academic_years', true)) {
            return $resp;
        }

        $validated = $request->validate([
            'academic_year_name' => 'sometimes|string|max:100',
            'name' => 'sometimes|string|max:100',
            'status' => 'nullable|in:active,inactive',
        ]);

        $yearName = $validated['academic_year_name'] ?? $validated['name'] ?? null;
        $status = strtolower(trim((string) ($validated['status'] ?? 'inactive')));
        if ($status !== 'active') {
            $status = 'inactive';
        }
        $year = DB::transaction(function () use ($yearName, $status) {
            if ($status === 'active') {
                $this->deactivateAllAcademicYearsExcept(null);
            }

            return AcademicYear::create([
                'academic_year_name' => $yearName,
                'status' => $status,
            ]);
        });

        return response()->json([
            'academic_year_id' => $year->academic_year_id,
            'academic_year_name' => $year->academic_year_name,
            'name' => $year->academic_year_name,
            'status' => $year->status ?? $status,
        ], 201);
    }

    public function updateAcademicYear(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'academic_years', true)) {
            return $resp;
        }

        $year = AcademicYear::findOrFail($id);

        $validated = $request->validate([
            'academic_year_name' => 'sometimes|string|max:100',
            'name' => 'sometimes|string|max:100',
        ]);

        $yearName = $validated['academic_year_name'] ?? $validated['name'] ?? null;
        if ($yearName !== null) {
            $year->update(['academic_year_name' => $yearName]);
        }

        return response()->json([
            'academic_year_id' => $year->academic_year_id,
            'academic_year_name' => $year->academic_year_name,
            'name' => $year->academic_year_name,
        ]);
    }

    public function deleteAcademicYear(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'academic_years', true)) {
            return $resp;
        }

        $year = AcademicYear::findOrFail($id);
        $label = trim((string) ($year->academic_year_name ?? '')) ?: 'this academic year';

        return LookupDeleteGuard::deleteOrConflict(
            $label,
            LookupDeleteGuard::academicYearLinks((int) $id),
            static fn () => $year->delete()
        );
    }

    public function createSemester(Request $request)
    {
        if ($resp = $this->ensureLookupAccess($request, 'semesters', true)) {
            return $resp;
        }
        $validated = $request->validate([
            'semester_name' => 'required|string|max:50',
            'status' => 'nullable|in:active,inactive',
        ]);

        $status = $validated['status'] ?? null;
        if ($status === null || $status === '') {
            $status = 'inactive';
        }

        // Only one semester may be active at a time
        if ($status === 'active') {
            $this->deactivateAllSemestersExcept(null);
        }

        $semester = Semester::create([
            'semester_name' => $validated['semester_name'],
            'status' => $status,
        ]);

        return response()->json($semester, 201);
    }

    public function updateSemester(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'semesters', true)) {
            return $resp;
        }
        $semester = Semester::findOrFail($id);
        $validated = $request->validate([
            'semester_name' => 'required|string|max:50',
            'status' => 'nullable|in:active,inactive',
        ]);

        $status = $validated['status'] ?? null;
        if ($status === null || $status === '') {
            $status = 'inactive';
        }

        $wasActive = $this->normalizedSemesterStatus($semester->status) === 'active';
        $promotionStats = null;

        DB::transaction(function () use ($semester, $id, $validated, $status, $wasActive, $request, &$promotionStats) {
            if ($status === 'active') {
                $this->deactivateAllSemestersExcept((int) $id);
            }

            $semester->update([
                'semester_name' => $validated['semester_name'],
                'status' => $status,
            ]);

            // Run auto-promotion when this semester becomes the active one.
            if ($status === 'active' && ! $wasActive) {
                $promotionStats = app(RegularStudentAutoPromotion::class)
                    ->advanceOnSemesterActivation((int) $id, $request->user()?->user_id);
            }
        });

        $semester->refresh();
        $payload = $semester->toArray();
        if ($promotionStats !== null) {
            $auto = app(RegularStudentAutoPromotion::class);
            $payload['auto_promotion'] = $promotionStats;
            $payload['message'] = trim($semester->semester_name.' activated. '.$auto->formatSummary($promotionStats));
        }

        return response()->json($payload);
    }

    public function toggleSemesterStatus(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'semesters', true)) {
            return $resp;
        }

        $id = (int) $id;
        $semester = Semester::findOrFail($id);
        $current = $this->normalizedSemesterStatus($semester->status);
        $newStatus = $current === 'active' ? 'inactive' : 'active';

        $promotionStats = [
            'promoted' => 0,
            'skipped_irregular' => 0,
            'skipped_incomplete' => 0,
            'unchanged' => 0,
        ];

        DB::transaction(function () use ($semester, $id, $newStatus, $request, &$promotionStats) {
            if ($newStatus === 'active') {
                $this->deactivateAllSemestersExcept($id);
            }
            $semester->update(['status' => $newStatus]);

            if ($newStatus === 'active') {
                $promotionStats = app(RegularStudentAutoPromotion::class)
                    ->advanceOnSemesterActivation($id, $request->user()?->user_id);
            }
        });

        $semester->refresh();
        $auto = app(RegularStudentAutoPromotion::class);

        return response()->json([
            'semester_id' => $semester->semester_id,
            'semester_name' => $semester->semester_name,
            'status' => $this->normalizedSemesterStatus($semester->status),
            'auto_promotion' => $promotionStats,
            'message' => $newStatus === 'active'
                ? trim($semester->semester_name.' activated. '.$auto->formatSummary($promotionStats))
                : 'Semester deactivated.',
        ]);
    }

    public function deleteSemester(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'semesters', true)) {
            return $resp;
        }
        $semester = Semester::findOrFail($id);

        return LookupDeleteGuard::deleteOrConflict(
            'this semester',
            LookupDeleteGuard::semesterLinks((int) $id),
            static fn () => $semester->delete()
        );
    }

    // Role Management
    public function getRoles(Request $request)
    {
        try {
            if ($resp = $this->ensureLookupAccess($request, 'roles')) {
                return $resp;
            }

            return response()->json(Role::orderByDesc('role_id')->get());
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch roles', 'message' => $e->getMessage()], 500);
        }
    }

    // Access Levels Management
    public function getAccessLevels(Request $request)
    {
        try {
            if ($resp = $this->ensureLookupAccess($request, 'roles')) {
                return $resp;
            }

            // Return predefined access levels matching the database
            $accessLevels = [
                ['id' => 10, 'name' => 'Admin', 'description' => 'Full system access'],
                ['id' => 8, 'name' => 'Adviser', 'description' => 'Adviser access'],
                ['id' => 9, 'name' => 'Dean', 'description' => 'Dean access'],
                ['id' => 5, 'name' => 'Student', 'description' => 'Student access'],
            ];

            return response()->json($accessLevels);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch access levels', 'message' => $e->getMessage()], 500);
        }
    }

    public function createRole(Request $request)
    {
        if ($resp = $this->ensureLookupAccess($request, 'roles', true)) {
            return $resp;
        }

        $validated = $request->validate([
            'role_name' => 'required|string|max:100',
            'access_level' => 'nullable|integer',
            'description' => 'nullable|string',
        ]);

        $role = Role::create([
            'role_name' => $validated['role_name'],
            'access_level' => $validated['access_level'] ?? null,
            'description' => $validated['description'] ?? null,
            'status' => 'active',
        ]);

        return response()->json($role, 201);
    }

    public function updateRole(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'roles', true)) {
            return $resp;
        }

        $role = Role::findOrFail($id);

        $validated = $request->validate([
            'role_name' => 'required|string|max:100',
            'access_level' => 'nullable|integer',
            'description' => 'nullable|string',
        ]);

        $role->update($validated);

        return response()->json($role);
    }

    public function deleteRole(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'roles', true)) {
            return $resp;
        }

        $role = Role::findOrFail($id);

        return LookupDeleteGuard::deleteOrConflict(
            'this role',
            LookupDeleteGuard::roleLinks((int) $id),
            static fn () => $role->delete()
        );
    }

    // Section Management
    public function getSections(Request $request)
    {
        try {
            if ($resp = $this->ensureLookupAccess($request, 'sections')) {
                return $resp;
            }
            $sections = Section::orderByDesc('section_id')->get()->map(function ($s) {
                return [
                    'section_id' => $s->section_id,
                    'name' => $s->section_name,
                ];
            });

            return response()->json($sections);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch sections', 'message' => $e->getMessage()], 500);
        }
    }

    public function createSection(Request $request)
    {
        if ($resp = $this->ensureLookupAccess($request, 'sections', true)) {
            return $resp;
        }

        $validated = $request->validate([
            'name' => 'required|string|max:50',
            'section_name' => 'sometimes|string|max:50',
        ]);

        $sectionName = $validated['name'] ?? $validated['section_name'] ?? null;

        $section = Section::create([
            'section_name' => $sectionName,
        ]);

        return response()->json([
            'section_id' => $section->section_id,
            'name' => $section->section_name,
        ], 201);
    }

    public function updateSection(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'sections', true)) {
            return $resp;
        }

        $section = Section::findOrFail($id);

        $validated = $request->validate([
            'name' => 'required|string|max:50',
            'section_name' => 'sometimes|string|max:50',
        ]);

        $sectionName = $validated['name'] ?? $validated['section_name'] ?? null;
        $section->update(['section_name' => $sectionName]);

        return response()->json([
            'section_id' => $section->section_id,
            'name' => $section->section_name,
        ]);
    }

    public function deleteSection(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'sections', true)) {
            return $resp;
        }

        $section = Section::findOrFail($id);

        return LookupDeleteGuard::deleteOrConflict(
            'this section',
            LookupDeleteGuard::sectionLinks((int) $id),
            static fn () => $section->delete()
        );
    }

    // Track Management
    public function getTracks(Request $request)
    {
        try {
            if ($resp = $this->ensureLookupAccess($request, 'tracks')) {
                return $resp;
            }

            return response()->json(Track::orderByDesc('track_id')->get());
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch tracks', 'message' => $e->getMessage()], 500);
        }
    }

    public function createTrack(Request $request)
    {
        if ($resp = $this->ensureLookupAccess($request, 'tracks', true)) {
            return $resp;
        }

        $validated = $request->validate([
            'track_code' => 'required|string|max:50',
            'track_name' => 'required|string|max:100',
        ]);

        $track = Track::create([...$validated, 'status' => 'active']);

        return response()->json($track, 201);
    }

    public function updateTrack(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'tracks', true)) {
            return $resp;
        }

        $track = Track::findOrFail($id);
        $validated = $request->validate([
            'track_code' => 'required|string|max:50',
            'track_name' => 'required|string|max:100',
        ]);

        $track->update($validated);

        return response()->json($track);
    }

    public function deleteTrack(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'tracks', true)) {
            return $resp;
        }

        $track = Track::findOrFail($id);

        return LookupDeleteGuard::deleteOrConflict(
            'this track',
            LookupDeleteGuard::trackLinks((int) $id),
            static fn () => $track->delete()
        );
    }

    // Requisite Management (tbl_prerequisite)
    public function getRequisites(Request $request)
    {
        try {
            if ($resp = $this->ensureLookupAccess($request, 'requisites')) {
                return $resp;
            }

            $requisites = Prerequisite::with(['subject', 'requiredSubject'])
                ->orderByDesc('requisites_id')
                ->get();

            return response()->json($requisites);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch requisites', 'message' => $e->getMessage()], 500);
        }
    }

    public function createRequisite(Request $request)
    {
        if ($resp = $this->ensureLookupAccess($request, 'requisites', true)) {
            return $resp;
        }

        $validated = $request->validate([
            'subject_id' => 'required|exists:tbl_subjects,subject_id',
            'requisite_type' => 'required|in:prerequisite,corequisite',
            'requisites_subject_id' => 'required|exists:tbl_subjects,subject_id|different:subject_id',
        ]);

        $requisite = Prerequisite::firstOrCreate($validated);

        Prerequisite::where('subject_id', $validated['subject_id'])
            ->where('requisite_type', $validated['requisite_type'])
            ->where('requisites_subject_id', $validated['requisites_subject_id'])
            ->where('requisites_id', '!=', $requisite->requisites_id)
            ->delete();

        $requisite->load(['subject', 'requiredSubject']);

        return response()->json($requisite, $requisite->wasRecentlyCreated ? 201 : 200);
    }

    public function syncRequisites(Request $request)
    {
        if ($resp = $this->ensureLookupAccess($request, 'requisites', true)) {
            return $resp;
        }

        $validated = $request->validate([
            'subject_id' => 'required|exists:tbl_subjects,subject_id',
            'requisite_type' => 'required|in:prerequisite,corequisite',
            'required_subject_ids' => 'present|array',
            'required_subject_ids.*' => 'integer|exists:tbl_subjects,subject_id|different:subject_id',
            'rule_label' => 'nullable|string|max:100',
        ]);

        $requiredSubjectIds = collect($validated['required_subject_ids'])
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id !== (int) $validated['subject_id'])
            ->unique()
            ->values();
        $ruleLabel = trim((string) ($validated['rule_label'] ?? '')) ?: null;

        DB::transaction(function () use ($validated, $requiredSubjectIds, $ruleLabel) {
            Prerequisite::where('subject_id', $validated['subject_id'])
                ->where('requisite_type', $validated['requisite_type'])
                ->whereNotIn('requisites_subject_id', $requiredSubjectIds)
                ->delete();

            foreach ($requiredSubjectIds as $requiredSubjectId) {
                $requisite = Prerequisite::firstOrCreate([
                    'subject_id' => $validated['subject_id'],
                    'requisite_type' => $validated['requisite_type'],
                    'requisites_subject_id' => $requiredSubjectId,
                ]);
                $requisite->rule_label = $ruleLabel;
                $requisite->save();

                Prerequisite::where('subject_id', $validated['subject_id'])
                    ->where('requisite_type', $validated['requisite_type'])
                    ->where('requisites_subject_id', $requiredSubjectId)
                    ->where('requisites_id', '!=', $requisite->requisites_id)
                    ->delete();
            }
        });

        $requisites = Prerequisite::with(['subject', 'requiredSubject'])
            ->where('subject_id', $validated['subject_id'])
            ->where('requisite_type', $validated['requisite_type'])
            ->orderBy('requisites_subject_id')
            ->get();

        return response()->json([
            'message' => 'Requisites synced successfully',
            'requisites' => $requisites,
        ]);
    }

    public function updateRequisite(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'requisites', true)) {
            return $resp;
        }

        $requisite = Prerequisite::findOrFail($id);

        $validated = $request->validate([
            'subject_id' => 'required|exists:tbl_subjects,subject_id',
            'requisite_type' => 'required|in:prerequisite,corequisite',
            'requisites_subject_id' => 'required|exists:tbl_subjects,subject_id|different:subject_id',
        ]);

        $existing = Prerequisite::where('subject_id', $validated['subject_id'])
            ->where('requisite_type', $validated['requisite_type'])
            ->where('requisites_subject_id', $validated['requisites_subject_id'])
            ->where('requisites_id', '!=', $requisite->requisites_id)
            ->first();

        if ($existing) {
            $requisite->delete();
            $existing->load(['subject', 'requiredSubject']);

            return response()->json($existing);
        }

        $requisite->update($validated);

        Prerequisite::where('subject_id', $validated['subject_id'])
            ->where('requisite_type', $validated['requisite_type'])
            ->where('requisites_subject_id', $validated['requisites_subject_id'])
            ->where('requisites_id', '!=', $requisite->requisites_id)
            ->delete();

        $requisite->load(['subject', 'requiredSubject']);

        return response()->json($requisite);
    }

    public function deleteRequisite(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'requisites', true)) {
            return $resp;
        }

        $requisite = Prerequisite::findOrFail($id);
        $requisite->delete();

        return response()->json(['message' => 'Requisite deleted successfully']);
    }

    // Curriculum Header Management
    public function getCurriculumHeaders(Request $request)
    {
        try {
            if ($resp = $this->ensureLookupAccess($request, 'curriculum_headers')) {
                return $resp;
            }

            $headers = CurriculumHeader::with(['program', 'academicYear'])
                ->orderByDesc('curriculum_header_id')
                ->get();

            return response()->json($headers);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch curriculum headers', 'message' => $e->getMessage()], 500);
        }
    }

    public function createCurriculumHeader(Request $request)
    {
        if ($resp = $this->ensureLookupAccess($request, 'curriculum_headers', true)) {
            return $resp;
        }

        $validated = $request->validate([
            'program_id' => 'required|exists:tbl_program,program_id',
            'Effective_Year' => 'required|integer',
            'academic_year_id' => 'required|exists:tbl_academic_year,academic_year_id',
            'description' => 'nullable|string',
        ]);

        $header = CurriculumHeader::create([...$validated, 'status' => 'active']);
        $header->load(['program', 'academicYear']);

        return response()->json($header, 201);
    }

    public function updateCurriculumHeader(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'curriculum_headers', true)) {
            return $resp;
        }

        $header = CurriculumHeader::findOrFail($id);

        $validated = $request->validate([
            'program_id' => 'required|exists:tbl_program,program_id',
            'Effective_Year' => 'required|integer',
            'academic_year_id' => 'required|exists:tbl_academic_year,academic_year_id',
            'description' => 'nullable|string',
        ]);

        $header->update($validated);
        $header->load(['program', 'academicYear']);

        return response()->json($header);
    }

    public function deleteCurriculumHeader(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'curriculum_headers', true)) {
            return $resp;
        }

        $header = CurriculumHeader::findOrFail($id);

        return LookupDeleteGuard::deleteOrConflict(
            'this curriculum header',
            LookupDeleteGuard::curriculumHeaderLinks((int) $id),
            static fn () => $header->delete()
        );
    }

    // Offered Subject Management
    public function getOfferedSubjects(Request $request)
    {
        try {
            if ($resp = $this->ensureLookupAccess($request, 'offered_subjects')) {
                return $resp;
            }

            $offered = OfferedSubject::with(['subject', 'academicYear', 'semester', 'program', 'track', 'yearLevel'])
                ->orderByDesc('offered_subject_id')
                ->get();

            return response()->json($offered);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch offered subjects', 'message' => $e->getMessage()], 500);
        }
    }

    /** Offered subjects always belong to the present school year. */
    private function applyCurrentAcademicYear(array &$validated): ?JsonResponse
    {
        $currentId = AcademicYear::currentId();
        if ($currentId <= 0) {
            return response()->json([
                'message' => 'No current academic year found. Add the present school year under Lookup → Academic year and set it active.',
            ], 422);
        }
        $validated['academic_year_id'] = $currentId;

        return null;
    }

    public function createOfferedSubject(Request $request)
    {
        if ($resp = $this->ensureLookupAccess($request, 'offered_subjects', true)) {
            return $resp;
        }

        $validated = $request->validate([
            'subject_id' => 'required|exists:tbl_subjects,subject_id',
            'academic_year_id' => 'nullable|exists:tbl_academic_year,academic_year_id',
            'semester_id' => 'required|exists:tbl_semester,semester_id',
            'program_id' => 'required|exists:tbl_program,program_id',
            'track_id' => 'nullable|exists:tbl_track,track_id',
            'year_level_id' => 'nullable|exists:year_level,year_level_id',
            'status' => 'nullable|in:active,inactive',
        ]);
        $validated['status'] = 'active';
        if ($resp = $this->applyCurrentAcademicYear($validated)) {
            return $resp;
        }

        $offered = OfferedSubject::create($validated);
        $offered->load(['subject', 'academicYear', 'semester', 'program', 'track', 'yearLevel']);

        return response()->json($offered, 201);
    }

    public function updateOfferedSubject(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'offered_subjects', true)) {
            return $resp;
        }

        $offered = OfferedSubject::findOrFail($id);

        $validated = $request->validate([
            'subject_id' => 'required|exists:tbl_subjects,subject_id',
            'academic_year_id' => 'nullable|exists:tbl_academic_year,academic_year_id',
            'semester_id' => 'required|exists:tbl_semester,semester_id',
            'program_id' => 'required|exists:tbl_program,program_id',
            'track_id' => 'nullable|exists:tbl_track,track_id',
            'year_level_id' => 'nullable|exists:year_level,year_level_id',
            'status' => 'nullable|in:active,inactive',
        ]);
        $validated['status'] = $validated['status'] ?? 'active';
        if ($resp = $this->applyCurrentAcademicYear($validated)) {
            return $resp;
        }

        $offered->update($validated);
        $offered->load(['subject', 'academicYear', 'semester', 'program', 'track', 'yearLevel']);

        return response()->json($offered);
    }

    public function setOfferedSubjectStatus(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'offered_subjects', true)) {
            return $resp;
        }

        $validated = $request->validate([
            'status' => 'required|in:active,inactive',
        ]);

        $offered = OfferedSubject::findOrFail($id);
        $offered->update(['status' => $validated['status']]);
        $offered->load(['subject', 'academicYear', 'semester', 'program', 'track', 'yearLevel']);

        return response()->json($offered);
    }

    public function deleteOfferedSubject(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'offered_subjects', true)) {
            return $resp;
        }

        $offered = OfferedSubject::findOrFail($id);

        return LookupDeleteGuard::deleteOrConflict(
            'this offered subject',
            LookupDeleteGuard::offeredSubjectLinks((int) $id),
            static fn () => $offered->delete()
        );
    }

    // Elective Subject Management
    public function getElectiveSubjects(Request $request)
    {
        try {
            if ($resp = $this->ensureLookupAccess($request, 'elective_subjects')) {
                return $resp;
            }

            $electives = ElectiveSubject::with(['department', 'program', 'track', 'subject', 'electiveSlot'])
                ->orderByDesc('elective_subject_id')
                ->get();

            return response()->json($electives);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch elective subjects', 'message' => $e->getMessage()], 500);
        }
    }

    public function createElectiveSubject(Request $request)
    {
        if ($resp = $this->ensureLookupAccess($request, 'elective_subjects', true)) {
            return $resp;
        }

        $validated = $request->validate([
            'department_id' => 'required|exists:tbl_departments,department_id',
            'program_id' => 'required|exists:tbl_program,program_id',
            'track_id' => 'nullable|exists:tbl_track,track_id',
            'subject_id' => 'required|exists:tbl_subjects,subject_id',
            'elective_slot_id' => 'nullable|exists:tbl_elective_slot,elective_slot_id',
            'description' => 'nullable|string',
        ]);

        $program = Program::findOrFail($validated['program_id']);
        if ((int) $program->department_id !== (int) $validated['department_id']) {
            return response()->json([
                'message' => 'The selected program does not belong to the selected department.',
                'errors' => ['program_id' => ['The selected program does not belong to the selected department.']],
            ], 422);
        }

        if (! empty($validated['elective_slot_id'])) {
            $slot = ElectiveSlot::findOrFail($validated['elective_slot_id']);
            if ((int) $slot->program_id !== (int) $validated['program_id']) {
                return response()->json([
                    'message' => 'The selected elective slot does not belong to the selected program.',
                    'errors' => ['elective_slot_id' => ['The selected elective slot does not belong to the selected program.']],
                ], 422);
            }
        } else {
            $validated['elective_slot_id'] = null;
        }

        if ($this->isInformationTechnologyProgram($program)) {
            if (empty($validated['track_id'])) {
                return response()->json([
                    'message' => 'Track is required for IT elective subjects.',
                    'errors' => ['track_id' => ['Track is required for IT elective subjects.']],
                ], 422);
            }
        } else {
            $validated['track_id'] = null;
        }

        $validated['status'] = 'active';

        $elective = ElectiveSubject::create($validated);
        $elective->load(['department', 'program', 'track', 'subject', 'electiveSlot']);

        return response()->json($elective, 201);
    }

    public function updateElectiveSubject(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'elective_subjects', true)) {
            return $resp;
        }

        $elective = ElectiveSubject::findOrFail($id);

        $validated = $request->validate([
            'department_id' => 'required|exists:tbl_departments,department_id',
            'program_id' => 'required|exists:tbl_program,program_id',
            'track_id' => 'nullable|exists:tbl_track,track_id',
            'subject_id' => 'required|exists:tbl_subjects,subject_id',
            'elective_slot_id' => 'nullable|exists:tbl_elective_slot,elective_slot_id',
            'description' => 'nullable|string',
        ]);

        $program = Program::findOrFail($validated['program_id']);
        if ((int) $program->department_id !== (int) $validated['department_id']) {
            return response()->json([
                'message' => 'The selected program does not belong to the selected department.',
                'errors' => ['program_id' => ['The selected program does not belong to the selected department.']],
            ], 422);
        }

        if (! empty($validated['elective_slot_id'])) {
            $slot = ElectiveSlot::findOrFail($validated['elective_slot_id']);
            if ((int) $slot->program_id !== (int) $validated['program_id']) {
                return response()->json([
                    'message' => 'The selected elective slot does not belong to the selected program.',
                    'errors' => ['elective_slot_id' => ['The selected elective slot does not belong to the selected program.']],
                ], 422);
            }
        } else {
            $validated['elective_slot_id'] = null;
        }

        if ($this->isInformationTechnologyProgram($program)) {
            if (empty($validated['track_id'])) {
                return response()->json([
                    'message' => 'Track is required for IT elective subjects.',
                    'errors' => ['track_id' => ['Track is required for IT elective subjects.']],
                ], 422);
            }
        } else {
            $validated['track_id'] = null;
        }

        $elective->update($validated);
        $elective->load(['department', 'program', 'track', 'subject', 'electiveSlot']);

        return response()->json($elective);
    }

    public function deleteElectiveSubject(Request $request, $id)
    {
        if ($resp = $this->ensureLookupAccess($request, 'elective_subjects', true)) {
            return $resp;
        }

        $elective = ElectiveSubject::findOrFail($id);

        return LookupDeleteGuard::deleteOrConflict(
            'this elective subject',
            LookupDeleteGuard::electiveSubjectLinks((int) $id),
            static fn () => $elective->delete()
        );
    }

    /** Sort key for names like "2023-2024" → 2023. */
    private function academicYearSortKey(?string $name): int
    {
        if ($name !== null && preg_match('/(\d{4})/', $name, $m)) {
            return (int) $m[1];
        }

        return 0;
    }
}
