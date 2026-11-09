<?php

namespace App\Services;

use App\Models\Curriculum;
use App\Models\Subject;
use Illuminate\Support\Collection;

/**
 * Resolves SIS subject codes to the canonical tbl_subjects row used in program curriculum.
 * Handles duplicate codes that differ only by spacing (e.g. GEN 004 vs GEN004).
 */
class SubjectImportResolver
{
    public function normalizeCode(string $subjectCode): string
    {
        return strtoupper(preg_replace('/\s+/', '', trim($subjectCode)));
    }

    /**
     * @return Collection<int, Subject>
     */
    public function findCandidates(string $subjectCode): Collection
    {
        $code = strtoupper(trim($subjectCode));
        if ($code === '') {
            return collect();
        }

        $normalized = $this->normalizeCode($code);

        return Subject::query()
            ->where('subject_code', $code)
            ->orWhereRaw('UPPER(REPLACE(subject_code, " ", "")) = ?', [$normalized])
            ->get();
    }

    public function resolve(?int $programId, string $subjectCode): ?Subject
    {
        $candidates = $this->findCandidates($subjectCode);
        if ($candidates->isEmpty()) {
            return null;
        }
        if ($candidates->count() === 1) {
            return $candidates->first();
        }

        $trimmed = strtoupper(trim($subjectCode));
        $exact = $candidates->first(
            fn (Subject $subject) => strtoupper(trim((string) $subject->subject_code)) === $trimmed
        );

        if ($programId) {
            $curriculumSubjectIds = Curriculum::query()
                ->where('program_id', $programId)
                ->pluck('subject_id');

            $inCurriculum = $candidates->whereIn('subject_id', $curriculumSubjectIds->all());
            if ($inCurriculum->count() === 1) {
                return $inCurriculum->first();
            }
            if ($inCurriculum->isNotEmpty()) {
                if ($exact && $inCurriculum->contains('subject_id', $exact->subject_id)) {
                    return $exact;
                }

                return $inCurriculum->first();
            }
        }

        return $exact ?? $candidates->first();
    }

    /**
     * @return list<int>
     */
    public function aliasSubjectIds(Subject $resolved, string $importedCode): array
    {
        return $this->findCandidates($importedCode)
            ->where('subject_id', '!=', $resolved->subject_id)
            ->pluck('subject_id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();
    }
}
