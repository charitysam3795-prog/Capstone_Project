<?php
$host='127.0.0.1'; $port=3307; $user='root'; $pass=''; $db='capstone_app';
$conn=new mysqli($host,$user,$pass,$db,$port);
if($conn->connect_errno){ fwrite(STDERR,'connect fail'); exit(1); }
$conn->query('SET FOREIGN_KEY_CHECKS=0');
$conn->query('DROP TABLE IF EXISTS `sessions`');
$conn->query('SET FOREIGN_KEY_CHECKS=1');
echo "Dropped sessions (if existed)\n";

