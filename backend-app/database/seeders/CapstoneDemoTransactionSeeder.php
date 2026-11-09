<?php

namespace Database\Seeders;

use App\Models\DeanProfile;
use App\Models\Department;
use App\Models\FacultyProfile;
use App\Models\Program;
use App\Models\Role;
use App\Models\TblUser;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Sync demo staff accounts (excludes Student): Admin, Dean, Program Head, Secretary, Adviser.
 * Re-run after RBAC changes: php artisan db:seed --class=CapstoneDemoTransactionSeeder
 */
class CapstoneDemoTransactionSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            ['role_name' => 'Adviser', 'access_level' => 8, 'description' => 'Adviser — student curriculum evaluation & guidance'],
            ['role_name' => 'Dean', 'access_level' => 9, 'description' => 'Dean — department academic evaluation oversight'],
            ['role_name' => 'Program Head', 'access_level' => 7, 'description' => 'Program head — curriculum oversight'],
            ['role_name' => 'Secretary', 'access_level' => 4, 'description' => 'Secretary — records and lookup'],
            ['role_name' => 'Student', 'access_level' => 5, 'description' => 'Student'],
            ['role_name' => 'Admin', 'access_level' => 10, 'description' => 'Administrator'],
        ];

        foreach ($roles as $r) {
            Role::updateOrCreate(
                ['role_name' => $r['role_name']],
                ['access_level' => $r['access_level'], 'description' => $r['description']]
            );
        }

        Role::where('role_name', 'Evaluator')->delete();

        $program = Program::query()->where('program_code', 'BSIT')->first() ?? Program::query()->first();
        $department = $program?->department_id
            ? Department::query()->find($program->department_id)
            : Department::query()->first();
        $programId = $program ? (int) $program->program_id : null;
        $departmentId = $department ? (int) $department->department_id : null;

        /** @var list<array{email: string, password: string, role: string, first: string, last: string, employee_id: ?string}> $accounts */
        $accounts = [
            [
                'email' => 'dean@example.com',
                'password' => 'dean123',
                'role' => 'Dean',
                'first' => 'Demo',
                'last' => 'Dean',
                'employee_id' => 'EMP-DEAN-001',
            ],
            [
                'email' => 'programhead@example.com',
                'password' => 'programhead123',
                'role' => 'Program Head',
                'first' => 'Demo',
                'last' => 'Program Head',
                'employee_id' => 'EMP-PH-001',
            ],
            [
                'email' => 'secretary@example.com',
                'password' => 'secretary123',
                'role' => 'Secretary',
                'first' => 'Demo',
                'last' => 'Secretary',
                'employee_id' => 'EMP-SEC-001',
            ],
            [
                'email' => 'adviser@example.com',
                'password' => 'adviser123',
                'role' => 'Adviser',
                'first' => 'Alex',
                'last' => 'Adviser',
                'employee_id' => 'EMP-ADV-001',
            ],
        ];

        foreach ($accounts as $acc) {
            $role = Role::where('role_name', $acc['role'])->first();
            if (! $role) {
                continue;
            }

            $hash = Hash::make($acc['password']);
            $user = TblUser::whereEmail($acc['email'])->first();
            if (! $user) {
                $user = TblUser::create([
                    'email' => $acc['email'],
                    'password' => $acc['password'],
                    'role_id' => $role->role_id,
                    'status' => 'active',
                ]);
            }

            $userUpdate = [
                'role_id' => $role->role_id,
                'Password' => $hash,
                'Email' => $acc['email'],
                'status' => 'active',
                'use_custom_permissions' => false,
                'password_changed_at' => now(),
                'failed_login_attempts' => 0,
                'locked_until' => null,
            ];

            if ($acc['role'] === 'Program Head' && $programId) {
                $userUpdate['program_id'] = $programId;
            } elseif ($acc['role'] === 'Secretary' && $programId) {
                $userUpdate['program_id'] = $programId;
            } else {
                $userUpdate['program_id'] = null;
            }

            if (in_array($acc['role'], ['Dean', 'Secretary', 'Program Head'], true) && $departmentId) {
                $userUpdate['department_id'] = $departmentId;
            }

            DB::table('tbl_users')->where('user_id', $user->user_id)->update($userUpdate);
            $user->refresh();

            if ($acc['role'] === 'Adviser') {
                FacultyProfile::updateOrCreate(
                    ['user_id' => $user->user_id],
                    [
                        'first_name' => $acc['first'],
                        'last_name' => $acc['last'],
                        'employee_id' => $acc['employee_id'],
                        'department_id' => $departmentId,
                        'program_id' => $programId,
                        'specialization' => 'Information Technology',
                    ]
                );
            }

            if ($acc['role'] === 'Dean') {
                DeanProfile::updateOrCreate(
                    ['user_id' => $user->user_id],
                    [
                        'first_name' => $acc['first'],
                        'last_name' => $acc['last'],
                        'employee_id' => $acc['employee_id'],
                        'department_id' => $departmentId,
                        'program_id' => $programId,
                        'specialization' => 'Information Technology',
                    ]
                );
            }
        }

        $adviserRole = Role::where('role_name', 'Adviser')->first();
        $legacyEvaluator = TblUser::whereEmail('evaluator@example.com')->first();
        if ($legacyEvaluator && $adviserRole) {
            DB::table('tbl_users')->where('user_id', $legacyEvaluator->user_id)->update([
                'role_id' => $adviserRole->role_id,
                'use_custom_permissions' => false,
            ]);
        }

        $this->command?->info('Staff demo accounts synced (Student excluded):');
        $this->command?->info('  dean@example.com / dean123');
        $this->command?->info('  programhead@example.com / programhead123');
        $this->command?->info('  secretary@example.com / secretary123');
        $this->command?->info('  adviser@example.com / adviser123');
        if ($program) {
            $this->command?->info("  Scoped to program: {$program->program_code} — {$program->program_name}");
        }
    }
}
