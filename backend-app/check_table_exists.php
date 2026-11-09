<?php
$host='127.0.0.1'; $port=3307; $user='root'; $pass=''; $db='capstone_db';
$target='audit_logs';
$conn = new mysqli($host,$user,$pass,'',$port);
$conn->set_charset('utf8mb4');
if ($conn->connect_errno) { fwrite(STDERR,"connect fail\n"); exit(1); }
$conn->query("USE `$db`");
$res = $conn->query("SHOW TABLES LIKE '$target'");
$rows=[];
while($r=$res && $r=$res->fetch_row()) { $rows[]=$r[0]; }
echo "Matches: ".count($rows)."\n";
foreach($rows as $x) echo $x."\n";

// show create attempt
$res2 = $conn->query("SHOW CREATE TABLE `$target`");
if(!$res2){ echo "SHOW CREATE error: ".$conn->error."\n"; exit(0); }
$row = $res2->fetch_assoc();
echo "SHOW CREATE ok. Key: ".(array_key_first($row))."\n";
echo substr($row[array_key_first($row)],0,120)."...\n";

