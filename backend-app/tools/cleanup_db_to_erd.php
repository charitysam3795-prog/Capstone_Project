<?php
// DANGER: DESTRUCTIVE LEGACY TOOL.
// This script drops database tables and its allowlist may not include newer schema changes.
// Back up the database and review the complete allowlist before running it manually.
// Cleanup script: drop all tables that are NOT part of the new ERD (plus core Laravel system tables).
// Usage (from project root): php backend-app/tools/cleanup_db_to_erd.php

$envPath = __DIR__ . '/../.env';
if (!file_exists($envPath)) {
    fwrite(STDERR, "Could not find .env at $envPath\n");
    exit(2);
}

$env = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
$config = [];
foreach ($env as $line) {
    if (strpos(trim($line), '#') === 0) {
        continue;
    }
    if (!strpos($line, '=')) {
        continue;
    }
    [$k, $v] = explode('=', $line, 2);
    $k = trim($k);
    $v = trim($v);
    // remove surrounding quotes
    $v = preg_replace('/^\"|\"$/', '', $v);
    $v = preg_replace('/^\'|\'$/', '', $v);
    $config[$k] = $v;
}

$host   = $config['DB_HOST'] ?? '127.0.0.1';
$port   = $config['DB_PORT'] ?? '3306';
$dbName = $config['DB_DATABASE'] ?? null;
$user   = $config['DB_USERNAME'] ?? 'root';
$pass   = $config['DB_PASSWORD'] ?? '';

if (!$dbName) {
    fwrite(STDERR, "DB_DATABASE not found in .env\n");
    exit(2);
}

try {
    $pdo = new PDO(
        "mysql:host={$host};port={$port};dbname={$dbName};charset=utf8mb4",
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
} catch (PDOException $e) {
    fwrite(STDERR, "PDO connect failed: " . $e->getMessage() . "\n");
    exit(3);
}

// Tables that MUST be kept (system + ERD tables)
$systemTables = [
    'migrations',
    'cache',
    'cache_locks',
    'failed_jobs',
    'jobs',
    'job_batches',
    'password_reset_tokens',
    'sessions',
];

$erdTables = [
    // Lookup / core tables
    'tbl_campus',
    'tbl_semester',
    'tbl_academic_year',
    'year_level',
    'tbl_departments',
    'tbl_roles',

    // User / program / track
    'tbl_users',
    'tbl_program',
    'tbl_student_profile',
    'tbl_track',
    'tbl_dean_profile',
    'tbl_faculty_profile',

    // Subjects / curriculum / requisites
    'tbl_subjects',
    'tbl_prerequisite',
    'curriculum',
    'tbl_curriculum_header',

    // Evaluation / offered / elective
    'tbl_evaluation',
    'tbl_offered_subject',
    'tbl_elective_subject',
];

$keepTables = array_map('strtolower', array_merge($systemTables, $erdTables));

$stmt   = $pdo->query('SHOW TABLES');
$tables = $stmt->fetchAll(PDO::FETCH_NUM);

if (!$tables) {
    fwrite(STDOUT, "No tables found in database {$dbName}\n");
    exit(0);
}

$dbNameKey = 'Tables_in_' . $dbName; // e.g. Tables_in_capstone_db
// Some PDO configs just give numeric indexes; handle both.

$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

foreach ($tables as $row) {
    $table = null;
    if (isset($row[0])) {
        $table = $row[0];
    } elseif (isset($row[$dbNameKey])) {
        $table = $row[$dbNameKey];
    }

    if (!$table) {
        continue;
    }

    $lower = strtolower($table);
    if (!in_array($lower, $keepTables, true)) {
        fwrite(STDOUT, "Dropping table {$table} (not in ERD list)\n");
        $pdo->exec("DROP TABLE IF EXISTS `{$table}`");
    } else {
        fwrite(STDOUT, "Keeping table {$table}\n");
    }
}

$pdo->exec('SET FOREIGN_KEY_CHECKS=1');

fwrite(STDOUT, "Database cleanup complete. Only ERD + system tables remain.\n");
exit(0);


