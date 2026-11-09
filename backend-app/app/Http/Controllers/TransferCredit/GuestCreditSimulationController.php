<?php

namespace App\Http\Controllers\TransferCredit;

use App\Http\Controllers\Controller;
use App\Models\OtherSchoolSubject;
use Illuminate\Http\Request;

/**
 * Read-only simulation: map external course codes to local subjects via tbl_subject_equivalence.
 */
class GuestCreditSimulationController extends Controller
{
    public function simulate(Request $request)
    {
        $validated = $request->validate([
            'school_id' => 'nullable|integer|exists:tbl_schools,school_id',
            'courses' => 'required|array|min:1|max:50',
            'courses.*.subject_code' => 'required|string|max:50',
        ]);

        $results = [];

        foreach ($validated['courses'] as $course) {
            $code = trim($course['subject_code']);
            $query = OtherSchoolSubject::query()
                ->whereRaw('LOWER(TRIM(subject_code)) = ?', [strtolower($code)]);

            if (! empty($validated['school_id'])) {
                $query->where('school_id', $validated['school_id']);
            }

            $matches = $query->with(['subjectEquivalences.subject', 'school'])->get();

            if ($matches->isEmpty()) {
                $results[] = [
                    'input_code' => $code,
                    'match' => 'none',
                    'message' => 'No transfer course on file with this code (for the selected school filter).',
                    'equivalences' => [],
                ];

                continue;
            }

            $equivalences = [];

            foreach ($matches as $oss) {
                foreach ($oss->subjectEquivalences as $eq) {
                    if (($eq->status ?? 'active') !== 'active') {
                        continue;
                    }

                    $local = $eq->subject;
                    $equivalences[] = [
                        'equivalence_id' => $eq->equivalence_id,
                        'other_subject_id' => $oss->other_subject_id,
                        'external_subject_code' => $oss->subject_code,
                        'external_subject_name' => $oss->subject_name,
                        'school_id' => $oss->school_id,
                        'school_name' => $oss->school->school_name ?? null,
                        'local_subject_id' => $eq->subject_id,
                        'local_subject_code' => $local->subject_code ?? null,
                        'local_subject_name' => $local->subject_name ?? null,
                        'credited_units' => $eq->credited_units,
                        'credit_basis' => $eq->credit_basis,
                        'remarks' => $eq->remarks,
                    ];
                }
            }

            $results[] = [
                'input_code' => $code,
                'match' => count($equivalences) > 0 ? 'found' : 'no_equivalence',
                'message' => count($equivalences) > 0
                    ? null
                    : 'Course(s) on file but no active equivalence to a local subject.',
                'equivalences' => $equivalences,
            ];
        }

        return response()->json(['results' => $results]);
    }
}
