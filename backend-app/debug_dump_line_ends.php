<?php
$dumpFile = __DIR__ . '/../db_backups/capstone_db (2) 20260124_checked_by_sirmac.sql';
$fh = fopen($dumpFile, 'r');
if (!$fh) {
    fwrite(STDERR, "No dump file\n");
    exit(1);
}

$count = 0;
$examples = [];
$lineNo = 0;
while (($line = fgets($fh)) !== false) {
    $lineNo++;
    if (preg_match('/;\s*$/', $line)) {
        $count++;
        if (count($examples) < 15) {
            $examples[] = [$lineNo, trim($line)];
        }
    }
}
fclose($fh);

echo "Total lines ending with ;: {$count}\n";
foreach ($examples as [$ln, $ex]) {
    echo "--- line {$ln}\n{$ex}\n\n";
}

