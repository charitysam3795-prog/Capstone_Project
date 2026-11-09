<?php

namespace App\Support;

/**
 * Shared input rules: block markup/script-like symbols; PH contact = 11 digits.
 */
final class InputGuards
{
    /** Matches markup / script injection and other unnecessary symbols. */
    public const UNSAFE_SYMBOL_PATTERN = '/[<>`\\\\|{}\\[\\]^~]|script\s*:|javascript\s*:|on\w+\s*=/i';

    public static function containsUnsafeSymbols(?string $value): bool
    {
        if ($value === null || $value === '') {
            return false;
        }

        return (bool) preg_match(self::UNSAFE_SYMBOL_PATTERN, $value);
    }

    /** Digits only, max 11. */
    public static function digitsOnlyContact(?string $value, int $maxLen = 11): string
    {
        $digits = preg_replace('/\D+/', '', (string) ($value ?? '')) ?? '';

        return substr($digits, 0, $maxLen);
    }

    /**
     * Laravel rules for optional/required 11-digit PH contact numbers.
     * Returns an array so patterns never get split on `|` (string rules do).
     *
     * @return list<string>
     */
    public static function contactNumberRule(bool $required = false): array
    {
        // nullable + digits: empty/null OK (ConvertEmptyStringsToNull); otherwise exactly 11 digits.
        return $required
            ? ['required', 'digits:11']
            : ['nullable', 'digits:11'];
    }

    /** Rule string: string fields that must not contain unsafe symbols. */
    public static function safeTextRule(bool $required = false, int $max = 255): string
    {
        $base = $required ? 'required' : 'nullable';

        return "{$base}|string|max:{$max}|not_regex:".self::UNSAFE_SYMBOL_PATTERN;
    }
}
