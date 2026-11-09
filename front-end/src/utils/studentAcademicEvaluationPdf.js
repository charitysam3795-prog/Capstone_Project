import { getStudentCurriculumOutcomeDisplay } from './gradePercentageConversion';
import { downloadBwHtmlAsPdf } from './evaluationBwPdf';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Include in PDF only rows with a recorded grade, credit, or final status (excludes ongoing / blank). */
export function evaluationRowIsGraded(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.passed_via_transfer_credit === true) return true;
  if (Number(r.units_earned) > 0) return true;
  const g = r.grade;
  if (g != null && String(g).trim() !== '') return true;
  const st = String(r.status || '')
    .toLowerCase()
    .trim();
  if (st === '' || st === 'ongoing') return false;
  if (
    [
      'passed',
      'pass',
      'failed',
      'fail',
      'f',
      'inc',
      'incomplete',
      'credit',
      'completed',
    ].includes(st)
  ) {
    return true;
  }
  if (st === 'not passed' || st.includes('fail')) return true;
  return false;
}

export function semesterGroupKey(g) {
  return `${g.year_level_id ?? '—'}|${g.semester_id ?? '—'}`;
}

function groupGradedRowsBySemester(gradedRows) {
  const map = new Map();
  for (const r of gradedRows) {
    const yId = r.year_level_id ?? '—';
    const sId = r.semester_id ?? '—';
    const key = `${yId}|${sId}`;
    if (!map.has(key)) {
      map.set(key, {
        year_level_id: r.year_level_id,
        semester_id: r.semester_id,
        year_level_name: r.year_level_name || String(r.year_level_id ?? ''),
        semester_name: r.semester_name || String(r.semester_id ?? ''),
        rows: [],
      });
    }
    map.get(key).rows.push(r);
  }
  return [...map.values()].sort((a, b) => {
    const ay = Number(a.year_level_id ?? 0);
    const by = Number(b.year_level_id ?? 0);
    if (ay !== by) return ay - by;
    // 1st sem → 2nd sem → summer (id 3), never random order
    const as = Number(a.semester_id ?? 0);
    const bs = Number(b.semester_id ?? 0);
    const aSum = as === 3 || String(a.semester_name || '').toLowerCase().includes('summer');
    const bSum = bs === 3 || String(b.semester_name || '').toLowerCase().includes('summer');
    const aOrd = aSum ? 3 : Number.isFinite(as) ? as : 99;
    const bOrd = bSum ? 3 : Number.isFinite(bs) ? bs : 99;
    return aOrd - bOrd;
  });
}

/** Default PDF selection: lowest year level, first two semesters (e.g. 1st year 1st + 2nd). */
export function defaultEvalPdfSelectionKeys(opts) {
  if (!opts.length) return [];
  const finiteYears = opts
    .map((o) => Number(o.year_level_id))
    .filter((n) => Number.isFinite(n));
  if (finiteYears.length === 0) return opts.slice(0, 2).map((o) => o.key);
  const minY = Math.min(...finiteYears);
  const firstYear = opts.filter((o) => Number(o.year_level_id) === minY);
  const keys = firstYear.slice(0, 2).map((o) => o.key);
  return keys.length ? keys : opts.map((o) => o.key);
}

export function firstYearFirstSemKeys(opts) {
  if (!opts.length) return [];
  const finiteYears = opts
    .map((o) => Number(o.year_level_id))
    .filter((n) => Number.isFinite(n));
  if (finiteYears.length === 0) return [opts[0].key];
  const minY = Math.min(...finiteYears);
  const firstYear = opts.filter((o) => Number(o.year_level_id) === minY);
  return firstYear[0] ? [firstYear[0].key] : [opts[0].key];
}

