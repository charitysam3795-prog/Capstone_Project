<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('tbl_users')
            ->where(function ($q) {
                $q->where('Email', 'guest@example.com')->orWhere('email', 'guest@example.com');
            })
            ->delete();

        $guestRole = DB::table('tbl_roles')->where('role_name', 'Guest')->first();
        if ($guestRole) {
            DB::table('tbl_role_permissions')->where('role_id', $guestRole->role_id)->delete();
            DB::table('tbl_roles')->where('role_id', $guestRole->role_id)->delete();
        }
    }

    public function down(): void
    {
        // Intentionally empty: guest account is deprecated; do not recreate automatically.
    }
};
