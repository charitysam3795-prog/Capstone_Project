<?php

namespace App\Http\Controllers\Curriculum;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

/**
 * /api/corequisites/* — corequisite-only routes; delegates to PrerequisiteController.
 */
class CorequisiteController extends Controller
{
    public function __construct(
        private readonly PrerequisiteController $prerequisiteController
    ) {}

    public function index(Request $request)
    {
        return $this->prerequisiteController->getCorequisites($request);
    }

    public function store(Request $request)
    {
        if (! $request->has('requisite_type')) {
            $request->merge(['requisite_type' => 'corequisite']);
        }

        return $this->prerequisiteController->store($request);
    }

    public function destroy(Request $request, $id)
    {
        return $this->prerequisiteController->destroy($request, $id);
    }
}
