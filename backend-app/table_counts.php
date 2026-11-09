<?php
$pdo = new PDO('mysql:host=127.0.0.1;port=3307;dbname=capstone_app;charset=utf8mb4', 'root', '', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

$tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
sort($tables);
foreach ($tables as $t) {
    $count = (int)$pdo->query("SELECT COUNT(*) FROM `{$t}`")->fetchColumn();
    echo str_pad($t, 35) . " : {$count}\n";
}

