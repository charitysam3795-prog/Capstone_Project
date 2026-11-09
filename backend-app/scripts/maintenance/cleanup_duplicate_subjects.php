<?php

/**
 * One-off cleanup:
 * 1) Merge duplicate subjects that match when spaces are ignored (ITE 399 vs ITE399)
 * 2) Remap curriculum / FK references to the kept subject
 * 3) Delete duplicate subjects (prefer deleting unspaced codes when both exist)
 * 4) Normalize remaining unspaced codes to "PREFIX NNN" (ITE400 → ITE 400)
 *
 * Usage: php scripts/maintenance/cleanup_duplicate_subjects.php
 * Dry run: php scripts/maintenance/cleanup_duplicate_subjects.php --dry-run
 */

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

require __DIR__ . '/../../vendor/autoload.php';
$app = require __DIR__ . '/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$dryRun = in_array('--dry-run', $argv ?? [], true);

function normalizeSubjectCode(string $code): string
{
    return strtoupper(preg_replace('/\s+/', '', trim($code)) ?? '');
}

/** Format ITE400 / ite 400 → ITE 400 */
function formatSpacedSubjectCode(string $code): ?string
{
    $trimmed = strtoupper(trim($code));
    if ($trimmed === '') {
        return null;
    }
    if (preg_match('/^([A-Z]+)\s+(\d+[A-Z]?)$/', $trimmed, $m)) {
        return $m[1] . ' ' . $m[2];
    }
    if (preg_match('/^([A-Z]+)(\d+[A-Z]?)$/', $trimmed, $m)) {
        return $m[1] . ' ' . $m[2];
    }

    return null;
}

function isSpacedCode(string $code): bool
{
    return (bool) preg_match('/^[A-Za-z]+\s+\d/', trim($code));
}

function usageScore(object $subject): int
{
    $id = (int) $subject->subject_id;
    $score = 0;
    // Always prefer spaced codes over unspaced duplicates (ITE 400 over ITE400).
    if (isSpacedCode((string) $subject->subject_code)) {
        $score += 100000;
    }
    $score += DB::table('curriculum')->where('subject_id', $id)->count() * 100;
    if (Schema::hasTable('tbl_evaluation')) {
        $score += DB::table('tbl_evaluation')->where('subject_id', $id)->count() * 10;
    }
    if (Schema::hasTable('tbl_prerequisite')) {
        $score += DB::table('tbl_prerequisite')
            ->where(function ($q) use ($id) {
                $q->where('subject_id', $id)->orWhere('requisites_subject_id', $id);
            })
            ->count() * 5;
    }
    if (Schema::hasTable('tbl_elective_subject')) {
        $score += DB::table('tbl_elective_subject')->where('subject_id', $id)->count() * 5;
    }
    // Prefer older/stable ids when still tied.
    $score += max(0, 5000 - (int) $id);

    return $score;
}

/**
 * Remap subject_id from $fromId → $toId across known tables, then delete $fromId.
 */
