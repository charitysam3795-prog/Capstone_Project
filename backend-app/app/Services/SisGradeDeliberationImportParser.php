<?php

namespace App\Services;

use App\Models\AcademicYear;
use App\Models\Modality;
use App\Models\Section;
use App\Models\Semester;
use Illuminate\Http\UploadedFile;

/**
 * Parses school SIS "Grade Deliberation" style tabular exports
 * (CSV / TSV / TXT / Excel .xlsx|.xls / ODS).
 *
 * Layout (after SESSION … SECTION): variable-width instructor columns, then MODALITY … REMARKS.
 * Optional header row with labels like SESSION, STUDENT ID, CODE (case-insensitive).
 */
class SisGradeDeliberationImportParser
{
    /**
     * @return list<array<string, mixed>>
     */
    public function parseFileToGradeRows(UploadedFile $file, ?int $overrideAcademicYearId, ?int $overrideSemesterId): array
    {
        $reader = new ImportTabularFileReader;
        $matrix = $reader->readCellMatrix($file);
        if ($matrix === []) {
            return [];
        }

        $firstCells = $matrix[0];
        $hasHeader = $this->rowLooksLikeHeader($firstCells);

        $dataRows = $hasHeader ? array_slice($matrix, 1) : $matrix;
        $headerMap = $hasHeader ? $this->buildHeaderIndex($firstCells) : null;
        $sourceHeaders = $hasHeader
            ? array_map(static fn ($h) => trim((string) $h), $firstCells)
            : $this->standardDeliberationHeaders();

        $modalities = $this->loadModalityLookup();

        $out = [];
        foreach ($dataRows as $idx => $cells) {
            $rowNum = $idx + ($hasHeader ? 2 : 1);
            $parsed = $this->parseOneRow($cells, $headerMap, $modalities, $rowNum);
            if ($parsed === null) {
                continue;
            }

            $session = $parsed['session'];

            [$ayId, $semId] = $this->resolveTerm($session, $overrideAcademicYearId, $overrideSemesterId);
            $sectionId = $this->resolveSectionId($parsed['section_code'], $ayId);

            $out[] = [
                'student_id_number' => $parsed['student_id_number'],
                'subject_code' => $parsed['subject_code'],
                'academic_year_id' => $ayId,
                'semester_id' => $semId,
                'section_id' => $sectionId,
                'grade' => $parsed['grade'],
                'evaluation_status' => $parsed['evaluation_status'],
                'modality_id' => $parsed['modality_id'],
                'enrolled_date' => null,
                'evaluation_date' => null,
                'inc_compliance_deadline' => null,
                '_sis_row' => $rowNum,
                '_sis_session' => $session,
                '_sis_student_name' => $parsed['student_name'],
                '_sis_course' => $parsed['course'],
                '_sis_year_level_text' => $parsed['year_level_text'],
                '_sis_year_sem_code' => $parsed['year_sem_code'],
                '_sis_admission_type' => $parsed['admission_type'] ?? null,
                '_sis_source_row' => $this->sourceRowFromCells(
                    $cells,
                    $sourceHeaders,
                    $parsed['year_level_text'],
                    $parsed['year_sem_code']
                ),
            ];
        }

        return $out;
    }

    /**
     * Canonical Grade Deliberation column labels (headerless / positional files).
     *
     * @return list<string>
     */
    public function standardDeliberationHeaders(): array
    {
        return [
            'SESSION',
            'COLLEGE',
            'COURSE',
            'STUDENT ID',
            'NAME',
            'YEAR LEVEL',
            'SEMESTER',
            'CODE',
            'SUBJECT NAME',
            'SUBJECT TYPE',
            'UNITS',
            'SECTION',
            'TEACHER 1',
            'SECTION 2',
            'TEACHER 2',
            'MODALITY',
            'ENLISTMENT MODE',
            'ADMISSION TYPE',
            'GENDER',
            'P1',
            'P2',
            'P3',
            'GRADE',
            'REMARKS',
        ];
    }

