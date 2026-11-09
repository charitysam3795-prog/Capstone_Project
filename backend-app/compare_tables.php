<?php
$host = '127.0.0.1';
$port = 3307;
$user = 'root';
$pass = '';

function listTables(string $db, string $host, int $port, string $user, string $pass): array {
    $pdo = new PDO("mysql:host={$host};port={$port};dbname={$db}", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    return $tables ?: [];
}

$capstoneDb = 'capstone_db';
$capstoneApp = 'capstone_app';

$dbTables = listTables($capstoneDb, $host, $port, $user, $pass);
$appTables = listTables($capstoneApp, $host, $port, $user, $pass);

sort($dbTables);
sort($appTables);

$missing = array_values(array_diff($dbTables, $appTables));
$extra = array_values(array_diff($appTables, $dbTables));

echo "capstone_db tables: " . count($dbTables) . PHP_EOL;
echo "capstone_app tables: " . count($appTables) . PHP_EOL;

echo PHP_EOL . "Missing in capstone_app (" . count($missing) . "):" . PHP_EOL;
foreach ($missing as $t) {
    echo "- {$t}" . PHP_EOL;
}

echo PHP_EOL . "Extra in capstone_app (" . count($extra) . "):" . PHP_EOL;
foreach ($extra as $t) {
    echo "- {$t}" . PHP_EOL;
}

