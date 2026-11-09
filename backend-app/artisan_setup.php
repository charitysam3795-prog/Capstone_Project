#!/usr/bin/env php
<?php

/**
 * Setup Script - Creates database and runs migrations/seeders
 * Run: php artisan setup
 * Or: php artisan_setup.php
 */

define('LARAVEL_START', microtime(true));

require __DIR__.'/vendor/autoload.php';

$app = require_once __DIR__.'/bootstrap/app.php';

$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);

$databaseName = env('DB_DATABASE', 'capstone_db');
$host = env('DB_HOST', '127.0.0.1');
$username = env('DB_USERNAME', 'root');
$password = env('DB_PASSWORD', '');

echo "Setting up database: {$databaseName}\n";

try {
    // Connect to MySQL server without selecting a database
    $pdo = new PDO(
        "mysql:host={$host}",
        $username,
        $password,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // Create database if it doesn't exist
    echo "Creating database if it doesn't exist...\n";
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$databaseName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    echo "✓ Database ready\n\n";

} catch (PDOException $e) {
    echo "Error connecting to MySQL: " . $e->getMessage() . "\n";
    echo "Please make sure MySQL is running and your .env file has correct credentials.\n";
    exit(1);
}

// Run migrations
echo "Running migrations...\n";
$exitCode = $kernel->call('migrate', ['--force' => true]);

if ($exitCode !== 0) {
    echo "✗ Migration failed\n";
    exit(1);
}
echo "✓ Migrations completed\n\n";

// Run seeders
echo "Running seeders...\n";
$exitCode = $kernel->call('db:seed', ['--force' => true]);

if ($exitCode !== 0) {
    echo "✗ Seeding failed\n";
    exit(1);
}
echo "✓ Seeders completed\n\n";

echo "✓ Setup complete!\n";
echo "Admin login: admin@example.com / admin123\n";
echo "You can now run: php artisan serve\n";

