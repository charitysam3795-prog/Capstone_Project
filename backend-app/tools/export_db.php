<?php
// Simple DB exporter: creates SQL dump of all tables (CREATE + INSERTs)
// Usage: php export_db.php

$envPath = __DIR__ . '/../.env';
if (!file_exists($envPath)) {
    fwrite(STDERR, "Could not find .env at $envPath\n");
    exit(2);
}
$env = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
$config = [];
foreach ($env as $line) {
    if (strpos(trim($line), '#') === 0) continue;
    if (!strpos($line, '=')) continue;
    [$k, $v] = explode('=', $line, 2);
    $k = trim($k);
    $v = trim($v);
    // remove surrounding quotes
    $v = preg_replace('/^\"|\"$/', '', $v);
    $v = preg_replace('/^\'"|\'"$/', '', $v);
    $config[$k] = $v;
}
$host = $config['DB_HOST'] ?? '127.0.0.1';
$port = $config['DB_PORT'] ?? '3306';
$dbName = $config['DB_DATABASE'] ?? null;
$user = $config['DB_USERNAME'] ?? 'root';
$pass = $config['DB_PASSWORD'] ?? '';

if (!$dbName) {
    fwrite(STDERR, "DB_DATABASE not found in .env\n");
    exit(2);
}

$ts = date('Ymd_His');
$backupDir = 'C:\\capstone_project\\db_backups';
if (!is_dir($backupDir)) mkdir($backupDir, 0777, true);
$outFile = $backupDir . DIRECTORY_SEPARATOR . "{$dbName}_{$ts}.sql";

try {
    $pdo = new PDO("mysql:host={$host};port={$port};dbname={$dbName};charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    fwrite(STDERR, "PDO connect failed: " . $e->getMessage() . "\n");
    exit(3);
}

$fh = fopen($outFile, 'w');
if (!$fh) { fwrite(STDERR, "Failed to open output file $outFile\n"); exit(4); }

fwrite($fh, "-- Dump of database: $dbName\n");
fwrite($fh, "-- Generated: " . date('c') . "\n\n");

// Get tables
$tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_NUM);
foreach ($tables as $trow) {
    $table = $trow[0];
    fwrite($fh, "--\n-- Table structure for table `$table`\n--\n\n");
    $create = $pdo->query("SHOW CREATE TABLE `{$table}`")->fetch(PDO::FETCH_ASSOC);
    $createSql = $create['Create Table'] ?? $create['Create View'] ?? null;
    if ($createSql) {
        fwrite($fh, "DROP TABLE IF EXISTS `{$table}`;\n");
        fwrite($fh, $createSql . ";\n\n");
    }

    // Fetch rows
    fwrite($fh, "--\n-- Dumping data for table `$table`\n--\n\n");
    $rows = $pdo->query("SELECT * FROM `{$table}`")->fetchAll();
    if (!$rows) {
        fwrite($fh, "\n");
        continue;
    }
    $cols = array_map(function($c){ return "`$c`"; }, array_keys($rows[0]));
    $colList = implode(', ', $cols);
    $batch = [];
    foreach ($rows as $row) {
        $vals = array_map(function($v) use ($pdo) {
            if (is_null($v)) return 'NULL';
            return $pdo->quote($v);
        }, array_values($row));
        $batch[] = '(' . implode(', ', $vals) . ')';
        if (count($batch) >= 200) {
            fwrite($fh, "INSERT INTO `{$table}` ({$colList}) VALUES\n" . implode(",\n", $batch) . ";\n");
            $batch = [];
        }
    }
    if (count($batch) > 0) {
        fwrite($fh, "INSERT INTO `{$table}` ({$colList}) VALUES\n" . implode(",\n", $batch) . ";\n\n");
    } else {
        fwrite($fh, "\n");
    }
}

fclose($fh);
fwrite(STDOUT, "Wrote dump to $outFile\n");
exit(0);
