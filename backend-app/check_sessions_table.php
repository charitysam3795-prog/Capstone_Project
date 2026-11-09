<?php

$host = '127.0.0.1';
$port = 3307;
$dbName = 'capstone_db';
$user = 'root';
$pass = '';

try {
    $pdo = new PDO("mysql:host={$host};port={$port};dbname={$dbName}", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    $found = in_array('sessions', $tables, true);
    echo $found ? "sessions EXISTS\n" : "sessions MISSING\n";

    if ($found) {
        echo "Try SELECT COUNT(*)...\n";
        $info = $pdo->query("SELECT table_name, engine FROM information_schema.tables WHERE table_schema='capstone_db' AND table_name='sessions'")->fetchAll(PDO::FETCH_ASSOC);
        echo "info_schema rows: " . count($info) . "\n";
        foreach ($info as $i) {
            echo "engine=" . ($i['engine'] ?? '') . "\n";
        }

        echo "Try SHOW CREATE TABLE...\n";
        $create = $pdo->query("SHOW CREATE TABLE `sessions`")->fetch(PDO::FETCH_ASSOC);
        echo "create ok\n";
        echo ($create['Create Table'] ?? 'no Create Table') . "\n";
    }
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}

