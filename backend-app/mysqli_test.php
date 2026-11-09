<?php
$host='127.0.0.1';
$port=3307;
$user='root';
$pass='';
$conn = @new mysqli($host, $user, $pass, '', $port);
if ($conn->connect_errno) {
    fwrite(STDERR, "connect_errno={$conn->connect_errno}\nconnect_error={$conn->connect_error}\n");
    exit(1);
}
echo "mysqli connected OK\n";
$conn->set_charset('utf8mb4');
$dbs = $conn->query('SHOW DATABASES');
if ($dbs) {
    $n=0;
    while ($row = $dbs->fetch_assoc()) { $n++; if($n<=3) echo json_encode($row).PHP_EOL; }
    echo "shown rows (fetched) $n\n";
}

