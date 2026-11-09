<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CreditEvaluation extends Model
{
    use HasFactory;

    protected $table = 'tbl_credit_evaluation';
    protected $primaryKey = 'credit_eval_id';
    public $timestamps = false;

    protected $fillable = [
        'student_id',
        'school_id',
        'prior_school_name',
        'credit_type',
        'evaluated_by',
        'evaluation_date',
        'status',
        'remarks',
        'is_active',
        'transfer_first_name',
        'transfer_middle_name',
        'transfer_last_name',
    ];

    protected $casts = [
        'evaluation_date' => 'date',
        'is_active' => 'boolean',
    ];

    public function student()
    {
        return $this->belongsTo(StudentProfile::class, 'student_id', 'student_id');
    }

    public function school()
    {
        return $this->belongsTo(School::class, 'school_id', 'school_id');
    }

    public function evaluator()
    {
        return $this->belongsTo(TblUser::class, 'evaluated_by', 'user_id');
    }

    public function creditDetails()
    {
        return $this->hasMany(CreditEvaluationDetail::class, 'credit_eval_id', 'credit_eval_id');
    }
}

