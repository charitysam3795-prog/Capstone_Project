<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Department extends Model
{
    use HasFactory;

    protected $table = 'tbl_departments';
    protected $primaryKey = 'department_id';
    public $timestamps = false;

    protected $fillable = [
        'campus_id',
        'department_name',
        'department_code',
        'status',
    ];

    public function campus()
    {
        return $this->belongsTo(Campus::class, 'campus_id', 'campus_id');
    }

    public function programs()
    {
        return $this->hasMany(Program::class, 'department_id', 'department_id');
    }
}

