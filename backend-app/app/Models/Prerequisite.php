<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Prerequisite extends Model
{
    use HasFactory;

    protected $table = 'tbl_prerequisite';
    protected $primaryKey = 'requisites_id';
    public $timestamps = false;

    protected $fillable = [
        'subject_id',
        'requisite_type',
        'requisites_subject_id',
        'rule_label',
    ];

    // Relationships
    public function subject()
    {
        return $this->belongsTo(Subject::class, 'subject_id', 'subject_id');
    }

    public function requiredSubject()
    {
        return $this->belongsTo(Subject::class, 'requisites_subject_id', 'subject_id');
    }

    // Optional: Add scopes for easier querying
    public function scopePrerequisites($query)
    {
        return $query->where('requisite_type', 'prerequisite');
    }

    public function scopeCorequisites($query)
    {
        return $query->where('requisite_type', 'corequisite');
    }

    public function scopeForSubject($query, $subjectId)
    {
        return $query->where('subject_id', $subjectId);
    }

    // Optional: Helper method to check if it's a prerequisite
    public function isPrerequisite()
    {
        return $this->requisite_type === 'prerequisite';
    }

    // Optional: Helper method to check if it's a corequisite
    public function isCorequisite()
    {
        return $this->requisite_type === 'corequisite';
    }
}