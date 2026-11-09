<?php

namespace App\Http\Controllers\TransferCredit;

use App\Http\Controllers\Controller;
use App\Models\OtherSchoolSubject;
use App\Support\TransferCreditQuery;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OtherSchoolSubjectController extends Controller
{
    /**
     * Read list: same audience as Subject Equivalences / Credit Evaluation (Dean, Secretary, etc.).
     */
    protected function canViewOtherSchoolSubjectsList($user): bool
    {
        if (! $user) {
            return false;
        }
        if ($user->hasPermission('System Management')) {
            return true;
        }

        return $user->isAdmin()
            || $user->hasAnyPermission([
                'Credit Evaluation',
                'credit_eval.view',
                'credit_eval.create',
                'credit_eval.approve',
            ])
            || $user->isEvaluatorLike();
    }

    /**
     * Create/update/delete catalog rows (not only full System admins — credit eval staff need to maintain TOR codes).
     */
    protected function canMutateOtherSchoolSubjects($user): bool
    {
        if (! $user) {
            return false;
        }
        if ($user->hasPermission('System Management') || $user->isAdmin()) {
            return true;
        }

        return $user->hasAnyPermission([
            'Credit Evaluation',
            'credit_eval.create',
            'credit_eval.approve',
        ]);
    }

    public function index(Request $request)
    {
        try {
            $user = $request->user();
            if (! $this->canViewOtherSchoolSubjectsList($user)) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $studentId = $request->query('student_id');
            if ($studentId !== null && $studentId !== '') {
                $studentId = (int) $studentId;
                if ($studentId < 1) {
                    return response()->json(['message' => 'Invalid student_id'], 422);
                }

                return response()->json($this->priorSchoolSubjectsForStudent($studentId));
            }

            $subjects = OtherSchoolSubject::with('school')->get();

            return response()->json($subjects);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch other school subjects', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Prior-school courses recorded for one student (Student information → transfer intake).
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, OtherSchoolSubject>
     */
    protected function priorSchoolSubjectsForStudent(int $studentId)
    {
        $ossIds = TransferCreditQuery::pickableOtherSubjectIdsForStudent($studentId);
        if ($ossIds === []) {
            return collect();
        }

        return OtherSchoolSubject::with('school')
            ->whereIn('other_subject_id', $ossIds)
            ->orderBy('subject_code')
            ->get();
    }

    public function store(Request $request)
    {
        try {
            $user = $request->user();
            if (! $this->canMutateOtherSchoolSubjects($user)) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $validated = $request->validate([
                'school_id' => 'required|exists:tbl_schools,school_id',
                'subject_code' => [
                    'required',
                    'string',
                    'max:50',
                    Rule::unique('tbl_other_school_subjects', 'subject_code')->where(function ($query) use ($request) {
                        return $query->where('school_id', $request->input('school_id'));
                    }),
                ],
                'subject_name' => 'required|string|max:100',
                'units' => 'nullable|integer',
                'hours' => 'nullable|integer',
                'description' => 'nullable|string',
            ]);

            $subject = OtherSchoolSubject::create($validated);
            $subject->load('school');

            return response()->json($subject, 201);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to create other school subject', 'message' => $e->getMessage()], 500);
        }
    }

    public function update(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (! $this->canMutateOtherSchoolSubjects($user)) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $subject = OtherSchoolSubject::findOrFail($id);

            $validated = $request->validate([
                'school_id' => 'required|exists:tbl_schools,school_id',
                'subject_code' => [
                    'required',
                    'string',
                    'max:50',
                    Rule::unique('tbl_other_school_subjects', 'subject_code')
                        ->where(function ($query) use ($request) {
                            return $query->where('school_id', $request->input('school_id'));
                        })
                        ->ignore((int) $id, 'other_subject_id'),
                ],
                'subject_name' => 'required|string|max:100',
                'units' => 'nullable|integer',
                'hours' => 'nullable|integer',
                'description' => 'nullable|string',
            ]);

            $subject->update($validated);
            $subject->load('school');

            return response()->json($subject);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to update other school subject', 'message' => $e->getMessage()], 500);
        }
    }

    public function destroy(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (! $this->canMutateOtherSchoolSubjects($user)) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $subject = OtherSchoolSubject::findOrFail($id);
            $subject->delete();

            return response()->json(['message' => 'Other school subject deleted successfully']);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to delete other school subject', 'message' => $e->getMessage()], 500);
        }
    }
}
