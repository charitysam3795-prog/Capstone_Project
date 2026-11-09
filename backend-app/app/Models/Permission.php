<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Permission extends Model
{
    use HasFactory;

    protected $table = 'tbl_permission';
    protected $primaryKey = 'permission_id';
    public $timestamps = false;

    protected $fillable = [
        'permission_name',
        'category',
        'description',
    ];

    public function roles()
    {
        return $this->belongsToMany(Role::class, 'tbl_role_permissions', 'permission_id', 'role_id');
    }

    public function rolePermissions()
    {
        return $this->hasMany(RolePermission::class, 'permission_id', 'permission_id');
    }

    public function usersWithDirectAssignment()
    {
        return $this->belongsToMany(TblUser::class, 'tbl_user_permissions', 'permission_id', 'user_id', 'permission_id', 'user_id');
    }
}

