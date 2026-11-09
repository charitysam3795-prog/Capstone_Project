<?php
$pdo = new PDO('mysql:host=127.0.0.1;port=3307;dbname=capstone_app;charset=utf8mb4', 'root', '', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

$codes = [
    'ITE298','ITE300','ITE292','ITE031','ITE083','HIS007','GEN003','PED032','SSP005',
    'ITE393','ITE400','ITE360','ITE380','GEN004','GEN009','GEN013','PED033','SSP006',
    'ITE359','ITE369','ITE353','ITE307','ITE397','ITEL1','SSP007',
    'ITE309','ITE293','ITE370','ITE401','ITEL2','ITEL3','SSP008',
    'ITE310','ITEL4','ITE381','ITE367','ITE311',
    'BAM285','BAM286','ITE382','ITE383','ITE384','ITE385','ITE387','ITE235','ITE386','ITE391','ITE392','ITE240','ITE388'
];

$in = "'" . implode("','", $codes) . "'";
$subjectCount = (int)$pdo->query("SELECT COUNT(*) FROM tbl_subjects WHERE UPPER(subject_code) IN ({$in})")->fetchColumn();
$currCount = (int)$pdo->query("
    SELECT COUNT(*) FROM curriculum c
    JOIN tbl_subjects s ON s.subject_id = c.subject_id
    WHERE c.program_id = 1
      AND c.year_level IN (2,3,4)
      AND UPPER(s.subject_code) IN ({$in})
")->fetchColumn();
$reqCount = (int)$pdo->query("
    SELECT COUNT(*) FROM tbl_prerequisite p
    JOIN tbl_subjects s ON s.subject_id = p.subject_id
    WHERE UPPER(s.subject_code) IN ({$in})
")->fetchColumn();

echo "Imported subject codes present: {$subjectCount}\n";
echo "Curriculum rows for Y2-Y4 (program 1): {$currCount}\n";
echo "Prerequisite rows linked to imported subjects: {$reqCount}\n";