    /**
     * @param  list<string>  $cells
     * @param  list<string>  $headers
     * @return array<string, string>
     */
    private function sourceRowFromCells(
        array $cells,
        array $headers,
        ?string $normalizedYearLevelText = null,
        ?string $normalizedYearSemCode = null
    ): array {
        $out = [];
        $headerCount = count($headers);
        for ($i = 0; $i < $headerCount; $i++) {
            $label = trim((string) ($headers[$i] ?? ''));
            if ($label === '') {
                $label = 'Column '.($i + 1);
            }
            $out[$label] = trim((string) ($cells[$i] ?? ''));
        }
        for ($i = $headerCount; $i < count($cells); $i++) {
            $out['Column '.($i + 1)] = trim((string) ($cells[$i] ?? ''));
        }

        // Preview should show YEAR LEVEL = "YEAR 1" and SEMESTER = "Y1S1"
        // even when the SIS export has those two columns swapped.
        if ($normalizedYearLevelText !== null && $normalizedYearLevelText !== '') {
            foreach (array_keys($out) as $label) {
                if ($this->headerKeyLooksLike($label, ['year level', 'year_level', 'yr level', 'yr_level'])) {
                    $out[$label] = $normalizedYearLevelText;
                    break;
                }
            }
        }
        if ($normalizedYearSemCode !== null && $normalizedYearSemCode !== '') {
            foreach (array_keys($out) as $label) {
                if ($this->headerKeyLooksLike($label, ['semester', 'sem'])) {
                    $out[$label] = $normalizedYearSemCode;
                    break;
                }
            }
        }

        return $out;
    }

    /**
     * @param  list<string>  $aliases
     */
    private function headerKeyLooksLike(string $label, array $aliases): bool
    {
        $nk = strtolower(trim($label));
        $nk = str_replace([' ', '-'], ['_', '_'], $nk);
        foreach ($aliases as $alias) {
            $ak = strtolower(trim($alias));
            $ak = str_replace([' ', '-'], ['_', '_'], $ak);
            if ($nk === $ak) {
                return true;
            }
        }

        return false;
    }

    /**
     * SIS exports often put term codes (Y1S1) under "YEAR LEVEL" and year labels
     * (YEAR 1) under "SEMESTER". Normalize to:
     * - year_level_text = YEAR 1
     * - year_sem_code = Y1S1
     *
     * @return array{0: string, 1: string}
     */
    private function normalizeYearLevelAndSemesterFields(string $yearLevelColumn, string $semesterColumn): array
    {
        $a = trim($yearLevelColumn);
        $b = trim($semesterColumn);

        $aIsTerm = $this->looksLikeYearSemCode($a);
        $bIsTerm = $this->looksLikeYearSemCode($b);
        $aIsYear = $this->looksLikeYearLevelLabel($a);
        $bIsYear = $this->looksLikeYearLevelLabel($b);

        // Correct logical layout already: YEAR LEVEL=YEAR 1, SEMESTER=Y1S1
        if ($aIsYear && $bIsTerm) {
            return [$a, $b];
        }

        // Common SIS quirk: YEAR LEVEL=Y1S1, SEMESTER=YEAR 1
        if ($aIsTerm && $bIsYear) {
            return [$b, $a];
        }

        // Fallbacks when only one side is recognizable.
        if ($aIsTerm && ! $bIsTerm) {
            return [$b !== '' ? $b : $this->yearLabelFromSemCode($a), $a];
        }
        if ($bIsTerm && ! $aIsTerm) {
            return [$a !== '' ? $a : $this->yearLabelFromSemCode($b), $b];
        }
        if ($aIsYear && ! $bIsYear) {
            return [$a, $b];
        }
        if ($bIsYear && ! $aIsYear) {
            return [$b, $a];
        }

        // Unknown shape — keep column order but treat first as year text, second as term.
        return [$a, $b];
    }

    private function looksLikeYearSemCode(string $value): bool
    {
        return (bool) preg_match('/^Y\d+S\d+$/i', trim($value));
    }

