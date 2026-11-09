<?php

namespace App\Console\Commands;

use App\Services\DatabaseBackupService;
use Illuminate\Console\Command;

class RunScheduledDatabaseBackup extends Command
{
    protected $signature = 'backup:run-scheduled';

    protected $description = 'Create a database backup when the configured daily schedule time matches';

    public function handle(DatabaseBackupService $backups): int
    {
        try {
            $row = $backups->runScheduledIfDue();
            if (! $row) {
                $this->info('No scheduled backup due right now.');

                return self::SUCCESS;
            }
            $this->info('Scheduled backup '.$row->status.': '.$row->file_name);

            return $row->status === 'success' ? self::SUCCESS : self::FAILURE;
        } catch (\Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }
    }
}
