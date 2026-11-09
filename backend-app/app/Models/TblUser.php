<?php

namespace App\Models;

use App\Services\RbacPortalMerge;
use App\Support\LookupResourcePermissions;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Tymon\JWTAuth\Contracts\JWTSubject;

class TblUser extends Authenticatable implements JWTSubject
{
    use HasFactory, Notifiable;

    protected $table = 'tbl_users';
    protected $primaryKey = 'user_id';
    public $timestamps = false;

    /** DB may use capitalized columns (Email, Password, Contact_Number). Map to lowercase for code. */
    private const COLUMN_ALIASES = [
        'email' => ['Email', 'email'],
        'password' => ['Password', 'password'],
        'contact_number' => ['Contact_Number', 'contact_number'],
    ];

    public function getAuthIdentifierName()
    {
        return 'user_id';
    }

    public function getJWTIdentifier()
    {
        return $this->getKey();
    }

    public function getJWTCustomClaims(): array
    {
        return [
            'email' => $this->email,
            'role_id' => $this->role_id,
        ];
    }

    /** Public URL for the stored avatar, or null. */
    public function avatarUrl(): ?string
    {
        $path = $this->avatar_path;
        if ($path === null || trim((string) $path) === '') {
            return null;
        }
        $path = ltrim(str_replace('\\', '/', (string) $path), '/');
        $basename = basename($path);
        if ($basename === '' || $basename === '.' || $basename === '..') {
            return null;
        }

        // Same-origin relative URL (works when APP_URL is wrong; no JWT on <img>).
        return '/media/avatars/'.$basename;
    }

    /**
     * Best-effort display name from role profile; falls back to email local-part.
     */
    public function displayName(): string
    {
        $this->loadMissing([
            'deanProfile',
            'programHeadProfile',
            'secretaryProfile',
            'facultyProfile',
            'studentProfile',
            'role',
        ]);

        $candidates = [
            $this->deanProfile,
            $this->programHeadProfile,
            $this->secretaryProfile,
            $this->facultyProfile,
            $this->studentProfile,
        ];

        foreach ($candidates as $profile) {
            if (! $profile) {
                continue;
            }
            $parts = array_values(array_filter([
                trim((string) ($profile->first_name ?? '')),
                trim((string) ($profile->middle_name ?? '')),
                trim((string) ($profile->last_name ?? '')),
            ], fn ($p) => $p !== ''));
            if ($parts !== []) {
                return implode(' ', $parts);
            }
        }

        $email = trim((string) $this->email);
        if ($email === '') {
            return 'User';
        }
        $at = strpos($email, '@');

        return $at === false ? $email : substr($email, 0, $at);
    }

    protected $fillable = [
        'email',
        'password',
        'contact_number',
        'avatar_path',
        'role_id',
        'department_id',
        'program_id',
        'use_custom_permissions',
        'status',
        'failed_login_attempts',
        'locked_until',
        'password_changed_at',
        'email_verified_at',
        'last_login_at',
        'evaluation_year_level_ids',
    ];

