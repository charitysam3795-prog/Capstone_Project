<?php

namespace App\Services;

use App\Models\BackupHistory;
use App\Models\BackupSetting;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\Process\Process;

class DatabaseBackupService
{
    private const LOCK_NAME = 'aep_database_backup_lock';

    public function defaultStoragePath(): string
    {
        $fromEnv = trim((string) env('BACKUP_STORAGE_PATH', ''));
        if ($fromEnv !== '') {
            return rtrim(str_replace('\\', '/', $fromEnv), '/');
        }

        if (is_dir('/data')) {
            return '/data/backups';
        }

        return storage_path('app/backups');
    }

    public function settings(): BackupSetting
    {
        if (! Schema::hasTable('tbl_backup_settings')) {
            throw new \RuntimeException('Backup settings table is missing. Run migrations.');
        }

        $row = BackupSetting::query()->orderBy('id')->first();
        if (! $row) {
            $row = BackupSetting::query()->create([
                'enabled' => true,
                'schedule_type' => 'daily',
                'backup_time' => '00:01',
                'storage_path' => null,
                'updated_at' => now(),
            ]);
        }

        return $row;
    }

    public function resolveStorageDir(?BackupSetting $settings = null): string
    {
        $settings ??= $this->settings();
        $raw = trim((string) ($settings->storage_path ?? ''));

        // Ignore OS-foreign absolute paths (e.g. Windows C:\… saved from local into Railway).
        if ($raw !== '' && $this->isUnusableStoragePath($raw)) {
            if ($settings->exists && $settings->storage_path !== null) {
                $settings->storage_path = null;
                $settings->updated_at = now();
                $settings->save();
            }
            $raw = '';
        }

        if ($raw === '') {
            $dir = $this->defaultStoragePath();
        } elseif (preg_match('/^[A-Za-z]:[\\\\\\/]/', $raw) || str_starts_with($raw, '/') || str_starts_with($raw, '\\\\')) {
            $dir = $raw;
        } else {
            $dir = storage_path('app/'.ltrim(str_replace('\\', '/', $raw), '/'));
        }

        if (! is_dir($dir)) {
            File::makeDirectory($dir, 0755, true);
        }

        return rtrim(str_replace('\\', '/', $dir), '/');
    }

    /** True when the configured path cannot work on this host OS. */
    public function isUnusableStoragePath(string $path): bool
    {
        $normalized = str_replace('\\', '/', trim($path));
        $isWindowsDrive = (bool) preg_match('/^[A-Za-z]:\//', $normalized);
        if (PHP_OS_FAMILY === 'Windows') {
            // Absolute Unix paths are not usable on native Windows hosts.
            return str_starts_with($normalized, '/') && ! $isWindowsDrive;
        }

        return $isWindowsDrive || str_starts_with($normalized, '//');
    }

    /**
     * Mark interrupted backup/restore rows as failed so Download stays accurate
     * and a stuck "running" job cannot block the next scheduled backup forever.
     */
    public function failStaleRunningJobs(int $olderThanMinutes = 20): int
    {
        if (! Schema::hasTable('tbl_backup_history')) {
            return 0;
        }

        return BackupHistory::query()
            ->where('status', 'running')
            ->where(function ($q) use ($olderThanMinutes) {
                $q->where('started_at', '<', now()->subMinutes($olderThanMinutes))
                    ->orWhere(function ($q2) use ($olderThanMinutes) {
                        $q2->whereNull('started_at')
                            ->where('created_at', '<', now()->subMinutes($olderThanMinutes));
                    });
            })
            ->update([
                'status' => 'failed',
                'details' => 'Marked failed: job did not finish (timed out or server restarted).',
                'finished_at' => now(),
            ]);
    }

    public function nextRunAt(BackupSetting $settings): ?\Carbon\Carbon
    {
        if (! $settings->enabled) {
            return null;
        }
        $time = $this->normalizeTime($settings->backup_time);
        [$h, $m] = array_map('intval', explode(':', $time));
        $next = now()->copy()->setTime($h, $m, 0);
        if ($next->lessThanOrEqualTo(now())) {
            $next->addDay();
        }

        return $next;
    }

