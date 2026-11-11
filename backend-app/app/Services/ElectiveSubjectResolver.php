<?php

namespace App\Services;

use App\Models\ElectiveSlot;
use App\Models\ElectiveSubject;
use App\Models\Subject;
use App\Models\Track;
use Illuminate\Support\Collection;

class ElectiveSubjectResolver
{
    /** Digi Elective 4 subject (Clean-up and In-between). */
    private const DIGITAL_ARTS_ELECTIVE_4_CODE = 'ITE388';

    /**
     * Resolve which subject applies for a curriculum row tied to an elective slot.
     * Generic electives (null track_id) resolve immediately. Track-specific electives resolve after the
     * student has a track. With a track: use the catalog row for that track, then a generic row, then any
     * existing evaluation whose subject is one of the slot options.
     *
     * IT Electives 4 special case:
     * - Digital Arts: auto-resolve ITE 388 (Digi's 4th dedicated elective).
     * - SysDev / Cyber / BAM (3-elective tracks): stay blank until the dean picks a subject
     *   (or an evaluation already exists on this elective slot).
     *
     * @param  Collection<int, \App\Models\ElectiveSubject>  $electiveSubjects
     * @param  Collection<int, \App\Models\Evaluation>  $studentEvaluations  subject relation loaded
     */
    public static function resolveForCurriculumSlot(
        Collection $electiveSubjects,
        ?int $studentTrackId,
        ?int $curriculumSemesterId,
        Collection $studentEvaluations,
        ?string $slotName = null,
        ?int $electiveSlotId = null
    ): ?Subject {
        if ($electiveSubjects->isEmpty()) {
            return null;
        }

        $isItElectivesFour = self::isItElectivesFourSlot($slotName);
        $isDigitalArtsTrack = self::isDigitalArtsTrackId($studentTrackId, $electiveSubjects);

        // Elective 4: Digi auto-fills ITE 388; other tracks use a slot-stamped evaluation
        // (or an imported free-choice grade that is not their track Elective 1–3 subject).
        if ($isItElectivesFour) {
            if ($isDigitalArtsTrack && $studentTrackId) {
                $matched = self::digitalArtsElectiveFourChoice($electiveSubjects, $studentTrackId);
                if ($matched && $matched->subject) {
                    return $matched->subject;
                }
            }

            $fromSlot = self::resolveFromExistingEvaluation(
                $electiveSubjects,
                $curriculumSemesterId,
                $studentEvaluations,
                $electiveSlotId,
                true
            );
            if ($fromSlot) {
                return $fromSlot;
            }

            return self::resolveElectiveFourFreeChoiceFromEvaluation(
                $electiveSubjects,
                $curriculumSemesterId,
                $studentEvaluations,
                $studentTrackId,
                $electiveSlotId
            );
        }

        if ($studentTrackId) {
            $matched = $electiveSubjects->first(
                fn ($es) => (int) $es->track_id === (int) $studentTrackId
            );
            if ($matched && $matched->subject) {
                return $matched->subject;
            }
        }

        $genericChoices = $electiveSubjects->filter(
            static fn ($es) => $es->track_id === null || (int) $es->track_id === 0
        );
        if ($genericChoices->count() === 1) {
            $generic = $genericChoices->first();
            if ($generic && $generic->subject) {
                return $generic->subject;
            }
        }

        if (! $studentTrackId) {
            return null;
        }

        return self::resolveFromExistingEvaluation(
            $electiveSubjects,
            $curriculumSemesterId,
            $studentEvaluations,
            $electiveSlotId
        );
    }

    public static function isItElectivesFourSlot(?string $slotName): bool
    {
        $name = strtolower(trim((string) $slotName));

        return (bool) preg_match('/\bit\s*electives?\s*4\b/', $name);
    }

