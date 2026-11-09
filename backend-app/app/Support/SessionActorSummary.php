<?php

namespace App\Support;

use App\Models\TblUser;
use App\Services\StudentAccountEmail;

/**
 * Human-readable actor line for login session UIs (dashboard + audit).
 */
class SessionActorSummary
{
    /**
     * @return array{
     *   display_name: string,
     *   role: ?string,
     *   affiliation: ?string,
     *   affiliation_kind: ?string,
     *   student_id_number: ?string,
     *   email: ?string
     * }
     */
    public static function fromUser(?TblUser $user, ?string $fallbackEmail = null): array
    {
        if (! $user) {
            $email = trim((string) $fallbackEmail);

            return [
                'display_name' => $email !== '' ? $email : 'Unknown user',
                'role' => null,
                'affiliation' => null,
                'affiliation_kind' => null,
                'student_id_number' => null,
                'email' => $email !== '' ? $email : null,
            ];
        }

        $user->loadMissing([
            'role',
            'department',
            'studentProfile.program',
            'facultyProfile.department',
            'deanProfile.department',
            'programHeadProfile.department',
            'secretaryProfile.department',
        ]);

        $role = $user->role->role_name ?? null;
        $studentId = trim((string) ($user->studentProfile->student_id_number ?? ''));
        $studentId = $studentId !== '' ? $studentId : null;

        $rawEmail = trim((string) $user->email);
        $displayName = trim($user->displayName());
        $emailLocal = $rawEmail !== '' ? explode('@', $rawEmail)[0] : '';
        // displayName() falls back to email local-part for placeholder accounts — prefer Student ID then.
        if (
            $displayName === ''
            || ($emailLocal !== '' && strcasecmp($displayName, $emailLocal) === 0
                && StudentAccountEmail::isLoginPlaceholder($rawEmail, $studentId))
        ) {
            $displayName = $studentId ?: ($rawEmail !== '' ? $rawEmail : 'User');
        }

        $affiliation = null;
        $affiliationKind = null;

        if ($role === 'Student') {
            $affiliation = $user->studentProfile?->program?->program_name;
            $affiliationKind = $affiliation ? 'Program' : null;
        } else {
            $department = $user->facultyProfile?->department
                ?? $user->deanProfile?->department
                ?? $user->programHeadProfile?->department
                ?? $user->secretaryProfile?->department
                ?? $user->department;
            $affiliation = $department?->department_name;
            $affiliationKind = $affiliation ? 'Department' : null;
        }

        $email = StudentAccountEmail::displayEmail($rawEmail, $studentId);

        return [
            'display_name' => $displayName,
            'role' => $role,
            'affiliation' => $affiliation,
            'affiliation_kind' => $affiliationKind,
            'student_id_number' => $studentId,
            'email' => $email,
        ];
    }
}
