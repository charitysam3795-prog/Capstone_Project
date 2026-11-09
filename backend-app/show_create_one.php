<?php
$host='127.0.0.1'; $port=3307; $user='root'; $pass=''; $db='capstone_db';
$table=$argv[1] ?? 'tbl_faculty_profile';
$conn=new mysqli($host,$user,$pass,'',$port);
$conn->set_charset('utf8mb4');
if($conn->connect_errno){ fwrite(STDERR,"connect fail\n"); exit(1); }
$res=$conn->query("SHOW CREATE TABLE `{$db}`.`{$table}`");
if(!$res){ fwrite(STDERR,"show create failed: ".$conn->error."\n"); exit(1); }
$row=$res->fetch_assoc();
$ddl=$row['Create Table'] ?? array_values($row)[1] ?? null;
if(!$ddl){ fwrite(STDERR,"no ddl\n"); exit(1); }
echo $ddl;
echo "\n";

