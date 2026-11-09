<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OtherSchoolSubject extends Model
{
    use HasFactory;

    protected $table = 'tbl_other_school_subjects';
    protected $primaryKey = 'other_subject_id';
    public $timestamps = false;

    protected $fillable = [
        'school_id',
        'subject_code',
        'subject_name',
        'units',
        'hours',
        'description',
    ];

    public function school()
    {
        return $this->belongsTo(School::class, 'school_id', 'school_id');
    }

    public function creditEvaluationDetails()
    {
        return $this->hasMany(CreditEvaluationDetail::class, 'other_subject_id', 'other_subject_id');
    }

    public function subjectEquivalences()
    {
        return $this->hasMany(SubjectEquivalence::class, 'other_school_subject', 'other_subject_id');
    }

    /**
     * Reuse an existing catalog row (same school + code, case-insensitive) or create one for transfer intake.
     */
    public static function findOrCreateForSchool(int $schoolId, string $subjectCode, string $subjectName): self
    {
        $code = trim($subjectCode);
        $name = trim($subjectName) !== '' ? trim($subjectName) : $code;
        $norm = mb_strtolower($code);
        $row = static::query()
            ->where('school_id', $schoolId)
            ->whereRaw('LOWER(TRIM(subject_code)) = ?', [$norm])
            ->first();
        if ($row) {
            return $row;
        }

        return static::create([
            'school_id' => $schoolId,
            'subject_code' => mb_substr($code, 0, 50),
            'subject_name' => mb_substr($name, 0, 100),
            'units' => null,
            'hours' => null,
            'description' => null,
        ]);
    }
}

