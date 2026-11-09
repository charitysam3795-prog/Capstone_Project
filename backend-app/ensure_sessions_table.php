<?php

$host = '127.0.0.1';
$port = 3307;
$dbName = 'capstone_db';
$user = 'root';
$pass = '';

$discardSql = "ALTER TABLE `sessions` DISCARD TABLESPACE;";
$dropSql = "DROP TABLE IF EXISTS `sessions`;";
$createSql = <<<SQL
CREATE TABLE `sessions` (
  `id` varchar(255) NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `payload` longtext NOT NULL,
  `last_activity` int unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL;

try {
    $pdo = new PDO("mysql:host={$host};port={$port};dbname={$dbName}", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    // If the previous sessions table is orphaned/corrupted, InnoDB tablespace may exist.
    // Discard it first to allow re-creation.
    try {
        $pdo->exec($discardSql);
    } catch (Throwable $e) {
        // Ignore: table may already be gone/unreadable.
    }
    $pdo->exec($dropSql);
    $pdo->exec($createSql);
    echo "Recreated `sessions` table in `{$dbName}`.\n";
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}