export function firstYearFirstTwoSemKeys(opts) {
  if (!opts.length) return [];
  const finiteYears = opts
    .map((o) => Number(o.year_level_id))
    .filter((n) => Number.isFinite(n));
  if (finiteYears.length === 0) return opts.slice(0, 2).map((o) => o.key);
  const minY = Math.min(...finiteYears);
  return opts
    .filter((o) => Number(o.year_level_id) === minY)
    .slice(0, 2)
    .map((o) => o.key);
}

/** UI + PDF labels for each graded term (sorted). */
export function getGradedSemesterOptionsFromPayload(data) {
  const gradedRows = (data?.rows || []).filter(evaluationRowIsGraded);
  const groups = groupGradedRowsBySemester(gradedRows);
  return groups.map((g) => {
    const yRaw =
      (g.year_level_name || '').toString().trim() ||
      (g.year_level_id != null && g.year_level_id !== '' ? `Year ${g.year_level_id}` : 'Year');
    const sRaw =
      (g.semester_name || '').toString().trim() ||
      (g.semester_id != null && g.semester_id !== '' ? `Semester ${g.semester_id}` : 'Semester');
    return {
      key: semesterGroupKey(g),
      label: `${yRaw} — ${sRaw}`,
      year_level_id: g.year_level_id,
      semester_id: g.semester_id,
      rowCount: g.rows.length,
    };
  });
}

/**
 * Fetches the logged-in student's academic evaluation payload (same as /evaluation/student/:id).
 * @param {import('axios').AxiosInstance} apiClient
 */
export async function fetchStudentEvaluationPayload(apiClient) {
  const prof = await apiClient.get('/students/profile');
  const idNum =
    prof.data?.student_id_number ||
    prof.data?.student_number ||
    prof.data?.Student_Id_Number;
  if (!idNum) {
    throw new Error('Your profile has no student ID number.');
  }
  const res = await apiClient.get(
    `/evaluation/student/${encodeURIComponent(String(idNum))}`
  );
  return res.data;
}

/**
 * @param {object} data
 * @param {{ semesterKeys?: string[] | null, compact?: boolean }} renderOpts
 *   - semesterKeys: if null/undefined, include all graded terms; if [], none; else filter
 */
