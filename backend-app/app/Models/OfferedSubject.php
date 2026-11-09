<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OfferedSubject extends Model
{
    use HasFactory;

    protected $table = 'tbl_offered_subject';
    protected $primaryKey = 'offered_subject_id';
    public $timestamps = false;

    protected $fillable = [
        'subject_id',
        'academic_year_id',
        'semester_id',
        'program_id',
        'track_id',
        'year_level_id',
        'status',
    ];

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

    public function program()
    {
        return $this->belongsTo(Program::class, 'program_id', 'program_id');
    }

    public function track()
    {
        return $this->belongsTo(Track::class, 'track_id', 'track_id');
    }

    public function yearLevel()
    {
        return $this->belongsTo(YearLevel::class, 'year_level_id', 'year_level_id');
    }
}

