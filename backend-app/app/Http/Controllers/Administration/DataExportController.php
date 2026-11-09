<?php

namespace App\Http\Controllers\Administration;

use App\Http\Controllers\Controller;
use App\Models\Evaluation;
use App\Models\Role;
use App\Models\TblUser;
use App\Services\StudentAccountEmail;
use App\Support\CachedSchema;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DataExportController extends Controller
{
    /**
     * Grade Deliberation–style CSV (one row per subject grade) + EVALUATOR.
     * Headers aligned with SIS Grade Deliberation exports used by Import.
     */
    public function students(Request $request): StreamedResponse|\Illuminate\Http\JsonResponse
    {
        $actor = $request->user();
        if (! $actor?->canExportDirectoryData()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $headers = [
            'SESSION',
            'COLLEGE',
            'COURSE',
            'STUDENT ID',
            'NAME',
            'SEMESTER',
            'YEAR LEVEL',
            'CODE',
            'SUBJECT NAME',
            'SUBJECT TYPE',
            'UNITS',
            'SECTION',
            'TEACHER',
            'SSP SECTION',
            'SSP ADVISER',
            'MODALITY',
            'ENLISTMENT MODE',
            'ADMISSION TYPE',
            'GENDER',
            'P3',
            'P1',
            'P2',
            'GRADE',
            'REMARKS',
            'EVALUATOR',
        ];

        $filename = 'Grade_Deliberation_export_'.now()->format('Y-m-d_His').'.csv';

        return response()->streamDownload(function () use ($headers) {
            $out = fopen('php://output', 'w');
            fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF));
            fputcsv($out, $headers);

            Evaluation::query()
                ->whereHas('student', fn (Builder $q) => $this->excludeSampleStudentProfiles($q))
                ->with([
                    'student.program.department',
                    'student.yearLevel',
                    'subject',
                    'academicYear',
                    'semester',
                    'section.faculty',
                    'modality',
                    'evaluatedBy.facultyProfile',
                    'evaluatedBy.deanProfile',
                    'evaluatedBy.programHeadProfile',
                    'evaluatedBy.secretaryProfile',
                    'gradeComponents',
                ])
                ->orderBy('student_id')
                ->orderBy('academic_year_id')
                ->orderBy('semester_id')
                ->orderBy('subject_id')
                ->chunk(200, function ($evals) use ($out) {
                    foreach ($evals as $evaluation) {
                        fputcsv($out, $this->gradeDeliberationRow($evaluation));
                    }
                });

            fclose($out);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    public function staffUsers(Request $request): StreamedResponse|\Illuminate\Http\JsonResponse
    {
        $actor = $request->user();
        if (! $actor?->canExportDirectoryData()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $studentRoleId = Role::query()->where('role_name', 'Student')->value('role_id');

        $users = TblUser::with(['role', 'program', 'department'])
            ->when($studentRoleId, fn ($q) => $q->where('role_id', '!=', (int) $studentRoleId))
            ->orderBy('user_id')
            ->get();

        $rows = $users->map(function (TblUser $user) {
            return [
                (string) $user->user_id,
                (string) ($user->email ?? ''),
                (string) ($user->contact_number ?? ''),
                (string) ($user->role?->role_name ?? ''),
                (string) ($user->department?->department_name ?? ''),
                (string) ($user->program?->program_name ?? ''),
                (string) ($user->status ?? 'active'),
            ];
        })->all();

        $filename = 'staff_users_export_'.now()->format('Y-m-d_His').'.csv';

        return $this->streamCsv($filename, [
            'user_id',
            'email',
            'contact_number',
            'role',
            'department',
            'program',
            'status',
        ], $rows);
    }

    /**
     * Drop seeded Sample Student, simulation dummies, and other demo profiles from export.
     */
    private function excludeSampleStudentProfiles(Builder $query): Builder
    {
        if (CachedSchema::hasColumn('tbl_student_profile', 'is_simulation')) {
            $query->where(function (Builder $q) {
                $q->where('is_simulation', false)->orWhereNull('is_simulation');
            });
        }

        $query->where(function (Builder $q) {
            $q->where(function (Builder $inner) {
                $inner->whereRaw('LOWER(TRIM(COALESCE(first_name, ""))) != ?', ['sample'])
                    ->orWhereRaw('LOWER(TRIM(COALESCE(last_name, ""))) != ?', ['student']);
            })->where(function (Builder $inner) {
                $inner->whereRaw('LOWER(TRIM(COALESCE(first_name, ""))) != ?', ['demo'])
                    ->orWhereRaw('LOWER(TRIM(COALESCE(last_name, ""))) != ?', ['student']);
            });
        });

        $query->where(function (Builder $q) {
            $q->whereNull('student_number')
                ->orWhere('student_number', '!=', '900001');
        })->where(function (Builder $q) {
            $q->whereNull('student_id_number')
                ->orWhere('student_id_number', '!=', '900001');
        });

        $query->where(function (Builder $q) {
            $q->whereNull('student_id_number')
                ->orWhere(function (Builder $inner) {
                    $inner->where('student_id_number', 'not like', 'SIM-%')
                        ->where('student_id_number', 'not like', '2026-%');
                });
        })->where(function (Builder $q) {
            $q->whereNull('student_number')
                ->orWhere(function (Builder $inner) {
                    $inner->where('student_number', 'not like', 'SIM-%')
                        ->where('student_number', 'not like', '2026-%');
                });
        });

        $query->whereDoesntHave('user', function (Builder $q) {
            $q->where(function (Builder $emailQ) {
                $emailQ->whereRaw('LOWER(Email) = ?', ['student@example.com'])
                    ->orWhereRaw('LOWER(Email) like ?', ['sample.%@example.com']);
            });
        });

        return $query;
    }

    /**
     * @return list<string>
     */
    private function gradeDeliberationRow(Evaluation $evaluation): array
    {
        $profile = $evaluation->student;
        $subject = $evaluation->subject;
        $program = $profile?->program;
        $components = $this->componentMap($evaluation);

        $last = strtoupper(trim((string) ($profile?->last_name ?? '')));
        $first = strtoupper(trim((string) ($profile?->first_name ?? '')));
        $middle = strtoupper(trim((string) ($profile?->middle_name ?? '')));
        $name = trim($last.($last !== '' && $first !== '' ? ', ' : '').$first.($middle !== '' ? ' '.$middle : ''));

        $teacher = '';
        $faculty = $evaluation->section?->faculty;
        if ($faculty) {
            $teacher = trim(implode(' ', array_filter([
                $faculty->first_name,
                $faculty->middle_name,
                $faculty->last_name,
            ])));
        }

        $evaluator = '';
        if ($evaluation->evaluatedBy) {
            $evaluator = $evaluation->evaluatedBy->displayName();
            if ($evaluator === '' || str_contains($evaluator, '@')) {
                $email = StudentAccountEmail::displayEmail((string) $evaluation->evaluatedBy->email) ?? (string) $evaluation->evaluatedBy->email;
                $evaluator = $email !== '' ? $email : $evaluator;
            }
        } elseif (! empty($profile?->promotion_evaluated_by)) {
            $evaluator = (string) $profile->promotion_evaluated_by;
        }

        return [
            $this->formatSession($evaluation),
            (string) ($program?->department?->department_name ?? ''),
            (string) ($program?->program_name ?? ''),
            (string) ($profile?->student_id_number ?? ''),
            $name,
            $this->formatSemesterCode($evaluation),
            $this->formatYearLevel($evaluation),
            (string) ($subject?->subject_code ?? ''),
            (string) ($subject?->subject_name ?? ''),
            '', // SUBJECT TYPE — not stored on subjects in this schema
            (string) ($subject?->number_of_units ?? ''),
            (string) ($evaluation->section?->section_name ?? ''),
            $teacher,
            '', // SSP SECTION
            '', // SSP ADVISER
            (string) ($evaluation->modality?->modality_name ?? ''),
            '', // ENLISTMENT MODE
            (string) ($profile?->student_entry_type ?? 'Regular'),
            '', // GENDER
            (string) ($components['P3'] ?? $components['p3'] ?? ''),
            (string) ($components['P1'] ?? $components['p1'] ?? ''),
            (string) ($components['P2'] ?? $components['p2'] ?? ''),
            (string) ($evaluation->grade ?? ''),
            $this->formatRemarks($evaluation->evaluation_status),
            $evaluator,
        ];
    }

    private function formatSession(Evaluation $evaluation): string
    {
        $ayName = trim((string) ($evaluation->academicYear?->academic_year_name ?? ''));
        $semLabel = $this->semesterRomanLabel((string) ($evaluation->semester?->semester_name ?? ''));

        $sy = $ayName;
        if (preg_match('/(\d{4})\s*[-–]\s*(\d{4})/', $ayName, $m)) {
            $sy = 'SY '.substr($m[1], -2).'-'.substr($m[2], -2);
        } elseif (preg_match('/(\d{4})\s*[-–]\s*(\d{2})\b/', $ayName, $m)) {
            $sy = 'SY '.substr($m[1], -2).'-'.$m[2];
        } elseif ($ayName !== '' && ! str_starts_with(strtoupper($ayName), 'SY')) {
            $sy = 'SY '.$ayName;
        }

        if ($sy === '') {
            return $semLabel;
        }

        return trim($sy.($semLabel !== '' ? ' '.$semLabel : ''));
    }

    private function semesterRomanLabel(string $semesterName): string
    {
        $num = $this->semesterNumber($semesterName);
        return match ($num) {
            3 => 'SEM III',
            2 => 'SEM II',
            1 => 'SEM I',
            default => trim($semesterName),
        };
    }

    private function semesterNumber(string $semesterName): ?int
    {
        $u = strtoupper(trim($semesterName));
        if ($u === '') {
            return null;
        }
        if (preg_match('/\b(3RD|3RD\b|THIRD|III|SUMMER|SEM\s*3|SEMESTER\s*3)\b/', $u)
            || preg_match('/\b3(RD)?\b/', $u)) {
            return 3;
        }
        if (preg_match('/\b(2ND|SECOND|II|SEM\s*2|SEMESTER\s*2)\b/', $u)
            || preg_match('/\b2(ND)?\b/', $u)) {
            return 2;
        }
        if (preg_match('/\b(1ST|FIRST|I|SEM\s*1|SEMESTER\s*1)\b/', $u)
            || preg_match('/\b1(ST)?\b/', $u)) {
            return 1;
        }

        return null;
    }

    private function formatSemesterCode(Evaluation $evaluation): string
    {
        $yearLevel = trim((string) ($evaluation->student?->yearLevel?->year_level ?? ''));
        $yearNum = null;
        if (preg_match('/(\d)/', $yearLevel, $m)) {
            $yearNum = (int) $m[1];
        }

        $semNum = $this->semesterNumber((string) ($evaluation->semester?->semester_name ?? ''));

        if ($yearNum && $semNum) {
            return 'Y'.$yearNum.'S'.$semNum;
        }

        return (string) ($evaluation->semester?->semester_name ?? '');
    }

    private function formatYearLevel(Evaluation $evaluation): string
    {
        $yl = trim((string) ($evaluation->student?->yearLevel?->year_level ?? ''));
        if ($yl === '') {
            return '';
        }
        if (preg_match('/year\s*(\d)/i', $yl, $m)) {
            return 'YEAR '.$m[1];
        }
        if (preg_match('/(\d)/', $yl, $m)) {
            return 'YEAR '.$m[1];
        }

        return strtoupper($yl);
    }

    private function formatRemarks(?string $status): string
    {
        $t = strtolower(trim((string) $status));
        return match ($t) {
            'passed', 'pass' => 'Passed',
            'failed', 'fail' => 'Failed',
            'incomplete', 'inc' => 'INC',
            'credited', 'credit' => 'Credited',
            'dropped' => 'Dropped',
            'withdrawn' => 'Withdrawn',
            '' => '',
            default => ucfirst($t),
        };
    }

    /**
     * @return array<string, string>
     */
    private function componentMap(Evaluation $evaluation): array
    {
        $map = [];
        foreach ($evaluation->gradeComponents ?? [] as $component) {
            $name = strtoupper(trim((string) $component->component_name));
            $map[$name] = (string) ($component->grade ?? '');
            $map[strtolower($name)] = (string) ($component->grade ?? '');
        }

        return $map;
    }

    /**
     * @param  list<string>  $headers
     * @param  list<list<string>>  $rows
     */
    private function streamCsv(string $filename, array $headers, array $rows): StreamedResponse
    {
        return response()->streamDownload(function () use ($headers, $rows) {
            $out = fopen('php://output', 'w');
            fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF));
            fputcsv($out, $headers);
            foreach ($rows as $row) {
                fputcsv($out, $row);
            }
            fclose($out);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }
}
