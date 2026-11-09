<?php

namespace App\Support;

use App\Models\ElectiveSlot;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ElectiveSlotPrerequisite
{
    public static function hasPrerequisiteColumn(): bool
    {
        return Schema::hasColumn('tbl_elective_slot', 'prerequisite_slot_id');
    }

    /**
     * @return list<array{elective_slot_id: int, slot_name: string|null}>
     */
    public static function prerequisiteSlots(?ElectiveSlot $slot): array
    {
        if (! $slot || ! self::hasPrerequisiteColumn()) {
            return [];
        }

        $slot->loadMissing('prerequisiteSlot');
        $pre = $slot->prerequisiteSlot;
        if (! $pre) {
            return [];
        }

        return [[
            'elective_slot_id' => (int) $pre->elective_slot_id,
            'slot_name' => $pre->slot_name,
        ]];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function prerequisiteRows(?ElectiveSlot $slot): array
    {
        $slots = self::prerequisiteSlots($slot);
        $rows = [];
        foreach ($slots as $p) {
            $name = $p['slot_name'] ?? null;
            $rows[] = [
                'elective_slot_id' => $p['elective_slot_id'],
                'prerequisite_elective_slot_id' => $p['elective_slot_id'],
                'slot_name' => $name,
                'rule_label' => $name,
                'requisite_type' => 'prerequisite',
            ];
        }

        return $rows;
    }

    /** IT Electives 2, 3, and 4 require IT Electives 1 (same program). */
    public static function syncItElectiveChainForProgram(int $programId): void
    {
        if (! self::hasPrerequisiteColumn()) {
            return;
        }

        $elec1Id = DB::table('tbl_elective_slot')
            ->where('program_id', $programId)
            ->where('slot_name', 'IT Electives 1')
            ->value('elective_slot_id');

        if (! $elec1Id) {
            return;
        }

        DB::table('tbl_elective_slot')
            ->where('program_id', $programId)
            ->whereIn('slot_name', ['IT Electives 2', 'IT Electives 3', 'IT Electives 4'])
            ->update(['prerequisite_slot_id' => (int) $elec1Id]);
    }

    /** Apply chain for every program that has IT Electives 1. */
    public static function syncAllItElectiveChains(): int
    {
        if (! self::hasPrerequisiteColumn()) {
            return 0;
        }

        $programIds = DB::table('tbl_elective_slot')
            ->where('slot_name', 'IT Electives 1')
            ->pluck('program_id')
            ->unique()
            ->filter();

        $count = 0;
        foreach ($programIds as $programId) {
            self::syncItElectiveChainForProgram((int) $programId);
            $count++;
        }

        return $count;
    }
}
