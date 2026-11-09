<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Support\CachedSchema;

class SecuritySetting extends Model
{
    protected $table = 'tbl_security_settings';

    protected $primaryKey = 'security_settings_id';

    public const PASSWORD_HARD_MAX = 256;

    protected $fillable = [
        'max_password_length',
        'min_password_length',
        'password_expiry_days',
        'session_timeout_minutes',
        'student_session_timeout_minutes',
        'session_warning_minutes_left',
        'lockout_attempts',
        'lockout_duration_minutes',
    ];

    protected function casts(): array
    {
        return [
            'max_password_length' => 'integer',
            'min_password_length' => 'integer',
            'password_expiry_days' => 'integer',
            'session_timeout_minutes' => 'integer',
            'student_session_timeout_minutes' => 'integer',
            'session_warning_minutes_left' => 'integer',
            'lockout_attempts' => 'integer',
            'lockout_duration_minutes' => 'integer',
        ];
    }

    /** @var self|null Request-scoped cache (login hits this several times). */
    private static ?self $requestCache = null;

    public static function forgetCached(): void
    {
        self::$requestCache = null;
    }

    public static function current(): self
    {
        if (self::$requestCache instanceof self) {
            return self::$requestCache;
        }

        $row = self::query()->orderBy('security_settings_id')->first();
        if ($row) {
            return self::$requestCache = $row;
        }

        $payload = [
            'max_password_length' => self::PASSWORD_HARD_MAX,
            'password_expiry_days' => 90,
            'session_timeout_minutes' => 30,
            'student_session_timeout_minutes' => 30,
            'session_warning_minutes_left' => 1,
            'lockout_attempts' => 10,
            'lockout_duration_minutes' => 15,
        ];
        if (CachedSchema::hasColumn('tbl_security_settings', 'min_password_length')) {
            $payload['min_password_length'] = 8;
        }

        return self::$requestCache = self::create($payload);
    }

    public function minPasswordLength(): int
    {
        $n = (int) ($this->min_password_length ?: 8);

        return max(6, min(32, $n));
    }

    public function maxPasswordLength(): int
    {
        return self::PASSWORD_HARD_MAX;
    }

    public function toPublicArray(): array
    {
        return [
            'min_password_length' => $this->minPasswordLength(),
            'max_password_length' => $this->maxPasswordLength(),
            'password_expiry_days' => (int) $this->password_expiry_days,
            'session_timeout_minutes' => (int) $this->session_timeout_minutes,
            'student_session_timeout_minutes' => (int) ($this->student_session_timeout_minutes ?? $this->session_timeout_minutes),
            'session_warning_minutes_left' => (int) ($this->session_warning_minutes_left ?: 1),
            'lockout_attempts' => (int) $this->lockout_attempts,
            'lockout_duration_minutes' => (int) $this->lockout_duration_minutes,
        ];
    }
}
