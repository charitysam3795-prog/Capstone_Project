<?php

require __DIR__ . '/vendor/autoload.php';

$app = require __DIR__ . '/bootstrap/app.php';

// Bootstrap the container so Config is available
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

echo "session.driver=" . (config('session.driver') ?? 'null') . PHP_EOL;
echo "cache.default=" . (config('cache.default') ?? 'null') . PHP_EOL;

