<?php
$dumpFile = __DIR__ . '/../db_backups/capstone_db (2) 20260124_checked_by_sirmac.sql';
$sql = file_get_contents($dumpFile);
if ($sql === false) {
    fwrite(STDERR, "Failed to read dump\n");
    exit(1);
}

$len = strlen($sql);
$buffer = '';
$inSingle = false;
$inDouble = false;

$flushes = 0;
$semisOutsideQuotes = 0;
$examples = [];

for ($i = 0; $i < $len; $i++) {
    $ch = $sql[$i];
    $prev = $i > 0 ? $sql[$i - 1] : '';
    $isEscaped = $prev === '\\';

    // Handle SQL escaping: either backslash-escaped or doubled quotes.
    if ($ch === "'" && !$inDouble) {
        if (!$isEscaped) {
            // If next char is also ', it's an escaped quote in SQL (e.g., '' inside a string).
            if ($next = ($i + 1 < $len ? $sql[$i + 1] : '')) {
                if ($next === "'" && $inSingle) {
                    // stay inside string, consume next quote in-place by advancing i
                    // (do not toggle state)
                    $buffer .= $ch; // keep current quote in buffer
                    continue;
                }
            }
        }
        if (!$isEscaped) {
            $inSingle = !$inSingle;
        }
    } elseif ($ch === '"' && !$inSingle) {
        if (!$isEscaped) {
            $inDouble = !$inDouble;
        }
    }

    if ($ch === ';' && !$inSingle && !$inDouble) {
        $semisOutsideQuotes++;
        $stmt = trim($buffer);
        $buffer = '';
        if ($stmt !== '' && !str_starts_with($stmt, '--')) {
            $flushes++;
            if (count($examples) < 15) {
                $examples[] = 'len=' . strlen($stmt) . ' :: ' . substr($stmt, 0, 140);
            }
        }
    } else {
        $buffer .= $ch;
    }
}

$tail = trim($buffer);
if ($tail !== '') {
    $flushes++;
    if (count($examples) < 15) {
        $examples[] = substr($tail, 0, 140);
    }
}

echo "Dump length: " . $len . PHP_EOL;
echo "Semicolons outside quotes: {$semisOutsideQuotes}" . PHP_EOL;
echo "Statements detected (after trimming): {$flushes}" . PHP_EOL;
echo PHP_EOL . "Examples:" . PHP_EOL;
foreach ($examples as $i => $ex) {
    echo "---- " . ($i + 1) . PHP_EOL;
    echo $ex . PHP_EOL . PHP_EOL;
}

