<?php

namespace App\Http\Controllers\TransferCredit;

use App\Http\Controllers\Controller;
use App\Models\School;
use Illuminate\Http\Request;

class SchoolController extends Controller
{
    public function index(Request $request)
    {
        try {
            $schools = School::all();

            return response()->json($schools);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch schools', 'message' => $e->getMessage()], 500);
        }
    }

    public function store(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user || ! $user->hasPermission('System Management')) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $validated = $request->validate([
                'school_name' => 'required|string|max:255',
                'school_program' => 'nullable|string',
                'school_curriculum' => 'nullable|string',
            ]);

            $school = School::create($validated);

            return response()->json($school, 201);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to create school', 'message' => $e->getMessage()], 500);
        }
    }

    public function update(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (! $user || ! $user->hasPermission('System Management')) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $school = School::findOrFail($id);

            $validated = $request->validate([
                'school_name' => 'required|string|max:255',
                'school_program' => 'nullable|string',
                'school_curriculum' => 'nullable|string',
            ]);

            $school->update($validated);

            return response()->json($school);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to update school', 'message' => $e->getMessage()], 500);
        }
    }

    public function destroy(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (! $user || ! $user->hasPermission('System Management')) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $school = School::findOrFail($id);
            $school->delete();

            return response()->json(['message' => 'School deleted successfully']);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to delete school', 'message' => $e->getMessage()], 500);
        }
    }
}