    private function looksLikeYearLevelLabel(string $value): bool
    {
        return (bool) preg_match('/^(?:year|yr)\s*\d+/i', trim($value));
    }

    private function yearLabelFromSemCode(string $semCode): string
    {
        if (preg_match('/^Y(\d+)/i', trim($semCode), $m)) {
            return 'YEAR '.(int) $m[1];
        }

        return '';
    }

    private function rowLooksLikeHeader(array $cells): bool
    {
        if ($cells === []) {
            return false;
        }

        $map = $this->buildHeaderIndex($cells);

        if (isset($map['session']) || isset($map['idno']) || isset($map['id_no'])) {
            return true;
        }

        if (isset($map['subject_code']) && (isset($map['grade']) || isset($map['final_grade']))) {
            return true;
        }

        if (isset($map['code']) && (isset($map['student_id']) || isset($map['idno']))) {
            return true;
        }

        $first = $this->normalizeHeaderKey((string) ($cells[0] ?? ''));

        return in_array($first, ['session', 'idno', 'id_no', 'student_id'], true);
    }

    /**
     * @param  list<string>  $headerCells
     * @return array<string, int>
     */
    private function buildHeaderIndex(array $headerCells): array
    {
        $map = [];
        foreach ($headerCells as $i => $h) {
            $key = $this->normalizeHeaderKey((string) $h);
            $map[$key] = $i;
        }

        return $map;
    }

    private function normalizeHeaderKey(string $header): string
    {
        $key = strtolower(trim(preg_replace('/\s+/', ' ', $header) ?? $header));
        $key = trim($key, " \t\n\r\0\x0B\"'");
        $key = str_replace(['.', '/', '\\', '(', ')', '[', ']'], '', $key);

        return str_replace([' ', '-'], ['_', '_'], $key);
    }

    /**
     * @param  list<string>  $cells
     * @param  array<string, int>|null  $headerMap
     * @param  array<string, int>  $modalities  lower_name => id
     * @return array<string, mixed>|null
     */
    private function parseOneRow(array $cells, ?array $headerMap, array $modalities, int $rowNumber): ?array
    {
        if ($headerMap !== null) {
            $g = static function (array $map, array $row, array $keys) use ($rowNumber): ?string {
                foreach ($keys as $k) {
                    $nk = strtolower(trim(preg_replace('/\s+/', ' ', (string) $k) ?? (string) $k));
                    $nk = str_replace(['.', '/', '\\', '(', ')', '[', ']'], '', $nk);
                    $nk = str_replace([' ', '-'], ['_', '_'], $nk);
                    if (isset($map[$nk])) {
                        $v = $row[$map[$nk]] ?? '';

                        return trim((string) $v);
                    }
                }

                return null;
            };

            $session = $g($headerMap, $cells, ['session', 'school year', 'school_year']) ?? '';
            $sy = $g($headerMap, $cells, ['sy', 'school year', 'school_year']) ?? '';
            $studentId = $this->normalizeStudentId($g($headerMap, $cells, [
                'student id',
                'student_id',
                'studentid',
                'student no',
                'student no.',
                'student number',
                'id number',
                'id no',
                'idno',
                'id_no',
            ]) ?? '');
            $studentName = trim((string) ($g($headerMap, $cells, ['name', 'student name', 'student_name', 'full name']) ?? ''));
            $course = trim((string) ($g($headerMap, $cells, ['course', 'program', 'program/course', 'degree']) ?? ''));
            $yearLevelColumn = trim((string) ($g($headerMap, $cells, [
                'year level',
                'year_level',
                'yr level',
                'yr_level',
                'year',
            ]) ?? ''));
            $semesterColumn = trim((string) ($g($headerMap, $cells, ['semester', 'sem']) ?? ''));
            [$yearLevelText, $yearSemCode] = $this->normalizeYearLevelAndSemesterFields(
                $yearLevelColumn,
                $semesterColumn
            );
            $subjectCode = trim((string) ($g($headerMap, $cells, [
                'code',
                'subject code',
                'subject_code',
                'subj code',
                'course code',
            ]) ?? ''));
            $sectionCode = $g($headerMap, $cells, ['section', 'section code', 'section_code']);
            $remarks = $g($headerMap, $cells, [
                'remarks',
                'remark',
                'status',
                'remarks_final',
                'remarks final',
            ]);
            $gradeCol = $g($headerMap, $cells, [
                'grade',
                'final grade',
                'final_grade',
                'grade_final',
                'computed grade',
                'completion grade',
                'completion_grade',
            ]);
            if ($gradeCol === null || trim((string) $gradeCol) === '') {
                $gradeCol = $g($headerMap, $cells, ['grade_final', 're_grade', 're-grade']);
            }
            $modalityName = $g($headerMap, $cells, ['modality', 'mode']);
            $admissionType = $g($headerMap, $cells, [
                'admission type',
                'admission_type',
                'admission',
                'student type',
                'entry type',
            ]);

            if ($session === '') {
                $session = $this->composeSessionFromParts($sy, $yearSemCode, $yearLevelText);
            }

            $modalityId = $this->modalityIdFromName($modalities, $modalityName);

            return [
                'session' => $session,
                'student_id_number' => $studentId,
                'student_name' => $studentName,
                'course' => $course,
                'year_level_text' => $yearLevelText,
                'year_sem_code' => $yearSemCode,
                'subject_code' => strtoupper($subjectCode),
                'section_code' => $sectionCode !== null && $sectionCode !== '' ? $sectionCode : null,
                'modality_id' => $modalityId,
                'grade' => $this->normalizeGradeValue($gradeCol),
                'evaluation_status' => $this->normalizeEvaluationStatus($remarks, $gradeCol),
                'admission_type' => $admissionType !== null ? trim((string) $admissionType) : null,
            ];
        }

        return $this->parseOneRowPositional($cells, $modalities, $rowNumber);
    }

