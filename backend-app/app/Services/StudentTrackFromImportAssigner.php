<?php

namespace App\Services;

use App\Models\ElectiveSubject;
use App\Models\StudentProfile;
use App\Models\Subject;
use App\Models\Track;
use Illuminate\Support\Facades\Log;

/**
 * When SIS / grade import includes a track elective (e.g. Advanced Programming → System Development,
 * Freehand and Digital Drawing → Digital Arts), set the student's track automatically.
 */
class StudentTrackFromImportAssigner
{
    /**
     * Known IT elective codes → track family (matches BSIT 2022 elective catalog).
     * Shared Elective 4 options like ITE 381 are omitted (ambiguous across tracks).
     *
     * @var array<string, string>
     */
    private const CODE_TO_FAMILY = [
        // System Development (SYS DEV)
        'ITE387' => 'sysdev', // Advanced Programming
        'ITE235' => 'sysdev', // Game Development
        'ITE386' => 'sysdev', // Cloud Programming
        // Digital Arts (DA) — Elective 4 is ITE388
        'ITE391' => 'digital',
        'ITE392' => 'digital',
        'ITE240' => 'digital',
        'ITE388' => 'digital',
        // Cybersecurity (CYBER)
        'ITE383' => 'cyber',
        'ITE384' => 'cyber',
        'ITE385' => 'cyber',
        // Business Informatics (BI)
        'BAM285' => 'business',
        'BAM286' => 'business',
        'ITE382' => 'business',
    ];

    /**
     * Subject-name substrings → track family (case-insensitive).
     *
     * @var list<array{0: string, 1: string}>
     */
    private const NAME_HINTS = [
        ['advanced programming', 'sysdev'],
        ['advance programming', 'sysdev'],
        ['game development', 'sysdev'],
        ['cloud programming', 'sysdev'],
        ['freehand', 'digital'],
        ['digital drawing', 'digital'],
        ['script writing', 'digital'],
        ['storyboard', 'digital'],
        ['3d animation', 'digital'],
        ['clean-up', 'digital'],
        ['cleanup', 'digital'],
        ['network security', 'cyber'],
        ['computer forensics', 'cyber'],
        ['ethical hacking', 'cyber'],
        ['business analysis', 'business'],
        ['applied analytics', 'business'],
        ['intelligent systems', 'business'],
    ];

    /**
     * Assign track_id when missing and the imported subject uniquely identifies a track.
     * Does not overwrite an already-set track.
     */
    public function assignIfMissing(StudentProfile $profile, Subject $subject, ?string $subjectNameHint = null): bool
    {
        if ($profile->track_id) {
            return false;
        }

        $trackId = $this->resolveTrackId($subject, $subjectNameHint);
        if (! $trackId) {
            return false;
        }

        $profile->track_id = $trackId;
        $profile->save();

        Log::info('CSV import auto-assigned student track', [
            'student_id' => $profile->student_id,
            'student_id_number' => $profile->student_id_number,
            'subject_code' => $subject->subject_code,
            'track_id' => $trackId,
        ]);

        return true;
    }

    public function resolveTrackId(Subject $subject, ?string $subjectNameHint = null): ?int
    {
        $fromCatalog = $this->trackIdFromElectiveCatalog((int) $subject->subject_id);
        if ($fromCatalog) {
            return $fromCatalog;
        }

        $family = $this->familyFromCode((string) $subject->subject_code)
            ?? $this->familyFromName((string) ($subjectNameHint ?: $subject->subject_name));

        if (! $family) {
            return null;
        }

        return $this->trackIdForFamily($family);
    }

    /**
     * Prefer a unique non-null track_id from elective catalog rows for this subject.
     * Skips Elective 4 free-choice (null track) and multi-track subjects (e.g. ITE 381).
     */
    private function trackIdFromElectiveCatalog(int $subjectId): ?int
    {
        $trackIds = ElectiveSubject::query()
            ->where('subject_id', $subjectId)
            ->whereNotNull('track_id')
            ->where('track_id', '!=', 0)
            ->pluck('track_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        if ($trackIds->count() === 1) {
            return (int) $trackIds->first();
        }

        return null;
    }

    private function familyFromCode(string $subjectCode): ?string
    {
        $normalized = strtoupper(preg_replace('/\s+/', '', trim($subjectCode)) ?? '');

        return self::CODE_TO_FAMILY[$normalized] ?? null;
    }

    private function familyFromName(string $subjectName): ?string
    {
        $haystack = strtolower(trim($subjectName));
        if ($haystack === '') {
            return null;
        }

        foreach (self::NAME_HINTS as [$needle, $family]) {
            if (str_contains($haystack, $needle)) {
                return $family;
            }
        }

        // Broad Digi catch-all after specific hints.
        if (preg_match('/\bdigi(tal)?\b/', $haystack)) {
            return 'digital';
        }

        return null;
    }

    private function trackIdForFamily(string $family): ?int
    {
        $tracks = Track::query()->get(['track_id', 'track_code', 'track_name']);
        if ($tracks->isEmpty()) {
            return null;
        }

        $matchers = match ($family) {
            // Prefer SYS DEV / CYBER over legacy SD / CS aliases.
            'sysdev' => [
                static fn (string $code, string $name): bool => $code === 'SYS DEV'
                    || $code === 'SYSDEV'
                    || str_contains($code, 'SYS'),
                static fn (string $code, string $name): bool => str_contains($name, 'system development')
                    || str_contains($name, 'systems development'),
                static fn (string $code, string $name): bool => $code === 'SD'
                    || str_contains($name, 'system'),
            ],
            'digital' => [
                static fn (string $code, string $name): bool => $code === 'DA'
                    || str_contains($code, 'DIGI')
                    || str_contains($name, 'digital'),
            ],
            'cyber' => [
                static fn (string $code, string $name): bool => $code === 'CYBER'
                    || str_contains($code, 'CYBER')
                    || str_contains($name, 'cyber'),
                static fn (string $code, string $name): bool => $code === 'CS'
                    || str_contains($name, 'computer security'),
            ],
            'business' => [
                static fn (string $code, string $name): bool => $code === 'BI'
                    || str_contains($code, 'BAM')
                    || str_contains($name, 'business')
                    || str_contains($name, 'informatic'),
            ],
            default => [],
        };

        foreach ($tracks as $track) {
            $code = strtoupper(trim((string) ($track->track_code ?? '')));
            $name = strtolower(trim((string) ($track->track_name ?? '')));
            foreach ($matchers as $matcher) {
                if ($matcher($code, $name)) {
                    return (int) $track->track_id;
                }
            }
        }

        return null;
    }
}
