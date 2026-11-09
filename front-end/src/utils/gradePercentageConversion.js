/**
 * SIS grade helpers: display grades as stored (1.00–5.00, Complete).
 * Manual dean/faculty entry accepts 1.0–5.0 only (plus Complete on SSP rows).
 */

export const SIS_GRADE_MIN = 1;
export const SIS_GRADE_MAX = 5;
export const SIS_DEFAULT_PASS_GRADE = '2.0';
export const SIS_DEFAULT_FAIL_GRADE = '5.0';

const PS50_BANDS = {
  1: { min: 94.8, max: 100 },
  1.25: { min: 89.2, max: 94.7 },
  1.5: { min: 83.6, max: 89.1 },
  1.75: { min: 78.0, max: 83.5 },
  2: { min: 72.4, max: 77.9 },
  2.25: { min: 66.8, max: 72.3 },
  2.5: { min: 61.2, max: 66.7 },
  2.75: { min: 55.6, max: 61.1 },
  3: { min: 50.0, max: 55.5 },
  5: { min: 0.0, max: 49.9 },
};

const PS60_BANDS = {
  1: { min: 96.0, max: 100 },
  1.25: { min: 91.5, max: 95.9 },
  1.5: { min: 87.0, max: 91.4 },
  1.75: { min: 82.5, max: 86.9 },
  2: { min: 78.0, max: 82.4 },
  2.25: { min: 73.5, max: 77.9 },
  2.5: { min: 69.0, max: 73.4 },
  2.75: { min: 64.5, max: 68.9 },
  3: { min: 60.0, max: 64.4 },
  5: { min: 0.0, max: 59.9 },
};

const SIS_BAND_KEYS = ['1', '1.25', '1.5', '1.75', '2', '2.25', '2.5', '2.75', '3', '5'];

function passingGradeUsesPs60(passingGrade) {
  const n = parseFloat(String(passingGrade ?? '').replace(/%/g, '').trim());
  if (!Number.isFinite(n)) return false;
  return n >= 60;
}

/** Map legacy stored percentages (58.4, 80.8) back to SIS grade point. */
export function legacyPercentToSisGrade(gradeRaw, passingGrade = 50) {
  const str = String(gradeRaw ?? '').trim();
  if (!str) return null;
  const p = parseFloat(str.replace(',', '.'));
  if (!Number.isFinite(p) || p < 50 || p > 100) return null;
  const bands = passingGradeUsesPs60(passingGrade) ? PS60_BANDS : PS50_BANDS;
  for (const key of SIS_BAND_KEYS) {
    const band = bands[key];
    if (p + 1e-9 >= band.min && p - 1e-9 <= band.max) {
      return key === '5' ? '5' : key;
    }
  }
  return null;
}

/** Display/import grade as SIS 1.0–5.0 when DB still has old percentage values. */
export function gradeForDisplay(gradeRaw, passingGrade = 50) {
  const str = String(gradeRaw ?? '').trim();
  if (!str) return str;
  if (isCompleteGrade(str)) return 'Complete';
  const g = parseFloat(str.replace(',', '.'));
  if (Number.isFinite(g) && g >= 1 && g <= 5.01 && g < 50) return str;
  const sis = legacyPercentToSisGrade(str, passingGrade);
  return sis ?? str;
}

/** @returns {boolean} true while typing a valid partial numeric SIS grade (1.0–5.0). */
export function isPartialNumericSisInput(str) {
  const t = String(str ?? '').trim().replace(',', '.');
  if (t === '') return true;
  return /^[1-5](?:\.\d{0,2})?$/.test(t) || /^[1-5]\.$/.test(t);
}

/** @returns {boolean} true while typing "Complete" on SSP rows. */
export function isPartialCompleteInput(str) {
  const t = String(str ?? '').trim();
  if (t === '') return true;
  return /^c(?:o(?:m(?:p(?:l(?:e(?:t(?:e)?)?)?)?)?)?)?$/i.test(t);
}