    /**
     * Positional layout: 0..11 fixed (session … section), variable instructors, then modality…remarks.
     *
     * @param  list<string>  $cells
     * @param  array<string, int>  $modalities
     * @return array<string, mixed>|null
     */
    private function parseOneRowPositional(array $cells, array $modalities, int $rowNumber): ?array
    {
        $n = count($cells);
        if ($n < 22) {
            return null;
        }

        $session = trim((string) ($cells[0] ?? ''));
        $course = trim((string) ($cells[2] ?? ''));
        $studentId = $this->normalizeStudentId(trim((string) ($cells[3] ?? '')));
        $studentName = trim((string) ($cells[4] ?? ''));
        [$yearLevelText, $yearSemCode] = $this->normalizeYearLevelAndSemesterFields(
            trim((string) ($cells[5] ?? '')),
            trim((string) ($cells[6] ?? ''))
        );
        $subjectCode = strtoupper(trim((string) ($cells[7] ?? '')));
        $sectionCode = trim((string) ($cells[11] ?? ''));
        if ($sectionCode === '') {
            $sectionCode = null;
        }

        $modIdx = $this->findModalityStartIndex($cells, $modalities, 12);
        if ($modIdx === null || $modIdx < 12) {
            return null;
        }

        $tail = array_slice($cells, $modIdx);
        $tailParsed = $this->parseTailColumns($tail);
        if ($tailParsed === null) {
            return null;
        }

        $modalityId = $this->modalityIdFromName($modalities, $tailParsed['modality']);

        return [
            'session' => $session,
            'student_id_number' => $studentId,
            'student_name' => $studentName,
            'course' => $course,
            'year_level_text' => $yearLevelText,
            'year_sem_code' => $yearSemCode,
            'subject_code' => $subjectCode,
            'section_code' => $sectionCode,
            'modality_id' => $modalityId,
            'grade' => $this->normalizeGradeValue($tailParsed['grade']),
            'evaluation_status' => $this->normalizeEvaluationStatus($tailParsed['remarks'], $tailParsed['grade']),
            'admission_type' => $tailParsed['admission'] !== '' ? $tailParsed['admission'] : null,
        ];
    }

