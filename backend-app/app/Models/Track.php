<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Track extends Model
{
    use HasFactory;

    protected $table = 'tbl_track';
    protected $primaryKey = 'track_id';
    public $timestamps = false;

    protected $fillable = [
        'track_code',
        'track_name',
        'status',
    ];

    public function studentProfiles()
    {
        return $this->hasMany(StudentProfile::class, 'track_id', 'track_id');
    }

    public function electiveSubjects()
    {
        return $this->hasMany(ElectiveSubject::class, 'track_id', 'track_id');
    }

    public function offeredSubjects()
    {
        return $this->hasMany(OfferedSubject::class, 'track_id', 'track_id');
    }
}

