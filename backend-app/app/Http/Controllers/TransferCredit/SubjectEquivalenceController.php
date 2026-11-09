<?php

namespace App\Http\Controllers\TransferCredit;

use App\Http\Controllers\Controller;
use App\Models\SubjectEquivalence;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SubjectEquivalenceController extends Controller
{
    /**
     * Who may read the equivalence list (for Credit Evaluation UI and Subject Equivalences admin).
     * Mutations: credit_eval create/approve (or System Management), same as other-school-subject catalog.
     */
    protected function canViewSubjectEquivalencesList($user): bool
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

    /** Create/update/delete — same audience as other-school-subject maintenance (credit eval staff, not view-only). */
    protected function canMutateSubjectEquivalences($user): bool
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
            if (! $this->canViewSubjectEquivalencesList($user)) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $equivalences = SubjectEquivalence::with(['subject', 'otherSchoolSubject'])->get();

            return response()->json($equivalences);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch subject equivalences', 'message' => $e->getMessage()], 500);
        }
    }

    public function store(Request $request)
    {
        try {
            $user = $request->user();
            if (! $this->canMutateSubjectEquivalences($user)) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $validated = $request->validate([
                'other_school_subject' => 'required|exists:tbl_other_school_subjects,other_subject_id',
                'subject_id' => 'required|exists:tbl_subjects,subject_id',
                'credited_units' => 'nullable|integer',
                'credit_basis' => 'nullable|string|max:50',
                'status' => 'nullable|string|max:50',
                'remarks' => 'nullable|string',
                /** Accepted for old clients only. Equivalence saving no longer mutates student credit lines. */
                'for_student_id' => 'nullable|integer|exists:tbl_student_profile,student_id',
                'from_other_subject_id' => 'nullable|integer|exists:tbl_other_school_subjects,other_subject_id',
            ]);

            $equivPayload = $validated;
            unset($equivPayload['for_student_id'], $equivPayload['from_other_subject_id']);

            $otherId = (int) $validated['other_school_subject'];
            $localId = (int) $validated['subject_id'];

            // One row per (prior-school course, local subject). This catalog row is only a reusable suggestion.
            $equivalence = SubjectEquivalence::updateOrCreate(
                [
                    'other_school_subject' => $otherId,
                    'subject_id' => $localId,
                ],
                $equivPayload
            );
            $equivalence->load(['subject', 'otherSchoolSubject']);

            $httpStatus = $equivalence->wasRecentlyCreated ? 201 : 200;

            return response()->json($equivalence, $httpStatus);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to create subject equivalence', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Backward-compatible route. New clients use CreditEvaluationController::clearTransferCredit.
     */
    public function clearStudentMapping(Request $request)
    {
        try {
            $user = $request->user();
            if (! $this->canMutateSubjectEquivalences($user)) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $validated = $request->validate([
                'for_student_id' => 'required|integer|exists:tbl_student_profile,student_id',
                'subject_id' => 'required|integer|exists:tbl_subjects,subject_id',
                'other_subject_id' => 'required|integer|exists:tbl_other_school_subjects,other_subject_id',
            ]);

            $studentId = (int) $validated['for_student_id'];
            $subjectId = (int) $validated['subject_id'];
            $otherId = (int) $validated['other_subject_id'];

            $cleared = DB::update(
                'UPDATE tbl_credit_evaluation_details d
                INNER JOIN tbl_credit_evaluation e ON d.credit_eval_id = e.credit_eval_id
                SET d.subject_id = NULL
                WHERE e.is_active = 1
                AND LOWER(TRIM(e.status)) = ?
                AND (e.student_id = ? OR d.student_id = ?)
                AND d.subject_id = ?
                AND d.other_subject_id = ?',
                ['approved', $studentId, $studentId, $subjectId, $otherId]
            );

            return response()->json([
                'message' => $cleared > 0
                    ? 'Transfer link removed for this curriculum subject.'
                    : 'No matching transfer line was updated (it may already be cleared or archived).',
                'cleared_rows' => $cleared,
            ]);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to clear mapping', 'message' => $e->getMessage()], 500);
        }
    }

    public function update(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (! $this->canMutateSubjectEquivalences($user)) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $equivalence = SubjectEquivalence::findOrFail($id);

            $validated = $request->validate([
                'other_school_subject' => 'required|exists:tbl_other_school_subjects,other_subject_id',
                'subject_id' => 'required|exists:tbl_subjects,subject_id',
                'credited_units' => 'nullable|integer',
                'credit_basis' => 'nullable|string|max:50',
                'status' => 'nullable|string|max:50',
                'remarks' => 'nullable|string',
            ]);

            $equivalence->update($validated);
            $equivalence->load(['subject', 'otherSchoolSubject']);

            return response()->json($equivalence);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to update subject equivalence', 'message' => $e->getMessage()], 500);
        }
    }

    public function destroy(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (! $this->canMutateSubjectEquivalences($user)) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $equivalence = SubjectEquivalence::findOrFail($id);
            $equivalence->delete();

            return response()->json(['message' => 'Subject equivalence deleted successfully']);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to delete subject equivalence', 'message' => $e->getMessage()], 500);
        }
    }
}
