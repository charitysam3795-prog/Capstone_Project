<?php

namespace App\Services;

use App\Models\Role;
use App\Models\StudentProfile;
use App\Models\TblUser;
use App\Services\StudentAccountEmail;
use App\Support\CachedSchema;

class StudentLoginProvisioner
{
    /**
     * Default first-login password: first word of first name (lowercase) + 123.
     * e.g. "John Cyrus" -> john123, "JESSEL VON HIBAYA" -> jessel123
     */
    public static function defaultPassword(?string $firstName): string
    {
        $first = trim((string) $firstName);
        if ($first === '') {
            return 'student123';
        }

        $parts = preg_split('/\s+/', $first, -1, PREG_SPLIT_NO_EMPTY);
        $base = strtolower($parts[0] ?? 'student');
        if ($base === '') {
            $base = 'student';
        }

        return $base.'123';
    }

    /**
     * Ensure a student profile has a portal login (username = student_id_number).
     */
    public static function ensureForProfile(StudentProfile $profile): ?TblUser
    {
        if (CachedSchema::hasColumn('tbl_student_profile', 'is_simulation')
            && ($profile->is_simulation ?? false)) {
            return null;
        }

        if ($profile->user_id) {
            return TblUser::query()->find($profile->user_id);
        }

        $sid = \App\Support\StudentIdNumber::canonicalize((string) $profile->student_id_number);
        if ($sid === '') {
            return null;
        }
        if ($sid !== trim((string) $profile->student_id_number)) {
            $profile->student_id_number = $sid;
        }

        $studentRoleId = Role::query()->where('role_name', 'Student')->value('role_id');
        if (! $studentRoleId) {
            return null;
        }

        $existing = TblUser::whereEmail($sid)->first();
        if ($existing) {
            if (! $existing->hasRole('Student')) {
                throw new \RuntimeException("Student ID {$sid} is already used by a non-student account.");
            }

            $other = StudentProfile::query()
                ->where('user_id', $existing->user_id)
                ->where('student_id', '!=', $profile->student_id)
                ->exists();
            if ($other) {
                throw new \RuntimeException("Login for {$sid} is already linked to another student.");
            }

            $profile->user_id = $existing->user_id;
            $profile->save();

            return $existing;
        }

        $user = TblUser::create([
            'email' => StudentAccountEmail::loginEmailForNewStudent($sid),
            'password' => self::defaultPassword($profile->first_name),
            'contact_number' => $profile->contact_number,
            'role_id' => (int) $studentRoleId,
            'status' => 'active',
            'password_changed_at' => null,
        ]);

        $profile->user_id = $user->user_id;
        $profile->save();

        return $user;
    }

    /**
     * @return array{created: int, skipped: int, errors: list<array{student_id: mixed, message: string}>}
     */
    public static function provisionAllMissing(): array
    {
        $created = 0;
        $skipped = 0;
        $errors = [];

        $query = StudentProfile::query()->whereNull('user_id');
        if (CachedSchema::hasColumn('tbl_student_profile', 'is_simulation')) {
            $query->where(function ($q) {
                $q->where('is_simulation', false)->orWhereNull('is_simulation');
            });
        }

        foreach ($query->get() as $profile) {
            try {
                $user = self::ensureForProfile($profile);
                if ($user) {
                    $created++;
                } else {
                    $skipped++;
                }
            } catch (\Throwable $e) {
                $errors[] = [
                    'student_id' => $profile->student_id_number,
                    'message' => $e->getMessage(),
                ];
            }
        }

        return compact('created', 'skipped', 'errors');
    }
}
