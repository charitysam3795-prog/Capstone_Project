<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;

class DefaultPermissionsSeeder extends Seeder
{
    public function run(): void
    {
        Permission::where('permission_name', 'Sample Module Access')->delete();

        $permissions = [
            ['permission_name' => 'Admin Dashboard', 'category' => 'Dashboard', 'description' => 'Display admin statistics and overview'],
            ['permission_name' => 'User Management', 'category' => 'User Management', 'description' => 'Create, update, or deactivate system users'],
            ['permission_name' => 'Student Management', 'category' => 'Students', 'description' => 'Manage student accounts and profiles'],
            ['permission_name' => 'Import / Export', 'category' => 'Students', 'description' => 'Import SIS files and export student/staff directory CSV'],
            ['permission_name' => 'Role Settings', 'category' => 'User Management', 'description' => 'Manage roles and assign permissions to roles'],
            ['permission_name' => 'Lookup Data', 'category' => 'User Management', 'description' => 'Manage programs, subjects, campus, and other lookup data'],
            ['permission_name' => 'Curriculum Management', 'category' => 'Curriculum', 'description' => 'View and manage curriculum and subjects'],
            ['permission_name' => 'Credit Evaluation', 'category' => 'Evaluation', 'description' => 'Transfer / advanced standing credit (Dean portal and Academic Management)'],
            ['permission_name' => 'Student Evaluation', 'category' => 'Evaluation', 'description' => 'Student curriculum evaluation and grades (Faculty and Dean portals)'],
            ['permission_name' => 'Evaluation Reports', 'category' => 'Evaluation', 'description' => 'View evaluation reports and analytics'],
            ['permission_name' => 'Elective Slots', 'category' => 'Curriculum', 'description' => 'Manage elective slots and assignments'],
            ['permission_name' => 'System Management', 'category' => 'System', 'description' => 'Manage permissions and system settings'],
            ['permission_name' => 'Audit Logs', 'category' => 'System', 'description' => 'View audit logs'],
        ];

        foreach ($permissions as $p) {
            Permission::updateOrCreate(
                ['permission_name' => $p['permission_name']],
                [
                    'category' => $p['category'] ?? null,
                    'description' => $p['description'] ?? null,
                ]
            );
        }

        $adminRole = Role::where('role_name', 'Admin')->first();
        if ($adminRole) {
            $ids = Permission::pluck('permission_id')->all();
            foreach ($ids as $permissionId) {
                RolePermission::firstOrCreate(
                    [
                        'role_id' => $adminRole->role_id,
                        'permission_id' => $permissionId,
                    ]
                );
            }
        }

        $this->command->info('Default permissions seeded.');
    }
}
