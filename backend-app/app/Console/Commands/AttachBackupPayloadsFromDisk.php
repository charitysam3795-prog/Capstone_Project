<?php

namespace App\Console\Commands;

use App\Models\BackupHistory;
use App\Services\DatabaseBackupService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;

class AttachBackupPayloadsFromDisk extends Command
{
    protected $signature = 'backup:attach-missing-payloads';

    protected $description = 'Store gzipped SQL in backup history when the .sql file still exists on disk';

    public function handle(DatabaseBackupService $backups): int
    {
        if (! Schema::hasTable('tbl_backup_history') || ! Schema::hasColumn('tbl_backup_history', 'file_payload')) {
            $this->warn('Backup history or file_payload column is missing.');

            return self::SUCCESS;
        }

        $rows = BackupHistory::query()
            ->where('action', 'backup')
            ->where('status', 'success')
            ->whereNull('file_payload')
            ->orderBy('id')
            ->get(['id', 'file_path']);

        $attached = 0;
        foreach ($rows as $row) {
            $path = trim((string) $row->file_path);
            if ($path === '' || ! is_file($path)) {
                continue;
            }
            $data = file_get_contents($path);
            if ($data === false || $data === '') {
                continue;
            }
            $gz = gzencode($data, 6);
            if ($gz === false) {
                continue;
            }
            BackupHistory::query()->whereKey($row->id)->update(['file_payload' => $gz]);
            $attached++;
        }

        $this->info("Attached database copies for {$attached} backup(s).");

        return self::SUCCESS;
    }
}