    public function summary(): array
    {
        $settings = $this->settings();
        $storage = $this->resolveStorageDir($settings);
        $history = Schema::hasTable('tbl_backup_history')
            ? BackupHistory::query()
            : null;

        $backupOk = $history ? (clone $history)->where('action', 'backup')->where('status', 'success')->count() : 0;
        $backupFail = $history ? (clone $history)->where('action', 'backup')->where('status', 'failed')->count() : 0;
        $restoreOk = $history ? (clone $history)->where('action', 'restore')->where('status', 'success')->count() : 0;
        $restoreFail = $history ? (clone $history)->where('action', 'restore')->where('status', 'failed')->count() : 0;
        $lastSuccess = $history
            ? (clone $history)->where('action', 'backup')->where('status', 'success')->orderByDesc('finished_at')->first()
            : null;

        return [
            'database' => (string) DB::getDatabaseName(),
            'table_count' => count($this->listTables()),
            'connection' => config('database.default'),
            'timezone' => config('app.timezone') ?: date_default_timezone_get(),
            'server_time' => now()->toIso8601String(),
            'storage_path' => $storage,
            'schedule' => [
                'enabled' => (bool) $settings->enabled,
                'schedule_type' => $settings->schedule_type ?: 'daily',
                'backup_time' => $this->normalizeTime($settings->backup_time),
                'storage_path' => $settings->storage_path,
                'summary' => $settings->enabled
                    ? 'Daily at '.$this->normalizeTime($settings->backup_time)
                    : 'Scheduled backups disabled',
                'next_run_at' => optional($this->nextRunAt($settings))?->toIso8601String(),
            ],
            'stats' => [
                'backups_success' => $backupOk,
                'backups_failed' => $backupFail,
                'restores_success' => $restoreOk,
                'restores_failed' => $restoreFail,
                'last_success_at' => optional($lastSuccess?->finished_at)?->toIso8601String(),
            ],
        ];
    }

    /**
     * @return BackupHistory
     */
    public function createBackup(string $trigger = 'manual', ?int $userId = null): BackupHistory
    {
        // Clear hung rows so a crashed prior run cannot leave the UI stuck on "running".
        $this->failStaleRunningJobs(5);

        if (! $this->acquireLock()) {
            throw new \RuntimeException('Another backup or restore is already running. Try again shortly.');
        }

        $settings = $this->settings();
        $dir = $this->resolveStorageDir($settings);
        $dbName = (string) DB::getDatabaseName();
        $fileName = sprintf(
            '%s_%s_backup_%s.sql',
            preg_replace('/[^a-zA-Z0-9_-]+/', '_', $dbName) ?: 'database',
            $trigger === 'scheduled' ? 'scheduled' : 'manual',
            now()->format('Ymd_His')
        );
        $fullPath = $dir.'/'.$fileName;

        $row = BackupHistory::query()->create([
            'action' => 'backup',
            'trigger' => $trigger === 'scheduled' ? 'scheduled' : 'manual',
            'status' => 'running',
            'file_name' => $fileName,
            'file_path' => $fullPath,
            'file_size' => 0,
            'details' => 'Backup in progress…',
            'created_by' => $userId,
            'started_at' => now(),
        ]);

        try {
            $this->writeSqlDump($fullPath);
            clearstatcache(true, $fullPath);
            $size = is_file($fullPath) ? (int) filesize($fullPath) : 0;
            if ($size <= 0) {
                throw new \RuntimeException('Backup file was empty or could not be written.');
            }

            // Best-effort DB copy for download after redeploy. Never fail the backup if
            // packet/memory limits block storing a large gzip payload.
            $payload = null;
            $payloadNote = '';
            try {
                $payload = $this->gzipFileForStorage($fullPath);
            } catch (\Throwable $payloadErr) {
                $payloadNote = ' (disk only — could not store DB copy)';
                $payload = null;
            }

            try {
                $row->update([
                    'status' => 'success',
                    'file_size' => $size,
                    'file_payload' => $payload,
                    'details' => ($trigger === 'scheduled' ? 'Scheduled' : 'Manual').' backup completed successfully'.$payloadNote,
                    'finished_at' => now(),
                ]);
            } catch (\Throwable $updateErr) {
                // Payload too large for MySQL packet — save metadata without blob.
                $row->update([
                    'status' => 'success',
                    'file_size' => $size,
                    'file_payload' => null,
                    'details' => ($trigger === 'scheduled' ? 'Scheduled' : 'Manual')
                        .' backup completed successfully (disk only — DB copy skipped)',
                    'finished_at' => now(),
                ]);
            }
        } catch (\Throwable $e) {
            $row->update([
                'status' => 'failed',
                'details' => 'Backup failed: '.$e->getMessage(),
                'finished_at' => now(),
            ]);
            if (is_file($fullPath)) {
                @unlink($fullPath);
            }
            throw $e;
        } finally {
            $this->releaseLock();
        }

        return $row->fresh();
    }

