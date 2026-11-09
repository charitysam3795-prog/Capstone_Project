import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api/axios';
import { swalError } from '../../utils/swal';
import {
  evaluationRowKey,
  formatOffSemesterTakenTerm,
  isSemestralStanding,
} from '../../utils/offSemesterTerm';
import './DeanStudentRecords.css';

const semesterOrder = (semesterName) => {
  const raw = `${semesterName || ''}`.toLowerCase();
  if (raw.includes('first') || raw.includes('1st')) return 1;
  if (raw.includes('second') || raw.includes('2nd')) return 2;
  if (raw.includes('summer')) return 3;
  return 99;
};

/** Shiftee / returnee / transferee: show current curriculum only (not old-program-only rows). */
function shouldHidePreviousProgramOnly(student) {
  const entry = String(student?.student_entry_type || '')
    .trim()
    .toLowerCase();
  if (entry === 'shiftee' || entry === 'returnee' || entry === 'transferee') return true;
  if (student?.previous_program_id != null && student.previous_program_id !== '') return true;
  if (student?.previous_program) return true;
  return false;
}

function formatPreviousProgramTag(row, student) {
  const code =
    row?.previous_program_code ||
    student?.previous_program?.program_code ||
    '';
  const name =
    row?.previous_program_name ||
    student?.previous_program?.program_name ||
    '';
  const label = String(code || name || '').trim();
  if (!label) return 'From previous program';
  return `From ${label}`;
}