    /**
     * @param  list<string>  $cells
     * @param  array<string, int>  $modalities
     */
    private function findModalityStartIndex(array $cells, array $modalities, int $from): ?int
    {
        $n = count($cells);
        $knownTokens = array_unique(array_merge(
            array_keys($modalities),
            ['flex', 'f2f', 'online', 'hybrid', 'modular', 'face to face', 'blended']
        ));

        for ($i = $from; $i < $n; $i++) {
            $t = strtolower(trim((string) ($cells[$i] ?? '')));
            if ($t === '' || $t === '-') {
                continue;
            }
            if (isset($modalities[$t]) || in_array($t, $knownTokens, true)) {
                return $i;
            }
        }

        return null;
    }

    /**
     * Tail from modality token: modality, enlistment, admission, gender, p1–p3, fe (optional), grade, remarks.
     *
     * @param  list<string>  $tail
     * @return array{modality: string, enlistment: string, admission: string, gender: string, p1: string, p2: string, p3: string, fe: ?string, grade: string, remarks: string}|null
     */
    private function parseTailColumns(array $tail): ?array
    {
        $m = count($tail);
        if ($m < 9) {
            return null;
        }

        $modality = trim((string) $tail[0]);
        if ($m === 9) {
            return [
                'modality' => $modality,
                'enlistment' => trim((string) $tail[1]),
                'admission' => trim((string) $tail[2]),
                'gender' => trim((string) $tail[3]),
                'p1' => trim((string) $tail[4]),
                'p2' => trim((string) $tail[5]),
                'p3' => trim((string) $tail[6]),
                'fe' => null,
                'grade' => trim((string) $tail[7]),
                'remarks' => trim((string) $tail[8]),
            ];
        }

        if ($m >= 10) {
            return [
                'modality' => $modality,
                'enlistment' => trim((string) $tail[1]),
                'admission' => trim((string) $tail[2]),
                'gender' => trim((string) $tail[3]),
                'p1' => trim((string) $tail[4]),
                'p2' => trim((string) $tail[5]),
                'p3' => trim((string) $tail[6]),
                'fe' => trim((string) $tail[7]),
                'grade' => trim((string) $tail[8]),
                'remarks' => trim((string) $tail[9]),
            ];
        }

        return null;
    }

    /**
     * @return array<string, int>
     */
    private function loadModalityLookup(): array
    {
        $out = [];
        foreach (Modality::query()->get(['modality_id', 'modality_name']) as $row) {
            $name = strtolower(trim((string) $row->modality_name));
            if ($name !== '') {
                $out[$name] = (int) $row->modality_id;
            }
        }

        return $out;
    }

    /**
     * @param  array<string, int>  $modalities
     */
    private function modalityIdFromName(array $modalities, ?string $name): ?int
    {
        if ($name === null || trim($name) === '' || trim($name) === '-') {
            return null;
        }
        $k = strtolower(trim($name));
        if (isset($modalities[$k])) {
            return $modalities[$k];
        }
        if (strlen($k) >= 3) {
            foreach ($modalities as $dbName => $id) {
                if ($dbName !== '' && strlen($dbName) >= 3 && (str_contains($dbName, $k) || str_contains($k, $dbName))) {
                    return $id;
                }
            }
        }

        return null;
    }

    private function composeSessionFromParts(?string $sy, ?string $semesterText, ?string $yearLevelText): string
    {
        $sy = trim((string) $sy);
        $semToken = $this->semesterTokenForSession($semesterText);
        if ($sy !== '' && $semToken !== '') {
            return $sy.' '.$semToken;
        }
        if ($sy !== '') {
            return $sy;
        }

        return trim((string) $yearLevelText);
    }

    private function semesterTokenForSession(?string $text): string
    {
        $u = strtoupper(trim((string) $text));
        if ($u === '') {
            return '';
        }
        if (preg_match('/\b(3|THIRD|III|SUMMER)\b/', $u) || preg_match('/\b3(?:RD|RD\s)?\s*SEM/i', $u)) {
            return 'SEM III';
        }
        if (preg_match('/\b(2|SECOND|II)\b/', $u) || preg_match('/\b2(?:ND|ND\s)?\s*SEM/i', $u) || preg_match('/\bSEM\s*II\b/', $u)) {
            return 'SEM II';
        }
        if (preg_match('/\b(1|FIRST|I)\b/', $u) || preg_match('/\b1(?:ST|ST\s)?\s*SEM/i', $u) || preg_match('/\bSEM\s*I\b/', $u)) {
            return 'SEM I';
        }

        return '';
    }