function fillReportElement(el, data, renderOpts = {}) {
  const { semesterKeys = null, compact = false } = renderOpts;
  const student = data?.student;
  const summary = data?.summary || {};
  const rows = data?.rows || [];
  const computedStatus = data?.computed_academic_status;
  const statusReasons = data?.academic_status_reasons || [];

  const name =
    student?.full_name ||
    [student?.last_name, student?.first_name].filter(Boolean).join(', ') ||
    '—';

  const fs = compact ? '9px' : '12px';
  const fsSmall = compact ? '8px' : '10px';
  const fsH = compact ? '13px' : '16px';
  const pad = compact ? '4px 6px' : '7px 8px';
  const padHead = compact ? '6px 8px' : '10px 12px';
  const mbBlock = compact ? '10px' : '18px';

  const reasonHtml =
    statusReasons.length > 0
      ? `<p style="margin:6px 0;font-size:${fsSmall};color:#333;"><strong>Note:</strong> ${esc(statusReasons.join(' '))}</p>`
      : '';

  const computedHtml =
    computedStatus != null && computedStatus !== ''
      ? `<div style="font-size:${fs};"><strong>Computed status (sequence):</strong> ${esc(computedStatus)}</div>`
      : '';

  const gradedRows = rows.filter(evaluationRowIsGraded);
  let semesterGroups = groupGradedRowsBySemester(gradedRows);

  if (semesterKeys != null) {
    const set = new Set(semesterKeys);
    semesterGroups = semesterGroups.filter((g) => set.has(semesterGroupKey(g)));
  }

  const yearBuckets = [];
  for (const g of semesterGroups) {
    const yearKey = String(g.year_level_id ?? g.year_level_name ?? '');
    const last = yearBuckets[yearBuckets.length - 1];
    if (!last || last.yearKey !== yearKey) {
      const yRaw =
        (g.year_level_name || '').toString().trim() ||
        (g.year_level_id != null && g.year_level_id !== '' ? `Year ${g.year_level_id}` : 'Year');
      yearBuckets.push({ yearKey, yearTitle: yRaw.toUpperCase(), groups: [g] });
    } else {
      last.groups.push(g);
    }
  }

  const semKind = (g) => {
    const name = String(g.semester_name || '').toLowerCase();
    if (/summer|mid\s*-?\s*year|midyear/.test(name) || Number(g.semester_id) === 3) return 'summer';
    if (/2nd|second/.test(name) || Number(g.semester_id) === 2) return 'second';
    if (/1st|first/.test(name) || Number(g.semester_id) === 1) return 'first';
    return 'other';
  };

  const renderSemTable = (g) => {
    if (!g) {
      return `<div style="border:1px solid #000;min-width:0;"><div style="background:#e8e8e8;padding:${padHead};border-bottom:1px solid #000;font-weight:700;opacity:0.55;">—</div><p style="margin:0;padding:10px;text-align:center;color:#666;">No subjects</p></div>`;
    }
    const body = g.rows
      .map((r) => {
        const outcome = getStudentCurriculumOutcomeDisplay(
          r,
          { evaluation_status: r.status, status: r.status, grade: r.grade },
          Number(r.units_earned) > 0
        );
        const gradeCell =
          outcome?.label === 'Complete'
            ? '—'
            : r.grade != null && String(r.grade).trim() !== ''
              ? r.grade
              : '—';
        const statusCell = r.passed_via_transfer_credit
          ? 'Credit (transfer)'
          : outcome
            ? outcome.label
            : r.status || (Number(r.units_earned) > 0 ? 'Passed' : '—');
        return `<tr>
          <td style="padding:${pad};border:1px solid #000;font-weight:600;">${esc(r.subject_code || '—')}</td>
          <td style="padding:${pad};border:1px solid #000;">${esc(r.subject_name || '—')}</td>
          <td style="padding:${pad};border:1px solid #000;text-align:center;">${esc(r.units ?? '—')}</td>
          <td style="padding:${pad};border:1px solid #000;text-align:center;">${esc(gradeCell)}</td>
          <td style="padding:${pad};border:1px solid #000;">${esc(statusCell)}</td>
        </tr>`;
      })
      .join('');
    const sRaw =
      (g.semester_name || '').toString().trim() ||
      (g.semester_id != null && g.semester_id !== '' ? `Semester ${g.semester_id}` : 'Semester');
    return `<div style="border:1px solid #000;min-width:0;overflow:hidden;">
      <div style="background:#e8e8e8;padding:${padHead};font-weight:700;border-bottom:1px solid #000;">${esc(sRaw.toUpperCase())}</div>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:${fs};">
        <thead><tr style="background:#f0f0f0;">
          <th style="padding:${pad};border:1px solid #000;text-align:left;width:16%;">Code</th>
          <th style="padding:${pad};border:1px solid #000;text-align:left;">Subject</th>
          <th style="padding:${pad};border:1px solid #000;text-align:center;width:8%;">U</th>
          <th style="padding:${pad};border:1px solid #000;text-align:center;width:12%;">Grade</th>
          <th style="padding:${pad};border:1px solid #000;text-align:left;width:16%;">Status</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
  };

  const semesterBlocksHtml =
    yearBuckets.length === 0
      ? `<div class="eval-pdf-page-chunk" style="padding:12px;border:1px solid #000;font-size:${fs};color:#333;">
          No graded courses for the selected term(s). Choose different semesters or ensure grades are saved.
        </div>`
      : yearBuckets
          .map((year) => {
            const first = year.groups.find((g) => semKind(g) === 'first');
            const second = year.groups.find((g) => semKind(g) === 'second');
            const summer = year.groups.find((g) => semKind(g) === 'summer');
            const others = year.groups.filter((g) => semKind(g) === 'other');
            const hasRegular = Boolean(first || second);
            const grid = hasRegular
              ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:start;">
                  ${renderSemTable(first)}
                  ${renderSemTable(second)}
                </div>`
              : '';
            const summerBlock = summer
              ? `<div style="margin-top:8px;">${renderSemTable(summer)}</div>`
              : '';
            const otherBlocks = others
              .map((g) => `<div style="margin-top:8px;">${renderSemTable(g)}</div>`)
              .join('');
            return `<div class="eval-pdf-page-chunk" style="margin-bottom:${mbBlock};border:1px solid #000;padding:8px;">
              <div style="background:#000;color:#fff;padding:${padHead};font-weight:800;text-transform:uppercase;margin-bottom:8px;">
                ${esc(year.yearTitle)}
              </div>
              ${grid}
              ${summerBlock}
              ${otherBlocks}
            </div>`;
          })
          .join('');

  el.innerHTML = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:${fs};color:#000;background:#fff;padding:12px;max-width:794px;width:794px;">
      <div class="eval-pdf-page-header">
        <h1 style="font-size:${fsH};margin:0 0 8px;color:#000;">Academic evaluation report</h1>
        <div style="margin-bottom:8px;line-height:1.4;font-size:${fs};">
          <div><strong>Student:</strong> ${esc(name)}</div>
          <div><strong>ID:</strong> ${esc(student?.student_id_number || student?.student_number || '—')}</div>
          <div><strong>Program:</strong> ${esc(student?.program?.program_name || '—')}</div>
          <div><strong>Record academic status:</strong> ${esc(student?.academic_status || '—')}</div>
          ${computedHtml}
        </div>
        ${reasonHtml}
        <div style="display:flex;flex-wrap:wrap;gap:8px 16px;margin-bottom:8px;font-size:${fsSmall};">
          <span>Curriculum units: <strong>${esc(summary.total_units_in_curriculum ?? '—')}</strong></span>
          <span>Earned units: <strong>${esc(summary.total_units_earned ?? '—')}</strong></span>
          <span>Remaining (units): <strong>${esc(summary.lacking_units ?? '—')}</strong></span>
        </div>
        <p style="margin:0 0 8px;font-size:${fsSmall};color:#333;">
          <strong>Selected graded term(s) only.</strong> Ongoing or unevaluated subjects are omitted.
        </p>
      </div>
      ${semesterBlocksHtml}
      <p class="eval-pdf__footer" style="margin-top:10px;font-size:${fsSmall};color:#333;">Generated from the student information system.</p>
    </div>
  `;
}

/**
 * @param {import('axios').AxiosInstance} apiClient
 * @param {{
 *   semesterKeys?: string[] | null,
 *   data?: object,
 *   fitSinglePage?: boolean,
 * }=} options
 */
export async function downloadStudentAcademicEvaluationPdf(apiClient, options = {}) {
  const { semesterKeys = null, data: providedData } = options;
  const data = providedData ?? (await fetchStudentEvaluationPayload(apiClient));

  const gradedGroups = groupGradedRowsBySemester(
    (data?.rows || []).filter(evaluationRowIsGraded)
  );
  let activeCount = gradedGroups.length;
  if (semesterKeys != null) {
    const set = new Set(semesterKeys);
    activeCount = gradedGroups.filter((g) => set.has(semesterGroupKey(g))).length;
  }
  const compact = activeCount <= 2;

  const el = document.createElement('div');
  fillReportElement(el, data, { semesterKeys, compact });
  const st = data?.student;
  const rawId = st?.student_id_number || st?.student_number || 'student';
  const safeId = String(rawId).replace(/[^a-zA-Z0-9-_]/g, '_');

  await downloadBwHtmlAsPdf(el.innerHTML, {
    filename: `academic-evaluation-report-${safeId}.pdf`,
    widthPx: 794,
    scale: 1.4,
    orientation: 'portrait',
    jpegQuality: 0.7,
    sectionSelector: '.eval-pdf-page-chunk',
  });
}
