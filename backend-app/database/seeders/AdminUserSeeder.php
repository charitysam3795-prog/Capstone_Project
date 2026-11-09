<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\TblUser;
use App\Models\Role;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        // Create Admin role if it doesn't exist
        $adminRole = Role::firstOrCreate(
            ['role_name' => 'Admin'],
            [
                'access_level' => 10,
                'description' => 'Administrator with full access'
            ]
        );

        // Keep admin credentials deterministic. Support DB columns Email/Password (or email/password).
        $adminEmail = 'admin@example.com';
        $adminPasswordHash = Hash::make('admin123');
        $user = TblUser::whereEmail($adminEmail)->first();
        if ($user) {
            $update = [
                'Password' => $adminPasswordHash,
                'Email' => $adminEmail,
                'status' => 'active',
                'use_custom_permissions' => false,
                'password_changed_at' => now(),
                'failed_login_attempts' => 0,
                'locked_until' => null,
            ];
            DB::table('tbl_users')->where('user_id', $user->user_id)->update($update);
        } else {
            TblUser::create([
                'email' => $adminEmail,
                'password' => 'admin123',
                'role_id' => $adminRole->role_id,
                'status' => 'active',
            ]);
        }

        $this->command->info('Admin user created: admin@example.com / admin123');
    }
}
