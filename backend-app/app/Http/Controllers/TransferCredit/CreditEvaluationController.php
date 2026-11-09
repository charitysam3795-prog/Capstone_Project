<?php

namespace App\Http\Controllers\TransferCredit;

use App\Http\Controllers\Controller;
use App\Models\CreditEvaluation;
use App\Support\TransferCreditQuery;
use App\Models\CreditEvaluationDetail;
use App\Models\OtherSchoolSubject;
use App\Models\School;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CreditEvaluationController extends Controller
{
    protected function canAccessCreditEvaluations($user): bool
    {
        if (! $user) {
            return false;
        }
        if ($user->isAdmin()) {
            return true;
        }

        return $user->hasAnyPermission([
            'Credit Evaluation',
            'credit_eval.view',
            'credit_eval.create',
            'credit_eval.approve',
        ]);
    }

    protected function canCreateCreditEvaluations($user): bool
    {
        if (! $user) {
            return false;
        }
        if ($user->isAdmin()) {
            return true;
        }

        return $user->hasAnyPermission(['credit_eval.create', 'credit_eval.approve']);
    }

    public function index(Request $request)
    {
        try {
            if (! $this->canAccessCreditEvaluations($request->user())) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $evaluations = CreditEvaluation::with(['student', 'school', 'evaluator', 'creditDetails.subject', 'creditDetails.otherSchoolSubject'])
                ->orderBy('evaluation_date', 'desc')
                ->get();

            return response()->json($evaluations);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch credit evaluations', 'message' => $e->getMessage()], 500);
        }
    }

    public function store(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user || ! $this->canCreateCreditEvaluations($user)) {
                return response()->json([
                    'message' => 'Unauthorized — administrators or users with credit evaluation create permission may add credit requests.',
                ], 403);
            }

            $intake = $request->boolean('student_information_intake');
            $validated = $request->validate([
                'student_id' => 'nullable|integer|exists:tbl_student_profile,student_id',
                'school_id' => 'nullable|exists:tbl_schools,school_id',
                'prior_school_name' => 'nullable|string|max:200',
                'credit_type' => 'nullable|string|max:50',
                'evaluated_by' => 'nullable|exists:tbl_users,user_id',
                'evaluation_date' => 'nullable|date',
                'remarks' => 'nullable|string',
                'transfer_first_name' => ($intake ? 'nullable' : 'required').'|string|max:120',
                'transfer_middle_name' => 'nullable|string|max:120',
                'transfer_last_name' => ($intake ? 'nullable' : 'required').'|string|max:120',
                'credit_details' => 'required|array|min:1',
                'credit_details.*.other_subject_id' => 'nullable|integer|exists:tbl_other_school_subjects,other_subject_id',
                'credit_details.*.external_subject_code' => 'nullable|string|max:50',
                'credit_details.*.external_subject_name' => 'nullable|string|max:120',
                'credit_details.*.subject_id' => 'nullable|integer|exists:tbl_subjects,subject_id',
                'credit_details.*.credited_units' => 'nullable|integer',
                'credit_details.*.credit_basis' => 'nullable|string|max:50',
                'credit_details.*.remarks' => 'nullable|string',
                'student_information_intake' => 'nullable|boolean',
            ]);

            $schoolId = $validated['school_id'] ?? null;
            $priorName = isset($validated['prior_school_name']) ? trim((string) $validated['prior_school_name']) : '';
            if (($schoolId === null || $schoolId === '') && $priorName === '') {
                return response()->json([
                    'message' => 'Enter the prior school name (as on the transcript), or pick a school from the catalog.',
                ], 422);
            }

            $resolved = $this->resolveStoreCreditDetailRows($validated['credit_details'], $schoolId, $priorName);
            if (isset($resolved['error'])) {
                return response()->json(['message' => $resolved['error']], 422);
            }
            $resolvedRows = $resolved['rows'];
            $ossParentSchoolId = $resolved['oss_parent_school_id'] ?? null;

            $studentId = $validated['student_id'] ?? null;
            $studentId = ($studentId !== null && $studentId !== '') ? (int) $studentId : null;
            $evaluatedBy = $validated['evaluated_by'] ?? $user->user_id;
            $evalDate = $validated['evaluation_date'] ?? now()->toDateString();
            $creditType = trim((string) ($validated['credit_type'] ?? '')) !== ''
                ? $validated['credit_type']
                : 'Transfer';

            /**
             * Dean "Student information" intake: prior-school courses + optional OSS catalog rows only.
             * No separate approval step — record is stored as approved so curriculum evaluation can show
             * transfer credit once subject equivalence maps the external course to a local subject.
             */
            $studentInformationIntake = $intake;

            DB::beginTransaction();

            $evaluationSchoolId = ($schoolId !== null && $schoolId !== '') ? (int) $schoolId : null;
            if ($evaluationSchoolId === null && $ossParentSchoolId !== null && $ossParentSchoolId !== '') {
                $evaluationSchoolId = (int) $ossParentSchoolId;
            }

            $evaluation = CreditEvaluation::create([
                'student_id' => $studentId,
                'school_id' => $evaluationSchoolId,
                'prior_school_name' => $priorName !== '' ? $priorName : null,
                'credit_type' => $creditType,
                'evaluated_by' => $evaluatedBy,
                'evaluation_date' => $evalDate,
                'status' => $studentInformationIntake ? 'approved' : 'pending',
                'remarks' => $validated['remarks'] ?? null,
                'transfer_first_name' => $validated['transfer_first_name'] ?? null,
                'transfer_middle_name' => $validated['transfer_middle_name'] ?? null,
                'transfer_last_name' => $validated['transfer_last_name'] ?? null,
                'is_active' => true,
            ]);

            foreach ($resolvedRows as $detail) {
                CreditEvaluationDetail::create([
                    'credit_eval_id' => $evaluation->credit_eval_id,
                    'student_id' => $studentId,
                    'other_subject_id' => $detail['other_subject_id'],
                    'subject_id' => $detail['subject_id'],
                    'credited_units' => $detail['credited_units'] ?? null,
                    'credit_basis' => $detail['credit_basis'] ?? null,
                    'remarks' => $detail['remarks'] ?? null,
                ]);
            }

            DB::commit();

            $evaluation->load(['student', 'school', 'evaluator', 'creditDetails.subject', 'creditDetails.otherSchoolSubject']);

            return response()->json($evaluation, 201);
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json(['error' => 'Failed to create credit evaluation', 'message' => $e->getMessage()], 500);
        }
    }

    public function show(Request $request, $id)
    {
        try {
            if (! $this->canAccessCreditEvaluations($request->user())) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $evaluation = CreditEvaluation::with(['student', 'school', 'evaluator', 'creditDetails.subject', 'creditDetails.otherSchoolSubject'])
                ->findOrFail($id);

            return response()->json($evaluation);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch credit evaluation', 'message' => $e->getMessage()], 500);
        }
    }

    public function update(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (! $this->canAccessCreditEvaluations($user)) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $evaluation = CreditEvaluation::findOrFail($id);

            if ($request->boolean('student_information_intake')) {
                if (! $this->canCreateCreditEvaluations($user)) {
                    return response()->json([
                        'message' => 'Unauthorized — you may not update this transfer intake.',
                    ], 403);
                }

                $evaluation = $this->replaceStudentInformationIntakeEvaluation($request, $evaluation, $user);
                $evaluation->load(['student', 'school', 'evaluator', 'creditDetails.subject', 'creditDetails.otherSchoolSubject']);

                return response()->json($evaluation);
            }

            if ($user->isAdmin()) {
                if ($request->has('student_id')) {
                    $validated = $request->validate([
                        'student_id' => 'nullable|exists:tbl_student_profile,student_id',
                        'school_id' => 'nullable|exists:tbl_schools,school_id',
                        'prior_school_name' => 'nullable|string|max:200',
                        'credit_type' => 'nullable|string|max:50',
                        'evaluated_by' => 'nullable|exists:tbl_users,user_id',
                        'evaluation_date' => 'nullable|date',
                        'remarks' => 'nullable|string',
                        'transfer_first_name' => 'nullable|string|max:120',
                        'transfer_middle_name' => 'nullable|string|max:120',
                        'transfer_last_name' => 'nullable|string|max:120',
                    ]);
                    $schoolId = $validated['school_id'] ?? null;
                    $priorName = isset($validated['prior_school_name']) ? trim((string) $validated['prior_school_name']) : '';
                    if (($schoolId === null || $schoolId === '') && $priorName === '') {
                        return response()->json([
                            'message' => 'Enter the prior school name or select a catalog school.',
                        ], 422);
                    }
                    $validated['prior_school_name'] = $priorName !== '' ? $priorName : null;
                    $evaluation->update($validated);
                } else {
                    $validated = $request->validate([
                        'status' => 'required|string|max:50',
                        'remarks' => 'nullable|string',
                    ]);
                    $evaluation->update($validated);
                }
            } else {
                if (! $user->canApproveTransferCredits()) {
                    return response()->json([
                        'message' => 'Only administrators or users with credit evaluation approval permission may approve or reject.',
                    ], 403);
                }

                $validated = $request->validate([
                    'status' => 'required|string|max:50',
                    'remarks' => 'nullable|string',
                ]);
                $evaluation->update($validated);
            }

            $evaluation->load(['student', 'school', 'evaluator', 'creditDetails.subject', 'creditDetails.otherSchoolSubject']);

            return response()->json($evaluation);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to update credit evaluation', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Apply one prior-school course to one local curriculum subject for a specific student.
     * This is the student-specific credit decision; subject equivalence remains only a reusable suggestion.
     */
    public function applyTransferCredit(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user || ! $this->canCreateCreditEvaluations($user)) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $validated = $request->validate([
                'student_id' => 'required|integer|exists:tbl_student_profile,student_id',
                'other_subject_id' => 'required|integer|exists:tbl_other_school_subjects,other_subject_id',
                'subject_id' => 'required|integer|exists:tbl_subjects,subject_id',
                'previous_other_subject_id' => 'nullable|integer|exists:tbl_other_school_subjects,other_subject_id',
                'credited_units' => 'nullable|integer|min:0',
                'credit_basis' => 'nullable|string|max:50',
                'remarks' => 'nullable|string',
            ]);

            $studentId = (int) $validated['student_id'];
            $otherId = (int) $validated['other_subject_id'];
            $subjectId = (int) $validated['subject_id'];

            if (! TransferCreditQuery::pickableDetailExists($studentId, $otherId)) {
                return response()->json([
                    'message' => 'That prior-school course is not on this student\'s transfer record. Add it under Student information first.',
                ], 422);
            }
            $previousOtherId = isset($validated['previous_other_subject_id'])
                ? (int) $validated['previous_other_subject_id']
                : 0;
            $creditedUnits = array_key_exists('credited_units', $validated)
                ? $validated['credited_units']
                : null;
            $creditBasis = isset($validated['credit_basis']) ? trim((string) $validated['credit_basis']) : null;
            $remarks = isset($validated['remarks']) ? trim((string) $validated['remarks']) : null;

            $conflictingExternalMapping = DB::table('tbl_credit_evaluation_details as d')
                ->join('tbl_credit_evaluation as e', 'd.credit_eval_id', '=', 'e.credit_eval_id')
                ->where('e.is_active', true)
                ->whereRaw('LOWER(TRIM(e.status)) = ?', ['approved'])
                ->where(function ($q) use ($studentId) {
                    $q->where('e.student_id', $studentId)
                        ->orWhere('d.student_id', $studentId);
                })
                ->where('d.other_subject_id', $otherId)
                ->whereNotNull('d.subject_id')
                ->where('d.subject_id', '!=', $subjectId)
                ->exists();
            if ($conflictingExternalMapping) {
                return response()->json([
                    'message' => 'This transfer course is already approved for a different local subject for this student. Clear that mapping first.',
                ], 422);
            }

            $conflictingLocalMapping = DB::table('tbl_credit_evaluation_details as d')
                ->join('tbl_credit_evaluation as e', 'd.credit_eval_id', '=', 'e.credit_eval_id')
                ->where('e.is_active', true)
                ->whereRaw('LOWER(TRIM(e.status)) = ?', ['approved'])
                ->where(function ($q) use ($studentId) {
                    $q->where('e.student_id', $studentId)
                        ->orWhere('d.student_id', $studentId);
                })
                ->where('d.subject_id', $subjectId)
                ->where('d.other_subject_id', '!=', $otherId);
            if ($previousOtherId > 0) {
                $conflictingLocalMapping->where('d.other_subject_id', '!=', $previousOtherId);
            }
            $conflictingLocalMapping = $conflictingLocalMapping->exists();
            if ($conflictingLocalMapping) {
                return response()->json([
                    'message' => 'This local subject is already credited by another transfer course for this student. Clear that mapping first.',
                ], 422);
            }

            DB::beginTransaction();

            if ($previousOtherId > 0 && $previousOtherId !== $otherId) {
                DB::table('tbl_credit_evaluation_details as d')
                    ->join('tbl_credit_evaluation as e', 'd.credit_eval_id', '=', 'e.credit_eval_id')
                    ->where('e.is_active', true)
                    ->whereRaw('LOWER(TRIM(e.status)) = ?', ['approved'])
                    ->where(function ($q) use ($studentId) {
                        $q->where('e.student_id', $studentId)
                            ->orWhere('d.student_id', $studentId);
                    })
                    ->where('d.subject_id', $subjectId)
                    ->where('d.other_subject_id', $previousOtherId)
                    ->update([
                        'd.subject_id' => null,
                        'd.credit_basis' => null,
                    ]);
            }

            $detail = $this->findStudentTransferDetail($studentId, $otherId, $subjectId);
            if ($detail === null) {
                $detail = $this->findStudentUnmappedTransferDetail($studentId, $otherId);
            }

            if ($detail === null) {
                $evaluation = $this->findOrCreateStudentTransferEvaluation($studentId, $otherId, (int) $user->user_id);
                $detail = new CreditEvaluationDetail([
                    'credit_eval_id' => $evaluation->credit_eval_id,
                    'student_id' => $studentId,
                    'other_subject_id' => $otherId,
                ]);
            }

            $oss = OtherSchoolSubject::query()->find($otherId);
            $resolvedUnits = $creditedUnits;
            if (($resolvedUnits === null || $resolvedUnits === '') && $oss && $oss->units !== null && $oss->units !== '') {
                $resolvedUnits = (int) $oss->units;
            }

            $detail->student_id = $studentId;
            $detail->other_subject_id = $otherId;
            $detail->subject_id = $subjectId;
            $detail->credited_units = ($resolvedUnits !== null && $resolvedUnits !== '') ? (int) $resolvedUnits : null;
            $detail->credit_basis = ($creditBasis !== null && $creditBasis !== '') ? $creditBasis : 'Approved transfer mapping';
            $detail->remarks = ($remarks !== null && $remarks !== '') ? $remarks : $detail->remarks;
            $detail->save();

            $evaluation = $detail->creditEvaluation;
            if ($evaluation) {
                if ($evaluation->student_id === null || $evaluation->student_id === '') {
                    $evaluation->student_id = $studentId;
                    $evaluation->save();
                }
            }

            DB::commit();

            $detail->load(['subject', 'otherSchoolSubject', 'creditEvaluation']);

            return response()->json([
                'message' => 'Transfer credit approved for this curriculum subject.',
                'credit_detail' => $detail,
            ]);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json(['error' => 'Failed to apply transfer credit', 'message' => $e->getMessage()], 500);
        }
    }

    public function clearTransferCredit(Request $request)
    {
        try {
            $user = $request->user();
            if (! $user || ! $this->canCreateCreditEvaluations($user)) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $validated = $request->validate([
                'student_id' => 'required|integer|exists:tbl_student_profile,student_id',
                'subject_id' => 'required|integer|exists:tbl_subjects,subject_id',
                'other_subject_id' => 'nullable|integer|exists:tbl_other_school_subjects,other_subject_id',
            ]);

            $query = DB::table('tbl_credit_evaluation_details as d')
                ->join('tbl_credit_evaluation as e', 'd.credit_eval_id', '=', 'e.credit_eval_id')
                ->where('e.is_active', true)
                ->whereRaw('LOWER(TRIM(e.status)) = ?', ['approved'])
                ->where(function ($q) use ($validated) {
                    $studentId = (int) $validated['student_id'];
                    $q->where('e.student_id', $studentId)
                        ->orWhere('d.student_id', $studentId);
                })
                ->where('d.subject_id', (int) $validated['subject_id']);

            if (! empty($validated['other_subject_id'])) {
                $query->where('d.other_subject_id', (int) $validated['other_subject_id']);
            }

            $cleared = $query->update([
                'd.subject_id' => null,
                'd.credit_basis' => null,
            ]);

            return response()->json([
                'message' => $cleared > 0
                    ? 'Transfer credit cleared for this curriculum subject.'
                    : 'No approved transfer credit was found for this curriculum subject.',
                'cleared_rows' => $cleared,
            ]);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to clear transfer credit', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Admin: activate/deactivate a credit evaluation (soft toggle; row is kept).
     */
    public function setActive(Request $request, $id)
    {
        try {
            if (! $request->user() || ! $request->user()->isAdmin()) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $validated = $request->validate([
                'is_active' => 'required|boolean',
            ]);

            $evaluation = CreditEvaluation::findOrFail($id);
            $evaluation->update(['is_active' => $validated['is_active']]);
            $evaluation->load(['student', 'school', 'evaluator', 'creditDetails.subject', 'creditDetails.otherSchoolSubject']);

            return response()->json($evaluation);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to update credit evaluation', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Full replace for Dean student-information transfer records (header + credit lines), always approved.
     *
     * @throws HttpException
     */
    protected function replaceStudentInformationIntakeEvaluation(Request $request, CreditEvaluation $evaluation, $user): CreditEvaluation
    {
        $validated = $request->validate([
            'student_id' => 'nullable|integer|exists:tbl_student_profile,student_id',
            'school_id' => 'nullable|exists:tbl_schools,school_id',
            'prior_school_name' => 'nullable|string|max:200',
            'credit_type' => 'nullable|string|max:50',
            'evaluated_by' => 'nullable|exists:tbl_users,user_id',
            'evaluation_date' => 'nullable|date',
            'remarks' => 'nullable|string',
            'transfer_first_name' => 'nullable|string|max:120',
            'transfer_middle_name' => 'nullable|string|max:120',
            'transfer_last_name' => 'nullable|string|max:120',
            'credit_details' => 'required|array|min:1',
            'credit_details.*.other_subject_id' => 'nullable|integer|exists:tbl_other_school_subjects,other_subject_id',
            'credit_details.*.external_subject_code' => 'nullable|string|max:50',
            'credit_details.*.external_subject_name' => 'nullable|string|max:120',
            'credit_details.*.subject_id' => 'nullable|integer|exists:tbl_subjects,subject_id',
            'credit_details.*.credited_units' => 'nullable|integer',
            'credit_details.*.credit_basis' => 'nullable|string|max:50',
            'credit_details.*.remarks' => 'nullable|string',
        ]);

        $schoolId = $validated['school_id'] ?? null;
        $priorName = isset($validated['prior_school_name']) ? trim((string) $validated['prior_school_name']) : '';
        if (($schoolId === null || $schoolId === '') && $priorName === '') {
            abort(422, 'Enter the prior school name (as on the transcript), or pick a school from the catalog.');
        }

        $resolved = $this->resolveStoreCreditDetailRows($validated['credit_details'], $schoolId, $priorName);
        if (isset($resolved['error'])) {
            abort(422, $resolved['error']);
        }
        $resolvedRows = $resolved['rows'];
        $ossParentSchoolId = $resolved['oss_parent_school_id'] ?? null;

        $studentId = $validated['student_id'] ?? null;
        $studentId = ($studentId !== null && $studentId !== '') ? (int) $studentId : null;
        $evaluatedBy = $validated['evaluated_by'] ?? $user->user_id;
        $evalDate = $validated['evaluation_date'] ?? now()->toDateString();
        $creditType = trim((string) ($validated['credit_type'] ?? '')) !== ''
            ? $validated['credit_type']
            : 'Transfer';

        $evaluationSchoolId = ($schoolId !== null && $schoolId !== '') ? (int) $schoolId : null;
        if ($evaluationSchoolId === null && $ossParentSchoolId !== null && $ossParentSchoolId !== '') {
            $evaluationSchoolId = (int) $ossParentSchoolId;
        }

        DB::beginTransaction();

        try {
            $evaluation->update([
                'student_id' => $studentId,
                'school_id' => $evaluationSchoolId,
                'prior_school_name' => $priorName !== '' ? $priorName : null,
                'credit_type' => $creditType,
                'evaluated_by' => $evaluatedBy,
                'evaluation_date' => $evalDate,
                'status' => 'approved',
                'remarks' => $validated['remarks'] ?? null,
                'transfer_first_name' => $validated['transfer_first_name'] ?? null,
                'transfer_middle_name' => $validated['transfer_middle_name'] ?? null,
                'transfer_last_name' => $validated['transfer_last_name'] ?? null,
                'is_active' => true,
            ]);

            CreditEvaluationDetail::where('credit_eval_id', $evaluation->credit_eval_id)->delete();

            foreach ($resolvedRows as $detail) {
                CreditEvaluationDetail::create([
                    'credit_eval_id' => $evaluation->credit_eval_id,
                    'student_id' => $studentId,
                    'other_subject_id' => $detail['other_subject_id'],
                    'subject_id' => $detail['subject_id'],
                    'credited_units' => $detail['credited_units'] ?? null,
                    'credit_basis' => $detail['credit_basis'] ?? null,
                    'remarks' => $detail['remarks'] ?? null,
                ]);
            }

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            throw $e;
        }

        return $evaluation->fresh();
    }

    /**
     * Normalize incoming credit lines: either an existing other_subject_id or a new external code+title
     * (creates or reuses OtherSchoolSubject under the catalog school or a prior-school placeholder).
     *
     * @return array{rows: array<int, array<string, mixed>>, oss_parent_school_id: int|null}|array{error: string}
     */
    protected function resolveStoreCreditDetailRows(array $creditDetails, $requestSchoolId, string $priorName): array
    {
        $hasNewExternal = false;
        foreach ($creditDetails as $detail) {
            $oid = $detail['other_subject_id'] ?? null;
            if ($oid !== null && $oid !== '') {
                continue;
            }
            if (trim((string) ($detail['external_subject_code'] ?? '')) !== '') {
                $hasNewExternal = true;
                break;
            }
        }

        $resolvedOssParentSchoolId = ($requestSchoolId !== null && $requestSchoolId !== '') ? (int) $requestSchoolId : null;
        if ($resolvedOssParentSchoolId === null && $hasNewExternal) {
            $resolvedOssParentSchoolId = School::ensurePlaceholderSchoolIdForPriorName($priorName);
            if ($resolvedOssParentSchoolId === null) {
                return ['error' => 'Enter the prior school name (or select a catalog school) before adding new external courses.'];
            }
        }

        $rows = [];
        foreach ($creditDetails as $detail) {
            $oid = $detail['other_subject_id'] ?? null;
            if ($oid !== null && $oid !== '') {
                $sid = $detail['subject_id'] ?? null;
                $sid = ($sid !== null && $sid !== '') ? (int) $sid : null;
                $rows[] = [
                    'other_subject_id' => (int) $oid,
                    'subject_id' => $sid,
                    'credited_units' => $detail['credited_units'] ?? null,
                    'credit_basis' => $detail['credit_basis'] ?? null,
                    'remarks' => $detail['remarks'] ?? null,
                ];

                continue;
            }

            $code = trim((string) ($detail['external_subject_code'] ?? ''));
            $extName = trim((string) ($detail['external_subject_name'] ?? ''));
            if ($code === '') {
                return ['error' => 'Each credit line needs a catalog external subject or a new course code and title.'];
            }
            if ($extName === '') {
                $extName = $code;
            }
            if ($resolvedOssParentSchoolId === null) {
                return ['error' => 'Enter the prior school name (or select a catalog school) before adding new external courses.'];
            }

            $oss = OtherSchoolSubject::findOrCreateForSchool((int) $resolvedOssParentSchoolId, $code, $extName);
            $sid = $detail['subject_id'] ?? null;
            $sid = ($sid !== null && $sid !== '') ? (int) $sid : null;
            $rows[] = [
                'other_subject_id' => $oss->other_subject_id,
                'subject_id' => $sid,
                'credited_units' => $detail['credited_units'] ?? null,
                'credit_basis' => $detail['credit_basis'] ?? null,
                'remarks' => $detail['remarks'] ?? null,
            ];
        }

        $seenOtherIds = [];
        foreach ($rows as $r) {
            $oid = (int) ($r['other_subject_id'] ?? 0);
            if ($oid < 1) {
                continue;
            }
            if (isset($seenOtherIds[$oid])) {
                return ['error' => 'Each external (prior-school) course can only appear once per transfer record. Remove the duplicate row or merge units on a single line.'];
            }
            $seenOtherIds[$oid] = true;
        }

        return [
            'rows' => $rows,
            'oss_parent_school_id' => $resolvedOssParentSchoolId,
        ];
    }

    protected function findStudentTransferDetail(int $studentId, int $otherId, int $subjectId): ?CreditEvaluationDetail
    {
        return CreditEvaluationDetail::query()
            ->where(function ($q) use ($studentId) {
                $q->where('student_id', $studentId)
                    ->orWhereHas('creditEvaluation', fn ($e) => $e->where('student_id', $studentId));
            })
            ->where('other_subject_id', $otherId)
            ->where('subject_id', $subjectId)
            ->whereHas('creditEvaluation', function ($q) {
                $q->where('is_active', true)
                    ->whereRaw('LOWER(TRIM(status)) = ?', ['approved']);
            })
            ->orderByDesc('credit_detail_id')
            ->first();
    }

    protected function findStudentUnmappedTransferDetail(int $studentId, int $otherId): ?CreditEvaluationDetail
    {
        $linked = CreditEvaluationDetail::query()
            ->where(function ($q) use ($studentId) {
                $q->where('student_id', $studentId)
                    ->orWhereHas('creditEvaluation', fn ($e) => $e->where('student_id', $studentId));
            })
            ->where('other_subject_id', $otherId)
            ->whereNull('subject_id')
            ->whereHas('creditEvaluation', function ($q) {
                $q->where('is_active', true)
                    ->whereRaw('LOWER(TRIM(status)) = ?', ['approved']);
            })
            ->orderByDesc('credit_detail_id')
            ->first();

        if ($linked) {
            return $linked;
        }

        return CreditEvaluationDetail::query()
            ->where('other_subject_id', $otherId)
            ->whereNull('subject_id')
            ->whereNull('student_id')
            ->whereHas('creditEvaluation', function ($q) {
                $q->whereNull('student_id')
                    ->where('is_active', true)
                    ->whereRaw('LOWER(TRIM(status)) = ?', ['approved']);
            })
            ->orderByDesc('credit_detail_id')
            ->first();
    }

    protected function findOrCreateStudentTransferEvaluation(int $studentId, int $otherId, int $evaluatedByUserId): CreditEvaluation
    {
        $oss = OtherSchoolSubject::query()->with('school')->find($otherId);
        $schoolId = $oss && $oss->school_id !== null && $oss->school_id !== '' ? (int) $oss->school_id : null;
        $priorName = $oss?->school?->school_name;
        $priorName = trim((string) ($priorName ?: 'Curriculum transfer mapping'));

        $query = CreditEvaluation::query()
            ->where('student_id', $studentId)
            ->where('is_active', true)
            ->whereRaw('LOWER(TRIM(status)) = ?', ['approved'])
            ->whereRaw('LOWER(TRIM(credit_type)) = ?', ['transfer']);

        if ($schoolId !== null) {
            $query->where('school_id', $schoolId);
        }

        $evaluation = $query->orderByDesc('credit_eval_id')->first();
        if ($evaluation) {
            return $evaluation;
        }

        return CreditEvaluation::create([
            'student_id' => $studentId,
            'school_id' => $schoolId,
            'prior_school_name' => $priorName,
            'credit_type' => 'Transfer',
            'evaluated_by' => $evaluatedByUserId,
            'evaluation_date' => now()->toDateString(),
            'status' => 'approved',
            'remarks' => 'Student-specific transfer credit mapping.',
            'is_active' => true,
            'transfer_first_name' => null,
            'transfer_middle_name' => null,
            'transfer_last_name' => null,
        ]);
    }
}
