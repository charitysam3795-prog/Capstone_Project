<?php
declare(strict_types=1);

$pdo = new PDO('mysql:host=127.0.0.1;port=3307;dbname=capstone_app;charset=utf8mb4', 'root', '', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

// Target program (adjust if your BSIT program_id differs)
$programId = 1;
$passingGrade = 50;

// Subject list extracted from the provided curriculum images.
// units, hours are approximated from the table where legibility is low.
$subjects = [
    // 2nd Year 1st Sem
    ['code' => 'ITE298', 'name' => 'Information Management (including Fundamentals of Database Systems)', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE300', 'name' => 'Object-Oriented Programming', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE292', 'name' => 'Networking 1', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE031', 'name' => 'Data Structures and Algorithms', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE083', 'name' => 'IT Project Management', 'units' => 3, 'hours' => 3],
    ['code' => 'HIS007', 'name' => 'Life and Works of Rizal', 'units' => 3, 'hours' => 3],
    ['code' => 'GEN003', 'name' => 'Science, Technology, and Society', 'units' => 3, 'hours' => 3],
    ['code' => 'PED032', 'name' => 'Physical Activities Toward Health and Fitness 3 (PATHFit 3): Individual and Dual Sports', 'units' => 2, 'hours' => 2],
    ['code' => 'SSP005', 'name' => 'Student Success Program 1', 'units' => 1, 'hours' => 1],

    // 2nd Year 2nd Sem
    ['code' => 'ITE393', 'name' => 'Applications Development (Emerging Technologies) including Event-Driven Programming', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE400', 'name' => 'Systems Integration and Architecture', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE360', 'name' => 'Web Systems and Technologies', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE380', 'name' => 'Human Computer Interaction', 'units' => 3, 'hours' => 3],
    ['code' => 'GEN004', 'name' => 'Readings in Philippine History', 'units' => 3, 'hours' => 3],
    ['code' => 'GEN009', 'name' => 'The Entrepreneurial Mind', 'units' => 3, 'hours' => 3],
    ['code' => 'GEN013', 'name' => 'People and the Earth\'s Ecosystem', 'units' => 3, 'hours' => 3],
    ['code' => 'PED033', 'name' => 'Physical Activities Toward Health and Fitness 4 (PATHFit 4): Team Sports', 'units' => 2, 'hours' => 2],
    ['code' => 'SSP006', 'name' => 'Student Success Program 2', 'units' => 1, 'hours' => 1],

    // 3rd Year 1st Sem
    ['code' => 'ITE359', 'name' => 'Networking 2', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE369', 'name' => 'Information Assurance and Security 1', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE353', 'name' => 'Data Scalability and Analytics', 'units' => 3, 'hours' => 3],
    ['code' => 'ITE307', 'name' => 'Quantitative Methods (including Modeling and Simulation)', 'units' => 3, 'hours' => 3],
    ['code' => 'ITE397', 'name' => 'Advanced Database Systems (including Advanced Systems Integration and Architecture)', 'units' => 3, 'hours' => 4],
    ['code' => 'ITEL1',  'name' => 'IT Electives 1', 'units' => 3, 'hours' => 3],
    ['code' => 'SSP007', 'name' => 'Student Success Program 3', 'units' => 1, 'hours' => 1],

    // 3rd Year 2nd Sem
    ['code' => 'ITE309', 'name' => 'Capstone Project and Research 1', 'units' => 3, 'hours' => 3],
    ['code' => 'ITE293', 'name' => 'Systems Administration and Maintenance', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE370', 'name' => 'Information Assurance and Security 2', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE401', 'name' => 'Platform Technologies', 'units' => 3, 'hours' => 4],
    ['code' => 'ITEL2',  'name' => 'IT Electives 2', 'units' => 3, 'hours' => 3],
    ['code' => 'ITEL3',  'name' => 'IT Electives 3', 'units' => 3, 'hours' => 3],
    ['code' => 'SSP008', 'name' => 'Student Success Program 4', 'units' => 1, 'hours' => 1],

    // 4th Year 1st Sem
    ['code' => 'ITE310', 'name' => 'Capstone Project and Research 2', 'units' => 3, 'hours' => 3],
    ['code' => 'ITEL4',  'name' => 'IT Electives 4', 'units' => 3, 'hours' => 3],
    ['code' => 'ITE381', 'name' => 'IT Business Solutions', 'units' => 3, 'hours' => 3],
    ['code' => 'ITE367', 'name' => 'Managing IT Resources (including Social and Professional Issues)', 'units' => 3, 'hours' => 3],

    // 4th Year 2nd Sem
    ['code' => 'ITE311', 'name' => 'IT Practicum (486 hrs.)', 'units' => 6, 'hours' => 6],

    // IT Elective pools
    ['code' => 'BAM285', 'name' => 'Business Analysis for IT', 'units' => 3, 'hours' => 4],
    ['code' => 'BAM286', 'name' => 'Applied Analytics in Business for IT', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE382', 'name' => 'Intelligent Systems', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE383', 'name' => 'Network Security', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE384', 'name' => 'Computer Forensics', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE385', 'name' => 'Ethical Hacking', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE387', 'name' => 'Advanced Programming', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE235', 'name' => 'Game Development', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE386', 'name' => 'Cloud Programming', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE391', 'name' => 'Freehand and Digital Drawing', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE392', 'name' => 'Scriptwriting and Story Board Design', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE240', 'name' => '3D Animation', 'units' => 3, 'hours' => 4],
    ['code' => 'ITE388', 'name' => 'Clean-up and In-between for IT', 'units' => 3, 'hours' => 4],
];

// Curriculum rows (year_level uses your existing numeric mapping where 1=1st year, 2=2nd, etc.)
$curriculumRows = [
    // 2nd year
    ['code' => 'ITE298', 'year' => 2, 'sem' => 1, 'type' => 'core'],
    ['code' => 'ITE300', 'year' => 2, 'sem' => 1, 'type' => 'core'],
    ['code' => 'ITE292', 'year' => 2, 'sem' => 1, 'type' => 'core'],
    ['code' => 'ITE031', 'year' => 2, 'sem' => 1, 'type' => 'core'],
    ['code' => 'ITE083', 'year' => 2, 'sem' => 1, 'type' => 'core'],
    ['code' => 'HIS007', 'year' => 2, 'sem' => 1, 'type' => 'minor'],
    ['code' => 'GEN003', 'year' => 2, 'sem' => 1, 'type' => 'minor'],
    ['code' => 'PED032', 'year' => 2, 'sem' => 1, 'type' => 'minor'],
    ['code' => 'SSP005', 'year' => 2, 'sem' => 1, 'type' => 'minor'],

    ['code' => 'ITE393', 'year' => 2, 'sem' => 2, 'type' => 'core'],
    ['code' => 'ITE400', 'year' => 2, 'sem' => 2, 'type' => 'core'],
    ['code' => 'ITE360', 'year' => 2, 'sem' => 2, 'type' => 'core'],
    ['code' => 'ITE380', 'year' => 2, 'sem' => 2, 'type' => 'core'],
    ['code' => 'GEN004', 'year' => 2, 'sem' => 2, 'type' => 'minor'],
    ['code' => 'GEN009', 'year' => 2, 'sem' => 2, 'type' => 'minor'],
    ['code' => 'GEN013', 'year' => 2, 'sem' => 2, 'type' => 'minor'],
    ['code' => 'PED033', 'year' => 2, 'sem' => 2, 'type' => 'minor'],
    ['code' => 'SSP006', 'year' => 2, 'sem' => 2, 'type' => 'minor'],

    // 3rd year
    ['code' => 'ITE359', 'year' => 3, 'sem' => 1, 'type' => 'core'],
    ['code' => 'ITE369', 'year' => 3, 'sem' => 1, 'type' => 'core'],
    ['code' => 'ITE353', 'year' => 3, 'sem' => 1, 'type' => 'core'],
    ['code' => 'ITE307', 'year' => 3, 'sem' => 1, 'type' => 'core'],
    ['code' => 'ITE397', 'year' => 3, 'sem' => 1, 'type' => 'core'],
    ['code' => 'ITEL1',  'year' => 3, 'sem' => 1, 'type' => 'elective'],
    ['code' => 'SSP007', 'year' => 3, 'sem' => 1, 'type' => 'minor'],

    ['code' => 'ITE309', 'year' => 3, 'sem' => 2, 'type' => 'core'],
    ['code' => 'ITE293', 'year' => 3, 'sem' => 2, 'type' => 'core'],
    ['code' => 'ITE370', 'year' => 3, 'sem' => 2, 'type' => 'core'],
    ['code' => 'ITE401', 'year' => 3, 'sem' => 2, 'type' => 'core'],
    ['code' => 'ITEL2',  'year' => 3, 'sem' => 2, 'type' => 'elective'],
    ['code' => 'ITEL3',  'year' => 3, 'sem' => 2, 'type' => 'elective'],
    ['code' => 'SSP008', 'year' => 3, 'sem' => 2, 'type' => 'minor'],

    // 4th year
    ['code' => 'ITE310', 'year' => 4, 'sem' => 1, 'type' => 'core'],
    ['code' => 'ITEL4',  'year' => 4, 'sem' => 1, 'type' => 'elective'],
    ['code' => 'ITE381', 'year' => 4, 'sem' => 1, 'type' => 'core'],
    ['code' => 'ITE367', 'year' => 4, 'sem' => 1, 'type' => 'core'],
    ['code' => 'ITE311', 'year' => 4, 'sem' => 2, 'type' => 'core'],
];

// Key prerequisite relationships (best-effort from visible curriculum notes)
$prereqs = [
    ['subject' => 'ITE300', 'requires' => 'ITE188'],
    ['subject' => 'ITE292', 'requires' => 'ITE186'],
    ['subject' => 'ITE031', 'requires' => 'ITE186'],
    ['subject' => 'ITE083', 'requires' => 'ITE186'],
    ['subject' => 'PED032', 'requires' => 'PED031'],
    ['subject' => 'ITE393', 'requires' => 'ITE031'],
    ['subject' => 'ITE400', 'requires' => 'ITE366'],
    ['subject' => 'ITE360', 'requires' => 'ITE250'],
    ['subject' => 'ITE380', 'requires' => 'ITE399'],
    ['subject' => 'PED033', 'requires' => 'PED032'],
    ['subject' => 'SSP006', 'requires' => 'SSP005'],
    ['subject' => 'ITE359', 'requires' => 'ITE292'],
    ['subject' => 'ITE307', 'requires' => 'MAT132'],
    ['subject' => 'ITE397', 'requires' => 'ITE298'],
    ['subject' => 'ITE309', 'requires' => 'ITE400'],
    ['subject' => 'ITE293', 'requires' => 'ITE359'],
    ['subject' => 'ITE370', 'requires' => 'ITE369'],
    ['subject' => 'ITE401', 'requires' => 'ITE393'],
    ['subject' => 'ITEL2',  'requires' => 'ITEL1'],
    ['subject' => 'ITEL3',  'requires' => 'ITEL1'],
    ['subject' => 'SSP008', 'requires' => 'SSP007'],
    ['subject' => 'ITE310', 'requires' => 'ITE309'],
    ['subject' => 'ITEL4',  'requires' => 'ITEL1'],
    ['subject' => 'ITE381', 'requires' => 'ITE309'],
    ['subject' => 'ITE367', 'requires' => 'ITE369'],
];

try {
    $pdo->beginTransaction();

    // Build subject map
    $existing = [];
    $rs = $pdo->query("SELECT subject_id, subject_code FROM tbl_subjects");
    foreach ($rs as $row) {
        $existing[strtoupper(trim($row['subject_code']))] = (int)$row['subject_id'];
    }

    $insertSubject = $pdo->prepare("
        INSERT INTO tbl_subjects (subject_code, subject_name, number_of_units, number_of_hrs)
        VALUES (:code, :name, :units, :hrs)
    ");

    $addedSubjects = 0;
    foreach ($subjects as $s) {
        $code = strtoupper(trim($s['code']));
        if (!isset($existing[$code])) {
            $insertSubject->execute([
                ':code' => $code,
                ':name' => $s['name'],
                ':units' => $s['units'],
                ':hrs' => $s['hours'],
            ]);
            $existing[$code] = (int)$pdo->lastInsertId();
            $addedSubjects++;
        }
    }

    // Refresh map with possible existing newly-inserted IDs
    $subjectIdByCode = [];
    $rs = $pdo->query("SELECT subject_id, subject_code FROM tbl_subjects");
    foreach ($rs as $row) {
        $subjectIdByCode[strtoupper(trim($row['subject_code']))] = (int)$row['subject_id'];
    }

    $insertCurr = $pdo->prepare("
        INSERT INTO curriculum (program_id, subject_id, year_level, semester_id, passing_grade, subject_type, requisite_id)
        VALUES (:program, :subject, :year, :sem, :pass, :type, NULL)
    ");

    $existsCurr = $pdo->prepare("
        SELECT curriculum_id
        FROM curriculum
        WHERE program_id = :program
          AND subject_id = :subject
          AND year_level = :year
          AND semester_id = :sem
        LIMIT 1
    ");

    $addedCurr = 0;
    foreach ($curriculumRows as $r) {
        $code = strtoupper($r['code']);
        if (!isset($subjectIdByCode[$code])) {
            continue;
        }
        $subjectId = $subjectIdByCode[$code];
        $existsCurr->execute([
            ':program' => $programId,
            ':subject' => $subjectId,
            ':year' => $r['year'],
            ':sem' => $r['sem'],
        ]);
        if (!$existsCurr->fetchColumn()) {
            $insertCurr->execute([
                ':program' => $programId,
                ':subject' => $subjectId,
                ':year' => $r['year'],
                ':sem' => $r['sem'],
                ':pass' => $passingGrade,
                ':type' => $r['type'],
            ]);
            $addedCurr++;
        }
    }

    // Add prerequisites (if both subjects exist)
    $existsReq = $pdo->prepare("
        SELECT requisites_id
        FROM tbl_prerequisite
        WHERE subject_id = :subject
          AND requisite_type = 'Prerequisite'
          AND requisites_subject_id = :required
        LIMIT 1
    ");
    $insReq = $pdo->prepare("
        INSERT INTO tbl_prerequisite (subject_id, requisite_type, requisites_subject_id)
        VALUES (:subject, 'Prerequisite', :required)
    ");

    $addedReq = 0;
    foreach ($prereqs as $p) {
        $s = strtoupper($p['subject']);
        $r = strtoupper($p['requires']);
        if (!isset($subjectIdByCode[$s], $subjectIdByCode[$r])) {
            continue;
        }
        $sid = $subjectIdByCode[$s];
        $rid = $subjectIdByCode[$r];

        $existsReq->execute([':subject' => $sid, ':required' => $rid]);
        if (!$existsReq->fetchColumn()) {
            $insReq->execute([':subject' => $sid, ':required' => $rid]);
            $addedReq++;
        }
    }

    $pdo->commit();
    echo "Import complete.\n";
    echo "Subjects added: {$addedSubjects}\n";
    echo "Curriculum rows added: {$addedCurr}\n";
    echo "Prerequisites added: {$addedReq}\n";
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "Import failed: " . $e->getMessage() . "\n");
    exit(1);
}

