<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ElectiveSlot extends Model
{
    use HasFactory;

    protected $table = 'tbl_elective_slot';
    protected $primaryKey = 'elective_slot_id';
    public $timestamps = false;

    protected $fillable = [
        'program_id',
        'semester_id',
        'year_level_id',
        'slot_name',
        'status',
        'prerequisite_slot_id',
    ];

    public function prerequisiteSlot()
    {
        return $this->belongsTo(self::class, 'prerequisite_slot_id', 'elective_slot_id');
    }

    public function program()
    {
        return $this->belongsTo(Program::class, 'program_id', 'program_id');
    }

    public function semester()
    {
        return $this->belongsTo(Semester::class, 'semester_id', 'semester_id');
    }

    public function yearLevel()
    {
        return $this->belongsTo(YearLevel::class, 'year_level_id', 'year_level_id');
    }

    public function electiveSubjects()
    {
        return $this->hasMany(ElectiveSubject::class, 'elective_slot_id', 'elective_slot_id');
    }
}

