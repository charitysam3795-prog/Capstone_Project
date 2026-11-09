<?php
// Copies schema + data from capstone_db -> capstone_app using SHOW CREATE TABLE.
// This avoids needing mysql.exe/mysqldump.

$host = '127.0.0.1';
$port = 3307;
$user = 'root';
$pass = '';
$sourceDb = 'capstone_db';
$targetDb = 'capstone_app';

$conn = new mysqli($host, $user, $pass, '', $port);
$conn->set_charset('utf8mb4');
if ($conn->connect_errno) {
    fwrite(STDERR, "MySQL connection failed: {$conn->connect_error}\n");
    exit(1);
}

// Get table list from source
$tablesRes = $conn->query("SHOW TABLES FROM `{$sourceDb}`");
if (!$tablesRes) {
    fwrite(STDERR, "Failed to list tables in {$sourceDb}: {$conn->error}\n");
    exit(1);
}

$tables = [];
while ($row = $tablesRes->fetch_row()) {
    $tables[] = $row[0];
}

echo "Found " . count($tables) . " tables in {$sourceDb}\n";

// Recreate target DB
$conn->query("DROP DATABASE IF EXISTS `{$targetDb}`");
$conn->query("CREATE DATABASE `{$targetDb}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$conn->select_db($targetDb);

// FK-insensitive setup for inserts later
$conn->query("SET FOREIGN_KEY_CHECKS=0");

// Build dependency graph for CREATE TABLE ordering
// deps[T] = set of referenced tables T depends on existing.
$deps = [];
$created = [];
$ddl = [];

foreach ($tables as $t) {
    $show = $conn->query("SHOW CREATE TABLE `{$sourceDb}`.`{$t}`");
    if (!$show) {
        fwrite(STDERR, "SHOW CREATE TABLE failed for {$t}: {$conn->error}\n");
        exit(1);
    }
    $row = $show->fetch_assoc();
    $createSql = $row['Create Table'] ?? array_values($row)[1] ?? null;
    if (!$createSql) {
        fwrite(STDERR, "Could not extract DDL for {$t}\n");
        exit(1);
    }
    $ddl[$t] = $createSql;

    // Parse referenced tables: REFERENCES `table`
    preg_match_all('/REFERENCES\\s+`([^`]+)`/i', $createSql, $m);
    $refs = $m[1] ?? [];
    $deps[$t] = array_values(array_unique(array_filter($refs, fn($x) => in_array($x, $tables, true))));
}

// Iteratively create tables whose deps are satisfied.
$pending = array_values($tables);
while (count($pending) > 0) {
    $progress = false;
    $nextPending = [];

    foreach ($pending as $t) {
        $need = $deps[$t] ?? [];
        $missing = array_filter($need, fn($d) => !in_array($d, $created, true));
        if (count($missing) === 0) {
            $ok = $conn->query($ddl[$t]);
            if (!$ok) {
                // keep retrying; there may still be FK ordering/type issues
                fwrite(STDERR, "CREATE TABLE failed for {$t}: {$conn->error}\n");
                $nextPending[] = $t;
            } else {
                $created[] = $t;
                $progress = true;
            }
        } else {
            $nextPending[] = $t;
        }
    }

    if (!$progress) {
        // Remaining tables likely in a dependency cycle; just try remaining once with FK checks on.
        $conn->query("SET FOREIGN_KEY_CHECKS=0");
        foreach ($nextPending as $t) {
            $ok = $conn->query($ddl[$t]);
            if ($ok) {
                $created[] = $t;
            } else {
                fwrite(STDERR, "CREATE TABLE (cycle retry) failed for {$t}: {$conn->error}\n");
            }
        }
        break;
    }

    $pending = $nextPending;
}

echo "Created " . count($created) . " tables in {$targetDb}\n";

// Copy data (disable FK checks)
$conn->query("SET FOREIGN_KEY_CHECKS=0");

foreach ($tables as $t) {
    // Get rows from source
    $sourceConn = new mysqli($host, $user, $pass, $sourceDb, $port);
    $sourceConn->set_charset('utf8mb4');
    $sourceConn->query("SET FOREIGN_KEY_CHECKS=0");

    $rowsRes = $sourceConn->query("SELECT * FROM `{$t}`");
    if (!$rowsRes) {
        fwrite(STDERR, "SELECT failed for {$t}: {$sourceConn->error}\n");
        continue;
    }

    // Column list
    $colsRes = $sourceConn->query("SHOW COLUMNS FROM `{$t}`");
    $cols = [];
    while ($c = $colsRes->fetch_assoc()) {
        $cols[] = $c['Field'];
    }

    if (count($cols) === 0) {
        $sourceConn->close();
        continue;
    }

    while ($row = $rowsRes->fetch_assoc()) {
        $colList = '`' . implode('`,`', $cols) . '`';
        $values = [];
        foreach ($cols as $c) {
            $val = $row[$c];
            if ($val === null) {
                $values[] = 'NULL';
            } else {
                $values[] = "'" . $conn->real_escape_string((string)$val) . "'";
            }
        }
        $valueList = implode(',', $values);
        $insertSql = "INSERT INTO `{$t}` ({$colList}) VALUES ({$valueList})";
        $conn->query($insertSql);
    }

    $sourceConn->close();
    echo "Copied data for {$t}\n";
}

$conn->query("SET FOREIGN_KEY_CHECKS=1");

echo "Copy completed {$sourceDb} -> {$targetDb}\n";

