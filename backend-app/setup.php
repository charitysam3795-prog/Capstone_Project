<?php

/**
 * Database Setup Script
 * Creates the database and runs migrations/seeders automatically
 * 
 * Usage: php setup.php
 */

define('LARAVEL_START', microtime(true));

require __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$databaseName = env('DB_DATABASE', 'capstone_db');
$host = env('DB_HOST', '127.0.0.1');
$username = env('DB_USERNAME', 'root');
$password = env('DB_PASSWORD', '');

echo "\n=== Database Setup Script ===\n\n";
echo "Database: {$databaseName}\n";
echo "Host: {$host}\n\n";

try {
    // Connect to MySQL server without selecting a database
    $pdo = new PDO(
        "mysql:host={$host}",
        $username,
        $password,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // Create database if it doesn't exist
    echo "Creating database '{$databaseName}'...\n";
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$databaseName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    echo "✓ Database created/verified\n\n";

    // Run migrations
    echo "Running migrations...\n";
    $exitCode = $kernel->call('migrate', ['--force' => true]);
    
    if ($exitCode === 0) {
        echo "✓ Migrations completed\n\n";
    } else {
        echo "✗ Migration failed (exit code: {$exitCode})\n";
        exit(1);
    }

    // Run seeders
    echo "Running seeders...\n";
    $exitCode = $kernel->call('db:seed', ['--force' => true]);
    
    if ($exitCode === 0) {
        echo "✓ Seeders completed\n\n";
    } else {
        echo "✗ Seeding failed (exit code: {$exitCode})\n";
        exit(1);
    }

    echo "=== Setup Complete! ===\n\n";
    echo "Admin Login Credentials:\n";
    echo "  Email: admin@example.com\n";
    echo "  Password: admin123\n\n";
    echo "You can now run: php artisan serve\n";
    echo "Then visit: http://localhost:8000\n\n";

} catch (PDOException $e) {
    echo "\n✗ Error: " . $e->getMessage() . "\n\n";
    echo "Please check:\n";
    echo "  1. MySQL/MariaDB is running\n";
    echo "  2. Your .env file has correct DB credentials\n";
    echo "  3. Your MySQL user has CREATE DATABASE privileges\n\n";
    exit(1);
}

