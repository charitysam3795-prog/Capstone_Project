/** Same key the evaluation view uses for load-plan flags (standing_term_load.prior_flags). */
export function evaluationRowKey(row) {
  if (row?.curriculum_id != null && row.curriculum_id !== '') {
    return `cur-${row.curriculum_id}`;
  }
  if (row?.evaluation_id) {
    return `eval-${row.evaluation_id}`;
  }
  return `new-${row?.subject_id}-${row?.academic_year_id}-${row?.semester_id}`;
}

export function isSemestralStanding(standing) {
  return String(standing?.mode || '').toLowerCase() === 'semestral';
}

/**
 * School year + semester an OFFSEM / Semestral subject was taken.
 * Prefers the saved load-plan flag (school year it was offered in), then the graded
 * record's term, then the current Lookup term.
 */
export function formatOffSemesterTakenTerm(row, data) {
  const st = row?.off_semester_standing || {};
  const syRaw =
    st.schoolYearLabel ||
    row?.taken_academic_year_name ||
    data?.active_academic_year?.academic_year_name ||
    '';
  const sem =
    st.takenSemLabel ||
    st.standingSemLabel ||
    row?.taken_semester_name ||
    data?.active_semester?.semester_name ||
    '';
  const sy = String(syRaw).trim();
  const syLabel = sy ? (/^sy\b/i.test(sy) ? sy : `SY ${sy}`) : '';
  return [syLabel, String(sem).trim()].filter(Boolean).join(' · ');
}
