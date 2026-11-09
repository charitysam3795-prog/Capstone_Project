<?php

$header = [
    'SESSION', 'COLLEGE', 'COURSE', 'STUDENT ID', 'NAME', 'YEAR LEVEL', 'SEMESTER',
    'CODE', 'SUBJECT NAME', 'SUBJECT TYPE', 'UNITS', 'SECTION', 'TEACHER 1',
    'SECTION 2', 'TEACHER 2', 'MODALITY', 'ENLISTMENT MODE', 'ADMISSION TYPE',
    'GENDER', 'P1', 'P2', 'P3', 'GRADE', 'REMARKS',
];

$subjects = [
    ['ITE 366', 'Introduction to Computing (Including IT Fundamentals)', 'core', 3],
    ['ITE 260', 'Computer Programming 1', 'core', 3],
    ['GEN 002', 'UNDERSTAND THE SELF', 'minor', 3],
    ['MAT 152', 'Mathematics in the Modern World', 'minor', 3],
    ['GEN 001', 'Purposive Communication', 'minor', 3],
    ['GEN 006', 'Ethics', 'minor', 3],
    ['PED 030', 'Physical Activities Towards Health and Fitness(PATHFit1) Movement Competency Training', 'minor', 2],
    ['NST 021', 'National Service Training Program 1', 'minor', 3],
];

$students = [
    [
        'file' => '01_regular_bsit_y1s1.csv',
        'id' => '25-9101',
        'name' => 'DELA CRUZ, ANA REGULAR',
        'admission' => 'Regular',
        'gender' => 'Female',
        'fail_codes' => [],
    ],
    [
        'file' => '02_irregular_bsit_y1s1.csv',
        'id' => '25-9102',
        'name' => 'REYES, BEN IRREGULAR',
        'admission' => 'Regular',
        'gender' => 'Male',
        // Fail Programming 1 so evaluation sequence becomes Irregular
        'fail_codes' => ['ITE 260'],
    ],
    [
        'file' => '03_shiftee_bsit_y1s1.csv',
        'id' => '25-9103',
        'name' => 'LIM, CARA SHIFTEE',
        'admission' => 'Shiftee',
        'gender' => 'Female',
        'fail_codes' => [],
    ],
    [
        'file' => '04_transferee_bsit_y1s1.csv',
        'id' => '25-9104',
        'name' => 'ONG, DAN TRANSFEREE',
        'admission' => 'Transferee',
        'gender' => 'Male',
        'fail_codes' => [],
    ],
    [
        'file' => '05_returnee_bsit_y1s1.csv',
        'id' => '25-9105',
        'name' => 'GO, EVA RETURNEE',
        'admission' => 'Returnee',
        'gender' => 'Female',
        'fail_codes' => [],
    ],
];

$outDir = dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'sample_data' . DIRECTORY_SEPARATOR . 'entry_type_samples';
if (! is_dir($outDir)) {
    mkdir($outDir, 0777, true);
}

$csvLine = static function (array $cols): string {
    $escaped = array_map(static function ($v) {
        $s = (string) $v;
        if (str_contains($s, ',') || str_contains($s, '"') || str_contains($s, "\n")) {
            return '"' . str_replace('"', '""', $s) . '"';
        }
        return $s;
    }, $cols);

    return implode(',', $escaped);
};

$buildRows = static function (array $student) use ($subjects, $csvLine, $header): array {
    $lines = [$csvLine($header)];
    foreach ($subjects as $i => $sub) {
        [$code, $title, $type, $units] = $sub;
        $failed = in_array($code, $student['fail_codes'], true);
        $grade = $failed ? '5.00' : ['1.50', '1.75', '2.00', '1.75', '2.00', '1.50', '1.25', '1.75'][$i];
        $remarks = $failed ? 'Failed' : 'Passed';
        $p1 = $failed ? '55' : (string) (80 + $i);
        $p2 = $failed ? '58' : (string) (82 + $i);
        $p3 = $failed ? '52' : (string) (84 + $i);

        $lines[] = $csvLine([
            'SY 25-26 SEM I',
            'College of Information Technology',
            'Bachelor of Science in Information Technology',
            "'" . $student['id'],
            $student['name'],
            'Y1S1',
            'YEAR 1',
            $code,
            $title,
            $type,
            $units,
            'COC-FAB-BSIT1-01',
            'JUAN FACULTY',
            'COC-FAB-BSIT1-01',
            'MARIA FACULTY',
            'FLEX',
            'Regular',
            $student['admission'],
            $student['gender'],
            $p1,
            $p2,
            $p3,
            $grade,
            $remarks,
        ]);
    }

    return $lines;
};

$allLines = [$csvLine($header)];
foreach ($students as $student) {
    $lines = $buildRows($student);
    file_put_contents($outDir . DIRECTORY_SEPARATOR . $student['file'], implode("\n", $lines) . "\n");
    // skip header for combined file
    foreach (array_slice($lines, 1) as $line) {
        $allLines[] = $line;
    }
    echo "Wrote {$student['file']}\n";
}

file_put_contents(
    $outDir . DIRECTORY_SEPARATOR . 'all_entry_types_bsit_y1s1.csv',
    implode("\n", $allLines) . "\n"
);
echo "Wrote all_entry_types_bsit_y1s1.csv\n";
