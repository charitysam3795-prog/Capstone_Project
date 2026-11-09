<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class ImportBsit2022Curriculum extends Command
{
    protected $signature = 'curriculum:import-bsit-2022';

    protected $description = 'Replace BSIT Effective SY 2022-2023 curriculum from the CMO No. 25 S. 2015 checklist';

    public function handle(): int
    {
        $script = base_path('scripts/imports/import_bsit_2022_curriculum.php');
        if (! is_file($script)) {
            $this->error("Missing script: {$script}");

            return self::FAILURE;
        }

        // Script bootstraps Laravel itself; run in a subprocess to avoid double-boot.
        $php = PHP_BINARY ?: 'php';
        $cmd = escapeshellarg($php).' '.escapeshellarg($script);
        passthru($cmd, $exit);

        return $exit === 0 ? self::SUCCESS : self::FAILURE;
    }
}
