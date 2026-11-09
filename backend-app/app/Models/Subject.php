<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Subject extends Model
{
    use HasFactory;

    protected $table = 'tbl_subjects';
    protected $primaryKey = 'subject_id';
    public $timestamps = false;

    protected $fillable = [
        'subject_code',
        'subject_name',
        'number_of_units',
        'number_of_hrs',
        'status',
    ];

    public function curricula()
    {
        return $this->hasMany(Curriculum::class, 'subject_id', 'subject_id');
    }

    public function prerequisites()
    {
        return $this->hasMany(Prerequisite::class, 'subject_id', 'subject_id');
    }

    public function offeredSubjects()
    {
        return $this->hasMany(OfferedSubject::class, 'subject_id', 'subject_id');
    }

    public function electiveSubjects()
    {
        return $this->hasMany(ElectiveSubject::class, 'subject_id', 'subject_id');
    }

    public function creditEvaluationDetails()
    {
        return $this->hasMany(CreditEvaluationDetail::class, 'subject_id', 'subject_id');
    }

    public function subjectEquivalences()
    {
        return $this->hasMany(SubjectEquivalence::class, 'subject_id', 'subject_id');
    }
}

