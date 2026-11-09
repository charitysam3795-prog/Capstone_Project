<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

class AuditTrailService
{
    public static function currentUserId(): ?int
    {
        $id = Auth::guard('api')->id() ?? Auth::id();

        return $id !== null ? (int) $id : null;
    }

    /**
     * @param  array<string, mixed>|null  $oldValue
     * @param  array<string, mixed>|null  $newValue
     */
    public static function log(string $action, Model $model, ?array $oldValue, ?array $newValue): void
    {
        if ($model instanceof AuditLog) {
            return;
        }

        $userId = self::currentUserId();
        if ($userId === null) {
            return;
        }

        $pk = $model->getKey();
        $recordId = null;
        if (is_int($pk)) {
            $recordId = $pk;
        } elseif (is_string($pk) && ctype_digit($pk)) {
            $recordId = (int) $pk;
        }

        $cleanOld = self::normalizePayload($oldValue);
        $cleanNew = self::normalizePayload($newValue);

        // An audit row must never block the user's actual save (e.g. profile photo upload).
        try {
            AuditLog::create([
                'user_id' => $userId,
                'actions' => $action,
                'table_name' => $model->getTable(),
                'record_id' => $recordId,
                'old_value' => $cleanOld,
                'new_value' => $cleanNew,
                'action_timestamp' => now(),
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** Binary / secret columns that must not be copied into audit_logs. */
    private const OMIT_KEYS = ['avatar_data', 'file_payload', 'password', 'remember_token'];

    private const MAX_STRING_LENGTH = 500;

    /**
     * @param  array<string, mixed>|null  $payload
     * @return array<string, mixed>|null
     */
    private static function normalizePayload(?array $payload): ?array
    {
        if ($payload === null || $payload === []) {
            return null;
        }

        $out = [];
        foreach ($payload as $key => $value) {
            if (in_array($key, self::OMIT_KEYS, true)) {
                $out[$key] = '[omitted]';

                continue;
            }
            if (is_string($value) && (strlen($value) > self::MAX_STRING_LENGTH || ! mb_check_encoding($value, 'UTF-8'))) {
                $out[$key] = mb_check_encoding($value, 'UTF-8')
                    ? mb_substr($value, 0, self::MAX_STRING_LENGTH).'…'
                    : '[binary]';

                continue;
            }
            $out[$key] = $value;
        }

        return $out;
    }
}
