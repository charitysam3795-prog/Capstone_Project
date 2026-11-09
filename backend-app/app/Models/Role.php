<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Role extends Model
{
    use HasFactory;

    protected $table = 'tbl_roles';
    protected $primaryKey = 'role_id';
    public $timestamps = false;

    protected $fillable = [
        'role_name',
        'access_level',
        'description',
        'evaluation_year_level_ids',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'evaluation_year_level_ids' => 'array',
        ];
    }

    public function users()
    {
        return $this->hasMany(TblUser::class, 'role_id', 'role_id');
    }

    public function permissions()
    {
        return $this->belongsToMany(Permission::class, 'tbl_role_permissions', 'role_id', 'permission_id');
    }

    public function rolePermissions()
    {
        return $this->hasMany(RolePermission::class, 'role_id', 'role_id');
    }
}