/** @returns {{ ok: boolean, message?: string, num?: number }} */
export function validateSisGradeValue(str, { completeOnly = false } = {}) {
  const raw = String(str ?? '').trim();
  if (raw === '') return { ok: true };

  if (completeOnly) {
    if (isCompleteGrade(raw) || /^complete$/i.test(raw)) return { ok: true };
    if (isPartialCompleteInput(raw)) return { ok: true };
    if (/^\d/.test(raw) || /[0-9.]/.test(raw)) {
      return { ok: false, message: 'SSP subjects use Complete only (type Complete, not a number).' };
    }
    return { ok: false, message: 'SSP subjects must use Complete (no numeric grade).' };
  }

  if (isCompleteGrade(raw) || /^complete$/i.test(raw) || /[a-z]/i.test(raw)) {
    return { ok: false, message: 'Enter a numeric grade from 1.0 to 5.0.' };
  }

  const normalized = raw.replace(',', '.');
  if (!/^[1-5](\.\d{1,2})?$/.test(normalized)) {
    return { ok: false, message: 'Grade must be between 1.0 and 5.0 (e.g. 1.75, 2.25, 5).' };
  }

  const num = parseFloat(normalized);
  if (!Number.isFinite(num) || num < SIS_GRADE_MIN || num > SIS_GRADE_MAX) {
    return { ok: false, message: `Grade must be between ${SIS_GRADE_MIN}.0 and ${SIS_GRADE_MAX}.0.` };
  }

  return { ok: true, num };
}

/** Derive pass/fail from a valid SIS numeric grade. */
export function sisGradeToPassFailStatus(num) {
  if (!Number.isFinite(num)) return '';
  if (num >= SIS_GRADE_MIN && num <= 3) return 'passed';
  if (num > 3 && num <= SIS_GRADE_MAX) return 'failed';
  return '';
}

/** SSP / non-numeric SIS outcomes with no percentage grade. */
export function isCompleteGrade(gradeRaw) {
  const t = String(gradeRaw ?? '')
    .trim()
    .toLowerCase();
  if (!t) return false;
  return ['complete', 'completed', 'pass', 'passed', 'credit', 'credited'].includes(t);
}

