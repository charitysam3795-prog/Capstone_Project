<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    use HasFactory;

    protected $table = 'audit_logs';
    protected $primaryKey = 'audit_logs_id';
    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'actions',
        'table_name',
        'record_id',
        'old_value',
        'new_value',
        'action_timestamp',
    ];

    protected $casts = [
        'action_timestamp' => 'datetime',
        'old_value' => 'array',
        'new_value' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(TblUser::class, 'user_id', 'user_id');
    }
}