function remapAndDeleteSubject(int $fromId, int $toId, bool $dryRun): array
{
    $stats = [
        'curriculum' => 0,
        'evaluation' => 0,
        'prerequisite' => 0,
        'elective_subject' => 0,
        'offered_subject' => 0,
        'subject_equivalence' => 0,
        'credit_evaluation_details' => 0,
        'enrollments' => 0,
        'deleted' => false,
    ];

    if ($fromId === $toId) {
        return $stats;
    }

    $run = function (callable $fn) use ($dryRun) {
        if ($dryRun) {
            return;
        }
        $fn();
    };

    // curriculum
    $q = DB::table('curriculum')->where('subject_id', $fromId);
    $stats['curriculum'] = (clone $q)->count();
    $run(function () use ($fromId, $toId) {
        // Avoid unique collisions if same program/header/year/sem already has keeper
        $targets = DB::table('curriculum')->where('subject_id', $fromId)->get();
        foreach ($targets as $row) {
            $exists = DB::table('curriculum')
                ->where('subject_id', $toId)
                ->where('curriculum_header_id', $row->curriculum_header_id)
                ->where('program_id', $row->program_id)
                ->where('year_level', $row->year_level)
                ->where('semester_id', $row->semester_id)
                ->where('curriculum_id', '!=', $row->curriculum_id)
                ->exists();
            if ($exists) {
                DB::table('curriculum')->where('curriculum_id', $row->curriculum_id)->delete();
            } else {
                DB::table('curriculum')->where('curriculum_id', $row->curriculum_id)->update(['subject_id' => $toId]);
            }
        }
    });

    if (Schema::hasTable('tbl_evaluation')) {
        $stats['evaluation'] = DB::table('tbl_evaluation')->where('subject_id', $fromId)->count();
        $run(function () use ($fromId, $toId) {
            DB::table('tbl_evaluation')->where('subject_id', $fromId)->update(['subject_id' => $toId]);
        });
    }

    if (Schema::hasTable('tbl_prerequisite')) {
        $stats['prerequisite'] = DB::table('tbl_prerequisite')
            ->where('subject_id', $fromId)
            ->orWhere('requisites_subject_id', $fromId)
            ->count();
        $run(function () use ($fromId, $toId) {
            $rows = DB::table('tbl_prerequisite')
                ->where(function ($q) use ($fromId) {
                    $q->where('subject_id', $fromId)->orWhere('requisites_subject_id', $fromId);
                })
                ->get();
            foreach ($rows as $row) {
                $pk = $row->requisites_id ?? $row->prerequisite_id ?? null;
                if ($pk === null) {
                    continue;
                }
                $pkCol = property_exists($row, 'requisites_id') ? 'requisites_id' : 'prerequisite_id';
                $newSubject = (int) $row->subject_id === $fromId ? $toId : (int) $row->subject_id;
                $newReq = (int) $row->requisites_subject_id === $fromId ? $toId : (int) $row->requisites_subject_id;
                if ($newSubject === $newReq) {
                    DB::table('tbl_prerequisite')->where($pkCol, $pk)->delete();
                    continue;
                }
                $dup = DB::table('tbl_prerequisite')
                    ->where('subject_id', $newSubject)
                    ->where('requisites_subject_id', $newReq)
                    ->where($pkCol, '!=', $pk)
                    ->exists();
                if ($dup) {
                    DB::table('tbl_prerequisite')->where($pkCol, $pk)->delete();
                } else {
                    DB::table('tbl_prerequisite')->where($pkCol, $pk)->update([
                        'subject_id' => $newSubject,
                        'requisites_subject_id' => $newReq,
                    ]);
                }
            }
        });
    }

    if (Schema::hasTable('tbl_elective_subject')) {
        $stats['elective_subject'] = DB::table('tbl_elective_subject')->where('subject_id', $fromId)->count();
        $run(function () use ($fromId, $toId) {
            $rows = DB::table('tbl_elective_subject')->where('subject_id', $fromId)->get();
            foreach ($rows as $row) {
                $dup = DB::table('tbl_elective_subject')
                    ->where('subject_id', $toId)
                    ->where('elective_slot_id', $row->elective_slot_id)
                    ->when(
                        Schema::hasColumn('tbl_elective_subject', 'track_id'),
                        fn ($q) => $q->where('track_id', $row->track_id ?? null)
                    )
                    ->where('elective_subject_id', '!=', $row->elective_subject_id)
                    ->exists();
                if ($dup) {
                    DB::table('tbl_elective_subject')->where('elective_subject_id', $row->elective_subject_id)->delete();
                } else {
                    DB::table('tbl_elective_subject')->where('elective_subject_id', $row->elective_subject_id)
                        ->update(['subject_id' => $toId]);
                }
            }
        });
    }

    if (Schema::hasTable('tbl_offered_subject')) {
        $stats['offered_subject'] = DB::table('tbl_offered_subject')->where('subject_id', $fromId)->count();
        $run(function () use ($fromId, $toId) {
            DB::table('tbl_offered_subject')->where('subject_id', $fromId)->update(['subject_id' => $toId]);
        });
    }

    if (Schema::hasTable('tbl_subject_equivalence')) {
        $stats['subject_equivalence'] = DB::table('tbl_subject_equivalence')->where('subject_id', $fromId)->count();
        $run(function () use ($fromId, $toId) {
            DB::table('tbl_subject_equivalence')->where('subject_id', $fromId)->update(['subject_id' => $toId]);
        });
    }

    if (Schema::hasTable('tbl_credit_evaluation_details')) {
        $stats['credit_evaluation_details'] = DB::table('tbl_credit_evaluation_details')->where('subject_id', $fromId)->count();
        $run(function () use ($fromId, $toId) {
            DB::table('tbl_credit_evaluation_details')->where('subject_id', $fromId)->update(['subject_id' => $toId]);
        });
    }

    if (Schema::hasTable('tbl_enrollments')) {
        $stats['enrollments'] = DB::table('tbl_enrollments')->where('subject_id', $fromId)->count();
        $run(function () use ($fromId, $toId) {
            DB::table('tbl_enrollments')->where('subject_id', $fromId)->update(['subject_id' => $toId]);
        });
    }

    $run(function () use ($fromId) {
        DB::table('tbl_subjects')->where('subject_id', $fromId)->delete();
    });
    $stats['deleted'] = true;

    return $stats;
}

