<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BackupSetting extends Model
{
    protected $table = 'tbl_backup_settings';

    public $timestamps = false;

    protected $fillable = [
        'enabled',
        'schedule_type',
        'backup_time',
        'storage_path',
        'updated_at',
    ];

    protected $casts = [
        'enabled' => 'boolean',
        'updated_at' => 'datetime',
    ];
}