    /**
     * @param  Collection<int, \App\Models\ElectiveSubject>  $electiveSubjects
     */
    public static function isDigitalArtsTrackId(?int $studentTrackId, Collection $electiveSubjects): bool
    {
        if (! $studentTrackId) {
            return false;
        }

        $fromCatalog = $electiveSubjects->first(
            fn ($es) => (int) $es->track_id === (int) $studentTrackId
        );
        $track = $fromCatalog?->track;
        if (! $track) {
            $track = Track::query()->find($studentTrackId);
        }
        if (! $track) {
            return false;
        }

        $code = strtoupper(trim((string) ($track->track_code ?? '')));
        $name = strtolower(trim((string) ($track->track_name ?? '')));

        return $code === 'DA'
            || str_contains($code, 'DIGI')
            || str_contains($name, 'digital');
    }

    /**
     * Prefer the Digi Elective 4 catalog row (ITE 388) for the student's DA track.
     *
     * @param  Collection<int, \App\Models\ElectiveSubject>  $electiveSubjects
     */
    protected static function digitalArtsElectiveFourChoice(Collection $electiveSubjects, int $studentTrackId): mixed
    {
        $forTrack = $electiveSubjects->filter(
            fn ($es) => (int) $es->track_id === (int) $studentTrackId
        );

        $ite388 = $forTrack->first(function ($es) {
            $code = strtoupper(preg_replace('/\s+/', '', (string) ($es->subject?->subject_code ?? '')) ?? '');

            return $code === self::DIGITAL_ARTS_ELECTIVE_4_CODE;
        });
        if ($ite388) {
            return $ite388;
        }

        // Fallback: free-choice row for ITE 388 (null track) when Digi track link is missing.
        return $electiveSubjects->first(function ($es) {
            $code = strtoupper(preg_replace('/\s+/', '', (string) ($es->subject?->subject_code ?? '')) ?? '');

            return $code === self::DIGITAL_ARTS_ELECTIVE_4_CODE;
        });
    }

    /**
     * For non-Digi Elective 4: pick an imported free-choice grade even when elective_slot_id
     * was not stamped (legacy imports). Skips the student's own track Elective 1–3 subjects.
     *
     * @param  Collection<int, \App\Models\ElectiveSubject>  $electiveSubjects
     * @param  Collection<int, \App\Models\Evaluation>  $studentEvaluations
     */
    protected static function resolveElectiveFourFreeChoiceFromEvaluation(
        Collection $electiveSubjects,
        ?int $curriculumSemesterId,
        Collection $studentEvaluations,
        ?int $studentTrackId,
        ?int $electiveSlotId = null
    ): ?Subject {
        if ($studentEvaluations->isEmpty() || $electiveSubjects->isEmpty()) {
            return null;
        }

        $blockedSubjectIds = [];
        if ($studentTrackId && $electiveSlotId) {
            $programId = (int) ($electiveSubjects->first()?->program_id ?? 0);
            if ($programId <= 0) {
                $slot = ElectiveSlot::query()->find($electiveSlotId);
                $programId = (int) ($slot?->program_id ?? 0);
            }
            if ($programId > 0) {
                $blockedSubjectIds = self::trackLockedEarlierElectiveSubjectIds($programId, $studentTrackId);
            }
        }

        $optionSubjectIds = $electiveSubjects
            ->pluck('subject_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        $matching = $studentEvaluations->filter(function ($ev) use ($optionSubjectIds, $blockedSubjectIds) {
            $sid = $ev->subject_id !== null ? (int) $ev->subject_id : 0;
            if ($sid <= 0 || ! $optionSubjectIds->contains($sid)) {
                return false;
            }

            // Skip the student's own track Elective 1–3 subject (e.g. SysDev ITE 387).
            return ! isset($blockedSubjectIds[$sid]);
        });

        if ($matching->isEmpty()) {
            return null;
        }

