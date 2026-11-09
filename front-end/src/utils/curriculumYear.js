export function formatCurriculumYearRange(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const existingRange = raw.match(/^(\d{4})\s*[-/]\s*(\d{4})$/);
  if (existingRange) {
    return `${existingRange[1]}-${existingRange[2]}`;
  }

  if (/^\d{4}$/.test(raw)) {
    const startPair = Number(raw.slice(0, 2));
    const endPair = Number(raw.slice(2));

    // Compact school-year codes like 1819 mean 2018-2019.
    if (endPair === (startPair + 1) % 100) {
      const startCentury = startPair >= 70 ? 1900 : 2000;
      return `${startCentury + startPair}-${startCentury + startPair + 1}`;
    }

    const startYear = Number(raw);
    if (startYear >= 1900) {
      return `${startYear}-${startYear + 1}`;
    }
  }

  return raw;
}

export function formatEffectiveSchoolYear(value) {
  const range = formatCurriculumYearRange(value);
  return range ? `Effective SY ${range}` : '';
}

export function parseCurriculumStartYear(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const range = raw.match(/^(\d{4})\s*[-/]\s*(\d{4})$/);
  if (range) return Number(range[1]);

  if (/^\d{4}$/.test(raw)) {
    const startPair = Number(raw.slice(0, 2));
    const endPair = Number(raw.slice(2));
    if (endPair === (startPair + 1) % 100) {
      const startCentury = startPair >= 70 ? 1900 : 2000;
      return startCentury + startPair;
    }
    return Number(raw);
  }

  return Number.NaN;
}