    public function runScheduledIfDue(): ?BackupHistory
    {
        if (! Schema::hasTable('tbl_backup_settings') || ! Schema::hasTable('tbl_backup_history')) {
            return null;
        }

        $this->failStaleRunningJobs();

        $settings = $this->settings();
        if (! $settings->enabled) {
            return null;
        }

        $want = $this->normalizeTime($settings->backup_time);
        if (now()->format('H:i') !== $want) {
            return null;
        }

        $already = BackupHistory::query()
            ->where('action', 'backup')
            ->where('trigger', 'scheduled')
            ->whereDate('started_at', now()->toDateString())
            ->whereIn('status', ['running', 'success'])
            ->exists();
        if ($already) {
            return null;
        }

        return $this->createBackup('scheduled', null);
    }

    public function restoreFromHistory(BackupHistory $history, ?int $userId = null): BackupHistory
    {
        if ($history->action !== 'backup' || $history->status !== 'success') {
            throw new \InvalidArgumentException('Only a successful backup can be restored.');
        }
        $path = $this->resolveBackupSqlPath($history);
        if ($path === null) {
            throw new \RuntimeException('Backup file is missing on the server.');
        }

        if (! $this->acquireLock()) {
            throw new \RuntimeException('Another backup or restore is already running. Try again shortly.');
        }

        $row = BackupHistory::query()->create([
            'action' => 'restore',
            'trigger' => 'manual',
            'status' => 'running',
            'file_name' => $history->file_name,
            'file_path' => $path,
            'file_size' => $history->file_size,
            'details' => 'Restore in progress…',
            'created_by' => $userId,
            'started_at' => now(),
        ]);

        $tempPath = null;
        try {
            if ($this->isTempMaterializedPath($history, $path)) {
                $tempPath = $path;
            }
            $this->importSqlFile($path);
            $row->update([
                'status' => 'success',
                'details' => 'Restored from '.$history->file_name,
                'finished_at' => now(),
            ]);
        } catch (\Throwable $e) {
            $row->update([
                'status' => 'failed',
                'details' => 'Restore failed: '.$e->getMessage(),
                'finished_at' => now(),
            ]);
            throw $e;
        } finally {
            if ($tempPath !== null && is_file($tempPath)) {
                @unlink($tempPath);
            }
            $this->releaseLock();
        }

        return $row->fresh();
    }

    public function historyFileAvailability(BackupHistory $history): array
    {
        $path = trim((string) $history->file_path);
        $onDisk = $path !== '' && is_file($path);
        $inDb = $this->historyHasStoredPayload((int) $history->id);

        return [
            'available' => $onDisk || $inDb,
            'on_disk' => $onDisk,
            'in_database' => $inDb,
        ];
    }

    /** Path to SQL for download/restore, or null if neither disk nor DB copy exists. */
    public function resolveBackupSqlPath(BackupHistory $history): ?string
    {
        $path = trim((string) $history->file_path);
        if ($path !== '' && is_file($path)) {
            return $path;
        }

        return $this->materializePayloadToTempFile($history);
    }

