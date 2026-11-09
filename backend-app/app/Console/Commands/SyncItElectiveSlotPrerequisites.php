<?php

namespace App\Console\Commands;

use App\Support\ElectiveSlotPrerequisite;
use Illuminate\Console\Command;

class SyncItElectiveSlotPrerequisites extends Command
{
    protected $signature = 'electives:sync-it-prerequisite-chain {program_id? : Optional program_id; omit to sync all}';

    protected $description = 'Set IT Electives 2/3/4 prerequisite slot to IT Electives 1 per program';

    public function handle(): int
    {
        $programId = $this->argument('program_id');
        if ($programId !== null && $programId !== '') {
            ElectiveSlotPrerequisite::syncItElectiveChainForProgram((int) $programId);
            $this->info('Synced IT elective prerequisite chain for program '.(int) $programId);

            return self::SUCCESS;
        }

        $n = ElectiveSlotPrerequisite::syncAllItElectiveChains();
        $this->info("Synced IT elective prerequisite chains for {$n} program(s).");

        return self::SUCCESS;
    }
}
