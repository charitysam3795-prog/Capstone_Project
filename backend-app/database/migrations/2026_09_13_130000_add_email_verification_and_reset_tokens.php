<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('tbl_users') && ! Schema::hasColumn('tbl_users', 'email_verified_at')) {
            Schema::table('tbl_users', function (Blueprint $table) {
                $table->timestamp('email_verified_at')->nullable()->after('email');
            });

            // Existing accounts stay usable; new signups / resends must verify when required.
            DB::table('tbl_users')->whereNull('email_verified_at')->update([
                'email_verified_at' => now(),
            ]);
        }

        if (! Schema::hasTable('tbl_account_email_tokens')) {
            Schema::create('tbl_account_email_tokens', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id');
                $table->string('purpose', 32); // verify | reset
                $table->string('token_hash', 64);
                $table->timestamp('expires_at');
                $table->timestamp('created_at')->useCurrent();

                $table->index(['user_id', 'purpose']);
                $table->unique('token_hash');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tbl_account_email_tokens');

        if (Schema::hasTable('tbl_users') && Schema::hasColumn('tbl_users', 'email_verified_at')) {
            Schema::table('tbl_users', function (Blueprint $table) {
                $table->dropColumn('email_verified_at');
            });
        }
    }
};
