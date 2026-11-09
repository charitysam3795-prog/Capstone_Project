<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SubjectEquivalence extends Model
{
    use HasFactory;

    protected $table = 'tbl_subject_equivalence';
    protected $primaryKey = 'equivalence_id';
    public $timestamps = false;

    protected $fillable = [
        'other_school_subject',
        'subject_id',
        'credited_units',
        'credit_basis',
        'status',
        'remarks',
    ];

    public function subject()
    {
        return $this->belongsTo(Subject::class, 'subject_id', 'subject_id');
    }

    public function otherSchoolSubject()
    {
        return $this->belongsTo(OtherSchoolSubject::class, 'other_school_subject', 'other_subject_id');
    }
}

