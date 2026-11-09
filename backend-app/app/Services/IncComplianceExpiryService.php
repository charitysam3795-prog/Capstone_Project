<?php

namespace App\Services;

use App\Models\Evaluation;
use Carbon\Carbon;

/**
 * Converts INC (incomplete) evaluations past their comply-by date to failed.
 */
class IncComplianceExpiryService
{
    /**
     * @return int Number of rows updated
     */
    public function expireOverdue(?int $studentId = null): int
    {
        $today = Carbon::today();

        $q = Evaluation::query()
            ->whereRaw('LOWER(TRIM(evaluation_status)) = ?', ['incomplete'])
            ->whereNotNull('inc_compliance_deadline')
            ->whereDate('inc_compliance_deadline', '<', $today->toDateString());

        if ($studentId !== null) {
            $q->where('student_id', $studentId);
        }

        $updated = 0;
        foreach ($q->get() as $evaluation) {
            $evaluation->update([
                'evaluation_status' => 'failed',
                'grade' => '49',
                'inc_compliance_deadline' => null,
            ]);
            $updated++;
        }

        return $updated;
    }
}
