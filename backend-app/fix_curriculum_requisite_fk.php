<?php
$host = '127.0.0.1';
$port = 3307;
$user = 'root';
$pass = '';
$db = 'capstone_app';

$conn = new PDO("mysql:host={$host};port={$port};dbname={$db}", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

// Count orphans: curriculum.requisite_id values not present in tbl_prerequisite.requisites_id
$orphanCount = $conn->query("
    SELECT COUNT(*) 
    FROM curriculum c
    LEFT JOIN tbl_prerequisite p 
      ON c.requisite_id = p.requisites_id
    WHERE c.requisite_id IS NOT NULL
      AND p.requisites_id IS NULL
")->fetchColumn();

echo "Orphan curriculum.requisite_id rows: {$orphanCount}\n";

if ((int)$orphanCount > 0) {
    $stmt = $conn->prepare("
        UPDATE curriculum c
        LEFT JOIN tbl_prerequisite p 
          ON c.requisite_id = p.requisites_id
        SET c.requisite_id = NULL
        WHERE c.requisite_id IS NOT NULL
          AND p.requisites_id IS NULL
    ");
    $stmt->execute();
    echo "Updated orphans to NULL.\n";
}

// Re-check
$newCount = $conn->query("
    SELECT COUNT(*) 
    FROM curriculum c
    LEFT JOIN tbl_prerequisite p 
      ON c.requisite_id = p.requisites_id
    WHERE c.requisite_id IS NOT NULL
      AND p.requisites_id IS NULL
")->fetchColumn();

echo "Remaining orphan rows: {$newCount}\n";

