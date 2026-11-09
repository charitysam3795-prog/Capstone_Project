<?php
$host='127.0.0.1';
$port=3307;
$user='root';
$pass='';
$db='capstone_app';

$conn = @new mysqli($host,$user,$pass,'',$port);
if ($conn->connect_errno) {
    fwrite(STDERR,"connect_errno={$conn->connect_errno}\nconnect_error={$conn->connect_error}\n");
    exit(1);
}

$conn->set_charset('utf8mb4');
$conn->select_db($db);

echo "capstone_app tables: ";
$tables = $conn->query("SHOW TABLES");
echo ($tables ? $tables->num_rows : 0) . "\n";

$res = $conn->query("SHOW TABLES LIKE 'tbl_users'");
echo "tbl_users exists? " . ($res && $res->num_rows>0 ? 'YES' : 'NO') . "\n";

if ($res && $res->num_rows>0) {
    $count = $conn->query("SELECT COUNT(*) AS c FROM tbl_users")->fetch_assoc()['c'] ?? null;
    echo "tbl_users row count: " . ($count ?? 'null') . "\n";
}

