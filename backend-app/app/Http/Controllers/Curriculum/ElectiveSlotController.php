<?php

namespace App\Http\Controllers\Curriculum;

use App\Http\Controllers\Controller;
use App\Models\ElectiveSlot;
use App\Models\ElectiveSubject;
use App\Support\LookupDeleteGuard;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class ElectiveSlotController extends Controller
{
    /** @return array<string, mixed> */
    private function serializeElectiveSlot(ElectiveSlot $slot): array
    {
        $slot->loadMissing([
            'program',
            'semester',
            'yearLevel',
            'prerequisiteSlot',
            'electiveSubjects.subject',
            'electiveSubjects.track',
        ]);

        return [
            'elective_slot_id' => $slot->elective_slot_id,
            'program_id' => $slot->program_id,
            'semester_id' => $slot->semester_id,
            'year_level_id' => $slot->year_level_id,
            'slot_name' => $slot->slot_name,
            'status' => $slot->status,
            'prerequisite_slot_id' => $slot->prerequisite_slot_id,
            'prerequisiteSlot' => $slot->prerequisiteSlot,
            'program' => $slot->program,
            'semester' => $slot->semester,
            'yearLevel' => $slot->yearLevel,
            'electiveSubjects' => $slot->electiveSubjects->map(function ($es) {
                return [
                    'elective_subject_id' => $es->elective_subject_id,
                    'elective_slot_id' => $es->elective_slot_id,
                    'subject_id' => $es->subject_id,
                    'track_id' => $es->track_id,
                    'description' => $es->description,
                    'subject' => $es->subject,
                    'track' => $es->track,
                ];
            }),
        ];
    }

    /**
     * List endpoint: also allowed for curriculum.view so read-only curriculum UIs can resolve elective rows.
     */
    protected function canListElectiveSlots(Request $request): bool
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
        ]);
    }

    protected function denyUnlessElectiveSlots(Request $request): ?JsonResponse
    {
        $user = $request->user();
        if (! $user || ! $user->hasAnyPermission(['Elective Slots', 'electives.manage', 'Curriculum Management', 'curriculum.edit'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return null;
    }

    public function index(Request $request)
    {
        if (! $this->canListElectiveSlots($request)) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }
        try {
            $slots = ElectiveSlot::query()
                ->orderByDesc('elective_slot_id')
                ->get();

            return response()->json($slots->map(fn (ElectiveSlot $slot) => $this->serializeElectiveSlot($slot)));
        } catch (\Exception $e) {
            Log::error('Error fetching elective slots: '.$e->getMessage());

            return response()->json(['error' => 'Failed to fetch elective slots'], 500);
        }
    }

    public function store(Request $request)
    {
        try {
            $validated = $request->validate([
                'program_id' => 'required|exists:tbl_program,program_id',
                'semester_id' => 'required|exists:tbl_semester,semester_id',
                'year_level_id' => 'required|exists:year_level,year_level_id',
                'slot_name' => 'required|string|max:100',
                'status' => 'nullable|string|max:50',
                'prerequisite_slot_id' => 'nullable|integer|exists:tbl_elective_slot,elective_slot_id',
            ]);

            $slot = ElectiveSlot::create($validated);

            return response()->json($this->serializeElectiveSlot($slot), 201);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to create elective slot', 'message' => $e->getMessage()], 500);
        }
    }

    public function show(Request $request, $id)
    {
        if ($deny = $this->denyUnlessElectiveSlots($request)) {
            return $deny;
        }
        try {
            $slot = ElectiveSlot::query()->findOrFail($id);

            return response()->json($this->serializeElectiveSlot($slot));
        } catch (\Exception $e) {
            return response()->json(['error' => 'Elective slot not found'], 404);
        }
    }

    public function update(Request $request, $id)
    {
        if ($deny = $this->denyUnlessElectiveSlots($request)) {
            return $deny;
        }
        try {
            $slot = ElectiveSlot::findOrFail($id);

            $validated = $request->validate([
                'program_id' => 'required|exists:tbl_program,program_id',
                'semester_id' => 'required|exists:tbl_semester,semester_id',
                'year_level_id' => 'required|exists:year_level,year_level_id',
                'slot_name' => 'required|string|max:100',
                'status' => 'nullable|string|max:50',
                'prerequisite_slot_id' => 'nullable|integer|exists:tbl_elective_slot,elective_slot_id',
            ]);

            $slot->update($validated);

            return response()->json($this->serializeElectiveSlot($slot->fresh()));
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to update elective slot', 'message' => $e->getMessage()], 500);
        }
    }

    public function destroy(Request $request, $id)
    {
        if ($deny = $this->denyUnlessElectiveSlots($request)) {
            return $deny;
        }
        try {
            $slot = ElectiveSlot::findOrFail($id);

            return LookupDeleteGuard::deleteOrConflict(
                'this elective slot',
                LookupDeleteGuard::electiveSlotLinks((int) $id),
                static fn () => $slot->delete()
            );
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to delete elective slot',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function assignSubject(Request $request, $slotId)
    {
        if ($deny = $this->denyUnlessElectiveSlots($request)) {
            return $deny;
        }
        try {
            // Verify slot exists
            $slot = ElectiveSlot::with('program')->findOrFail($slotId);

            // Validate subject_id first
            $validated = $request->validate([
                'subject_id' => 'required|exists:tbl_subjects,subject_id',
                'description' => 'nullable|string',
            ]);

            // Handle track_id separately - validate only if provided and not empty
            $trackId = $request->input('track_id');
            if ($trackId !== null && $trackId !== '' && $trackId !== '0') {
                $request->validate([
                    'track_id' => 'exists:tbl_track,track_id',
                ]);
                $validated['track_id'] = (int) $trackId;
            } else {
                $validated['track_id'] = null;
            }

            // Check if subject is already assigned to this slot
            $existing = ElectiveSubject::where('elective_slot_id', $slotId)
                ->where('subject_id', $validated['subject_id'])
                ->with('subject')
                ->first();

            if ($existing) {
                $subjectName = $existing->subject ? $existing->subject->subject_code.' - '.$existing->subject->subject_name : 'this subject';

                return response()->json([
                    'error' => 'Subject is already assigned to this slot',
                    'message' => "The subject {$subjectName} is already assigned to this elective slot.",
                ], 400);
            }

            // Prepare data for creation
            $createData = [
                'elective_slot_id' => (int) $slotId,
                'department_id' => $slot->program?->department_id,
                'program_id' => $slot->program_id,
                'subject_id' => (int) $validated['subject_id'],
                'description' => $validated['description'] ?? null,
            ];

            // Only add track_id if it's not null
            if ($validated['track_id'] !== null) {
                $createData['track_id'] = (int) $validated['track_id'];
            }

            Log::info('Creating elective subject with data: '.json_encode($createData));

            $electiveSubject = ElectiveSubject::create($createData);

            // Reload the slot with all relationships to return updated data
            $slot->refresh();
            $slot->load(['program', 'semester', 'yearLevel', 'electiveSubjects.subject', 'electiveSubjects.track']);

            // Transform slot to ensure camelCase for frontend
            $transformedSlot = [
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
                        'track_id' => $es->track_id,
                        'description' => $es->description,
                        'subject' => $es->subject,
                        'track' => $es->track,
                    ];
                }),
            ];

            return response()->json([
                'electiveSubject' => $electiveSubject->load(['subject', 'track', 'electiveSlot']),
                'slot' => $transformedSlot,
            ], 201);
        } catch (ModelNotFoundException $e) {
            return response()->json(['error' => 'Elective slot not found'], 404);
        } catch (ValidationException $e) {
            Log::error('Validation failed in assignSubject: '.json_encode($e->errors()));

            return response()->json(['error' => 'Validation failed', 'errors' => $e->errors()], 422);
        } catch (QueryException $e) {
            Log::error('Database error in assignSubject: '.$e->getMessage());
            Log::error('SQL: '.$e->getSql());

            return response()->json([
                'error' => 'Database error',
                'message' => $e->getMessage(),
            ], 500);
        } catch (\Exception $e) {
            Log::error('Failed to assign subject to slot: '.$e->getMessage());
            Log::error('Stack trace: '.$e->getTraceAsString());

            return response()->json([
                'error' => 'Failed to assign subject to slot',
                'message' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ], 500);
        }
    }

    public function removeSubject(Request $request, $slotId, $subjectId)
    {
        if ($deny = $this->denyUnlessElectiveSlots($request)) {
            return $deny;
        }
        try {
            $electiveSubject = ElectiveSubject::where('elective_slot_id', $slotId)
                ->where('subject_id', $subjectId)
                ->firstOrFail();

            $electiveSubject->delete();

            return response()->json(['message' => 'Subject removed from slot successfully']);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to remove subject from slot'], 500);
        }
    }
}