/** SSP and similar subjects: passed with no numeric grade. */
export function isCompleteOnlySubject(row) {
  const code = String(row?.subject_code ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (/^SSP/.test(code)) return true;
  const name = String(row?.subject_name ?? '').toUpperCase();
  return name.includes('STUDENT SUCCESS PROGRAM');
}

/**
 * Whether a stored/imported grade counts as pass (handles 1.00–5.00 SIS scale and Complete).
 */
export function gradeMeetsPassingThreshold(gradeRaw, passingGrade, status) {
  const st = String(status ?? '')
    .toLowerCase()
    .trim();
  if (['passed', 'pass', 'credit', 'complete', 'completed'].includes(st)) return true;
  if (['failed', 'fail', 'f', 'dropped', 'drop'].includes(st)) return false;

  const str = String(gradeRaw ?? '').trim();
  if (!str) return false;
  if (isCompleteGrade(str)) return true;

  const passing =
    passingGrade != null && passingGrade !== '' && !Number.isNaN(parseFloat(passingGrade))
      ? parseFloat(passingGrade)
      : 50;
  const g = parseFloat(str.replace(',', '.'));
  if (!Number.isNaN(g) && g >= 50) {
    return g >= passing;
  }
  if (!Number.isNaN(g) && g >= 0 && g <= 5.01) {
    return g >= 1 - 1e-6 && g <= 3 + 1e-6;
  }
  return false;
}

/**
 * Manual grade field: SIS 1.0–5.0 or Complete (SSP).
 * @returns {{ display: string, grade: string, status: string, valid: boolean, error?: string }}
 */
export function normalizeManualGradeInput(gradeRaw, row = null) {
  const str = String(gradeRaw ?? '').trim();
  const completeOnly = row ? isCompleteOnlySubject(row) : false;

  if (!str) return { display: '', grade: '', status: '', valid: true };

  if (completeOnly) {
    if (isCompleteGrade(str) || /^complete$/i.test(str)) {
      return { display: 'Complete', grade: 'Complete', status: 'complete', valid: true };
    }
    if (isPartialCompleteInput(str)) {
      return { display: str, grade: str, status: '', valid: true };
    }
    const check = validateSisGradeValue(str, { completeOnly: true });
    return {
      display: str,
      grade: str,
      status: '',
      valid: check.ok,
      error: check.ok ? undefined : check.message,
    };
  }

  if (!isPartialNumericSisInput(str)) {
    return {
      display: str,
      grade: str,
      status: '',
      valid: false,
      error: 'Grade must be between 1.0 and 5.0 (e.g. 1.75, 2.25, 5).',
    };
  }

  const normalized = str.replace(',', '.');
  if (normalized.endsWith('.')) {
    return { display: str, grade: str, status: '', valid: true };
  }

  if (!/^[1-5](\.\d{1,2})?$/.test(normalized)) {
    return { display: str, grade: str, status: '', valid: true };
  }

  const check = validateSisGradeValue(str, { completeOnly: false });
  if (!check.ok) {
    return { display: str, grade: str, status: '', valid: false, error: check.message };
  }

  if (check.num != null) {
    return {
      display: str,
      grade: str,
      status: sisGradeToPassFailStatus(check.num),
      valid: true,
    };
  }

  return { display: str, grade: str, status: '', valid: true };
}

/** Validate before save; throws nothing — returns { ok, message? }. */
export function validateSisGradeForSave(gradeRaw, row = null) {
  const str = String(gradeRaw ?? '').trim();
  if (!str) return { ok: true };
  return validateSisGradeValue(str, { completeOnly: row ? isCompleteOnlySubject(row) : false });
}

/** Map form grade + remark to API payload (store grade as entered). */
export function manualGradeToSavePayload(gradeRaw, statusRaw) {
  const status =
    statusRaw === '' || statusRaw == null
      ? null
      : String(statusRaw).trim().toLowerCase() === 'inc'
        ? 'incomplete'
        : String(statusRaw).trim().toLowerCase();
  const str = String(gradeRaw ?? '').trim();
  return {
    grade: str === '' ? null : str,
    evaluation_status: status,
  };
}

/**
 * Display label for stored grade (shown as-is from import/DB).
 * @returns {{ primaryText: string, secondaryGp: null, isLetter: boolean } | null}
 */
export function getGradeDisplayParts(gradeRaw, passingGrade) {
  const str = gradeForDisplay(gradeRaw, passingGrade);
  if (!str) return null;

  const hasDigit = /\d/.test(str);
  const g = parseFloat(str.replace(',', '.'));
  if (!hasDigit || !Number.isFinite(g)) {
    return { primaryText: str, secondaryGp: null, isLetter: true };
  }

  return { primaryText: str, secondaryGp: null, isLetter: false };
}

/** Evaluator form: show SIS grade (coerce legacy percentages). */
export function gradeRawToEvaluatorFormValue(gradeRaw, passingGrade, row) {
  if (gradeRaw === '' || gradeRaw == null) {
    if (row && isCompleteOnlySubject(row)) {
      const st = String(row.status || '')
        .trim()
        .toLowerCase();
      if (st === 'passed' || st === 'pass' || st === 'complete' || st === 'completed') return 'Complete';
    }
    return '';
  }
  if (isCompleteGrade(gradeRaw)) return 'Complete';
  return gradeForDisplay(gradeRaw, passingGrade);
}

/** True when draft grade matches saved. */
export function evaluatorGradesEquivalent(a, b, passingGrade) {
  return canonicalEvaluatorGradeForCompare(a, passingGrade) === canonicalEvaluatorGradeForCompare(b, passingGrade);
}

export function manualGradesEquivalentForRow(draftGrade, savedGrade) {
  return String(draftGrade ?? '').trim() === String(savedGrade ?? '').trim();
}

/**
 * Student My Curriculum: SSP / Student Success Program rows show Complete (no numeric grade).
 * @returns {{ label: string, badgeClass: string, showGrade: boolean } | null}
 */
export function getStudentCurriculumOutcomeDisplay(row, rawEnrollment, enrollmentCompleted) {
  if (!isCompleteOnlySubject(row)) {
    return null;
  }

  const st = String(rawEnrollment?.evaluation_status || rawEnrollment?.status || '')
    .toLowerCase()
    .trim();
  const grade = rawEnrollment?.grade;

  if (['failed', 'fail', 'f'].includes(st)) {
    return { label: 'Failed', badgeClass: 'failed', showGrade: false };
  }
  if (['inc', 'incomplete'].includes(st)) {
    return { label: 'INC', badgeClass: 'incomplete', showGrade: false };
  }

  const isComplete =
    isCompleteGrade(grade) ||
    ['passed', 'pass', 'completed', 'complete'].includes(st) ||
    (enrollmentCompleted === true && !['failed', 'fail', 'f'].includes(st));

  if (isComplete) {
    return { label: 'Complete', badgeClass: 'complete', showGrade: false };
  }

  return null;
}

function canonicalEvaluatorGradeForCompare(gradeRaw, passingGrade = 50) {
  if (gradeRaw === '' || gradeRaw == null) return '';
  const str = gradeForDisplay(gradeRaw, passingGrade);
  if (!str) return '';
  if (isCompleteGrade(str)) return 'complete';
  const n = parseFloat(str.replace(',', '.'));
  if (!Number.isNaN(n)) return String(Math.round(n * 1000) / 1000);
  return str.toLowerCase();
}
