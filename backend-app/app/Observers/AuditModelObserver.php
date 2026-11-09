<?php

namespace App\Observers;

use App\Models\AuditLog;
use App\Services\AuditTrailService;
use Illuminate\Database\Eloquent\Model;

class AuditModelObserver
{
    private const SENSITIVE = ['password', 'Password', 'remember_token'];

    /**
     * @return array<string, mixed>
     */
    private function stripSensitive(array $attrs): array
    {
        foreach (self::SENSITIVE as $k) {
            unset($attrs[$k]);
        }

        return $attrs;
    }

    public function created(Model $model): void
    {
        if ($model instanceof AuditLog) {
            return;
        }

        $attrs = $this->stripSensitive($model->getAttributes());
        AuditTrailService::log('CREATE', $model, null, $attrs !== [] ? $attrs : null);
    }

    public function updated(Model $model): void
    {
        if ($model instanceof AuditLog) {
            return;
        }

        $changes = $model->getChanges();
        if ($changes === []) {
            return;
        }

        $old = [];
        $new = [];
        foreach ($changes as $key => $newVal) {
            if (in_array($key, self::SENSITIVE, true)) {
                $old[$key] = '[redacted]';
                $new[$key] = '[redacted]';

                continue;
            }
            $old[$key] = $model->getOriginal($key);
            $new[$key] = $newVal;
        }

        AuditTrailService::log('UPDATE', $model, $old, $new);
    }

    public function deleted(Model $model): void
    {
        if ($model instanceof AuditLog) {
            return;
        }

        $attrs = $this->stripSensitive($model->getAttributes());
        AuditTrailService::log('DELETE', $model, $attrs !== [] ? $attrs : null, null);
    }
}