    public function readBackupSqlContents(BackupHistory $history): ?string
    {
        $path = $this->resolveBackupSqlPath($history);
        if ($path === null) {
            return null;
        }
        $sql = file_get_contents($path);
        if ($this->isTempMaterializedPath($history, $path) && is_file($path)) {
            @unlink($path);
        }

        return $sql === false ? null : $sql;
    }

    /** Whether resolveBackupSqlPath created a disposable temp file for this history row. */
    public function isTempMaterializedPath(BackupHistory $history, string $path): bool
    {
        return $this->isMaterializedTempPath($history, $path);
    }

    public function historyHasStoredPayload(int $historyId): bool
    {
        if (! Schema::hasColumn('tbl_backup_history', 'file_payload')) {
            return false;
        }

        return BackupHistory::query()
            ->whereKey($historyId)
            ->whereNotNull('file_payload')
            ->exists();
    }

    private function gzipFileForStorage(string $fullPath): ?string
    {
        if (! is_file($fullPath) || ! Schema::hasColumn('tbl_backup_history', 'file_payload')) {
            return null;
        }
        // Avoid loading huge dumps into memory twice (OOM on Railway).
        $size = (int) filesize($fullPath);
        if ($size <= 0 || $size > 12 * 1024 * 1024) {
            return null;
        }
        $data = file_get_contents($fullPath);
        if ($data === false || $data === '') {
            return null;
        }
        $gz = gzencode($data, 6);
        if ($gz === false) {
            return null;
        }

        return $gz;
    }

    private function materializePayloadToTempFile(BackupHistory $history): ?string
    {
        if (! $this->historyHasStoredPayload((int) $history->id)) {
            return null;
        }
        $raw = BackupHistory::query()->whereKey($history->id)->value('file_payload');
        if (! is_string($raw) || $raw === '') {
            return null;
        }
        $sql = gzdecode($raw);
        if ($sql === false) {
            return null;
        }
        $dir = storage_path('app/backups/.materialized');
        if (! is_dir($dir)) {
            File::makeDirectory($dir, 0755, true);
        }
        $temp = $dir.'/backup_'.$history->id.'_'.bin2hex(random_bytes(4)).'.sql';
        if (file_put_contents($temp, $sql) === false) {
            return null;
        }

        return $temp;
    }

    private function isMaterializedTempPath(BackupHistory $history, string $path): bool
    {
        $needle = storage_path('app/backups/.materialized/backup_'.$history->id.'_');

        return str_starts_with(str_replace('\\', '/', $path), str_replace('\\', '/', $needle));
    }