    protected $hidden = [
        'password',
    ];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'locked_until' => 'datetime',
            'password_changed_at' => 'datetime',
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'use_custom_permissions' => 'boolean',
            'evaluation_year_level_ids' => 'array',
        ];
    }

    public function getAttribute($key)
    {
        foreach (self::COLUMN_ALIASES as $codeKey => $dbNames) {
            if ($key !== $codeKey) {
                continue;
            }
            foreach ($dbNames as $dbKey) {
                if (array_key_exists($dbKey, $this->attributes)) {
                    return $this->attributes[$dbKey];
                }
            }
            return null;
        }
        return parent::getAttribute($key);
    }

    public function setAttribute($key, $value)
    {
        foreach (self::COLUMN_ALIASES as $codeKey => $dbNames) {
            if ($key !== $codeKey) {
                continue;
            }
            $dbKey = $dbNames[0];
            if ($key === 'password') {
                parent::setAttribute('password', $value);
                $stored = $this->attributes['password'] ?? $this->attributes['Password'] ?? null;
                if ($stored !== null) {
                    $this->attributes[$dbKey] = $stored;
                    unset($this->attributes['password']);
                }
            } else {
                $this->attributes[$dbKey] = $value;
            }
            return $this;
        }
        return parent::setAttribute($key, $value);
    }

    /** Find user by email regardless of column name (Email vs email). */
    public function scopeWhereEmail($query, $email)
    {
        return $query->where(function ($q) use ($email) {
            $q->where('Email', $email)->orWhere('email', $email);
        });
    }

    /**
     * Ensure JSON/API responses use lowercase keys (email, contact_number) for frontend compatibility.
     */
    public function toArray()
    {
        $array = parent::toArray();
        foreach (self::COLUMN_ALIASES as $codeKey => $dbNames) {
            $value = null;
            foreach ($dbNames as $dbKey) {
                if (array_key_exists($dbKey, $array)) {
                    $value = $array[$dbKey];
                    unset($array[$dbKey]);
                }
            }
            if ($codeKey !== 'password' && $value !== null) {
                $array[$codeKey] = $value;
            }
        }
        return $array;
    }

    public function role()
    {
        return $this->belongsTo(Role::class, 'role_id', 'role_id');
    }

    public function department()
    {
        return $this->belongsTo(Department::class, 'department_id', 'department_id');
    }

    public function program()
    {
        return $this->belongsTo(Program::class, 'program_id', 'program_id');
    }

    /** Per-user permission overrides when use_custom_permissions is true. */
    public function directPermissions()
    {
        return $this->belongsToMany(Permission::class, 'tbl_user_permissions', 'user_id', 'permission_id', 'user_id', 'permission_id');
    }

    /**
     * Effective permission models: custom list, or role defaults (including portal baseline merge).
     *
     * @return \Illuminate\Support\Collection<int, Permission>
     */
    public function effectivePermissionsCollection()
    {
        if ($this->isAdmin()) {
            // Light query — avoid hydrating full Permission::all() on hot paths.
            return Permission::query()->select(['permission_id', 'permission_name'])->orderBy('permission_id')->get();
        }
        if ((bool) ($this->use_custom_permissions ?? false)) {
            $this->loadMissing('directPermissions');

            return $this->directPermissions;
        }

        $this->loadMissing('role');
        $role = $this->role;
        if (! $role) {
            return collect();
        }

        $ids = RbacPortalMerge::mergedRoleAssignedIds($this->role_id, $role->role_name);
        if ($ids === []) {
            return collect();
        }

        return Permission::whereIn('permission_id', $ids)->get();
    }

    /** Permission names for JWT / user payload and frontend hasPermission checks. */
    public function permissionNamesForPayload(): array
    {
        if ($this->isAdmin()) {
            return Permission::query()
                ->orderBy('permission_name')
                ->pluck('permission_name')
                ->unique()
                ->values()
                ->all();
        }

        return $this->effectivePermissionsCollection()
            ->pluck('permission_name')
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  mixed  $value  JSON string or array from DB / request
     * @return list<int>|null null = inherit / unrestricted at this layer; [] = explicitly no levels
     */
    public static function normalizeYearLevelIdArray(mixed $value): ?array
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (! is_array($decoded)) {
                return null;
            }
            $value = $decoded;
        }
        if (! is_array($value)) {
            return null;
        }

        return array_values(array_unique(array_filter(array_map('intval', $value), fn ($n) => $n > 0)));
    }

    /**
     * null = may evaluate students in any year level; non-empty list = restrict to those year_level_id values.
     *
     * @return list<int>|null
     */
    public function effectiveEvaluationYearLevelIds(): ?array
    {
        if ($this->isAdmin()) {
            return null;
        }
        if ($this->evaluation_year_level_ids !== null) {
            return self::normalizeYearLevelIdArray($this->evaluation_year_level_ids);
        }
        $this->loadMissing('role');
        if (! $this->role) {
            return null;
        }

        return self::normalizeYearLevelIdArray($this->role->evaluation_year_level_ids ?? null);
    }

    /** Whether this staff user may open curriculum evaluation for a student in the given year level. */
    public function mayEvaluateStudentYearLevel(?int $yearLevelId): bool
    {
        if ($this->isAdmin()) {
            return true;
        }
        if ($this->hasRole('Dean')) {
            return true;
        }
        $allowed = $this->effectiveEvaluationYearLevelIds();
        if ($allowed === null) {
            return true;
        }
        if ($yearLevelId === null || (int) $yearLevelId < 1) {
            return false;
        }

        return in_array((int) $yearLevelId, $allowed, true);
    }

    public function deanProfile()
    {
        return $this->hasOne(DeanProfile::class, 'user_id', 'user_id');
    }

    public function programHeadProfile()
    {
        return $this->hasOne(ProgramHeadProfile::class, 'user_id', 'user_id');
    }

    public function secretaryProfile()
    {
        return $this->hasOne(SecretaryProfile::class, 'user_id', 'user_id');
    }

    public function facultyProfile()
    {
        return $this->hasOne(FacultyProfile::class, 'user_id', 'user_id');
    }

    public function studentProfile()
    {
        return $this->hasOne(StudentProfile::class, 'user_id', 'user_id');
    }

    public function hasRole($roleName)
    {
        return $this->role && $this->role->role_name === $roleName;
    }

    /** Adviser portal / student evaluation workflows (legacy Evaluator role merged into Adviser). */
    public function isEvaluatorLike(): bool
    {
        return $this->hasRole('Adviser') || $this->hasRole('Evaluator');
    }

    /**
     * Student evaluation workspace (API + UI). Uses permissions so User permissions / custom overrides apply.
     * Dean users still get evaluation.* from role defaults unless an admin removes them.
     */
    public function canWorkOnStudentEvaluations(): bool
    {
        if ($this->isAdmin()) {
            return true;
        }

        return $this->isEvaluatorLike()
            || $this->hasRole('Program Head')
            || $this->hasRole('Secretary')
            || $this->hasAnyPermission([
                'Student Evaluation',
                'evaluation.view',
                'evaluation.create',
                'evaluation.edit',
                'evaluation.approve',
            ]);
    }

    /** Enter / change grades and other evaluation writes (User permissions: Credit Evaluation → Full access). */
    public function canEditStudentGrades(): bool
    {
        if ($this->isAdmin()) {
            return true;
        }

        return $this->hasAnyPermission([
            'evaluation.create',
            'evaluation.edit',
            'evaluation.approve',
        ]);
    }

    /** Promote to next semester; `evaluation.promote` alone = promote only, no grade edits (Adviser default). */
    public function canPromoteStudents(): bool
    {
        return $this->canEditStudentGrades() || $this->hasPermission('evaluation.promote');
    }

    /** Approve or reject transfer / advanced standing credit evaluations. */
    public function canApproveTransferCredits(): bool
    {
        return $this->isAdmin() || $this->hasPermission('credit_eval.approve');
    }

    /**
     * High-impact academic actions (e.g. delete stored evaluation rows) — tied to dean.approve in User permissions.
     */
    public function canDeleteEvaluationsOrDeanAcademicRecords(): bool
    {
        return $this->isAdmin() || $this->hasPermission('dean.approve');
    }

    public function isAdmin()
    {
        try {
            if (!$this->role_id) {
                return false;
            }
            
            // Load role if not already loaded
            if (!$this->relationLoaded('role')) {
                $this->load('role');
            }
            
            if (!$this->role) {
                return false;
            }
            
            return $this->hasRole('Admin');
        } catch (\Exception $e) {
            return false;
        }
    }

    /**
     * Whether this user's role has a named permission (Role Settings → tbl_role_permissions).
     * Admins are treated as having all permissions.
     */
    public function hasPermission(string $permissionName): bool
    {
        if ($this->isAdmin()) {
            return true;
        }
        if ($permissionName === '') {
            return false;
        }
        if (! $this->role_id && ! (bool) ($this->use_custom_permissions ?? false)) {
            return false;
        }

        return $this->effectivePermissionsCollection()->contains(
            fn ($p) => $p->permission_name === $permissionName
        );
    }

    /**
     * True if the role has any of the given permission names (or user is Admin).
     *
     * @param  list<string>  $permissionNames
     */
    public function hasAnyPermission(array $permissionNames): bool
    {
        if ($this->isAdmin()) {
            return true;
        }
        if ($permissionNames === []) {
            return false;
        }
        if (! $this->role_id && ! (bool) ($this->use_custom_permissions ?? false)) {
            return false;
        }

        $effective = $this->effectivePermissionsCollection();
        foreach ($permissionNames as $name) {
            if ($name === '') {
                continue;
            }
            if ($effective->contains(fn ($p) => $p->permission_name === $name)) {
                return true;
            }
        }

        return false;
    }

    /** User Management screen + /users API (friendly + RBAC names from Role Settings). */
    public function canManageUsers(): bool
    {
        if ($this->isEvaluatorLike()) {
            return false;
        }

        if ($this->isAdmin()) {
            return true;
        }

        return $this->hasAnyPermission([
            'User Management',
            'users.view',
            'users.create',
            'users.edit',
            'users.delete',
            'users.manage_roles',
        ]);
    }

    /** Student Management screen + student-scoped /users / CSV import. */
    public function canManageStudents(): bool
    {
        if ($this->isEvaluatorLike()) {
            return false;
        }

        if ($this->isAdmin()) {
            return true;
        }

        return $this->hasAnyPermission([
            'Student Management',
            'students.view',
            'students.create',
            'students.edit',
            'students.enroll',
        ]);
    }

    /** Directory APIs shared by User Management and Student Management (list/view). */
    public function canAccessUserDirectory(): bool
    {
        return $this->canManageUsers() || $this->canManageStudents();
    }

    public function canCreateStaffUsers(): bool
    {
        if ($this->isEvaluatorLike()) {
            return false;
        }
        if ($this->isAdmin()) {
            return true;
        }

        return $this->hasAnyPermission([
            'User Management',
            'users.create',
        ]);
    }

    public function canEditStaffUsers(): bool
    {
        if ($this->isEvaluatorLike()) {
            return false;
        }
        if ($this->isAdmin()) {
            return true;
        }

        return $this->hasAnyPermission([
            'User Management',
            'users.edit',
            'users.manage_roles',
        ]);
    }

    public function canDeleteStaffUsers(): bool
    {
        if ($this->isEvaluatorLike()) {
            return false;
        }
        if ($this->isAdmin()) {
            return true;
        }

        return $this->hasAnyPermission([
            'User Management',
            'users.delete',
        ]);
    }

    public function canCreateStudentUsers(): bool
    {
        if ($this->isEvaluatorLike()) {
            return false;
        }
        if ($this->isAdmin()) {
            return true;
        }

        return $this->hasAnyPermission([
            'Student Management',
            'students.create',
            'students.enroll',
        ]);
    }

    public function canEditStudentUsers(): bool
    {
        if ($this->isEvaluatorLike()) {
            return false;
        }
        if ($this->isAdmin()) {
            return true;
        }

        return $this->hasAnyPermission([
            'Student Management',
            'students.edit',
        ]);
    }

    /** Security settings API (Dean portal tab when role has system permissions). */
    public function canManageSecuritySettings(): bool
    {
        if ($this->isEvaluatorLike()) {
            return false;
        }

        if ($this->isAdmin()) {
            return true;
        }

        return $this->hasAnyPermission([
            'System Management',
            'system.settings',
            'system.backup',
        ]);
    }

    /** CSV import API (Import / Export module + legacy student create grants). */
    public function canUseCsvImport(): bool
    {
        if ($this->canImportSisData()) {
            return true;
        }

        if ($this->isEvaluatorLike()) {
            return false;
        }

        if ($this->hasAnyPermission([
            'Import / Export',
            'data.import',
            'data.export',
            'User Management',
            'Student Management',
            'Curriculum Management',
            'Lookup Data',
            'users.create',
            'students.create',
            'students.enroll',
            'curriculum.create',
            'lookup.manage',
        ])) {
            return true;
        }

        foreach (LookupResourcePermissions::managePermissionNames() as $name) {
            if ($this->hasPermission($name)) {
                return true;
            }
        }

        return false;
    }

    /** SIS grade deliberation import (User permissions → Import / Export → Import only / Full access). */
    public function canImportSisData(): bool
    {
        if ($this->isAdmin()) {
            return true;
        }

        return $this->hasAnyPermission(['Import / Export', 'data.import']);
    }

    /** CSV exports on the Import / Export page (User permissions → Import / Export → Export only / Full access). */
    public function canExportDirectoryData(): bool
    {
        if ($this->isAdmin()) {
            return true;
        }

        return $this->hasAnyPermission(['Import / Export', 'data.export']);
    }

    /**
     * Lookup Data API / UI — slug matches LookupResourcePermissions::SLUGS (e.g. programs, year_levels).
     * Legacy: lookup.view (read all areas), lookup.manage (read+write all areas).
     */
    public function canAccessLookupResource(string $slug, bool $forWrite = false): bool
    {
        if ($this->isAdmin()) {
            return true;
        }

        if (! LookupResourcePermissions::isValidSlug($slug)) {
            return false;
        }

        // Evaluator / adviser / dean / program head: read-only program list for curriculum reference.
        if (! $forWrite && $slug === 'programs' && $this->canWorkOnStudentEvaluations()) {
            return true;
        }

        // Curriculum browser (faculty portal / curriculum lookup bundle): read reference data without Lookup Data role.
        if (! $forWrite && $this->hasPermission('curriculum.view')) {
            if ($slug === 'programs' || in_array($slug, ['year_levels', 'semesters', 'subjects', 'requisites', 'curriculum_headers'], true)) {
                return true;
            }
        }

        if ($this->hasPermission('lookup.manage')) {
            return true;
        }

        if (! $forWrite && $this->hasPermission('lookup.view')) {
            return true;
        }

        if ($forWrite) {
            return $this->hasPermission("lookup.{$slug}.manage");
        }

        return $this->hasPermission("lookup.{$slug}.view")
            || $this->hasPermission("lookup.{$slug}.manage");
    }
}


