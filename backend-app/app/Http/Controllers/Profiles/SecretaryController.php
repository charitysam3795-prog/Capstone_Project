<?php

namespace App\Http\Controllers\Profiles;

use App\Http\Controllers\Controller;
use App\Models\SecretaryProfile;
use Illuminate\Http\Request;

class SecretaryController extends Controller
{
    public function getProfile(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $targetUserId = $request->query('user_id');
            if ($targetUserId && $user->isAdmin()) {
                $userId = $targetUserId;
            } else {
                $userId = $user->user_id;
            }

            $profile = SecretaryProfile::where('user_id', $userId)
                ->with(['program.department', 'department'])
                ->first();

            if (! $profile) {
                return response()->json(['message' => 'Secretary profile not found'], 404);
            }

            return response()->json($profile);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to fetch secretary profile',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function updateProfile(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $validated = $request->validate([
                'first_name' => 'nullable|string|max:50',
                'middle_name' => 'nullable|string|max:50',
                'last_name' => 'nullable|string|max:50',
                'specialization' => 'nullable|string|max:255',
            ]);

            $profile = SecretaryProfile::firstOrCreate(
                ['user_id' => $user->user_id],
                [
                    'department_id' => $user->department_id,
                    'program_id' => $user->program_id,
                ]
            );
            // Employee ID is admin-managed only.
            $profile->update($validated);
            $profile->load(['program.department', 'department']);

            return response()->json($profile);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to update secretary profile',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function createProfile(Request $request)
    {
        return $this->updateProfile($request);
    }
}
