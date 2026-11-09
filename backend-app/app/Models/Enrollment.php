<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Enrollment extends Model
{
    use HasFactory;

    protected $table = 'tbl_enrollments';
    protected $primaryKey = 'enrollment_id';
    public $timestamps = false;

    protected $fillable = [
        'student_id',
        'subject_id',
        'academic_year_id',
        'semester_id',
        'grade',
        'status',
        'enrolled_date',
        'section_id',
    ];

    protected $casts = [
        'enrolled_date' => 'date',
    ];

    public function student()
    {
        return $this->belongsTo(StudentProfile::class, 'student_id', 'student_id');
    }

    public function subject()
    {
        return $this->belongsTo(Subject::class, 'subject_id', 'subject_id');
    }

    public function academicYear()
    {
        return $this->belongsTo(AcademicYear::class, 'academic_year_id', 'academic_year_id');
    }

    public function semester()
    {
        return $this->belongsTo(Semester::class, 'semester_id', 'semester_id');
    }

    public function section()
    {
        return $this->belongsTo(Section::class, 'section_id', 'section_id');
    }
}

