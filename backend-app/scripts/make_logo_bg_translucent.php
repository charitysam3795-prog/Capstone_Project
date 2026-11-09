<?php

$src = dirname(__DIR__, 2) . '/front-end/public/assets/student_evaluation_system_logo.png';
$backup = dirname(__DIR__, 2) . '/front-end/public/assets/student_evaluation_system_logo.opaque.png';

// Always reprocess from the opaque backup so we can tune transparency.
$sourcePath = file_exists($backup) ? $backup : $src;
if (! file_exists($backup) && file_exists($src)) {
    copy($src, $backup);
    $sourcePath = $backup;
}

$im = imagecreatefrompng($sourcePath);
if (! $im) {
    fwrite(STDERR, "Failed to open logo\n");
    exit(1);
}

imagesavealpha($im, true);
imagealphablending($im, false);

$w = imagesx($im);
$h = imagesy($im);
$cx = $w / 2;
$cy = $h / 2;
$outerR = min($w, $h) / 2;
$innerR = $outerR * 0.78;

$out = imagecreatetruecolor($w, $h);
imagealphablending($out, false);
imagesavealpha($out, true);
$clear = imagecolorallocatealpha($out, 0, 0, 0, 127);
imagefilledrectangle($out, 0, 0, $w, $h, $clear);

$blueCount = 0;
for ($y = 0; $y < $h; $y++) {
    for ($x = 0; $x < $w; $x++) {
        $rgb = imagecolorat($im, $x, $y);
        $a = ($rgb >> 24) & 0x7F;
        $r = ($rgb >> 16) & 0xFF;
        $g = ($rgb >> 8) & 0xFF;
        $b = $rgb & 0xFF;

        $dx = $x - $cx;
        $dy = $y - $cy;
        $dist = sqrt($dx * $dx + $dy * $dy);

        // Outside circular emblem → fully transparent
        if ($dist > $outerR + 1) {
            imagesetpixel($out, $x, $y, $clear);
            continue;
        }

        // Dark navy fill of the inner disc (not green ring, not yellow, not bright whites)
        $isDarkBlue =
            $a < 110
            && $b >= 35
            && $b > $r + 12
            && $b > $g + 8
            && $r < 100
            && $g < 120
            && $g < $b
            && ($r + $g) < 160;

        // Keep faint white icon lines more visible (don't wipe near-white strokes)
        $isSoftIcon = ($r > 140 && $g > 150 && $b > 170 && abs($r - $g) < 40);

        if ($isDarkBlue && ! $isSoftIcon && $dist <= $innerR) {
            $t = 1 - ($dist / max(1.0, $innerR));
            // Stronger transparency: ~85% clear at center, ~55% near rim (GD alpha 0–127)
            $targetA = (int) round(70 + 48 * $t); // 70..118
            $a = max($a, min(122, $targetA));
            $blueCount++;
        }

        $col = imagecolorallocatealpha($out, $r, $g, $b, $a);
        imagesetpixel($out, $x, $y, $col);
    }
}

imagepng($out, $src);
imagedestroy($im);
imagedestroy($out);

echo "Done. Blue pixels adjusted: {$blueCount}\n";
