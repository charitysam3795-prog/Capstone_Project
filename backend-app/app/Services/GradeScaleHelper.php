<?php

namespace App\Services;

use App\Models\Curriculum;

/**
 * SIS grade handling: store and display grades on the 1.00–5.00 scale.
 * Legacy percentage values (from an old conversion) are mapped back to SIS on read/import.
 */
class GradeScaleHelper
{
    /** @var array<string, array{min: float, max: float}> */
    private const PS50_BANDS = [
        '1' => ['min' => 94.8, 'max' => 100.0],
        '1.25' => ['min' => 89.2, 'max' => 94.7],
        '1.5' => ['min' => 83.6, 'max' => 89.1],
        '1.75' => ['min' => 78.0, 'max' => 83.5],
        '2' => ['min' => 72.4, 'max' => 77.9],
        '2.25' => ['min' => 66.8, 'max' => 72.3],
        '2.5' => ['min' => 61.2, 'max' => 66.7],
        '2.75' => ['min' => 55.6, 'max' => 61.1],
        '3' => ['min' => 50.0, 'max' => 55.5],
        '5' => ['min' => 0.0, 'max' => 49.9],
    ];

    /** @var array<string, array{min: float, max: float}> */
    private const PS60_BANDS = [
        '1' => ['min' => 96.0, 'max' => 100.0],
        '1.25' => ['min' => 91.5, 'max' => 95.9],
        '1.5' => ['min' => 87.0, 'max' => 91.4],
        '1.75' => ['min' => 82.5, 'max' => 86.9],
        '2' => ['min' => 78.0, 'max' => 82.4],
        '2.25' => ['min' => 73.5, 'max' => 77.9],
        '2.5' => ['min' => 69.0, 'max' => 73.4],
        '2.75' => ['min' => 64.5, 'max' => 68.9],
        '3' => ['min' => 60.0, 'max' => 64.4],
        '5' => ['min' => 0.0, 'max' => 59.9],
    ];

    /** @var list<string> */
    private const SIS_BAND_KEYS = ['1', '1.25', '1.5', '1.75', '2', '2.25', '2.5', '2.75', '3', '5'];

    public function passingGradeUsesPs60(mixed $passingGrade): bool
    {
        $n = (float) str_replace(['%', ' '], '', trim((string) ($passingGrade ?? '')));

        return $n >= 60;
    }

    public function isLegacyPercentGrade(mixed $grade): bool
    {
        $clean = $this->cleanGrade($grade);
        if ($clean === null || ! is_numeric($clean)) {
            return false;
        }

        $g = (float) str_replace(',', '.', $clean);

        return $g >= 50 && $g <= 100;
    }

    public function legacyPercentToSisGrade(mixed $grade, mixed $passingGrade = 50): ?string
    {
        if (! $this->isLegacyPercentGrade($grade)) {
            return null;
        }

        $percent = (float) str_replace(',', '.', (string) $this->cleanGrade($grade));
        $bands = $this->passingGradeUsesPs60($passingGrade) ? self::PS60_BANDS : self::PS50_BANDS;

        foreach (self::SIS_BAND_KEYS as $key) {
            $band = $bands[$key] ?? null;
            if ($band === null) {
                continue;
            }
            if ($percent + 1e-9 >= $band['min'] && $percent - 1e-9 <= $band['max']) {
                return $this->formatSisGradeKey($key);
            }
        }

        return null;
    }

    /** Normalize stored/imported grade to SIS scale when possible. */
    public function coerceToSisGrade(mixed $grade, mixed $passingGrade = 50): ?string
    {
        $clean = $this->cleanGrade($grade);
        if ($clean === null || $this->isCompleteGrade($clean)) {
            return null;
        }
        if ($this->isNumericalGradeScale($clean)) {
            return $clean;
        }

        return $this->legacyPercentToSisGrade($clean, $passingGrade) ?? $clean;
    }

    private function formatSisGradeKey(string $key): string
    {
        if ((float) $key >= 5 - 1e-6) {
            return '5';
        }

        return $key;
    }

    public function isCompleteGrade(mixed $grade): bool
    {
        $t = strtolower(trim((string) ($grade ?? '')));
        if ($t === '') {
            return false;
        }

        return in_array($t, ['complete', 'completed', 'pass', 'passed', 'credit', 'credited'], true);
    }

    public function cleanGrade(mixed $grade): ?string
    {
        if ($grade === null) {
            return null;
        }
        $t = trim((string) $grade);
        if ($t === '' || strtoupper($t) === 'NA' || strtoupper($t) === 'N/A' || $t === '-') {
            return null;
        }

        return $t;
    }

