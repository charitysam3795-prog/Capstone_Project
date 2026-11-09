<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;

/**
 * Reads tabular import uploads (CSV / TSV / TXT / Excel / ODS) into a row matrix.
 */
class ImportTabularFileReader
{
    /** @var list<string> */
    public const ALLOWED_EXTENSIONS = ['csv', 'txt', 'tsv', 'xlsx', 'xls', 'ods'];

    public function extension(UploadedFile $file): string
    {
        return strtolower((string) $file->getClientOriginalExtension());
    }

    public function isAllowed(UploadedFile $file): bool
    {
        return in_array($this->extension($file), self::ALLOWED_EXTENSIONS, true);
    }

    public function isSpreadsheet(UploadedFile $file): bool
    {
        return in_array($this->extension($file), ['xlsx', 'xls', 'ods'], true);
    }

    /**
     * @return list<list<string>>
     */
    public function readCellMatrix(UploadedFile $file): array
    {
        if (! $this->isAllowed($file)) {
            throw new \InvalidArgumentException(
                'Unsupported file type. Use CSV, TSV, TXT, Excel (.xlsx / .xls), or ODS.'
            );
        }

        if ($this->isSpreadsheet($file)) {
            return $this->readSpreadsheetMatrix($file);
        }

        return $this->readDelimitedMatrix($file);
    }

    /**
     * Associative rows keyed by header (first non-empty row).
     *
     * @return list<array<string, string>>
     */
    public function readAssociativeRows(UploadedFile $file): array
    {
        $matrix = $this->readCellMatrix($file);
        if ($matrix === []) {
            return [];
        }

        $headers = array_map(static fn ($h) => trim((string) $h), $matrix[0]);
        $headerCount = count($headers);
        if ($headerCount === 0 || implode('', $headers) === '') {
            return [];
        }

        $out = [];
        for ($i = 1, $n = count($matrix); $i < $n; $i++) {
            $row = $matrix[$i];
            if ($this->rowIsEmpty($row)) {
                continue;
            }
            if (count($row) < $headerCount) {
                $row = array_pad($row, $headerCount, '');
            } elseif (count($row) > $headerCount) {
                $row = array_slice($row, 0, $headerCount);
            }
            $out[] = array_combine($headers, $row) ?: [];
        }

        return $out;
    }

    /**
     * @return list<list<string>>
     */
    private function readSpreadsheetMatrix(UploadedFile $file): array
    {
        $path = $file->getRealPath();
        if ($path === false) {
            return [];
        }

        $spreadsheet = IOFactory::load($path);
        $sheet = $spreadsheet->getActiveSheet();
        $highestRow = (int) $sheet->getHighestDataRow();
        $highestColumn = $sheet->getHighestDataColumn();
        $highestColumnIndex = Coordinate::columnIndexFromString($highestColumn);

        $matrix = [];
        for ($row = 1; $row <= $highestRow; $row++) {
            $cells = [];
            $allEmpty = true;
            for ($col = 1; $col <= $highestColumnIndex; $col++) {
                $cell = $sheet->getCell(Coordinate::stringFromColumnIndex($col).$row);
                $value = $cell->getValue();
                if (ExcelDate::isDateTime($cell) && is_numeric($value)) {
                    try {
                        $dt = ExcelDate::excelToDateTimeObject((float) $value);
                        $text = $dt->format('Y-m-d');
                    } catch (\Throwable) {
                        $text = trim((string) $cell->getFormattedValue());
                    }
                } else {
                    $text = trim((string) $cell->getFormattedValue());
                    if ($text === '' && $value !== null) {
                        $text = trim((string) $value);
                    }
                }
                if ($text !== '') {
                    $allEmpty = false;
                }
                $cells[] = $text;
            }
            if (! $allEmpty) {
                $matrix[] = $cells;
            }
        }

        $spreadsheet->disconnectWorksheets();
        unset($spreadsheet);

        return $matrix;
    }

    /**
     * @return list<list<string>>
     */
    private function readDelimitedMatrix(UploadedFile $file): array
    {
        $path = $file->getRealPath();
        if ($path === false) {
            return [];
        }
        $content = file_get_contents($path);
        if ($content === false) {
            return [];
        }
        $content = preg_replace("/^\xEF\xBB\xBF/", '', $content) ?? $content;
        $lines = preg_split("/\r\n|\n|\r/", $content) ?: [];
        $lines = array_values(array_filter(array_map('trim', $lines), static fn (string $l) => $l !== ''));
        if ($lines === []) {
            return [];
        }

        $delimiter = $this->detectDelimiter($lines[0], $this->extension($file));
        $matrix = [];
        foreach ($lines as $line) {
            $cells = str_getcsv($line, $delimiter);
            $matrix[] = array_map(static fn ($c) => trim((string) $c), $cells);
        }

        return $matrix;
    }

    private function detectDelimiter(string $firstLine, string $extension): string
    {
        if ($extension === 'tsv') {
            return "\t";
        }
        $tabs = substr_count($firstLine, "\t");
        $commas = substr_count($firstLine, ',');
        $semicolons = substr_count($firstLine, ';');

        if ($tabs >= $commas && $tabs >= $semicolons && $tabs > 0) {
            return "\t";
        }
        if ($semicolons > $commas && $semicolons > 0) {
            return ';';
        }

        return ',';
    }

    /**
     * @param  list<string>  $row
     */
    private function rowIsEmpty(array $row): bool
    {
        foreach ($row as $cell) {
            if (trim((string) $cell) !== '') {
                return false;
            }
        }

        return true;
    }
}
