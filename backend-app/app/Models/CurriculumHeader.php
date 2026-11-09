<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CurriculumHeader extends Model
{
    use HasFactory;

    protected $table = 'tbl_curriculum_header';
    protected $primaryKey = 'curriculum_header_id';
    public $timestamps = false;

    protected $fillable = [
        'program_id',
        'Effective_Year',
        'academic_year_id',
        'description',
        'status',
    ];

    public function program()
    {
        return $this->belongsTo(Program::class, 'program_id', 'program_id');
    }

    public function academicYear()
    {
        return $this->belongsTo(AcademicYear::class, 'academic_year_id', 'academic_year_id');
    }

    public function curricula()
    {
        return $this->hasMany(Curriculum::class, 'curriculum_header_id', 'curriculum_header_id');
    }
}

