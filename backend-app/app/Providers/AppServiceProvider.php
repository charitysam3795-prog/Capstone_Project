<?php

namespace App\Providers;

use App\Models\CreditEvaluation;
use App\Models\CreditEvaluationDetail;
use App\Models\Curriculum;
use App\Models\CurriculumHeader;
use App\Models\DeanProfile;
use App\Models\ElectiveSlot;
use App\Models\Enrollment;
use App\Models\Evaluation;
use App\Models\FacultyProfile;
use App\Models\ProgramHeadProfile;
use App\Models\RolePermission;
use App\Models\SecretaryProfile;
use App\Models\SecuritySetting;
use App\Models\StudentProfile;
use App\Models\TblUser;
use App\Observers\AuditModelObserver;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $auditObserver = AuditModelObserver::class;
        foreach ([
            TblUser::class,
            StudentProfile::class,
            DeanProfile::class,
            ProgramHeadProfile::class,
            SecretaryProfile::class,
            FacultyProfile::class,
            Evaluation::class,
            SecuritySetting::class,
            CreditEvaluation::class,
            CreditEvaluationDetail::class,
            Enrollment::class,
            RolePermission::class,
            Curriculum::class,
            CurriculumHeader::class,
            ElectiveSlot::class,
        ] as $modelClass) {
            $modelClass::observe($auditObserver);
        }
    }
}