        // Prefer the common Elective 4 free-choice codes when several options exist.
        $preferred = [];
        foreach (ElectiveSlotFromImportAssigner::ELECTIVE_4_PREFERRED_CODES as $code) {
            $preferred[$code] = true;
        }
        $preferredMatches = $matching->filter(function ($ev) use ($preferred, $electiveSubjects) {
            $sid = (int) $ev->subject_id;
            $code = strtoupper(preg_replace('/\s+/', '', (string) (
                $ev->subject?->subject_code
                ?? $electiveSubjects->first(fn ($es) => (int) $es->subject_id === $sid)?->subject?->subject_code
                ?? ''
            )) ?? '');

            return $code !== '' && isset($preferred[$code]);
        });
        if ($preferredMatches->isNotEmpty()) {
            $matching = $preferredMatches;
        }

        return self::pickPreferredEvaluationSubject($matching, $curriculumSemesterId);
    }

    /**
     * @return array<int, true> subject_id => true
     */
    protected static function trackLockedEarlierElectiveSubjectIds(int $programId, int $trackId): array
    {
        $slots = ElectiveSlot::query()
            ->where('program_id', $programId)
            ->where('status', 'active')
            ->get(['elective_slot_id', 'slot_name']);

        $ids = [];
        foreach ($slots as $slot) {
            $name = strtolower(trim((string) $slot->slot_name));
            if (! preg_match('/\bit\s*electives?\s*[123]\b/', $name)) {
                continue;
            }
            $subjectIds = ElectiveSubject::query()
                ->where('elective_slot_id', $slot->elective_slot_id)
                ->where('track_id', $trackId)
                ->pluck('subject_id');
            foreach ($subjectIds as $sid) {
                $ids[(int) $sid] = true;
            }
        }

        return $ids;
    }

    /**
     * @param  Collection<int, \App\Models\Evaluation>  $matching
     */
    protected static function pickPreferredEvaluationSubject(Collection $matching, ?int $curriculumSemesterId): ?Subject
    {
        $sortKey = fn ($ev) => sprintf(
            '%010d-%010d',
            (int) $ev->academic_year_id,
            (int) $ev->evaluation_id
        );

        if ($curriculumSemesterId !== null) {
            $semMatch = $matching
                ->filter(fn ($ev) => (int) $ev->semester_id === (int) $curriculumSemesterId)
                ->sortByDesc($sortKey);
            $pick = $semMatch->first();
            if ($pick && $pick->subject) {
                return $pick->subject;
            }
        }

        $pick = $matching->sortByDesc($sortKey)->first();

        return $pick?->subject;
    }

    protected static function resolveFromExistingEvaluation(
        Collection $electiveSubjects,
        ?int $curriculumSemesterId,
        Collection $studentEvaluations,
        ?int $electiveSlotId = null,
        bool $requireSlotMatch = false
    ): ?Subject {
        $optionSubjectIds = $electiveSubjects
            ->pluck('subject_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        if ($studentEvaluations->isEmpty() || $optionSubjectIds->isEmpty()) {
            return null;
        }

        $matching = $studentEvaluations->filter(function ($ev) use ($optionSubjectIds) {
            return $ev->subject_id !== null && $optionSubjectIds->contains((int) $ev->subject_id);
        });

        if ($electiveSlotId !== null) {
            $slotMatching = $matching->filter(
                fn ($ev) => $ev->elective_slot_id !== null && (int) $ev->elective_slot_id === (int) $electiveSlotId
            );
            if ($slotMatching->isNotEmpty() || $requireSlotMatch) {
                $matching = $slotMatching;
            }
        }

        if ($matching->isEmpty()) {
            return null;
        }

        $sortKey = fn ($ev) => sprintf(
            '%010d-%010d',
            (int) $ev->academic_year_id,
            (int) $ev->evaluation_id
        );

        if ($curriculumSemesterId !== null) {
            $semMatch = $matching
                ->filter(fn ($ev) => (int) $ev->semester_id === (int) $curriculumSemesterId)
                ->sortByDesc($sortKey);
            $pick = $semMatch->first();
            if ($pick && $pick->subject) {
                return $pick->subject;
            }
        }

        $pick = $matching->sortByDesc($sortKey)->first();

        return $pick?->subject;
    }
}