    public function isNumericalGradeScale(mixed $grade): bool
    {
        $clean = $this->cleanGrade($grade);
        if ($clean === null || $this->isCompleteGrade($clean)) {
            return false;
        }

        $g = (float) str_replace(',', '.', $clean);
        if (! is_finite($g)) {
            return false;
        }
        if ($g >= 50) {
            return false;
        }

        return $g >= 0 && $g <= 5.01;
    }

    public function numericalGradeIndicatesPass(mixed $grade): bool
    {
        if (! $this->isNumericalGradeScale($grade)) {
            return false;
        }

        $g = (float) str_replace(',', '.', (string) $this->cleanGrade($grade));
        if ($g >= 1 - 1e-6 && $g <= 3 + 1e-6) {
            return true;
        }

        return false;
    }

    /**
     * @return array{grade: ?string, evaluation_status: ?string}
     */
    public function normalizeForImport(?string $gradeRaw, ?string $evaluationStatus, mixed $passingGrade = 50): array
    {
        $grade = $this->cleanGrade($gradeRaw);
        $status = $this->normalizeStatus($evaluationStatus);

        if ($this->isCompleteGrade($grade)) {
            return [
                'grade' => null,
                'evaluation_status' => $status ?? 'complete',
            ];
        }

        if ($grade === null) {
            return [
                'grade' => null,
                'evaluation_status' => $status,
            ];
        }

        $coerced = $this->coerceToSisGrade($grade, $passingGrade);
        if ($coerced !== null) {
            $grade = $coerced;
        }

        if ($this->isNumericalGradeScale($grade)) {
            $derivedStatus = $status ?? ($this->numericalGradeIndicatesPass($grade) ? 'passed' : 'failed');

            return [
                'grade' => $grade,
                'evaluation_status' => $derivedStatus,
            ];
        }

        if ($status === null && is_numeric($grade)) {
            $pg = is_numeric($passingGrade) ? (float) $passingGrade : 50.0;
            $status = (float) $grade >= $pg ? 'passed' : 'failed';
        }

        return [
            'grade' => $grade,
            'evaluation_status' => $status,
        ];
    }

    public function gradeIndicatesPass(mixed $grade, mixed $passingGrade, ?string $status): bool
    {
        $st = $this->normalizeStatus($status);
        if (in_array($st, ['passed', 'pass', 'credit'], true)) {
            return true;
        }
        if (in_array($st, ['failed', 'fail', 'f', 'dropped', 'drop'], true)) {
            return false;
        }

        $clean = $this->cleanGrade($grade);
        if ($clean === null) {
            return false;
        }

        if ($this->isCompleteGrade($clean)) {
            return true;
        }

        if ($this->isNumericalGradeScale($clean)) {
            return $this->numericalGradeIndicatesPass($clean);
        }

        $sis = $this->coerceToSisGrade($clean, $passingGrade);
        if ($sis !== null && $this->isNumericalGradeScale($sis)) {
            return $this->numericalGradeIndicatesPass($sis);
        }

        $pg = is_numeric($passingGrade) ? (float) $passingGrade : 50.0;
        if (is_numeric($clean)) {
            return (float) $clean >= $pg;
        }

        return false;
    }

    private function normalizeStatus(?string $status): ?string
    {
        if ($status === null) {
            return null;
        }
        $t = strtolower(trim($status));

        return $t === '' ? null : ($t === 'inc' ? 'incomplete' : $t);
    }

    public function resolvePassingGradeForSubject(?int $programId, int $subjectId): float
    {
        if ($programId === null) {
            return 50.0;
        }

        $passingGrade = Curriculum::query()
            ->where('program_id', $programId)
            ->where('subject_id', $subjectId)
            ->whereNotNull('passing_grade')
            ->value('passing_grade');

        return $passingGrade !== null ? (float) $passingGrade : 50.0;
    }

    /**
     * Manual dean/faculty entry: store grade text as entered (varchar).
     *
     * @param  array<string, mixed>  $validated  create/update payload (mutated)
     */
    public function applyManualEvaluationNormalization(array &$validated, ?int $programId, int $subjectId): void
    {
        if (array_key_exists('grade', $validated)) {
            $validated['grade'] = $this->cleanGrade($validated['grade']);
        }

        if (array_key_exists('evaluation_status', $validated)) {
            $validated['evaluation_status'] = $this->normalizeStatus(
                isset($validated['evaluation_status']) ? (string) $validated['evaluation_status'] : null
            );
        }
    }
}
