<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Modality extends Model
{
    protected $table = 'tbl_modality';
    protected $primaryKey = 'modality_id';
    public $timestamps = false;

    protected $fillable = [
        'modality_name',
    ];

    public function evaluations()
    {
        return $this->hasMany(Evaluation::class, 'modality_id', 'modality_id');
    }
}
