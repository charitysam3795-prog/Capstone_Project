<?php

namespace Tests\Unit;

use App\Services\AuthUnitHelpers;
use PHPUnit\Framework\TestCase;

/**
 * LEVEL 1 — Master Unit Testing Registry
 * Series 100: User Authentication, Security & Session Management
 */
class AuthUnitHelpersTest extends TestCase
{
    /** UT-101 — validateEmailFormat rejects structural typos */
    public function test_ut_101_validate_email_format_rejects_structural_typos(): void
    {
        $this->assertFalse(AuthUnitHelpers::validateEmailFormat('test@com'));
        $this->assertFalse(AuthUnitHelpers::validateEmailFormat('@@domain.com'));
        $this->assertFalse(AuthUnitHelpers::validateEmailFormat('not-an-email'));
        $this->assertFalse(AuthUnitHelpers::validateEmailFormat(''));
        $this->assertFalse(AuthUnitHelpers::validateEmailFormat('user@'));
        $this->assertFalse(AuthUnitHelpers::validateEmailFormat('@domain.com'));

        $this->assertTrue(AuthUnitHelpers::validateEmailFormat('user@example.com'));
        $this->assertTrue(AuthUnitHelpers::validateEmailFormat('test.user+tag@school.edu.ph'));
    }

    /** UT-102 — validatePasswordStrength rejects short or special-char-less passwords */
    public function test_ut_102_validate_password_strength_rejects_weak_passwords(): void
    {
        $this->assertFalse(AuthUnitHelpers::validatePasswordStrength('Ab1!')); // < 8
        $this->assertFalse(AuthUnitHelpers::validatePasswordStrength('short1!')); // 7 chars
        $this->assertFalse(AuthUnitHelpers::validatePasswordStrength('Password1')); // no special
        $this->assertFalse(AuthUnitHelpers::validatePasswordStrength('12345678')); // no special

        $this->assertTrue(AuthUnitHelpers::validatePasswordStrength('Password1!'));
        $this->assertTrue(AuthUnitHelpers::validatePasswordStrength('Secur3@pass'));
    }

    /** UT-103 — hashUserPassword returns a unique 60+ char BCrypt hash */
    public function test_ut_103_hash_user_password_returns_bcrypt_hash(): void
    {
        $plain = 'Password1!';
        $hash = AuthUnitHelpers::hashUserPassword($plain);

        $this->assertIsString($hash);
        $this->assertGreaterThanOrEqual(60, strlen($hash));
        $this->assertStringStartsWith('$2y$', $hash);
        $this->assertNotSame($plain, $hash);

        // Same plaintext yields a different salt/hash each call (unique).
        $hash2 = AuthUnitHelpers::hashUserPassword($plain);
        $this->assertNotSame($hash, $hash2);
    }

    /** UT-104 — verifyPasswordMatch returns true for match, false if modified */
    public function test_ut_104_verify_password_match(): void
    {
        $plain = 'Password1!';
        $hash = AuthUnitHelpers::hashUserPassword($plain);

        $this->assertTrue(AuthUnitHelpers::verifyPasswordMatch($plain, $hash));
        $this->assertFalse(AuthUnitHelpers::verifyPasswordMatch('Password1!!', $hash));
        $this->assertFalse(AuthUnitHelpers::verifyPasswordMatch($plain, $hash.'x'));
        $this->assertFalse(AuthUnitHelpers::verifyPasswordMatch($plain, ''));
    }

    /** UT-105 — generateSessionToken returns a structured JWT or secure state string */
    public function test_ut_105_generate_session_token(): void
    {
        $token = AuthUnitHelpers::generateSessionToken(42);

        $this->assertIsString($token);
        $this->assertNotSame('', $token);
        $this->assertGreaterThan(20, strlen($token));

        // Isolated path (no DB user) returns signed payload.userId binding.
        $this->assertStringContainsString('.', $token);

        $token2 = AuthUnitHelpers::generateSessionToken(42);
        $this->assertNotSame($token, $token2);
    }

    /** UT-106 — isTokenExpired is true when timestamp is older than now */
    public function test_ut_106_is_token_expired(): void
    {
        $this->assertTrue(AuthUnitHelpers::isTokenExpired(time() - 60));
        $this->assertTrue(AuthUnitHelpers::isTokenExpired(1));

        $this->assertFalse(AuthUnitHelpers::isTokenExpired(time() + 3600));
        $this->assertFalse(AuthUnitHelpers::isTokenExpired(time() + 1));
    }
}