    private function normalizeStudentId(string $raw): string
    {
        $s = trim($raw);
        $s = preg_replace("/^['\x{2018}\x{2019}]+/u", '', $s) ?? $s;

        return trim($s);
    }

    private function normalizeGradeValue(?string $v): ?string
    {
        if ($v === null) {
            return null;
        }
        $t = strtoupper(trim($v));
        if ($t === '' || $t === '-' || $t === 'N/A' || $t === 'NA') {
            return null;
        }

        return trim($v);
    }

    private function normalizeEvaluationStatus(?string $remarks, ?string $gradeCol): ?string
    {
        $r = strtolower(trim((string) $remarks));
        $g = strtoupper(trim((string) $gradeCol));

        // SIS "NO CREDIT" / grade NC — treat as failed (no credit earned).
        if (
            $g === 'NC'
            || $r === 'nc'
            || $r === 'n/c'
            || str_contains($r, 'no credit')
            || str_contains($r, 'nocredit')
        ) {
            return 'failed';
        }

        if ($r === 'passed' || $r === 'pass' || $r === 'complete') {
            return 'passed';
        }
        if ($r === 'failed' || $r === 'fail') {
            return 'failed';
        }
        if ($r === 'dropped' || $r === 'drop') {
            return 'dropped';
        }
        if (str_contains($r, 'inc') || $r === 'incomplete') {
            return 'incomplete';
        }
        if ($r === 'ongoing') {
            return 'ongoing';
        }
        if ($g === 'COMPLETE' || $r === 'complete') {
            return 'complete';
        }

        // Never pass through raw REMARKS text — validator only allows known statuses.
        $allowed = ['passed', 'failed', 'ongoing', 'dropped', 'incomplete', 'inc', 'complete'];
        if (in_array($r, $allowed, true)) {
            return $r === 'inc' ? 'incomplete' : $r;
        }

        return null;
    }

    /**
     * @return array{0: ?int, 1: ?int}
     */
    public function resolveTerm(?string $session, ?int $overrideAy, ?int $overrideSem): array
    {
        if ($overrideAy !== null && $overrideSem !== null) {
            return [$overrideAy, $overrideSem];
        }

        $session = $session !== null ? trim($session) : '';
        if ($session === '') {
            return [null, null];
        }

        $ayId = $this->guessAcademicYearId($session);
        if ($ayId === null) {
            $ayId = $this->ensureAcademicYearFromSession($session);
        }
        $semId = $this->guessSemesterId($session);

        return [$ayId, $semId];
    }

    /**
     * Parse school-year bounds from SESSION text (e.g. SY 25-26 / 2025-2026 / A.Y. 2025-2026).
     *
     * @return array{0: int, 1: int}|null  [startYear, endYear]
     */
    public function parseSessionAcademicYearBounds(string $session): ?array
    {
        $session = trim($session);
        if ($session === '') {
            return null;
        }

        if (preg_match('/(\d{4})\s*[-–\/]\s*(\d{4})/', $session, $full)) {
            return [(int) $full[1], (int) $full[2]];
        }

        if (preg_match('/(?:SY|A\.?Y\.?|AY)\s*(\d{2})\s*[-–\/]\s*(\d{2})/i', $session, $m)
            || preg_match('/(?:^|[^\d])(\d{2})\s*[-–\/]\s*(\d{2})(?:[^\d]|$)/', $session, $m)) {
            $y1 = (int) $m[1];
            $y2 = (int) $m[2];

            return [2000 + $y1, 2000 + $y2];
        }

        return null;
    }