    public function writeSqlDump(string $fullPath): void
    {
        $dbName = (string) DB::getDatabaseName();
        $tables = $this->listTables();
        $pdo = DB::connection()->getPdo();

        $out = fopen($fullPath, 'wb');
        if ($out === false) {
            throw new \RuntimeException('Could not write backup file.');
        }

        try {
            fwrite($out, "-- Academic Evaluation Portal database backup\n");
            fwrite($out, "-- Database: {$dbName}\n");
            fwrite($out, '-- Generated: '.now()->toIso8601String()."\n");
            fwrite($out, '-- Tables: '.count($tables)."\n\n");
            fwrite($out, "SET NAMES utf8mb4;\n");
            fwrite($out, "SET FOREIGN_KEY_CHECKS=0;\n\n");

            foreach ($tables as $table) {
                $safeTable = str_replace('`', '``', $table);
                fwrite($out, "--\n-- Table structure for `{$table}`\n--\n\n");
                fwrite($out, "DROP TABLE IF EXISTS `{$safeTable}`;\n");

                $createRow = DB::selectOne("SHOW CREATE TABLE `{$safeTable}`");
                $createSql = null;
                if ($createRow) {
                    $arr = (array) $createRow;
                    $createSql = $arr['Create Table'] ?? $arr['Create View'] ?? null;
                }
                if (! $createSql) {
                    fwrite($out, "-- (could not read CREATE for {$table})\n\n");
                    continue;
                }
                fwrite($out, $createSql.";\n\n");
                fwrite($out, "--\n-- Data for `{$table}`\n--\n\n");

                // Never dump stored backup blobs — they balloon memory and nest backups forever.
                $skipBlobCols = $table === 'tbl_backup_history'
                    ? ['file_payload' => true]
                    : [];

                $columns = $this->listTableColumns($table);
                if ($columns === []) {
                    fwrite($out, "\n");
                    continue;
                }
                $exportCols = array_values(array_filter(
                    $columns,
                    static fn ($c) => ! isset($skipBlobCols[$c])
                ));
                if ($exportCols === []) {
                    fwrite($out, "\n");
                    continue;
                }

                $colList = implode(', ', array_map(
                    static fn ($c) => '`'.str_replace('`', '``', $c).'`',
                    $exportCols
                ));

                $batch = [];
                $flushBatch = function () use (&$batch, &$out, $safeTable, $colList) {
                    if ($batch === []) {
                        return;
                    }
                    fwrite($out, "INSERT INTO `{$safeTable}` ({$colList}) VALUES\n".implode(",\n", $batch).";\n");
                    $batch = [];
                };

                $writeRow = function ($row) use (&$batch, $flushBatch, $exportCols, $pdo) {
                    $arr = (array) $row;
                    $vals = [];
                    foreach ($exportCols as $col) {
                        $v = $arr[$col] ?? null;
                        $vals[] = $v === null ? 'NULL' : $pdo->quote((string) $v);
                    }
                    $batch[] = '('.implode(', ', $vals).')';
                    if (count($batch) >= 100) {
                        $flushBatch();
                    }
                };

                // Chunked reads — full get() OOMs once prior file_payload rows exist.
                if (in_array('id', $columns, true)) {
                    $selectCols = in_array('id', $exportCols, true)
                        ? $exportCols
                        : array_values(array_unique(array_merge(['id'], $exportCols)));
                    DB::table($table)
                        ->orderBy('id')
                        ->select($selectCols)
                        ->chunkById(200, function ($rows) use ($writeRow) {
                            foreach ($rows as $row) {
                                $writeRow($row);
                            }
                        }, 'id');
                } else {
                    DB::table($table)
                        ->orderBy($columns[0])
                        ->select($exportCols)
                        ->chunk(200, function ($rows) use ($writeRow) {
                            foreach ($rows as $row) {
                                $writeRow($row);
                            }
                        });
                }
                if ($batch !== []) {
                    $flushBatch();
                    fwrite($out, "\n");
                } else {
                    fwrite($out, "\n");
                }
            }

            fwrite($out, "SET FOREIGN_KEY_CHECKS=1;\n");
        } finally {
            fclose($out);
        }
    }

    public function importSqlFile(string $path): void
    {
        $driver = config('database.default');
        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            throw new \RuntimeException('Restore is only supported for MySQL/MariaDB connections.');
        }

        if ($this->importViaMysqlCli($path)) {
            return;
        }

        $sql = file_get_contents($path);
        if ($sql === false) {
            throw new \RuntimeException('Could not read backup file.');
        }

