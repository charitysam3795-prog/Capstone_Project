<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DeanProfile extends Model
{
    use HasFactory;

    protected $table = 'tbl_dean_profile';
    protected $primaryKey = 'dean_id';
    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'first_name',
        'middle_name',
        'last_name',
        'employee_id',
        'specialization',
        'department_id',
        'program_id',
    ];

    public function user()
    {
        return $this->belongsTo(TblUser::class, 'user_id', 'user_id');
    }

    public function program()
    {
        return $this->belongsTo(Program::class, 'program_id', 'program_id');
    }

    public function department()
    {
        return $this->belongsTo(Department::class, 'department_id', 'department_id');
    }
}

