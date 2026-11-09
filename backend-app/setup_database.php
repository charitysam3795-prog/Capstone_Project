<?php

/**
 * Database Setup Script
 * This script creates the database if it doesn't exist, then runs migrations and seeders
 * 
 * Usage: php setup_database.php
 */

require __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Config;

echo "Setting up database...\n";

$databaseName = env('DB_DATABASE', 'capstone_db');
$host = env('DB_HOST', '127.0.0.1');
$username = env('DB_USERNAME', 'root');
$password = env('DB_PASSWORD', '');

try {
    // Connect to MySQL server without selecting a database
    $pdo = new PDO(
        "mysql:host={$host}",
        $username,
        $password,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // Create database if it doesn't exist
    echo "Creating database '{$databaseName}' if it doesn't exist...\n";
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$databaseName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    echo "✓ Database ready\n\n";

    // Now run migrations
    echo "Running migrations...\n";
    $exitCode = Artisan::call('migrate', ['--force' => true]);
    
    if ($exitCode === 0) {
        echo "✓ Migrations completed\n\n";
    } else {
        echo "✗ Migration failed\n";
        exit(1);
    }

    // Run seeders
    echo "Running seeders...\n";
    $exitCode = Artisan::call('db:seed', ['--force' => true]);
    
    if ($exitCode === 0) {
        echo "✓ Seeders completed\n\n";
    } else {
        echo "✗ Seeding failed\n";
        exit(1);
    }

    echo "✓ Database setup complete!\n";
    echo "Admin credentials: admin@example.com / admin123\n";

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
    echo "Please make sure MySQL is running and your credentials in .env are correct.\n";
    exit(1);
}

