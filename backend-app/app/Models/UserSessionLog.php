<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class UserSessionLog extends Model
{
    use HasFactory;

    protected $table = 'user_session_logs';
    protected $primaryKey = 'session_log_id';

    protected $fillable = [
        'user_id',
        'email',
        'status',
        'failure_reason',
        'ip_address',
        'user_agent',
        'browser',
        'platform',
        'device',
        'token_hash',
        'login_at',
        'logout_at',
        'logout_reason',
    ];

    protected $casts = [
        'login_at' => 'datetime',
        'logout_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(TblUser::class, 'user_id', 'user_id');
    }
}
