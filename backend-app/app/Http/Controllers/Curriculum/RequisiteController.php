<?php

namespace App\Http\Controllers\Curriculum;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

/**
 * Unified /api/requisites/* routes — delegates to PrerequisiteController (tbl_prerequisite).
 */
class RequisiteController extends Controller
{
    public function __construct(
        private readonly PrerequisiteController $prerequisiteController
    ) {}

    public function index(Request $request)
    {
        return $this->prerequisiteController->index($request);
    }

    public function store(Request $request)
    {
        return $this->prerequisiteController->store($request);
    }

    public function show(Request $request, $id)
    {
        return $this->prerequisiteController->show($request, $id);
    }

    public function update(Request $request, $id)
    {
        return $this->prerequisiteController->update($request, $id);
    }

    public function destroy(Request $request, $id)
    {
        return $this->prerequisiteController->destroy($request, $id);
    }

    public function getBySubject(Request $request, $subjectId)
    {
        return $this->prerequisiteController->getBySubject($request, $subjectId);
    }
}
