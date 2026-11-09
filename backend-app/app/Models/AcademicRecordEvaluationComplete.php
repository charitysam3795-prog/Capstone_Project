<?php

namespace App\Models;

use App\Support\CachedSchema;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AcademicRecordEvaluationComplete extends Model
{
    protected $table = 'tbl_academic_record_evaluation_complete';

    protected $primaryKey = 'academic_record_complete_id';

    public $timestamps = false;

    protected $fillable = [
        'student_id',
        'completed_at',
        'completed_by',
        'notes',
        'academic_year_id',
        'semester_id',
    ];

    protected function casts(): array
    {
        return [
            'completed_at' => 'datetime',
        ];
    }

    /**
     * School year + semester active right now, for tagging a new evaluation mark.
     * Empty when the term columns are not migrated yet.
     *
     * @return array{academic_year_id?: int|null, semester_id?: int|null}
     */
    public static function currentTermAttributes(): array
    {
        $table = (new self)->getTable();
        if (! CachedSchema::hasColumn($table, 'academic_year_id')) {
            return [];
        }
        $ayId = AcademicYear::currentId();
        $semId = Semester::query()->where('status', 'active')->orderBy('semester_id')->value('semester_id');

        return [
            'academic_year_id' => $ayId > 0 ? $ayId : null,
            'semester_id' => $semId ? (int) $semId : null,
        ];
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(StudentProfile::class, 'student_id', 'student_id');
    }

    public function completedByUser(): BelongsTo
    {
        return $this->belongsTo(TblUser::class, 'completed_by', 'user_id');
    }
}
