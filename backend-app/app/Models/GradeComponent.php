<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GradeComponent extends Model
{
    protected $table = 'tbl_grade_components';
    protected $primaryKey = 'grade_component_id';
    public $timestamps = false;

    protected $fillable = [
        'evaluation_id',
        'component_name',
        'grade',
    ];

    public function evaluation()
    {
        return $this->belongsTo(Evaluation::class, 'evaluation_id', 'evaluation_id');
    }
}
