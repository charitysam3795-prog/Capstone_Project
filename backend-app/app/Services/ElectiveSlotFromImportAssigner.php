<?php

namespace App\Services;

use App\Models\ElectiveSlot;
use App\Models\ElectiveSubject;
use App\Models\StudentProfile;
use App\Models\Subject;
use Illuminate\Support\Facades\Log;

/**
 * When SIS / grade import includes a free-choice Elective 4 subject, stamp
 * evaluation.elective_slot_id so the curriculum row resolves (dean UI + status).
 *
 * Digi is excluded — ElectiveSubjectResolver already auto-fills ITE 388.
 * Track-locked Electives 1–3 subjects (e.g. SysDev ITE 387) are not stamped as Elective 4.
 */
class ElectiveSlotFromImportAssigner
{
    /**
     * Preferred Elective 4 free-choice codes (cross-track picks).
     * Broader catalog subjects (ITE 381, BAM 286, …) are also accepted when present on the slot.
     *
     * @var list<string>
     */
    public const ELECTIVE_4_PREFERRED_CODES = [
        'BAM285',
        'ITE387',
        'ITE383',
        'ITE391',
    ];

    /**
     * Resolve IT Electives 4 slot id for this student + subject, or null when it should not bind.
     */
    public function resolveElectiveFourSlotId(StudentProfile $profile, Subject $subject): ?int
    {
        $programId = (int) ($profile->current_program ?? 0);
        if ($programId <= 0) {
            return null;
        }

        $slot = $this->itElectivesFourSlot($programId);
        if (! $slot) {
            return null;
        }

        $slotId = (int) $slot->elective_slot_id;
        $subjectId = (int) $subject->subject_id;

        $onSlot = ElectiveSubject::query()
            ->where('elective_slot_id', $slotId)
            ->where('subject_id', $subjectId)
            ->exists();
        if (! $onSlot) {
            return null;
        }

        $trackId = $profile->track_id !== null && $profile->track_id !== ''
            ? (int) $profile->track_id
            : null;

        $electiveSubjects = ElectiveSubject::query()
            ->where('elective_slot_id', $slotId)
            ->with(['subject', 'track'])
            ->get();

        // Digi: leave Elective 4 to ITE 388 auto-resolve.
        if (ElectiveSubjectResolver::isDigitalArtsTrackId($trackId, $electiveSubjects)) {
            return null;
        }

        // Own-track Electives 1–3 subjects stay on those slots, not Elective 4.
        if ($trackId && $this->isTrackLockedEarlierElective($programId, $trackId, $subjectId)) {
            return null;
        }

        return $slotId;
    }

    /**
     * Apply elective_slot_id onto an evaluation payload / model attributes when appropriate.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function applyToEvaluationPayload(
        StudentProfile $profile,
        Subject $subject,
        array $payload,
        ?int $existingSlotId = null
    ): array {
        $slotId = $this->resolveElectiveFourSlotId($profile, $subject);
        if (! $slotId) {
            return $payload;
        }

        // Do not overwrite a different slot already chosen by the dean.
        if ($existingSlotId !== null && $existingSlotId > 0 && $existingSlotId !== $slotId) {
            return $payload;
        }

        $payload['elective_slot_id'] = $slotId;

        Log::info('CSV import stamped Elective 4 on evaluation', [
            'student_id' => $profile->student_id,
            'subject_code' => $subject->subject_code,
            'elective_slot_id' => $slotId,
        ]);

        return $payload;
    }

    private function itElectivesFourSlot(int $programId): ?ElectiveSlot
    {
        $slots = ElectiveSlot::query()
            ->where('program_id', $programId)
            ->where('status', 'active')
            ->get(['elective_slot_id', 'slot_name', 'program_id']);

        return $slots->first(
            static fn (ElectiveSlot $slot) => ElectiveSubjectResolver::isItElectivesFourSlot($slot->slot_name)
        );
    }

    private function isTrackLockedEarlierElective(int $programId, int $trackId, int $subjectId): bool
    {
        $earlierSlots = ElectiveSlot::query()
            ->where('program_id', $programId)
            ->where('status', 'active')
            ->get(['elective_slot_id', 'slot_name']);

        foreach ($earlierSlots as $slot) {
            $name = strtolower(trim((string) $slot->slot_name));
            if (! preg_match('/\bit\s*electives?\s*[123]\b/', $name)) {
                continue;
            }

            $locked = ElectiveSubject::query()
                ->where('elective_slot_id', $slot->elective_slot_id)
                ->where('track_id', $trackId)
                ->where('subject_id', $subjectId)
                ->exists();

            if ($locked) {
                return true;
            }
        }

        return false;
    }
}
