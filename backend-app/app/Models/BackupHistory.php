<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BackupHistory extends Model
{
    protected $table = 'tbl_backup_history';

    protected $fillable = [
        'action',
        'trigger',
        'status',
        'file_name',
        'file_path',
        'file_size',
        'file_payload',
        'details',
        'created_by',
        'started_at',
        'finished_at',
    ];

    protected $casts = [
        'file_size' => 'integer',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
    ];
}
