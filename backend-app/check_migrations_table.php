<?php
$host='127.0.0.1'; $port=3307; $user='root'; $pass=''; $db='capstone_app';
$conn=new mysqli($host,$user,$pass,'',$port);
$conn->set_charset('utf8mb4');
$conn->query("USE `$db`");
$res=$conn->query("SHOW TABLES LIKE 'migrations'");
$n=0;
while($r=$res && $row=$res->fetch_row()){ $n++; echo "table exists: ".$row[0]."\n"; }
if($n===0) echo "migrations not found\n";

