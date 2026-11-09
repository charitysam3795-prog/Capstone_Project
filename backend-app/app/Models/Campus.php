<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Campus extends Model
{
    use HasFactory;

    protected $table = 'tbl_campus';
    protected $primaryKey = 'campus_id';
    public $timestamps = false;

    protected $fillable = [
        'campus_name',
        'status',
    ];

    public function departments()
    {
        return $this->hasMany(Department::class, 'campus_id', 'campus_id');
    }
}

