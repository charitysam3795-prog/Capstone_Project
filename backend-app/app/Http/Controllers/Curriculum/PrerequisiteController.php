<?php

namespace App\Http\Controllers\Curriculum;

use App\Http\Controllers\Controller;
use App\Models\Prerequisite;
use App\Models\Subject;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class PrerequisiteController extends Controller
{
    /**
     * Get all requisites (both prerequisites and corequisites)
     */
    public function index(Request $request)
    {
        try {
            if (! app()->environment('local')) {
                if (! $request->user() || ! $request->user()->isAdmin()) {
                    return response()->json(['message' => 'Unauthorized'], 403);
                }
            }

            $requisites = Prerequisite::with(['subject', 'requiredSubject'])->get();

            return response()->json($requisites);
        } catch (\Exception $e) {
            Log::error('PrerequisiteController@index error: '.$e->getMessage());

            return response()->json(['error' => 'Failed to fetch requisites', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Create a new requisite (prerequisite or corequisite based on type)
     */
    public function store(Request $request)
    {
        try {
            if (! app()->environment('local')) {
                if (! $request->user() || ! $request->user()->isAdmin()) {
                    return response()->json(['message' => 'Unauthorized'], 403);
                }
            }

            // Normalize input names for the required subject ID
            $requiredSubjectId = $request->input('required_subject_id')
                              ?? $request->input('requisites_subject_id')
                              ?? $request->input('requiredSubjectId');

            // Normalize aliases so validator consistently sees required_subject_id.
            $request->merge([
                'required_subject_id' => $requiredSubjectId,
            ]);

            // Validate inputs
            $validated = $request->validate([
                'subject_id' => 'required|exists:tbl_subjects,subject_id',
                'requisite_type' => 'required|in:prerequisite,corequisite',
                'required_subject_id' => 'required|exists:tbl_subjects,subject_id',
            ], [
                'required_subject_id.required' => 'The required subject field is required.',
                'required_subject_id.exists' => 'The selected required subject is invalid.',
            ]);

            // Override the validated 'required_subject_id' with our resolved value
            // This ensures if the user sent 'requisites_subject_id', it maps correctly to 'required_subject_id' logic
            $validated['required_subject_id'] = $requiredSubjectId;

            // Validate that a subject is not a requisite of itself
            if ($validated['subject_id'] == $validated['required_subject_id']) {
                return response()->json(['message' => 'A subject cannot be a requisite of itself'], 422);
            }

            $type = $validated['requisite_type'];

            if ($type === 'prerequisite') {
                // Check if this prerequisite already exists
                $existing = Prerequisite::where('subject_id', $validated['subject_id'])
                    ->where('requisite_type', 'prerequisite')
                    ->where('requisites_subject_id', $validated['required_subject_id'])
                    ->first();

                if ($existing) {
                    Prerequisite::where('subject_id', $validated['subject_id'])
                        ->where('requisite_type', 'prerequisite')
                        ->where('requisites_subject_id', $validated['required_subject_id'])
                        ->where('requisites_id', '!=', $existing->requisites_id)
                        ->delete();

                    $existing->load(['subject', 'requiredSubject']);

                    return response()->json($existing);
                }

                // Create single prerequisite record
                $requisite = Prerequisite::create([
                    'subject_id' => $validated['subject_id'],
                    'requisite_type' => 'prerequisite',
                    'requisites_subject_id' => $validated['required_subject_id'],
                ]);

                $requisite->load(['subject', 'requiredSubject']);

                return response()->json($requisite, 201);

            } else { // corequisite
                // Check if corequisite exists in either direction
                $existing = Prerequisite::where(function ($query) use ($validated) {
                    $query->where(function ($q) use ($validated) {
                        $q->where('subject_id', $validated['subject_id'])
                            ->where('requisites_subject_id', $validated['required_subject_id']);
                    })->orWhere(function ($q) use ($validated) {
                        $q->where('subject_id', $validated['required_subject_id'])
                            ->where('requisites_subject_id', $validated['subject_id']);
                    });
                })->where('requisite_type', 'corequisite')->first();

                if ($existing) {
                    $existing->load(['subject', 'requiredSubject']);

                    return response()->json($existing);
                }

                // Create bidirectional corequisite records
                $requisite1 = Prerequisite::create([
                    'subject_id' => $validated['subject_id'],
                    'requisite_type' => 'corequisite',
                    'requisites_subject_id' => $validated['required_subject_id'],
                ]);

                Prerequisite::create([
                    'subject_id' => $validated['required_subject_id'],
                    'requisite_type' => 'corequisite',
                    'requisites_subject_id' => $validated['subject_id'],
                ]);

                $requisite1->load(['subject', 'requiredSubject']);

                return response()->json($requisite1, 201);
            }

        } catch (\Exception $e) {
            Log::error('PrerequisiteController@store error: '.$e->getMessage());

            return response()->json(['error' => 'Failed to create requisite', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Get a single requisite by primary key.
     */
    public function show(Request $request, $id)
    {
        try {
            if (! app()->environment('local')) {
                if (! $request->user() || ! $request->user()->isAdmin()) {
                    return response()->json(['message' => 'Unauthorized'], 403);
                }
            }

            $requisite = Prerequisite::with(['subject', 'requiredSubject'])->where('requisites_id', $id)->firstOrFail();

            return response()->json($requisite);
        } catch (\Exception $e) {
            Log::error('PrerequisiteController@show error: '.$e->getMessage());

            return response()->json(['error' => 'Failed to fetch requisite', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Replace a requisite by deleting the row (and corequisite pair if needed) and recreating via store rules.
     */
    public function update(Request $request, $id)
    {
        try {
            if (! app()->environment('local')) {
                if (! $request->user() || ! $request->user()->isAdmin()) {
                    return response()->json(['message' => 'Unauthorized'], 403);
                }
            }

            $requisite = Prerequisite::where('requisites_id', $id)->firstOrFail();

            if ($requisite->requisite_type === 'corequisite') {
                Prerequisite::where('subject_id', $requisite->requisites_subject_id)
                    ->where('requisites_subject_id', $requisite->subject_id)
                    ->where('requisite_type', 'corequisite')
                    ->delete();
            }
            $requisite->delete();

            $requiredSubjectId = $request->input('required_subject_id')
                ?? $request->input('requisites_subject_id')
                ?? $request->input('requiredSubjectId')
                ?? $requisite->requisites_subject_id;

            $request->merge([
                'subject_id' => $request->input('subject_id', $requisite->subject_id),
                'requisite_type' => $request->input('requisite_type', $requisite->requisite_type),
                'required_subject_id' => $requiredSubjectId,
            ]);

            return $this->store($request);
        } catch (\Exception $e) {
            Log::error('PrerequisiteController@update error: '.$e->getMessage());

            return response()->json(['error' => 'Failed to update requisite', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Get requisites for a specific subject
     * Returns all requisites (both prerequisites and corequisites) where subject_id matches
     */
    public function getBySubject(Request $request, $subjectId)
    {
        try {
            // Allow authenticated users to read requisites for subject forms/evaluation views.
            if (! $request->user()) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            // Validate that the subject exists
            $subject = Subject::find($subjectId);
            if (! $subject) {
                return response()->json(['message' => 'Subject not found'], 404);
            }

            // Get all requisites where this subject is the main subject
            $requisites = Prerequisite::where('subject_id', $subjectId)
                ->with(['requiredSubject', 'subject'])
                ->get();

            return response()->json($requisites);
        } catch (\Exception $e) {
            Log::error('PrerequisiteController@getBySubject error: '.$e->getMessage());

            if (app()->environment('local')) {
                return response()->json([], 200);
            }

            return response()->json(['error' => 'Failed to fetch requisites', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Delete a requisite
     * For corequisites, this will also delete the reverse relationship
     */
    public function destroy(Request $request, $id)
    {
        try {
            if (! app()->environment('local')) {
                if (! $request->user() || ! $request->user()->isAdmin()) {
                    return response()->json(['message' => 'Unauthorized'], 403);
                }
            }

            $requisite = Prerequisite::where('requisites_id', $id)->firstOrFail();

            // If it's a corequisite, delete the reverse relationship too
            if ($requisite->requisite_type === 'corequisite') {
                Prerequisite::where('subject_id', $requisite->requisites_subject_id)
                    ->where('requisites_subject_id', $requisite->subject_id)
                    ->where('requisite_type', 'corequisite')
                    ->delete();
            }

            $requisite->delete();

            return response()->json(['message' => 'Requisite deleted successfully']);
        } catch (\Exception $e) {
            Log::error('PrerequisiteController@destroy error: '.$e->getMessage());

            return response()->json(['error' => 'Failed to delete requisite', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Get prerequisites only
     */
    public function getPrerequisites(Request $request)
    {
        try {
            if (! app()->environment('local')) {
                if (! $request->user() || ! $request->user()->isAdmin()) {
                    return response()->json(['message' => 'Unauthorized'], 403);
                }
            }

            $prerequisites = Prerequisite::with(['subject', 'requiredSubject'])
                ->where('requisite_type', 'prerequisite')
                ->get();

            return response()->json($prerequisites);
        } catch (\Exception $e) {
            Log::error('PrerequisiteController@getPrerequisites error: '.$e->getMessage());

            return response()->json(['error' => 'Failed to fetch prerequisites', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Get corequisites only
     */
    public function getCorequisites(Request $request)
    {
        try {
            if (! app()->environment('local')) {
                if (! $request->user() || ! $request->user()->isAdmin()) {
                    return response()->json(['message' => 'Unauthorized'], 403);
                }
            }

            $corequisites = Prerequisite::with(['subject', 'requiredSubject'])
                ->where('requisite_type', 'corequisite')
                ->get();

            return response()->json($corequisites);
        } catch (\Exception $e) {
            Log::error('PrerequisiteController@getCorequisites error: '.$e->getMessage());

            return response()->json(['error' => 'Failed to fetch corequisites', 'message' => $e->getMessage()], 500);
        }
    }
}
