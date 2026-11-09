<?php

namespace App\Models;

use App\Support\CachedSchema;
use App\Support\StudentIdNumber;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudentProfile extends Model
{
    use HasFactory;

    protected $table = 'tbl_student_profile';
    protected $primaryKey = 'student_id';
    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'student_number',
        'student_id_number',
        'contact_number',
        'first_name',
        'middle_name',
        'last_name',
        'address',
        'academic_status',
        // Shiftee / Returnee / Transferee — set at account creation; not Regular/Irregular.
        'student_entry_type',
        'Current_Program',
        'current_program',
        'Previous_Program',
        'previous_program',
        'year_level_id',
        'semester_id',
        'academic_year_id',
        'track_id',
        'promoted_next_sem_at',
        'promoted_next_sem_by',
        'promotion_evaluated_by',
        'promotion_target_year_level_id',
        'promotion_target_semester_id',
        'standing_deferred_keys',
        'standing_term_load',
        'major_standing_override_keys',
        'is_simulation',
    ];

    protected $casts = [
        'promoted_next_sem_at' => 'datetime',
        'standing_deferred_keys' => 'array',
        'standing_term_load' => 'array',
        'major_standing_override_keys' => 'array',
        'is_simulation' => 'boolean',
    ];

    /** Alias for Current_Program so controllers can use current_program. */
    public function getCurrentProgramAttribute()
    {
        return $this->attributes['Current_Program'] ?? $this->attributes['current_program'] ?? null;
    }

    /** DB column is `Current_Program`; writes must go there (fill/update with `current_program` otherwise miss the column). */
    public function setCurrentProgramAttribute($value): void
    {
        $this->attributes['Current_Program'] = $value;
        unset($this->attributes['current_program']);
    }

    public function getPreviousProgramAttribute()
    {
        return $this->attributes['Previous_Program'] ?? $this->attributes['previous_program'] ?? null;
    }

    public function setPreviousProgramAttribute($value): void
    {
        $this->attributes['Previous_Program'] = $value;
        unset($this->attributes['previous_program']);
    }

    /** Single attribute for either student_id_number or student_number column. */
    public function getStudentIdNumberAttribute()
    {
        return $this->attributes['student_id_number'] ?? $this->attributes['student_number'] ?? null;
    }

    /** Look up by student_id_number or student_number (accepts 2-/02- campus padding variants). */
    public function scopeWhereStudentIdNumber($query, $number)
    {
        $candidates = StudentIdNumber::loginCandidates((string) $number);
        $phinma = StudentIdNumber::parsePhinma((string) $number);

        return $query->where(function ($q) use ($number, $candidates, $phinma) {
            $hasStudentIdNumber = CachedSchema::hasColumn($this->table, 'student_id_number');
            $hasStudentNumber = CachedSchema::hasColumn($this->table, 'student_number');

            if ($hasStudentIdNumber) {
                if ($candidates !== []) {
                    $q->whereIn('student_id_number', $candidates);
                } else {
                    $q->where('student_id_number', $number);
                }

                if ($phinma !== null) {
                    $q->orWhereRaw(
                        "student_id_number REGEXP '^[0-9]{1,2}-[0-9]{4}-[0-9]+$'
                         AND CAST(SUBSTRING_INDEX(student_id_number, '-', 1) AS UNSIGNED) = ?
                         AND SUBSTRING_INDEX(SUBSTRING_INDEX(student_id_number, '-', 2), '-', -1) = ?
                         AND CAST(SUBSTRING_INDEX(student_id_number, '-', -1) AS UNSIGNED) = ?",
                        [$phinma['campus'], $phinma['year'], $phinma['serial']]
                    );
                }
            }

            if ($hasStudentNumber) {
                if ($hasStudentIdNumber) {
                    $q->orWhere('student_number', $number);
                } else {
                    $q->where('student_number', $number);
                }
            }
        });
    }

    public function user()
    {
        return $this->belongsTo(TblUser::class, 'user_id', 'user_id');
    }

    public function program()
    {
        // Migrated schema uses `Current_Program` (see 2026_01_16_000006); accessor maps ->current_program for reads.
        return $this->belongsTo(Program::class, 'Current_Program', 'program_id');
    }

    public function previousProgram()
    {
        return $this->belongsTo(Program::class, 'Previous_Program', 'program_id');
    }

    public function yearLevel()
    {
        return $this->belongsTo(YearLevel::class, 'year_level_id', 'year_level_id');
    }

    public function semester()
    {
        return $this->belongsTo(Semester::class, 'semester_id', 'semester_id');
    }

    public function academicYear()
    {
        return $this->belongsTo(AcademicYear::class, 'academic_year_id', 'academic_year_id');
    }

    public function track()
    {
        return $this->belongsTo(Track::class, 'track_id', 'track_id');
    }

    public function evaluations()
    {
        return $this->hasMany(Evaluation::class, 'student_id', 'student_id');
    }

    public function creditEvaluations()
    {
        return $this->hasMany(CreditEvaluation::class, 'student_id', 'student_id');
    }

    public function creditEvaluationDetails()
    {
        return $this->hasMany(CreditEvaluationDetail::class, 'student_id', 'student_id');
    }
}

