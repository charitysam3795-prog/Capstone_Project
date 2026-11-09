<?php

namespace App\Services;

/**
 * Regular / Irregular standing:
 * - Any explicit failing grade (bagsak) → Irregular
 * - Or passed a later curriculum slot while an earlier required slot is still not passed
 */
class AcademicStatusClassifier
{
    /**
     * @param  array<int, bool>  $passedInCurriculumOrder  Same length as curriculum rows, in program order
     * @param  list<array<string, mixed>>  $rows  Built curriculum rows (optional, for failure detection)
     * @return array{status: string, reasons: array<int, string>}
     */
    public static function fromPassSequence(array $passedInCurriculumOrder, array $rows = []): array
    {
        $reasons = [];

        foreach ($rows as $row) {
            if (self::rowIndicatesExplicitFailure($row)) {
                $reasons[] = 'At least one subject has a failing grade.';
                break;
            }
        }

        $n = count($passedInCurriculumOrder);
        if ($n > 0 && $reasons === []) {
            for ($i = 0; $i < $n; $i++) {
                if ($passedInCurriculumOrder[$i]) {
                    for ($j = 0; $j < $i; $j++) {
                        if (! $passedInCurriculumOrder[$j]) {
                            $reasons[] = 'A later curriculum subject is completed while an earlier required slot in program order is not yet passed (sequence gap).';
                            break 2;
                        }
                    }
                }
            }
        }

        return [
            'status' => count($reasons) > 0 ? 'Irregular' : 'Regular',
            'reasons' => array_values(array_unique($reasons)),
        ];
    }

    /**
     * True when the student has a recorded grade/status that is explicitly failing (not merely missing).
     *
     * @param  array<string, mixed>  $row
     */
    public static function rowIndicatesExplicitFailure(array $row): bool
    {
        if (! empty($row['elective_pending'])) {
            return false;
        }

        $status = strtolower(trim((string) ($row['status'] ?? '')));
        if (in_array($status, ['failed', 'fail', 'f', 'dropped', 'drop'], true)) {
            return true;
        }

        $grade = $row['grade'] ?? null;
        if ($grade === null || $grade === '') {
            return false;
        }

        return ! app(GradeScaleHelper::class)->gradeIndicatesPass(
            $grade,
            $row['passing_grade'] ?? null,
            isset($row['status']) ? (string) $row['status'] : null
        );
    }
}
