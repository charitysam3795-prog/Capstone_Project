<?php

use App\Http\Controllers\Identity\UserController;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Combined hosting (Railway): serve React SPA + Laravel API on one origin.
| API stays under /api/*. Built React files live in public/ (spa.html + static/).
|--------------------------------------------------------------------------
*/

Route::get('/up', function () {
    return response('ok', 200);
});

Route::get('/media/avatars/{filename}', [UserController::class, 'servePublicAvatar'])
    ->where('filename', 'user_\d+_\d+\.(jpe?g|png|webp)');

Route::get('/{any?}', function () {
    $spa = public_path('spa.html');

    if (! File::exists($spa)) {
        return response()->json([
            'status' => 'ok',
            'service' => 'Student Academic Evaluation API',
            'hint' => 'React SPA is not bundled yet. Run the Railway build or scripts/sync-frontend-to-public.',
        ]);
    }

    return response(File::get($spa), 200, [
        'Content-Type' => 'text/html; charset=UTF-8',
        'Cache-Control' => 'no-cache, no-store, must-revalidate',
    ]);
})->where('any', '^(?!api|storage|media|up).*$');