    /**
     * Normalize Lookup academic_year_name for SESSION matching.
     */
    private function normalizeAcademicYearLabel(string $name): string
    {
        $n = strtoupper(trim($name));
        $n = preg_replace('/\s+/', ' ', $n) ?? $n;
        $n = preg_replace('/^(SY|A\.?Y\.?|AY)\s*/', '', $n) ?? $n;
        $n = str_replace(['–', '/'], '-', $n);

        return trim($n);
    }

    private function guessAcademicYearId(string $session): ?int
    {
        $bounds = $this->parseSessionAcademicYearBounds($session);
        if ($bounds === null) {
            return null;
        }
        [$full1, $full2] = $bounds;
        if ($full1 <= 0 || $full2 <= 0 || $full2 < $full1) {
            return null;
        }

        $canonical = sprintf('%d-%d', $full1, $full2);
        $short = sprintf('%02d-%02d', $full1 % 100, $full2 % 100);

        foreach (AcademicYear::query()->orderBy('academic_year_id')->get() as $ay) {
            $raw = trim((string) $ay->academic_year_name);
            $norm = $this->normalizeAcademicYearLabel($raw);

            // Exact canonical match: 2025-2026
            if ($norm === $canonical || $raw === $canonical) {
                return (int) $ay->academic_year_id;
            }
            // Short form: 25-26
            if ($norm === $short) {
                return (int) $ay->academic_year_id;
            }
            // Contains both full years (e.g. "SY 2025-2026", "A.Y. 2025 – 2026")
            if (str_contains($norm, (string) $full1) && str_contains($norm, (string) $full2)) {
                return (int) $ay->academic_year_id;
            }
        }

        return null;
    }

    /**
     * Create Lookup Academic Year from SESSION when missing (binds SY 25-26 → 2025-2026).
     */
    private function ensureAcademicYearFromSession(string $session): ?int
    {
        $bounds = $this->parseSessionAcademicYearBounds($session);
        if ($bounds === null) {
            return null;
        }
        [$full1, $full2] = $bounds;
        if ($full1 <= 0 || $full2 <= 0 || $full2 < $full1) {
            return null;
        }

        $canonical = sprintf('%d-%d', $full1, $full2);

        // Re-check with normalizer in case DB has "SY 2025-2026"
        $matched = $this->guessAcademicYearId($canonical);
        if ($matched !== null) {
            return $matched;
        }

        $existing = AcademicYear::query()
            ->where('academic_year_name', $canonical)
            ->value('academic_year_id');
        if ($existing !== null) {
            return (int) $existing;
        }

        $created = AcademicYear::create([
            'academic_year_name' => $canonical,
            'status' => 'active',
        ]);

        return (int) $created->academic_year_id;
    }

    private function guessSemesterId(string $session): ?int
    {
        $u = strtoupper($session);
        $order = null;
        // Prefer explicit digit forms (SEM 1 / SEM 2) before Roman numerals.
        if (preg_match('/\bSEM(?:ESTER)?\s*(?:III|3|THIRD)\b/', $u) || preg_match('/\bSUMMER\b/', $u)) {
            $order = 3;
        } elseif (preg_match('/\bSEM(?:ESTER)?\s*(?:II|2|SECOND)\b/', $u)) {
            $order = 2;
        } elseif (preg_match('/\bSEM(?:ESTER)?\s*(?:I|1|FIRST)\b/', $u)) {
            $order = 1;
        }

        $ids = Semester::query()->orderBy('semester_id')->pluck('semester_id')->all();
        if ($ids === [] || $order === null) {
            return null;
        }
        $idx = min(max($order, 1), count($ids)) - 1;

        return (int) $ids[$idx];
    }

    private function resolveSectionId(?string $sectionCode, ?int $academicYearId): ?int
    {
        if ($sectionCode === null || $sectionCode === '') {
            return null;
        }

        $q = Section::query()->where('section_name', $sectionCode);
        if ($academicYearId !== null) {
            $q->where('academic_year_id', $academicYearId);
        }
        $id = $q->value('section_id');

        return $id !== null ? (int) $id : null;
    }
}
