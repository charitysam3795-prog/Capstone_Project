<?php

namespace App\Services;

/**
 * Students sign in with Student ID; tbl_users.email holds either a placeholder
 * login record or a real contact email — never show the ID as "email" in the UI.
 */
class StudentAccountEmail
{
    public static function placeholderForStudentId(string $studentId): string
    {
        $local = strtolower(trim(preg_replace('/[^a-zA-Z0-9]+/', '.', $studentId) ?? $studentId, '.'));

        if ($local === '') {
            $local = 'student';
        }

        return 'student.'.$local.'@student.local';
    }

    /**
     * True when the stored value is not a real contact email (placeholder or raw student ID).
     */
    public static function isLoginPlaceholder(?string $email, ?string $studentIdNumber = null): bool
    {
        $value = strtolower(trim((string) $email));
        if ($value === '') {
            return true;
        }

        if (str_ends_with($value, '@student.local')) {
            return true;
        }

        $sid = trim((string) $studentIdNumber);
        if ($sid !== '' && strcasecmp($value, $sid) === 0) {
            return true;
        }

        // Student ID used as username without @ is not a contact email.
        if (! str_contains($value, '@')) {
            return true;
        }

        return false;
    }

    /**
     * Real contact email for directory display, or null when none is set.
     */
    public static function displayEmail(?string $email, ?string $studentIdNumber = null): ?string
    {
        if (self::isLoginPlaceholder($email, $studentIdNumber)) {
            return null;
        }

        return trim((string) $email);
    }

    /**
     * Value to store on tbl_users.email when creating a student without a real email yet.
     */
    public static function loginEmailForNewStudent(string $studentId, ?string $requestedEmail = null): string
    {
        $requested = trim((string) $requestedEmail);
        if ($requested !== '' && ! self::isLoginPlaceholder($requested, $studentId)) {
            return $requested;
        }

        return self::placeholderForStudentId($studentId);
    }
}
