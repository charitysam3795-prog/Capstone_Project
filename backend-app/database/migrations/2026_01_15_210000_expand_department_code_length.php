<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE `tbl_departments` MODIFY `department_code` VARCHAR(255) NOT NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE `tbl_departments` MODIFY `department_code` VARCHAR(20) NOT NULL');
    }
};
