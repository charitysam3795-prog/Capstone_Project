<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Program extends Model
{
    use HasFactory;

    protected $table = 'tbl_program';
    protected $primaryKey = 'program_id';
    public $timestamps = false;

    protected $fillable = [
        'department_id',
        'campus_id',
        'program_code',
        'program_name',
        'total_units_required',
        'status',
    ];

    public function department()
    {
        return $this->belongsTo(Department::class, 'department_id', 'department_id');
    }

    public function curricula()
    {
        return $this->hasMany(Curriculum::class, 'program_id', 'program_id');
    }

    public function curriculumHeaders()
    {
        return $this->hasMany(CurriculumHeader::class, 'program_id', 'program_id');
    }

    public function offeredSubjects()
    {
        return $this->hasMany(OfferedSubject::class, 'program_id', 'program_id');
    }

    public function deanProfiles()
    {
        return $this->hasMany(DeanProfile::class, 'program_id', 'program_id');
    }
}

