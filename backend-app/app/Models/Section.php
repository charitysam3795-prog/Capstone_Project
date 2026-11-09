<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Section extends Model
{
    // Table name in the legacy database
    protected $table = 'tbl_section';
    protected $primaryKey = 'section_id';
    public $incrementing = true;
    public $timestamps = false;

    protected $fillable = [
        'section_name',
        'program_id',
        'year_level_id',
        'semester_id',
        'academic_year_id',
        'faculty_id',
    ];

    // Provide a convenient `name` attribute to match frontend expectations
    protected $appends = ['name'];

    public function getNameAttribute()
    {
        return $this->attributes['section_name'] ?? null;
    }

    public function faculty()
    {
        return $this->belongsTo(FacultyProfile::class, 'faculty_id', 'faculty_id');
    }
}
