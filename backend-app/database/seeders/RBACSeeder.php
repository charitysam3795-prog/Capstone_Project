<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Schema;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\YearLevel;
use App\Support\LookupResourcePermissions;

class RBACSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Define all system permissions by category
        $permissions = [
            // User Management
            [
                'permission_name' => 'users.view',
                'category' => 'User Management',
                'description' => 'View user list and details',
            ],
            [
                'permission_name' => 'users.create',
                'category' => 'User Management',
                'description' => 'Create new users',
            ],
            [
                'permission_name' => 'users.edit',
                'category' => 'User Management',
                'description' => 'Edit user information',
            ],
            [
                'permission_name' => 'users.delete',
                'category' => 'User Management',
                'description' => 'Delete users',
            ],
            [
                'permission_name' => 'users.manage_roles',
                'category' => 'User Management',
                'description' => 'Assign roles to users',
            ],

            // Role Management
            [
                'permission_name' => 'roles.view',
                'category' => 'Role Management',
                'description' => 'View roles and permissions',
            ],
            [
                'permission_name' => 'roles.create',
                'category' => 'Role Management',
                'description' => 'Create new roles',
            ],
            [
                'permission_name' => 'roles.edit',
                'category' => 'Role Management',
                'description' => 'Edit roles and permissions',
            ],
            [
                'permission_name' => 'roles.delete',
                'category' => 'Role Management',
                'description' => 'Delete roles',
            ],

            // Curriculum Management
            [
                'permission_name' => 'curriculum.view',
                'category' => 'Curriculum Management',
                'description' => 'View curriculum',
            ],
            [
                'permission_name' => 'curriculum.create',
                'category' => 'Curriculum Management',
                'description' => 'Create curriculum entries',
            ],
            [
                'permission_name' => 'curriculum.edit',
                'category' => 'Curriculum Management',
                'description' => 'Edit curriculum',
            ],
            [
                'permission_name' => 'curriculum.delete',
                'category' => 'Curriculum Management',
                'description' => 'Delete curriculum entries',
            ],
            [
                'permission_name' => 'curriculum.approve',
                'category' => 'Curriculum Management',
                'description' => 'Approve curriculum changes',
            ],

            // Subject Management
            [
                'permission_name' => 'subjects.view',
                'category' => 'Subjects',
                'description' => 'View subjects',
            ],
            [
                'permission_name' => 'subjects.create',
                'category' => 'Subjects',
                'description' => 'Create subjects',
            ],
            [
                'permission_name' => 'subjects.edit',
                'category' => 'Subjects',
                'description' => 'Edit subjects',
            ],
            [
                'permission_name' => 'subjects.delete',
                'category' => 'Subjects',
                'description' => 'Delete subjects',
            ],

            // Prerequisite Management
            [
                'permission_name' => 'prerequisites.view',
                'category' => 'Prerequisites',
                'description' => 'View prerequisites',
            ],
            [
                'permission_name' => 'prerequisites.manage',
                'category' => 'Prerequisites',
                'description' => 'Manage prerequisites and corequisites',
            ],

            // Student Management
            [
                'permission_name' => 'students.view',
                'category' => 'Students',
                'description' => 'View student profiles',
            ],
            [
                'permission_name' => 'students.create',
                'category' => 'Students',
                'description' => 'Create student profiles',
            ],
            [
                'permission_name' => 'students.edit',
                'category' => 'Students',
                'description' => 'Edit student profiles',
            ],
            [
                'permission_name' => 'students.enroll',
                'category' => 'Students',
                'description' => 'Manage student enrollments',
            ],
            [
                'permission_name' => 'data.import',
                'category' => 'Import / Export',
                'description' => 'Import SIS / CSV data files',
            ],
            [
                'permission_name' => 'data.export',
                'category' => 'Import / Export',
                'description' => 'Export directory data as CSV',
            ],

            // Student evaluation (curriculum / grades — Faculty & Dean “Student Evaluation” workspace)
            [
                'permission_name' => 'evaluation.view',
                'category' => 'Student Evaluation',
                'description' => 'View student evaluations',
            ],
            [
                'permission_name' => 'evaluation.create',
                'category' => 'Student Evaluation',
                'description' => 'Create student evaluations',
            ],
            [
                'permission_name' => 'evaluation.edit',
                'category' => 'Student Evaluation',
                'description' => 'Edit student evaluations',
            ],
            [
                'permission_name' => 'evaluation.approve',
                'category' => 'Student Evaluation',
                'description' => 'Approve student evaluations',
            ],
            [
                'permission_name' => 'evaluation.promote',
                'category' => 'Student Evaluation',
                'description' => 'Promote students to the next semester (no grade editing)',
            ],
            [
                'permission_name' => 'evaluation.export_pdf',
                'category' => 'Student Evaluation',
                'description' => 'Download academic evaluation PDF (graded terms)',
            ],

            // Credit evaluation (transfer / advanced standing — Dean portal & Academic Management; not on Faculty portal)
            [
                'permission_name' => 'credit_eval.view',
                'category' => 'Credit Evaluation',
                'description' => 'View transfer credit evaluations',
            ],
            [
                'permission_name' => 'credit_eval.create',
                'category' => 'Credit Evaluation',
                'description' => 'Create transfer credit evaluations',
            ],
            [
                'permission_name' => 'credit_eval.approve',
                'category' => 'Credit Evaluation',
                'description' => 'Approve transfer credit evaluations',
            ],

            // Elective Slots
            [
                'permission_name' => 'electives.view',
                'category' => 'Electives',
                'description' => 'View elective slots',
            ],
            [
                'permission_name' => 'electives.manage',
                'category' => 'Electives',
                'description' => 'Manage elective slots and assignments',
            ],

            // Faculty portal (profile; class/grade panels removed from UI — use Student Evaluation above)
            [
                'permission_name' => 'faculty.view',
                'category' => 'Faculty Portal',
                'description' => 'My Profile (faculty / adviser portal)',
            ],
            [
                'permission_name' => 'faculty.manage',
                'category' => 'Faculty Portal',
                'description' => 'Manage faculty assignments (admin)',
            ],

            // Academic Evaluation (dean portal — view vs high-impact approvals)
            [
                'permission_name' => 'dean.view',
                'category' => 'Academic Evaluation',
                'description' => 'View dean portal and academic evaluation tools',
            ],
            [
                'permission_name' => 'dean.approve',
                'category' => 'Academic Evaluation',
                'description' => 'High-impact academic approvals (e.g. delete evaluations, remove stored records)',
            ],

            // Lookup Data
            [
                'permission_name' => 'lookup.view',
                'category' => 'Lookup Data',
                'description' => 'View lookup data',
            ],
            [
                'permission_name' => 'lookup.manage',
                'category' => 'Lookup Data',
                'description' => 'Manage all lookup data areas (legacy / bulk)',
            ],

            // Reports
            [
                'permission_name' => 'reports.view',
                'category' => 'Reports',
                'description' => 'View reports',
            ],
            [
                'permission_name' => 'reports.generate',
                'category' => 'Reports',
                'description' => 'Generate reports',
            ],

            // Audit Logs
            [
                'permission_name' => 'audit.view',
                'category' => 'Audit',
                'description' => 'View audit logs',
            ],

            // System
            [
                'permission_name' => 'system.settings',
                'category' => 'System',
                'description' => 'Manage system settings',
            ],
            [
                'permission_name' => 'system.backup',
                'category' => 'System',
                'description' => 'Perform system backups',
            ],
        ];

        foreach (LookupResourcePermissions::SLUGS as $slug => $label) {
            $permissions[] = [
                'permission_name' => "lookup.{$slug}.view",
                'category' => 'Lookup Data',
                'description' => "View {$label} (lookup data)",
            ];
            $permissions[] = [
                'permission_name' => "lookup.{$slug}.manage",
                'category' => 'Lookup Data',
                'description' => "Manage {$label} (lookup data)",
            ];
        }

        // Insert or refresh labels/categories (Role Settings stays in sync with UI modules)
        foreach ($permissions as $permission) {
            Permission::updateOrCreate(
                ['permission_name' => $permission['permission_name']],
                [
                    'category' => $permission['category'],
                    'description' => $permission['description'],
                ]
            );
        }

        $this->command->info('Created ' . count($permissions) . ' permissions');

        // Assign all permissions to Admin role
        $adminRole = Role::where('role_name', 'Admin')->first();
        if ($adminRole) {
            $allPermissionIds = Permission::pluck('permission_id')->toArray();
            
            // Clear existing permissions
            RolePermission::where('role_id', $adminRole->role_id)->delete();
            
            // Assign all permissions
            $rolePermissions = [];
            foreach ($allPermissionIds as $permissionId) {
                $rolePermissions[] = [
                    'role_id' => $adminRole->role_id,
                    'permission_id' => $permissionId,
                ];
            }
            
            if (!empty($rolePermissions)) {
                RolePermission::insert($rolePermissions);
            }
            
            $this->command->info('Assigned all permissions to Admin role');
        }

        // Assign default permissions to other roles
        $this->assignDefaultRolePermissions();
        $this->seedRoleEvaluationYearLevelScopes();
    }

    /**
     * Restrict curriculum evaluation roster by student year_level_id (null on role = all years).
     * Uses substring match on year_level.year_level so it survives varying labels in seed data.
     */
    private function seedRoleEvaluationYearLevelScopes(): void
    {
        if (! Schema::hasColumn('tbl_roles', 'evaluation_year_level_ids')) {
            return;
        }

        $levels = YearLevel::query()->orderBy('year_level_id')->get(['year_level_id', 'year_level']);
        if ($levels->isEmpty()) {
            return;
        }

        $matchIds = function (array $substrings) use ($levels): array {
            if ($substrings === []) {
                return [];
            }
            $ids = [];
            foreach ($levels as $row) {
                $hay = mb_strtolower((string) ($row->year_level ?? ''));
                foreach ($substrings as $sub) {
                    if ($sub !== '' && str_contains($hay, mb_strtolower($sub))) {
                        $ids[] = (int) $row->year_level_id;
                        break;
                    }
                }
            }

            return array_values(array_unique($ids));
        };

        $firstYear = $matchIds(['1st', 'first year']);
        $programHead = array_values(array_unique(array_merge(
            $firstYear,
            $matchIds(['3rd', 'third year'])
        )));

        $secondYear = $matchIds(['2nd', 'second year']);

        $map = [
            'Dean' => null,
            'Program Head' => $programHead === [] ? null : $programHead,
            'Secretary' => $secondYear === [] ? null : $secondYear,
            'Adviser' => $firstYear === [] ? null : $firstYear,
        ];

        foreach ($map as $roleName => $ids) {
            $role = Role::where('role_name', $roleName)->first();
            if (! $role) {
                continue;
            }
            $role->evaluation_year_level_ids = $ids;
            $role->save();
        }

        $this->command->info('Applied default evaluation year-level scopes to roles (Dean = all years).');
    }

    /**
     * Assign default permissions to non-admin roles
     */
    private function assignDefaultRolePermissions(): void
    {
        $rolePermissions = [
            'Dean' => [
                'users.view',
                'Student Evaluation',
                'Evaluation Reports',
                'curriculum.view',
                'curriculum.approve',
                'subjects.view',
                'prerequisites.view',
                'students.view',
                'data.export',
                'evaluation.view',
                'evaluation.approve',
                'evaluation.promote',
                'evaluation.export_pdf',
                'credit_eval.view',
                'credit_eval.create',
                'credit_eval.approve',
                'electives.view',
                'faculty.view',
                'dean.view',
                'dean.approve',
                'reports.view',
                'reports.generate',
            ],
            // Adviser: view curriculum evaluation and promote students; no grade entry by default.
            // (Evaluator role was merged into Adviser and voided.)
            'Adviser' => [
                'Student Evaluation',
                'evaluation.view',
                'evaluation.promote',
                'evaluation.export_pdf',
                'students.edit',
                'faculty.view',
                'curriculum.view',
            ],
            'Student' => [
                'curriculum.view',
                'subjects.view',
                'students.view',
            ],
            // Sidebar defaults match Program Head portal; Lookup Data = Offered subjects only
            // (Curriculum headers stays under Administration via its own permission).
            'Program Head' => [
                'Student Evaluation',
                'Evaluation Reports',
                'curriculum.view',
                'curriculum.approve',
                'curriculum.create',
                'curriculum.edit',
                'students.view',
                'students.edit',
                'Import / Export',
                'data.import',
                'data.export',
                'evaluation.view',
                'evaluation.create',
                'evaluation.edit',
                'evaluation.approve',
                'evaluation.promote',
                'evaluation.export_pdf',
                'subjects.view',
                'subjects.create',
                'subjects.edit',
                'prerequisites.view',
                'prerequisites.manage',
                'electives.view',
                'electives.manage',
                'reports.view',
                'reports.generate',
                'faculty.view',
                'lookup.curriculum_headers.view',
                'lookup.curriculum_headers.manage',
                'lookup.offered_subjects.view',
                'lookup.offered_subjects.manage',
            ],
            'Secretary' => array_merge([
                'Student Management',
                'Import / Export',
                'data.import',
                'data.export',
                'Student Evaluation',
                'Evaluation Reports',
                'reports.view',
                'reports.generate',
                'users.view',
                'users.create',
                'users.edit',
                'students.view',
                'students.edit',
                'students.create',
                'curriculum.view',
                'credit_eval.view',
                'credit_eval.create',
                'evaluation.view',
                'evaluation.create',
                'evaluation.edit',
                'evaluation.approve',
                'evaluation.promote',
                'evaluation.export_pdf',
                'faculty.view',
            ], LookupResourcePermissions::allGranularPermissionNames()),
        ];

        foreach ($rolePermissions as $roleName => $permissionNames) {
            $role = Role::where('role_name', $roleName)->first();
            if (!$role) {
                continue;
            }

            $permissionIds = Permission::whereIn('permission_name', $permissionNames)
                ->pluck('permission_id')
                ->toArray();

            // Clear existing permissions for this role
            RolePermission::where('role_id', $role->role_id)->delete();

            // Assign new permissions
            $rolePermissionData = [];
            foreach ($permissionIds as $permissionId) {
                $rolePermissionData[] = [
                    'role_id' => $role->role_id,
                    'permission_id' => $permissionId,
                ];
            }

            if (!empty($rolePermissionData)) {
                RolePermission::insert($rolePermissionData);
            }

            $this->command->info("Assigned " . count($permissionIds) . " permissions to {$roleName} role");
        }
    }
}
