<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class YearLevel extends Model
{
    use HasFactory;

    protected $table = 'year_level';
    protected $primaryKey = 'year_level_id';
    public $timestamps = false;

    protected $fillable = [
        'year_level',
        'status',
    ];

    public function curricula()
    {
        return $this->hasMany(Curriculum::class, 'year_level', 'year_level_id');
    }

    public function studentProfiles()
    {
        return $this->hasMany(StudentProfile::class, 'year_level_id', 'year_level_id');
    }
}

