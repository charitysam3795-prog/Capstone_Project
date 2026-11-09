<?php
$pdo = new PDO('mysql:host=127.0.0.1;port=3307;dbname=capstone_app;charset=utf8mb4', 'root', '', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

$tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
foreach ($tables as $t) {
    $count = (int)$pdo->query("SELECT COUNT(*) FROM `{$t}`")->fetchColumn();
    if ($count > 0) {
        continue;
    }
    echo "\n=== {$t} ===\n";
    $cols = $pdo->query("SHOW COLUMNS FROM `{$t}`")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($cols as $c) {
        echo $c['Field'] . " | " . $c['Type'] . " | null=" . $c['Null'] . " | key=" . $c['Key'] . " | default=" . ($c['Default'] ?? 'NULL') . "\n";
    }
}

