<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class School extends Model
{
    use HasFactory;

    protected $table = 'tbl_schools';
    protected $primaryKey = 'school_id';
    public $timestamps = false;

    protected $fillable = [
        'school_name',
        'school_program',
        'school_curriculum',
        'is_transfer_placeholder',
    ];

    protected $casts = [
        'is_transfer_placeholder' => 'boolean',
    ];

    /**
     * Catalog row used only to group Other School Subjects when the evaluation has a typed prior school
     * (no catalog school_id). Reuses the same normalized name so OSS codes stay unique per institution.
     */
    public static function ensurePlaceholderSchoolIdForPriorName(?string $priorName): ?int
    {
        $t = trim((string) $priorName);
        if ($t === '') {
            return null;
        }

        $normalized = mb_strtolower($t);
        $existing = static::query()
            ->where('is_transfer_placeholder', true)
            ->whereRaw('LOWER(TRIM(school_name)) = ?', [$normalized])
            ->first();
        if ($existing) {
            return (int) $existing->school_id;
        }

        $created = static::create([
            'school_name' => mb_substr($t, 0, 250),
            'school_program' => null,
            'school_curriculum' => null,
            'is_transfer_placeholder' => true,
        ]);

        return (int) $created->school_id;
    }

    public function creditEvaluations()
    {
        return $this->hasMany(CreditEvaluation::class, 'school_id', 'school_id');
    }

    public function otherSchoolSubjects()
    {
        return $this->hasMany(OtherSchoolSubject::class, 'school_id', 'school_id');
    }
}

