<?php

namespace App\Http\Controllers\Identity;

use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Controller;
use App\Models\DeanProfile;
use App\Models\Department;
use App\Models\FacultyProfile;
use App\Models\Program;
use App\Models\ProgramHeadProfile;
use App\Models\Role;
use App\Models\SecretaryProfile;
use App\Models\SecuritySetting;
use App\Models\TblUser;
use App\Services\AuthUnitHelpers;
use App\Services\StudentAccountEmail;
use App\Support\CachedSchema;
use App\Support\InputGuards;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    protected function denyUnlessUserDirectory(Request $request)
    {
        if (! $request->user()?->canAccessUserDirectory()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return null;
    }

    protected function actorMayManageOnlyStudents(Request $request): bool
    {
        $actor = $request->user();

        return $actor && $actor->canManageStudents() && ! $actor->canManageUsers();
    }

    protected function isStudentRole(?Role $role): bool
    {
        return $role && strcasecmp(trim((string) $role->role_name), 'Student') === 0;
    }

    public function index(Request $request)
    {
        try {
            if ($denied = $this->denyUnlessUserDirectory($request)) {
                return $denied;
            }

            $query = TblUser::with([
                'role',
                'department',
                'program',
                'deanProfile.program',
                'deanProfile.department',
                'programHeadProfile.program',
                'programHeadProfile.department',
                'secretaryProfile.program',
                'secretaryProfile.department',
                'facultyProfile.department',
                'facultyProfile.program',
                'studentProfile.program',
            ]);

            if ($this->actorMayManageOnlyStudents($request)) {
                $studentRoleId = Role::query()->where('role_name', 'Student')->value('role_id');
                if (! $studentRoleId) {
                    return response()->json([]);
                }
                $query->where('role_id', (int) $studentRoleId);
            }

            return response()->json($query->get());
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch users', 'message' => $e->getMessage()], 500);
        }
    }

    public function store(Request $request)
    {
        if ($denied = $this->denyUnlessUserDirectory($request)) {
            return $denied;
        }

        $settings = SecuritySetting::current();
        $maxLen = $settings->maxPasswordLength();

        $rolePreview = Role::find($request->input('role_id'));
        $creatingStudent = $this->isStudentRole($rolePreview);

        $validated = $request->validate([
            // Students log in with Student ID Number stored in the email/username column.
            'email' => $creatingStudent
                ? ['required', 'string', 'max:100', 'unique:tbl_users,email']
                : ['required', 'email', 'unique:tbl_users,email', AuthUnitHelpers::emailFormatRule()],
            // Admin directory: temporary passwords allowed. Strength is enforced when the user
            // changes password on first login (must_change_password) or via /password/change.
            'password' => ['required', 'string', 'max:'.$maxLen],
            'contact_number' => InputGuards::contactNumberRule(false),
            'role_id' => 'required|exists:tbl_roles,role_id',
            'department_id' => 'nullable|exists:tbl_departments,department_id',
            'status' => 'nullable|string|max:50',
            'program_id' => 'nullable|exists:tbl_program,program_id',
            'employee_id' => 'nullable|string|max:50',
        ]);
        $employeeId = trim((string) ($validated['employee_id'] ?? ''));
        $employeeId = $employeeId !== '' ? $employeeId : null;

        DB::beginTransaction();
        try {
            // Debug: Log the incoming data
            \Log::info('Creating user with data:', $validated);

            $role = Role::find($validated['role_id']);
            $departmentManagedRoles = ['Dean', 'Program Head', 'Secretary'];
            $facultyProgramRoles = ['Adviser'];
            $departmentId = $validated['department_id'] ?? null;
            $programId = $validated['program_id'] ?? null;
            $program = $programId ? Program::find($programId) : null;

            if ($employeeId !== null && $this->employeeIdTakenByOtherUser($employeeId)) {
                DB::rollBack();

                return response()->json([
                    'error' => 'Failed to create user',
                    'message' => 'This Employee ID is already assigned to another staff account.',
                ], 422);
            }

            if (
                $role
                && in_array($role->role_name, AuthController::employeeIdLoginRoles(), true)
                && $employeeId === null
            ) {
                DB::rollBack();

                return response()->json([
                    'error' => 'Failed to create user',
                    'message' => 'Employee ID is required. Staff sign in with Employee ID; email is only for verification and password reset.',
                ], 422);
            }

            if ($this->actorMayManageOnlyStudents($request) && ! $this->isStudentRole($role)) {
                DB::rollBack();

                return response()->json([
                    'error' => 'Failed to create user',
                    'message' => 'Your Student Management permission only allows creating Student accounts.',
                ], 403);
            }

            if ($this->isStudentRole($role)) {
                if (! $request->user()->canCreateStudentUsers()) {
                    DB::rollBack();

                    return response()->json([
                        'error' => 'Failed to create user',
                        'message' => 'View-only access: you cannot create students.',
                    ], 403);
                }
            } elseif (! $request->user()->canCreateStaffUsers()) {
                DB::rollBack();

                return response()->json([
                    'error' => 'Failed to create user',
                    'message' => 'View-only access: you cannot create users.',
                ], 403);
            }

            if ($role && strtolower(trim((string) $role->role_name)) === 'admin') {
                DB::rollBack();

                return response()->json([
                    'error' => 'Failed to create user',
                    'message' => 'Creating Admin users from User Management is not allowed.',
                ], 422);
            }

            if ($role && in_array($role->role_name, $departmentManagedRoles, true) && ! $departmentId) {
                DB::rollBack();

                return response()->json([
                    'error' => 'Failed to create user',
                    'message' => 'Department is required for Dean, Program Head, and Secretary users.',
                ], 422);
            }

            if ($role && in_array($role->role_name, ['Program Head', ...$facultyProgramRoles], true) && ! $programId) {
                DB::rollBack();

                return response()->json([
                    'error' => 'Failed to create user',
                    'message' => 'Program is required for Program Head and Adviser users.',
                ], 422);
            }

            if ($program && ! $departmentId) {
                $departmentId = $program->department_id;
            }

            if ($program && $departmentId && (int) $program->department_id !== (int) $departmentId) {
                DB::rollBack();

                return response()->json([
                    'error' => 'Failed to create user',
                    'message' => 'The selected program does not belong to the selected department.',
                ], 422);
            }

            if ($this->isStudentRole($role)) {
                // Frontend sends Student ID in email; store a login placeholder — real email is optional later.
                $studentId = trim((string) $validated['email']);
                $validated['email'] = StudentAccountEmail::loginEmailForNewStudent($studentId);
            }

            $user = TblUser::create([
                'email' => $validated['email'],
                'password' => AuthUnitHelpers::hashUserPassword($validated['password']),
                'contact_number' => $validated['contact_number'] ?? null,
                'role_id' => $validated['role_id'],
                'department_id' => $departmentId,
                'program_id' => $role && $role->role_name === 'Program Head' ? $programId : null,
                'status' => $validated['status'] ?? 'active',
                // Null forces a strong password on first portal login (admin may set a temporary one).
                'password_changed_at' => null,
            ]);

            $user->load('role');

            // If dean role and program_id provided, create dean profile
            \Log::info('Found role:', ['role' => $role ? $role->toArray() : 'null']);
            \Log::info('Role name:', ['role_name' => $role ? $role->role_name : 'no role found']);

            if ($role && $role->role_name === 'Dean') {
                \Log::info('Creating dean profile for user:', ['user_id' => $user->user_id]);
                \Log::info('With department_id:', ['department_id' => $departmentId]);

                if (! $programId && $departmentId) {
                    $programId = Program::where('department_id', $departmentId)
                        ->orderBy('program_id')
                        ->value('program_id');
                }

                try {
                    DeanProfile::create([
                        'user_id' => $user->user_id,
                        'department_id' => $departmentId ? (int) $departmentId : null,
                        'program_id' => $programId ? (int) $programId : null,
                        'employee_id' => $employeeId,
                    ]);
                    \Log::info('Dean profile created successfully');
                } catch (\Exception $deanError) {
                    \Log::error('Failed to create dean profile: '.$deanError->getMessage());
                    DB::rollBack();

                    return response()->json(['error' => 'Failed to create user', 'message' => 'Failed to create dean profile: '.$deanError->getMessage()], 500);
                }
            } else {
                \Log::info('Skipping dean profile creation - role is not Dean');
            }

            if ($role && $role->role_name === 'Program Head') {
                ProgramHeadProfile::updateOrCreate(
                    ['user_id' => $user->user_id],
                    [
                        'department_id' => $departmentId ? (int) $departmentId : null,
                        'program_id' => $programId ? (int) $programId : null,
                        'employee_id' => $employeeId,
                    ]
                );
            }

            if ($role && $role->role_name === 'Secretary') {
                SecretaryProfile::updateOrCreate(
                    ['user_id' => $user->user_id],
                    [
                        'department_id' => $departmentId ? (int) $departmentId : null,
                        'program_id' => $programId ? (int) $programId : null,
                        'employee_id' => $employeeId,
                    ]
                );
            }

            if ($role && in_array($role->role_name, $facultyProgramRoles, true)) {
                FacultyProfile::updateOrCreate(
                    ['user_id' => $user->user_id],
                    [
                        'department_id' => $departmentId ? (int) $departmentId : null,
                        'program_id' => $programId ? (int) $programId : null,
                        'employee_id' => $employeeId,
                    ]
                );
            }

            DB::commit();

            return response()->json($user->fresh([
                'role',
                'department',
                'program',
                'deanProfile.program',
                'deanProfile.department',
                'programHeadProfile.program',
                'programHeadProfile.department',
                'secretaryProfile.program',
                'secretaryProfile.department',
                'facultyProfile.department',
                'facultyProfile.program',
                'studentProfile.program',
            ]), 201);
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json(['error' => 'Failed to create user', 'message' => $e->getMessage()], 500);
        }
    }

    public function show(Request $request, $id)
    {
        if ($denied = $this->denyUnlessUserDirectory($request)) {
            return $denied;
        }

        $user = TblUser::with([
            'role',
            'department',
            'program',
            'deanProfile.program',
            'deanProfile.department',
            'programHeadProfile.program',
            'programHeadProfile.department',
            'secretaryProfile.program',
            'secretaryProfile.department',
            'facultyProfile.department',
            'facultyProfile.program',
            'studentProfile.program',
        ])->findOrFail($id);

        if ($this->actorMayManageOnlyStudents($request)) {
            $user->loadMissing('role');
            if (! $this->isStudentRole($user->role)) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }
        }

        return response()->json($user);
    }

    public function updateOwnProfile(Request $request)
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $validated = $request->validate([
            'contact_number' => InputGuards::contactNumberRule(false),
        ]);

        $user->contact_number = $validated['contact_number'] ?? null;
        $user->save();

        return response()->json([
            'user' => AuthController::userPayload($user->fresh(['role', 'department', 'program'])),
        ]);
    }

    public function updateOwnAvatar(Request $request)
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $file = $request->file('avatar');
        if (! $file) {
            return response()->json(['message' => 'No image file received.'], 422);
        }

        $validated = $request->validate([
            'avatar' => 'required|image|mimes:jpeg,jpg,png,webp|max:4096',
        ]);

        $file = $validated['avatar'];
        $ext = strtolower((string) ($file->getClientOriginalExtension() ?: $file->extension() ?: 'jpg'));
        if (! in_array($ext, ['jpeg', 'jpg', 'png', 'webp'], true)) {
            $ext = 'jpg';
        }
        $filename = 'user_'.$user->user_id.'_'.time().'.'.$ext;
        $stored = 'avatars/'.$filename;
        $bytes = @file_get_contents($file->getRealPath());
        if ($bytes === false || $bytes === '') {
            return response()->json(['message' => 'Could not read uploaded image.'], 422);
        }
        if (strlen($bytes) < 128) {
            return response()->json(['message' => 'Image file looks empty or corrupt. Try another photo.'], 422);
        }

        $mime = match ($ext) {
            'png' => 'image/png',
            'webp' => 'image/webp',
            default => 'image/jpeg',
        };

        $old = $user->avatar_path;
        $user->avatar_path = $stored;
        if (CachedSchema::hasColumn('tbl_users', 'avatar_data')) {
            $user->avatar_data = base64_encode($bytes);
            $user->avatar_mime = $mime;
        } else {
            Storage::disk('public')->makeDirectory('avatars');
            if (! $file->storeAs('avatars', $filename, 'public')) {
                return response()->json(['message' => 'Could not store avatar.'], 500);
            }
        }
        $user->save();

        if ($old && $old !== $stored && Storage::disk('public')->exists($old)) {
            Storage::disk('public')->delete($old);
        }

        $fresh = $user->fresh(['role', 'department', 'program']);

        return response()->json([
            'message' => 'Profile picture updated',
            'avatar_path' => $fresh->avatar_path,
            'avatar_url' => $fresh->avatarUrl(),
            'user' => AuthController::userPayload($fresh),
        ]);
    }

    /**
     * Public avatar file for <img src> (no JWT). Filename is opaque (user_id + timestamp).
     */
    public function servePublicAvatar(string $filename)
    {
        $filename = basename($filename);
        if ($filename === '' || ! preg_match('/^user_\d+_\d+\.(jpe?g|png|webp)$/i', $filename)) {
            abort(404);
        }

        if (! preg_match('/^user_(\d+)_/i', $filename, $m)) {
            abort(404);
        }
        $user = TblUser::find((int) $m[1]);
        if (! $user || ! $user->avatar_path || ! str_ends_with(str_replace('\\', '/', (string) $user->avatar_path), $filename)) {
            abort(404);
        }

        $mime = $user->avatar_mime;
        $body = null;
        if (CachedSchema::hasColumn('tbl_users', 'avatar_data') && $user->avatar_data) {
            $body = base64_decode((string) $user->avatar_data, true);
            if ($body === false) {
                abort(404);
            }
        } else {
            $relative = 'avatars/'.$filename;
            if (! Storage::disk('public')->exists($relative)) {
                abort(404);
            }

            return response()->file(Storage::disk('public')->path($relative), [
                'Content-Type' => $mime ?: 'image/jpeg',
                'Cache-Control' => 'public, max-age=86400',
            ]);
        }

        $mime = $mime ?: match (strtolower(pathinfo($filename, PATHINFO_EXTENSION))) {
            'png' => 'image/png',
            'webp' => 'image/webp',
            default => 'image/jpeg',
        };

        return response($body, 200, [
            'Content-Type' => $mime,
            'Cache-Control' => 'public, max-age=86400',
        ]);
    }

    public function deleteOwnAvatar(Request $request)
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $old = $user->avatar_path;
        if ($old && Storage::disk('public')->exists($old)) {
            Storage::disk('public')->delete($old);
        }
        $user->avatar_path = null;
        if (CachedSchema::hasColumn('tbl_users', 'avatar_data')) {
            $user->avatar_data = null;
            $user->avatar_mime = null;
        }
        $user->save();

        $fresh = $user->fresh(['role', 'department', 'program']);

        return response()->json([
            'message' => 'Profile picture removed',
            'avatar_url' => null,
            'user' => AuthController::userPayload($fresh),
        ]);
    }

    public function profileOptions(Request $request)
    {
        if (! $request->user()) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        return response()->json([
            'departments' => Department::orderBy('department_name')->get(),
            'programs' => Program::with('department')->orderBy('program_name')->get(),
        ]);
    }

    public function update(Request $request, $id)
    {
        if ($denied = $this->denyUnlessUserDirectory($request)) {
            return $denied;
        }

        // Full staff user edits remain edit-permission gated; Student Management may update Student accounts.
        $actor = $request->user();
        $user = TblUser::with('role')->findOrFail($id);
        $targetIsStudent = $this->isStudentRole($user->role);

        if ($targetIsStudent) {
            if (! $actor->canEditStudentUsers() && ! $actor->isAdmin()) {
                return response()->json(['message' => 'View-only access: you cannot edit students.'], 403);
            }
        } elseif (! $actor->canEditStaffUsers() && ! $actor->isAdmin()) {
            return response()->json(['message' => 'View-only access: you cannot edit users.'], 403);
        }

        if ($this->actorMayManageOnlyStudents($request) && ! $targetIsStudent) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $rolePreview = Role::find($request->input('role_id')) ?: $user->role;
        $updatingStudent = $this->isStudentRole($rolePreview);

        $validated = $request->validate([
            'email' => $updatingStudent
                ? ['required', 'string', 'max:100', Rule::unique('tbl_users', 'email')->ignore($user->user_id, 'user_id')]
                : ['required', 'email', Rule::unique('tbl_users', 'email')->ignore($user->user_id, 'user_id'), AuthUnitHelpers::emailFormatRule()],
            'password' => ['nullable', 'string', 'max:'.SecuritySetting::current()->maxPasswordLength()],
            'contact_number' => InputGuards::contactNumberRule(false),
            'role_id' => 'required|exists:tbl_roles,role_id',
            'department_id' => 'nullable|exists:tbl_departments,department_id',
            'status' => 'nullable|string|max:50',
            'program_id' => 'nullable|exists:tbl_program,program_id',
            'employee_id' => 'nullable|string|max:50',
        ]);
        $employeeId = trim((string) ($validated['employee_id'] ?? ''));
        $employeeId = $employeeId !== '' ? $employeeId : null;

        DB::beginTransaction();
        try {
            $role = Role::find($validated['role_id']);
            $currentRole = Role::find($user->role_id);
            $isDean = $role && $role->role_name === 'Dean';
            $departmentManagedRoles = ['Dean', 'Program Head', 'Secretary'];
            $facultyProgramRoles = ['Adviser'];
            $departmentId = $validated['department_id'] ?? null;
            $programId = $validated['program_id'] ?? null;
            $program = $programId ? Program::find($programId) : null;

            if ($employeeId !== null && $this->employeeIdTakenByOtherUser($employeeId, (int) $user->user_id)) {
                DB::rollBack();

                return response()->json([
                    'error' => 'Failed to update user',
                    'message' => 'This Employee ID is already assigned to another staff account.',
                ], 422);
            }

            if (
                $role
                && in_array($role->role_name, AuthController::employeeIdLoginRoles(), true)
                && $employeeId === null
            ) {
                DB::rollBack();

                return response()->json([
                    'error' => 'Failed to update user',
                    'message' => 'Employee ID is required. Staff sign in with Employee ID; email is only for verification and password reset.',
                ], 422);
            }

            if ($this->actorMayManageOnlyStudents($request) && ! $this->isStudentRole($role)) {
                DB::rollBack();

                return response()->json([
                    'error' => 'Failed to update user',
                    'message' => 'Your Student Management permission only allows Student accounts.',
                ], 403);
            }

            if (
                $role &&
                strtolower(trim((string) $role->role_name)) === 'admin' &&
                (! $currentRole || strtolower(trim((string) $currentRole->role_name)) !== 'admin')
            ) {
                DB::rollBack();

                return response()->json([
                    'error' => 'Failed to update user',
                    'message' => 'Changing a user into Admin from User Management is not allowed.',
                ], 422);
            }

            if ($role && in_array($role->role_name, $departmentManagedRoles, true) && ! $departmentId) {
                DB::rollBack();

                return response()->json([
                    'error' => 'Failed to update user',
                    'message' => 'Department is required for Dean, Program Head, and Secretary users.',
                ], 422);
            }

            if ($role && in_array($role->role_name, ['Program Head', ...$facultyProgramRoles], true) && ! $programId) {
                DB::rollBack();

                return response()->json([
                    'error' => 'Failed to update user',
                    'message' => 'Program is required for Program Head and Adviser users.',
                ], 422);
            }

            if ($program && ! $departmentId) {
                $departmentId = $program->department_id;
            }

            if ($program && $departmentId && (int) $program->department_id !== (int) $departmentId) {
                DB::rollBack();

                return response()->json([
                    'error' => 'Failed to update user',
                    'message' => 'The selected program does not belong to the selected department.',
                ], 422);
            }

            $user->email = $validated['email'];
            $user->contact_number = $validated['contact_number'] ?? null;
            $user->role_id = $validated['role_id'];
            $user->department_id = $departmentId;
            $user->program_id = $role && $role->role_name === 'Program Head' ? $programId : null;
            $user->status = $validated['status'] ?? $user->status;

            if (isset($validated['password'])) {
                $user->password = AuthUnitHelpers::hashUserPassword($validated['password']);
                // Admin reset → user must set a strong password on next login.
                $user->password_changed_at = null;
            }

            $user->save();
            $user->load('role');

            // Handle dean profile

            if ($isDean && $departmentId) {
                if (! $programId) {
                    $programId = Program::where('department_id', $departmentId)
                        ->orderBy('program_id')
                        ->value('program_id');
                }
                // Update or create dean profile
                $deanProfile = DeanProfile::where('user_id', $user->user_id)->first();
                if ($deanProfile) {
                    $deanProfile->department_id = $departmentId;
                    $deanProfile->program_id = $programId;
                    $deanProfile->employee_id = $employeeId;
                    $deanProfile->save();
                } else {
                    DeanProfile::create([
                        'user_id' => $user->user_id,
                        'department_id' => $departmentId,
                        'program_id' => $programId,
                        'employee_id' => $employeeId,
                    ]);
                }
            } elseif (! $isDean) {
                // If role changed from dean, delete dean profile
                DeanProfile::where('user_id', $user->user_id)->delete();
            }

            if ($role && $role->role_name === 'Program Head') {
                ProgramHeadProfile::updateOrCreate(
                    ['user_id' => $user->user_id],
                    [
                        'department_id' => $departmentId ? (int) $departmentId : null,
                        'program_id' => $programId ? (int) $programId : null,
                        'employee_id' => $employeeId,
                    ]
                );
            } else {
                ProgramHeadProfile::where('user_id', $user->user_id)->delete();
            }

            if ($role && $role->role_name === 'Secretary') {
                SecretaryProfile::updateOrCreate(
                    ['user_id' => $user->user_id],
                    [
                        'department_id' => $departmentId ? (int) $departmentId : null,
                        'program_id' => $programId ? (int) $programId : null,
                        'employee_id' => $employeeId,
                    ]
                );
            } else {
                SecretaryProfile::where('user_id', $user->user_id)->delete();
            }

            if ($role && in_array($role->role_name, $facultyProgramRoles, true)) {
                FacultyProfile::updateOrCreate(
                    ['user_id' => $user->user_id],
                    [
                        'department_id' => $departmentId ? (int) $departmentId : null,
                        'program_id' => $programId ? (int) $programId : null,
                        'employee_id' => $employeeId,
                    ]
                );
            } else {
                FacultyProfile::where('user_id', $user->user_id)->delete();
            }

            DB::commit();

            return response()->json($user->fresh([
                'role',
                'department',
                'program',
                'deanProfile.program',
                'deanProfile.department',
                'programHeadProfile.program',
                'programHeadProfile.department',
                'secretaryProfile.program',
                'secretaryProfile.department',
                'facultyProfile.department',
                'facultyProfile.program',
                'studentProfile.program',
            ]));
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json(['error' => 'Failed to update user', 'message' => $e->getMessage()], 500);
        }
    }

    public function destroy(Request $request, $id)
    {
        if ($denied = $this->denyUnlessUserDirectory($request)) {
            return $denied;
        }

        $user = TblUser::with('role')->findOrFail($id);
        $targetIsStudent = $this->isStudentRole($user->role);
        $actor = $request->user();

        if ($this->actorMayManageOnlyStudents($request) && ! $targetIsStudent) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($targetIsStudent) {
            if (! $actor->isAdmin() && ! $actor->canEditStudentUsers()) {
                return response()->json(['message' => 'View-only access: you cannot delete students.'], 403);
            }
        } elseif (! $actor->isAdmin() && ! $actor->canDeleteStaffUsers()) {
            return response()->json(['message' => 'View-only access: you cannot delete users.'], 403);
        }

        $user->delete();

        return response()->json(['message' => 'User deleted successfully']);
    }

    public function roles(Request $request)
    {
        try {
            if ($denied = $this->denyUnlessUserDirectory($request)) {
                return $denied;
            }

            $roles = Role::query()->orderBy('role_name')->get();
            if ($this->actorMayManageOnlyStudents($request)) {
                $roles = $roles->filter(fn ($role) => $this->isStudentRole($role))->values();
            }

            return response()->json($roles);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch roles', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Employee ID must be unique across staff profile tables (login identifier).
     */
    private function employeeIdTakenByOtherUser(string $employeeId, ?int $ignoreUserId = null): bool
    {
        $checks = [
            DeanProfile::query()->where('employee_id', $employeeId),
            FacultyProfile::query()->where('employee_id', $employeeId),
            ProgramHeadProfile::query()->where('employee_id', $employeeId),
            SecretaryProfile::query()->where('employee_id', $employeeId),
        ];

        foreach ($checks as $query) {
            if ($ignoreUserId !== null) {
                $query->where('user_id', '!=', $ignoreUserId);
            }
            if ($query->exists()) {
                return true;
            }
        }

        return false;
    }
}
