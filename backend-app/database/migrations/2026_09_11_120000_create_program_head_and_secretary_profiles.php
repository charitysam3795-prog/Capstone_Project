<?php

use App\Models\Role;
use App\Models\TblUser;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tbl_program_head_profile')) {
            Schema::create('tbl_program_head_profile', function (Blueprint $table) {
                $table->increments('program_head_id');
                $table->integer('user_id');
                $table->string('first_name', 50)->nullable();
                $table->string('middle_name', 50)->nullable();
                $table->string('last_name', 50)->nullable();
                $table->string('employee_id', 50)->nullable();
                $table->string('specialization', 255)->nullable();
                $table->integer('department_id')->nullable();
                $table->integer('program_id')->nullable();

                $table->foreign('user_id')->references('user_id')->on('tbl_users')->onDelete('cascade');
                $table->foreign('department_id')->references('department_id')->on('tbl_departments')->onDelete('set null');
                $table->foreign('program_id')->references('program_id')->on('tbl_program')->onDelete('set null');
                $table->unique('user_id');
            });
        }

        if (! Schema::hasTable('tbl_secretary_profile')) {
            Schema::create('tbl_secretary_profile', function (Blueprint $table) {
                $table->increments('secretary_id');
                $table->integer('user_id');
                $table->string('first_name', 50)->nullable();
                $table->string('middle_name', 50)->nullable();
                $table->string('last_name', 50)->nullable();
                $table->string('employee_id', 50)->nullable();
                $table->string('specialization', 255)->nullable();
                $table->integer('department_id')->nullable();
                $table->integer('program_id')->nullable();

                $table->foreign('user_id')->references('user_id')->on('tbl_users')->onDelete('cascade');
                $table->foreign('department_id')->references('department_id')->on('tbl_departments')->onDelete('set null');
                $table->foreign('program_id')->references('program_id')->on('tbl_program')->onDelete('set null');
                $table->unique('user_id');
            });
        }

        $this->backfillProfiles();
    }

    private function backfillProfiles(): void
    {
        if (! Schema::hasTable('tbl_users') || ! Schema::hasTable('tbl_roles')) {
            return;
        }

        $phRoleId = Role::query()->where('role_name', 'Program Head')->value('role_id');
        $secRoleId = Role::query()->where('role_name', 'Secretary')->value('role_id');

        if ($phRoleId && Schema::hasTable('tbl_program_head_profile')) {
            TblUser::query()
                ->where('role_id', (int) $phRoleId)
                ->orderBy('user_id')
                ->each(function (TblUser $user) {
                    if (\DB::table('tbl_program_head_profile')->where('user_id', $user->user_id)->exists()) {
                        return;
                    }
                    \DB::table('tbl_program_head_profile')->insert([
                        'user_id' => $user->user_id,
                        'department_id' => $user->department_id,
                        'program_id' => $user->program_id,
                        'first_name' => null,
                        'middle_name' => null,
                        'last_name' => null,
                        'employee_id' => null,
                        'specialization' => null,
                    ]);
                });
        }

        if ($secRoleId && Schema::hasTable('tbl_secretary_profile')) {
            TblUser::query()
                ->where('role_id', (int) $secRoleId)
                ->orderBy('user_id')
                ->each(function (TblUser $user) {
                    if (\DB::table('tbl_secretary_profile')->where('user_id', $user->user_id)->exists()) {
                        return;
                    }
                    \DB::table('tbl_secretary_profile')->insert([
                        'user_id' => $user->user_id,
                        'department_id' => $user->department_id,
                        'program_id' => $user->program_id,
                        'first_name' => null,
                        'middle_name' => null,
                        'last_name' => null,
                        'employee_id' => null,
                        'specialization' => null,
                    ]);
                });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tbl_secretary_profile');
        Schema::dropIfExists('tbl_program_head_profile');
    }
};
