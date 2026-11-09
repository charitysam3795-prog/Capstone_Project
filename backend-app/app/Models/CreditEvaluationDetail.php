<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CreditEvaluationDetail extends Model
{
    use HasFactory;

    protected $table = 'tbl_credit_evaluation_details';
    protected $primaryKey = 'credit_detail_id';
    public $timestamps = false;

    protected $fillable = [
        'credit_eval_id',
        'student_id',
        'other_subject_id',
        'subject_id',
        'credited_units',
        'credit_basis',
        'remarks',
    ];

    public function creditEvaluation()
    {
        return $this->belongsTo(CreditEvaluation::class, 'credit_eval_id', 'credit_eval_id');
    }

    public function student()
    {
        return $this->belongsTo(StudentProfile::class, 'student_id', 'student_id');
    }

    public function subject()
    {
        return $this->belongsTo(Subject::class, 'subject_id', 'subject_id');
    }

    public function otherSchoolSubject()
    {
        return $this->belongsTo(OtherSchoolSubject::class, 'other_subject_id', 'other_subject_id');
    }
}

