<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Semester extends Model
{
    use HasFactory;

    protected $table = 'tbl_semester';
    protected $primaryKey = 'semester_id';
    public $timestamps = false;

    protected $fillable = [
        'semester_name',
        'status',
    ];

    public function curricula()
    {
        return $this->hasMany(Curriculum::class, 'semester_id', 'semester_id');
    }
}