echo ($dryRun ? "[DRY RUN] " : "") . "Subject duplicate cleanup\n";
echo str_repeat('=', 60) . "\n";

$subjects = DB::table('tbl_subjects')->orderBy('subject_id')->get();
$groups = [];
foreach ($subjects as $subject) {
    $norm = normalizeSubjectCode((string) $subject->subject_code);
    if ($norm === '') {
        continue;
    }
    $groups[$norm][] = $subject;
}

$duplicateGroups = array_filter($groups, fn ($g) => count($g) > 1);
echo 'Subjects: ' . $subjects->count() . "\n";
echo 'Duplicate normalized groups: ' . count($duplicateGroups) . "\n\n";

$merged = 0;
$deleted = 0;
$normalized = 0;

DB::beginTransaction();
try {
    foreach ($duplicateGroups as $norm => $group) {
        usort($group, function ($a, $b) {
            $sa = usageScore($a);
            $sb = usageScore($b);
            if ($sa !== $sb) {
                return $sb <=> $sa;
            }

            return ((int) $a->subject_id) <=> ((int) $b->subject_id);
        });

        $keeper = $group[0];
        $losers = array_slice($group, 1);

        $desiredCode = formatSpacedSubjectCode((string) $keeper->subject_code) ?? strtoupper(trim((string) $keeper->subject_code));
        echo "KEEP {$keeper->subject_id} \"{$keeper->subject_code}\" → \"{$desiredCode}\" (norm={$norm})\n";

        foreach ($losers as $loser) {
            echo "  MERGE/DELETE {$loser->subject_id} \"{$loser->subject_code}\"\n";
            $stats = remapAndDeleteSubject((int) $loser->subject_id, (int) $keeper->subject_id, $dryRun);
            echo '    remapped curriculum=' . $stats['curriculum']
                . ' eval=' . $stats['evaluation']
                . ' prereq=' . $stats['prerequisite']
                . ' elective=' . $stats['elective_subject'] . "\n";
            $merged++;
            $deleted++;
        }

        if (! $dryRun && (string) $keeper->subject_code !== $desiredCode) {
            // Ensure no other subject already has the desired spaced code after merges
            $conflict = DB::table('tbl_subjects')
                ->where('subject_code', $desiredCode)
                ->where('subject_id', '!=', $keeper->subject_id)
                ->exists();
            if (! $conflict) {
                DB::table('tbl_subjects')->where('subject_id', $keeper->subject_id)->update([
                    'subject_code' => $desiredCode,
                ]);
                $normalized++;
            }
        } elseif ($dryRun && (string) $keeper->subject_code !== $desiredCode) {
            $normalized++;
        }
    }

    // Normalize remaining unspaced singles (not duplicates)
    $remaining = DB::table('tbl_subjects')->orderBy('subject_id')->get();
    foreach ($remaining as $subject) {
        $current = (string) $subject->subject_code;
        $spaced = formatSpacedSubjectCode($current);
        if ($spaced === null || $spaced === $current) {
            continue;
        }
        // Skip if another subject already owns the spaced code
        $conflict = $remaining->first(
            fn ($other) => (int) $other->subject_id !== (int) $subject->subject_id
                && strtoupper(trim((string) $other->subject_code)) === $spaced
        );
        if ($conflict) {
            echo "SKIP normalize {$subject->subject_id} \"{$current}\" (conflicts with {$conflict->subject_id})\n";
            continue;
        }
        echo "NORMALIZE {$subject->subject_id} \"{$current}\" → \"{$spaced}\"\n";
        if (! $dryRun) {
            DB::table('tbl_subjects')->where('subject_id', $subject->subject_id)->update([
                'subject_code' => $spaced,
            ]);
        }
        $normalized++;
    }

    if ($dryRun) {
        DB::rollBack();
        echo "\nDry run complete — no changes committed.\n";
    } else {
        DB::commit();
        echo "\nCommitted.\n";
    }
} catch (Throwable $e) {
    DB::rollBack();
    fwrite(STDERR, 'ERROR: ' . $e->getMessage() . "\n" . $e->getTraceAsString() . "\n");
    exit(1);
}

echo "Merged/deleted duplicates: {$deleted}\n";
echo "Codes normalized to spaced form: {$normalized}\n";

$after = DB::table('tbl_subjects')->count();
$afterGroups = [];
foreach (DB::table('tbl_subjects')->get() as $s) {
    $n = normalizeSubjectCode((string) $s->subject_code);
    $afterGroups[$n] = ($afterGroups[$n] ?? 0) + 1;
}
$stillDups = count(array_filter($afterGroups, fn ($c) => $c > 1));
echo "Subjects after: {$after}\n";
echo "Remaining duplicate groups: {$stillDups}\n";