const DeanStudentRecords = () => {
  const { studentIdNumber } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!studentIdNumber) {
        setError('Missing student ID.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const res = await api.get(`/evaluation/student/${encodeURIComponent(studentIdNumber)}`);
        if (!cancelled) setData(res.data || null);
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || 'Failed to load student records.';
        if (!cancelled) {
          setError(msg);
          setData(null);
          await swalError('Could not load student records', msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [studentIdNumber]);

  const student = data?.student || {};
  const hidePreviousOnly = shouldHidePreviousProgramOnly(student);

  const grouped = useMemo(() => {
    const allRows = Array.isArray(data?.rows) ? data.rows : [];
    // Confirmed shift: drop subjects that exist only on the previous program.
    // Shared current-curriculum rows stay and get a FROM <program> flag.
    const priorFlags = data?.student?.standing_term_load?.prior_flags;
    const flags =
      priorFlags && typeof priorFlags === 'object' && !Array.isArray(priorFlags) ? priorFlags : {};
    const notTakenKeys = new Set(
      Array.isArray(data?.student?.standing_deferred_keys)
        ? data.student.standing_deferred_keys.map(String)
        : []
    );
    const rows = (hidePreviousOnly
      ? allRows.filter((row) => row?.previous_program_only !== true)
      : allRows
    ).map((row) => {
      const key = evaluationRowKey(row);
      const flag = flags[key];
      const hasGrade = row.grade != null && String(row.grade).trim() !== '';
      const notTaken = notTakenKeys.has(key) && !hasGrade && !row.passed_via_transfer_credit;
      if (!flag && !notTaken) return row;
      return {
        ...row,
        ...(flag ? { off_semester: true, off_semester_standing: flag } : {}),
        ...(notTaken ? { not_taken_in_load: true } : {}),
      };
    });
    const map = new Map();

    rows.forEach((row) => {
      const yearKey = row.year_level_name || 'Unknown Year';
      const semKey = row.semester_name || 'Unknown Semester';
      const groupKey = `${yearKey}|||${semKey}`;

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          yearLabel: yearKey,
          semesterLabel: semKey,
          yearLevelId: Number(row.year_level_id || 0),
          semesterOrd: semesterOrder(semKey),
          rows: [],
        });
      }
      map.get(groupKey).rows.push(row);
    });

    const groups = [...map.values()];
    groups.sort((a, b) => {
      if (a.yearLevelId !== b.yearLevelId) return a.yearLevelId - b.yearLevelId;
      return a.semesterOrd - b.semesterOrd;
    });

    groups.forEach((g) => {
      g.rows.sort((a, b) => String(a.subject_code || '').localeCompare(String(b.subject_code || '')));
    });

    return groups;
  }, [
    data?.rows,
    data?.student?.standing_term_load,
    data?.student?.standing_deferred_keys,
    hidePreviousOnly,
  ]);

  const summary = data?.summary || {};
  const computedStatus = data?.computed_academic_status;
  const fullName =
    student?.full_name ||
    `${student?.last_name || ''}, ${student?.first_name || ''} ${student?.middle_name || ''}`.trim() ||
    'N/A';
  const studentNumber = student?.student_id_number || student?.student_number || studentIdNumber || 'N/A';
  const programName = student?.program?.program_name || student?.program_name || 'N/A';
  const programCode = student?.program?.program_code || student?.program_code || '';
  const academicStatus = student?.academic_status || '';
  const previousProgramLabel =
    student?.previous_program?.program_code ||
    student?.previous_program?.program_name ||
    '';

  const formatGrade = (row) => {
    if (row.passed_via_transfer_credit) return 'Credit';
    const g = row.grade;
    if (g == null || String(g).trim() === '') return '';
    return String(g);
  };

  const formatStatus = (row) => {
    if (row.passed_via_transfer_credit) return 'CREDITED';
    const st = (row.status || '').trim().toUpperCase();
    return st || '';
  };

  return (
    <div className="dean-sr">
      <div className="dean-sr__header">
        <h1>Subject Evaluation</h1>
        <button type="button" className="dean-sr__close" onClick={() => window.close()}>
          Close tab
        </button>
      </div>

      {loading ? <p className="dean-sr__msg">Loading records...</p> : null}
      {!loading && error ? <p className="dean-sr__msg dean-sr__msg--error">{error}</p> : null}

      {!loading && !error && data ? (
        <>
          <div className="dean-sr__info-grid">
            <div className="dean-sr__info-item">
              <span className="dean-sr__info-label">Student No.:</span>
              <span>{studentNumber}</span>
            </div>
            <div className="dean-sr__info-item">
              <span className="dean-sr__info-label">Student Name:</span>
              <span>{fullName}</span>
            </div>
            <div className="dean-sr__info-item">
              <span className="dean-sr__info-label">Course:</span>
              <span>{programCode} — {programName}</span>
            </div>
            <div className="dean-sr__info-item">
              <span className="dean-sr__info-label">Scholastic Status:</span>
              <span>{computedStatus || academicStatus || '—'}</span>
            </div>
            {previousProgramLabel ? (
              <div className="dean-sr__info-item">
                <span className="dean-sr__info-label">Previous program:</span>
                <span>{previousProgramLabel}</span>
              </div>
            ) : null}
          </div>

          <div className="dean-sr__summary-strip">
            <span>Curriculum units: <strong>{summary.total_units_in_curriculum ?? 0}</strong></span>
            <span>Earned: <strong>{summary.total_units_earned ?? 0}</strong></span>
            <span>Remaining: <strong>{summary.lacking_units ?? 0}</strong></span>
          </div>

          <div className="dean-sr__table-wrap">
            <table className="dean-sr__table">
              <colgroup>
                <col style={{ width: '2.5rem' }} />
                <col style={{ width: '9rem' }} />
                <col />
                <col style={{ width: '14rem' }} />
                <col style={{ width: '4.5rem' }} />
                <col style={{ width: '5rem' }} />
                <col style={{ width: '7rem' }} />
              </colgroup>
              {grouped.map((group) => (
                <React.Fragment key={`${group.yearLabel}-${group.semesterLabel}`}>
                  <thead>
                    <tr className="dean-sr__term-heading-row">
                      <th colSpan={7}>
                        <strong>{group.yearLabel}</strong>
                        <span className="dean-sr__term-sep">—</span>
                        <span>{group.semesterLabel}</span>
                      </th>
                    </tr>
                    <tr className="dean-sr__col-heading-row">
                      <th>#</th>
                      <th>Subject Code</th>
                      <th>Description</th>
                      <th>Prerequisite</th>
                      <th className="dean-sr__center">Units</th>
                      <th className="dean-sr__center">Grade</th>
                      <th className="dean-sr__center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row, idx) => {
                      const ruleLabels = (row.prerequisite_rule_labels || []).filter(Boolean);
                      // Standing / "all subjects" rules expand to every prior code in the API —
                      // show the label only (matches Curriculum Management: "P: all subjects").
                      const useRuleOnly = ruleLabels.some(
                        (l) => /year\s+standing/i.test(l) || /^all\s+subjects?/i.test(String(l).trim())
                      );
                      const prereqs = useRuleOnly
                        ? ruleLabels
                        : [
                            ...(row.prerequisite_subject_codes || []),
                            ...ruleLabels,
                          ].filter(Boolean);
                      return (
                        <tr key={`${row.subject_id || row.subject_code || 'r'}-${idx}`}>
                          <td>{idx + 1}</td>
                          <td className="dean-sr__code">{row.subject_code || row.elective_slot_name || '—'}</td>
                          <td>
                            <span className="dean-sr__title-cell">
                              <span>{row.subject_name || '—'}</span>
                              {row.off_semester ? (
                                <span
                                  className={`dean-sr__offsem-tag${
                                    isSemestralStanding(row.off_semester_standing)
                                      ? ' dean-sr__offsem-tag--semestral'
                                      : ''
                                  }`}
                                >
                                  {isSemestralStanding(row.off_semester_standing) ? 'SEMESTRAL' : 'OFFSEM'}
                                </span>
                              ) : null}
                              {row.not_taken_in_load ? (
                                <span
                                  className="dean-sr__not-taken-tag"
                                  title="Unchecked (dropped) in the saved load plan — not taken this semester"
                                >
                                  NOT TAKEN
                                </span>
                              ) : null}
                              {row.off_semester && formatOffSemesterTakenTerm(row, data) ? (
                                <span className="dean-sr__offsem-term">
                                  {formatOffSemesterTakenTerm(row, data)}
                                </span>
                              ) : null}
                              {row.from_previous_program ? (
                                <span
                                  className="dean-sr__from-tag"
                                  title={
                                    row.previous_program_name ||
                                    student?.previous_program?.program_name ||
                                    'Taken under previous program'
                                  }
                                >
                                  {formatPreviousProgramTag(row, student)}
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td>{prereqs.length ? prereqs.join(', ') : ''}</td>
                          <td className="dean-sr__center">{row.units ?? ''}</td>
                          <td className="dean-sr__center">{formatGrade(row)}</td>
                          <td className="dean-sr__center">{formatStatus(row)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </React.Fragment>
              ))}
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default DeanStudentRecords;
