<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Curriculum extends Model
{
    use HasFactory;

    // FIX: Usually your DB table is named 'tbl_curriculum', not 'curriculum'
    protected $table = 'curriculum'; 
    
    protected $primaryKey = 'curriculum_id';
    public $timestamps = false;

    protected $fillable = [
        'curriculum_header_id',
        'program_id',
        'subject_id',
        'elective_slot_id',
        // FIX: Based on your Model code, the column is 'year_level' (integer storing the ID)
        'year_level', 
        'semester_id',
        'passing_grade',
        'subject_type',
        'requisite_id',
    ];

    public function curriculumHeader()
    {
        return $this->belongsTo(CurriculumHeader::class, 'curriculum_header_id', 'curriculum_header_id');
    }

    public function program()
    {
        return $this->belongsTo(Program::class, 'program_id', 'program_id');
    }

    public function subject()
    {
        return $this->belongsTo(Subject::class, 'subject_id', 'subject_id');
    }

    // FIX: The local key is 'year_level', the parent key is 'year_level_id'
    public function yearLevel()
    {
        return $this->belongsTo(YearLevel::class, 'year_level', 'year_level_id');
    }

    public function semester()
    {
        return $this->belongsTo(Semester::class, 'semester_id', 'semester_id');
    }

    public function requisite()
    {
        return $this->hasMany(Prerequisite::class, 'subject_id', 'subject_id');
    }

    public function electiveSlot()
    {
        return $this->belongsTo(ElectiveSlot::class, 'elective_slot_id', 'elective_slot_id');
    }
}