        // Split on semicolons that end statements (simple dump format we generate).
        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        $buffer = '';
        $lines = preg_split("/\r\n|\n|\r/", $sql) ?: [];
        foreach ($lines as $line) {
            $trim = ltrim($line);
            if ($trim === '' || str_starts_with($trim, '--')) {
                continue;
            }
            $buffer .= $line."\n";
            if (str_ends_with(rtrim($buffer), ';')) {
                $stmt = trim($buffer);
                $buffer = '';
                if ($stmt !== '') {
                    DB::unprepared($stmt);
                }
            }
        }
        if (trim($buffer) !== '') {
            DB::unprepared($buffer);
        }
        DB::statement('SET FOREIGN_KEY_CHECKS=1');
    }

    private function importViaMysqlCli(string $path): bool
    {
        $cfg = config('database.connections.'.config('database.default'));
        if (! is_array($cfg)) {
            return false;
        }

        $mysql = $this->findMysqlBinary();
        if ($mysql === null) {
            return false;
        }

        $host = (string) ($cfg['host'] ?? '127.0.0.1');
        $port = (string) ($cfg['port'] ?? '3306');
        $user = (string) ($cfg['username'] ?? 'root');
        $pass = (string) ($cfg['password'] ?? '');
        $db = (string) ($cfg['database'] ?? '');

        $args = [
            $mysql,
            '-h'.$host,
            '-P'.$port,
            '-u'.$user,
        ];
        if ($pass !== '') {
            $args[] = '-p'.$pass;
        }
        $args[] = $db;

        $process = new Process($args);
        $process->setTimeout(null);
        $process->setInput(file_get_contents($path) ?: '');
        $process->run();

        if (! $process->isSuccessful()) {
            throw new \RuntimeException(trim($process->getErrorOutput() ?: $process->getOutput()) ?: 'mysql restore failed');
        }

        return true;
    }

    private function findMysqlBinary(): ?string
    {
        foreach (['mysql', 'mysql.exe'] as $bin) {
            $process = Process::fromShellCommandline(
                PHP_OS_FAMILY === 'Windows' ? 'where '.$bin : 'command -v '.$bin
            );
            $process->run();
            if ($process->isSuccessful()) {
                $line = trim(explode("\n", str_replace("\r", '', $process->getOutput()))[0] ?? '');
                if ($line !== '' && is_file($line)) {
                    return $line;
                }
                if ($line !== '') {
                    return $bin;
                }
            }
        }

        // Common XAMPP path on Windows
        $xampp = 'C:\\xampp\\mysql\\bin\\mysql.exe';
        if (is_file($xampp)) {
            return $xampp;
        }

        return null;
    }

    /** @return list<string> */
    public function listTables(): array
    {
        $dbName = (string) DB::getDatabaseName();
        $rows = DB::select(
            'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ? ORDER BY TABLE_NAME',
            [$dbName, 'BASE TABLE']
        );

        return array_values(array_map(
            static fn ($r) => (string) ($r->name ?? ''),
            $rows
        ));
    }

    /** @return list<string> */
    private function listTableColumns(string $table): array
    {
        $dbName = (string) DB::getDatabaseName();
        $rows = DB::select(
            'SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
            [$dbName, $table]
        );

        return array_values(array_filter(array_map(
            static fn ($r) => (string) ($r->name ?? ''),
            $rows
        )));
    }

    public function normalizeTime(?string $time): string
    {
        $t = trim((string) $time);
        if (preg_match('/^(\d{1,2}):(\d{2})$/', $t, $m)) {
            return sprintf('%02d:%02d', (int) $m[1] % 24, (int) $m[2] % 60);
        }

        return '00:01';
    }

    private function acquireLock(): bool
    {
        try {
            $row = DB::selectOne('SELECT GET_LOCK(?, 0) AS got', [self::LOCK_NAME]);

            return (int) ($row->got ?? 0) === 1;
        } catch (\Throwable $e) {
            // SQLite / non-MySQL: file lock fallback
            $lockFile = storage_path('app/backups/.backup.lock');
            if (! is_dir(dirname($lockFile))) {
                File::makeDirectory(dirname($lockFile), 0755, true);
            }
            $fh = @fopen($lockFile, 'c+');
            if ($fh === false) {
                return false;
            }
            if (! flock($fh, LOCK_EX | LOCK_NB)) {
                fclose($fh);

                return false;
            }
            // Keep handle in static so it stays locked for process lifetime of request
            $GLOBALS['__aep_backup_lock_fh'] = $fh;

            return true;
        }
    }

    private function releaseLock(): void
    {
        try {
            DB::select('SELECT RELEASE_LOCK(?)', [self::LOCK_NAME]);
        } catch (\Throwable $e) {
            // ignore
        }
        if (! empty($GLOBALS['__aep_backup_lock_fh']) && is_resource($GLOBALS['__aep_backup_lock_fh'])) {
            flock($GLOBALS['__aep_backup_lock_fh'], LOCK_UN);
            fclose($GLOBALS['__aep_backup_lock_fh']);
            unset($GLOBALS['__aep_backup_lock_fh']);
        }
    }
}
