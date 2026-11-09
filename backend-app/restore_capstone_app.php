<?php
// Restores a phpMyAdmin SQL dump into `capstone_app`.
// We avoid `mysql.exe` and `multi_query()` (which can stop/skips statements)
// by executing the dump statement-by-statement.

$dumpFile = __DIR__ . '/../db_backups/capstone_db (2) 20260124_checked_by_sirmac.sql';
$host = '127.0.0.1';
$port = 3307;
$user = 'root';
$pass = '';
$dbName = 'capstone_app';

if (!file_exists($dumpFile)) {
    fwrite(STDERR, "Dump file not found: {$dumpFile}\n");
    exit(1);
}

$sql = file_get_contents($dumpFile);
if ($sql === false || trim($sql) === '') {
    fwrite(STDERR, "Failed to read dump file.\n");
    exit(1);
}

$conn = new mysqli($host, $user, $pass, '', $port);
$conn->set_charset('utf8mb4');
if ($conn->connect_errno) {
    fwrite(STDERR, "MySQL connection failed: {$conn->connect_error}\n");
    exit(1);
}

// Drop + recreate target DB to ensure a clean import.
$conn->query("DROP DATABASE IF EXISTS `{$dbName}`");
$conn->query("CREATE DATABASE `{$dbName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$conn->select_db($dbName);

// Disable FK checks during restore.
$conn->query("SET FOREIGN_KEY_CHECKS=0");
$conn->query("SET UNIQUE_CHECKS=0");

// Split SQL into statements by executing when the current line ends with `;`.
// This works well for phpMyAdmin table dumps (no stored procedures/functions).
$total = 0;
$errors = 0;
$buffer = '';

$handle = fopen($dumpFile, 'r');
if ($handle === false) {
    fwrite(STDERR, "Failed to open dump file for reading.\n");
    exit(1);
}

while (($line = fgets($handle)) !== false) {
    $buffer .= $line;

    // Execute at end-of-statement
    if (preg_match('/;\s*$/', $line)) {
        $stmt = trim($buffer);
        $buffer = '';

        // skip empty / comment-only statements
        if ($stmt === '') {
            continue;
        }

        // Remove leading comment lines that phpMyAdmin includes before each statement.
        // (Example: `-- Table structure for table ...` before `CREATE TABLE ...`.)
        $stmt = preg_replace('/^\s*--.*$/m', '', $stmt);
        $stmt = preg_replace('/^\s*#.*$/m', '', $stmt);
        $stmt = preg_replace('/^\s*\/\*.*\*\/\s*$/m', '', $stmt);
        $stmt = trim($stmt);

        if ($stmt === '') {
            continue;
        }

        $total++;
        $ok = $conn->query($stmt);
        if (!$ok) {
            $errors++;
            if ($errors <= 25) {
                fwrite(STDERR, "SQL error ({$errors}): {$conn->errno} {$conn->error}\n");
                fwrite(STDERR, "Preview: " . substr($stmt, 0, 220) . "\n\n");
            }
        }
    }
}

fclose($handle);

$conn->query("SET UNIQUE_CHECKS=1");
$conn->query("SET FOREIGN_KEY_CHECKS=1");

echo "Restore completed into `{$dbName}`. Statements={$total}, Errors={$errors}\n";

