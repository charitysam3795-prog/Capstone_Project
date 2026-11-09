import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { swalToast, swalError, swalConfirm, swalInfo } from '../../utils/swal';
import { downloadBwHtmlAsPdf } from '../../utils/evaluationBwPdf';
import { useSystemGuide } from './SystemGuide';
import PromoteSemesterModal from './PromoteSemesterModal';
import SearchableSelect from './SearchableSelect';
import SubjectEquivalenceQuickModal from './SubjectEquivalenceQuickModal';
import { formatOffSemesterTakenTerm } from '../../utils/offSemesterTerm';
import {
  gradeMeetsPassingThreshold,
  isCompleteGrade,
  isCompleteOnlySubject,
  manualGradeToSavePayload,
  manualGradesEquivalentForRow,
  gradeRawToEvaluatorFormValue,
  SIS_DEFAULT_FAIL_GRADE,
  SIS_DEFAULT_PASS_GRADE,
} from '../../utils/gradePercentageConversion';
import './StudentEvaluationView.css';

/** Row completion from server data only (matches sequential unlock in renderTable). */
function isRowGradableForTermGate(row) {
  return row.subject_id != null && row.subject_id !== '';
}

function isTransferCreditRowForTermGate(row) {
  return row?.passed_via_transfer_credit === true || String(row?.status || '').toLowerCase() === 'credit';
}

/** True when the row is “filled in” for term gates / promotion: failed, incomplete, dropped, etc. all count; only blank or ongoing blocks. */
function isEvalRowCompleteFromServerRow(row) {
  if (isTransferCreditRowForTermGate(row)) return true;
  if (!isRowGradableForTermGate(row)) return true;
  const status = String(row.status || '')
    .toLowerCase()
    .trim();
  if (status === 'ongoing') return false;
  if (
    status === 'passed' ||
    status === 'pass' ||
    status === 'complete' ||
    status === 'completed' ||
    status === 'failed' ||
    status === 'fail' ||
    status === 'f' ||
    status === 'inc' ||
    status === 'incomplete' ||
    status === 'dropped' ||
    status === 'drop'
  ) {
    return true;
  }
  if (row.grade != null && String(row.grade).trim() !== '') return true;
  if (isCompleteGrade(row.grade)) return true;
  return false;
}

/** No grade and no remark — not taken this term (may take later: summer / next year). */
function isEvalRowUntakenBlank(row) {
  if (isTransferCreditRowForTermGate(row)) return false;
  if (!isRowGradableForTermGate(row)) return false;
  const status = String(row?.status || '')
    .toLowerCase()
    .trim();
  if (status === 'ongoing') return false;
  if (status !== '') return false;
  const grade = row?.grade;
  if (grade != null && String(grade).trim() !== '') return false;
  return true;
}

/**
 * True when a term has at least one recorded subject and every taken subject has a
 * final outcome. Untaken blanks alone do NOT unlock the next semester.
 */
function isCurriculumTermReadyToAdvance(rows, yearId, semId, deferredKeys = []) {
  const deferred = new Set((deferredKeys || []).map(String));
  const termRows = (rows || []).filter((r) => {
    if (deferred.has(getEvaluationRowKey(r))) return false;
    return (
      String(r.year_level_id) === String(yearId) && String(r.semester_id) === String(semId)
    );
  });
  const actionable = termRows.filter((r) => !isEvalRowUntakenBlank(r));
  if (actionable.length === 0) return false;
  return actionable.every((r) => isEvalRowCompleteFromServerRow(r));
}

/**
 * Earliest term within a year the student may stand on — never skip ahead when
 * earlier terms have no recorded grades/outcomes.
 */
function resolveStandingTermForYear(orderedTerms, rows, yearId, deferredKeys = []) {
  const yearTerms = (orderedTerms || []).filter(
    (t) => String(t.year_level_id) === String(yearId)
  );
  if (!yearTerms.length) return null;

  for (let i = 0; i < yearTerms.length; i += 1) {
    const term = yearTerms[i];
    if (
      !isCurriculumTermReadyToAdvance(
        rows,
        term.year_level_id,
        term.semester_id,
        deferredKeys
      )
    ) {
      return term;
    }
  }
  return yearTerms[yearTerms.length - 1];
}

function passingForEvalRow(row) {
  return row.passing_grade != null && row.passing_grade !== '' ? row.passing_grade : '50';
}

function formatEvalGradeReadonly(gradeRaw, row = null) {
  if (row) {
    const display = gradeRawToEvaluatorFormValue(gradeRaw, row.passing_grade, row);
    if (display) return display;
  }
  if (gradeRaw == null || String(gradeRaw).trim() === '') return '';
  if (isCompleteGrade(gradeRaw)) return 'Complete';
  return String(gradeRaw).trim();
}

function draftGradeFromRow(row) {
  return gradeRawToEvaluatorFormValue(row?.grade, row?.passing_grade, row) || '';
}

function safeDownloadName(value) {
  return String(value || 'student-evaluation')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'student-evaluation';
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Black-and-white staff evaluation report HTML (preview + PDF). */
/** Compact semester table HTML for portrait side-by-side layout. */
function buildEvalPdfSemesterTableHtml(group, { compact = true } = {}) {
  if (!group) {
    return `
      <div class="term-block term-block--empty">
        <h2>—</h2>
        <p class="term-block__empty">No subjects for this term.</p>
      </div>`;
  }
  const body = group.rows
    .map((row) => {
      const transferCredit = isTransferCreditRowForTermGate(row);
      const grade = transferCredit ? '-' : formatEvalGradeReadonly(row.grade, row) || '-';
      const status = transferCredit ? 'Credited' : normalizeStatusForUi(row.status ?? '') || '-';
      return `
        <tr>
          <td class="code">${htmlEscape(row.subject_code || '-')}</td>
          <td>${htmlEscape(row.subject_name || '-')}</td>
          <td class="center">${htmlEscape(row.units ?? 0)}</td>
          <td class="center">${htmlEscape(grade)}</td>
          <td>${htmlEscape(status)}</td>
        </tr>`;
    })
    .join('');
  const totalUnits = group.rows.reduce((sum, row) => sum + (Number(row.units) || 0), 0);
  const semOnly = String(group.semester_name || `Semester ${group.semester_id || ''}`)
    .trim()
    .toUpperCase();
  return `
    <div class="term-block${compact ? ' term-block--compact' : ''}">
      <h2>${htmlEscape(semOnly)}</h2>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Subject</th>
            <th>U</th>
            <th>Grade</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
        <tfoot>
          <tr>
            <td colspan="5">Total units: <strong>${htmlEscape(totalUnits)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

function buildStaffEvaluationReportHtml({
  studentName,
  studentNumber,
  programLabel,
  trackLabel,
  academicStatus,
  studentEntryType,
  selectedLabel,
  summary,
  termBlocks,
  generatedBy,
  generatedAt,
}) {
  return `
      <style>
        .eval-pdf {
          box-sizing: border-box;
          width: 794px;
          padding: 18px 16px;
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 10px;
        }
        .eval-pdf * { box-sizing: border-box; }
        .eval-pdf__header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 2px solid #000;
          padding-bottom: 10px;
          margin-bottom: 12px;
        }
        .eval-pdf__school {
          font-size: 15px;
          font-weight: 800;
          color: #000;
          margin: 0;
        }
        .eval-pdf__sub {
          margin-top: 2px;
          color: #333;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .eval-pdf__title {
          text-align: right;
          font-size: 16px;
          font-weight: 800;
          color: #000;
        }
        .eval-pdf__meta {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px 14px;
          padding: 8px 10px;
          border: 1px solid #000;
          background: #fff;
          margin-bottom: 10px;
        }
        .eval-pdf__meta div span {
          display: block;
          color: #444;
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .eval-pdf__meta div strong {
          display: block;
          color: #000;
          margin-top: 1px;
          font-size: 10px;
        }
        .eval-pdf__summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          margin-bottom: 12px;
        }
        .eval-pdf__summary div {
          border: 1px solid #000;
          padding: 6px 8px;
          text-align: center;
          background: #fff;
        }
        .eval-pdf__summary span {
          display: block;
          color: #444;
          font-size: 8px;
          margin-bottom: 2px;
        }
        .eval-pdf__summary strong {
          font-size: 12px;
          color: #000;
        }
        .eval-pdf-page-chunk {
          margin: 0 0 12px;
          page-break-inside: avoid;
        }
        .eval-pdf-year-row {
          border: 1px solid #000;
          padding: 8px;
          background: #fff;
        }
        .eval-pdf-year__title {
          margin: 0 0 8px;
          padding: 6px 8px;
          background: #000;
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .eval-pdf-sem-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          align-items: start;
        }
        .eval-pdf-summer {
          margin-top: 8px;
        }
        .term-block {
          margin: 0;
          page-break-inside: avoid;
          min-width: 0;
        }
        .term-block h2 {
          margin: 0;
          padding: 5px 6px;
          background: #e8e8e8;
          border: 1px solid #000;
          border-bottom: 0;
          color: #000;
          font-size: 10px;
          text-transform: uppercase;
        }
        .term-block--empty h2 { opacity: 0.55; }
        .term-block__empty {
          margin: 0;
          padding: 10px 6px;
          border: 1px solid #000;
          border-top: 0;
          color: #666;
          font-size: 9px;
          text-align: center;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        th, td {
          border: 1px solid #000;
          padding: 3px 4px;
          vertical-align: top;
          word-break: break-word;
          color: #000;
          background: #fff;
          font-size: 8px;
          line-height: 1.25;
        }
        th {
          background: #f0f0f0;
          text-align: left;
          font-size: 7.5px;
          text-transform: uppercase;
        }
        th:nth-child(1), td:nth-child(1) { width: 16%; }
        th:nth-child(3), td:nth-child(3) { width: 8%; }
        th:nth-child(4), td:nth-child(4) { width: 12%; }
        th:nth-child(5), td:nth-child(5) { width: 16%; }
        tfoot td {
          background: #f5f5f5;
          text-align: right;
          font-size: 8px;
        }
        .code {
          color: #000;
          font-weight: 700;
        }
        .center {
          text-align: center;
        }
        .eval-pdf__footer {
          margin-top: 12px;
          color: #333;
          font-size: 8px;
          text-align: right;
        }
      </style>
      <div class="eval-pdf">
        <div class="eval-pdf-page-header">
          <header class="eval-pdf__header">
            <div>
              <p class="eval-pdf__school">Cagayan de Oro College</p>
              <div class="eval-pdf__sub">PHINMA Education</div>
            </div>
            <div class="eval-pdf__title">Student Evaluation</div>
          </header>
          <section class="eval-pdf__meta">
            <div><span>Student Name</span><strong>${htmlEscape(studentName)}</strong></div>
            <div><span>Student ID Number</span><strong>${htmlEscape(studentNumber)}</strong></div>
            <div><span>Program</span><strong>${htmlEscape(programLabel)}</strong></div>
            <div><span>Track</span><strong>${htmlEscape(trackLabel)}</strong></div>
            <div><span>Academic Status</span><strong>${htmlEscape(academicStatus)}</strong></div>
            ${studentEntryType ? `<div><span>Student Type</span><strong>${htmlEscape(studentEntryType)}</strong></div>` : ''}
            <div><span>Downloaded Terms</span><strong>${htmlEscape(selectedLabel)}</strong></div>
          </section>
          <section class="eval-pdf__summary">
            <div><span>Curriculum Units</span><strong>${htmlEscape(summary?.total_units_in_curriculum ?? 0)}</strong></div>
            <div><span>Earned</span><strong>${htmlEscape(summary?.total_units_earned ?? 0)}</strong></div>
            <div><span>Remaining</span><strong>${htmlEscape(summary?.lacking_units ?? 0)}</strong></div>
          </section>
        </div>
        ${termBlocks}
        <div class="eval-pdf__footer">
          Generated by ${htmlEscape(generatedBy || 'N/A')} on ${htmlEscape(generatedAt)}
        </div>
      </div>
    `;
}

function evaluationTermKeyFromParts(yearLevelId, semesterId) {
  return `${yearLevelId ?? 'unknown'}|${semesterId ?? 'unknown'}`;
}

function evaluationTermKeyFromRow(row) {
  return evaluationTermKeyFromParts(row?.year_level_id, row?.semester_id);
}

/** UI uses `inc`; API stores `incomplete`. */
function normalizeStatusForUi(status) {
  if (status == null || status === '') return '';
  const t = String(status).trim().toLowerCase();
  if (t === 'incomplete') return 'inc';
  if (t === 'complete' || t === 'completed') return 'Complete';
  return String(status).trim();
}

function semesterSortValue(semesterId, semesterName = '') {
  const name = String(semesterName || '').trim().toLowerCase();
  if (name.includes('summer') || Number(semesterId) === 3) return 0;
  const numeric = Number(semesterId);
  return Number.isFinite(numeric) ? numeric : 99;
}

/** Curriculum term order for standing load (year major; 1st → 2nd → Summer). */
function evalTermSortKey(yearId, semesterId, semesterName = '') {
  const y = Number(yearId);
  const yearPart = Number.isFinite(y) ? y : 0;
  return yearPart * 100 + placementTermSortValue(semesterId, semesterName);
}

/** Passed / credited — leave out of Current subjects load pool. */
function isEvalRowAlreadyTaken(row) {
  if (isTransferCreditRowForTermGate(row)) return true;
  const status = String(row?.status || '')
    .toLowerCase()
    .trim();
  if (['passed', 'pass', 'complete', 'completed', 'credit'].includes(status)) return true;
  if (['failed', 'fail', 'f', 'dropped', 'drop', 'inc', 'incomplete', 'ongoing'].includes(status)) {
    return false;
  }
  if (row?.grade != null && String(row.grade).trim() !== '') {
    return gradeMeetsPassingThreshold(row.grade, passingForEvalRow(row), row.status);
  }
  return false;
}

/**
 * For next-sem mapping: hide anything already graded / passed.
 * Only blank untaken rows (and failed/incomplete retakes) belong in the map.
 */
function isEvalRowAvailableInNextSemMap(row) {
  if (isTransferCreditRowForTermGate(row)) return false;
  if (isEvalRowUntakenBlank(row)) return true;
  const status = String(row?.status || '')
    .toLowerCase()
    .trim();
  // Failed / incomplete may be retaken later.
  if (['failed', 'fail', 'f', 'dropped', 'drop', 'inc', 'incomplete'].includes(status)) {
    return true;
  }
  // Any other status or any recorded grade = already taken/graded.
  return false;
}

/** Classify semester as first / second / summer for placement preview move rules. */
function getEvalSemesterKind(semesterId, semesterName = '') {
  const name = String(semesterName || '').toLowerCase();
  if (/summer|mid\s*-?\s*year|midyear/.test(name)) return 'summer';
  if (/2nd|second/.test(name)) return 'second';
  if (/1st|first/.test(name)) return 'first';
  const id = String(semesterId ?? '');
  if (id === '3') return 'summer';
  if (id === '2') return 'second';
  if (id === '1') return 'first';
  return 'other';
}

/** Placement preview term order: 1st → 2nd → Summer. */
function placementTermSortValue(semesterId, semesterName = '') {
  const kind = getEvalSemesterKind(semesterId, semesterName);
  if (kind === 'first') return 1;
  if (kind === 'second') return 2;
  if (kind === 'summer') return 3;
  return 99;
}

const EVAL_SUMMER_UNIT_CAP = 9;
const EVAL_YEAR_UNIT_CAPS = {
  1: 23,
  2: 24,
  3: 19,
  4: 12,
  5: 12,
  6: 12,
  7: 12,
  8: 12,
  9: 12,
  10: 12,
};
/** Per-semester load cap for extended study containers (same as 4th-year standing). */
const EXTENDED_STUDY_SEM_UNIT_CAP = 12;
/** Max synthetic container id (curriculum max year + extras for retake loads). */
const EXTENDED_STUDY_MAX_YEAR = 10;

/** Retake/extension containers are NOT year levels — label by sequence past curriculum. */
function extendedStudySeq(yearId, curriculumMaxYearId = 4) {
  const n = Number(yearId);
  const max = Number(curriculumMaxYearId) || 4;
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, n - max);
}

function extendedYearDisplayLabel(yearId, curriculumMaxYearId = 4) {
  return `Extended study ${extendedStudySeq(yearId, curriculumMaxYearId)}`;
}

function emptyExtendedSemLoad() {
  return { '1': [], '2': [] };
}

function evalPlacementTermRank(yearId, semId, semName = '') {
  const y = Number(yearId);
  const yearRank = Number.isFinite(y) && y > 0 ? y : 99;
  return yearRank * 100 + placementTermSortValue(semId, semName);
}

function evalPlacementPrereqRuleYearRequirement(row) {
  const labels = Array.isArray(row?.prerequisite_rule_labels) ? row.prerequisite_rule_labels : [];
  for (const raw of labels) {
    if (!isStandingOrBulkPrerequisiteRule(raw)) continue;
    const normalized = formatEvalRequisiteRuleLabel(raw);
    const match = String(normalized).match(/(\d+)(?:st|nd|rd|th)?\s+year\s+standing/i);
    if (match) return Number(match[1]);
  }
  return null;
}

/**
 * Block moves into a term at/before an unmet prerequisite's placement.
 * Already-passed / credited prereqs (incl. FROM previous program) do not block.
 * Year/semester kind is unrestricted — only sequencing vs prereqs matters.
 */
function evalPlacementPrereqMoveGate(
  row,
  targetYearId,
  targetSemId,
  targetSemName,
  { allRows, placementMap },
) {
  if (!row) return { ok: true, note: '' };
  const targetRank = evalPlacementTermRank(targetYearId, targetSemId, targetSemName);

  const preCodes = Array.isArray(row?.prerequisite_subject_codes) ? row.prerequisite_subject_codes : [];
  const preSlots = Array.isArray(row?.prerequisite_elective_slots) ? row.prerequisite_elective_slots : [];

  for (const code of preCodes) {
    const preRow = findEvalRowBySubjectCode(allRows, code);
    if (!preRow || evalPrerequisiteRowPassed(preRow)) continue;
    const preKey = getEvaluationRowKey(preRow);
    const prePlacement = placementMap?.[preKey] || {
      yearId: preRow.year_level_id,
      semId: preRow.semester_id,
    };
    const preRank = evalPlacementTermRank(
      prePlacement.yearId,
      prePlacement.semId,
      preRow.semester_name
    );
    if (preRank >= targetRank) {
      const concise =
        formatPromotionPrerequisiteDisplay(row).replace(/^P:\s*/i, '').trim() ||
        String(code).trim();
      return { ok: false, note: `Needs ${concise} first.` };
    }
  }

  for (const req of preSlots) {
    const preRow = findEvalRowByElectiveSlotId(allRows, req?.elective_slot_id);
    if (!preRow || evalPrerequisiteRowPassed(preRow)) continue;
    const preKey = getEvaluationRowKey(preRow);
    const prePlacement = placementMap?.[preKey] || {
      yearId: preRow.year_level_id,
      semId: preRow.semester_id,
    };
    const preRank = evalPlacementTermRank(
      prePlacement.yearId,
      prePlacement.semId,
      preRow.semester_name
    );
    if (preRank >= targetRank) {
      const concise =
        formatPromotionPrerequisiteDisplay(row).replace(/^P:\s*/i, '').trim() ||
        (req?.slot_name ? String(req.slot_name) : `Elective slot ${req?.elective_slot_id ?? ''}`);
      return { ok: false, note: `Needs ${concise} first.` };
    }
  }

  const requiredYear = evalPlacementPrereqRuleYearRequirement(row);
  if (requiredYear && Number(targetYearId) < requiredYear) {
    return {
      ok: false,
      note: `Needs ${ordinalYearLabel(requiredYear)} year standing first.`,
    };
  }

  return { ok: true, note: '' };
}

/**
 * Prior/backlog subjects that only exist because of an expanded "Nth year standing"
 * rule are waived once the student is already enrolled/standing at year N+
 * AND the target subject itself fits under that year's unit cap
 * (e.g. Practicum 6u fits in 4th year / 12u — can combine with elective retakes).
 * Specific subject prereqs in the same (or later) year still apply.
 */
function yearStandingTermUnitCap(yearOrd) {
  const n = Number(yearOrd);
  if (!Number.isFinite(n) || n < 1) return null;
  if (EVAL_YEAR_UNIT_CAPS[n] != null) return EVAL_YEAR_UNIT_CAPS[n];
  if (n >= 4) return EXTENDED_STUDY_SEM_UNIT_CAP;
  return null;
}

function enrollmentSatisfiesYearStanding(targetRow, enrollmentYearOrd) {
  const requiredStanding = evalPlacementPrereqRuleYearRequirement(targetRow);
  if (requiredStanding == null || !Number.isFinite(Number(enrollmentYearOrd))) {
    return false;
  }
  if (Number(enrollmentYearOrd) < Number(requiredStanding)) return false;
  const cap = yearStandingTermUnitCap(enrollmentYearOrd);
  const units = Number(targetRow?.units);
  // Instructor rule: allow when the subject’s units fit the standing term cap
  // (Practicum 6 ≤ 12; remaining room can take Electives 2 & 3).
  if (cap != null && Number.isFinite(units) && units > 0 && units > cap) {
    return false;
  }
  return true;
}

function isBulkStandingPrereqWaived(preRow, targetRow, enrollmentYearOrd) {
  const requiredStanding = evalPlacementPrereqRuleYearRequirement(targetRow);
  if (!enrollmentSatisfiesYearStanding(targetRow, enrollmentYearOrd)) return false;
  if (!preRow) return true;
  const preYear = evalRowYearOrdinal(preRow);
  if (!Number.isFinite(preYear)) return false;
  return preYear < Number(requiredStanding);
}

function evalRowYearOrdinal(row) {
  const name = String(row?.year_level_name || '');
  const m = name.match(/(\d+)/);
  if (m) return Number(m[1]);
  const id = Number(row?.year_level_id);
  if (Number.isFinite(id) && id >= 1 && id <= 10) return id;
  return null;
}

/**
 * Current-subjects load: cannot TAKE a subject whose prerequisite is not yet passed.
 * (Taking the prereq in the same load does not unlock it — finish the prereq first.)
 * Enrollment year standing + unit-cap fit waives bulk prior-year lists
 * (e.g. practicum 6u + elective retakes within 4th year 12u).
 */
function standingLoadBlockedByPrereq(row, allRows, overrideKeys = null, enrollmentYearOrd = null) {
  if (!row) return null;
  if (overrideKeys && typeof overrideKeys.has === 'function') {
    const key = getEvaluationRowKey(row);
    if (key && overrideKeys.has(String(key))) return null;
  }
  const requiredStanding = evalPlacementPrereqRuleYearRequirement(row);
  const preCodes = Array.isArray(row?.prerequisite_subject_codes)
    ? row.prerequisite_subject_codes
    : [];
  for (const code of preCodes) {
    const preRow = findEvalRowBySubjectCode(allRows, code);
    if (!preRow) continue;
    if (evalPrerequisiteRowPassed(preRow)) continue;
    if (isBulkStandingPrereqWaived(preRow, row, enrollmentYearOrd)) continue;
    const label = String(preRow.subject_code || code).trim() || String(code).trim();
    return `Needs ${label} first`;
  }
  const preSlots = Array.isArray(row?.prerequisite_elective_slots)
    ? row.prerequisite_elective_slots
    : [];
  for (const req of preSlots) {
    const preRow = findEvalRowByElectiveSlotId(allRows, req?.elective_slot_id);
    if (!preRow) continue;
    if (evalPrerequisiteRowPassed(preRow)) continue;
    if (isBulkStandingPrereqWaived(preRow, row, enrollmentYearOrd)) continue;
    const label =
      (req?.slot_name && String(req.slot_name).trim()) ||
      String(preRow.subject_code || preRow.elective_slot_name || '').trim() ||
      'prerequisite';
    return `Needs ${label} first`;
  }
  if (enrollmentSatisfiesYearStanding(row, enrollmentYearOrd)) {
    return null;
  }
  if (
    requiredStanding != null &&
    Number.isFinite(Number(enrollmentYearOrd)) &&
    Number(enrollmentYearOrd) < Number(requiredStanding)
  ) {
    return `Requires: ${ordinalYearLabel(requiredStanding)} year standing`;
  }
  return null;
}

/**
 * Prior/backlog Take is allowed only when:
 * - listed in Offered subjects for this standing (OFFSEM), or
 * - home semester matches standing semester (true Semestral, e.g. prior 1st-sem
 *   subject while standing is also 1st sem).
 * A 2nd-sem subject during 1st-sem standing is not selectable unless offered.
 */
function standingPriorTakeGate(row, standingSemesterId, isOffered) {
  if (!row) return { ok: false, reason: 'Subject unavailable' };
  if (isOffered) return { ok: true, mode: 'offsem' };
  if (
    standingSemesterId != null &&
    standingSemesterId !== '' &&
    String(row.semester_id) === String(standingSemesterId)
  ) {
    return { ok: true, mode: 'semestral' };
  }
  const homeSem = row.semester_name || 'its home semester';
  return {
    ok: false,
    reason: `Not offered this standing — ${homeSem} subjects can only be taken if listed in Offered subjects`,
  };
}

function shouldShowOnlySubjectsToTake(student) {
  const entry = String(student?.student_entry_type || '')
    .trim()
    .toLowerCase();
  if (entry === 'shiftee' || entry === 'returnee' || entry === 'transferee') return true;
  if (student?.previous_program_id != null && student.previous_program_id !== '') return true;
  if (student?.previous_program) return true;
  return false;
}

/** Grade + status when choosing a remark button (P / F / clear). */
function gradeAndStatusForRemarkClick(status, row = null) {
  if (status === '') return { status: '', grade: '' };
  if (status === 'passed') {
    if (row && isCompleteOnlySubject(row)) {
      return { status: 'complete', grade: 'Complete' };
    }
    return { status: 'passed', grade: SIS_DEFAULT_PASS_GRADE };
  }
  if (status === 'failed') return { status: 'failed', grade: SIS_DEFAULT_FAIL_GRADE };
  return { status, grade: '' };
}

/** Stable React key / draft key for one curriculum evaluation row. */
function getEvaluationRowKey(row) {
  if (row.curriculum_id != null && row.curriculum_id !== '') {
    return `cur-${row.curriculum_id}`;
  }
  if (row.evaluation_id) {
    return `eval-${row.evaluation_id}`;
  }
  return `new-${row.subject_id}-${row.academic_year_id}-${row.semester_id}`;
}

function mergeEvalRowWithDrafts(row, drafts, keyFn) {
  const key = keyFn(row);
  const d = drafts[key];
  if (!d) return row;
  let status = row.status;
  let grade = row.grade;
  if (d.status !== '' && d.status != null) {
    status = d.status === 'inc' ? 'incomplete' : d.status;
  }
  if (d.grade !== '' && d.grade != null && String(d.grade).trim() !== '') {
    grade = d.grade;
  }
  return {
    ...row,
    status,
    grade,
    subject_id: d.subject_id ?? row.subject_id,
    subject_code: d.subject_code ?? row.subject_code,
    subject_name: d.subject_name ?? row.subject_name,
    units: d.units ?? row.units,
  };
}

function normalizeEvalSubjectCode(code) {
  return String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function findEvalRowBySubjectCode(rows, code) {
  const c = normalizeEvalSubjectCode(code);
  if (!c) return null;
  return rows.find((r) => normalizeEvalSubjectCode(r.subject_code) === c) ?? null;
}

function findEvalRowByElectiveSlotId(rows, slotId) {
  if (slotId == null || slotId === '') return null;
  return rows.find((r) => Number(r.elective_slot_id) === Number(slotId)) ?? null;
}

function normalizeItSubjectCode(code) {
  return String(code || '').replace(/\s+/g, '').toUpperCase();
}

const DIGITAL_ARTS_ELECTIVE_CODES = new Set(['ITE391', 'ITE392', 'ITE240', 'ITE388']);

/** Subject codes tied to a track on Electives 1–3 (not Elective 4). */
function trackElectiveCodesFromCurriculum(rows, trackId) {
  const codes = new Set();
  if (trackId == null || trackId === '') return codes;
  const tid = Number(trackId);
  if (!Number.isFinite(tid)) return codes;
  for (const row of rows || []) {
    if (isItElectivesFourRow(row)) continue;
    const choices = Array.isArray(row?.elective_choices) ? row.elective_choices : [];
    for (const c of choices) {
      if (Number(c.track_id) !== tid) continue;
      const code = normalizeItSubjectCode(c.subject_code);
      if (code) codes.add(code);
    }
  }
  return codes;
}

/** Subjects already placed on Electives 1–3 for this student. */
function earlierElectiveSubjectCodes(rows) {
  const codes = new Set();
  for (const row of rows || []) {
    if (!row?.elective_slot_id || isItElectivesFourRow(row)) continue;
    const code = normalizeItSubjectCode(row.subject_code);
    if (code && !/^ITELECTIVES/i.test(code.replace(/\s+/g, ''))) {
      codes.add(code);
    }
  }
  return codes;
}

function filterElectiveFourSubjectChoices(choices, { trackKey, studentTrackId, allRows }) {
  const ownTrackCodes = trackElectiveCodesFromCurriculum(allRows, studentTrackId);
  const usedEarlier = earlierElectiveSubjectCodes(allRows);
  const seen = new Set();

  return (Array.isArray(choices) ? choices : [])
    .filter((choice) => {
      const subjectCode = normalizeItSubjectCode(choice.subject_code);
      if (!subjectCode || seen.has(subjectCode)) return false;
      // Digi Elective 4: only ITE 388 (4th dedicated Digi elective) — auto-assign.
      if (trackKey === 'digital') {
        if (subjectCode !== 'ITE388') return false;
        seen.add(subjectCode);
        return true;
      }
      // SysDev / Cyber / BAM: hide that track's Electives 1–3 subjects (already on path).
      if (ownTrackCodes.has(subjectCode) || usedEarlier.has(subjectCode)) return false;
      seen.add(subjectCode);
      return true;
    })
    .map((choice) => ({
      ...choice,
      label: `${choice.subject_code || ''} - ${choice.subject_name || 'Elective subject'}`.trim(),
    }));
}

function itTrackKeyFromStudent(student) {
  const text = `${student?.track?.track_name || ''} ${student?.track?.track_code || ''}`.toLowerCase();
  if (text.includes('digital') || text.includes('digi')) return 'digital';
  if (text.includes('cyber')) return 'cyber';
  if (text.includes('business') || text.includes('bam')) return 'business';
  if (text.includes('system') || text.includes('sys')) return 'sysdev';
  return '';
}

function isItElectivesFourRow(row) {
  const label = `${row?.elective_slot_name || ''} ${row?.subject_code || ''}`.toLowerCase();
  return /\bit\s*electives?\s*4\b/.test(label);
}

function itTrackKeyFromChoiceOrStudent(choice, student) {
  const text = `${choice?.track_name || ''} ${choice?.track_code || ''} ${student?.track?.track_name || ''} ${student?.track?.track_code || ''}`.toLowerCase();
  if (text.includes('digital') || text.includes('digi')) return 'digital';
  if (text.includes('cyber')) return 'cyber';
  if (text.includes('business') || text.includes('bam')) return 'business';
  if (text.includes('system') || text.includes('sys')) return 'sysdev';
  return itTrackKeyFromStudent(student);
}

function ordinalYearLabel(year) {
  const n = Number(year);
  if (!Number.isFinite(n) || n < 1) return '';
  const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/**
 * Year standing from earned curriculum units (study-map thresholds):
 * ≥46 → 2nd, ≥94 → 3rd, ≥132 → 4th; otherwise 1st.
 */
function yearStandingFromEarnedUnits(earnedUnits) {
  const u = Number(earnedUnits);
  const earned = Number.isFinite(u) ? u : 0;
  if (earned >= 132) return 4;
  if (earned >= 94) return 3;
  if (earned >= 46) return 2;
  return 1;
}

/**
 * School year for standing banners = student's curriculum Effective SY
 * (does not advance with year level — that SY identifies which curriculum they are under).
 */
function schoolYearLabelForStanding(curriculumEffectiveYearOrLabel) {
  const raw = String(curriculumEffectiveYearOrLabel || '').trim();
  if (!raw) return null;
  const range = raw.match(/(\d{4})\s*[-–]\s*(\d{2,4})/);
  if (range) {
    const start = Number(range[1]);
    if (!Number.isFinite(start) || start <= 0) return raw;
    const endRaw = range[2];
    const end =
      endRaw.length <= 2 ? start + 1 : Number(endRaw.length === 2 ? `20${endRaw}` : endRaw);
    if (Number.isFinite(end) && end > start) return `${start}-${end}`;
    return `${start}-${start + 1}`;
  }
  const yearOnly = raw.match(/(\d{4})/);
  if (yearOnly) {
    const start = Number(yearOnly[1]);
    if (Number.isFinite(start) && start > 0) return `${start}-${start + 1}`;
  }
  return raw;
}

function isRegularAcademicStatus(status) {
  return /^regular$/i.test(String(status || '').trim());
}

function isIrregularAcademicStatus(status) {
  return /^irregular$/i.test(String(status || '').trim());
}

function resolveYearOptionIdForStanding(years, standingYear, parseYearNumber) {
  const target = Number(standingYear);
  if (!Number.isFinite(target) || !Array.isArray(years) || years.length === 0) return '';
  const match = years.find((y) => {
    const n =
      typeof parseYearNumber === 'function'
        ? parseYearNumber(y.label, y.id)
        : Number(y.id);
    return Number(n) === target;
  });
  if (match) return String(match.id);
  // Fallback: year_level_id often equals 1..4
  const byId = years.find((y) => Number(y.id) === target);
  return byId ? String(byId.id) : String(years[0].id);
}

function formatEvalRequisiteRuleLabel(label) {
  const raw = String(label || '').trim();
  if (!raw) return '';

  // "all subjects from 1st year to 3rd year" → "4th year standing"
  const rangeMatch = raw.match(
    /^all\s+subjects?\s+from\s+(?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth)\s+year\s+to\s+(\d+)(?:st|nd|rd|th)?\s+year$/i
  );
  if (rangeMatch) {
    const throughYear = Number(rangeMatch[1]);
    if (Number.isFinite(throughYear) && throughYear >= 1) {
      return `${ordinalYearLabel(throughYear + 1)} year standing`;
    }
  }

  // "all subjects through 3rd year" / "all subjects up to 3rd year"
  const throughMatch = raw.match(
    /^all\s+subjects?\s+(?:through|upto|up\s+to|until)\s+(\d+)(?:st|nd|rd|th)?\s+year$/i
  );
  if (throughMatch) {
    const throughYear = Number(throughMatch[1]);
    if (Number.isFinite(throughYear) && throughYear >= 1) {
      return `${ordinalYearLabel(throughYear + 1)} year standing`;
    }
  }

  if (/^all\s+subjects?$/i.test(raw)) {
    return 'all prior subjects';
  }

  const standingMatch = raw.match(
    /^(2|2nd|second|3|3rd|third|4|4th|fourth|5|5th|fifth)\s+year\s+standing$/i
  );
  if (!standingMatch) return raw;

  const normalized = String(standingMatch[1]).toLowerCase();
  const year =
    normalized === '2' || normalized === '2nd' || normalized === 'second'
      ? '2nd'
      : normalized === '3' || normalized === '3rd' || normalized === 'third'
        ? '3rd'
        : normalized === '4' || normalized === '4th' || normalized === 'fourth'
          ? '4th'
          : '5th';
  return `${year} year standing`;
}

function isStandingOrBulkPrerequisiteRule(label) {
  const raw = String(label || '').trim();
  if (!raw) return false;
  if (/year\s+standing$/i.test(formatEvalRequisiteRuleLabel(raw))) return true;
  if (/^all\s+subjects?/i.test(raw)) return true;
  return false;
}

/** Major / professional subject (not GE / NSTP / PED / SSP). */
function isMajorEvalRow(row) {
  // Pending elective slot (no concrete subject yet) is not a graded major.
  if (row?.subject_id == null || row?.subject_id === '') return false;
  const type = String(row?.subject_type || '')
    .trim()
    .toLowerCase();
  if (type === 'core' || type === 'major') return true;
  if (
    type === 'minor' ||
    type === 'ge' ||
    type === 'general education' ||
    type === 'elective' ||
    type === 'elective subject'
  ) {
    return false;
  }
  const code = String(row?.subject_code || '')
    .trim()
    .toUpperCase();
  if (!code) return false;
  if (/^(GEN|PED|NST|SSP|MAT|ART|HIS|ETH|UTS|STS|RZL|CWTS|ROTC)\b/.test(code)) {
    return false;
  }
  if (/^IT\s*ELECTIVES?\b/.test(code)) return false;
  if (/^(ITE|IT|CS|NUR|HES|BIO|MLS|ACC|BA|TM|HM)\b/.test(code)) {
    return true;
  }
  return false;
}

function yearOrdinalFromEvalRow(row, parseYearNumber) {
  if (typeof parseYearNumber === 'function') {
    const n = parseYearNumber(row?.year_level_name, row?.year_level_id);
    if (n != null && Number.isFinite(Number(n))) return Number(n);
  }
  const fromName = String(row?.year_level_name || '').match(/(\d)/);
  if (fromName) return Number(fromName[1]);
  const id = Number(row?.year_level_id);
  return Number.isFinite(id) ? id : 0;
}

/** Every major in years below the target subject's year is passed/credited. */
function lowerYearMajorsComplete(allRows, targetRow, parseYearNumber) {
  const maxY = yearOrdinalFromEvalRow(targetRow, parseYearNumber);
  if (!maxY || maxY <= 1) return true;
  return (allRows || []).every((row) => {
    if (row?.previous_program_only === true) return true;
    if (!isMajorEvalRow(row)) return true;
    const y = yearOrdinalFromEvalRow(row, parseYearNumber);
    if (!y || y >= maxY) return true;
    return evalPrerequisiteRowPassed(row);
  });
}

function rowHasStandingPrerequisiteRule(row) {
  const labels = Array.isArray(row?.prerequisite_rule_labels)
    ? row.prerequisite_rule_labels
    : [];
  return labels.some((label) => isStandingOrBulkPrerequisiteRule(label));
}

/**
 * Promote modal / summary text. StudentCurriculumEvaluationBuilder sets `prerequisite` null but
 * sends prerequisite codes in `prerequisite_subject_codes` (same data Curriculum Management shows as "P: …").
 */
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

function formatPromotionPrerequisiteDisplay(row) {
  const direct = row?.prerequisite != null ? String(row.prerequisite).trim() : '';
  if (direct) return direct;
  const pre = row?.prerequisite_subject_codes;
  const co = row?.corequisite_subject_codes;
  const preRules = Array.isArray(row?.prerequisite_rule_labels)
    ? row.prerequisite_rule_labels.map(formatEvalRequisiteRuleLabel).filter(Boolean)
    : [];
  const coRules = Array.isArray(row?.corequisite_rule_labels)
    ? row.corequisite_rule_labels.map(formatEvalRequisiteRuleLabel).filter(Boolean)
    : [];
  const preSlots = Array.isArray(row?.prerequisite_elective_slots)
    ? row.prerequisite_elective_slots
    : [];
  const slotLabels = preSlots
    .map((s) => (s?.slot_name ? String(s.slot_name).trim() : ''))
    .filter(Boolean);

  const parts = [];
  if (preRules.length > 0) {
    parts.push(`P: ${[...new Set(preRules)].join(', ')}`);
  } else if (slotLabels.length > 0) {
    parts.push(`P: ${[...new Set(slotLabels)].join(', ')}`);
  } else if (Array.isArray(pre) && pre.length > 0) {
    // Avoid dumping huge expanded standing lists when no rule label was sent.
    if (pre.length <= 8) {
      const list = pre.map((c) => String(c).trim()).filter(Boolean);
      if (list.length) parts.push(`P: ${list.join(', ')}`);
    } else {
      parts.push('P: year standing / prior subjects');
    }
  }
  if (coRules.length > 0) {
    parts.push(`Co: ${[...new Set(coRules)].join(', ')}`);
  } else if (Array.isArray(co) && co.length > 0) {
    const list = co.map((c) => String(c).trim()).filter(Boolean);
    if (list.length) parts.push(`Co: ${list.join(', ')}`);
  }
  if (parts.length) return parts.join(' · ');
  return '';
}

function escapeHtmlText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isElectiveTrackPendingRow(row) {
  return row?.elective_pending === true && (row?.subject_id == null || row.subject_id === '');
}

function isTrackSelectableElectiveRow(row) {
  return row?.elective_slot_id != null && Array.isArray(row?.elective_choices) && row.elective_choices.length > 0;
}

function dedupeElectiveChoicesByTrack(choices) {
  const list = Array.isArray(choices) ? choices : [];
  const m = new Map();
  for (const c of list) {
    const k = c.track_id != null && c.track_id !== '' ? `t:${c.track_id}` : `s:${c.subject_id}`;
    if (!m.has(k)) m.set(k, c);
  }
  return [...m.values()];
}

/**
 * Collapse legacy CS/SD duplicates into CYBER / SYS DEV (plus BI / DA).
 * Preference: SYS DEV > SD, CYBER > CS.
 */
function itTrackFamilyKeyFromChoice(choice) {
  const text = `${choice?.track_name || ''} ${choice?.track_code || ''}`.toLowerCase();
  if (text.includes('digital') || text.includes('digi') || /\bda\b/.test(text)) return 'digital';
  if (text.includes('cyber') || text.includes('computer security') || /\bcs\b/.test(text)) return 'cyber';
  if (text.includes('business') || text.includes('bam') || /\bbi\b/.test(text)) return 'business';
  if (text.includes('system') || text.includes('sys') || /\bsd\b/.test(text)) return 'sysdev';
  return '';
}

function trackFamilyPreferenceScore(choice) {
  const code = String(choice?.track_code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
  if (code === 'SYS DEV' || code === 'SYSDEV' || code === 'CYBER' || code === 'BI' || code === 'DA') {
    return 3;
  }
  if (code === 'SD' || code === 'CS') return 0;
  return 1;
}

function dedupeElectiveChoicesByTrackFamily(choices) {
  const list = dedupeElectiveChoicesByTrack(choices);
  const byFamily = new Map();
  const ungrouped = [];
  for (const c of list) {
    if (c.track_id == null || c.track_id === '') {
      ungrouped.push(c);
      continue;
    }
    const family = itTrackFamilyKeyFromChoice(c);
    if (!family) {
      ungrouped.push(c);
      continue;
    }
    const existing = byFamily.get(family);
    if (!existing || trackFamilyPreferenceScore(c) > trackFamilyPreferenceScore(existing)) {
      byFamily.set(family, c);
    }
  }
  return [...byFamily.values(), ...ungrouped];
}

function electiveChoiceLabel(c) {
  const tn = [c.track_name, c.track_code].filter(Boolean).join(' ').trim();
  const sn = (c.subject_name || '').trim();
  const sc = (c.subject_code || '').trim();
  if (tn && sn) return `${tn} — ${sn}${sc ? ` (${sc})` : ''}`;
  if (sn) return `${sn}${sc ? ` (${sc})` : ''}`;
  return sc || 'Elective option';
}

/** Same rule as student My Curriculum: only prerequisites block; corequisites are concurrent.
 *  When enrollmentYearOrd is set, bulk "Nth year standing" lists for years < N are waived
 *  if the student is already standing at year N+ (instructor: practicum + backlog retakes).
 */
function evalRowPrerequisitesMet(allRows, targetRow, enrollmentYearOrd = null) {
  const requiredStanding = evalPlacementPrereqRuleYearRequirement(targetRow);
  const standingMet = enrollmentSatisfiesYearStanding(targetRow, enrollmentYearOrd);
  const pre = targetRow.prerequisite_subject_codes;
  const codes = [...(Array.isArray(pre) ? pre : [])];
  const slotPrereqs = Array.isArray(targetRow.prerequisite_elective_slots)
    ? targetRow.prerequisite_elective_slots
    : [];
  const seen = new Set();
  if (codes.length === 0 && slotPrereqs.length === 0) {
    if (requiredStanding != null && !standingMet) return false;
    return true;
  }
  for (const slotReq of slotPrereqs) {
    const pr = findEvalRowByElectiveSlotId(allRows, slotReq?.elective_slot_id);
    if (!pr) return false;
    if (isBulkStandingPrereqWaived(pr, targetRow, enrollmentYearOrd)) continue;
    if (pr.passed_via_transfer_credit === true) continue;
    const st = String(pr.status || '')
      .toLowerCase()
      .trim();
    if (st === 'inc' || st === 'incomplete') return false;
    if (st === 'passed' || st === 'pass' || st === 'credit') continue;
    const pgSlot =
      pr.passing_grade != null && pr.passing_grade !== '' && !Number.isNaN(parseFloat(pr.passing_grade))
        ? parseFloat(pr.passing_grade)
        : 50;
    const rawGSlot = pr.grade;
    if (gradeMeetsPassingThreshold(rawGSlot, pgSlot, st)) continue;
    if (st === 'failed' || st === 'fail' || st === 'f') return false;
    if (rawGSlot != null && String(rawGSlot).trim() !== '' && !isCompleteGrade(rawGSlot)) return false;
    return false;
  }
  for (const code of codes) {
    const cn = normalizeEvalSubjectCode(code);
    if (!cn || seen.has(cn)) continue;
    seen.add(cn);
    const pr = findEvalRowBySubjectCode(allRows, code);
    if (!pr) continue;
    if (isBulkStandingPrereqWaived(pr, targetRow, enrollmentYearOrd)) continue;
    if (pr.passed_via_transfer_credit === true) continue;
    const st = String(pr.status || '')
      .toLowerCase()
      .trim();
    if (st === 'inc' || st === 'incomplete') return false;
    if (st === 'passed' || st === 'pass' || st === 'credit') continue;
    const pg =
      pr.passing_grade != null && pr.passing_grade !== '' && !Number.isNaN(parseFloat(pr.passing_grade))
        ? parseFloat(pr.passing_grade)
        : 50;
    const rawG = pr.grade;
    if (gradeMeetsPassingThreshold(rawG, pg, st)) continue;
    if (st === 'failed' || st === 'fail' || st === 'f') return false;
    if (rawG != null && String(rawG).trim() !== '' && !isCompleteGrade(rawG)) return false;
    return false;
  }
  if (requiredStanding != null && !standingMet) return false;
  return true;
}

function evalPrerequisiteRowPassed(row) {
  if (!row) return false;
  if (row.passed_via_transfer_credit === true) return true;
  const status = String(row.status || '').toLowerCase().trim();
  if (status === 'passed' || status === 'pass' || status === 'credit') return true;
  if (status === 'inc' || status === 'incomplete' || status === 'failed' || status === 'fail' || status === 'f') {
    return false;
  }
  const passing = passingForEvalRow(row);
  return gradeMeetsPassingThreshold(row.grade, passing, status);
}

function unmetEvalPrerequisiteLabels(allRows, targetRow, enrollmentYearOrd = null) {
  const preRules = Array.isArray(targetRow?.prerequisite_rule_labels)
    ? targetRow.prerequisite_rule_labels
    : [];
  const standingRuleLabels = [
    ...new Set(
      preRules
        .filter((label) => isStandingOrBulkPrerequisiteRule(label))
        .map((label) => formatEvalRequisiteRuleLabel(label))
        .filter(Boolean)
    ),
  ];
  const requiredStanding = evalPlacementPrereqRuleYearRequirement(targetRow);
  const standingMet = enrollmentSatisfiesYearStanding(targetRow, enrollmentYearOrd);

  if (requiredStanding != null && !standingMet) {
    return standingRuleLabels.length
      ? standingRuleLabels
      : [`${ordinalYearLabel(requiredStanding)} year standing`];
  }

  const labels = [];
  const seen = new Set();
  const pre = Array.isArray(targetRow?.prerequisite_subject_codes)
    ? targetRow.prerequisite_subject_codes
    : [];
  pre.forEach((code) => {
    const normalized = normalizeEvalSubjectCode(code);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    const row = findEvalRowBySubjectCode(allRows, code);
    if (!row || evalPrerequisiteRowPassed(row)) return;
    if (isBulkStandingPrereqWaived(row, targetRow, enrollmentYearOrd)) return;
    labels.push(String(code).trim());
  });

  const slotPrereqs = Array.isArray(targetRow?.prerequisite_elective_slots)
    ? targetRow.prerequisite_elective_slots
    : [];
  slotPrereqs.forEach((slotReq) => {
    const slotId = slotReq?.elective_slot_id;
    if (slotId == null || slotId === '') return;
    const key = `slot:${slotId}`;
    if (seen.has(key)) return;
    seen.add(key);
    const row = findEvalRowByElectiveSlotId(allRows, slotId);
    if (!row || evalPrerequisiteRowPassed(row)) return;
    if (isBulkStandingPrereqWaived(row, targetRow, enrollmentYearOrd)) return;
    labels.push(slotReq?.slot_name || row.elective_slot_name || `Elective slot ${slotId}`);
  });

  // Standing / "all subjects through year N" → show "4th year standing", not dozens of codes.
  if (standingRuleLabels.length > 0 && labels.length > 0) {
    return standingRuleLabels;
  }

  // Huge expanded lists without a rule label still collapse.
  if (labels.length > 8) {
    return ['prior year standing not met'];
  }

  return labels;
}

/**
 * @param {object} props
 * @param {'need-evaluation'|'already-evaluated'} [props.listMode]
 * @param {'pending'|'completed'|'all'} [props.listScope] — API student list filter (default: completed for evaluated tab, all for need-evaluation tab).
 * @param {'default'|'curriculumTracking'} [props.variant] — Curriculum tab: Figma-style copy and all-student list.
 */
const EVALUATION_WORK_PERMS = [
  'Student Evaluation',
  'evaluation.view',
  'evaluation.create',
  'evaluation.edit',
  'evaluation.approve',
];

/** Enter / change grades (User permissions: Credit Evaluation → Full access). */
const GRADE_EDIT_PERMS = ['evaluation.create', 'evaluation.edit', 'evaluation.approve'];
/** Promote only (Adviser default) can still promote without grade edits. */
const PROMOTE_PERMS = [...GRADE_EDIT_PERMS, 'evaluation.promote'];

/** Subject equivalence create/edit (evaluation quick modal + catalog maintenance). */
const SUBJECT_EQUIV_MUTATE_PERMS = [
  'System Management',
  'Credit Evaluation',
  'credit_eval.create',
  'credit_eval.approve',
];

/** Local unsaved grade drafts so a disconnect / refresh does not wipe typing. */
function evaluationDraftCacheKey(userId, studentId) {
  if (studentId == null || studentId === '') return null;
  const uid = userId != null && userId !== '' ? String(userId) : 'anon';
  return `evaluation-unsaved-drafts:v1:${uid}:${studentId}`;
}

/** Last opened student on Curriculum Evaluation — survives reload / brief disconnect. */
function evaluationSelectionCacheKey(userId, listMode) {
  const uid = userId != null && userId !== '' ? String(userId) : 'anon';
  const mode = listMode != null && listMode !== '' ? String(listMode) : 'need-evaluation';
  return `evaluation-last-student:v1:${uid}:${mode}`;
}

function readLastEvaluationSelection(cacheKey) {
  if (!cacheKey || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const studentIdNumber = String(parsed.student_id_number || '').trim();
    if (!studentIdNumber) return null;
    return {
      student_id: parsed.student_id ?? null,
      student_id_number: studentIdNumber,
      listYearLevelFilter:
        parsed.listYearLevelFilter != null ? String(parsed.listYearLevelFilter) : '',
      listStandingFilter:
        parsed.listStandingFilter != null ? String(parsed.listStandingFilter) : '',
    };
  } catch {
    return null;
  }
}

function writeLastEvaluationSelection(cacheKey, payload) {
  if (!cacheKey || typeof window === 'undefined' || !payload?.student_id_number) return;
  try {
    window.localStorage.setItem(
      cacheKey,
      JSON.stringify({
        student_id: payload.student_id ?? null,
        student_id_number: String(payload.student_id_number),
        listYearLevelFilter: payload.listYearLevelFilter ?? '',
        listStandingFilter: payload.listStandingFilter ?? '',
        savedAt: new Date().toISOString(),
      })
    );
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function clearLastEvaluationSelection(cacheKey) {
  if (!cacheKey || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(cacheKey);
  } catch {
    // ignore
  }
}

function readEvaluationDraftCache(cacheKey) {
  if (!cacheKey || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.drafts || typeof parsed.drafts !== 'object') return null;
    const keys = Array.isArray(parsed.modifiedKeys)
      ? parsed.modifiedKeys.map(String).filter(Boolean)
      : [];
    if (!keys.length) return null;
    return { drafts: parsed.drafts, modifiedKeys: keys, savedAt: parsed.savedAt || null };
  } catch {
    return null;
  }
}

function writeEvaluationDraftCache(cacheKey, drafts, modifiedKeys) {
  if (!cacheKey || typeof window === 'undefined') return;
  try {
    const keys = [...modifiedKeys].map(String);
    if (!keys.length) {
      window.localStorage.removeItem(cacheKey);
      return;
    }
    const slim = {};
    for (const key of keys) {
      if (drafts[key]) slim[key] = drafts[key];
    }
    window.localStorage.setItem(
      cacheKey,
      JSON.stringify({
        modifiedKeys: keys,
        drafts: slim,
        savedAt: Date.now(),
      })
    );
  } catch {
    // Quota / private mode — ignore.
  }
}

function clearEvaluationDraftCache(cacheKey) {
  if (!cacheKey || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(cacheKey);
  } catch {
    // Ignore.
  }
}

const StudentEvaluationView = ({
  listMode = 'need-evaluation',
  listScope: listScopeProp,
  variant = 'default',
}) => {
  const { user, isAdmin, isFaculty, isProgramHead, isDean, hasAnyPermission } = useAuth();
  const evaluatorFullName = useMemo(() => {
    const display = String(user?.display_name || '').trim();
    if (display) return display;
    const first = String(user?.first_name || user?.fname || '').trim();
    const last = String(user?.last_name || user?.lname || '').trim();
    const joined = [first, last].filter(Boolean).join(' ').trim();
    if (joined) return joined;
    return String(user?.email || '').trim();
  }, [user?.display_name, user?.first_name, user?.fname, user?.last_name, user?.lname, user?.email]);
  const { open: systemGuideOpen } = useSystemGuide();
  const canEdit = !!(isAdmin || isFaculty || isProgramHead || hasAnyPermission(EVALUATION_WORK_PERMS));
  const canEditGrades = !!(isAdmin || hasAnyPermission(GRADE_EDIT_PERMS));
  const canPromoteStudents = !!(isAdmin || hasAnyPermission(PROMOTE_PERMS));
  /** View only / Promote only: evaluation rows are read-only. */
  const isEvaluatorOnly = canEdit && !canEditGrades;
  const canEditEvaluationRows = canEdit && !isEvaluatorOnly;
  const canEditNumericGrades = canEditEvaluationRows;
  const canManageSubjectEquivalences = isAdmin || hasAnyPermission(SUBJECT_EQUIV_MUTATE_PERMS);
  /** Dean / PH / Admin may unlock major subjects blocked by year-standing. */
  const canGrantMajorStandingOverride = !!(isAdmin || isDean || isProgramHead);
  const isEvaluatedModule = listMode === 'already-evaluated';
  /** Practice accounts for Dean-side testing without touching real students. */
  const canManageSimulationDummy = !!(
    (isAdmin || isDean || isProgramHead) &&
    canEditEvaluationRows &&
    !isEvaluatedModule
  );
  const isCurriculumTracking = variant === 'curriculumTracking';
  /** Need-evaluation tab loads the full roster (`all`) so students stay visible after a completion is logged; Evaluated tab still filters to `completed`. */
  const resolvedListScope =
    listScopeProp ?? (isEvaluatedModule ? 'completed' : 'all');

  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [baselineData, setBaselineData] = useState(null);
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const studentListAbortRef = useRef(null);
  const autoPromoteAttemptRef = useRef('');
  const offsemMigratedRef = useRef('');
  const guideDemoLoadingRef = useRef(false);
  const selectionRestoredRef = useRef(false);

  const selectionCacheKey = useMemo(
    () => evaluationSelectionCacheKey(user?.user_id ?? user?.id, listMode),
    [user?.user_id, user?.id, listMode]
  );

  // Track all drafts and which ones have been modified
  const [drafts, setDrafts] = useState({});
  const [modifiedKeys, setModifiedKeys] = useState(new Set());
  const draftCacheHydratedStudentRef = useRef(null);
  const [savingAll, setSavingAll] = useState(false);
  const savingAllRef = useRef(false);
  const [, setSaveError] = useState('');
  const [promoteModalOpen, setPromoteModalOpen] = useState(false);
  const [promoteEvaluatedBy, setPromoteEvaluatedBy] = useState('');
  const [promoteModalTrackId, setPromoteModalTrackId] = useState('');
  const [promoteModalElective4SubjectId, setPromoteModalElective4SubjectId] = useState('');
  const [promoteSaving, setPromoteSaving] = useState(false);
  const [guidePromotionPreviewSaved, setGuidePromotionPreviewSaved] = useState(false);
  const [guideLoadPlanPreviewSaved, setGuideLoadPlanPreviewSaved] = useState(false);
  const [electiveTrackSaving, setElectiveTrackSaving] = useState(false);
  const [pendingProgramId, setPendingProgramId] = useState(null);
  /** Editable name draft for simulation dummies only. */
  const [pendingSimName, setPendingSimName] = useState(null);
  const [programPreviewLoading, setProgramPreviewLoading] = useState(false);
  const [programs, setPrograms] = useState([]);
  const [electiveTrackPopoverKey, setElectiveTrackPopoverKey] = useState(null);
  const [electiveSubjectPopoverKey, setElectiveSubjectPopoverKey] = useState(null);
  const [electiveTrackDrafts, setElectiveTrackDrafts] = useState({});
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  /** options = term picker (same format as before); preview = B&W report before download */
  const [downloadModalStep, setDownloadModalStep] = useState('options');
  const [downloadPreviewHtml, setDownloadPreviewHtml] = useState('');
  const [downloadScope, setDownloadScope] = useState('all');
  const [downloadSelectedTermKeys, setDownloadSelectedTermKeys] = useState([]);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const electiveTrackPopoverRef = useRef(null);
  const [subjectEquivModalOpen, setSubjectEquivModalOpen] = useState(false);
  const [subjectEquivFixedLocal, setSubjectEquivFixedLocal] = useState(null);
  /** Preview-only placements for remaining subjects. */
  const [placementPreviewOpen, setPlacementPreviewOpen] = useState(false);
  const [placementPreviewMap, setPlacementPreviewMap] = useState({});
  const [placementPreviewConfirmedMap, setPlacementPreviewConfirmedMap] = useState({});
  const [placementPreviewInsertSlotKey, setPlacementPreviewInsertSlotKey] = useState(null);
  const placementPreviewStorageKey = useMemo(() => {
    const sid = data?.student?.student_id;
    return sid != null && sid !== '' ? `evaluation-placement-preview:${sid}` : null;
  }, [data?.student?.student_id]);

  const evaluationDraftStorageKey = useMemo(
    () =>
      evaluationDraftCacheKey(
        user?.user_id ?? user?.id,
        data?.student?.student_id ?? selectedStudent?.student_id
      ),
    [user?.user_id, user?.id, data?.student?.student_id, selectedStudent?.student_id]
  );

  const clearLocalEvaluationDraftCache = useCallback(() => {
    clearEvaluationDraftCache(evaluationDraftStorageKey);
  }, [evaluationDraftStorageKey]);

  const [listYearLevelFilter, setListYearLevelFilter] = useState('');
  /** '' | regular | irregular | unevaluated | unevaluated_irregular */
  const [listStandingFilter, setListStandingFilter] = useState('');
  const [evalFilterCurriculumId, setEvalFilterCurriculumId] = useState('');
  const [evalFilterYearId, setEvalFilterYearId] = useState('');
  const [evalFilterSemesterId, setEvalFilterSemesterId] = useState('');
  const [standingSaving, setStandingSaving] = useState(false);
  const [simulationCreating, setSimulationCreating] = useState(false);
  /** Extra years beyond curriculum map (5th, 6th, …) — length depends on the student. */
  const [extendedYearIds, setExtendedYearIds] = useState(() => []);
  /** Subjects in extended year containers: { '5': { '1': [keys], '2': [keys] }, ... }. */
  const [extendedYearLoad, setExtendedYearLoad] = useState(() => ({}));
  const [extendedAddTarget, setExtendedAddTarget] = useState({ yearId: '', semId: '' });
  const [extendedAddSubjectKey, setExtendedAddSubjectKey] = useState('');
  const [currentStandingPanelOpen, setCurrentStandingPanelOpen] = useState(false);
  const [standingLoadDeferred, setStandingLoadDeferred] = useState(() => new Set());
  const [standingLoadSaving, setStandingLoadSaving] = useState(false);
  const [standingLoadDirty, setStandingLoadDirty] = useState(false);
  /** Prior-term takes: OFFSEM/Semestral badge at curriculum home; Subject placement holds the standing-term move. */
  const [offSemesterTakeMap, setOffSemesterTakeMap] = useState({});
  /** After save load plan: map subjects for the following semester. */
  const [nextSemMapOpen, setNextSemMapOpen] = useState(false);
  const [nextSemSelectedKeys, setNextSemSelectedKeys] = useState(() => new Set());
  const [nextSemCurrentTakeKeys, setNextSemCurrentTakeKeys] = useState(() => new Set());
  const [nextSemMapNeedsInit, setNextSemMapNeedsInit] = useState(false);
  const getRowKey = getEvaluationRowKey;
  const offSemesterStorageKey = useMemo(() => {
    const sid = data?.student?.student_id;
    return sid != null && sid !== '' ? `evaluation-offsem-takes:${sid}` : null;
  }, [data?.student?.student_id]);
  const nextSemPlanStorageKey = useMemo(() => {
    const sid = data?.student?.student_id;
    return sid != null && sid !== '' ? `evaluation-next-sem-plan:${sid}` : null;
  }, [data?.student?.student_id]);

  const mergedRowsForPrereq = useMemo(() => {
    if (!data?.rows?.length) return [];
    return data.rows.map((row) => mergeEvalRowWithDrafts(row, drafts, getEvaluationRowKey));
  }, [data?.rows, drafts]);

  const mergedRowsByKey = useMemo(
    () => new Map(mergedRowsForPrereq.map((row) => [getEvaluationRowKey(row), row])),
    [mergedRowsForPrereq],
  );

  /** Earned / remaining that include unsaved grade & pass previews. */
  const previewSummary = useMemo(() => {
    const server = data?.summary || {};
    const curriculumFromServer = Number(server.total_units_in_curriculum);
    let curriculumUnits = Number.isFinite(curriculumFromServer) ? curriculumFromServer : 0;
    let earned = 0;
    let curriculumFromRows = 0;

    (mergedRowsForPrereq.length ? mergedRowsForPrereq : data?.rows || []).forEach((row) => {
      if (row?.previous_program_only === true) return;
      const units = Number(row?.units);
      const u = Number.isFinite(units) && units > 0 ? units : 0;
      curriculumFromRows += u;
      if (evalPrerequisiteRowPassed(row) || isTransferCreditRowForTermGate(row)) {
        earned += u;
      }
    });

    if (!curriculumUnits) curriculumUnits = curriculumFromRows;
    return {
      total_units_in_curriculum: curriculumUnits,
      total_units_earned: earned,
      lacking_units: Math.max(0, curriculumUnits - earned),
    };
  }, [data?.summary, data?.rows, mergedRowsForPrereq]);

  const showPlacementPreview = true;

  const placementPreviewSlots = useMemo(() => {
    if (!data?.rows?.length) return [];
    const map = new Map();
    const years = new Map();
    const kindMeta = {};

    data.rows.forEach((row) => {
      const yearId = row.year_level_id;
      const semId = row.semester_id;
      const yearLabel = row.year_level_name || `Year ${yearId ?? ''}`;
      const semesterLabel = row.semester_name || `Semester ${semId ?? ''}`;
      const key = `${yearId ?? '∅'}|${semId ?? '∅'}`;

      if (yearId != null && yearId !== '') {
        years.set(String(yearId), { yearId, yearLabel });
      }

      const kind = getEvalSemesterKind(semId, semesterLabel);
      if (kind !== 'other' && !kindMeta[kind]) {
        kindMeta[kind] = { semId, semesterLabel };
      }

      if (map.has(key)) return;
      map.set(key, {
        key,
        yearId,
        semId,
        yearLabel,
        semesterLabel,
        label: `${yearLabel} — ${semesterLabel}`,
      });
    });

    // Always expose 1st / 2nd / Summer per year (even when curriculum has no Summer rows).
    if (!kindMeta.first) kindMeta.first = { semId: 1, semesterLabel: '1st Semester' };
    if (!kindMeta.second) kindMeta.second = { semId: 2, semesterLabel: '2nd Semester' };
    if (!kindMeta.summer) kindMeta.summer = { semId: 3, semesterLabel: 'Summer' };

    years.forEach(({ yearId, yearLabel }) => {
      ['first', 'second', 'summer'].forEach((kind) => {
        const hasKind = [...map.values()].some(
          (s) =>
            String(s.yearId ?? '') === String(yearId ?? '') &&
            getEvalSemesterKind(s.semId, s.semesterLabel) === kind,
        );
        if (hasKind) return;
        const meta = kindMeta[kind];
        const key = `${yearId ?? '∅'}|${meta.semId ?? '∅'}`;
        if (map.has(key)) return;
        map.set(key, {
          key,
          yearId,
          semId: meta.semId,
          yearLabel,
          semesterLabel: meta.semesterLabel,
          label: `${yearLabel} — ${meta.semesterLabel}`,
        });
      });
    });

    return [...map.values()].sort((a, b) => {
      const ay = Number(a.yearId ?? 0) - Number(b.yearId ?? 0);
      if (ay !== 0) return ay;
      return (
        placementTermSortValue(a.semId, a.semesterLabel) -
        placementTermSortValue(b.semId, b.semesterLabel)
      );
    });
  }, [data?.rows]);

  const parseYearNumberFromLabel = useCallback((yearLabel, yearId) => {
    const txt = String(yearLabel || '').toLowerCase();
    if (/(^|\D)(1|1st|first)(\D|$)/.test(txt)) return 1;
    if (/(^|\D)(2|2nd|second)(\D|$)/.test(txt)) return 2;
    if (/(^|\D)(3|3rd|third)(\D|$)/.test(txt)) return 3;
    if (/(^|\D)(4|4th|fourth)(\D|$)/.test(txt)) return 4;
    const idNum = Number(yearId);
    return Number.isFinite(idNum) && idNum >= 1 && idNum <= 4 ? idNum : null;
  }, []);

  const getPlacementSlotMeta = useCallback(
    (yearId, semId) =>
      placementPreviewSlots.find(
        (s) =>
          String(s.yearId ?? '') === String(yearId ?? '') &&
          String(s.semId ?? '') === String(semId ?? ''),
      ) || null,
    [placementPreviewSlots],
  );

  const getPlacementSlotUnitCap = useCallback(
    (yearId, semId, slotMeta) => {
      const semLabel = slotMeta?.semesterLabel || '';
      const semKind = getEvalSemesterKind(semId, semLabel);
      if (semKind === 'summer') return EVAL_SUMMER_UNIT_CAP;

      const yearLabel = slotMeta?.yearLabel || '';
      const yn = parseYearNumberFromLabel(yearLabel, yearId);
      if (yn && EVAL_YEAR_UNIT_CAPS[yn]) return EVAL_YEAR_UNIT_CAPS[yn];
      return EVAL_YEAR_UNIT_CAPS[1];
    },
    [parseYearNumberFromLabel],
  );

  const placementPreviewRemainingRows = useMemo(() => {
    return mergedRowsForPrereq.filter((row) => !evalPrerequisiteRowPassed(row));
  }, [mergedRowsForPrereq]);

  const placementPreviewYears = useMemo(() => {
    const byYear = new Map();
    placementPreviewSlots.forEach((slot) => {
      const yearKey = String(slot.yearId ?? 'unknown');
      if (!byYear.has(yearKey)) {
        byYear.set(yearKey, {
          key: yearKey,
          yearId: slot.yearId,
          yearLabel: slot.yearLabel,
          sections: [],
        });
      }
      byYear.get(yearKey).sections.push({
        ...slot,
        rows: [],
      });
    });

    placementPreviewRemainingRows.forEach((row) => {
      const rowKey = getEvaluationRowKey(row);
      const placement = placementPreviewMap[rowKey] || {
        yearId: row.year_level_id,
        semId: row.semester_id,
      };
      const yearKey = String(placement.yearId ?? 'unknown');
      const sectionKey = `${placement.yearId ?? '∅'}|${placement.semId ?? '∅'}`;
      let yearGroup = byYear.get(yearKey);
      if (!yearGroup) {
        yearGroup = {
          key: yearKey,
          yearId: placement.yearId,
          yearLabel: row.year_level_name || `Year ${placement.yearId ?? ''}`,
          sections: [],
        };
        byYear.set(yearKey, yearGroup);
      }
      let section = yearGroup.sections.find((s) => s.key === sectionKey);
      if (!section) {
        const slotMeta = placementPreviewSlots.find((s) => s.key === sectionKey);
        section = {
          key: sectionKey,
          yearId: placement.yearId,
          semId: placement.semId,
          yearLabel: slotMeta?.yearLabel || row.year_level_name || `Year ${placement.yearId ?? ''}`,
          semesterLabel: slotMeta?.semesterLabel || row.semester_name || `Semester ${placement.semId ?? ''}`,
          label: slotMeta?.label || `${placement.yearId} — ${placement.semId}`,
          rows: [],
        };
        yearGroup.sections.push(section);
      }
      section.rows.push(row);
    });

    return [...byYear.values()]
      .map((year) => ({
        ...year,
        sections: year.sections.sort(
          (a, b) =>
            placementTermSortValue(a.semId, a.semesterLabel) -
            placementTermSortValue(b.semId, b.semesterLabel),
        ),
      }))
      .sort((a, b) => Number(a.yearId ?? 0) - Number(b.yearId ?? 0));
  }, [placementPreviewSlots, placementPreviewRemainingRows, placementPreviewMap]);

  const movePlacementPreviewSubject = useCallback(
    (rowKey, yearId, semId) => {
      const movingRow = placementPreviewRemainingRows.find(
        (r) => getEvaluationRowKey(r) === String(rowKey),
      );
      if (!movingRow) return false;

      const candidateMap = {
        ...placementPreviewMap,
        [rowKey]: { yearId, semId },
      };
      const slotMeta = getPlacementSlotMeta(yearId, semId);
      const prereqGate = evalPlacementPrereqMoveGate(
        movingRow,
        yearId,
        semId,
        slotMeta?.semesterLabel || '',
        {
          allRows: mergedRowsForPrereq,
          placementMap: candidateMap,
        },
      );
      if (!prereqGate.ok) {
        swalToast('warning', prereqGate.note || 'Take the prerequisite first.');
        return false;
      }
      const cap = getPlacementSlotUnitCap(yearId, semId, slotMeta);
      const targetUnits = placementPreviewRemainingRows.reduce((acc, row) => {
        const key = getEvaluationRowKey(row);
        const placement = candidateMap[key] || {
          yearId: row.year_level_id,
          semId: row.semester_id,
        };
        if (
          String(placement.yearId ?? '') === String(yearId ?? '') &&
          String(placement.semId ?? '') === String(semId ?? '')
        ) {
          const u = Number(row.units);
          return acc + (Number.isFinite(u) ? u : 0);
        }
        return acc;
      }, 0);

      if (targetUnits > cap) {
        const label = slotMeta?.semesterLabel || 'this term';
        swalToast('warning', `Cannot exceed ${cap} units in ${label}.`);
        return false;
      }

      setPlacementPreviewMap(candidateMap);
      return true;
    },
    [
      placementPreviewRemainingRows,
      placementPreviewMap,
      mergedRowsForPrereq,
      getPlacementSlotMeta,
      getPlacementSlotUnitCap,
    ],
  );

  const placementPreviewSubjectOptions = useMemo(() => {
    return placementPreviewRemainingRows.map((row) => {
      const id = getEvaluationRowKey(row);
      const code = row.subject_code || row.elective_slot_name || '—';
      const title =
        row.subject_name || (row.elective_pending ? 'Pending track selection' : '—');
      const placement = placementPreviewMap[id] || {
        yearId: row.year_level_id,
        semId: row.semester_id,
      };
      const slotKey = `${placement.yearId ?? ''}|${placement.semId ?? ''}`;
      const slot = placementPreviewSlots.find((s) => s.key === slotKey);
      return {
        id,
        label: `${code} — ${title}`,
        where: slot ? slot.label : 'Unplaced',
        slotKey,
        homeSemId: row.semester_id,
        homeSemName: row.semester_name,
      };
    });
  }, [placementPreviewRemainingRows, placementPreviewMap, placementPreviewSlots]);

  const insertPlacementPreviewSubjectIntoSlot = useCallback(
    (rowKey, yearId, semId) => {
      if (!rowKey) return;
      const row = placementPreviewRemainingRows.find(
        (r) => getEvaluationRowKey(r) === String(rowKey),
      );
      if (!row) return;
      const moved = movePlacementPreviewSubject(String(rowKey), yearId, semId);
      if (moved) {
        setPlacementPreviewInsertSlotKey(null);
      }
    },
    [placementPreviewRemainingRows, movePlacementPreviewSubject],
  );

  const getPlacementMoveOptionsForRow = useCallback(
    (row, currentKey) => {
      return placementPreviewSlots.filter((slot) => {
        if (slot.key === currentKey) return true;
        const rowKey = getEvaluationRowKey(row);
        const candidateMap = {
          ...placementPreviewMap,
          [rowKey]: { yearId: slot.yearId, semId: slot.semId },
        };
        return evalPlacementPrereqMoveGate(
          row,
          slot.yearId,
          slot.semId,
          slot.semesterLabel,
          {
            allRows: mergedRowsForPrereq,
            placementMap: candidateMap,
          },
        ).ok;
      });
    },
    [placementPreviewSlots, placementPreviewMap, mergedRowsForPrereq],
  );

  const placementPreviewHasPendingChanges = useMemo(() => {
    const current = JSON.stringify(placementPreviewMap);
    const confirmed = JSON.stringify(placementPreviewConfirmedMap);
    return current !== confirmed;
  }, [placementPreviewMap, placementPreviewConfirmedMap]);

  const placementPreviewPendingCount = useMemo(() => {
    if (!placementPreviewHasPendingChanges) return 0;
    const keys = new Set([
      ...Object.keys(placementPreviewMap),
      ...Object.keys(placementPreviewConfirmedMap),
    ]);
    let count = 0;
    keys.forEach((key) => {
      const cur = placementPreviewMap[key];
      const conf = placementPreviewConfirmedMap[key];
      if (JSON.stringify(cur ?? null) !== JSON.stringify(conf ?? null)) count += 1;
    });
    return count;
  }, [placementPreviewHasPendingChanges, placementPreviewMap, placementPreviewConfirmedMap]);

  const handleConfirmPlacementPreview = useCallback(() => {
    if (!placementPreviewHasPendingChanges) return;
    setPlacementPreviewConfirmedMap(placementPreviewMap);
    setPlacementPreviewInsertSlotKey(null);
    if (placementPreviewStorageKey) {
      try {
        window.localStorage.setItem(
          placementPreviewStorageKey,
          JSON.stringify(placementPreviewMap || {}),
        );
      } catch {
        // Ignore storage failures; preview still works in-memory.
      }
    }
    swalToast('success', 'Preview placement confirmed.');
  }, [placementPreviewHasPendingChanges, placementPreviewMap, placementPreviewStorageKey]);

  const handleDiscardPlacementPreview = useCallback(() => {
    setPlacementPreviewMap(placementPreviewConfirmedMap);
    setPlacementPreviewInsertSlotKey(null);
    if (placementPreviewStorageKey) {
      try {
        window.localStorage.setItem(
          placementPreviewStorageKey,
          JSON.stringify(placementPreviewConfirmedMap || {}),
        );
      } catch {
        // Ignore storage failures; preview still works in-memory.
      }
    }
    swalToast('info', 'Preview changes discarded.');
  }, [placementPreviewConfirmedMap, placementPreviewStorageKey]);

  /** API may use incomplete; UI uses inc — treat as equivalent. */
  const normalizeStatusForCompare = (s) => {
    if (s === '' || s == null) return '';
    const t = String(s).trim().toLowerCase();
    if (t === 'inc' || t === 'incomplete') return 'incomplete';
    return t;
  };

  const draftMatchesSavedRow = (draftGrade, draftStatus, row, draftDeadline = '') => {
    const gradeOk =
      manualGradesEquivalentForRow(draftGrade, row.grade) &&
      normalizeStatusForCompare(draftStatus) === normalizeStatusForCompare(row.status);
    if (!gradeOk) return false;
    if (normalizeStatusForCompare(draftStatus) !== 'incomplete') return true;
    const rowD = row.inc_compliance_deadline
      ? String(row.inc_compliance_deadline).slice(0, 10)
      : '';
    const d = draftDeadline ? String(draftDeadline).slice(0, 10) : '';
    return rowD === d;
  };

  const isRowGradable = (row) =>
    row.subject_id != null && row.subject_id !== '';

  /** Transfer credit on an active evaluation (pending with mapped subject, or approved). */
  const isTransferCreditRow = (row) =>
    row?.passed_via_transfer_credit === true ||
    String(row?.status || '').toLowerCase() === 'credit';

  const fetchStudentList = useCallback(
    async (search = '') => {
      // Cancel any in-flight list request so typing stays responsive.
      if (studentListAbortRef.current) {
        studentListAbortRef.current.abort();
      }
      const controller = new AbortController();
      studentListAbortRef.current = controller;

      setLoadingList(true);
      try {
        const trimmed = String(search || '').trim();
        const params = {
          search: trimmed || undefined,
          limit: trimmed ? 200 : 2000,
        };
        if (resolvedListScope !== 'all') {
          params.academic_record = resolvedListScope;
        }
        const response = await api.get('/evaluation/students', {
          params,
          signal: controller.signal,
          skipLoading: true,
        });
        const list = response.data.students || [];
        setStudents(list);
        setSelectedStudent((prev) => {
          if (!prev) return prev;
          const found = list.find((s) => s.student_id === prev.student_id);
          return found || prev;
        });
      } catch (err) {
        if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') {
          return;
        }
        console.error('Error fetching student list:', err);
        setStudents([]);
      } finally {
        if (studentListAbortRef.current === controller) {
          setLoadingList(false);
        }
      }
    },
    [resolvedListScope]
  );

  /** After grades are saved, ensure one academic-record completion exists so the student appears under Evaluated students (no separate "Store" step). */
  const syncStudentToEvaluatedListIfNeeded = useCallback(
    async (studentId) => {
      if (!canEdit || isEvaluatedModule || !studentId) return;
      try {
        const res = await api.get('/evaluation/academic-record/completions', {
          params: { student_id: studentId },
          skipLoading: true,
        });
        const already = (res.data.completions || []).length > 0;
        if (!already) {
          await api.post('/evaluation/academic-record/complete', {
            student_id: studentId,
          });
        }
        await fetchStudentList(searchTerm);
      } catch (e) {
        console.warn('Could not sync evaluated-students list', e);
      }
    },
    [canEdit, isEvaluatedModule, fetchStudentList, searchTerm]
  );

  useEffect(() => {
    const delay = searchTerm.trim() ? 200 : 0;
    const timeoutId = setTimeout(() => {
      fetchStudentList(searchTerm);
    }, delay);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, fetchStudentList]);

  useEffect(() => {
    const loadPrograms = async () => {
      try {
        const response = await api.get('/lookup/programs', { skipLoading: true });
        const programsData = Array.isArray(response.data)
          ? response.data
          : response.data?.data || response.data || [];
        setPrograms(Array.isArray(programsData) ? programsData : []);
      } catch (err) {
        console.warn('Could not fetch programs:', err);
        setPrograms([]);
      }
    };
    loadPrograms();
  }, []);

  const persistStudentStanding = useCallback(
    async ({ yearId, semesterId, toastOnSuccess = false }) => {
      const studentId = data?.student?.student_id;
      if (!canEditEvaluationRows || !studentId || !yearId || !semesterId) return false;
      setStandingSaving(true);
      try {
        const response = await api.post('/evaluation/student/standing', {
          student_id: Number(studentId),
          year_level_id: Number(yearId),
          semester_id: Number(semesterId),
        });
        const nextStudent = response.data?.student;
        const nextCurriculum = response.data?.curriculum;
        if (nextStudent || nextCurriculum) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  student: nextStudent ? { ...prev.student, ...nextStudent } : prev.student,
                  curriculum: nextCurriculum || prev.curriculum,
                }
              : prev
          );
          setBaselineData((prev) =>
            prev
              ? {
                  ...prev,
                  student: nextStudent ? { ...prev.student, ...nextStudent } : prev.student,
                  curriculum: nextCurriculum || prev.curriculum,
                }
              : prev
          );
        }
        // Standing changed — clear local load/placement caches for the old term.
        setStandingLoadDeferred(new Set());
        setStandingLoadDirty(false);
        setPlacementPreviewMap({});
        setPlacementPreviewConfirmedMap({});
        setOffSemesterTakeMap({});
        if (toastOnSuccess) {
          swalToast('success', response.data?.message || 'Student standing updated.');
        }
        return true;
      } catch (err) {
        await swalError(
          'Could not update standing',
          err.response?.data?.message || 'Request failed'
        );
        return false;
      } finally {
        setStandingSaving(false);
      }
    },
    [canEditEvaluationRows, data?.student?.student_id]
  );

  const curriculumMaxYearId = useMemo(() => {
    let max = 0;
    (data?.rows || []).forEach((r) => {
      const n = Number(r.year_level_id);
      if (Number.isFinite(n) && n > max) max = n;
    });
    return max > 0 ? max : 4;
  }, [data?.rows]);

  useEffect(() => {
    const sid = data?.student?.student_id ?? selectedStudent?.student_id;
    if (sid == null || sid === '') {
      setExtendedYearIds([]);
      setExtendedYearLoad({});
      return;
    }
    const standingY = Number(
      data?.student?.promotion_target_year_level_id ?? data?.student?.year_level_id ?? 0
    );
    try {
      const yearsRaw = window.localStorage.getItem(`evaluation-extended-years:${sid}`);
      let years = [];
      if (yearsRaw) {
        const parsed = JSON.parse(yearsRaw);
        if (Array.isArray(parsed)) {
          years = parsed.map(String).filter((y) => Number(y) > curriculumMaxYearId);
        }
      }
      // Legacy single-year flag → 5th year
      if (
        years.length === 0 &&
        window.localStorage.getItem(`evaluation-extended-study:${sid}`) === '1'
      ) {
        years = [String(curriculumMaxYearId + 1)];
      }
      if (
        Number.isFinite(standingY) &&
        standingY > curriculumMaxYearId &&
        !years.includes(String(standingY))
      ) {
        years = [...years, String(standingY)].sort((a, b) => Number(a) - Number(b));
      }
      setExtendedYearIds(years);

      const loadRaw = window.localStorage.getItem(`evaluation-extended-load:${sid}`);
      if (loadRaw) {
        const parsed = JSON.parse(loadRaw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // Migrate legacy {1:[],2:[]} → { '5': {1:[],2:[]} }
          if (Array.isArray(parsed['1']) || Array.isArray(parsed['2'])) {
            const firstY = years[0] || String(curriculumMaxYearId + 1);
            setExtendedYearLoad({
              [firstY]: {
                '1': Array.isArray(parsed['1']) ? parsed['1'].map(String) : [],
                '2': Array.isArray(parsed['2']) ? parsed['2'].map(String) : [],
              },
            });
          } else {
            const next = {};
            Object.keys(parsed).forEach((y) => {
              const sem = parsed[y] || {};
              next[String(y)] = {
                '1': Array.isArray(sem['1']) ? sem['1'].map(String) : [],
                '2': Array.isArray(sem['2']) ? sem['2'].map(String) : [],
              };
            });
            setExtendedYearLoad(next);
          }
        } else {
          setExtendedYearLoad({});
        }
      } else {
        setExtendedYearLoad({});
      }
    } catch {
      setExtendedYearIds(
        Number.isFinite(standingY) && standingY > curriculumMaxYearId
          ? [String(standingY)]
          : []
      );
      setExtendedYearLoad({});
    }
  }, [
    data?.student?.student_id,
    data?.student?.year_level_id,
    data?.student?.promotion_target_year_level_id,
    selectedStudent?.student_id,
    curriculumMaxYearId,
  ]);

  const persistExtendedYearIds = useCallback(
    (years) => {
      const sorted = [...new Set(years.map(String))].sort(
        (a, b) => Number(a) - Number(b)
      );
      setExtendedYearIds(sorted);
      const sid = data?.student?.student_id ?? selectedStudent?.student_id;
      if (sid == null || sid === '') return;
      try {
        if (sorted.length) {
          window.localStorage.setItem(
            `evaluation-extended-years:${sid}`,
            JSON.stringify(sorted)
          );
          window.localStorage.setItem(`evaluation-extended-study:${sid}`, '1');
        } else {
          window.localStorage.removeItem(`evaluation-extended-years:${sid}`);
          window.localStorage.removeItem(`evaluation-extended-study:${sid}`);
          window.localStorage.removeItem(`evaluation-extended-load:${sid}`);
        }
      } catch {
        // ignore
      }
    },
    [data?.student?.student_id, selectedStudent?.student_id]
  );

  const persistExtendedYearLoad = useCallback(
    (nextLoad) => {
      setExtendedYearLoad(nextLoad);
      const sid = data?.student?.student_id ?? selectedStudent?.student_id;
      if (sid == null || sid === '') return;
      try {
        window.localStorage.setItem(
          `evaluation-extended-load:${sid}`,
          JSON.stringify(nextLoad)
        );
      } catch {
        // ignore
      }
    },
    [data?.student?.student_id, selectedStudent?.student_id]
  );

  const canManageExtendedStudy = !!(
    (isAdmin || isDean || isProgramHead) &&
    canEditEvaluationRows &&
    !isEvaluatedModule
  );

  const nextExtendedYearId = useMemo(() => {
    const maxExt = extendedYearIds.reduce(
      (m, y) => Math.max(m, Number(y) || 0),
      curriculumMaxYearId
    );
    const next = maxExt + 1;
    return next <= EXTENDED_STUDY_MAX_YEAR ? String(next) : null;
  }, [extendedYearIds, curriculumMaxYearId]);

  const remainingExtendedSubjects = useMemo(() => {
    if (!data?.rows?.length) return [];
    return data.rows.filter((row) => {
      if (row?.previous_program_only === true) return false;
      if (isTransferCreditRowForTermGate(row)) return false;
      const merged = mergedRowsByKey.get(getEvaluationRowKey(row)) || row;
      if (!isRowGradableForTermGate(merged)) return false;
      return !evalPrerequisiteRowPassed(merged);
    });
  }, [data?.rows, mergedRowsByKey]);

  const extendedLoadAssignedKeys = useMemo(() => {
    const keys = [];
    Object.values(extendedYearLoad || {}).forEach((semMap) => {
      if (!semMap || typeof semMap !== 'object') return;
      keys.push(...(semMap['1'] || []), ...(semMap['2'] || []));
    });
    return new Set(keys.map(String));
  }, [extendedYearLoad]);

  const extendedSubjectPickerOptions = useMemo(() => {
    return remainingExtendedSubjects
      .filter((row) => !extendedLoadAssignedKeys.has(getEvaluationRowKey(row)))
      .map((row) => {
        const key = getEvaluationRowKey(row);
        const code = row.subject_code || row.elective_slot_name || 'Subject';
        const title = row.subject_name || '';
        const units = Number(row.units) || 0;
        return {
          value: key,
          label: `${code} — ${title} (${units}u · ${row.year_level_name || '—'}/${row.semester_name || '—'})`,
        };
      });
  }, [remainingExtendedSubjects, extendedLoadAssignedKeys]);

  const unitsForExtendedRow = useCallback(
    (rowKey) => {
      const row =
        mergedRowsByKey.get(String(rowKey)) ||
        (data?.rows || []).find((r) => getEvaluationRowKey(r) === String(rowKey));
      const u = Number(row?.units);
      return Number.isFinite(u) && u > 0 ? u : 0;
    },
    [mergedRowsByKey, data?.rows]
  );

  const addSubjectToExtendedSemester = useCallback(
    (yearId, semId, rowKey) => {
      if (!rowKey || !yearId) return;
      const yid = String(yearId);
      const sid = String(semId);
      const key = String(rowKey);
      if (extendedLoadAssignedKeys.has(key)) {
        swalToast('warning', 'Subject is already in an extended year load.');
        return;
      }
      const yearLoad = extendedYearLoad[yid] || emptyExtendedSemLoad();
      const currentKeys = yearLoad[sid] || [];
      const currentUnits = currentKeys.reduce((sum, k) => sum + unitsForExtendedRow(k), 0);
      const addUnits = unitsForExtendedRow(key);
      if (currentUnits + addUnits > EXTENDED_STUDY_SEM_UNIT_CAP) {
        swalToast(
          'warning',
          `Extended semester cap is ${EXTENDED_STUDY_SEM_UNIT_CAP} units. This would be ${currentUnits + addUnits}.`
        );
        return;
      }
      const next = {
        ...extendedYearLoad,
        [yid]: {
          ...yearLoad,
          [sid]: [...currentKeys, key],
        },
      };
      persistExtendedYearLoad(next);
      setExtendedAddSubjectKey('');
      swalToast('success', `Subject added to ${extendedYearDisplayLabel(yid, curriculumMaxYearId)}.`);
    },
    [
      extendedLoadAssignedKeys,
      extendedYearLoad,
      unitsForExtendedRow,
      persistExtendedYearLoad,
      curriculumMaxYearId,
    ]
  );

  const removeSubjectFromExtendedSemester = useCallback(
    (yearId, semId, rowKey) => {
      const yid = String(yearId);
      const sid = String(semId);
      const yearLoad = extendedYearLoad[yid] || emptyExtendedSemLoad();
      const next = {
        ...extendedYearLoad,
        [yid]: {
          ...yearLoad,
          [sid]: (yearLoad[sid] || []).filter((k) => String(k) !== String(rowKey)),
        },
      };
      persistExtendedYearLoad(next);
    },
    [extendedYearLoad, persistExtendedYearLoad]
  );

  const addExtendedStudyYear = useCallback(() => {
    if (!canManageExtendedStudy || !nextExtendedYearId) {
      if (!nextExtendedYearId) {
        swalToast(
          'info',
          `You can add up to ${EXTENDED_STUDY_MAX_YEAR - curriculumMaxYearId} extended study containers for retakes.`,
        );
      }
      return;
    }
    const yid = nextExtendedYearId;
    const nextYears = [...extendedYearIds, yid];
    persistExtendedYearIds(nextYears);
    persistExtendedYearLoad({
      ...extendedYearLoad,
      [yid]: emptyExtendedSemLoad(),
    });
    // Extended years are planning containers only — do NOT overwrite Year Level /
    // standing (that stays units-based or explicit promote for irregulars).
    swalToast(
      'success',
      `${extendedYearDisplayLabel(yid, curriculumMaxYearId)} added — blank 1st & 2nd semester for retakes (max ${EXTENDED_STUDY_SEM_UNIT_CAP}u each). Standing stays at ${ordinalYearLabel(curriculumMaxYearId)} Year.`,
    );
  }, [
    canManageExtendedStudy,
    nextExtendedYearId,
    extendedYearIds,
    extendedYearLoad,
    persistExtendedYearIds,
    persistExtendedYearLoad,
    curriculumMaxYearId,
  ]);

  const removeExtendedStudyYear = useCallback(
    (yearId) => {
      const yid = String(yearId);
      const nextYears = extendedYearIds.filter((y) => String(y) !== yid);
      persistExtendedYearIds(nextYears);
      const nextLoad = { ...extendedYearLoad };
      delete nextLoad[yid];
      persistExtendedYearLoad(nextYears.length ? nextLoad : {});
      if (String(evalFilterYearId) === yid) {
        const fallback =
          nextYears[nextYears.length - 1] ||
          String(curriculumMaxYearId);
        setEvalFilterYearId(fallback);
        setEvalFilterSemesterId('1');
      }
      swalToast('info', `${extendedYearDisplayLabel(yid, curriculumMaxYearId)} removed.`);
    },
    [
      extendedYearIds,
      extendedYearLoad,
      persistExtendedYearIds,
      persistExtendedYearLoad,
      evalFilterYearId,
      curriculumMaxYearId,
    ]
  );

  const programOptions = useMemo(
    () =>
      programs.map((program) => ({
        value: String(program.program_id),
        label: program.program_code
          ? `${program.program_name || 'Unnamed Program'} (${program.program_code})`
          : program.program_name || `Program ${program.program_id}`,
      })),
    [programs],
  );

  const savedProgramId = baselineData?.student?.program?.program_id ?? null;
  const hasPendingProgramChange =
    pendingProgramId != null &&
    Number(pendingProgramId) !== Number(savedProgramId ?? '');

  const isSelectedSimulation = !!(
    selectedStudent?.is_simulation ||
    data?.student?.is_simulation ||
    baselineData?.student?.is_simulation
  );

  const hasPendingSimNameChange = useMemo(() => {
    if (!isSelectedSimulation || !pendingSimName || !baselineData?.student) return false;
    const b = baselineData.student;
    return (
      String(pendingSimName.first_name || '').trim() !== String(b.first_name || '').trim() ||
      String(pendingSimName.last_name || '').trim() !== String(b.last_name || '').trim() ||
      String(pendingSimName.middle_name || '').trim() !== String(b.middle_name || '').trim()
    );
  }, [isSelectedSimulation, pendingSimName, baselineData?.student]);

  const unsavedChangeCount =
    modifiedKeys.size + (hasPendingProgramChange ? 1 : 0) + (hasPendingSimNameChange ? 1 : 0);
  const hasUnsavedChanges = unsavedChangeCount > 0;
  const displayProgramId = hasPendingProgramChange ? pendingProgramId : savedProgramId;

  const yearLevelOptions = useMemo(() => {
    const m = new Map();
    let hasUnassigned = false;
    students.forEach((s) => {
      const id = s.year_level_id;
      if (id == null || id === '') {
        hasUnassigned = true;
        return;
      }
      const name = s.year_level_name || `Year ${id}`;
      m.set(String(id), name);
    });
    const opts = [...m.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => Number(a.id) - Number(b.id));
    if (hasUnassigned) {
      opts.push({ id: '__unassigned__', name: 'Unassigned' });
    }
    return opts;
  }, [students]);

  const filteredStudents = useMemo(() => {
    let list = students;
    if (listYearLevelFilter === '__unassigned__') {
      list = list.filter((s) => s.year_level_id == null || s.year_level_id === '');
    } else if (listYearLevelFilter) {
      list = list.filter((s) => String(s.year_level_id ?? '') === listYearLevelFilter);
    }

    if (listStandingFilter) {
      list = list.filter((s) => {
        // Practice dummies are for Guide/testing only — they are not counted in any standing
        // (same as Dean Analytics).
        if (s.is_simulation) return false;
        const isIrregular = /^irregular$/i.test(String(s.academic_status || '').trim());
        const isUnevaluated = !s.academic_record_evaluated;
        if (listStandingFilter === 'unevaluated') return isUnevaluated;
        if (listStandingFilter === 'regular') return !isIrregular;
        if (listStandingFilter === 'irregular') return isIrregular;
        if (listStandingFilter === 'unevaluated_irregular') return isUnevaluated && isIrregular;
        return true;
      });
    }

    return list;
  }, [students, listYearLevelFilter, listStandingFilter]);

  const evaluationFilterOptions = useMemo(() => {
    if (!data?.rows?.length) {
      return { years: [], curricula: [], programLabel: '' };
    }
    const rows = data.rows;
    const yearsMap = new Map();
    rows.forEach((r) => {
      if (r.year_level_id != null && r.year_level_id !== '') {
        const label = r.year_level_name || `Year ${r.year_level_id}`;
        yearsMap.set(String(r.year_level_id), { id: String(r.year_level_id), label });
      }
    });
    const years = [...yearsMap.values()].sort((a, b) => Number(a.id) - Number(b.id));

    // Curriculum dropdown = student's assigned curriculum version only (e.g. 2018-19).
    const curricula = [];
    const curriculumMeta = data?.curriculum;
    if (curriculumMeta?.curriculum_header_id != null) {
      curricula.push({
        id: String(curriculumMeta.curriculum_header_id),
        label: curriculumMeta.label || String(curriculumMeta.effective_year || curriculumMeta.curriculum_header_id),
      });
    }

    const programLabel =
      data.student?.program?.program_name ||
      data.student?.program?.program_code ||
      'Program';
    return { years, curricula, programLabel };
  }, [data]);

  const orderedCurriculumTerms = useMemo(() => {
    if (!data?.rows?.length) return [];
    const m = new Map();
    data.rows.forEach((r) => {
      const y = r.year_level_id;
      const s = r.semester_id;
      if (y == null || y === '' || s == null || s === '') return;
      const k = `${y}-${s}`;
      if (!m.has(k)) {
        m.set(k, {
          year_level_id: String(y),
          semester_id: String(s),
          year_level_name: r.year_level_name,
          semester_name: r.semester_name,
        });
      }
    });
    // Extended study years beyond the curriculum map (5th, 6th, …).
    extendedYearIds.forEach((yearId) => {
      const yid = String(yearId);
      const hasYear = [...m.values()].some((t) => String(t.year_level_id) === yid);
      if (hasYear) return;
      const semSamples = new Map([
        ['1', '1st Semester'],
        ['2', '2nd Semester'],
      ]);
      [...m.values()].forEach((t) => {
        const sid = String(t.semester_id);
        if (sid === '1' || sid === '2') {
          semSamples.set(sid, t.semester_name || semSamples.get(sid));
        }
      });
      semSamples.forEach((semName, semId) => {
        m.set(`${yid}-${semId}`, {
          year_level_id: yid,
          semester_id: String(semId),
          year_level_name: extendedYearDisplayLabel(yid, curriculumMaxYearId),
          semester_name: semName || `Semester ${semId}`,
        });
      });
    });
    return [...m.values()].sort((a, b) => {
      const dy = Number(a.year_level_id) - Number(b.year_level_id);
      if (dy !== 0) return dy;
      return (
        semesterSortValue(a.semester_id, a.semester_name) -
        semesterSortValue(b.semester_id, b.semester_name)
      );
    });
  }, [data?.rows, extendedYearIds, curriculumMaxYearId]);

  const downloadTermOptions = useMemo(() => {
    if (!data?.rows?.length) return [];
    const rowCountByTerm = data.rows.reduce((acc, row) => {
      const key = evaluationTermKeyFromRow(row);
      acc.set(key, (acc.get(key) || 0) + 1);
      return acc;
    }, new Map());

    return orderedCurriculumTerms.map((term) => {
      const key = evaluationTermKeyFromParts(term.year_level_id, term.semester_id);
      return {
        key,
        label: `${term.year_level_name || `Year ${term.year_level_id}`} - ${
          term.semester_name || `Semester ${term.semester_id}`
        }`,
        rowCount: rowCountByTerm.get(key) || 0,
        year_level_id: term.year_level_id,
        semester_id: term.semester_id,
      };
    });
  }, [data?.rows, orderedCurriculumTerms]);

  const currentDownloadTermKey = useMemo(() => {
    if (!evalFilterYearId || !evalFilterSemesterId) return '';
    return evaluationTermKeyFromParts(evalFilterYearId, evalFilterSemesterId);
  }, [evalFilterYearId, evalFilterSemesterId]);

  /** Index of the term the student was last promoted into (so filters can reach that year/semester). */
  const promotionTargetTermIndex = useMemo(() => {
    if (!orderedCurriculumTerms.length || !data?.student?.promoted_next_sem_at) return -1;
    const ty = data.student.promotion_target_year_level_id;
    const ts = data.student.promotion_target_semester_id;
    if (ty == null || ty === '' || ts == null || ts === '') return -1;
    const idx = orderedCurriculumTerms.findIndex(
      (t) => String(t.year_level_id) === String(ty) && String(t.semester_id) === String(ts)
    );
    return idx >= 0 ? idx : -1;
  }, [data?.student, orderedCurriculumTerms]);

  const currentYearFirstTermIndex = useMemo(() => {
    if (!orderedCurriculumTerms.length || data?.student?.year_level_id == null) return -1;
    const idx = orderedCurriculumTerms.findIndex(
      (t) => String(t.year_level_id) === String(data.student.year_level_id)
    );
    return idx >= 0 ? idx : -1;
  }, [data?.student?.year_level_id, orderedCurriculumTerms]);

  /**
   * Deepest term index the user may view. Grades alone must not unlock the next
   * semester; only the explicit Promote action extends access to the target term.
   */
  const maxSelectableTermIndex = useMemo(() => {
    if (!orderedCurriculumTerms.length) return -1;
    const last = orderedCurriculumTerms.length - 1;
    return Math.min(Math.max(0, currentYearFirstTermIndex, promotionTargetTermIndex), last);
  }, [orderedCurriculumTerms, currentYearFirstTermIndex, promotionTargetTermIndex]);

  const allowedTerms = useMemo(() => {
    if (maxSelectableTermIndex < 0 || !orderedCurriculumTerms.length) return [];
    return orderedCurriculumTerms.slice(0, maxSelectableTermIndex + 1);
  }, [orderedCurriculumTerms, maxSelectableTermIndex]);

  const allowedTermKeySet = useMemo(
    () => new Set(allowedTerms.map((t) => `${t.year_level_id}-${t.semester_id}`)),
    [allowedTerms]
  );

  const firstIncompleteAllowedTerm = useMemo(() => {
    if (!allowedTerms.length || !data?.rows?.length) return allowedTerms[allowedTerms.length - 1] || null;
    return (
      allowedTerms.find((term) => {
        const termRows = data.rows.filter(
          (row) =>
            String(row.year_level_id) === term.year_level_id &&
            String(row.semester_id) === term.semester_id
        );
        return termRows.length > 0 && !termRows.every((row) => isEvalRowCompleteFromServerRow(row));
      }) ||
      allowedTerms[allowedTerms.length - 1] ||
      null
    );
  }, [allowedTerms, data?.rows]);

  /** Standing load: recorded subjects must be complete. Untaken blanks (e.g. Prog 2 for summer) do not block. */
  const currentTermCompleteForPromotion = useMemo(() => {
    if (!data?.rows?.length || !evalFilterYearId || !evalFilterSemesterId) return false;

    const deferred = new Set(
      (Array.isArray(data?.student?.standing_deferred_keys)
        ? data.student.standing_deferred_keys
        : []
      ).map(String)
    );

    const tr = data.rows.filter((r) => {
      const rowKey = getEvaluationRowKey(r);
      if (deferred.has(rowKey)) return false;
      const placement = placementPreviewConfirmedMap[rowKey];
      const y = placement?.yearId ?? r.year_level_id;
      const s = placement?.semId ?? r.semester_id;
      return (
        String(y) === String(evalFilterYearId) &&
        String(s) === String(evalFilterSemesterId)
      );
    });

    const actionable = tr.filter((r) => {
      const merged = mergedRowsByKey.get(getEvaluationRowKey(r)) || r;
      return !isEvalRowUntakenBlank(merged);
    });

    // Need at least one recorded subject this standing; blanks are optional later.
    if (actionable.length === 0) return false;
    return actionable.every((r) => {
      const merged = mergedRowsByKey.get(getEvaluationRowKey(r)) || r;
      return isEvalRowCompleteFromServerRow(merged);
    });
  }, [
    data?.rows,
    data?.student?.standing_deferred_keys,
    evalFilterYearId,
    evalFilterSemesterId,
    placementPreviewConfirmedMap,
    mergedRowsByKey,
  ]);

  const nextPromotionTerm = useMemo(() => {
    const terms = orderedCurriculumTerms;
    if (!terms.length || !evalFilterYearId || !evalFilterSemesterId) return null;
    const curIdx = terms.findIndex(
      (t) => t.year_level_id === String(evalFilterYearId) && t.semester_id === String(evalFilterSemesterId)
    );
    if (curIdx < 0 || curIdx >= terms.length - 1) return null;
    return terms[curIdx + 1];
  }, [orderedCurriculumTerms, evalFilterYearId, evalFilterSemesterId]);

  const canOpenPromoteModal =
    Boolean(nextPromotionTerm) &&
    (systemGuideOpen || currentTermCompleteForPromotion);

  const studentAcademicStatus = useMemo(() => {
    return String(
      data?.computed_academic_status || data?.student?.academic_status || ''
    ).trim();
  }, [data?.computed_academic_status, data?.student?.academic_status]);

  const isRegularStudent = useMemo(
    () => isRegularAcademicStatus(studentAcademicStatus),
    [studentAcademicStatus]
  );

  const isIrregularStudent = useMemo(
    () => isIrregularAcademicStatus(studentAcademicStatus),
    [studentAcademicStatus]
  );

  /** Dean / PH / Admin may set Year + Semester standing (promote or demote) for Irregular only. */
  const canAlterIrregularStanding = !!(
    (isAdmin || isDean || isProgramHead) &&
    isIrregularStudent &&
    canEditEvaluationRows &&
    !isEvaluatedModule
  );

  const yearsAllowedForFilter = useMemo(() => {
    const base = evaluationFilterOptions.years;
    if (!extendedYearIds.length) return base;
    const next = [...base];
    extendedYearIds.forEach((yid) => {
      if (next.some((y) => String(y.id) === String(yid))) return;
      next.push({ id: String(yid), label: extendedYearDisplayLabel(yid, curriculumMaxYearId) });
    });
    return next.sort((a, b) => Number(a.id) - Number(b.id));
  }, [evaluationFilterOptions.years, extendedYearIds, curriculumMaxYearId]);

  const unitsBasedYearStanding = useMemo(
    () => yearStandingFromEarnedUnits(data?.summary?.total_units_earned),
    [data?.summary?.total_units_earned]
  );

  /** Standing school year = curriculum Effective SY (fixed; not advanced by year level). */
  const standingSchoolYearLabel = useMemo(() => {
    return (
      schoolYearLabelForStanding(
        data?.curriculum?.effective_year ?? data?.curriculum?.label
      ) ||
      data?.curriculum?.label ||
      data?.student?.academic_year_name ||
      null
    );
  }, [
    data?.curriculum?.effective_year,
    data?.curriculum?.label,
    data?.student?.academic_year_name,
  ]);

  const unitsBasedYearId = useMemo(() => {
    const years = yearsAllowedForFilter.length
      ? yearsAllowedForFilter
      : evaluationFilterOptions.years;
    return resolveYearOptionIdForStanding(years, unitsBasedYearStanding, parseYearNumberFromLabel);
  }, [
    yearsAllowedForFilter,
    evaluationFilterOptions.years,
    unitsBasedYearStanding,
    parseYearNumberFromLabel,
  ]);

  const majorStandingOverrideKeys = useMemo(() => {
    const list = Array.isArray(data?.student?.major_standing_override_keys)
      ? data.student.major_standing_override_keys
      : [];
    return new Set(list.map(String));
  }, [data?.student?.major_standing_override_keys]);

  const grantMajorStandingOverride = useCallback(
    async (row, { enabled, acknowledgeUnitsShort = false } = {}) => {
      const studentId = data?.student?.student_id;
      const rowKey = getEvaluationRowKey(row);
      if (!canGrantMajorStandingOverride || !studentId || !rowKey) return false;

      try {
        const res = await api.post('/evaluation/student/major-standing-override', {
          student_id: Number(studentId),
          row_key: rowKey,
          enabled: !!enabled,
          acknowledge_units_short: !!acknowledgeUnitsShort,
        });
        const nextStudent = res.data?.student;
        if (nextStudent) {
          setData((prev) =>
            prev ? { ...prev, student: { ...prev.student, ...nextStudent } } : prev
          );
          setBaselineData((prev) =>
            prev ? { ...prev, student: { ...prev.student, ...nextStudent } } : prev
          );
        }
        swalToast(
          'success',
          enabled
            ? 'Major subject unlocked for this student (dean prerogative).'
            : 'Override cleared — subject locked again.'
        );
        return true;
      } catch (err) {
        const payload = err.response?.data || {};
        if (enabled && payload.requires_units_ack) {
          const earned = payload.earned_units ?? data?.summary?.total_units_earned ?? 0;
          const ok = await swalConfirm(
            'Units short for year standing',
            `Earned units (${earned}) are below the usual threshold for this subject’s year level, but lower-year majors are OK.\n\nAllow this major subject anyway?`,
            'Allow subject',
            'Cancel'
          );
          if (!ok) return false;
          return grantMajorStandingOverride(row, {
            enabled: true,
            acknowledgeUnitsShort: true,
          });
        }
        await swalError(
          'Could not update override',
          payload.message || err.message || 'Request failed'
        );
        return false;
      }
    },
    [
      canGrantMajorStandingOverride,
      data?.student?.student_id,
      data?.summary?.total_units_earned,
    ]
  );

  const yearOrdinalForStandingId = useCallback(
    (yearId) => {
      if (yearId == null || yearId === '') return 0;
      const years = yearsAllowedForFilter.length
        ? yearsAllowedForFilter
        : evaluationFilterOptions.years;
      const opt = years.find((y) => String(y.id) === String(yearId));
      return (
        parseYearNumberFromLabel(opt?.label, yearId) ||
        Number(yearId) ||
        0
      );
    },
    [
      yearsAllowedForFilter,
      evaluationFilterOptions.years,
      parseYearNumberFromLabel,
    ]
  );

  const findCurriculumTerm = useCallback(
    (yearId, semId) => {
      if (yearId == null || yearId === '' || semId == null || semId === '') return null;
      return (
        orderedCurriculumTerms.find(
          (t) =>
            String(t.year_level_id) === String(yearId) &&
            String(t.semester_id) === String(semId)
        ) || null
      );
    },
    [orderedCurriculumTerms]
  );

  /**
   * Current standing term for filters / Current subjects / school-year label.
   * After Promote, use the promotion target (e.g. 2nd Yr 1st Sem) even when
   * earned units still say 1st year. Otherwise profile standing, else units + Lookup.
   */
  const activeSemesterStandingTerm = useMemo(() => {
    if (!orderedCurriculumTerms.length) return null;

    const ty = data?.student?.promotion_target_year_level_id;
    const ts = data?.student?.promotion_target_semester_id;
    if (
      data?.student?.promoted_next_sem_at &&
      ty != null &&
      ty !== '' &&
      ts != null &&
      ts !== ''
    ) {
      const promotedTerm = findCurriculumTerm(ty, ts);
      if (promotedTerm) return promotedTerm;
    }

    // Profile year/sem after promote (may be ahead of units-based year).
    // Irregular: Dean/PH may also demote — always honor stored profile standing.
    const py = data?.student?.year_level_id;
    const ps =
      data?.student?.semester_id != null && data.student.semester_id !== ''
        ? data.student.semester_id
        : null;
    if (py != null && py !== '' && ps != null) {
      const profileTerm = findCurriculumTerm(py, ps);
      if (profileTerm && isIrregularStudent) {
        return profileTerm;
      }
      const profileOrd = yearOrdinalForStandingId(py);
      const unitsOrd = yearOrdinalForStandingId(unitsBasedYearId);
      // Honor profile ahead of units (e.g. promote before units catch up), but never
      // treat extended-study years (5th+) as standing for Regular — those are
      // planning containers only and must not override units-based Year Level.
      const profileBeyondCurriculum =
        Number.isFinite(profileOrd) && profileOrd > curriculumMaxYearId;
      if (profileTerm && profileOrd >= unitsOrd && !profileBeyondCurriculum) {
        return profileTerm;
      }
    }

    if (!unitsBasedYearId) return null;
    const activeSemId = data?.active_semester?.semester_id;
    if (activeSemId != null && activeSemId !== '') {
      const activeTerm = findCurriculumTerm(unitsBasedYearId, activeSemId);
      if (activeTerm) return activeTerm;
    }
    return (
      orderedCurriculumTerms.find(
        (t) => String(t.year_level_id) === String(unitsBasedYearId)
      ) || null
    );
  }, [
    orderedCurriculumTerms,
    data?.student?.promoted_next_sem_at,
    data?.student?.promotion_target_year_level_id,
    data?.student?.promotion_target_semester_id,
    data?.student?.year_level_id,
    data?.student?.semester_id,
    unitsBasedYearId,
    data?.active_semester?.semester_id,
    findCurriculumTerm,
    yearOrdinalForStandingId,
    isIrregularStudent,
    curriculumMaxYearId,
  ]);

  /** Highest year the student is considered standing in (filter / profile / promotion). */
  const enrollmentYearStandingOrd = useMemo(() => {
    const candidates = [];
    if (evalFilterYearId) {
      const n = parseYearNumberFromLabel(
        evaluationFilterOptions.years.find((y) => String(y.id) === String(evalFilterYearId))
          ?.label,
        evalFilterYearId
      );
      if (Number.isFinite(n)) candidates.push(n);
    }
    if (activeSemesterStandingTerm?.year_level_id != null) {
      const n = yearOrdinalForStandingId(activeSemesterStandingTerm.year_level_id);
      if (Number.isFinite(n)) candidates.push(n);
    }
    if (data?.student?.year_level_id != null && data.student.year_level_id !== '') {
      const n = yearOrdinalForStandingId(data.student.year_level_id);
      if (Number.isFinite(n)) candidates.push(n);
    }
    if (
      data?.student?.promotion_target_year_level_id != null &&
      data.student.promotion_target_year_level_id !== ''
    ) {
      const n = yearOrdinalForStandingId(data.student.promotion_target_year_level_id);
      if (Number.isFinite(n)) candidates.push(n);
    }
    return candidates.length ? Math.max(...candidates) : null;
  }, [
    evalFilterYearId,
    evaluationFilterOptions.years,
    parseYearNumberFromLabel,
    activeSemesterStandingTerm?.year_level_id,
    yearOrdinalForStandingId,
    data?.student?.year_level_id,
    data?.student?.promotion_target_year_level_id,
  ]);

  const rowPrereqsMetWithOverride = useCallback(
    (allRows, targetRow) => {
      const key = getEvaluationRowKey(targetRow);
      if (key && majorStandingOverrideKeys.has(String(key))) return true;
      return evalRowPrerequisitesMet(allRows, targetRow, enrollmentYearStandingOrd);
    },
    [majorStandingOverrideKeys, enrollmentYearStandingOrd]
  );

  const semesterOptionsForYear = useMemo(() => {
    if (!evalFilterYearId) return [];
    const m = new Map();
    (data?.rows || [])
      .filter((r) => String(r.year_level_id) === String(evalFilterYearId))
      .forEach((r) => {
        if (r.semester_id == null || r.semester_id === '') return;
        const label = r.semester_name || `Semester ${r.semester_id}`;
        m.set(String(r.semester_id), { id: String(r.semester_id), label });
      });
    // Extended years have no curriculum rows — pull terms from standing map.
    if (
      m.size === 0 &&
      extendedYearIds.some((y) => String(y) === String(evalFilterYearId))
    ) {
      orderedCurriculumTerms
        .filter((t) => String(t.year_level_id) === String(evalFilterYearId))
        .forEach((t) => {
          m.set(String(t.semester_id), {
            id: String(t.semester_id),
            label: t.semester_name || `Semester ${t.semester_id}`,
          });
        });
    }
    return [...m.values()].sort(
      (a, b) => semesterSortValue(a.id, a.label) - semesterSortValue(b.id, b.label)
    );
  }, [data, evalFilterYearId, orderedCurriculumTerms, extendedYearIds]);

  const applyIrregularStandingChange = useCallback(
    async (nextYearId, nextSemId) => {
      if (!canAlterIrregularStanding || standingSaving) return;
      const yearId = String(nextYearId || '');
      let semId = String(nextSemId || '');
      if (!yearId) return;

      const years = yearsAllowedForFilter.length
        ? yearsAllowedForFilter
        : evaluationFilterOptions.years;

      if (!semId) {
        const firstSem = orderedCurriculumTerms.find(
          (t) => String(t.year_level_id) === yearId
        );
        semId = firstSem ? String(firstSem.semester_id) : '';
      }
      if (!semId) return;

      if (
        String(evalFilterYearId) === yearId &&
        String(evalFilterSemesterId) === semId
      ) {
        return;
      }

      const fromYear =
        years.find((y) => String(y.id) === String(evalFilterYearId))?.label || '—';
      const fromSem =
        semesterOptionsForYear.find((s) => String(s.id) === String(evalFilterSemesterId))
          ?.label ||
        orderedCurriculumTerms.find(
          (t) =>
            String(t.year_level_id) === String(evalFilterYearId) &&
            String(t.semester_id) === String(evalFilterSemesterId)
        )?.semester_name ||
        '—';
      const toYear = years.find((y) => String(y.id) === yearId)?.label || yearId;
      const toSem =
        orderedCurriculumTerms.find(
          (t) =>
            String(t.year_level_id) === yearId && String(t.semester_id) === semId
        )?.semester_name || `Semester ${semId}`;

      const fromIdx = orderedCurriculumTerms.findIndex(
        (t) =>
          String(t.year_level_id) === String(evalFilterYearId) &&
          String(t.semester_id) === String(evalFilterSemesterId)
      );
      const toIdx = orderedCurriculumTerms.findIndex(
        (t) => String(t.year_level_id) === yearId && String(t.semester_id) === semId
      );
      const action =
        fromIdx >= 0 && toIdx >= 0
          ? toIdx < fromIdx
            ? 'demote'
            : toIdx > fromIdx
              ? 'promote'
              : 'set'
          : 'set';

      const ok = await swalConfirm(
        action === 'demote'
          ? 'Demote irregular student?'
          : action === 'promote'
            ? 'Promote irregular student?'
            : 'Change standing?',
        `Change standing from ${fromYear} — ${fromSem} to ${toYear} — ${toSem}?\n\nOnly Irregular students can be moved this way by Dean / Program Head.`,
        action === 'demote' ? 'Demote' : action === 'promote' ? 'Promote' : 'Apply',
        'Cancel'
      );
      if (!ok) return;

      const prevYear = evalFilterYearId;
      const prevSem = evalFilterSemesterId;
      setEvalFilterYearId(yearId);
      setEvalFilterSemesterId(semId);
      const saved = await persistStudentStanding({
        yearId,
        semesterId: semId,
        toastOnSuccess: true,
      });
      if (!saved) {
        setEvalFilterYearId(prevYear);
        setEvalFilterSemesterId(prevSem);
      }
    },
    [
      canAlterIrregularStanding,
      standingSaving,
      yearsAllowedForFilter,
      evaluationFilterOptions.years,
      orderedCurriculumTerms,
      evalFilterYearId,
      evalFilterSemesterId,
      semesterOptionsForYear,
      persistStudentStanding,
    ]
  );

  const currentStandingSubjects = useMemo(() => {
    if (!data?.rows?.length || !evalFilterYearId || !evalFilterSemesterId) return [];

    const termIndexOf = (yearId, semId) =>
      orderedCurriculumTerms.findIndex(
        (t) =>
          String(t.year_level_id) === String(yearId) &&
          String(t.semester_id) === String(semId)
      );

    const standingIdx = termIndexOf(evalFilterYearId, evalFilterSemesterId);
    const standingYearLabel =
      (yearsAllowedForFilter.length ? yearsAllowedForFilter : evaluationFilterOptions.years).find(
        (y) => String(y.id) === String(evalFilterYearId)
      )?.label || '';
    const standingYearOrd = parseYearNumberFromLabel(standingYearLabel, evalFilterYearId);
    const standingKeyFallback = evalTermSortKey(
      evalFilterYearId,
      evalFilterSemesterId,
      semesterOptionsForYear.find((s) => s.id === evalFilterSemesterId)?.label || ''
    );

    const studentTrackId =
      data?.student?.track_id != null && data.student.track_id !== ''
        ? String(data.student.track_id)
        : '';
    const offeredIdsThisStanding = new Set();
    (Array.isArray(data?.offered_subjects) ? data.offered_subjects : []).forEach((o) => {
      if (String(o?.status || 'active').toLowerCase() !== 'active') return;
      if (o.semester_id != null && String(o.semester_id) !== String(evalFilterSemesterId)) return;
      if (
        o.track_id != null &&
        o.track_id !== '' &&
        studentTrackId &&
        String(o.track_id) !== studentTrackId
      ) {
        return;
      }
      if (o.subject_id != null && o.subject_id !== '') {
        offeredIdsThisStanding.add(String(o.subject_id));
      }
    });

    return data.rows
      .map((r) => mergedRowsByKey.get(getEvaluationRowKey(r)) || r)
      .map((r) => {
        if (r?.previous_program_only === true) return null;
        if (r?.from_previous_program === true) return null;
        if (isTransferCreditRowForTermGate(r)) return null;
        if (isEvalRowAlreadyTaken(r)) return null;

        const rowYearOrd = parseYearNumberFromLabel(r.year_level_name, r.year_level_id);
        const idx = termIndexOf(r.year_level_id, r.semester_id);
        const isLaterTerm =
          (standingYearOrd != null && rowYearOrd != null && rowYearOrd > standingYearOrd) ||
          (standingIdx >= 0
            ? idx > standingIdx
            : evalTermSortKey(r.year_level_id, r.semester_id, r.semester_name) >
              standingKeyFallback);

        if (standingIdx >= 0 && idx < 0) return null;

        // Later terms only when listed in Offered subjects for this standing semester.
        if (isLaterTerm) {
          const sid = r?.subject_id;
          if (sid == null || sid === '' || !offeredIdsThisStanding.has(String(sid))) return null;
          return { ...r, advance_offered: true };
        }

        // Current-standing rows with unmet prereqs stay in the pool (shown as Blocked).
        return r;
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aCur =
          String(a.year_level_id) === String(evalFilterYearId) &&
          String(a.semester_id) === String(evalFilterSemesterId);
        const bCur =
          String(b.year_level_id) === String(evalFilterYearId) &&
          String(b.semester_id) === String(evalFilterSemesterId);
        // This standing first, then untaken / prior terms.
        if (aCur !== bCur) return aCur ? -1 : 1;
        const ia = termIndexOf(a.year_level_id, a.semester_id);
        const ib = termIndexOf(b.year_level_id, b.semester_id);
        if (ia >= 0 && ib >= 0 && ia !== ib) return ia - ib;
        const ka = evalTermSortKey(a.year_level_id, a.semester_id, a.semester_name);
        const kb = evalTermSortKey(b.year_level_id, b.semester_id, b.semester_name);
        if (ka !== kb) return ka - kb;
        return String(a.subject_code || '').localeCompare(String(b.subject_code || ''));
      });
  }, [
    data?.rows,
    data?.offered_subjects,
    data?.student?.track_id,
    evalFilterYearId,
    evalFilterSemesterId,
    mergedRowsByKey,
    semesterOptionsForYear,
    orderedCurriculumTerms,
    yearsAllowedForFilter,
    evaluationFilterOptions.years,
    parseYearNumberFromLabel,
    mergedRowsForPrereq,
  ]);

  useEffect(() => {
    const termLoad = data?.student?.standing_term_load;
    const savedDeferred = Array.isArray(data?.student?.standing_deferred_keys)
      ? data.student.standing_deferred_keys.map(String)
      : [];

    // Hydrate OFFSEM / Semestral flags from server term load when present.
    if (termLoad && typeof termLoad === 'object' && termLoad.prior_flags) {
      const flags = termLoad.prior_flags;
      if (flags && typeof flags === 'object' && !Array.isArray(flags)) {
        setOffSemesterTakeMap(flags);
        if (offSemesterStorageKey) {
          try {
            window.localStorage.setItem(offSemesterStorageKey, JSON.stringify(flags));
          } catch {
            // ignore
          }
        }
      }
    }

    // Irregular first visit (no saved term load): current standing checked,
    // prior backlog unchecked so they pick what to take.
    if (
      !termLoad &&
      isIrregularStudent &&
      currentStandingSubjects.length > 0 &&
      evalFilterYearId &&
      evalFilterSemesterId
    ) {
      const deferred = new Set();
      currentStandingSubjects.forEach((row) => {
        const key = getEvaluationRowKey(row);
        const isCurrent =
          String(row.year_level_id) === String(evalFilterYearId) &&
          String(row.semester_id) === String(evalFilterSemesterId);
        if (!isCurrent) deferred.add(key);
        if (standingLoadBlockedByPrereq(row, mergedRowsForPrereq, majorStandingOverrideKeys, enrollmentYearStandingOrd)) {
          deferred.add(key);
        }
      });
      setStandingLoadDeferred(deferred);
      setStandingLoadDirty(false);
      return;
    }

    // Always force-drop ineligible rows so take counts stay correct even when
    // saved deferred_keys is empty / stale.
    const deferred = new Set(savedDeferred);
    const savedTakeKeys = new Set(
      Array.isArray(termLoad?.take_keys) ? termLoad.take_keys.map(String) : []
    );
    currentStandingSubjects.forEach((row) => {
      const key = getEvaluationRowKey(row);
      if (row.advance_offered && !savedTakeKeys.has(String(key))) {
        deferred.add(key);
        return;
      }
      if (
        standingLoadBlockedByPrereq(
          row,
          mergedRowsForPrereq,
          majorStandingOverrideKeys,
          enrollmentYearStandingOrd
        )
      ) {
        deferred.add(key);
        return;
      }
      const isCurrent =
        String(row.year_level_id) === String(evalFilterYearId) &&
        String(row.semester_id) === String(evalFilterSemesterId);
      if (!isCurrent) {
        // Prior/backlog: drop unless offered (OFFSEM) or same-semester (Semestral).
        // priorStandingTakeGate is declared below — use the shared gate helper here.
        const sid = row?.subject_id;
        const offered =
          sid != null &&
          sid !== '' &&
          (Array.isArray(data?.offered_subjects) ? data.offered_subjects : []).some((o) => {
            if (String(o?.status || 'active').toLowerCase() !== 'active') return false;
            if (String(o.subject_id) !== String(sid)) return false;
            const standingSem = String(evalFilterSemesterId || '');
            if (
              standingSem &&
              o.semester_id != null &&
              String(o.semester_id) !== standingSem
            ) {
              return false;
            }
            return true;
          });
        const gate = standingPriorTakeGate(row, evalFilterSemesterId, offered);
        if (!gate.ok) deferred.add(key);
      }
    });
    setStandingLoadDeferred(deferred);
    setStandingLoadDirty(false);
  }, [
    data?.student?.student_id,
    JSON.stringify(data?.student?.standing_deferred_keys || []),
    JSON.stringify(data?.student?.standing_term_load || null),
    data?.offered_subjects,
    isIrregularStudent,
    currentStandingSubjects,
    evalFilterYearId,
    evalFilterSemesterId,
    mergedRowsForPrereq,
    majorStandingOverrideKeys,
    enrollmentYearStandingOrd,
    offSemesterStorageKey,
  ]);

  /** Subject IDs actively offered for this standing semester (Lookup → Offered subjects). */
  const offeredSubjectIdsForStanding = useMemo(() => {
    const list = Array.isArray(data?.offered_subjects) ? data.offered_subjects : [];
    const standingSem = String(
      evalFilterSemesterId || data?.active_semester?.semester_id || ''
    );
    const trackId =
      data?.student?.track_id != null && data.student.track_id !== ''
        ? String(data.student.track_id)
        : '';
    const ids = new Set();
    list.forEach((o) => {
      if (String(o?.status || 'active').toLowerCase() !== 'active') return;
      if (standingSem && o.semester_id != null && String(o.semester_id) !== standingSem) {
        return;
      }
      if (
        o.track_id != null &&
        o.track_id !== '' &&
        trackId &&
        String(o.track_id) !== trackId
      ) {
        return;
      }
      if (o.subject_id != null && o.subject_id !== '') {
        ids.add(String(o.subject_id));
      }
    });
    return ids;
  }, [
    data?.offered_subjects,
    data?.active_semester?.semester_id,
    data?.student?.track_id,
    evalFilterSemesterId,
  ]);

  const isSubjectOfferedForStanding = useCallback(
    (row) => {
      const sid = row?.subject_id;
      if (sid == null || sid === '') return false;
      return offeredSubjectIdsForStanding.has(String(sid));
    },
    [offeredSubjectIdsForStanding]
  );

  /**
   * Facebook-style badge on Subject placement: count rows that show the OFFERED tag
   * in the standing panel (same source as the green tags).
   */
  const subjectPlacementNotifyCount = useMemo(() => {
    if (!currentStandingSubjects.length || offeredSubjectIdsForStanding.size === 0) return 0;
    const seen = new Set();
    let count = 0;
    for (const row of currentStandingSubjects) {
      if (!isSubjectOfferedForStanding(row)) continue;
      const sid = row?.subject_id;
      if (sid == null || sid === '') continue;
      const dedupe = String(sid);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      count += 1;
    }
    return count;
  }, [currentStandingSubjects, offeredSubjectIdsForStanding, isSubjectOfferedForStanding]);

  const priorStandingTakeGate = useCallback(
    (row) =>
      standingPriorTakeGate(
        row,
        evalFilterSemesterId,
        isSubjectOfferedForStanding(row)
      ),
    [evalFilterSemesterId, isSubjectOfferedForStanding]
  );

  const isSubjectOfferedForSemester = useCallback(
    (row, semesterId) => {
      const sid = row?.subject_id;
      if (sid == null || sid === '') return false;
      const list = Array.isArray(data?.offered_subjects) ? data.offered_subjects : [];
      const standingSem = String(semesterId || '');
      const trackId =
        data?.student?.track_id != null && data.student.track_id !== ''
          ? String(data.student.track_id)
          : '';
      return list.some((o) => {
        if (String(o?.status || 'active').toLowerCase() !== 'active') return false;
        if (String(o.subject_id) !== String(sid)) return false;
        if (standingSem && o.semester_id != null && String(o.semester_id) !== standingSem) {
          return false;
        }
        if (
          o.track_id != null &&
          o.track_id !== '' &&
          trackId &&
          String(o.track_id) !== trackId
        ) {
          return false;
        }
        return true;
      });
    },
    [data?.offered_subjects, data?.student?.track_id]
  );

  /** Curriculum term immediately after the student's current standing. */
  const nextStandingTerm = useMemo(() => {
    if (!orderedCurriculumTerms.length || !evalFilterYearId || !evalFilterSemesterId) {
      return null;
    }
    const curIdx = orderedCurriculumTerms.findIndex(
      (t) =>
        String(t.year_level_id) === String(evalFilterYearId) &&
        String(t.semester_id) === String(evalFilterSemesterId)
    );
    if (curIdx < 0 || curIdx >= orderedCurriculumTerms.length - 1) return null;
    return orderedCurriculumTerms[curIdx + 1];
  }, [orderedCurriculumTerms, evalFilterYearId, evalFilterSemesterId]);

  const nextStandingTermLabel = useMemo(() => {
    if (!nextStandingTerm) return '';
    const years = yearsAllowedForFilter.length
      ? yearsAllowedForFilter
      : evaluationFilterOptions.years;
    const yearLabel =
      years.find((y) => String(y.id) === String(nextStandingTerm.year_level_id))?.label ||
      nextStandingTerm.year_level_name ||
      `Year ${nextStandingTerm.year_level_id}`;
    const semLabel = nextStandingTerm.semester_name || `Semester ${nextStandingTerm.semester_id}`;
    const schoolYear =
      schoolYearLabelForStanding(
        data?.curriculum?.effective_year ?? data?.curriculum?.label
      ) || data?.curriculum?.label;
    return [schoolYear, yearLabel, semLabel].filter(Boolean).join(' — ');
  }, [
    nextStandingTerm,
    yearsAllowedForFilter,
    evaluationFilterOptions.years,
    parseYearNumberFromLabel,
    data?.curriculum?.effective_year,
    data?.curriculum?.label,
  ]);

  const nextStandingTermIndex = useMemo(() => {
    if (!nextStandingTerm || !orderedCurriculumTerms.length) return -1;
    return orderedCurriculumTerms.findIndex(
      (t) =>
        String(t.year_level_id) === String(nextStandingTerm.year_level_id) &&
        String(t.semester_id) === String(nextStandingTerm.semester_id)
    );
  }, [nextStandingTerm, orderedCurriculumTerms]);

  const nextSemTermIndexOf = useCallback(
    (yearId, semId) =>
      orderedCurriculumTerms.findIndex(
        (t) => String(t.year_level_id) === String(yearId) && String(t.semester_id) === String(semId)
      ),
    [orderedCurriculumTerms]
  );

  /**
   * Remaining subjects for next-sem mapping: blank untaken (+ failed/incomplete retakes).
   * Already graded/passed subjects never appear. Current standing TAKE subjects excluded.
   */
  const nextSemMappingSubjects = useMemo(() => {
    if (!data?.rows?.length) return [];

    return data.rows
      .map((r) => {
        // Prefer live draft merge so unsaved grades/pass marks are respected.
        return mergeEvalRowWithDrafts(r, drafts, getEvaluationRowKey);
      })
      .filter((r) => {
        if (r?.previous_program_only === true) return false;
        if (r?.from_previous_program === true) return false;
        if (!isEvalRowAvailableInNextSemMap(r)) return false;
        const key = getEvaluationRowKey(r);
        // Already in this standing's TAKE plan — not remaining to map.
        if (nextSemCurrentTakeKeys.has(key)) return false;
        // OFFSEM this standing = already planned for current load.
        if (offSemesterTakeMap[key]) return false;
        return true;
      })
      .sort((a, b) => {
        const ia = nextSemTermIndexOf(a.year_level_id, a.semester_id);
        const ib = nextSemTermIndexOf(b.year_level_id, b.semester_id);
        if (ia !== ib) return ia - ib;
        return String(a.subject_code || '').localeCompare(String(b.subject_code || ''));
      });
  }, [
    data?.rows,
    nextSemTermIndexOf,
    nextSemCurrentTakeKeys,
    drafts,
    offSemesterTakeMap,
  ]);

  /** Earlier untaken than the next standing — clear these first to proceed cleanly. */
  const nextSemPriorityBacklog = useMemo(() => {
    if (nextStandingTermIndex < 0) return [];
    return nextSemMappingSubjects.filter((row) => {
      const idx = nextSemTermIndexOf(row.year_level_id, row.semester_id);
      return idx >= 0 && idx < nextStandingTermIndex;
    });
  }, [nextSemMappingSubjects, nextStandingTermIndex, nextSemTermIndexOf]);

  /** Subjects whose curriculum home is the next standing term. */
  const nextSemTargetTermSubjects = useMemo(() => {
    if (!nextStandingTerm) return [];
    return nextSemMappingSubjects.filter(
      (row) =>
        String(row.year_level_id) === String(nextStandingTerm.year_level_id) &&
        String(row.semester_id) === String(nextStandingTerm.semester_id)
    );
  }, [nextSemMappingSubjects, nextStandingTerm]);

  const nextSemCurrentTakeCodes = useMemo(() => {
    const codes = new Set();
    nextSemCurrentTakeKeys.forEach((key) => {
      const row = (data?.rows || []).find((r) => getEvaluationRowKey(r) === key);
      const code = normalizeEvalSubjectCode(row?.subject_code);
      if (code) codes.add(code);
    });
    return codes;
  }, [nextSemCurrentTakeKeys, data?.rows]);

  const isNextSemMapRowEligible = useCallback(
    (row) => {
      const key = getEvaluationRowKey(row);
      if (key && majorStandingOverrideKeys.has(String(key))) return true;
      const preCodes = Array.isArray(row?.prerequisite_subject_codes)
        ? row.prerequisite_subject_codes
        : [];
      for (const code of preCodes) {
        const preRow = findEvalRowBySubjectCode(mergedRowsForPrereq, code);
        if (!preRow) continue;
        if (evalPrerequisiteRowPassed(preRow)) continue;
        if (nextSemCurrentTakeCodes.has(normalizeEvalSubjectCode(code))) continue;
        return false;
      }
      const preSlots = Array.isArray(row?.prerequisite_elective_slots)
        ? row.prerequisite_elective_slots
        : [];
      for (const req of preSlots) {
        const preRow = findEvalRowByElectiveSlotId(
          mergedRowsForPrereq,
          req?.elective_slot_id
        );
        if (!preRow) continue;
        if (evalPrerequisiteRowPassed(preRow)) continue;
        if (nextSemCurrentTakeCodes.has(normalizeEvalSubjectCode(preRow.subject_code))) {
          continue;
        }
        return false;
      }
      return true;
    },
    [mergedRowsForPrereq, nextSemCurrentTakeCodes, majorStandingOverrideKeys]
  );

  const nextSemMapUnmetLabels = useCallback(
    (row) => {
      const preRules = Array.isArray(row?.prerequisite_rule_labels)
        ? row.prerequisite_rule_labels
        : [];
      const standingRuleLabels = [
        ...new Set(
          preRules
            .filter((label) => isStandingOrBulkPrerequisiteRule(label))
            .map((label) => formatEvalRequisiteRuleLabel(label))
            .filter(Boolean)
        ),
      ];

      const labels = [];
      const seen = new Set();
      const preCodes = Array.isArray(row?.prerequisite_subject_codes)
        ? row.prerequisite_subject_codes
        : [];
      for (const code of preCodes) {
        const normalized = normalizeEvalSubjectCode(code);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        const preRow = findEvalRowBySubjectCode(mergedRowsForPrereq, code);
        if (!preRow) continue;
        if (evalPrerequisiteRowPassed(preRow)) continue;
        if (nextSemCurrentTakeCodes.has(normalized)) continue;
        labels.push(String(code).trim() || normalized);
      }
      const preSlots = Array.isArray(row?.prerequisite_elective_slots)
        ? row.prerequisite_elective_slots
        : [];
      for (const req of preSlots) {
        const preRow = findEvalRowByElectiveSlotId(
          mergedRowsForPrereq,
          req?.elective_slot_id
        );
        if (!preRow) continue;
        if (evalPrerequisiteRowPassed(preRow)) continue;
        if (nextSemCurrentTakeCodes.has(normalizeEvalSubjectCode(preRow.subject_code))) {
          continue;
        }
        labels.push(
          (req?.slot_name && String(req.slot_name).trim()) ||
            normalizeEvalSubjectCode(preRow.subject_code) ||
            preRow.elective_slot_name ||
            'elective'
        );
      }

      // Standing / bulk rules → show "4th year standing", not every expanded code.
      if (standingRuleLabels.length > 0 && labels.length > 0) {
        return standingRuleLabels;
      }
      if (labels.length > 8) {
        return ['prior year standing not met'];
      }
      return labels;
    },
    [mergedRowsForPrereq, nextSemCurrentTakeCodes]
  );

  /** priority | next | later — used for plan grouping in the next-sem map. */
  const getNextSemMapPlanKind = useCallback(
    (row) => {
      if (nextStandingTermIndex < 0) return 'next';
      const idx = nextSemTermIndexOf(row?.year_level_id, row?.semester_id);
      if (idx >= 0 && idx < nextStandingTermIndex) return 'priority';
      if (
        nextStandingTerm &&
        String(row?.year_level_id) === String(nextStandingTerm.year_level_id) &&
        String(row?.semester_id) === String(nextStandingTerm.semester_id)
      ) {
        return 'next';
      }
      if (idx > nextStandingTermIndex) return 'later';
      return 'next';
    },
    [nextStandingTermIndex, nextSemTermIndexOf, nextStandingTerm]
  );

  /** Dean-facing groups: backlog first → next standing → later (no nested year grids). */
  const nextSemMapPlanGroups = useMemo(() => {
    const buckets = { priority: [], next: [], later: [] };
    nextSemMappingSubjects.forEach((row) => {
      const kind = getNextSemMapPlanKind(row);
      if (kind === 'priority') buckets.priority.push(row);
      else if (kind === 'later') buckets.later.push(row);
      else buckets.next.push(row);
    });
    return [
      {
        id: 'priority',
        kind: 'priority',
        title: 'Clear first',
        subtitle: 'Earlier untaken / backlog',
        rows: buckets.priority,
      },
      {
        id: 'next',
        kind: 'next',
        title: 'Next standing',
        subtitle: nextStandingTermLabel || 'Target term',
        rows: buckets.next,
      },
      {
        id: 'later',
        kind: 'later',
        title: 'Later terms',
        subtitle: 'After next standing',
        rows: buckets.later,
      },
    ].filter((g) => g.rows.length > 0);
  }, [nextSemMappingSubjects, getNextSemMapPlanKind, nextStandingTermLabel]);

  const nextSemMapMeta = useMemo(() => {
    if (!nextStandingTerm) {
      return {
        units: 0,
        toTakeCount: 0,
        poolCount: 0,
        eligibleCount: 0,
        unitCap: null,
        backlogCount: 0,
        backlogEligibleCount: 0,
        targetEligibleCount: 0,
        blockedCount: 0,
      };
    }
    const eligible = nextSemMappingSubjects.filter((row) => isNextSemMapRowEligible(row));
    const backlogEligible = nextSemPriorityBacklog.filter((row) =>
      isNextSemMapRowEligible(row)
    );
    const targetEligible = nextSemTargetTermSubjects.filter((row) =>
      isNextSemMapRowEligible(row)
    );
    const selected = nextSemMappingSubjects.filter((row) =>
      nextSemSelectedKeys.has(getEvaluationRowKey(row))
    );
    const units = selected.reduce((sum, row) => sum + (Number(row.units) || 0), 0);
    const yearNum = Number(nextStandingTerm.year_level_id);
    const unitCap =
      Number.isFinite(yearNum) && EVAL_YEAR_UNIT_CAPS[yearNum] != null
        ? EVAL_YEAR_UNIT_CAPS[yearNum]
        : null;
    return {
      units,
      toTakeCount: selected.length,
      poolCount: nextSemMappingSubjects.length,
      eligibleCount: eligible.length,
      unitCap,
      backlogCount: nextSemPriorityBacklog.length,
      backlogEligibleCount: backlogEligible.length,
      targetEligibleCount: targetEligible.length,
      blockedCount: nextSemMappingSubjects.length - eligible.length,
    };
  }, [
    nextStandingTerm,
    nextSemMappingSubjects,
    nextSemPriorityBacklog,
    nextSemTargetTermSubjects,
    nextSemSelectedKeys,
    isNextSemMapRowEligible,
  ]);

  useEffect(() => {
    if (!nextSemMapOpen || !nextSemMapNeedsInit || !nextStandingTerm) return;

    const nextY = String(nextStandingTerm.year_level_id);
    const nextS = String(nextStandingTerm.semester_id);
    const candidateKeys = new Set(
      nextSemMappingSubjects.map((r) => getEvaluationRowKey(r))
    );

    let selected = null;
    if (nextSemPlanStorageKey) {
      try {
        const raw = window.localStorage.getItem(nextSemPlanStorageKey);
        const parsed = raw ? JSON.parse(raw) : null;
        if (
          parsed &&
          String(parsed.nextYearId) === nextY &&
          String(parsed.nextSemId) === nextS &&
          Array.isArray(parsed.selectedKeys)
        ) {
          selected = parsed.selectedKeys
            .map(String)
            .filter((k) => {
              if (!candidateKeys.has(k)) return false;
              const row = nextSemMappingSubjects.find(
                (r) => getEvaluationRowKey(r) === k
              );
              return row ? isNextSemMapRowEligible(row) : false;
            });
        }
      } catch {
        // ignore
      }
    }

    if (!selected) {
      // Default: check eligible subjects up through the next semester only
      // (later-year untaken rows stay visible but unchecked).
      const nextIdx = orderedCurriculumTerms.findIndex(
        (t) =>
          String(t.year_level_id) === nextY && String(t.semester_id) === nextS
      );
      selected = nextSemMappingSubjects
        .filter((r) => {
          if (!isNextSemMapRowEligible(r)) return false;
          if (nextIdx < 0) return true;
          const idx = orderedCurriculumTerms.findIndex(
            (t) =>
              String(t.year_level_id) === String(r.year_level_id) &&
              String(t.semester_id) === String(r.semester_id)
          );
          return idx < 0 || idx <= nextIdx;
        })
        .map((r) => getEvaluationRowKey(r));
    }

    setNextSemSelectedKeys(new Set(selected));
    setNextSemMapNeedsInit(false);
  }, [
    nextSemMapOpen,
    nextSemMapNeedsInit,
    nextStandingTerm,
    nextSemMappingSubjects,
    nextSemPlanStorageKey,
    isNextSemMapRowEligible,
    orderedCurriculumTerms,
  ]);

  const toggleNextSemMapTake = useCallback((rowKey) => {
    const row = nextSemMappingSubjects.find((r) => getEvaluationRowKey(r) === rowKey);
    if (row && !isNextSemMapRowEligible(row)) return;
    setNextSemSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  }, [nextSemMappingSubjects, isNextSemMapRowEligible]);

  const persistNextSemMapPlan = useCallback(() => {
    if (!nextStandingTerm) {
      setNextSemMapOpen(false);
      return;
    }
    const yearNum = Number(nextStandingTerm.year_level_id);
    const unitCap =
      Number.isFinite(yearNum) && EVAL_YEAR_UNIT_CAPS[yearNum] != null
        ? EVAL_YEAR_UNIT_CAPS[yearNum]
        : null;
    if (unitCap != null && nextSemMapMeta.units > unitCap) {
      void swalError(
        'Over unit cap',
        `Next-sem plan is ${nextSemMapMeta.units} units — over the ${unitCap} unit cap. Uncheck subjects until the total is within the cap, then save again.`
      );
      return;
    }

    const payload = {
      standingYearId: String(evalFilterYearId),
      standingSemId: String(evalFilterSemesterId),
      nextYearId: String(nextStandingTerm.year_level_id),
      nextSemId: String(nextStandingTerm.semester_id),
      selectedKeys: [...nextSemSelectedKeys],
      savedAt: new Date().toISOString(),
    };
    if (nextSemPlanStorageKey) {
      try {
        window.localStorage.setItem(nextSemPlanStorageKey, JSON.stringify(payload));
      } catch {
        // ignore
      }
    }
    setNextSemMapOpen(false);
    swalToast('success', 'Next-semester subject map saved');
  }, [
    nextStandingTerm,
    nextSemMapMeta.units,
    evalFilterYearId,
    evalFilterSemesterId,
    nextSemSelectedKeys,
    nextSemPlanStorageKey,
  ]);

  const renderNextSemMapGroups = useCallback(
    (groups) => {
      if (!groups?.length) return null;
      return (
        <div className="eval-nsm">
          {groups.map((group) => {
            const eligibleUnits = group.rows
              .filter((r) => isNextSemMapRowEligible(r))
              .reduce((sum, r) => sum + (Number(r.units) || 0), 0);
            return (
              <section
                key={group.id}
                className={`eval-nsm__section eval-nsm__section--${group.kind}`}
              >
                <header className="eval-nsm__section-head">
                  <div>
                    <h4 className="eval-nsm__section-title">{group.title}</h4>
                    <p className="eval-nsm__section-sub">{group.subtitle}</p>
                  </div>
                  <span className="eval-nsm__section-meta">
                    {group.rows.length} subject{group.rows.length === 1 ? '' : 's'}
                    {eligibleUnits > 0 ? ` · ${eligibleUnits}u eligible` : ''}
                  </span>
                </header>
                <table className="eval-nsm__table">
                  <thead>
                    <tr>
                      <th scope="col">Code</th>
                      <th scope="col">Subject</th>
                      <th scope="col">Units</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => {
                      const rowKey = getEvaluationRowKey(row);
                      const code = row.subject_code || row.elective_slot_name || '—';
                      const title = row.subject_name || '—';
                      const eligible = isNextSemMapRowEligible(row);
                      const unmet = eligible ? [] : nextSemMapUnmetLabels(row);
                      const unmetAreStandingOnly =
                        unmet.length > 0 &&
                        unmet.every((label) =>
                          /year standing|prior subjects|prior year/i.test(label)
                        );
                      const home = [row.year_level_name, row.semester_name]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <tr
                          key={rowKey}
                          className={
                            eligible
                              ? undefined
                              : 'eval-nsm__row--blocked'
                          }
                        >
                          <td className="eval-nsm__code">{code}</td>
                          <td className="eval-nsm__subject">
                            <span className="eval-nsm__subject-name">{title}</span>
                            {home ? (
                              <span className="eval-nsm__subject-home">{home}</span>
                            ) : null}
                          </td>
                          <td className="eval-nsm__units">{row.units ?? '—'}</td>
                          <td className="eval-nsm__status">
                            {eligible ? (
                              <span className="eval-nsm__badge eval-nsm__badge--ok">
                                Eligible
                              </span>
                            ) : (
                              <span
                                className="eval-nsm__badge eval-nsm__badge--blocked"
                                title={
                                  unmet.length
                                    ? unmetAreStandingOnly
                                      ? `Requires ${unmet.join(', ')}`
                                      : `Needs: ${unmet.join(', ')}`
                                    : 'Not eligible'
                                }
                              >
                                {unmet.length
                                  ? unmetAreStandingOnly
                                    ? `Needs ${unmet[0]}${unmet.length > 1 ? '…' : ''}`
                                    : `Needs ${unmet[0]}${unmet.length > 1 ? '…' : ''}`
                                  : 'Blocked'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      );
    },
    [isNextSemMapRowEligible, nextSemMapUnmetLabels]
  );

  // Drop stale placements that pinned future-term subjects into an earlier standing.
  useEffect(() => {
    if (!orderedCurriculumTerms.length || !evalFilterYearId || !evalFilterSemesterId) return;
    const standingIdx = orderedCurriculumTerms.findIndex(
      (t) =>
        String(t.year_level_id) === String(evalFilterYearId) &&
        String(t.semester_id) === String(evalFilterSemesterId)
    );
    if (standingIdx < 0) return;

    const termIndexOf = (yearId, semId) =>
      orderedCurriculumTerms.findIndex(
        (t) =>
          String(t.year_level_id) === String(yearId) &&
          String(t.semester_id) === String(semId)
      );

    const scrub = (map) => {
      if (!map || typeof map !== 'object') return map;
      let changed = false;
      const next = { ...map };
      Object.keys(next).forEach((rowKey) => {
        const row = data?.rows?.find((r) => getEvaluationRowKey(r) === rowKey);
        if (!row) return;
        const homeIdx = termIndexOf(row.year_level_id, row.semester_id);
        if (homeIdx > standingIdx) {
          delete next[rowKey];
          changed = true;
        }
      });
      return changed ? next : map;
    };

    setPlacementPreviewMap((prev) => scrub(prev));
    setPlacementPreviewConfirmedMap((prev) => scrub(prev));
  }, [
    data?.rows,
    orderedCurriculumTerms,
    evalFilterYearId,
    evalFilterSemesterId,
  ]);

  const currentStandingMeta = useMemo(() => {
    const years = yearsAllowedForFilter.length
      ? yearsAllowedForFilter
      : evaluationFilterOptions.years;
    const yearLabel =
      years.find((y) => String(y.id) === String(evalFilterYearId))?.label || '—';
    const semLabel =
      semesterOptionsForYear.find((s) => String(s.id) === String(evalFilterSemesterId))
        ?.label || '—';
    const curriculumLabel = standingSchoolYearLabel || data?.curriculum?.label || null;
    const standingKey = evalTermSortKey(
      evalFilterYearId,
      evalFilterSemesterId,
      semLabel === '—' ? '' : semLabel
    );
    // Only count eligible TAKE rows — Not eligible / Not offered never count toward
    // take total or units (even if they are missing from standingLoadDeferred).
    const toTake = currentStandingSubjects.filter((row) => {
      const key = getEvaluationRowKey(row);
      if (standingLoadDeferred.has(key)) return false;
      if (
        standingLoadBlockedByPrereq(
          row,
          mergedRowsForPrereq,
          majorStandingOverrideKeys,
          enrollmentYearStandingOrd
        )
      ) {
        return false;
      }
      const isCurrent =
        String(row.year_level_id) === String(evalFilterYearId) &&
        String(row.semester_id) === String(evalFilterSemesterId);
      if (!isCurrent && !priorStandingTakeGate(row).ok) return false;
      return true;
    });
    const units = toTake.reduce((sum, row) => sum + (Number(row.units) || 0), 0);
    const yearNum = Number(evalFilterYearId);
    const unitCap =
      Number.isFinite(yearNum) && EVAL_YEAR_UNIT_CAPS[yearNum] != null
        ? EVAL_YEAR_UNIT_CAPS[yearNum]
        : null;
    return {
      yearLabel,
      semLabel,
      curriculumLabel,
      schoolYearLabel: curriculumLabel,
      effectiveCurriculumLabel: data?.curriculum?.label || null,
      units,
      toTakeCount: toTake.length,
      poolCount: currentStandingSubjects.length,
      unitCap,
      standingKey,
    };
  }, [
    yearsAllowedForFilter,
    evaluationFilterOptions.years,
    evalFilterYearId,
    semesterOptionsForYear,
    evalFilterSemesterId,
    standingSchoolYearLabel,
    data?.curriculum?.label,
    currentStandingSubjects,
    standingLoadDeferred,
    mergedRowsForPrereq,
    majorStandingOverrideKeys,
    enrollmentYearStandingOrd,
    priorStandingTakeGate,
  ]);

  const savedTermLoadSummary = useMemo(() => {
    const load = data?.student?.standing_term_load;
    if (!load || typeof load !== 'object') return null;
    const takeKeys = Array.isArray(load.take_keys) ? load.take_keys.map(String) : [];
    if (!takeKeys.length && !Array.isArray(load.deferred_keys)) return null;
    const codes = takeKeys
      .map((key) => {
        const row = (data?.rows || []).find((r) => getEvaluationRowKey(r) === key);
        return row?.subject_code || row?.elective_slot_name || null;
      })
      .filter(Boolean);
    const priorCount = load.prior_flags
      ? Object.keys(load.prior_flags).length
      : 0;
    return {
      takeCount: takeKeys.length,
      priorCount,
      codes,
      yearId: load.year_level_id != null ? String(load.year_level_id) : '',
      semId: load.semester_id != null ? String(load.semester_id) : '',
      savedAt: load.saved_at || null,
    };
  }, [data?.student?.standing_term_load, data?.rows]);

  // Auto-DROP subjects blocked by prereq, or prior subjects not offered / not same-semester.
  useEffect(() => {
    if (!currentStandingSubjects.length) return;
    setStandingLoadDeferred((prev) => {
      let changed = false;
      const next = new Set(prev);
      currentStandingSubjects.forEach((row) => {
        const key = getEvaluationRowKey(row);
        if (next.has(key)) return;
        if (standingLoadBlockedByPrereq(row, mergedRowsForPrereq, majorStandingOverrideKeys, enrollmentYearStandingOrd)) {
          next.add(key);
          changed = true;
          return;
        }
        const isCurrent =
          String(row.year_level_id) === String(evalFilterYearId) &&
          String(row.semester_id) === String(evalFilterSemesterId);
        if (!isCurrent && !priorStandingTakeGate(row).ok) {
          next.add(key);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [
    currentStandingSubjects,
    mergedRowsForPrereq,
    majorStandingOverrideKeys,
    enrollmentYearStandingOrd,
    evalFilterYearId,
    evalFilterSemesterId,
    priorStandingTakeGate,
  ]);

  const toggleStandingLoadTake = useCallback(
    (rowKey) => {
      const row = currentStandingSubjects.find((r) => getEvaluationRowKey(r) === rowKey);
      setStandingLoadDeferred((prev) => {
        const next = new Set(prev);
        const currentlyDropped = next.has(rowKey);
        if (currentlyDropped) {
          // Trying to TAKE
          const block = standingLoadBlockedByPrereq(row, mergedRowsForPrereq, majorStandingOverrideKeys, enrollmentYearStandingOrd);
          if (block) {
            swalToast('warning', block);
            return prev;
          }
          const isCurrent =
            row &&
            String(row.year_level_id) === String(evalFilterYearId) &&
            String(row.semester_id) === String(evalFilterSemesterId);
          if (!isCurrent) {
            const gate = priorStandingTakeGate(row);
            if (!gate.ok) {
              swalToast('warning', gate.reason);
              return prev;
            }
          }
          next.delete(rowKey);
        } else {
          // DROP this subject — also drop dependents that need it
          next.add(rowKey);
          const droppedCode = normalizeEvalSubjectCode(row?.subject_code);
          if (droppedCode) {
            currentStandingSubjects.forEach((other) => {
              const oKey = getEvaluationRowKey(other);
              if (oKey === rowKey) return;
              const needs = Array.isArray(other.prerequisite_subject_codes)
                ? other.prerequisite_subject_codes
                : [];
              if (needs.some((c) => normalizeEvalSubjectCode(c) === droppedCode)) {
                next.add(oKey);
              }
            });
          }
        }
        // Enforce prereq / prior-offer drops for anything still marked TAKE
        currentStandingSubjects.forEach((other) => {
          const oKey = getEvaluationRowKey(other);
          if (next.has(oKey)) return;
          if (standingLoadBlockedByPrereq(other, mergedRowsForPrereq, majorStandingOverrideKeys, enrollmentYearStandingOrd)) {
            next.add(oKey);
            return;
          }
          const isCurrent =
            String(other.year_level_id) === String(evalFilterYearId) &&
            String(other.semester_id) === String(evalFilterSemesterId);
          if (!isCurrent && !priorStandingTakeGate(other).ok) {
            next.add(oKey);
          }
        });
        return next;
      });
      setStandingLoadDirty(true);
    },
    [
      currentStandingSubjects,
      mergedRowsForPrereq,
      majorStandingOverrideKeys,
      enrollmentYearStandingOrd,
      evalFilterYearId,
      evalFilterSemesterId,
      priorStandingTakeGate,
    ]
  );

  const persistStandingLoadPlan = useCallback(async () => {
    const studentId = data?.student?.student_id;
    if (!canEditEvaluationRows || !studentId) return;
    if (systemGuideOpen) {
      const savedDeferredKeys = Array.isArray(data?.student?.standing_deferred_keys)
        ? data.student.standing_deferred_keys.map(String)
        : [];
      setStandingLoadDeferred(new Set(savedDeferredKeys));
      setStandingLoadDirty(false);
      setCurrentStandingPanelOpen(false);
      setGuideLoadPlanPreviewSaved(true);
      await swalInfo(
        'Guide preview complete',
        'The sample subject placement was not saved to the system.'
      );
      return;
    }

    // No edits: treat Save as "keep as is" and close (instructors expect this, not only ×).
    if (!standingLoadDirty) {
      setCurrentStandingPanelOpen(false);
      return;
    }

    if (!evalFilterYearId || !evalFilterSemesterId) {
      await swalError('Could not save load plan', 'Set year / semester standing first.');
      return;
    }

    // Force-drop subjects blocked by unmet prerequisites or prior-offer gate.
    const deferred = new Set(standingLoadDeferred);
    currentStandingSubjects.forEach((row) => {
      const key = getEvaluationRowKey(row);
      if (standingLoadBlockedByPrereq(row, mergedRowsForPrereq, majorStandingOverrideKeys, enrollmentYearStandingOrd)) {
        deferred.add(key);
        return;
      }
      const isCurrent =
        String(row.year_level_id) === String(evalFilterYearId) &&
        String(row.semester_id) === String(evalFilterSemesterId);
      if (!isCurrent && !priorStandingTakeGate(row).ok) {
        deferred.add(key);
      }
    });

    const toTake = currentStandingSubjects.filter(
      (row) => !deferred.has(getEvaluationRowKey(row))
    );
    const takeUnits = toTake.reduce((sum, row) => sum + (Number(row.units) || 0), 0);
    const yearNum = Number(evalFilterYearId);
    const unitCap =
      Number.isFinite(yearNum) && EVAL_YEAR_UNIT_CAPS[yearNum] != null
        ? EVAL_YEAR_UNIT_CAPS[yearNum]
        : null;
    if (unitCap != null && takeUnits > unitCap) {
      await swalError(
        'Over unit cap',
        `This load is ${takeUnits} units — over the ${unitCap} unit cap. Uncheck subjects until the total is within the cap, then save again.`
      );
      return;
    }

    if (unitCap != null && takeUnits < unitCap) {
      const notTaken = currentStandingSubjects
        .filter((row) => !row.advance_offered && deferred.has(getEvaluationRowKey(row)))
        .map((row) => row.subject_code || row.elective_slot_name)
        .filter(Boolean);
      const ok = await swalConfirm({
        title: 'Save an underload?',
        html: `This student will carry <strong>${takeUnits} of ${unitCap} units</strong> this semester (underload).${
          notTaken.length
            ? `<br><br>Not taken: <strong>${notTaken.map(escapeHtmlText).join(', ')}</strong>`
            : ''
        }<br><br>Are you sure you want to save this load plan?`,
        confirmButtonText: 'Yes, save underload',
        cancelButtonText: 'Review load',
      });
      if (!ok) return;
    }

    const yearLabel =
      yearsAllowedForFilter.find((y) => y.id === String(evalFilterYearId))?.label ||
      evaluationFilterOptions.years.find((y) => y.id === String(evalFilterYearId))?.label ||
      `Year ${evalFilterYearId}`;
    const semLabel =
      semesterOptionsForYear.find((s) => s.id === String(evalFilterSemesterId))?.label ||
      `Semester ${evalFilterSemesterId}`;

    setStandingLoadSaving(true);
    try {
      const nextPlacement = { ...placementPreviewConfirmedMap };
      const nextOffsem = { ...offSemesterTakeMap };
      const priorFlags = {};
      currentStandingSubjects.forEach((row) => {
        const key = getEvaluationRowKey(row);
        const home =
          (data?.rows || []).find((r) => getEvaluationRowKey(r) === key) || row;
        if (deferred.has(key)) {
          delete nextPlacement[key];
          delete nextOffsem[key];
          return;
        }
        const isOffSemester =
          String(home.year_level_id) !== String(evalFilterYearId) ||
          String(home.semester_id) !== String(evalFilterSemesterId);
        if (isOffSemester) {
          // Subject placement: MOVE TO standing term. Main curriculum grid keeps
          // them at home with OFFSEM/Semestral badge only.
          nextPlacement[key] = {
            yearId: String(evalFilterYearId),
            semId: String(evalFilterSemesterId),
          };
          const gate = priorStandingTakeGate(home);
          const mode =
            gate.mode ||
            (isSubjectOfferedForStanding(home) ? 'offsem' : 'semestral');
          const flag = {
            standingYearId: String(evalFilterYearId),
            standingSemId: String(evalFilterSemesterId),
            standingYearLabel: yearLabel,
            standingSemLabel: semLabel,
            homeYearLabel: home.year_level_name || null,
            homeSemLabel: home.semester_name || null,
            schoolYearLabel: data?.active_academic_year?.academic_year_name || null,
            takenSemLabel: semLabel || data?.active_semester?.semester_name || null,
            mode,
          };
          nextOffsem[key] = flag;
          priorFlags[key] = flag;
        } else {
          delete nextOffsem[key];
          delete nextPlacement[key];
        }
      });

      const takeKeysList = toTake.map((row) => getEvaluationRowKey(row));
      const advanceKeys = new Set(
        currentStandingSubjects
          .filter((row) => row.advance_offered)
          .map((row) => getEvaluationRowKey(row))
      );
      const response = await api.post('/evaluation/student/standing-load', {
        student_id: Number(studentId),
        deferred_keys: [...deferred].filter((key) => !advanceKeys.has(key)),
        take_keys: takeKeysList,
        year_level_id: Number(evalFilterYearId) || null,
        semester_id: Number(evalFilterSemesterId) || null,
        prior_flags: priorFlags,
      });
      const nextStudent = response.data?.student;
      if (nextStudent) {
        setData((prev) =>
          prev ? { ...prev, student: { ...prev.student, ...nextStudent } } : prev
        );
        setBaselineData((prev) =>
          prev ? { ...prev, student: { ...prev.student, ...nextStudent } } : prev
        );
      }

      setPlacementPreviewMap(nextPlacement);
      setPlacementPreviewConfirmedMap(nextPlacement);
      setOffSemesterTakeMap(nextOffsem);
      if (placementPreviewStorageKey) {
        try {
          window.localStorage.setItem(
            placementPreviewStorageKey,
            JSON.stringify(nextPlacement || {})
          );
        } catch {
          // ignore storage errors
        }
      }
      if (offSemesterStorageKey) {
        try {
          window.localStorage.setItem(
            offSemesterStorageKey,
            JSON.stringify(nextOffsem || {})
          );
        } catch {
          // ignore storage errors
        }
      }

      setStandingLoadDeferred(deferred);
      setStandingLoadDirty(false);
      setCurrentStandingPanelOpen(false);

      setNextSemCurrentTakeKeys(new Set(takeKeysList));

      if (nextStandingTerm) {
        swalToast(
          'success',
          'Load plan saved — map subjects for the next semester'
        );
        setNextSemMapNeedsInit(true);
        setNextSemMapOpen(true);
      } else {
        swalToast(
          'success',
          'Load plan saved — prior subjects stay on curriculum home (OFFSEM / Semestral); Subject placement shows where they are taken'
        );
      }
    } catch (err) {
      await swalError(
        'Could not save load plan',
        err.response?.data?.message || 'Request failed'
      );
    } finally {
      setStandingLoadSaving(false);
    }
  }, [
    data?.active_academic_year?.academic_year_name,
    data?.active_semester?.semester_name,
    canEditEvaluationRows,
    systemGuideOpen,
    standingLoadDirty,
    data?.student?.student_id,
    data?.rows,
    standingLoadDeferred,
    currentStandingSubjects,
    mergedRowsForPrereq,
    majorStandingOverrideKeys,
    enrollmentYearStandingOrd,
    evalFilterYearId,
    evalFilterSemesterId,
    yearsAllowedForFilter,
    evaluationFilterOptions.years,
    semesterOptionsForYear,
    placementPreviewConfirmedMap,
    placementPreviewStorageKey,
    offSemesterTakeMap,
    offSemesterStorageKey,
    isSubjectOfferedForStanding,
    priorStandingTakeGate,
    nextStandingTerm,
  ]);

  const promotionModalRows = useMemo(() => {
    if (!nextPromotionTerm || !data?.rows?.length) return [];
    return data.rows.filter(
      (r) =>
        String(r.year_level_id) === nextPromotionTerm.year_level_id &&
        String(r.semester_id) === nextPromotionTerm.semester_id
    );
  }, [data?.rows, nextPromotionTerm]);

  /**
   * Track picker only for the term being promoted into — when that term has
   * track-based electives (BSIT: typically 3rd Year 1st Sem Electives 1–3).
   * Do not pull tracks from later years or Elective 4 free-choice rows.
   */
  const nextTermNeedsTrackPicker = useMemo(
    () =>
      promotionModalRows.some(
        (r) =>
          !isItElectivesFourRow(r) &&
          (isElectiveTrackPendingRow(r) || isTrackSelectableElectiveRow(r))
      ),
    [promotionModalRows]
  );

  const promotionTrackSelectOptions = useMemo(() => {
    if (!nextTermNeedsTrackPicker) return [];

    const raw = promotionModalRows
      .filter(
        (r) =>
          !isItElectivesFourRow(r) &&
          (isElectiveTrackPendingRow(r) || isTrackSelectableElectiveRow(r))
      )
      .flatMap((r) => r.elective_choices || []);
    const deduped = dedupeElectiveChoicesByTrackFamily(raw).filter(
      (c) => c.track_id != null && c.track_id !== ''
    );
    const studentTrackId = data?.student?.track_id;
    if (studentTrackId == null || studentTrackId === '') return deduped;
    const hasStudentTrack = deduped.some(
      (c) => Number(c.track_id) === Number(studentTrackId)
    );
    if (hasStudentTrack) return deduped;
    return [
      {
        track_id: Number(studentTrackId),
        track_name: data?.student?.track?.track_name || null,
        track_code: data?.student?.track?.track_code || null,
        subject_id: null,
        subject_code: null,
        subject_name: null,
        units: null,
        elective_subject_id: `student-track-${studentTrackId}`,
      },
      ...deduped,
    ];
  }, [
    nextTermNeedsTrackPicker,
    promotionModalRows,
    data?.student?.track_id,
    data?.student?.track,
  ]);

  const promotionTrackPickRequired = useMemo(() => {
    if (!nextTermNeedsTrackPicker || !promotionTrackSelectOptions.length) return false;
    const hasTrack = data?.student?.track_id != null && data.student.track_id !== '';
    return !hasTrack;
  }, [nextTermNeedsTrackPicker, promotionTrackSelectOptions, data?.student?.track_id]);

  const promoteModalTrackOptions = useMemo(
    () =>
      promotionTrackSelectOptions.map((c) => ({
        value: String(c.track_id),
        label: electiveChoiceLabel(c),
      })),
    [promotionTrackSelectOptions]
  );

  const promotionTableRows = useMemo(() => {
    const tid =
      promoteModalTrackId !== '' && promoteModalTrackId != null
        ? Number(promoteModalTrackId)
        : null;
    const selectedTrackChoice =
      tid != null && !Number.isNaN(tid)
        ? promotionTrackSelectOptions.find((c) => Number(c.track_id) === tid) || null
        : null;
    const trackKey = itTrackKeyFromChoiceOrStudent(selectedTrackChoice, data?.student);

    return promotionModalRows.map((r) => {
      const unmetPrerequisites = unmetEvalPrerequisiteLabels(data?.rows || [], r, enrollmentYearStandingOrd);
      const eligible =
        unmetPrerequisites.length === 0 &&
        rowPrereqsMetWithOverride(data?.rows || [], r);
      const prerequisiteLabel = formatPromotionPrerequisiteDisplay(r) || 'NONE';
      const isElectiveFour = isItElectivesFourRow(r);

      if (!isElectiveTrackPendingRow(r) && !isElectiveFour) {
        return {
          penCode: r.subject_code || '—',
          title: r.subject_name || '—',
          units: r.units ?? 0,
          prerequisite: prerequisiteLabel,
          eligible,
          unmetPrerequisites,
          electivePending: false,
          isElectiveFour: false,
        };
      }

      // Elective 4: Digi auto-maps; SysDev/Cyber/BAM stay blank until a subject is picked.
      if (isElectiveFour) {
        const subjectChoices = filterElectiveFourSubjectChoices(r.elective_choices, {
          trackKey,
          studentTrackId: tid ?? data?.student?.track_id,
          allRows: data?.rows || [],
        }).filter((c) => {
          // Keep Digi track-linked row when Digi; otherwise prefer free-choice (null track).
          if (trackKey === 'digital') return true;
          return c.track_id == null || c.track_id === '';
        });

        let picked = null;
        if (promoteModalElective4SubjectId) {
          picked =
            subjectChoices.find(
              (c) => String(c.subject_id) === String(promoteModalElective4SubjectId)
            ) || null;
        }
        if (!picked && trackKey === 'digital' && tid != null) {
          picked =
            subjectChoices.find(
              (c) => normalizeItSubjectCode(c.subject_code) === 'ITE388'
            ) ||
            subjectChoices.find((c) => Number(c.track_id) === tid) ||
            null;
        }
        // Already resolved on the curriculum row (saved Digi / prior Elective 4 pick).
        if (!picked && r.subject_id && !isElectiveTrackPendingRow(r)) {
          return {
            penCode: r.subject_code || '—',
            title: r.subject_name || '—',
            units: r.units ?? 0,
            prerequisite: prerequisiteLabel,
            eligible,
            unmetPrerequisites,
            electivePending: subjectChoices.length > 0,
            isElectiveFour: true,
            electiveSubjectChoices: subjectChoices,
            electiveChoices: [],
          };
        }
        if (picked) {
          return {
            penCode: picked.subject_code || '—',
            title: picked.subject_name || r.elective_slot_name || '—',
            units: picked.units ?? r.units ?? 0,
            prerequisite: prerequisiteLabel,
            eligible,
            unmetPrerequisites,
            electivePending: true,
            isElectiveFour: true,
            electiveSubjectChoices: subjectChoices,
            electiveChoices: [],
            rowKey: getEvaluationRowKey(r),
            electiveSlotId: r.elective_slot_id,
            semesterId: r.semester_id,
            academicYearId: r.academic_year_id,
          };
        }
        return {
          penCode: '—',
          title: `${r.elective_slot_name || 'IT Electives 4'} — Choose subject`,
          units: r.units ?? 0,
          prerequisite: prerequisiteLabel,
          eligible,
          unmetPrerequisites,
          electivePending: subjectChoices.length > 0,
          isElectiveFour: true,
          electiveSubjectChoices: subjectChoices,
          electiveChoices: [],
          rowKey: getEvaluationRowKey(r),
          electiveSlotId: r.elective_slot_id,
          semesterId: r.semester_id,
          academicYearId: r.academic_year_id,
        };
      }

      const choices = r.elective_choices || [];
      const electiveChoices = dedupeElectiveChoicesByTrackFamily(choices).filter(
        (c) => c.track_id != null && c.track_id !== ''
      );
      let picked = null;
      if (tid != null && !Number.isNaN(tid)) {
        picked = choices.find((c) => Number(c.track_id) === tid) || null;
      }
      if (!picked && data?.student?.track_id != null && data.student.track_id !== '') {
        picked =
          choices.find((c) => Number(c.track_id) === Number(data.student.track_id)) || null;
      }
      if (picked) {
        return {
          penCode: picked.subject_code || r.subject_code || '—',
          title: picked.subject_name || r.subject_name || '—',
          units: picked.units ?? r.units ?? 0,
          prerequisite: prerequisiteLabel,
          eligible,
          unmetPrerequisites,
          electivePending: false,
          isElectiveFour: false,
        };
      }
      return {
        penCode: r.subject_code || '—',
        title: r.subject_name || '—',
        units: r.units ?? 0,
        prerequisite: prerequisiteLabel,
        eligible,
        unmetPrerequisites,
        electivePending: electiveChoices.length > 0,
        electiveChoices,
        isElectiveFour: false,
      };
    });
  }, [
    promotionModalRows,
    promoteModalTrackId,
    promoteModalElective4SubjectId,
    promotionTrackSelectOptions,
    data?.student,
    data?.rows,
    rowPrereqsMetWithOverride,
  ]);

  const promotionModalTotalUnits = useMemo(
    () => promotionTableRows.reduce((acc, r) => acc + (Number(r.units) || 0), 0),
    [promotionTableRows]
  );

  const promotionCurriculumLabel = useMemo(() => {
    // Curriculum Effective SY (e.g. 2023-2024) — identifies which curriculum the student is under.
    return (
      schoolYearLabelForStanding(
        data?.curriculum?.effective_year ?? data?.curriculum?.label
      ) ||
      standingSchoolYearLabel ||
      data?.curriculum?.label ||
      (promotionModalRows.length ? '—' : '—')
    );
  }, [
    data?.curriculum?.effective_year,
    data?.curriculum?.label,
    standingSchoolYearLabel,
    promotionModalRows.length,
  ]);

  useEffect(() => {
    if (!data?.rows?.length || !orderedCurriculumTerms.length) {
      setEvalFilterYearId('');
      setEvalFilterSemesterId('');
      setEvalFilterCurriculumId('');
      return;
    }

    const curriculumId =
      data?.curriculum?.curriculum_header_id != null
        ? String(data.curriculum.curriculum_header_id)
        : '';
    setEvalFilterCurriculumId(curriculumId);

    // Prefer promotion / profile standing term (may be ahead of earned-units year).
    if (activeSemesterStandingTerm) {
      setEvalFilterYearId(String(activeSemesterStandingTerm.year_level_id));
      setEvalFilterSemesterId(String(activeSemesterStandingTerm.semester_id));
      return;
    }

    const yearFromUnits = unitsBasedYearId;
    if (!yearFromUnits) {
      setEvalFilterYearId('');
      setEvalFilterSemesterId('');
      return;
    }

    setEvalFilterYearId(yearFromUnits);
    setEvalFilterSemesterId('');
  }, [
    data?.student?.student_id,
    data?.rows,
    data?.curriculum,
    data?.summary?.total_units_earned,
    data?.active_semester?.semester_id,
    data?.student?.promoted_next_sem_at,
    data?.student?.promotion_target_year_level_id,
    data?.student?.promotion_target_semester_id,
    data?.student?.year_level_id,
    data?.student?.semester_id,
    orderedCurriculumTerms,
    unitsBasedYearId,
    activeSemesterStandingTerm,
  ]);

  // Keep profile standing aligned with the active standing term (promotion wins over units).
  useEffect(() => {
    if (!canEditEvaluationRows || !activeSemesterStandingTerm || !data?.student?.student_id) {
      return;
    }
    // Irregular Year/Semester is set explicitly by Dean/PH — do not auto-resync from units.
    if (canAlterIrregularStanding) {
      return;
    }

    const nextYear = String(activeSemesterStandingTerm.year_level_id);
    const nextSem = String(activeSemesterStandingTerm.semester_id);

    if (String(evalFilterYearId) !== nextYear) setEvalFilterYearId(nextYear);
    if (String(evalFilterSemesterId) !== nextSem) setEvalFilterSemesterId(nextSem);

    const storedYear = data?.student?.year_level_id;
    const storedSem = data?.student?.semester_id;
    const targetYear = data?.student?.promotion_target_year_level_id;
    const targetSem = data?.student?.promotion_target_semester_id;

    // Never write a standing earlier than an existing promotion target.
    if (
      data?.student?.promoted_next_sem_at &&
      targetYear != null &&
      targetYear !== '' &&
      targetSem != null &&
      targetSem !== ''
    ) {
      const nextIdx = orderedCurriculumTerms.findIndex(
        (t) =>
          String(t.year_level_id) === nextYear && String(t.semester_id) === nextSem
      );
      const targetIdx = orderedCurriculumTerms.findIndex(
        (t) =>
          String(t.year_level_id) === String(targetYear) &&
          String(t.semester_id) === String(targetSem)
      );
      if (targetIdx >= 0 && nextIdx >= 0 && nextIdx < targetIdx) {
        return;
      }
    }

    if (
      nextSem &&
      (String(storedYear ?? '') !== nextYear || String(storedSem ?? '') !== nextSem)
    ) {
      void persistStudentStanding({
        yearId: nextYear,
        semesterId: nextSem,
      });
    }
  }, [
    canEditEvaluationRows,
    canAlterIrregularStanding,
    activeSemesterStandingTerm,
    evalFilterYearId,
    evalFilterSemesterId,
    data?.student?.student_id,
    data?.student?.year_level_id,
    data?.student?.semester_id,
    data?.student?.promoted_next_sem_at,
    data?.student?.promotion_target_year_level_id,
    data?.student?.promotion_target_semester_id,
    orderedCurriculumTerms,
    persistStudentStanding,
  ]);
  useEffect(() => {
    if (!orderedCurriculumTerms.length || !evalFilterYearId || !evalFilterSemesterId) return;
    const exists = orderedCurriculumTerms.some(
      (t) =>
        String(t.year_level_id) === String(evalFilterYearId) &&
        String(t.semester_id) === String(evalFilterSemesterId)
    );
    if (exists) return;
    const t =
      activeSemesterStandingTerm ||
      orderedCurriculumTerms.find(
        (term) => String(term.year_level_id) === String(unitsBasedYearId || evalFilterYearId)
      ) ||
      orderedCurriculumTerms[Math.max(0, currentYearFirstTermIndex)] ||
      orderedCurriculumTerms[0];
    setEvalFilterYearId(t.year_level_id);
    setEvalFilterSemesterId(t.semester_id);
  }, [
    orderedCurriculumTerms,
    currentYearFirstTermIndex,
    evalFilterYearId,
    evalFilterSemesterId,
    unitsBasedYearId,
    activeSemesterStandingTerm,
  ]);

  useEffect(() => {
    if (!evalFilterYearId) return;
    if (!semesterOptionsForYear.length) return;
    const ok = semesterOptionsForYear.some((o) => o.id === evalFilterSemesterId);
    if (ok) return;
    const activeSem = String(data?.active_semester?.semester_id ?? '');
    const activeOk = semesterOptionsForYear.find((o) => o.id === activeSem);
    setEvalFilterSemesterId(activeOk?.id || semesterOptionsForYear[0].id);
  }, [
    semesterOptionsForYear,
    evalFilterSemesterId,
    evalFilterYearId,
    data?.active_semester?.semester_id,
  ]);

  // Initialize drafts when student evaluation data changes
  useEffect(() => {
    setElectiveTrackPopoverKey(null);
    setElectiveSubjectPopoverKey(null);
    setElectiveTrackDrafts({});
    setCurrentStandingPanelOpen(false);
  }, [data?.student?.student_id]);

  useEffect(() => {
    if (!electiveTrackPopoverKey && !electiveSubjectPopoverKey) return undefined;
    const onDoc = (e) => {
      const el = electiveTrackPopoverRef.current;
      if (el && !el.contains(e.target)) {
        setElectiveTrackPopoverKey(null);
        setElectiveSubjectPopoverKey(null);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setElectiveTrackPopoverKey(null);
        setElectiveSubjectPopoverKey(null);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [electiveTrackPopoverKey, electiveSubjectPopoverKey]);

  useEffect(() => {
    if (!data?.rows) return;

    const next = {};
    data.rows.forEach((row) => {
      const key = getRowKey(row);
      next[key] = {
        grade: draftGradeFromRow(row),
        status: normalizeStatusForUi(row.status ?? ''),
        inc_compliance_deadline: row.inc_compliance_deadline
          ? String(row.inc_compliance_deadline).slice(0, 10)
          : '',
        subject_id: row.subject_id,
        subject_code: row.subject_code,
        subject_name: row.subject_name,
        units: row.units,
        elective_slot_id: row.elective_slot_id,
        curriculum_id: row.curriculum_id,
        academic_year_id: row.academic_year_id,
        semester_id: row.semester_id,
        evaluation_id: row.evaluation_id,
        passed_via_transfer_credit: row.passed_via_transfer_credit === true,
      };
    });

    const studentId = data?.student?.student_id;
    const cacheKey = evaluationDraftCacheKey(user?.user_id ?? user?.id, studentId);
    let restoredKeys = [];
    if (canEditEvaluationRows && cacheKey) {
      const cached = readEvaluationDraftCache(cacheKey);
      if (cached) {
        for (const key of cached.modifiedKeys) {
          if (!next[key] || !cached.drafts[key]) continue;
          next[key] = {
            ...next[key],
            ...cached.drafts[key],
            // Keep server ids / subject binding from the live row when present.
            subject_id: cached.drafts[key].subject_id ?? next[key].subject_id,
            evaluation_id: next[key].evaluation_id ?? cached.drafts[key].evaluation_id,
            elective_slot_id: next[key].elective_slot_id ?? cached.drafts[key].elective_slot_id,
            curriculum_id: next[key].curriculum_id ?? cached.drafts[key].curriculum_id,
            academic_year_id: next[key].academic_year_id ?? cached.drafts[key].academic_year_id,
            semester_id: next[key].semester_id ?? cached.drafts[key].semester_id,
            passed_via_transfer_credit:
              next[key].passed_via_transfer_credit === true ||
              cached.drafts[key].passed_via_transfer_credit === true,
          };
          restoredKeys.push(key);
        }
      }
    }

    setDrafts(next);
    setModifiedKeys(new Set(restoredKeys));
    setSaveError('');

    if (
      restoredKeys.length > 0 &&
      draftCacheHydratedStudentRef.current !== String(studentId)
    ) {
      draftCacheHydratedStudentRef.current = String(studentId);
      swalToast(
        'info',
        `Restored ${restoredKeys.length} unsaved grade(s) from this device — click Save All when online.`
      );
    } else if (restoredKeys.length === 0) {
      draftCacheHydratedStudentRef.current = studentId != null ? String(studentId) : null;
    }
  }, [data, getRowKey, canEditEvaluationRows, user?.user_id, user?.id]);

  // Keep unsaved grade drafts on this device (survives refresh / brief disconnect).
  useEffect(() => {
    if (!canEditEvaluationRows || !evaluationDraftStorageKey) return undefined;
    const timer = window.setTimeout(() => {
      writeEvaluationDraftCache(evaluationDraftStorageKey, drafts, modifiedKeys);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [drafts, modifiedKeys, evaluationDraftStorageKey, canEditEvaluationRows]);

  const applySavedEvaluation = useCallback((evaluationPayload) => {
    setBaselineData(evaluationPayload);
    setData(evaluationPayload);
    setPendingProgramId(null);
    const st = evaluationPayload?.student;
    if (st?.is_simulation) {
      setPendingSimName({
        first_name: st.first_name || '',
        last_name: st.last_name || '',
        middle_name: st.middle_name || '',
      });
    } else {
      setPendingSimName(null);
    }
  }, []);

  useEffect(() => {
    if (!placementPreviewStorageKey) return;
    try {
      const raw = window.localStorage.getItem(placementPreviewStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setPlacementPreviewMap(parsed);
        setPlacementPreviewConfirmedMap(parsed);
      }
    } catch {
      // Ignore parse/storage issues; fallback is empty preview state.
    }
  }, [placementPreviewStorageKey]);

  useEffect(() => {
    if (!offSemesterStorageKey) {
      setOffSemesterTakeMap({});
      return;
    }
    try {
      const raw = window.localStorage.getItem(offSemesterStorageKey);
      if (!raw) {
        setOffSemesterTakeMap({});
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setOffSemesterTakeMap(parsed);
      } else {
        setOffSemesterTakeMap({});
      }
    } catch {
      setOffSemesterTakeMap({});
    }
  }, [offSemesterStorageKey]);

  /**
   * Existing OFFSEM/Semestral flags (badge-only) → also MOVE into the standing term
   * so Subject placement lists them where they were taken.
   */
  useEffect(() => {
    if (!data?.rows?.length || !evalFilterYearId || !evalFilterSemesterId) return;
    const studentId = data?.student?.student_id;
    if (studentId == null || studentId === '') return;
    const migrateKey = `${studentId}:${evalFilterYearId}:${evalFilterSemesterId}`;
    if (offsemMigratedRef.current === migrateKey) return;

    let changed = false;
    const nextPlacement = { ...placementPreviewConfirmedMap };
    const homeByKey = new Map(
      (data.rows || []).map((row) => [getEvaluationRowKey(row), row])
    );

    Object.entries(offSemesterTakeMap || {}).forEach(([key, flag]) => {
      if (!flag || typeof flag !== 'object') return;
      const home = homeByKey.get(key);
      if (!home) return;
      const standingY = String(flag.standingYearId || evalFilterYearId);
      const standingS = String(flag.standingSemId || evalFilterSemesterId);
      const existing = nextPlacement[key];
      if (
        existing &&
        String(existing.yearId ?? '') === standingY &&
        String(existing.semId ?? '') === standingS
      ) {
        return;
      }
      nextPlacement[key] = { yearId: standingY, semId: standingS };
      changed = true;
    });

    offsemMigratedRef.current = migrateKey;
    if (!changed) return;
    setPlacementPreviewMap(nextPlacement);
    setPlacementPreviewConfirmedMap(nextPlacement);
    if (placementPreviewStorageKey) {
      try {
        window.localStorage.setItem(
          placementPreviewStorageKey,
          JSON.stringify(nextPlacement || {})
        );
      } catch {
        // ignore
      }
    }
  }, [
    data?.student?.student_id,
    data?.rows,
    evalFilterYearId,
    evalFilterSemesterId,
    placementPreviewConfirmedMap,
    offSemesterTakeMap,
    placementPreviewStorageKey,
  ]);

  // Handle student selection from list
  const handleStudentSelect = useCallback(async (student) => {
    // Check for unsaved changes
    if (hasUnsavedChanges) {
      const confirmed = await swalConfirm(
        'Unsaved Changes',
        `You have ${unsavedChangeCount} unsaved change(s). Discard them?`,
        'Discard',
        'Cancel'
      );
      if (!confirmed) return;
    }

    setSelectedStudent(student);
    setError('');
    setLoading(true);

    try {
      const response = await api.get(`/evaluation/student/${encodeURIComponent(student.student_id_number)}`, {
        skipLoading: true,
      });
      applySavedEvaluation(response.data);
      const st = response.data?.student;
      if (st) {
        setSelectedStudent({
          ...student,
          student_id: st.student_id ?? student.student_id,
          student_id_number: st.student_id_number ?? student.student_id_number,
          full_name: st.full_name || student.full_name,
          academic_status: st.academic_status || student.academic_status,
          year_level_id: st.year_level_id ?? student.year_level_id,
          program: st.program || student.program,
          program_name: st.program?.program_name || student.program_name,
          is_simulation: st.is_simulation ?? student.is_simulation,
          academic_record_evaluated:
            st.academic_record_evaluated ?? student.academic_record_evaluated,
        });
      }
      if (selectionCacheKey && (st?.student_id_number || student?.student_id_number)) {
        writeLastEvaluationSelection(selectionCacheKey, {
          student_id: st?.student_id ?? student.student_id ?? null,
          student_id_number: st?.student_id_number ?? student.student_id_number,
          listYearLevelFilter,
          listStandingFilter,
        });
      }
    } catch (err) {
      console.error('Error fetching student evaluation:', err);
      setBaselineData(null);
      setData(null);
      setPendingSimName(null);
      const msg = err.response?.data?.message || 'Failed to load student evaluation';
      setError(msg);
      await swalError('Could not load evaluation', msg);
    } finally {
      setLoading(false);
    }
  }, [
    hasUnsavedChanges,
    unsavedChangeCount,
    applySavedEvaluation,
    selectionCacheKey,
    listYearLevelFilter,
    listStandingFilter,
  ]);

  const clearSelectedEvaluationStudent = useCallback(() => {
    setSelectedStudent(null);
    setBaselineData(null);
    setData(null);
    setPendingSimName(null);
    setError('');
    clearLastEvaluationSelection(selectionCacheKey);
  }, [selectionCacheKey]);

  // Restore last student + list filters after reload / brief disconnect.
  useEffect(() => {
    if (!selectionCacheKey || selectionRestoredRef.current) return;
    const saved = readLastEvaluationSelection(selectionCacheKey);
    if (saved?.listYearLevelFilter) {
      setListYearLevelFilter(saved.listYearLevelFilter);
    }
    if (saved?.listStandingFilter) {
      setListStandingFilter(saved.listStandingFilter);
    }
    if (!saved?.student_id_number) {
      selectionRestoredRef.current = true;
      return;
    }
    selectionRestoredRef.current = true;
    void handleStudentSelect({
      student_id: saved.student_id,
      student_id_number: saved.student_id_number,
    });
  }, [selectionCacheKey, handleStudentSelect]);

  // Keep filters in the same cache entry while a student stays open.
  useEffect(() => {
    if (!selectionCacheKey || !selectedStudent?.student_id_number) return;
    writeLastEvaluationSelection(selectionCacheKey, {
      student_id: selectedStudent.student_id,
      student_id_number: selectedStudent.student_id_number,
      listYearLevelFilter,
      listStandingFilter,
    });
  }, [
    selectionCacheKey,
    selectedStudent?.student_id,
    selectedStudent?.student_id_number,
    listYearLevelFilter,
    listStandingFilter,
  ]);

  useEffect(() => {
    // Fresh guide session — clear completion gates so auto-advance does not skip steps.
    setGuidePromotionPreviewSaved(false);
    setGuideLoadPlanPreviewSaved(false);
  }, [systemGuideOpen]);

  useEffect(() => {
    const closePanels = () => {
      setPromoteModalOpen(false);
      setCurrentStandingPanelOpen(false);
    };
    window.addEventListener('system-guide-close-eval-panels', closePanels);
    return () => window.removeEventListener('system-guide-close-eval-panels', closePanels);
  }, []);

  // The guided walkthrough always opens an existing practice student so the
  // user can follow the workflow without selecting or risking a real record.
  useEffect(() => {
    if (!systemGuideOpen) {
      guideDemoLoadingRef.current = false;
      return;
    }
    if (
      isEvaluatedModule ||
      loading ||
      guideDemoLoadingRef.current ||
      hasUnsavedChanges ||
      selectedStudent?.is_simulation ||
      data?.student?.is_simulation
    ) {
      return;
    }

    const demoStudent = students.find((student) => student?.is_simulation);
    if (!demoStudent?.student_id_number) return;

    guideDemoLoadingRef.current = true;
    setSelectedStudent(demoStudent);
    setError('');
    setLoading(true);

    void api
      .get(
        `/evaluation/student/${encodeURIComponent(demoStudent.student_id_number)}`,
        { skipLoading: true }
      )
      .then((response) => {
        applySavedEvaluation(response.data);
      })
      .catch(async (err) => {
        console.error('Error loading guide practice student:', err);
        setBaselineData(null);
        setData(null);
        setPendingSimName(null);
        const msg =
          err.response?.data?.message || 'Failed to load the guide practice student';
        setError(msg);
        await swalError('Could not load guide sample', msg);
      })
      .finally(() => {
        setLoading(false);
        guideDemoLoadingRef.current = false;
      });
  }, [
    systemGuideOpen,
    isEvaluatedModule,
    loading,
    hasUnsavedChanges,
    selectedStudent?.is_simulation,
    data?.student?.is_simulation,
    students,
    applySavedEvaluation,
  ]);

  const createSimulationDummy = useCallback(async () => {
    if (!canManageSimulationDummy || simulationCreating) return;
    if (hasUnsavedChanges) {
      const discard = await swalConfirm(
        'Unsaved Changes',
        `You have ${unsavedChangeCount} unsaved change(s). Discard them and save a simulation dummy?`,
        'Discard & save',
        'Cancel'
      );
      if (!discard) return;
    }
    const ok = await swalConfirm(
      'Add simulation dummy?',
      'Saves a practice student ([SIM]) so you can try evaluation flows without changing real student records.\n\nNo login account is created. You can delete it anytime with the trash button.',
      'Save dummy',
      'Cancel'
    );
    if (!ok) return;

    setSimulationCreating(true);
    try {
      const res = await api.post('/evaluation/student/simulation-dummy', {
        program_id:
          selectedStudent?.program?.program_id ||
          data?.student?.program?.program_id ||
          undefined,
        year_level_id: 1,
        semester_id: 1,
      });
      const created = res.data?.student;
      await fetchStudentList(searchTerm);
      if (created?.student_id_number) {
        setSelectedStudent({ ...created, is_simulation: true });
        setError('');
        setLoading(true);
        try {
          const response = await api.get(
            `/evaluation/student/${encodeURIComponent(created.student_id_number)}`
          );
          applySavedEvaluation(response.data);
        } catch (loadErr) {
          setBaselineData(null);
          setData(null);
          const msg =
            loadErr.response?.data?.message || 'Failed to load simulation evaluation';
          setError(msg);
          await swalError('Could not load evaluation', msg);
        } finally {
          setLoading(false);
        }
      }
      swalToast('success', res.data?.message || 'Simulation dummy ready.');
    } catch (err) {
      await swalError(
        'Could not save simulation dummy',
        err.response?.data?.message || err.message || 'Request failed'
      );
    } finally {
      setSimulationCreating(false);
    }
  }, [
    canManageSimulationDummy,
    simulationCreating,
    hasUnsavedChanges,
    unsavedChangeCount,
    selectedStudent?.program?.program_id,
    data?.student?.program?.program_id,
    fetchStudentList,
    searchTerm,
    applySavedEvaluation,
  ]);

  const deleteSelectedSimulationDummy = useCallback(async () => {
    const sid = selectedStudent?.student_id ?? data?.student?.student_id;
    const isSim = !!(selectedStudent?.is_simulation || data?.student?.is_simulation);
    if (!canManageSimulationDummy || !sid || !isSim) return;
    const ok = await swalConfirm(
      'Delete simulation dummy?',
      'This removes the practice record and its practice grades. Real students are not affected.',
      'Delete dummy',
      'Cancel'
    );
    if (!ok) return;
    try {
      await api.delete(`/evaluation/student/simulation-dummy/${sid}`);
      clearSelectedEvaluationStudent();
      await fetchStudentList(searchTerm);
      swalToast('success', 'Simulation dummy removed.');
    } catch (err) {
      await swalError(
        'Could not delete simulation dummy',
        err.response?.data?.message || err.message || 'Request failed'
      );
    }
  }, [
    canManageSimulationDummy,
    selectedStudent,
    data?.student?.student_id,
    data?.student?.is_simulation,
    fetchStudentList,
    searchTerm,
    clearSelectedEvaluationStudent,
  ]);

  const refreshSelectedStudentEvaluation = useCallback(async () => {
    if (!selectedStudent?.student_id_number) return;
    try {
      const response = await api.get(`/evaluation/student/${encodeURIComponent(selectedStudent.student_id_number)}`, {
        skipLoading: true,
      });
      applySavedEvaluation(response.data);
    } catch (err) {
      console.error('Error refreshing evaluation after equivalence save', err);
    }
  }, [applySavedEvaluation, selectedStudent?.student_id_number]);

  const updateDraft = (row, patch) => {
    const key = getRowKey(row);
    const base = drafts[key] || { grade: '', status: '', inc_compliance_deadline: '' };
    const merged = { ...base, ...patch };
    if (merged.status !== 'inc') {
      merged.inc_compliance_deadline = '';
    }
    setDrafts({ ...drafts, [key]: merged });
    setModifiedKeys((prev) => {
      const next = new Set(prev);
      const subjectChanged =
        Object.prototype.hasOwnProperty.call(merged, 'subject_id') &&
        String(merged.subject_id ?? '') !== String(row.subject_id ?? '');
      if (!subjectChanged && draftMatchesSavedRow(merged.grade, merged.status, row, merged.inc_compliance_deadline)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const electiveSubjectChoicesForRow = (row) => {
    if (!isItElectivesFourRow(row)) return [];

    return filterElectiveFourSubjectChoices(row?.elective_choices, {
      trackKey: itTrackKeyFromStudent(data?.student),
      studentTrackId: data?.student?.track_id,
      allRows: data?.rows || [],
    });
  };

  // Batch update status for multiple rows
  const batchUpdateStatus = (rows, status) => {
    const gradable = rows.filter((row) => {
      if (!isRowGradable(row) || isTransferCreditRow(row) || row.not_taken_in_load) return false;
      const mi = data?.rows ? data.rows.findIndex((r) => getRowKey(r) === getRowKey(row)) : -1;
      const mergedTarget = mi >= 0 ? mergedRowsForPrereq[mi] : row;
      return rowPrereqsMetWithOverride(mergedRowsForPrereq, mergedTarget);
    });
    if (gradable.length === 0) {
      swalToast(
        'info',
        'No rows to update here (elective slots need a subject, all rows are transfer-credited or not taken, or every course is blocked until prerequisites are passed on record).'
      );
      return;
    }

    const nextDrafts = { ...drafts };
    for (const row of gradable) {
      const key = getRowKey(row);
      const currentDraft = nextDrafts[key] || {};
      let newGrade;
      if (status === '') {
        newGrade = '';
      } else if (status === 'passed') {
        newGrade = isCompleteOnlySubject(row) ? 'Complete' : SIS_DEFAULT_PASS_GRADE;
      } else if (status === 'failed') {
        newGrade = SIS_DEFAULT_FAIL_GRADE;
      } else {
        newGrade =
          currentDraft.grade === '' || currentDraft.grade == null
            ? ''
            : String(currentDraft.grade);
      }

      const nextStatus = status === 'passed' && isCompleteOnlySubject(row) ? 'complete' : status;

      nextDrafts[key] = {
        ...currentDraft,
        status: nextStatus,
        grade: newGrade,
        inc_compliance_deadline: '',
      };
    }

    const nextModified = new Set(modifiedKeys);
    for (const row of gradable) {
      const key = getRowKey(row);
      const d = nextDrafts[key];
      if (draftMatchesSavedRow(d.grade, d.status, row, d.inc_compliance_deadline)) {
        nextModified.delete(key);
      } else {
        nextModified.add(key);
      }
    }

    setDrafts(nextDrafts);
    setModifiedKeys(nextModified);

    if (status === '') {
      const clearedPendingSave = gradable.filter((row) => nextModified.has(getRowKey(row))).length;
      if (clearedPendingSave === 0) {
        swalToast(
          'info',
          'Nothing new to clear — these rows already match what is saved. Use bottom “Clear All” to discard unsaved edits in other rows.'
        );
      } else {
        swalToast(
          'success',
          `Cleared ${clearedPendingSave} subject(s) in the form. Click “Save All Changes” to update the server, or “Clear All” below to undo.`
        );
      }
    } else {
      swalToast('success', `Updated ${gradable.length} subject(s) to "${status}"`);
    }
  };

  // Save all modified evaluations at once
  const handleSaveAll = async () => {
    if (!canEditEvaluationRows || !selectedStudent || !data?.student?.student_id) return;
    if (savingAllRef.current || savingAll) return;
    if (systemGuideOpen) {
      await swalInfo(
        'Guide preview only',
        'Grade and evaluation changes are not saved while the Guide is open. Close the Guide when you are ready to perform a real evaluation.'
      );
      return;
    }
    if (!hasUnsavedChanges) {
      swalToast('info', 'No changes to save');
      return;
    }

    if (hasPendingProgramChange) {
      const oldLabel =
        baselineData?.student?.program?.program_name ||
        baselineData?.student?.program?.program_code ||
        'current program';
      const newLabel =
        programOptions.find((option) => Number(option.value) === Number(pendingProgramId))
          ?.label || 'new program';

      const confirmed = await swalConfirm(
        'Shift student program?',
        `Move this student from ${oldLabel} to ${newLabel}? Only subjects that also exist in the new program will keep their grades.`,
        'Save & shift program',
        'Cancel'
      );
      if (!confirmed) return;
    }

    savingAllRef.current = true;
    setSavingAll(true);
    setSaveError('');

    const savePromises = [];
    const results = { success: 0, failed: 0, errors: [] };

    for (const key of modifiedKeys) {
      const draft = drafts[key];
      if (!draft || draft.subject_id == null || draft.subject_id === '') continue;
      if (draft.passed_via_transfer_credit) continue;

      const savePayload = manualGradeToSavePayload(draft.grade, draft.status);
      const gradeValue = savePayload.grade;
      const evaluation_status = savePayload.evaluation_status;
      const rowForKey = data.rows.find((r) => getRowKey(r) === key);
      const clearingOnly =
        gradeValue == null && evaluation_status == null && draft.evaluation_id;
      const hasValues = gradeValue != null || evaluation_status != null;
      if (!rowForKey) continue;
      const subjectChanged =
        rowForKey &&
        String(draft.subject_id ?? '') !== String(rowForKey.subject_id ?? '');
      // Allow save when clearing an existing evaluation or choosing a subject for an elective slot.
      if (!hasValues && !clearingOnly && !subjectChanged) continue;

      const mi = rowForKey != null ? data.rows.indexOf(rowForKey) : -1;
      const mergedTarget = mi >= 0 ? mergedRowsForPrereq[mi] : null;
      if (
        hasValues &&
        mergedTarget &&
        !rowPrereqsMetWithOverride(mergedRowsForPrereq, mergedTarget)
      ) {
        results.failed++;
        results.errors.push(
          'Prerequisites are not satisfied for one or more subjects; fix or clear those rows first.'
        );
        continue;
      }

      const savePromise = (async () => {
        try {
          const incPayload =
            evaluation_status === 'incomplete'
              ? {
                  inc_compliance_deadline:
                    draft.inc_compliance_deadline &&
                    String(draft.inc_compliance_deadline).trim() !== ''
                      ? String(draft.inc_compliance_deadline).slice(0, 10)
                      : null,
                }
              : {};
          if (draft.evaluation_id && !subjectChanged) {
            await api.put(`/evaluation/${draft.evaluation_id}`, {
              grade: gradeValue,
              evaluation_status,
              ...incPayload,
            });
          } else {
            // OFFSEM / Semestral takes belong to the present school year they were offered in.
            const presentAyId = data?.active_academic_year?.academic_year_id;
            const academicYearId =
              offSemesterTakeMap[key] && presentAyId ? presentAyId : draft.academic_year_id;
            await api.post('/evaluation', {
              student_id: data.student.student_id,
              subject_id: draft.subject_id,
              elective_slot_id: draft.elective_slot_id || null,
              academic_year_id: academicYearId,
              semester_id: draft.semester_id,
              grade: gradeValue,
              evaluation_status,
              ...incPayload,
            });
          }
          results.success++;
        } catch (err) {
          results.failed++;
          results.errors.push(err.response?.data?.message || 'Save failed');
        }
      })();

      savePromises.push(savePromise);
    }

    await Promise.all(savePromises);

    if (results.failed > 0) {
      savingAllRef.current = false;
      setSavingAll(false);
      setSaveError(`${results.failed} of ${modifiedKeys.size} saves failed`);
      swalError('Partial Save Failure', `${results.failed} evaluations could not be saved`);
      return;
    }

    let nameSaved = false;
    try {
      if (
        hasPendingSimNameChange &&
        isSelectedSimulation &&
        pendingSimName &&
        data?.student?.student_id
      ) {
        const first = String(pendingSimName.first_name || '').trim();
        const last = String(pendingSimName.last_name || '').trim();
        if (!first || !last) {
          savingAllRef.current = false;
          setSavingAll(false);
          await swalError('Name required', 'First name and last name are required for the simulation dummy.');
          return;
        }
        const nameRes = await api.put('/evaluation/student/simulation-dummy/profile', {
          student_id: Number(data.student.student_id),
          first_name: first,
          last_name: last,
          middle_name: String(pendingSimName.middle_name || '').trim() || null,
        });
        const nextStudent = nameRes.data?.student;
        if (nextStudent) {
          setData((prev) =>
            prev ? { ...prev, student: { ...prev.student, ...nextStudent } } : prev
          );
          setBaselineData((prev) =>
            prev ? { ...prev, student: { ...prev.student, ...nextStudent } } : prev
          );
          setSelectedStudent((prev) =>
            prev
              ? {
                  ...prev,
                  first_name: nextStudent.first_name,
                  last_name: nextStudent.last_name,
                  middle_name: nextStudent.middle_name,
                  full_name: nextStudent.full_name || prev.full_name,
                  is_simulation: true,
                }
              : prev
          );
          setPendingSimName({
            first_name: nextStudent.first_name || '',
            last_name: nextStudent.last_name || '',
            middle_name: nextStudent.middle_name || '',
          });
          await fetchStudentList(searchTerm);
        }
        nameSaved = true;
      }

      if (hasPendingProgramChange) {
        const response = await api.post('/evaluation/student/change-program', {
          student_id: data.student.student_id,
          program_id: Number(pendingProgramId),
        });
        const evaluation = response.data?.evaluation ?? response.data;
        clearLocalEvaluationDraftCache();
        applySavedEvaluation(evaluation);
        setDrafts({});
        setModifiedKeys(new Set());
        setSelectedStudent((prev) =>
          prev
            ? {
                ...prev,
                program_id: Number(pendingProgramId),
                program: evaluation?.student?.program ?? prev.program,
              }
            : prev
        );
        const sid = evaluation?.student?.student_id;
        if (sid) {
          await syncStudentToEvaluatedListIfNeeded(sid);
        }
        if (results.success > 0 || nameSaved) {
          swalToast(
            'success',
            `Saved${results.success > 0 ? ` ${results.success} evaluation(s)` : ''}${
              nameSaved ? ' + name' : ''
            } and shifted program.`
          );
        } else {
          swalToast('success', response.data?.message || 'Program updated.');
        }
      } else {
        const parts = [];
        if (results.success > 0) parts.push(`${results.success} evaluation(s)`);
        if (nameSaved) parts.push('dummy name');
        swalToast(
          'success',
          parts.length ? `Saved ${parts.join(' and ')}` : 'Nothing to save'
        );
        clearLocalEvaluationDraftCache();
        setModifiedKeys(new Set());
        const response = await api.get(
          `/evaluation/student/${encodeURIComponent(selectedStudent.student_id_number)}`
        );
        applySavedEvaluation(response.data);
        const sid = response.data?.student?.student_id;
        if (sid) {
          await syncStudentToEvaluatedListIfNeeded(sid);
        }
      }
    } catch (err) {
      await swalError(
        'Could not save changes',
        err.response?.data?.message || 'Request failed'
      );
    } finally {
      savingAllRef.current = false;
      setSavingAll(false);
    }
  };

  // Clear all drafts
  const handleClearAll = () => {
    if (!canEditEvaluationRows || !hasUnsavedChanges) return;

    const clearMessage = hasPendingProgramChange
      ? 'Reset all grades, statuses, and the pending program change to original values?'
      : 'Reset all grades and statuses to original values?';

    swalConfirm('Clear All Changes?', clearMessage, 'Clear', 'Cancel')
      .then((confirmed) => {
        if (!confirmed) return;

        setPendingProgramId(null);
        if (baselineData?.student?.is_simulation) {
          setPendingSimName({
            first_name: baselineData.student.first_name || '',
            last_name: baselineData.student.last_name || '',
            middle_name: baselineData.student.middle_name || '',
          });
        } else {
          setPendingSimName(null);
        }
        setPlacementPreviewMap({});
        setPlacementPreviewConfirmedMap({});
        setPlacementPreviewInsertSlotKey(null);
        setOffSemesterTakeMap({});
        clearLocalEvaluationDraftCache();
        if (placementPreviewStorageKey) {
          try {
            window.localStorage.removeItem(placementPreviewStorageKey);
          } catch {
            // Ignore storage failures.
          }
        }
        if (offSemesterStorageKey) {
          try {
            window.localStorage.removeItem(offSemesterStorageKey);
          } catch {
            // Ignore storage failures.
          }
        }

        const source = baselineData || data;
        if (!source?.rows) {
          setModifiedKeys(new Set());
          swalToast('success', 'All changes cleared');
          return;
        }

        // Always clone — baselineData and data often share the same reference after load,
        // so setData(baselineData) would no-op and leave dirty drafts in place.
        const restored = {
          ...source,
          rows: source.rows.map((row) => ({ ...row })),
          student: source.student ? { ...source.student } : source.student,
          summary: source.summary ? { ...source.summary } : source.summary,
        };

        const nextDrafts = {};
        restored.rows.forEach((row) => {
          const key = getRowKey(row);
          nextDrafts[key] = {
            grade: draftGradeFromRow(row),
            status: normalizeStatusForUi(row.status ?? ''),
            inc_compliance_deadline: row.inc_compliance_deadline
              ? String(row.inc_compliance_deadline).slice(0, 10)
              : '',
            subject_id: row.subject_id,
            subject_code: row.subject_code,
            subject_name: row.subject_name,
            units: row.units,
            elective_slot_id: row.elective_slot_id,
            curriculum_id: row.curriculum_id,
            academic_year_id: row.academic_year_id,
            semester_id: row.semester_id,
            evaluation_id: row.evaluation_id,
            passed_via_transfer_credit: row.passed_via_transfer_credit === true,
          };
        });

        setData(restored);
        setDrafts(nextDrafts);
        setModifiedKeys(new Set());
        setSaveError('');
        swalToast('success', 'All changes cleared');
      });
  };

  const applyElectiveTrack = useCallback(
    async (trackIdRaw) => {
      if (!data?.student?.student_id || !selectedStudent?.student_id_number) return;
      const track_id =
        trackIdRaw === '' || trackIdRaw == null ? null : Number(trackIdRaw);
      if (track_id != null && Number.isNaN(track_id)) return;
      setElectiveTrackSaving(true);
      try {
        await api.post('/evaluation/student/track', {
          student_id: data.student.student_id,
          track_id,
        });
        const res = await api.get(
          `/evaluation/student/${encodeURIComponent(selectedStudent.student_id_number)}`
        );
        applySavedEvaluation(res.data);
        setElectiveTrackPopoverKey(null);
        setElectiveTrackDrafts({});
        swalToast('success', 'Track updated — elective row will show the matching subject.');
      } catch (err) {
        await swalError('Could not update track', err.response?.data?.message || 'Request failed');
      } finally {
        setElectiveTrackSaving(false);
      }
    },
    [data?.student?.student_id, selectedStudent, applySavedEvaluation]
  );

  const handleProgramChange = useCallback(
    async (nextProgramId) => {
      if (!canEditEvaluationRows || !selectedStudent?.student_id_number) return;

      const currentId = String(savedProgramId ?? '');
      const nextId = String(nextProgramId ?? '');
      if (!nextId || nextId === currentId) {
        setPendingProgramId(null);
        if (baselineData) {
          setData(baselineData);
        }
        return;
      }

      if (modifiedKeys.size > 0) {
        const confirmed = await swalConfirm(
          'Unsaved subject changes',
          `You have ${modifiedKeys.size} unsaved subject change(s). Switch program preview anyway?`,
          'Preview program',
          'Cancel'
        );
        if (!confirmed) return;
      }

      setPendingProgramId(Number(nextId));
      setProgramPreviewLoading(true);
      setError('');
      try {
        const response = await api.get(
          `/evaluation/student/${encodeURIComponent(selectedStudent.student_id_number)}/program-preview`,
          { params: { program_id: Number(nextId) } }
        );
        setData(response.data);
      } catch (err) {
        setPendingProgramId(null);
        if (baselineData) {
          setData(baselineData);
        }
        await swalError(
          'Could not preview program',
          err.response?.data?.message || 'Request failed'
        );
      } finally {
        setProgramPreviewLoading(false);
      }
    },
    [
      canEditEvaluationRows,
      baselineData,
      modifiedKeys.size,
      savedProgramId,
      selectedStudent?.student_id_number,
    ]
  );

  const openRowSubjectEquivalence = useCallback(
    (row) => {
      if (!canManageSubjectEquivalences) return;
      const sid = row.subject_id;
      if (sid == null || sid === '') {
        swalToast(
          'warning',
          'This row is not linked to a catalog subject yet. Assign a track or elective mapping first, then map an external course.'
        );
        return;
      }
      const idNum = Number(sid);
      if (!Number.isInteger(idNum) || idNum < 1) {
        swalToast('warning', 'Invalid catalog subject on this row.');
        return;
      }
      setSubjectEquivFixedLocal({
        id: idNum,
        code: row.subject_code || '',
        name: row.subject_name || '',
        transfer_credit_other_subject_id:
          row.transfer_credit_other_subject_id ?? row.transferCreditOtherSubjectId ?? null,
      });
      setSubjectEquivModalOpen(true);
    },
    [canManageSubjectEquivalences]
  );

  const openSubjectEquivModalCatalog = useCallback(() => {
    if (!canManageSubjectEquivalences) return;
    setSubjectEquivFixedLocal(null);
    setSubjectEquivModalOpen(true);
  }, [canManageSubjectEquivalences]);

  const runPromoteNextSemester = useCallback(
    async ({
      evaluatedBy,
      trackId,
      elective4SubjectId,
      elective4Meta,
      successToast,
      silentIfAlreadyPromoted = false,
    } = {}) => {
      if (!data?.student?.student_id || !selectedStudent?.student_id_number || !nextPromotionTerm) {
        return false;
      }
      const body = {
        student_id: data.student.student_id,
        evaluated_by: String(evaluatedBy || evaluatorFullName || user?.email || '').trim(),
        target_year_level_id: Number(nextPromotionTerm.year_level_id),
        target_semester_id: Number(nextPromotionTerm.semester_id),
      };
      if (!body.evaluated_by) return false;
      if (trackId !== '' && trackId != null) {
        body.track_id = Number(trackId);
      }
      setPromoteSaving(true);
      try {
        const promoteRes = await api.post('/evaluation/student/promote-next-semester', body);

        // Persist Elective 4 free-choice subject after promotion (SysDev/Cyber/BAM).
        if (elective4SubjectId && elective4Meta?.electiveSlotId) {
          try {
            await api.post('/evaluation', {
              student_id: data.student.student_id,
              subject_id: Number(elective4SubjectId),
              elective_slot_id: Number(elective4Meta.electiveSlotId),
              academic_year_id: elective4Meta.academicYearId || data?.student?.academic_year_id,
              semester_id: Number(elective4Meta.semesterId || nextPromotionTerm.semester_id),
              grade: null,
              evaluation_status: null,
            });
          } catch (electiveErr) {
            // Promotion already saved; surface elective pick failure without rolling back.
            const em =
              electiveErr.response?.data?.message ||
              electiveErr.message ||
              'Could not save Elective 4 subject';
            swalToast('warning', String(em));
          }
        }

        const res = await api.get(
          `/evaluation/student/${encodeURIComponent(selectedStudent.student_id_number)}`
        );
        applySavedEvaluation(res.data);
        setPromoteModalOpen(false);
        await fetchStudentList(searchTerm);
        const alreadyStored = promoteRes?.data?.already_stored === true;
        if (alreadyStored) {
          if (!silentIfAlreadyPromoted) {
            swalToast('info', 'Already promoted — standing refreshed to that year/semester.');
          }
        } else {
          swalToast('success', successToast || 'Promotion saved and logged for Evaluated students.');
        }
        return true;
      } catch (err) {
        const msg = String(err.response?.data?.message || err.message || 'Request failed');
        const alreadyStored = /already stored in your evaluated students/i.test(msg);
        if (alreadyStored) {
          try {
            const res = await api.get(
              `/evaluation/student/${encodeURIComponent(selectedStudent.student_id_number)}`
            );
            applySavedEvaluation(res.data);
          } catch {
            // ignore refresh failure
          }
          setPromoteModalOpen(false);
          if (!silentIfAlreadyPromoted) {
            swalToast('info', 'Already promoted for this target — standing refreshed.');
          }
          return true;
        }
        await swalError('Could not save promotion', msg);
        return false;
      } finally {
        setPromoteSaving(false);
      }
    },
    [
      data?.student?.student_id,
      data?.student?.academic_year_id,
      nextPromotionTerm,
      selectedStudent,
      user?.email,
      evaluatorFullName,
      fetchStudentList,
      searchTerm,
      applySavedEvaluation,
    ]
  );

  const openPromoteModal = useCallback(() => {
    // Guide mode: allow opening the promotion preview even when the practice
    // student has blank grades / still looks Regular (nothing is saved).
    if (!systemGuideOpen && !currentTermCompleteForPromotion) {
      void swalInfo(
        'Current term not ready to promote',
        'Record an outcome for every subject the student actually took this standing. Subjects with no grade (not taken — e.g. Programming 2 saved for summer or next year) do not block promotion. Save unsaved grade changes first.'
      );
      return;
    }
    if (!nextPromotionTerm) {
      void swalInfo(
        'No next semester',
        'There is no later term in this curriculum after the year and semester you are viewing.'
      );
      return;
    }
    const alreadyAtTarget =
      data?.student?.promoted_next_sem_at &&
      String(data?.student?.promotion_target_year_level_id ?? '') ===
        String(nextPromotionTerm.year_level_id) &&
      String(data?.student?.promotion_target_semester_id ?? '') ===
        String(nextPromotionTerm.semester_id);
    if (alreadyAtTarget && !systemGuideOpen) {
      // Re-post: backend refreshes standing to the target without duplicating the log.
      void runPromoteNextSemester({
        evaluatedBy: evaluatorFullName || String(user?.email || '').trim() || 'Staff',
        trackId: data?.student?.track_id,
        silentIfAlreadyPromoted: false,
      });
      return;
    }
    setPromoteEvaluatedBy(evaluatorFullName || String(user?.email || '').trim());
    setPromoteModalTrackId(
      data?.student?.track_id != null && data.student.track_id !== ''
        ? String(data.student.track_id)
        : ''
    );
    setPromoteModalElective4SubjectId('');
    setPromoteModalOpen(true);
  }, [
    currentTermCompleteForPromotion,
    systemGuideOpen,
    nextPromotionTerm,
    user?.email,
    evaluatorFullName,
    data?.student?.track_id,
    data?.student?.promoted_next_sem_at,
    data?.student?.promotion_target_year_level_id,
    data?.student?.promotion_target_semester_id,
    runPromoteNextSemester,
  ]);

  const handlePromoteSave = useCallback(async () => {
    if (systemGuideOpen) {
      setGuidePromotionPreviewSaved(true);
      setPromoteModalOpen(false);
      await swalInfo(
        'Guide preview complete',
        'The sample promotion was not saved and the student standing was not changed.'
      );
      return;
    }
    if (
      promotionTrackPickRequired &&
      (!promoteModalTrackId || String(promoteModalTrackId).trim() === '')
    ) {
      await swalError(
        'Track required',
        'This term includes a track-based elective. Choose the student’s track before saving promotion.'
      );
      return;
    }
    const elective4Row = promotionTableRows.find((r) => r.isElectiveFour);
    await runPromoteNextSemester({
      evaluatedBy: promoteEvaluatedBy,
      trackId: promoteModalTrackId,
      elective4SubjectId: promoteModalElective4SubjectId || null,
      elective4Meta: elective4Row
        ? {
            electiveSlotId: elective4Row.electiveSlotId,
            semesterId: elective4Row.semesterId,
            academicYearId: elective4Row.academicYearId,
          }
        : null,
    });
  }, [
    systemGuideOpen,
    promotionTrackPickRequired,
    promoteModalTrackId,
    promoteModalElective4SubjectId,
    promoteEvaluatedBy,
    promotionTableRows,
    runPromoteNextSemester,
  ]);

  // TEMP: auto-promotion disabled — use manual "Promote to next semester" only.
  // Regular students: auto-promote when the current standing is complete.
  // Irregular students stay on manual "Promote to next semester".
  // useEffect(() => {
  //   if (!canEdit || isEvaluatedModule || !isRegularStudent) return;
  //   if (!currentTermCompleteForPromotion || !nextPromotionTerm) return;
  //   if (hasUnsavedChanges || savingAll || promoteSaving || standingSaving) return;
  //   if (promotionTrackPickRequired) return;
  //   // Already promoted this cycle — never re-post (avoids the "already stored" popup).
  //   if (data?.student?.promoted_next_sem_at) return;
  //
  //   const studentId = data?.student?.student_id;
  //   if (!studentId || !selectedStudent?.student_id_number) return;
  //
  //   const targetY = String(nextPromotionTerm.year_level_id);
  //   const targetS = String(nextPromotionTerm.semester_id);
  //   const alreadyAtTarget =
  //     String(data?.student?.year_level_id ?? '') === targetY &&
  //     String(data?.student?.semester_id ?? '') === targetS;
  //   if (alreadyAtTarget) return;
  //
  //   const attemptKey = `${studentId}:${targetY}:${targetS}`;
  //   if (autoPromoteAttemptRef.current === attemptKey) return;
  //   autoPromoteAttemptRef.current = attemptKey;
  //
  //   void runPromoteNextSemester({
  //     evaluatedBy: user?.email,
  //     trackId: data?.student?.track_id,
  //     successToast: 'Regular student auto-promoted to the next semester.',
  //     silentIfAlreadyPromoted: true,
  //   }).then((ok) => {
  //     if (!ok && autoPromoteAttemptRef.current === attemptKey) {
  //       autoPromoteAttemptRef.current = '';
  //     }
  //   });
  // }, [
  //   canEdit,
  //   isEvaluatedModule,
  //   isRegularStudent,
  //   currentTermCompleteForPromotion,
  //   nextPromotionTerm,
  //   hasUnsavedChanges,
  //   savingAll,
  //   promoteSaving,
  //   standingSaving,
  //   promotionTrackPickRequired,
  //   data?.student?.student_id,
  //   data?.student?.year_level_id,
  //   data?.student?.semester_id,
  //   data?.student?.promoted_next_sem_at,
  //   data?.student?.track_id,
  //   selectedStudent?.student_id_number,
  //   user?.email,
  //   runPromoteNextSemester,
  // ]);

  // Reset auto-promote / offsem migration guards when switching students.
  useEffect(() => {
    autoPromoteAttemptRef.current = '';
    offsemMigratedRef.current = '';
  }, [data?.student?.student_id]);

  const handleDownloadEvaluation = useCallback(() => {
    if (!data?.student || !Array.isArray(data.rows) || data.rows.length === 0) {
      swalToast('info', 'Select a student with curriculum rows first.');
      return;
    }
    setDownloadScope('all');
    setDownloadSelectedTermKeys(downloadTermOptions.map((option) => option.key));
    setDownloadModalStep('options');
    setDownloadPreviewHtml('');
    setDownloadModalOpen(true);
  }, [data?.rows, data?.student, downloadTermOptions]);

  const buildDownloadReportPayload = useCallback(() => {
    if (!data?.student || !Array.isArray(data.rows) || data.rows.length === 0) {
      return { error: 'Select a student with curriculum rows first.' };
    }

    const student = data.student;
    const studentName =
      student.full_name ||
      [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ') ||
      selectedStudent?.full_name ||
      'Student';
    const studentNumber =
      student.student_id_number || selectedStudent?.student_id_number || 'N/A';
    const programLabel =
      student.program?.program_name ||
      student.program?.program_code ||
      selectedStudent?.program?.program_name ||
      selectedStudent?.program_name ||
      'N/A';
    const trackLabel = student.track?.track_name || student.track?.track_code || 'Not assigned';
    const generatedAt = new Date().toLocaleString();
    const allTermKeys = downloadTermOptions.map((option) => option.key);
    let selectedKeys = allTermKeys;
    if (downloadScope === 'current') {
      selectedKeys = currentDownloadTermKey ? [currentDownloadTermKey] : [];
    } else if (downloadScope === 'specific') {
      selectedKeys = downloadSelectedTermKeys;
    }
    const selectedKeySet = new Set(selectedKeys);
    const selectedLabel =
      downloadScope === 'all'
        ? 'All terms'
        : selectedKeys
            .map((key) => downloadTermOptions.find((option) => option.key === key)?.label)
            .filter(Boolean)
            .join(', ') || 'No selected terms';

    const rows = data.rows
      .map((row) => mergeEvalRowWithDrafts(row, drafts, getEvaluationRowKey))
      .filter((row) => selectedKeySet.has(evaluationTermKeyFromRow(row)))
      .sort((a, b) => {
        const termCmp =
          evalTermSortKey(a.year_level_id, a.semester_id, a.semester_name) -
          evalTermSortKey(b.year_level_id, b.semester_id, b.semester_name);
        if (termCmp !== 0) return termCmp;
        return Number(a.curriculum_id ?? 0) - Number(b.curriculum_id ?? 0);
      });

    if (rows.length === 0) {
      return { error: 'No curriculum rows found for the selected download option.' };
    }

    const grouped = rows.reduce((acc, row) => {
      const key = evaluationTermKeyFromRow(row);
      if (!acc.has(key)) {
        const yearLabel = String(row.year_level_name || `Year ${row.year_level_id || ''}`).trim();
        const semLabel = String(row.semester_name || `Semester ${row.semester_id || ''}`).trim();
        acc.set(key, {
          key,
          year_level_id: row.year_level_id,
          semester_id: row.semester_id,
          semester_name: row.semester_name,
          year_level_name: yearLabel,
          label: `${yearLabel} — ${semLabel}`,
          rows: [],
        });
      }
      acc.get(key).rows.push(row);
      return acc;
    }, new Map());

    // 1st year → 1st sem, 2nd sem (then summer) → 2nd year → …
    const orderedGroups = [...grouped.values()].sort(
      (a, b) =>
        evalTermSortKey(a.year_level_id, a.semester_id, a.semester_name) -
        evalTermSortKey(b.year_level_id, b.semester_id, b.semester_name)
    );

    const yearBuckets = [];
    for (const group of orderedGroups) {
      const yearKey = String(group.year_level_id ?? group.year_level_name);
      const last = yearBuckets[yearBuckets.length - 1];
      if (!last || last.yearKey !== yearKey) {
        yearBuckets.push({
          yearKey,
          yearTitle: String(group.year_level_name || `Year ${group.year_level_id || ''}`).toUpperCase(),
          groups: [group],
        });
      } else {
        last.groups.push(group);
      }
    }

    // Portrait: each year row = 1st sem | 2nd sem side by side; summer optional below.
    const termBlocks = yearBuckets
      .map((year) => {
        const first = year.groups.find(
          (g) => getEvalSemesterKind(g.semester_id, g.semester_name) === 'first'
        );
        const second = year.groups.find(
          (g) => getEvalSemesterKind(g.semester_id, g.semester_name) === 'second'
        );
        const summer = year.groups.find(
          (g) => getEvalSemesterKind(g.semester_id, g.semester_name) === 'summer'
        );
        const other = year.groups.filter((g) => {
          const kind = getEvalSemesterKind(g.semester_id, g.semester_name);
          return kind !== 'first' && kind !== 'second' && kind !== 'summer';
        });

        const hasRegularSems = Boolean(first || second);
        const semGridHtml = hasRegularSems
          ? `<div class="eval-pdf-sem-grid">
              ${buildEvalPdfSemesterTableHtml(first)}
              ${buildEvalPdfSemesterTableHtml(second)}
            </div>`
          : '';
        const summerHtml = summer
          ? `<div class="eval-pdf-summer">${buildEvalPdfSemesterTableHtml(summer, { compact: false })}</div>`
          : '';
        const otherHtml = other
          .map(
            (g) =>
              `<div class="eval-pdf-summer">${buildEvalPdfSemesterTableHtml(g, { compact: false })}</div>`
          )
          .join('');

        return `
          <section class="eval-pdf-page-chunk eval-pdf-year-row">
            <div class="eval-pdf-year__title">${htmlEscape(year.yearTitle)}</div>
            ${semGridHtml}
            ${summerHtml}
            ${otherHtml}
          </section>
        `;
      })
      .join('');

    const html = buildStaffEvaluationReportHtml({
      studentName,
      studentNumber,
      programLabel,
      trackLabel,
      academicStatus: data.computed_academic_status || student.academic_status || 'N/A',
      studentEntryType: student.student_entry_type || '',
      selectedLabel,
      summary: data.summary,
      termBlocks,
      generatedBy: user?.email || 'N/A',
      generatedAt,
    });

    const scopeSuffix =
      downloadScope === 'all'
        ? 'all'
        : downloadScope === 'current'
          ? 'current-term'
          : 'selected-terms';
    const filename = `${safeDownloadName(`${studentNumber}-${studentName}`)}-evaluation-${scopeSuffix}.pdf`;

    return { html, filename, studentName, studentNumber };
  }, [
    currentDownloadTermKey,
    data,
    downloadScope,
    downloadSelectedTermKeys,
    downloadTermOptions,
    drafts,
    selectedStudent,
    user?.email,
  ]);

  const handlePreviewEvaluationDownload = useCallback(() => {
    const payload = buildDownloadReportPayload();
    if (payload.error) {
      swalToast('info', payload.error);
      return;
    }
    setDownloadPreviewHtml(payload.html);
    setDownloadModalStep('preview');
  }, [buildDownloadReportPayload]);

  const handleDownloadEvaluationPdf = useCallback(async () => {
    const payload = buildDownloadReportPayload();
    if (payload.error) {
      swalToast('info', payload.error);
      return;
    }

    setDownloadingPdf(true);
    try {
      await downloadBwHtmlAsPdf(payload.html, {
        filename: payload.filename,
        widthPx: 794,
        scale: 1.4,
        orientation: 'portrait',
        jpegQuality: 0.7,
        sectionSelector: '.eval-pdf-page-chunk',
      });
      setDownloadModalOpen(false);
      setDownloadModalStep('options');
      setDownloadPreviewHtml('');
      swalToast('success', 'Student evaluation PDF downloaded (portrait, black & white).');
    } catch (err) {
      await swalError('Could not create PDF', err?.message || 'Unknown error');
    } finally {
      setDownloadingPdf(false);
    }
  }, [buildDownloadReportPayload]);

  /** ST-403: spreadsheet export (CSV opens in Excel). */
  const handleDownloadEvaluationCsv = useCallback(() => {
    if (!data?.student || !Array.isArray(data.rows) || data.rows.length === 0) {
      swalToast('info', 'Select a student with curriculum rows first.');
      return;
    }

    const student = data.student;
    const studentName =
      student.full_name ||
      [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ') ||
      selectedStudent?.full_name ||
      'Student';
    const studentNumber =
      student.student_id_number || selectedStudent?.student_id_number || 'N/A';
    const programLabel =
      student.program?.program_name ||
      student.program?.program_code ||
      selectedStudent?.program?.program_name ||
      selectedStudent?.program_name ||
      'N/A';
    const trackLabel = student.track?.track_name || student.track?.track_code || 'Not assigned';
    const allTermKeys = downloadTermOptions.map((option) => option.key);
    let selectedKeys = allTermKeys;
    if (downloadScope === 'current') {
      selectedKeys = currentDownloadTermKey ? [currentDownloadTermKey] : [];
    } else if (downloadScope === 'specific') {
      selectedKeys = downloadSelectedTermKeys;
    }
    const selectedKeySet = new Set(selectedKeys);

    const rows = data.rows
      .map((row) => mergeEvalRowWithDrafts(row, drafts, getEvaluationRowKey))
      .filter((row) => selectedKeySet.has(evaluationTermKeyFromRow(row)))
      .sort((a, b) => {
        const ay = Number(a.year_level_id ?? 0);
        const by = Number(b.year_level_id ?? 0);
        if (ay !== by) return ay - by;
        const sem =
          semesterSortValue(a.semester_id, a.semester_name) -
          semesterSortValue(b.semester_id, b.semester_name);
        if (sem !== 0) return sem;
        return Number(a.curriculum_id ?? 0) - Number(b.curriculum_id ?? 0);
      });

    if (rows.length === 0) {
      swalToast('info', 'No curriculum rows found for the selected download option.');
      return;
    }

    const csvEscape = (value) => {
      const s = String(value ?? '');
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const meta = [
      ['Report', 'Student Evaluation'],
      ['Student Name', studentName],
      ['Student ID Number', studentNumber],
      ['Program', programLabel],
      ['Track', trackLabel],
      ['Academic Status', data.computed_academic_status || student.academic_status || 'N/A'],
      ['Curriculum Units', data.summary?.total_units_in_curriculum ?? 0],
      ['Earned', data.summary?.total_units_earned ?? 0],
      ['Remaining', data.summary?.lacking_units ?? 0],
      ['Generated At', new Date().toLocaleString()],
      ['Generated By', user?.email || 'N/A'],
      [],
      [
        'Year Level',
        'Semester',
        'Subject Code',
        'Subject Title',
        'Units',
        'Grade',
        'Status',
      ],
    ];

    const body = rows.map((row) => {
      const transferCredit = isTransferCreditRow(row);
      const grade = transferCredit ? '-' : formatEvalGradeReadonly(row.grade, row) || '-';
      const status = transferCredit ? 'Credited' : normalizeStatusForUi(row.status ?? '') || '-';
      return [
        row.year_level_name || `Year ${row.year_level_id || ''}`,
        row.semester_name || `Semester ${row.semester_id || ''}`,
        row.subject_code || '-',
        row.subject_name || '-',
        row.units ?? 0,
        grade,
        status,
      ];
    });

    setDownloadingCsv(true);
    try {
      const lines = [...meta, ...body].map((cols) =>
        Array.isArray(cols) ? cols.map(csvEscape).join(',') : ''
      );
      const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const scopeSuffix =
        downloadScope === 'all'
          ? 'all'
          : downloadScope === 'current'
            ? 'current-term'
            : 'selected-terms';
      link.href = url;
      link.download = `${safeDownloadName(`${studentNumber}-${studentName}`)}-evaluation-${scopeSuffix}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloadModalOpen(false);
      swalToast('success', 'Student evaluation CSV downloaded (opens in Excel).');
    } catch (err) {
      swalError('Could not create CSV', err?.message || 'Unknown error');
    } finally {
      setDownloadingCsv(false);
    }
  }, [
    currentDownloadTermKey,
    data,
    downloadScope,
    downloadSelectedTermKeys,
    downloadTermOptions,
    drafts,
    selectedStudent,
    user?.email,
  ]);

  const toggleDownloadTermKey = useCallback((termKey) => {
    setDownloadSelectedTermKeys((prev) =>
      prev.includes(termKey)
        ? prev.filter((key) => key !== termKey)
        : [...prev, termKey]
    );
  }, []);

  const currentDownloadTermLabel = useMemo(() => {
    return downloadTermOptions.find((option) => option.key === currentDownloadTermKey)?.label || '';
  }, [currentDownloadTermKey, downloadTermOptions]);

  const selectedDownloadCount =
    downloadScope === 'all'
      ? downloadTermOptions.length
      : downloadScope === 'current'
        ? currentDownloadTermLabel
          ? 1
          : 0
        : downloadSelectedTermKeys.length;

  const renderStudentHero = () => {
    if (!data) return null;

    const { student } = data;
    const summary = previewSummary;
    const computed = data?.computed_academic_status;
    const enrolledStatus = student?.academic_status?.trim() || '';
    const displayStatus = (computed || enrolledStatus || '—').trim();
    const entryType = String(student?.student_entry_type || '').trim();
    const statusTitleParts = [];
    if (computed && enrolledStatus && computed !== enrolledStatus) {
      statusTitleParts.push(`Profile: ${enrolledStatus}. Curriculum evaluation: ${computed}.`);
    }
    if (entryType) {
      statusTitleParts.push(`Student type: ${entryType} (set at account creation).`);
    }
    const statusTitle = statusTitleParts.length ? statusTitleParts.join(' ') : undefined;
    const fullName =
      student?.full_name ||
      `${student?.last_name || ''}, ${student?.first_name || ''} ${student?.middle_name || ''}`.trim();
    const canEditSimName =
      canManageSimulationDummy && !!(student?.is_simulation || selectedStudent?.is_simulation);
    const simName = pendingSimName || {
      first_name: student?.first_name || '',
      last_name: student?.last_name || '',
      middle_name: student?.middle_name || '',
    };
    const displaySimFullName = `${simName.last_name || ''}, ${simName.first_name || ''}${
      simName.middle_name ? ` ${simName.middle_name}` : ''
    }`.trim();

    const programCode = student?.program?.program_code || student?.program_code || '';
    const programName = student?.program?.program_name || student?.program_name || '';
    const degree = programName || programCode || '—';
    const pendingProgramLabel = hasPendingProgramChange
      ? programOptions.find((option) => Number(option.value) === Number(pendingProgramId))?.label
      : null;
    const displayDegree = pendingProgramLabel || degree;
    const previousProgramName =
      student?.previous_program?.program_name ||
      student?.previous_program?.program_code ||
      '';
    const isItProgram =
      /\bBSIT\b/i.test(programCode) ||
      /^IT$/i.test(String(programCode).trim()) ||
      /information\s+technology/i.test(programName);

    const trackLine = student?.track
      ? `${student.track.track_name || 'Track'}${student.track.track_code ? ` (${student.track.track_code})` : ''}`
      : null;

    const isPromotedNextSem = (() => {
      if (!student?.promoted_next_sem_at) return false;
      const targetY = student.promotion_target_year_level_id;
      const targetS = student.promotion_target_semester_id;
      if (targetY == null || targetS == null) return false;
      const terms = orderedCurriculumTerms;
      const targetIdx = terms.findIndex(
        (t) =>
          String(t.year_level_id) === String(targetY) &&
          String(t.semester_id) === String(targetS)
      );
      if (targetIdx < 1) return false;
      const prev = terms[targetIdx - 1];
      const deferredKeys = Array.isArray(student.standing_deferred_keys)
        ? student.standing_deferred_keys
        : [];
      // Badge only if the previous term actually has recorded outcomes.
      return isCurriculumTermReadyToAdvance(
        data?.rows,
        prev.year_level_id,
        prev.semester_id,
        deferredKeys
      );
    })();

    const selectedIdNumber = selectedStudent?.student_id_number || student?.student_id_number || '';
    const isIrregularStatus = /^irregular$/i.test(displayStatus);
    const evaluatedByLabel = String(student?.promotion_evaluated_by || '').trim();
    const promotedAtRaw = student?.promoted_next_sem_at;
    let promotedAtLabel = '';
    if (promotedAtRaw) {
      const dt = new Date(promotedAtRaw);
      if (!Number.isNaN(dt.getTime())) {
        promotedAtLabel = dt.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      }
    }
    const promotionTargetLabel = (() => {
      const targetY = student?.promotion_target_year_level_id;
      const targetS = student?.promotion_target_semester_id;
      if (targetY == null || targetS == null) return '';
      // Show next term whenever a promotion target exists (not only when badge logic passes).
      if (!promotedAtRaw && !isPromotedNextSem) return '';
      const term = orderedCurriculumTerms.find(
        (t) =>
          String(t.year_level_id) === String(targetY) &&
          String(t.semester_id) === String(targetS)
      );
      if (!term) return '';
      return [term.year_level_name, term.semester_name].filter(Boolean).join(' · ');
    })();
    // Always show the button when editing; Regulars see it disabled (manual promote is irregular-only).
    const showPromoteAction = canEdit && canPromoteStudents && selectedStudent && !isEvaluatedModule;
    const promoteDisabledForRegular = isRegularStudent && !systemGuideOpen;

    return (
      <div
        className={`eval-hero eval-hero--result-card${
          isPromotedNextSem ? ' eval-hero--promoted' : ''
        }${isIrregularStatus ? ' eval-hero--irregular' : ''}`}
        data-tour="evaluation-summary"
      >
        <div className="eval-hero__banner">
          <div className="eval-hero__banner-left">
            {isPromotedNextSem ? (
              <div className="eval-hero__promotion-badge" role="status">
                <span className="eval-hero__promotion-check" aria-hidden>
                  <i className="fa-solid fa-check" />
                </span>
                <span>Promoted for the next sem</span>
              </div>
            ) : (
              <div className="eval-hero__banner-title">Curriculum evaluation</div>
            )}
          </div>
          <div className="eval-hero__status-capsule" title={statusTitle}>
            <span className="eval-hero__status-capsule-label">Status</span>
            <span
              className={`eval-hero__status-capsule-value${
                isIrregularStatus ? ' eval-hero__status-capsule-value--irregular' : ''
              }`}
            >
              {displayStatus || '—'}
            </span>
          </div>
        </div>

        <div className="eval-hero__body">
          <div className="eval-hero__student-card">
            <div className="eval-hero__name-row">
              {canEditSimName ? (
                <div className="eval-hero__sim-name-edit">
                  <input
                    className="eval-hero__sim-name-input"
                    value={simName.last_name}
                    onChange={(e) =>
                      setPendingSimName((prev) => ({
                        ...(prev || simName),
                        last_name: e.target.value,
                      }))
                    }
                    placeholder="Last name"
                    aria-label="Simulation last name"
                    disabled={savingAll}
                  />
                  <span className="eval-hero__sim-name-comma">,</span>
                  <input
                    className="eval-hero__sim-name-input"
                    value={simName.first_name}
                    onChange={(e) =>
                      setPendingSimName((prev) => ({
                        ...(prev || simName),
                        first_name: e.target.value,
                      }))
                    }
                    placeholder="First name"
                    aria-label="Simulation first name"
                    disabled={savingAll}
                  />
                  <input
                    className="eval-hero__sim-name-input eval-hero__sim-name-input--middle"
                    value={simName.middle_name}
                    onChange={(e) =>
                      setPendingSimName((prev) => ({
                        ...(prev || simName),
                        middle_name: e.target.value,
                      }))
                    }
                    placeholder="MI (optional)"
                    aria-label="Simulation middle name"
                    disabled={savingAll}
                  />
                  {hasPendingSimNameChange ? (
                    <span
                      className="eval-hero__sim-name-dirty"
                      title="Click Save All Changes to store this name"
                    >
                      unsaved name
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="eval-hero__name">{fullName || 'N/A'}</div>
              )}
              {student?.is_simulation || selectedStudent?.is_simulation ? (
                <span
                  className="eval-hero__sim-pill"
                  title={`Practice account${
                    displaySimFullName ? `: ${displaySimFullName}` : ''
                  } — edit name then Save All Changes`}
                  aria-label={`Simulation practice account${
                    displaySimFullName ? ` for ${displaySimFullName}` : ''
                  }`}
                >
                  SIM
                </span>
              ) : null}
              <button
                type="button"
                className="eval-hero__name-link"
                onClick={() => {
                  if (!selectedIdNumber) return;
                  const url = `/dean/student-records/${encodeURIComponent(String(selectedIdNumber))}`;
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                title="Open full student records in a new tab"
              >
                Curriculum / Evaluation
              </button>
            </div>
            <div
              className={`eval-hero__degree${
                hasPendingProgramChange ? ' eval-hero__degree--pending' : ''
              }`}
            >
              {displayDegree}
              {hasPendingProgramChange ? (
                <span className="eval-unsaved-program-tag">unsaved shift</span>
              ) : null}
            </div>
            {previousProgramName ? (
              <div className="eval-hero__previous-program">
                Previous program: <strong>{previousProgramName}</strong>
              </div>
            ) : null}
            {isItProgram ? (
              trackLine ? (
                <div className="eval-hero__track">
                  Track: <strong>{trackLine}</strong>
                </div>
              ) : (
                <div className="eval-hero__track eval-hero__track--none">
                  Track: <em>not set — assign for track-based electives (e.g. IT Electives 1)</em>
                </div>
              )
            ) : null}
          </div>

          <div className="eval-hero__aside">
            <button
              type="button"
              className="eval-hero__title-pill eval-hero__download-btn"
              onClick={handleDownloadEvaluation}
              disabled={!selectedStudent || !data?.rows?.length}
              title="Download this student's evaluation as PDF or Excel/CSV"
            >
              Download Evaluation
            </button>
            {showPromoteAction ? (
              <button
                type="button"
                className="eval-hero__promote-btn"
                data-tour="promote-student"
                onClick={openPromoteModal}
                disabled={
                  promoteDisabledForRegular || !canOpenPromoteModal || promoteSaving
                }
                title={
                  promoteDisabledForRegular
                    ? 'Regular students cannot be promoted manually — use standing / auto-promote.'
                    : systemGuideOpen
                      ? 'Guide preview: open promotion without saving (works even if the practice student still looks Regular or has blank grades).'
                      : isRegularStudent && promotionTrackPickRequired
                        ? 'Assign a track first, then promote (required for track-based electives).'
                        : !currentTermCompleteForPromotion
                          ? 'Complete recorded subjects this standing. Untaken subjects (no grade) can be taken later (summer / next year) and do not block promotion.'
                          : !nextPromotionTerm
                            ? 'No next term in the curriculum after this year/semester.'
                            : 'Irregular students must be promoted manually'
                }
              >
                Promote to next semester
              </button>
            ) : (
              <div className="eval-hero__aside-slot" aria-hidden={!promotedAtLabel}>
                {promotedAtLabel ? (
                  <>
                    <span className="eval-hero__aside-slot-label">Promoted on</span>
                    <span className="eval-hero__aside-slot-value">{promotedAtLabel}</span>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="eval-hero__staff-line">
          <span>
            <span className="eval-hero__staff-line-label">Evaluated by</span>{' '}
            <strong>
              {evaluatedByLabel || (promotedAtLabel || isPromotedNextSem ? '—' : 'Not evaluated yet')}
            </strong>
          </span>
          <span className="eval-hero__staff-line-sep" aria-hidden>
            ·
          </span>
          <span
            title={`From earned units (${summary?.total_units_earned ?? 0}): 46→2nd, 94→3rd, 132→4th`}
          >
            <span className="eval-hero__staff-line-label">Standing</span>{' '}
            <strong>
              {`${ordinalYearLabel(
                yearStandingFromEarnedUnits(summary?.total_units_earned)
              )} year`}
            </strong>
          </span>
          {promotionTargetLabel ? (
            <>
              <span className="eval-hero__staff-line-sep" aria-hidden>
                ·
              </span>
              <span>
                <span className="eval-hero__staff-line-label">Next term</span>{' '}
                <strong>{promotionTargetLabel}</strong>
              </span>
            </>
          ) : promotedAtLabel ? (
            <>
              <span className="eval-hero__staff-line-sep" aria-hidden>
                ·
              </span>
              <span>
                <span className="eval-hero__staff-line-label">Promoted on</span>{' '}
                <strong>{promotedAtLabel}</strong>
              </span>
            </>
          ) : null}
        </div>

        <div className="eval-hero__meta-row">
          <div className="eval-hero__meta-box">
            <span className="eval-hero__meta-label">Curriculum units</span>
            <span className="eval-hero__meta-value">
              {summary?.total_units_in_curriculum ?? 0}
            </span>
          </div>
          <div className="eval-hero__meta-box">
            <span className="eval-hero__meta-label">Earned</span>
            <span className="eval-hero__meta-value">{summary?.total_units_earned ?? 0}</span>
          </div>
          <div className="eval-hero__meta-box">
            <span className="eval-hero__meta-label">Remaining</span>
            <span
              className={`eval-hero__meta-value${
                summary?.lacking_units > 0 ? ' eval-hero__meta-value--alert' : ''
              }`}
            >
              {summary?.lacking_units ?? 0}
            </span>
          </div>
        </div>

        {(savedTermLoadSummary || isIrregularStudent) && (
          <div
            className={`eval-hero__flag${
              isIrregularStudent && !savedTermLoadSummary ? ' eval-hero__flag--hint' : ''
            }`}
            role="status"
          >
            {savedTermLoadSummary ? (
              <span
                title={
                  savedTermLoadSummary.codes.length
                    ? `This term load: ${savedTermLoadSummary.codes.join(', ')}`
                    : 'Saved subjects-to-take load plan'
                }
              >
                This term load:{' '}
                <strong>
                  {savedTermLoadSummary.takeCount} subject
                  {savedTermLoadSummary.takeCount === 1 ? '' : 's'}
                </strong>
                {savedTermLoadSummary.priorCount > 0
                  ? ` · ${savedTermLoadSummary.priorCount} backlog`
                  : ''}
                {isIrregularStudent ? ' · Irregular pick' : ''}
              </span>
            ) : (
              <span>
                Irregular: open <strong>Subject placement</strong> to pick this term’s load
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderFilterRail = () => {
    if (!data || !selectedStudent || !data.rows?.length) return null;
    const { curricula, programLabel } = evaluationFilterOptions;
    const years = yearsAllowedForFilter.length ? yearsAllowedForFilter : evaluationFilterOptions.years;
    const currentYearLabel =
      years.find((y) => String(y.id) === String(evalFilterYearId))?.label || '—';
    const currentSemLabel =
      semesterOptionsForYear.find((s) => String(s.id) === String(evalFilterSemesterId))
        ?.label || '—';
    const curriculumEffectiveLabel = data?.curriculum?.label || curricula[0]?.label || null;
    const schoolYearLabel = standingSchoolYearLabel || curriculumEffectiveLabel;
    const standingBanner = [schoolYearLabel, currentYearLabel, currentSemLabel]
      .filter((part) => part && part !== '—')
      .join(' — ');

    return (
      <>
        <div
          className="eval-filter-rail"
          role="toolbar"
          aria-label="Curriculum filters"
          data-tour="evaluation-standing"
        >
          <label className="eval-filter-field">
            <i className="fa-regular fa-calendar eval-filter-field__icon" aria-hidden />
            <span className="eval-filter-field__label">Curriculum</span>
            <select
              className="eval-filter-field__control"
              value={evalFilterCurriculumId}
              onChange={(e) => setEvalFilterCurriculumId(e.target.value)}
              disabled={curricula.length <= 1}
              title={
                curriculumEffectiveLabel
                  ? `Curriculum Effective SY ${curriculumEffectiveLabel} (subject map for this student)`
                  : 'Student curriculum'
              }
            >
              {curricula.length === 0 ? (
                <option value="">—</option>
              ) : (
                curricula.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="eval-filter-field eval-filter-field--program">
            <i className="fa-solid fa-graduation-cap eval-filter-field__icon" aria-hidden />
            <span className="eval-filter-field__label">Program</span>
            {canEditEvaluationRows ? (
              <SearchableSelect
                id="eval-program-select"
                value={String(displayProgramId ?? '')}
                onChange={handleProgramChange}
                options={programOptions}
                emptyLabel="Select program"
                placeholder="Search program..."
                className={`eval-filter-program-select${
                  hasPendingProgramChange ? ' eval-filter-program-select--pending' : ''
                }`}
                disabled={programOptions.length === 0 || savingAll || programPreviewLoading}
                aria-label="Program"
              />
            ) : (
              <select className="eval-filter-field__control" value="" disabled title={programLabel}>
                <option value="">{programLabel}</option>
              </select>
            )}
          </label>
          <label className="eval-filter-field">
            <i className="fa-regular fa-clock eval-filter-field__icon" aria-hidden />
            <span className="eval-filter-field__label">Year</span>
            <select
              className="eval-filter-field__control"
              value={evalFilterYearId}
              disabled={!canAlterIrregularStanding || standingSaving}
              onChange={(e) => {
                if (!canAlterIrregularStanding) return;
                void applyIrregularStandingChange(e.target.value, '');
              }}
              title={
                canAlterIrregularStanding
                  ? 'Irregular only: Dean / Program Head can promote or demote by changing Year'
                  : activeSemesterStandingTerm
                    ? `Standing: ${activeSemesterStandingTerm.year_level_name || ''} ${
                        activeSemesterStandingTerm.semester_name || ''
                      }`.trim() +
                      (data?.student?.promoted_next_sem_at
                        ? ' (from promotion)'
                        : ` · earned units ${data?.summary?.total_units_earned ?? 0}`)
                    : `Calculated from earned units (${data?.summary?.total_units_earned ?? 0}): 46→2nd, 94→3rd, 132→4th`
              }
            >
              {years.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="eval-filter-field">
            <i className="fa-regular fa-bookmark eval-filter-field__icon" aria-hidden />
            <span className="eval-filter-field__label">Semester</span>
            <select
              className="eval-filter-field__control"
              value={evalFilterSemesterId}
              disabled={!canAlterIrregularStanding || standingSaving || !evalFilterYearId}
              onChange={(e) => {
                if (!canAlterIrregularStanding) return;
                void applyIrregularStandingChange(evalFilterYearId, e.target.value);
              }}
              title={
                canAlterIrregularStanding
                  ? 'Irregular only: Dean / Program Head can promote or demote by changing Semester'
                  : data?.student?.promoted_next_sem_at
                    ? 'Follows promotion target semester'
                    : data?.active_semester?.semester_name
                      ? `Follows Lookup active semester: ${data.active_semester.semester_name}`
                      : 'Follows Lookup → Semesters active row'
              }
            >
              {semesterOptionsForYear.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {hasPendingProgramChange ? (
          <div className="eval-program-preview-banner" role="status">
            <i className="fa-solid fa-eye" aria-hidden />
            <span>
              Previewing{' '}
              <strong>
                {programOptions.find((option) => Number(option.value) === Number(pendingProgramId))
                  ?.label || 'selected program'}
              </strong>
              . Shared subjects keep their grades with a <strong>FROM</strong> tag. Subjects only in
              the previous program stay visible for review and are removed when you click{' '}
              <strong>Save All Changes</strong> to confirm the shift.
            </span>
          </div>
        ) : null}
        <p className="eval-filter-context" aria-live="polite">
          {String(standingBanner || `${currentYearLabel} — ${currentSemLabel}`).toUpperCase()}
          {canAlterIrregularStanding ? (
            <span className="eval-filter-context__hint">
              {' '}
              · Year / Semester editable (Irregular — promote or demote)
            </span>
          ) : null}
        </p>
      </>
    );
  };

  const renderTable = () => {
    if (!data || !data.rows || data.rows.length === 0) {
      return (
        <div className="empty-state">
          No curriculum rows found for this student. Make sure the student has an assigned program and curriculum.
        </div>
      );
    }

    // Main curriculum grid always uses curriculum home term.
    // Subject placement MOVE TO is for the placement panel only.
    // OFFSEM / Semestral takes stay here with a badge (not remapped).
    const activePlacementMap = placementPreviewHasPendingChanges
      ? placementPreviewMap
      : placementPreviewConfirmedMap;
    const savedNotTakenKeys = new Set(
      Array.isArray(data?.student?.standing_deferred_keys)
        ? data.student.standing_deferred_keys.map(String)
        : []
    );
    const rowsForDisplay = data.rows.map((rawRow) => {
      const key = getRowKey(rawRow);
      const hasGrade = rawRow.grade != null && String(rawRow.grade).trim() !== '';
      const row =
        savedNotTakenKeys.has(String(key)) && !hasGrade && !rawRow.passed_via_transfer_credit
          ? { ...rawRow, not_taken_in_load: true }
          : rawRow;
      const offsem = offSemesterTakeMap[key];
      if (offsem) {
        return {
          ...row,
          off_semester: true,
          off_semester_standing: offsem,
        };
      }
      // Stale placement without offsem flag: still keep home term + badge.
      const placement = activePlacementMap[key];
      if (
        placement &&
        (String(placement.yearId ?? '') !== String(row.year_level_id ?? '') ||
          String(placement.semId ?? '') !== String(row.semester_id ?? ''))
      ) {
        return {
          ...row,
          off_semester: true,
          off_semester_standing: {
            standingYearId: placement.yearId,
            standingSemId: placement.semId,
            mode: placement.mode || 'offsem',
          },
        };
      }
      return row;
    });

    // Group rows by year level & semester similar to the spreadsheet layout
    const groups = {};
    rowsForDisplay.forEach((row) => {
      const key = `${row.year_level_name || 'Unknown'} - ${row.semester_name || 'Unknown'}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(row);
    });

    const orderedEntries = Object.entries(groups).sort(([, rowsA], [, rowsB]) => {
      const a = rowsA[0] || {};
      const b = rowsB[0] || {};
      const ay = Number(a.year_level_id ?? 0);
      const by = Number(b.year_level_id ?? 0);
      if (ay !== by) return ay - by;
      return semesterSortValue(a.semester_id, a.semester_name) -
        semesterSortValue(b.semester_id, b.semester_name);
    });

    const entriesToRender = orderedEntries;
    // Student tab: for confirmed shiftee/returnee/transferee, show only remaining
    // current-program subjects to take — hide previous-program-only rows AND
    // shared subjects already taken under the previous program (FROM tags).
    // During an unsaved program-shift preview, keep those rows visible for review.
    const isProgramShiftPreview =
      hasPendingProgramChange || data?.preview_program_shift === true;
    const showOnlySubjectsToTake =
      !isEvaluatedModule &&
      !isProgramShiftPreview &&
      shouldShowOnlySubjectsToTake(data?.student);
    // Always show the full curriculum. Year/Semester dropdowns only mark current standing.
    const matchesTermFilters = ([, rows]) => rows.length > 0;
    const termFilteredEntries = entriesToRender.filter(matchesTermFilters);
    const filteredEntries = termFilteredEntries
      .map(([groupKey, rows]) => {
        if (!showOnlySubjectsToTake) return [groupKey, rows];
        const visibleRows = rows.filter((row) => {
          const merged = mergedRowsByKey.get(getRowKey(row)) || row;
          if (merged?.previous_program_only === true) return false;
          if (merged?.from_previous_program === true) return false;
          return !isTransferCreditRowForTermGate(merged);
        });
        return [groupKey, visibleRows];
      })
      .filter(([, rows]) => rows.length > 0);
    const yearSections = filteredEntries.reduce((acc, entry) => {
      const [, rows] = entry;
      const first = rows[0] || {};
      const key = String(first.year_level_id ?? first.year_level_name ?? 'unknown');
      if (!acc.has(key)) {
        acc.set(key, {
          id: key,
          label: first.year_level_name || 'Unknown Year',
          entries: [],
        });
      }
      acc.get(key).entries.push(entry);
      return acc;
    }, new Map());

    const termPlacementClass = (rows) => {
      const row = rows[0] || {};
      const name = String(row.semester_name || '').toLowerCase();
      if (name.includes('summer')) return 'eval-term-block--summer';
      if (name.includes('first') || name.includes('1st')) return 'eval-term-block--first-sem';
      if (name.includes('second') || name.includes('2nd')) return 'eval-term-block--second-sem';
      return 'eval-term-block--other-sem';
    };

    return (
      <div className="eval-table-container" data-tour="evaluation-grades">
        {filteredEntries.length === 0 && termFilteredEntries.length > 0 ? (
          <p className="eval-filter-empty">
            {showOnlySubjectsToTake
              ? 'No remaining subjects to take for this term filter.'
              : 'No courses match the selected year/semester filters.'}
          </p>
        ) : null}
        {[...yearSections.values()].map((yearSection) => (
          <section key={yearSection.id} className="eval-year-section">
            <div className="eval-year-section__title">{yearSection.label}</div>
            <div className="eval-year-term-grid">
              {yearSection.entries.map(([groupKey, rows]) => {
          const visibleRows = rows;
          const semesterModifiedCount = visibleRows.filter((row) => modifiedKeys.has(getRowKey(row))).length;
          const termCanManageSubjectEquivalences = canManageSubjectEquivalences;
          const termCanEditEvaluationRows = canEditEvaluationRows;
          const termCanEditNumericGrades = canEditNumericGrades;
          const termLabel = visibleRows[0]?.semester_name || groupKey;
          const showPreviewMarkers = placementPreviewHasPendingChanges;

          return (
            <div
              key={groupKey}
              id={`eval-term-${visibleRows[0]?.year_level_id ?? 'y'}-${visibleRows[0]?.semester_id ?? 's'}`}
              className={`eval-term-block ${termPlacementClass(rows)}`}
            >
              <div className="eval-term-header">
                <span>{termLabel}</span>
                {(termCanManageSubjectEquivalences || termCanEditEvaluationRows) && (
                  <div className="term-batch-actions">
                    {termCanManageSubjectEquivalences && (
                      <button
                        type="button"
                        className="batch-btn batch-btn--equivalence"
                        onClick={openSubjectEquivModalCatalog}
                        title="Add a mapping from any prior-school (external) course to a local catalog subject. To tie a mapping to a specific PEN row, use the link icon on that row instead."
                      >
                        Subject equivalences
                      </button>
                    )}
                    {termCanEditEvaluationRows && semesterModifiedCount > 0 && (
                      <span className="term-modified-count">{semesterModifiedCount} changed</span>
                    )}
                  </div>
                )}
              </div>
              <div className="eval-responsive-table-wrap">
              <table className="data-table eval-course-table">
                <thead>
                  <tr>
                    <th>Pen Code</th>
                    <th>Descriptive Title</th>
                    <th>Units</th>
                    <th>Grade</th>
                    <th className="eval-remarks-header">
                      {termCanEditEvaluationRows ? (
                        <div className="eval-remarks-header-stack">
                          <div
                            className="eval-remarks-header-actions"
                            role="group"
                            aria-label="Mark all subjects in this term"
                          >
                            <button
                              type="button"
                              className="batch-btn batch-btn--icon batch-btn--pass"
                              onClick={() => batchUpdateStatus(visibleRows, 'passed')}
                              disabled={savingAll}
                              title="Mark all subjects in this term as Passed"
                              aria-label="Mark all as Passed"
                            >
                              <i className="fa-solid fa-check" aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="batch-btn batch-btn--icon batch-btn--fail"
                              onClick={() => batchUpdateStatus(visibleRows, 'failed')}
                              disabled={savingAll}
                              title="Mark all subjects in this term as Failed"
                              aria-label="Mark all as Failed"
                            >
                              <i className="fa-solid fa-xmark" aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="batch-btn batch-btn--icon batch-btn--clear"
                              onClick={() => batchUpdateStatus(visibleRows, '')}
                              disabled={savingAll}
                              title="Clear all Pass/Fail marks in this term"
                              aria-label="Clear all remarks"
                            >
                              <i className="fa-solid fa-rotate-left" aria-hidden />
                            </button>
                          </div>
                        </div>
                      ) : (
                        'Result'
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const key = getRowKey(row);
                    const draft = drafts[key] || {};
                    const displaySubjectId = draft.subject_id ?? row.subject_id;
                    const displaySubjectCode = draft.subject_code || row.subject_code;
                    const displaySubjectName = draft.subject_name || row.subject_name;
                    const displayUnits = (() => {
                      const fromRow = draft.units ?? row.units;
                      if (fromRow != null && Number(fromRow) > 0) return fromRow;
                      const choices = Array.isArray(row.elective_choices) ? row.elective_choices : [];
                      const fromChoice = choices
                        .map((c) => Number(c?.units))
                        .find((n) => Number.isFinite(n) && n > 0);
                      if (fromChoice != null) return fromChoice;
                      if (isElectiveTrackPendingRow(row) || row.elective_slot_id) return 3;
                      return fromRow ?? 0;
                    })();
                    const isModified = termCanEditEvaluationRows && modifiedKeys.has(key);
                    const statusClass = termCanEditEvaluationRows
                      ? draft.status || ''
                      : normalizeStatusForUi(row.status ?? '');
                    const gradable = displaySubjectId != null && displaySubjectId !== '';
                    const transferCredit = isTransferCreditRow(row);
                    const notTakenInLoad = !!row.not_taken_in_load && !transferCredit;
                    const mi = data?.rows ? data.rows.findIndex((r) => getRowKey(r) === getRowKey(row)) : -1;
                    const mergedTarget =
                      mi >= 0 && mergedRowsForPrereq[mi]
                        ? mergedRowsForPrereq[mi]
                        : mergeEvalRowWithDrafts(row, drafts, getEvaluationRowKey);
                    const prereqsMet = rowPrereqsMetWithOverride(
                      mergedRowsForPrereq,
                      mergedTarget
                    );
                    const hasMajorStandingOverride = majorStandingOverrideKeys.has(key);
                    const prereqBlocksEditing =
                      gradable && !transferCredit && termCanEditEvaluationRows && !prereqsMet;
                    const requisiteLabel = formatPromotionPrerequisiteDisplay(mergedTarget);
                    const unmetPrerequisiteLabels = prereqBlocksEditing
                      ? unmetEvalPrerequisiteLabels(mergedRowsForPrereq, mergedTarget, enrollmentYearStandingOrd)
                      : [];
                    const unmetAreStandingOnly =
                      unmetPrerequisiteLabels.length > 0 &&
                      unmetPrerequisiteLabels.every((label) =>
                        /year standing|prior subjects|prior year/i.test(label)
                      );
                    const canOfferMajorOverride =
                      canGrantMajorStandingOverride &&
                      termCanEditEvaluationRows &&
                      prereqBlocksEditing &&
                      isMajorEvalRow(mergedTarget) &&
                      (unmetAreStandingOnly ||
                        rowHasStandingPrerequisiteRule(mergedTarget)) &&
                      lowerYearMajorsComplete(
                        mergedRowsForPrereq,
                        mergedTarget,
                        parseYearNumberFromLabel
                      );
                    const notEligibleTitle = unmetPrerequisiteLabels.length
                      ? unmetAreStandingOnly
                        ? `Not eligible — requires ${unmetPrerequisiteLabels.join(', ')}`
                        : `Not eligible — missing prerequisite(s): ${unmetPrerequisiteLabels.join(', ')}`
                      : requisiteLabel
                        ? `Prerequisite not satisfied on record. ${requisiteLabel}`
                        : 'Prerequisite not satisfied on record';
                    const electiveSubjectChoices = electiveSubjectChoicesForRow(row);
                    const canPickElectiveSubject =
                      termCanEditEvaluationRows &&
                      isItElectivesFourRow(row) &&
                      electiveSubjectChoices.length > 0;
                    const electiveTrackChoices = dedupeElectiveChoicesByTrackFamily(row.elective_choices)
                      .filter((c) => c.track_id != null && c.track_id !== '');
                    const canPickElectiveTrack =
                      termCanEditEvaluationRows &&
                      !canPickElectiveSubject &&
                      isTrackSelectableElectiveRow(row) &&
                      electiveTrackChoices.length > 0;
                    const savedTrackValue =
                      data?.student?.track_id != null && data.student.track_id !== ''
                        ? String(data.student.track_id)
                        : '';
                    const selectedTrackDraftValue = Object.prototype.hasOwnProperty.call(
                      electiveTrackDrafts,
                      key,
                    )
                      ? electiveTrackDrafts[key]
                      : savedTrackValue;
                    const selectedTrackChanged = selectedTrackDraftValue !== savedTrackValue;

                    const previewPlacement = placementPreviewMap[key];
                    const confirmedPlacement = placementPreviewConfirmedMap[key];
                    const isPreviewPendingForRow =
                      showPreviewMarkers &&
                      JSON.stringify(previewPlacement ?? null) !==
                        JSON.stringify(confirmedPlacement ?? null);

                    return (
                      <tr
                        key={key}
                        className={`${isModified ? 'modified' : ''} ${statusClass} ${!gradable ? 'eval-row-not-gradable' : ''} ${transferCredit ? 'eval-row-transfer-credit' : ''} ${prereqBlocksEditing ? 'eval-row-prereq-blocked' : ''}`}
                        title={
                          transferCredit
                            ? 'Satisfied by approved transfer credit on record (not graded as a class).'
                            : !gradable && isElectiveTrackPendingRow(row)
                              ? 'Click the Pen Code (elective label) to choose a track and unlock this row for grading.'
                              : !gradable
                                ? 'Grades apply only after this curriculum row maps to a subject (track/elective slot).'
                                : prereqBlocksEditing
                                  ? notEligibleTitle
                                  : undefined
                        }
                      >
                        <td className="code-cell" data-label="Pen Code">
                          <div className="eval-code-cell-inner">
                            {canPickElectiveSubject ? (
                              <div
                                className="eval-code-pill-attach"
                                ref={electiveSubjectPopoverKey === key ? electiveTrackPopoverRef : undefined}
                              >
                                <button
                                  type="button"
                                  className="eval-code-pill eval-code-pill--elective-trigger"
                                  id={`elective-subject-${key}`}
                                  aria-expanded={electiveSubjectPopoverKey === key}
                                  aria-haspopup="listbox"
                                  aria-controls={`elective-subject-pop-${key}`}
                                  onClick={() => {
                                    setElectiveTrackPopoverKey(null);
                                    setElectiveSubjectPopoverKey((k) => (k === key ? null : key));
                                  }}
                                  disabled={savingAll || electiveTrackSaving}
                                  title="Choose the exact subject for IT Electives 4"
                                >
                                  {displaySubjectCode || row.elective_slot_name || row.subject_code || 'Elective'}
                                </button>
                                {electiveSubjectPopoverKey === key ? (
                                  <div
                                    className="eval-elective-code-popover"
                                    id={`elective-subject-pop-${key}`}
                                    role="presentation"
                                  >
                                    <label
                                      className="eval-elective-code-popover__label"
                                      htmlFor={`elective-subject-select-${key}`}
                                    >
                                      Select Elective 4 subject
                                    </label>
                                    <select
                                      id={`elective-subject-select-${key}`}
                                      className="eval-elective-track-select eval-elective-track-select--popover"
                                      value={displaySubjectId != null && displaySubjectId !== '' ? String(displaySubjectId) : ''}
                                      onChange={(e) => {
                                        const selected = electiveSubjectChoices.find(
                                          (choice) => String(choice.subject_id) === String(e.target.value)
                                        );
                                        if (!selected) return;
                                        updateDraft(row, {
                                          subject_id: selected.subject_id,
                                          subject_code: selected.subject_code,
                                          subject_name: selected.subject_name,
                                          units: selected.units ?? row.units,
                                        });
                                      }}
                                      disabled={savingAll || electiveTrackSaving}
                                      autoComplete="off"
                                    >
                                      <option value="">Choose elective subject</option>
                                      {electiveSubjectChoices.map((choice) => (
                                        <option key={choice.subject_id} value={String(choice.subject_id)}>
                                          {choice.label}
                                        </option>
                                      ))}
                                    </select>
                                    <div className="eval-elective-code-popover__actions">
                                      <button
                                        type="button"
                                        className="eval-elective-code-popover__confirm"
                                        onClick={() => setElectiveSubjectPopoverKey(null)}
                                        disabled={!draft.subject_id || String(draft.subject_id) === String(row.subject_id ?? '')}
                                      >
                                        Done
                                      </button>
                                      <button
                                        type="button"
                                        className="eval-elective-code-popover__cancel"
                                        onClick={() => {
                                          updateDraft(row, {
                                            subject_id: row.subject_id,
                                            subject_code: row.subject_code,
                                            subject_name: row.subject_name,
                                            units: row.units,
                                          });
                                          setElectiveSubjectPopoverKey(null);
                                        }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : canPickElectiveTrack ? (
                              <div
                                className="eval-code-pill-attach"
                                ref={electiveTrackPopoverKey === key ? electiveTrackPopoverRef : undefined}
                              >
                                <button
                                  type="button"
                                  className="eval-code-pill eval-code-pill--elective-trigger"
                                  id={`elective-pen-${key}`}
                                  aria-expanded={electiveTrackPopoverKey === key}
                                  aria-haspopup="listbox"
                                  aria-controls={`elective-track-pop-${key}`}
                                  onClick={() => {
                                    setElectiveTrackDrafts((prev) => ({
                                      ...prev,
                                      [key]: Object.prototype.hasOwnProperty.call(prev, key)
                                        ? prev[key]
                                        : savedTrackValue,
                                    }));
                                    setElectiveTrackPopoverKey((k) => (k === key ? null : key));
                                  }}
                                  disabled={savingAll || electiveTrackSaving}
                                  title={isElectiveTrackPendingRow(row) ? 'Choose track for this elective slot' : 'Change track for this elective slot'}
                                >
                                  {row.subject_code || 'Elective'}
                                </button>
                                {electiveTrackPopoverKey === key ? (
                                  <div
                                    className="eval-elective-code-popover"
                                    id={`elective-track-pop-${key}`}
                                    role="presentation"
                                  >
                                    <label
                                      className="eval-elective-code-popover__label"
                                      htmlFor={`elective-track-${key}`}
                                    >
                                      Select track, then confirm
                                    </label>
                                    <select
                                      id={`elective-track-${key}`}
                                      className="eval-elective-track-select eval-elective-track-select--popover"
                                      value={selectedTrackDraftValue}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setElectiveTrackDrafts((prev) => ({ ...prev, [key]: v }));
                                      }}
                                      disabled={savingAll || electiveTrackSaving}
                                      autoComplete="off"
                                    >
                                      <option value="">Clear track / no track</option>
                                      {electiveTrackChoices.map((c) => (
                                        <option key={c.elective_subject_id} value={String(c.track_id)}>
                                          {electiveChoiceLabel(c)}
                                        </option>
                                      ))}
                                    </select>
                                    <div className="eval-elective-code-popover__actions">
                                      <button
                                        type="button"
                                        className="eval-elective-code-popover__confirm"
                                        onClick={() => void applyElectiveTrack(selectedTrackDraftValue)}
                                        disabled={
                                          savingAll ||
                                          electiveTrackSaving ||
                                          !selectedTrackChanged
                                        }
                                      >
                                        Confirm
                                      </button>
                                      <button
                                        type="button"
                                        className="eval-elective-code-popover__cancel"
                                        onClick={() => {
                                          setElectiveTrackDrafts((prev) => ({
                                            ...prev,
                                            [key]: savedTrackValue,
                                          }));
                                          setElectiveTrackPopoverKey(null);
                                        }}
                                        disabled={electiveTrackSaving}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                    {electiveTrackSaving ? (
                                      <span className="eval-elective-saving">Saving…</span>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <span className="eval-code-pill">
                                {displaySubjectCode || (gradable ? 'N/A' : '—')}
                              </span>
                            )}
                            {termCanManageSubjectEquivalences ? (
                              <button
                                type="button"
                                className="eval-row-equiv-btn"
                                onClick={() => openRowSubjectEquivalence({
                                  ...row,
                                  subject_id: displaySubjectId,
                                  subject_code: displaySubjectCode,
                                  subject_name: displaySubjectName,
                                })}
                                disabled={
                                  savingAll || displaySubjectId == null || displaySubjectId === ''
                                }
                                title={
                                  displaySubjectId != null && displaySubjectId !== ''
                                    ? 'Apply a prior-school course as approved transfer credit for this student and PEN subject'
                                    : 'Link a catalog subject first (e.g. choose elective track)'
                                }
                                aria-label={`Apply transfer credit to local subject ${displaySubjectCode || 'course'}`}
                              >
                                <i className="fa-solid fa-link" aria-hidden />
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td className="subject-cell" data-label="Descriptive Title">
                          {canPickElectiveSubject ? (
                            <div className="eval-elective-title-readonly">
                              <span className="eval-elective-title-readonly__title">
                                {displaySubjectName || row.subject_name || 'Choose an elective subject'}
                              </span>
                              <span className="eval-elective-title-readonly__hint">
                                Use the blue <strong>Pen Code</strong> button to choose Elective 4.
                              </span>
                            </div>
                          ) : isElectiveTrackPendingRow(row) &&
                          termCanEditEvaluationRows &&
                          (row.elective_choices || []).length > 0 ? (
                            <div className="eval-elective-title-readonly">
                              <span className="eval-elective-title-readonly__title">
                                {row.subject_name || '—'}
                              </span>
                              <span className="eval-elective-title-readonly__hint">
                                Use the blue <strong>Pen Code</strong> button to assign a track.
                              </span>
                            </div>
                          ) : isElectiveTrackPendingRow(row) && termCanEditEvaluationRows ? (
                            <span className="eval-elective-track-missing">
                              {row.subject_name || '—'}{' '}
                              <span className="eval-elective-track-missing-note">
                                (No elective options in catalog — configure Elective slots / subjects.)
                              </span>
                            </span>
                          ) : (
                            <div className="eval-title-stack">
                              <span className="eval-title-stack__name">
                                {displaySubjectName || (gradable ? 'N/A' : '—')}
                                {row.off_semester ? (() => {
                                  const isSemestral =
                                    String(row.off_semester_standing?.mode || '').toLowerCase() ===
                                    'semestral';
                                  const takenTerm = formatOffSemesterTakenTerm(row, data);
                                  return (
                                    <>
                                      <span
                                        className={`eval-offsem-badge${
                                          isSemestral ? ' eval-offsem-badge--semestral' : ''
                                        }`}
                                        title={`${isSemestral ? 'Taken as semestral' : 'Taken off-semester'}${
                                          takenTerm ? ` in ${takenTerm}` : ''
                                        }${
                                          row.off_semester_standing?.standingYearLabel
                                            ? ` (${row.off_semester_standing.standingYearLabel} standing)`
                                            : ''
                                        }`}
                                      >
                                        {isSemestral ? 'SEMESTRAL' : 'OFFSEM'}
                                      </span>
                                      {takenTerm ? (
                                        <span className="eval-offsem-term">{takenTerm}</span>
                                      ) : null}
                                    </>
                                  );
                                })() : null}
                                {row.not_taken_in_load ? (
                                  <span
                                    className="eval-not-taken-tag"
                                    title="Unchecked (dropped) in the saved load plan — not taken this semester"
                                  >
                                    NOT TAKEN
                                  </span>
                                ) : null}
                                {row.from_previous_program ? (
                                  <span
                                    className="eval-previous-program-tag"
                                    title={
                                      row.previous_program_name ||
                                      data?.student?.previous_program?.program_name ||
                                      'Tagged from previous course after shift'
                                    }
                                  >
                                    {formatPreviousProgramTag(row, data?.student)}
                                  </span>
                                ) : null}
                                {isPreviewPendingForRow && (
                                  <span
                                    className="eval-preview-move-badge"
                                    title="Pending placement preview change"
                                  >
                                    Preview
                                  </span>
                                )}
                                {termCanEditEvaluationRows && isModified && (
                                  <>
                                    <span className="modified-indicator" aria-hidden>
                                      ●
                                    </span>
                                    <span className="sr-only">Unsaved changes.</span>
                                  </>
                                )}
                              </span>
                              {requisiteLabel ? (
                                <span
                                  className={`eval-requisite-line${
                                    prereqBlocksEditing ? ' eval-requisite-line--blocked' : ''
                                  }`}
                                  title={
                                    prereqBlocksEditing
                                      ? notEligibleTitle
                                      : 'Prerequisite / corequisite rules'
                                  }
                                >
                                  {requisiteLabel}
                                  {prereqBlocksEditing &&
                                  unmetPrerequisiteLabels.length > 0 &&
                                  !unmetAreStandingOnly ? (
                                    <span className="eval-requisite-missing">
                                      {' '}
                                      · Missing: {unmetPrerequisiteLabels.join(', ')}
                                    </span>
                                  ) : null}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="units-cell" data-label="Units">
                          <span className="eval-units-pill">{displayUnits ?? 0}</span>
                        </td>
                        <td
                          className="grade-cell"
                          data-label="Grade"
                          title={
                            isEvaluatorOnly && gradable && !transferCredit
                              ? 'Grade comes from imported records; it cannot be edited here.'
                              : undefined
                          }
                        >
                          {gradable && transferCredit ? (
                            <span className="eval-transfer-credit-dash">—</span>
                          ) : notTakenInLoad ? (
                            <span
                              className="eval-grade-na"
                              title="Not taken this semester — cannot be graded"
                            >
                              —
                            </span>
                          ) : termCanEditNumericGrades && gradable && prereqsMet ? (
                            <input
                              type="text"
                              className="eval-grade-input"
                              value={draft.grade ?? ''}
                              title="Enter grade"
                              onChange={(e) => updateDraft(row, { grade: e.target.value })}
                              disabled={savingAll}
                            />
                          ) : termCanEditNumericGrades && gradable && !prereqsMet ? (
                            <span className="eval-grade-prereq-blocked">
                              {formatEvalGradeReadonly(
                                draft.grade !== '' && draft.grade != null ? draft.grade : row.grade,
                                row
                              ) || '—'}
                            </span>
                          ) : gradable ? (
                            <span className="eval-grade-readonly">
                              {formatEvalGradeReadonly(row.grade, row) || '—'}
                            </span>
                          ) : termCanEditEvaluationRows ? (
                            <span className="eval-grade-na">—</span>
                          ) : (
                            <span className="eval-grade-readonly">
                              {formatEvalGradeReadonly(row.grade, row) || '—'}
                            </span>
                          )}
                        </td>
                        <td className="status-cell" data-label="Remarks">
                          {gradable && transferCredit ? (
                            <span
                              className="status-badge-eval-credited"
                              title="Approved transfer credit"
                            >
                              Credited
                            </span>
                          ) : notTakenInLoad ? (
                            <span
                              className="eval-not-taken-remark"
                              title="Unchecked (dropped) in the saved load plan — not taken this semester, so it cannot be graded"
                            >
                              Not taken
                            </span>
                          ) : termCanEditEvaluationRows && gradable && !prereqsMet ? (
                            <div className="eval-prereq-locked" title={notEligibleTitle}>
                              <span className="eval-prereq-locked-badge">Not eligible</span>
                              {unmetPrerequisiteLabels.length > 0 ? (
                                <span className="eval-prereq-locked-detail">
                                  {unmetAreStandingOnly ? 'Requires: ' : 'Needs: '}
                                  {unmetPrerequisiteLabels.join(', ')}
                                </span>
                              ) : requisiteLabel ? (
                                <span className="eval-prereq-locked-detail">{requisiteLabel}</span>
                              ) : null}
                              {canOfferMajorOverride ? (
                                <button
                                  type="button"
                                  className="eval-major-override-btn"
                                  disabled={savingAll}
                                  onClick={() => void grantMajorStandingOverride(row, { enabled: true })}
                                  title="Dean / Program Head prerogative: unlock this major when lower-year majors are OK"
                                >
                                  Allow major
                                </button>
                              ) : null}
                            </div>
                          ) : termCanEditEvaluationRows && gradable ? (
                            <div className="status-cell-inner">
                              {hasMajorStandingOverride ? (
                                <div className="eval-major-override-active">
                                  <span
                                    className="eval-major-override-pill"
                                    title="Unlocked by Dean / Program Head prerogative"
                                  >
                                    Major override
                                  </span>
                                  {canGrantMajorStandingOverride ? (
                                    <button
                                      type="button"
                                      className="eval-major-override-clear"
                                      disabled={savingAll}
                                      onClick={() =>
                                        void grantMajorStandingOverride(row, { enabled: false })
                                      }
                                      title="Clear override"
                                    >
                                      Clear
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="status-buttons" role="group" aria-label="Subject result">
                                {[
                                  {
                                    value: 'passed',
                                    hint: 'Mark this subject Passed',
                                    icon: 'fa-check',
                                  },
                                  {
                                    value: 'failed',
                                    hint: 'Mark this subject Failed',
                                    icon: 'fa-xmark',
                                  },
                                  {
                                    value: '',
                                    hint: 'Clear Pass/Fail for this subject',
                                    icon: 'fa-rotate-left',
                                  },
                                ].map(({ value, hint, icon }) => (
                                  <button
                                    key={value || 'clear'}
                                    type="button"
                                    className={`status-btn ${
                                      draft.status === value ||
                                      (value === 'passed' &&
                                        (draft.status === 'complete' || draft.status === 'completed'))
                                        ? value || 'clear'
                                        : ''
                                    } ${!value ? 'clear' : ''}`}
                                    onClick={() => updateDraft(row, gradeAndStatusForRemarkClick(value, row))}
                                    disabled={savingAll}
                                    title={hint}
                                    aria-label={hint}
                                    aria-pressed={
                                      draft.status === value ||
                                      (value === 'passed' &&
                                        (draft.status === 'complete' || draft.status === 'completed'))
                                    }
                                  >
                                    <i className={`fa-solid ${icon}`} aria-hidden />
                                  </button>
                                ))}
                              </div>
                              {draft.status === 'inc' && (
                                <p className="eval-legacy-inc-hint" role="note">
                                  Still incomplete. Update the result to clear INC.
                                </p>
                              )}
                            </div>
                          ) : termCanEditEvaluationRows && !gradable ? (
                            <span className="eval-status-na">—</span>
                          ) : (
                            <span className={`status-display ${normalizeStatusForUi(row.status ?? '')}`}>
                              {normalizeStatusForUi(row.status ?? '') || '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="eval-term-footer">
                    <td colSpan={5} className="eval-term-footer__cell">
                      Total units:{' '}
                      <span className="eval-units-pill eval-units-pill--footer">
                        {visibleRows.reduce((acc, row) => {
                          const key = getRowKey(row);
                          const draft = drafts[key] || {};
                          let u = Number(draft.units ?? row.units);
                          if (!Number.isFinite(u) || u <= 0) {
                            const choices = Array.isArray(row.elective_choices) ? row.elective_choices : [];
                            const fromChoice = choices
                              .map((c) => Number(c?.units))
                              .find((n) => Number.isFinite(n) && n > 0);
                            u = fromChoice != null ? fromChoice : row.elective_slot_id ? 3 : 0;
                          }
                          return acc + (Number.isFinite(u) ? u : 0);
                        }, 0)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
              </div>
            </div>
          );
              })}
            </div>
          </section>
        ))}

        {extendedYearIds.map((yearId) => {
          const yid = String(yearId);
          const yearLoad = extendedYearLoad[yid] || emptyExtendedSemLoad();
          return (
            <section
              key={`extended-year-${yid}`}
              className="eval-year-section eval-year-section--extended"
            >
              <h3 className="eval-year-heading">
                {extendedYearDisplayLabel(yid, curriculumMaxYearId)}
                <span className="eval-extended-year-tag">Retake container</span>
              </h3>
              <p className="eval-extended-year-desc">
                Extra load for unfinished / failed subjects — not a new college year level.
                Standing stays at{' '}
                <strong>{ordinalYearLabel(curriculumMaxYearId)} Year</strong>. Cap{' '}
                <strong>{EXTENDED_STUDY_SEM_UNIT_CAP} units per semester</strong> (same as 4th
                year). Grades still save on each subject’s curriculum home row.
              </p>
              <div className="eval-year-term-grid">
                {['1', '2'].map((semId) => {
                  const semLabel = semId === '1' ? '1st Semester' : '2nd Semester';
                  const keys = yearLoad[semId] || [];
                  const rows = keys
                    .map(
                      (k) =>
                        mergedRowsByKey.get(String(k)) ||
                        (data?.rows || []).find((r) => getEvaluationRowKey(r) === String(k))
                    )
                    .filter(Boolean);
                  const units = rows.reduce((sum, row) => sum + (Number(row.units) || 0), 0);
                  const overCap = units > EXTENDED_STUDY_SEM_UNIT_CAP;
                  const isAddTarget =
                    String(extendedAddTarget.yearId) === yid &&
                    String(extendedAddTarget.semId) === String(semId);
                  return (
                    <div
                      key={`extended-${yid}-${semId}`}
                      id={`eval-term-${yid}-${semId}`}
                      className={`eval-term-block ${
                        semId === '1'
                          ? 'eval-term-block--first-sem'
                          : 'eval-term-block--second-sem'
                      } eval-term-block--extended`}
                    >
                      <div className="eval-term-header">
                        <span>{semLabel}</span>
                        <span
                          className={`eval-extended-cap${overCap ? ' eval-extended-cap--over' : ''}`}
                        >
                          {units} / {EXTENDED_STUDY_SEM_UNIT_CAP} units
                        </span>
                      </div>

                      <div className="eval-responsive-table-wrap">
                        <table className="data-table eval-course-table">
                          <thead>
                            <tr>
                              <th>Pen Code</th>
                              <th>Descriptive Title</th>
                              <th>Units</th>
                              <th>Home term</th>
                              {canManageExtendedStudy ? <th> </th> : null}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row) => {
                              const key = getEvaluationRowKey(row);
                              return (
                                <tr key={key}>
                                  <td>
                                    <span className="subject-code-badge">
                                      {row.subject_code || row.elective_slot_name || '—'}
                                    </span>
                                  </td>
                                  <td>{row.subject_name || '—'}</td>
                                  <td className="units-cell">{row.units ?? 0}</td>
                                  <td className="eval-extended-home">
                                    {[row.year_level_name, row.semester_name]
                                      .filter(Boolean)
                                      .join(' · ') || '—'}
                                  </td>
                                  {canManageExtendedStudy ? (
                                    <td>
                                      <button
                                        type="button"
                                        className="eval-extended-remove-subj"
                                        onClick={() =>
                                          removeSubjectFromExtendedSemester(yid, semId, key)
                                        }
                                        title="Remove from extended year"
                                      >
                                        Remove
                                      </button>
                                    </td>
                                  ) : null}
                                </tr>
                              );
                            })}
                            {canManageExtendedStudy ? (
                              <tr className="eval-extended-add-row">
                                <td colSpan={5} className="eval-extended-add-cell">
                                  <SearchableSelect
                                    className="eval-extended-add__select"
                                    value={isAddTarget ? extendedAddSubjectKey : ''}
                                    onChange={(value) => {
                                      setExtendedAddTarget({ yearId: yid, semId });
                                      setExtendedAddSubjectKey(String(value || ''));
                                      if (value) {
                                        addSubjectToExtendedSemester(yid, semId, value);
                                      }
                                    }}
                                    options={extendedSubjectPickerOptions}
                                    emptyLabel="Add subject…"
                                    placeholder="Search unfinished subject…"
                                    disabled={savingAll || standingSaving}
                                    aria-label={`Add subject to ${extendedYearDisplayLabel(yid, curriculumMaxYearId)} ${semLabel}`}
                                  />
                                </td>
                              </tr>
                            ) : rows.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="eval-extended-blank-cell">
                                  No subjects in this semester.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                          <tfoot>
                            <tr className="eval-term-footer">
                              <td
                                colSpan={canManageExtendedStudy ? 5 : 4}
                                className="eval-term-footer__cell"
                              >
                                Total units:{' '}
                                <span className="eval-units-pill eval-units-pill--footer">
                                  {units}
                                </span>
                                <span className="eval-extended-cap-note">
                                  {' '}
                                  / {EXTENDED_STUDY_SEM_UNIT_CAP} cap
                                </span>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
              {canManageExtendedStudy ? (
                <div className="eval-extended-year-actions">
                  <button
                    type="button"
                    className="eval-extended-year-remove"
                    onClick={() => removeExtendedStudyYear(yid)}
                  >
                    Remove {extendedYearDisplayLabel(yid, curriculumMaxYearId)}
                  </button>
                </div>
              ) : null}
            </section>
          );
        })}

        {canManageExtendedStudy && nextExtendedYearId ? (
          <div className="eval-extended-year-cta">
            <button
              type="button"
              className="eval-extended-year-cta__btn"
              onClick={() => addExtendedStudyYear()}
              disabled={standingSaving}
            >
              <i className="fa-solid fa-plus" aria-hidden />
              Add retake container ({extendedYearDisplayLabel(nextExtendedYearId, curriculumMaxYearId)})
            </button>
            <p className="eval-extended-year-cta__hint">
              College year levels stay 1st–{ordinalYearLabel(curriculumMaxYearId)} (5th only for
              Architecture). This only adds a planning container for retakes — 12 units/sem, standing
              unchanged.
            </p>
          </div>
        ) : null}

        {showPlacementPreview ? (
          <section
            className={`eval-placement-preview${placementPreviewOpen ? ' is-open' : ' is-collapsed'}`}
            aria-labelledby="eval-placement-preview-title"
          >
            <button
              type="button"
              className="eval-placement-preview__toggle"
              aria-expanded={placementPreviewOpen}
              onClick={() => setPlacementPreviewOpen((open) => !open)}
            >
              <div className="eval-placement-preview__toggle-text">
                <span id="eval-placement-preview-title">Subject placement preview</span>
                <small>
                  Simulate where remaining subjects can be taken
                  ({placementPreviewRemainingRows.length} remaining)
                </small>
              </div>
              <span className="eval-placement-preview__chevron" aria-hidden>
                {placementPreviewOpen ? '▾' : '▸'}
              </span>
            </button>

            {placementPreviewOpen ? (
              <div className="eval-placement-preview__body">
                <p className="eval-placement-preview__desc">
                  Preview only — move remaining subjects between matching terms (1st sem ↔ 1st sem /
                  Summer, 2nd sem ↔ 2nd sem / Summer), or use Insert subject inside a slot. This does not change
                  saved grades.
                </p>
                <div className="eval-placement-preview__toolbar">
                  <button
                    type="button"
                    className="eval-placement-preview__reset"
                    onClick={() => {
                      setPlacementPreviewMap({});
                      setPlacementPreviewConfirmedMap({});
                      setPlacementPreviewInsertSlotKey(null);
                      if (placementPreviewStorageKey) {
                        try {
                          window.localStorage.removeItem(placementPreviewStorageKey);
                        } catch {
                          // Ignore storage failures.
                        }
                      }
                    }}
                    disabled={
                      Object.keys(placementPreviewMap).length === 0 &&
                      placementPreviewInsertSlotKey == null
                    }
                  >
                    Reset preview
                  </button>
                </div>

                {placementPreviewRemainingRows.length === 0 ? (
                  <p className="eval-placement-preview__empty">
                    No remaining subjects to place — all curriculum rows are credited/passed.
                  </p>
                ) : (
                  <div className="eval-placement-preview__years">
                    {placementPreviewYears.map((yearGroup) => (
                      <div key={yearGroup.key} className="eval-placement-preview__year">
                        <div className="eval-placement-preview__year-title">{yearGroup.yearLabel}</div>
                        <div className="eval-placement-preview__term-grid">
                          {yearGroup.sections.map((section) => {
                            const insertOpen = placementPreviewInsertSlotKey === section.key;
                            const slotInsertOptions = placementPreviewSubjectOptions
                              .filter((opt) => {
                                if (opt.slotKey === section.key) return false;
                                const row = placementPreviewRemainingRows.find(
                                  (r) => getEvaluationRowKey(r) === String(opt.id),
                                );
                                if (!row) return false;
                                const candidateMap = {
                                  ...placementPreviewMap,
                                  [String(opt.id)]: {
                                    yearId: section.yearId,
                                    semId: section.semId,
                                  },
                                };
                                return evalPlacementPrereqMoveGate(
                                  row,
                                  section.yearId,
                                  section.semId,
                                  section.semesterLabel,
                                  {
                                    allRows: mergedRowsForPrereq,
                                    placementMap: candidateMap,
                                  },
                                ).ok;
                              })
                              .map((opt) => ({
                                value: opt.id,
                                label: `${opt.label} (from ${opt.where})`,
                              }));
                            return (
                            <div
                              key={section.key}
                              className={`eval-placement-preview__slot${
                                section.rows.length === 0 ? ' eval-placement-preview__slot--empty' : ''
                              }`}
                            >
                              <div className="eval-placement-preview__slot-head">
                                <h4>{section.semesterLabel}</h4>
                                <span>
                                  {section.rows.reduce((acc, row) => {
                                    const u = Number(row.units);
                                    return acc + (Number.isFinite(u) ? u : 0);
                                  }, 0)}{' '}
                                  u · {section.rows.length} subj
                                </span>
                              </div>
                              {section.rows.length > 0 ? (
                                <ul className="eval-placement-preview__list">
                                  {section.rows.map((row) => {
                                    const rowKey = getEvaluationRowKey(row);
                                    const placement = placementPreviewMap[rowKey] || {
                                      yearId: row.year_level_id,
                                      semId: row.semester_id,
                                    };
                                    const currentKey = `${placement.yearId ?? ''}|${placement.semId ?? ''}`;
                                    const moveOptions = getPlacementMoveOptionsForRow(row, currentKey);
                                    const code = row.subject_code || row.elective_slot_name || '—';
                                    const title =
                                      row.subject_name ||
                                      (row.elective_pending ? 'Pending track selection' : '—');
                                    const prereqNoteRaw = formatPromotionPrerequisiteDisplay(row);
                                    const prereqNote = prereqNoteRaw
                                      ? prereqNoteRaw.replace(/^P:\s*/i, '').trim()
                                      : '';
                                    return (
                                      <li key={rowKey} className="eval-placement-preview__item">
                                        <div className="eval-placement-preview__item-main">
                                          <span className="eval-placement-preview__code">{code}</span>
                                          <span className="eval-placement-preview__title">{title}</span>
                                          <span className="eval-placement-preview__units">
                                            {row.units ?? '—'}
                                          </span>
                                        </div>
                                        <label className="eval-placement-preview__move">
                                          <span>Move to</span>
                                          <select
                                            value={
                                              moveOptions.some((slot) => slot.key === currentKey)
                                                ? currentKey
                                                : moveOptions[0]?.key || currentKey
                                            }
                                            onChange={(e) => {
                                              const [yearId, semId] = e.target.value.split('|');
                                              movePlacementPreviewSubject(
                                                rowKey,
                                                yearId === '' ? null : yearId,
                                                semId === '' ? null : semId,
                                              );
                                            }}
                                            title="Preview moving this remaining subject to another matching term"
                                          >
                                            {moveOptions.map((slot) => (
                                              <option key={slot.key} value={slot.key}>
                                                {slot.label}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        {prereqNote ? (
                                          <p className="eval-placement-preview__note">
                                            Prerequisite: {prereqNote}.
                                          </p>
                                        ) : null}
                                      </li>
                                    );
                                  })}
                                </ul>
                              ) : null}
                              <div
                                className={`eval-placement-preview__insert-area${
                                  section.rows.length === 0
                                    ? ' eval-placement-preview__insert-area--empty'
                                    : ''
                                }`}
                              >
                                {section.rows.length === 0 && !insertOpen ? (
                                  <div className="eval-placement-preview__empty-actions">
                                    <button
                                      type="button"
                                      className="eval-placement-preview__insert-btn"
                                      onClick={() =>
                                        setPlacementPreviewInsertSlotKey((open) =>
                                          open === section.key ? null : section.key,
                                        )
                                      }
                                    >
                                      + Insert subject
                                    </button>
                                    <p className="eval-placement-preview__slot-empty">No subjects here</p>
                                  </div>
                                ) : null}
                                {insertOpen ? (
                                  <div className="eval-placement-preview__insert-panel">
                                    <label className="eval-placement-preview__insert-field">
                                      <span className="eval-placement-preview__insert-label">
                                        Subject to insert
                                      </span>
                                      <SearchableSelect
                                        id={`eval-placement-insert-${String(section.key).replace(/[^\w-]+/g, '-')}`}
                                        value=""
                                        onChange={(next) =>
                                          void insertPlacementPreviewSubjectIntoSlot(
                                            next,
                                            section.yearId,
                                            section.semId,
                                          )
                                        }
                                        options={slotInsertOptions}
                                        emptyLabel={
                                          slotInsertOptions.length === 0
                                            ? 'No subjects to add'
                                            : 'Choose subject...'
                                        }
                                        placeholder="Search subject code/title..."
                                        className="eval-placement-preview__insert-search"
                                        aria-label={`Choose subject for ${section.semesterLabel}`}
                                        disabled={slotInsertOptions.length === 0}
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      className="eval-placement-preview__insert-cancel"
                                      onClick={() => setPlacementPreviewInsertSlotKey(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : section.rows.length > 0 ? (
                                  <button
                                    type="button"
                                    className="eval-placement-preview__insert-btn"
                                    onClick={() =>
                                      setPlacementPreviewInsertSlotKey((open) =>
                                        open === section.key ? null : section.key,
                                      )
                                    }
                                  >
                                    + Insert subject
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    );
  };

  const sectionTitle =
    isCurriculumTracking && !isEvaluatedModule
      ? 'Curriculum tracking'
      : isEvaluatedModule
        ? 'Evaluated students'
        : 'Curriculum Evaluation';
  const listCountLabel =
    isCurriculumTracking && !isEvaluatedModule
      ? `${filteredStudents.length} students`
      : isEvaluatedModule
        ? `${filteredStudents.length} stored`
        : `${filteredStudents.length} students`;
  // Do not auto-clear the open student when Year/Standing filters no longer match
  // (e.g. after Promote they leave Unevaluated). Keep their curriculum on screen
  // until the dean picks another student or clears the search selection.

  const studentDropdownOptions = (() => {
    const map = new Map();
    filteredStudents.forEach((student) => map.set(String(student.student_id), student));
    // Keep the current pick visible in the combobox even while search results are loading
    // or after Promote removes them from the active Standing filter.
    if (selectedStudent?.student_id != null) {
      map.set(String(selectedStudent.student_id), selectedStudent);
    }
    return [...map.values()];
  })();

  return (
    <div
      className={`student-eval-section student-eval-section--cdoc${
        isCurriculumTracking ? ' student-eval-section--curriculum-tracking' : ''
      }`}
      data-tour={isEvaluatedModule ? 'page-evaluated-students' : 'page-academic-record'}
      data-guide-promotion-saved={guidePromotionPreviewSaved ? 'true' : 'false'}
      data-guide-load-saved={guideLoadPlanPreviewSaved ? 'true' : 'false'}
    >
      <div className="section-header section-header--academic-record">
        <div className="section-header-titles">
          <h2>{sectionTitle}</h2>
        </div>
        {canEditEvaluationRows && hasUnsavedChanges && (
          <div className="header-actions">
            <span className="unsaved-indicator">
              <span className="dot">●</span> {unsavedChangeCount} unsaved
            </span>
            <button
              type="button"
              className="clear-all-btn"
              onClick={handleClearAll}
              disabled={savingAll}
            >
              Clear All
            </button>
            <button
              type="button"
              className="save-all-btn"
              onClick={handleSaveAll}
              disabled={savingAll || !hasUnsavedChanges}
            >
              {savingAll ? 'Saving...' : `Save All (${unsavedChangeCount})`}
            </button>
          </div>
        )}
      </div>

      <div className="eval-container eval-container--selector-layout">
            <div className="eval-student-selector-panel" data-tour="evaluation-student-selector">
          <div className="eval-selector-heading eval-selector-heading--compact">
            <div className="eval-selector-heading__actions">
              {canManageSimulationDummy ? (
                <>
                  <button
                    type="button"
                    className="eval-sim-add-btn"
                    onClick={() => void createSimulationDummy()}
                    disabled={simulationCreating || loadingList}
                    title="Add a practice student (saved for testing only — no login account)"
                    aria-label="Add practice student"
                  >
                    <i className="fa-solid fa-plus" aria-hidden />
                    <span>{simulationCreating ? 'Adding…' : 'Practice student'}</span>
                  </button>
                  {(selectedStudent?.is_simulation || data?.student?.is_simulation) ? (
                    <button
                      type="button"
                      className="eval-sim-delete-btn"
                      onClick={() => void deleteSelectedSimulationDummy()}
                      disabled={simulationCreating || loading}
                      title="Delete this practice student"
                      aria-label="Delete practice student"
                    >
                      <i className="fa-solid fa-trash" aria-hidden />
                      <span className="eval-sim-delete-btn__label">Delete</span>
                    </button>
                  ) : null}
                </>
              ) : null}
              <span className="eval-list-header-count">{listCountLabel}</span>
            </div>
          </div>

          <div className="eval-student-selector-grid">
            <label className="eval-list-toolbar__field">
              <span className="eval-list-toolbar__hint">Year level</span>
              <select
                className="eval-list-toolbar__select"
                value={listYearLevelFilter}
                onChange={(e) => setListYearLevelFilter(e.target.value)}
              >
                <option value="">All years</option>
                {yearLevelOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="eval-list-toolbar__field" data-tour="evaluation-standing-filter">
              <span className="eval-list-toolbar__hint">Standing</span>
              <select
                className="eval-list-toolbar__select"
                value={listStandingFilter}
                onChange={(e) => setListStandingFilter(e.target.value)}
                aria-label="Filter by evaluation standing"
                title="Unevaluated = not yet staff-evaluated (missed auto-promote or still needs review). Unevaluated irregular = Irregular students who still need manual Promote/Complete. Practice students are excluded from every standing filter."
              >
                <option value="">All students</option>
                <option value="regular">Regular</option>
                <option value="irregular">Irregular</option>
                <option value="unevaluated">Unevaluated</option>
                <option value="unevaluated_irregular">Unevaluated irregular</option>
              </select>
            </label>

            <label className="eval-list-toolbar__field eval-list-toolbar__field--student">
              <span className="eval-list-toolbar__hint">Student</span>
              <SearchableSelect
                className="eval-student-searchable-select"
                value={selectedStudent?.student_id != null ? String(selectedStudent.student_id) : ''}
                onChange={async (value) => {
                  if (!value) {
                    if (hasUnsavedChanges) {
                      const confirmed = await swalConfirm(
                        'Unsaved Changes',
                        `You have ${unsavedChangeCount} unsaved change(s). Discard them?`,
                        'Discard',
                        'Cancel'
                      );
                      if (!confirmed) return;
                    }
                    clearSelectedEvaluationStudent();
                    return;
                  }
                  const student = studentDropdownOptions.find(
                    (option) => String(option.student_id) === String(value)
                  );
                  if (student) {
                    await handleStudentSelect(student);
                  }
                }}
                onQueryChange={(q) => setSearchTerm(q)}
                options={studentDropdownOptions.map((student) => ({
                  value: String(student.student_id),
                  label: `${student.is_simulation ? '[Practice] ' : ''}${
                    student.full_name || 'Unnamed student'
                  } — ${student.student_id_number || 'N/A'} — ${
                    student.program?.program_code || student.program_name || 'Program'
                  }`,
                }))}
                disabled={loadingList && studentDropdownOptions.length === 0}
                emptyLabel={
                  loadingList
                    ? 'Loading students...'
                    : isEvaluatedModule
                      ? 'No stored evaluations found'
                      : 'Type a name or student ID…'
                }
                placeholder="Type student name or ID..."
                aria-label="Student"
              />
            </label>
          </div>
        </div>

        <div className="eval-details-panel eval-details-panel--sheet">
          {error && <div className="error-message">{error}</div>}

          {loading && <div className="loading-message">Loading evaluation...</div>}

          {programPreviewLoading && !loading && (
            <div className="loading-message">Loading program preview...</div>
          )}

          {canEditEvaluationRows && hasUnsavedChanges && (
            <div className="unsaved-badge">
              <span className="dot">●</span> {unsavedChangeCount} unsaved
            </div>
          )}

          {!loading && !selectedStudent && (
            <div className="eval-empty-selection" role="status">
              <div className="eval-empty-selection__icon" aria-hidden>
                <i className="fa-solid fa-user-graduate" />
              </div>
              <h4 className="eval-empty-selection__title">No student selected yet</h4>
              <p className="eval-empty-selection__text">
                Use the search box above to find a student. Their curriculum subjects will appear
                here so you can enter grades.
              </p>
            </div>
          )}
          {!loading && !programPreviewLoading && selectedStudent && renderStudentHero()}
          {!loading && !programPreviewLoading && selectedStudent && renderFilterRail()}
          {!loading && !programPreviewLoading && selectedStudent && renderTable()}

          {/* Floating Save Bar for unsaved grade / program changes */}
          {canEditEvaluationRows && hasUnsavedChanges && (
            <div
              className={`floating-save-bar${
                placementPreviewHasPendingChanges ? ' floating-save-bar--stacked' : ''
              }`}
            >
              <span>
                {hasPendingProgramChange && (modifiedKeys.size > 0 || hasPendingSimNameChange)
                  ? `${unsavedChangeCount} unsaved (incl. program shift)`
                  : hasPendingProgramChange
                    ? 'Program shift pending — save to apply'
                    : hasPendingSimNameChange && modifiedKeys.size > 0
                      ? `${modifiedKeys.size} unsaved + dummy name`
                      : hasPendingSimNameChange
                        ? 'Dummy name pending — save to store'
                        : `${modifiedKeys.size} unsaved · kept on this device`}
                }
              </span>
              <div className="floating-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleClearAll}
                  disabled={savingAll}
                >
                  Clear All
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  data-tour="evaluation-save"
                  onClick={handleSaveAll}
                  disabled={savingAll}
                >
                  {savingAll ? 'Saving…' : 'Save All'}
                </button>
              </div>
            </div>
          )}

          {/* Floating bar for placement preview (same style as unsaved changes) */}
          {placementPreviewHasPendingChanges && (
            <div className="floating-save-bar">
              <span>
                {placementPreviewPendingCount} placement preview unsaved
              </span>
              <div className="floating-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleDiscardPlacementPreview}
                >
                  Clear All
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleConfirmPlacementPreview}
                >
                  Save All
                </button>
              </div>
            </div>
          )}

          {/* FAB: subject placement — portaled so it stays viewport bottom-right */}
          {!loading &&
            !programPreviewLoading &&
            selectedStudent &&
            data?.rows?.length > 0 &&
            createPortal(
            <>
              {currentStandingPanelOpen ? (
                <div
                  className="eval-standing-modal-overlay"
                  role="presentation"
                  onClick={() => setCurrentStandingPanelOpen(false)}
                >
                  <div
                    className="eval-standing-modal"
                    data-tour="subject-placement-panel"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="eval-standing-fab-title"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="eval-standing-fab-panel__header">
                      <div>
                        <p className="eval-standing-fab-panel__eyebrow">Current standing</p>
                        <h3 id="eval-standing-fab-title">
                          {[
                            currentStandingMeta.curriculumLabel,
                            currentStandingMeta.yearLabel,
                            currentStandingMeta.semLabel,
                          ]
                            .filter((p) => p && p !== '—')
                            .join(' — ') || 'Current term'}
                        </h3>
                        <p className="eval-standing-fab-panel__meta">
                          Take {currentStandingMeta.toTakeCount} of {currentStandingMeta.poolCount} ·{' '}
                          {currentStandingMeta.units} units
                          {currentStandingMeta.unitCap != null
                            ? ` / ${currentStandingMeta.unitCap} cap`
                            : ''}
                          {standingLoadDirty ? ' · unsaved' : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="eval-standing-fab-panel__close"
                        onClick={() => setCurrentStandingPanelOpen(false)}
                        aria-label="Close current subjects"
                      >
                        ×
                      </button>
                    </div>
                    <p className="eval-standing-fab-panel__hint">
                      {isIrregularStudent ? (
                        <>
                          <strong>Irregular:</strong> check what to take this standing
                          (regular-term subjects + backlog). Prior/backlog subjects are
                          selectable only when <strong>Offered</strong> this standing
                          (OFFSEM), or when their home semester matches this standing
                          (Semestral). A 2nd-sem subject during 1st-sem standing stays
                          locked unless it is offered. Later-term subjects appear only
                          when <strong>Offered</strong> this semester.
                        </>
                      ) : (
                        <>
                          This standing subjects first, then untaken / prior-term subjects.
                          Prior takes: <strong>OFFSEM</strong> if listed in Offered
                          subjects, or <strong>Semestral</strong> only when the subject’s
                          home semester matches this standing. Checked prior subjects stay
                          in their curriculum home.
                        </>
                      )}
                    </p>
                    <div className="eval-standing-fab-panel__list eval-standing-load-table-wrap">
                      {currentStandingSubjects.length === 0 ? (
                        <p className="eval-standing-fab-panel__empty">
                          {isIrregularStudent
                            ? 'No unfinished subjects in this standing year or earlier. Check grades or promote when ready.'
                            : 'No prior or eligible current subjects for this standing.'}
                        </p>
                      ) : (
                        (() => {
                          let lastSection = null;
                          return (
                            <div className="eval-responsive-table-wrap">
                              <table className="data-table eval-course-table eval-standing-load-table">
                                <thead>
                                  <tr>
                                    <th>Pen Code</th>
                                    <th>Descriptive Title</th>
                                    <th>Units</th>
                                    <th>Grade</th>
                                    <th>Load</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {currentStandingSubjects.map((row, idx) => {
                                    const rowKey = getEvaluationRowKey(row);
                                    const code =
                                      row.subject_code || row.elective_slot_name || '—';
                                    const title = row.subject_name || '—';
                                    const isCurrentTerm =
                                      String(row.year_level_id) ===
                                        String(evalFilterYearId) &&
                                      String(row.semester_id) ===
                                        String(evalFilterSemesterId);
                                    const section = isCurrentTerm
                                      ? 'current'
                                      : row.advance_offered
                                        ? 'advance'
                                        : 'prior';
                                    const showSection = section !== lastSection;
                                    lastSection = section;
                                    const blockReason = standingLoadBlockedByPrereq(row, mergedRowsForPrereq, majorStandingOverrideKeys, enrollmentYearStandingOrd);
                                    const priorGate = isCurrentTerm
                                      ? { ok: true, mode: null }
                                      : priorStandingTakeGate(row);
                                    const offerBlock =
                                      !blockReason && !priorGate.ok
                                        ? priorGate.reason
                                        : null;
                                    const rowLocked = !!(blockReason || offerBlock);
                                    const taking = !standingLoadDeferred.has(rowKey);
                                    const priorMode =
                                      !isCurrentTerm && taking && priorGate.ok
                                        ? priorGate.mode
                                        : null;
                                    const priorTakeFlag =
                                      priorMode === 'offsem'
                                        ? ' · OFFSEM'
                                        : priorMode === 'semestral'
                                          ? ' · Semestral'
                                          : '';
                                    const termTag = isCurrentTerm
                                      ? 'Current standing'
                                      : `${
                                          [row.year_level_name, row.semester_name]
                                            .filter(Boolean)
                                            .join(' · ') || 'Prior term'
                                        }${priorTakeFlag}`;
                                    const requisiteLabel =
                                      formatPromotionPrerequisiteDisplay(row);
                                    const unmet = blockReason
                                      ? unmetEvalPrerequisiteLabels(mergedRowsForPrereq, row, enrollmentYearStandingOrd)
                                      : [];
                                    const unmetAreStandingOnly =
                                      unmet.length > 0 &&
                                      unmet.every((label) =>
                                        /year standing|prior subjects|prior year/i.test(
                                          label
                                        )
                                      );
                                    const loadDisabled =
                                      !canEditEvaluationRows ||
                                      standingLoadSaving ||
                                      (!!rowLocked && !taking);

                                    return (
                                      <React.Fragment key={`${rowKey}-${idx}`}>
                                        {showSection ? (
                                          <tr className="eval-standing-load-section-row">
                                            <td colSpan={5}>
                                              {section === 'current'
                                                ? 'This standing'
                                                : section === 'advance'
                                                  ? 'Offered advance subjects (later terms)'
                                                  : isIrregularStudent
                                                  ? 'Untaken / backlog (previous terms)'
                                                  : 'Untaken / prior terms'}
                                            </td>
                                          </tr>
                                        ) : null}
                                        <tr
                                          className={`${
                                            rowLocked
                                              ? 'eval-row-prereq-blocked'
                                              : taking
                                                ? 'eval-standing-load-row--take'
                                                : 'eval-standing-load-row--drop'
                                          }`}
                                          title={
                                            blockReason ||
                                            offerBlock ||
                                            termTag ||
                                            undefined
                                          }
                                        >
                                          <td
                                            className="code-cell"
                                            data-label="Pen Code"
                                          >
                                            <div className="eval-code-cell-inner">
                                              <span className="eval-code-pill">
                                                {code}
                                              </span>
                                            </div>
                                          </td>
                                          <td data-label="Descriptive Title">
                                            <div className="eval-title-stack">
                                              <span className="eval-title-stack__name">
                                                {title}
                                                {isSubjectOfferedForStanding(row) ? (
                                                  <span
                                                    className="eval-offered-tag"
                                                    title="Listed in Offered subjects for this semester"
                                                  >
                                                    OFFERED
                                                  </span>
                                                ) : null}
                                              </span>
                                              {requisiteLabel ? (
                                                <span
                                                  className={`eval-requisite-line${
                                                    blockReason
                                                      ? ' eval-requisite-line--blocked'
                                                      : ''
                                                  }`}
                                                >
                                                  {requisiteLabel}
                                                  {blockReason &&
                                                  unmet.length > 0 &&
                                                  !unmetAreStandingOnly ? (
                                                    <span className="eval-requisite-missing">
                                                      {' '}
                                                      · Missing: {unmet.join(', ')}
                                                    </span>
                                                  ) : null}
                                                </span>
                                              ) : null}
                                              {!isCurrentTerm ? (
                                                <span className="eval-standing-load-term-tag">
                                                  {termTag}
                                                </span>
                                              ) : null}
                                            </div>
                                          </td>
                                          <td
                                            className="units-cell"
                                            data-label="Units"
                                          >
                                            <span className="eval-units-pill">
                                              {row.units ?? '—'}
                                            </span>
                                          </td>
                                          <td
                                            className="grade-cell"
                                            data-label="Grade"
                                          >
                                            {formatEvalGradeReadonly(row.grade, row) || (
                                              <span className="eval-next-sem-map-grade-blank">
                                                —
                                              </span>
                                            )}
                                          </td>
                                          <td
                                            className="status-cell"
                                            data-label="Load"
                                          >
                                            {blockReason ? (
                                              <div
                                                className="eval-prereq-locked"
                                                title={blockReason}
                                              >
                                                <span className="eval-prereq-locked-badge">
                                                  Not eligible
                                                </span>
                                                {unmet.length ? (
                                                  <span className="eval-prereq-locked-detail">
                                                    {unmetAreStandingOnly
                                                      ? 'Requires: '
                                                      : 'Needs: '}
                                                    {unmet.join(', ')}
                                                  </span>
                                                ) : (
                                                  <span className="eval-prereq-locked-detail">
                                                    {blockReason}
                                                  </span>
                                                )}
                                              </div>
                                            ) : offerBlock ? (
                                              <div
                                                className="eval-prereq-locked"
                                                title={offerBlock}
                                              >
                                                <span className="eval-prereq-locked-badge">
                                                  Not offered
                                                </span>
                                                <span className="eval-prereq-locked-detail">
                                                  Add to Offered subjects to take this
                                                  standing
                                                </span>
                                              </div>
                                            ) : (
                                              <label
                                                className={`eval-standing-load-take${
                                                  taking
                                                    ? ''
                                                    : ' eval-standing-load-take--dropped'
                                                }`}
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={taking}
                                                  disabled={loadDisabled}
                                                  onChange={() => {
                                                    toggleStandingLoadTake(rowKey);
                                                  }}
                                                  aria-label={
                                                    taking
                                                      ? `Drop ${code}`
                                                      : `Take ${code}`
                                                  }
                                                />
                                                <span>
                                                  {taking ? 'Drop' : 'Take'}
                                                  {priorTakeFlag}
                                                </span>
                                              </label>
                                            )}
                                          </td>
                                        </tr>
                                      </React.Fragment>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr>
                                    <td
                                      colSpan={5}
                                      className="eval-term-footer__cell"
                                    >
                                      Total units (take): {currentStandingMeta.units}
                                      {currentStandingMeta.unitCap != null
                                        ? ` / ${currentStandingMeta.unitCap} cap`
                                        : ''}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          );
                        })()
                      )}
                    </div>
                    {canEditEvaluationRows && currentStandingSubjects.length > 0 ? (
                      <div className="eval-standing-fab-panel__footer">
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={standingLoadSaving || !standingLoadDirty}
                          onClick={() => {
                            const keys = Array.isArray(data?.student?.standing_deferred_keys)
                              ? data.student.standing_deferred_keys.map(String)
                              : [];
                            const next = new Set(keys);
                            currentStandingSubjects.forEach((row) => {
                              const key = getEvaluationRowKey(row);
                              if (
                                standingLoadBlockedByPrereq(
                                  row,
                                  mergedRowsForPrereq,
                                  majorStandingOverrideKeys,
                                  enrollmentYearStandingOrd
                                )
                              ) {
                                next.add(key);
                                return;
                              }
                              const isCurrent =
                                String(row.year_level_id) === String(evalFilterYearId) &&
                                String(row.semester_id) === String(evalFilterSemesterId);
                              if (!isCurrent && !priorStandingTakeGate(row).ok) {
                                next.add(key);
                              }
                            });
                            setStandingLoadDeferred(next);
                            setStandingLoadDirty(false);
                          }}
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          data-tour="save-load-plan"
                          title={
                            standingLoadDirty
                              ? 'Save changes to this load plan'
                              : 'Keep current plan and close'
                          }
                          disabled={standingLoadSaving}
                          onClick={() => void persistStandingLoadPlan()}
                        >
                          {standingLoadSaving ? 'Saving…' : 'Save load plan'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {nextSemMapOpen ? (
                <div
                  className="eval-standing-modal-overlay"
                  role="presentation"
                  onClick={() => setNextSemMapOpen(false)}
                >
                  <div
                    className="eval-standing-modal eval-next-sem-map-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="eval-next-sem-map-title"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="eval-standing-fab-panel__header eval-nsm-modal__header">
                      <div>
                        <p className="eval-standing-fab-panel__eyebrow">
                          Next-semester map
                        </p>
                        <h3 id="eval-next-sem-map-title">
                          {nextStandingTermLabel || 'Next term'}
                        </h3>
                        <div className="eval-nsm-modal__chips" aria-label="Map summary">
                          {nextSemMapMeta.backlogCount > 0 ? (
                            <span className="eval-nsm-chip eval-nsm-chip--priority">
                              Backlog {nextSemMapMeta.backlogEligibleCount}/
                              {nextSemMapMeta.backlogCount}
                            </span>
                          ) : null}
                          <span className="eval-nsm-chip eval-nsm-chip--next">
                            Eligible {nextSemMapMeta.targetEligibleCount}
                          </span>
                          {nextSemMapMeta.blockedCount > 0 ? (
                            <span className="eval-nsm-chip eval-nsm-chip--blocked">
                              Blocked {nextSemMapMeta.blockedCount}
                            </span>
                          ) : null}
                          {nextSemMapMeta.unitCap != null ? (
                            <span className="eval-nsm-chip">
                              Cap {nextSemMapMeta.unitCap}u
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="eval-standing-fab-panel__close"
                        onClick={() => setNextSemMapOpen(false)}
                        aria-label="Close next semester mapping"
                      >
                        ×
                      </button>
                    </div>
                    <p className="eval-nsm-modal__hint">
                      Clear backlog first, then plan what fits{' '}
                      <strong>{nextStandingTermLabel || 'the next standing'}</strong>.
                      Passed subjects are hidden.
                    </p>
                    <div className="eval-next-sem-map-modal__body">
                      {!nextStandingTerm ? (
                        <p className="eval-standing-fab-panel__empty">
                          No next semester on this curriculum.
                        </p>
                      ) : nextSemMappingSubjects.length === 0 ? (
                        <p className="eval-standing-fab-panel__empty">
                          No remaining untaken subjects for this student.
                        </p>
                      ) : nextSemMapPlanGroups.length ? (
                        renderNextSemMapGroups(nextSemMapPlanGroups)
                      ) : (
                        <p className="eval-standing-fab-panel__empty">
                          No remaining subjects to map.
                        </p>
                      )}
                    </div>
                    <div className="eval-standing-fab-panel__footer">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setNextSemMapOpen(false)}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                className={`eval-standing-fab${
                  hasUnsavedChanges || placementPreviewHasPendingChanges
                    ? ' eval-standing-fab--raised'
                    : ''
                }`}
                data-tour="subject-placement"
                onClick={() => setCurrentStandingPanelOpen((open) => !open)}
                aria-expanded={currentStandingPanelOpen}
                aria-controls="eval-standing-fab-title"
                title={
                  subjectPlacementNotifyCount > 0
                    ? `Subject placement — ${subjectPlacementNotifyCount} open subject${
                        subjectPlacementNotifyCount === 1 ? '' : 's'
                      } available`
                    : 'Subject placement — subjects to take this term'
                }
              >
                <i className="fa-solid fa-book-open" aria-hidden />
                <span>Subject placement</span>
                {subjectPlacementNotifyCount > 0 ? (
                  <span
                    className="eval-standing-fab__badge"
                    aria-label={`${subjectPlacementNotifyCount} open subjects`}
                  >
                    {subjectPlacementNotifyCount > 9 ? '9+' : subjectPlacementNotifyCount}
                  </span>
                ) : null}
              </button>
            </>,
            document.body
            )}
        </div>
      </div>

      {downloadModalOpen && (
        <div className="eval-download-modal-overlay" role="presentation">
          <div
            className={`eval-download-modal${downloadModalStep === 'preview' ? ' eval-download-modal--preview' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="eval-download-title"
          >
            <div className="eval-download-modal__header">
              <div>
                <p className="eval-download-modal__eyebrow">
                  {downloadModalStep === 'preview' ? 'BLACK & WHITE PREVIEW' : 'PDF / EXCEL / CSV EXPORT'}
                </p>
                <h3 id="eval-download-title">
                  {downloadModalStep === 'preview' ? 'Preview evaluation' : 'Download Evaluation'}
                </h3>
              </div>
              <button
                type="button"
                className="eval-download-modal__close"
                onClick={() => {
                  setDownloadModalOpen(false);
                  setDownloadModalStep('options');
                  setDownloadPreviewHtml('');
                }}
                disabled={downloadingPdf || downloadingCsv}
                aria-label="Close download dialog"
              >
                ×
              </button>
            </div>

            {downloadModalStep === 'options' ? (
              <>
                <div className="eval-download-modal__body">
                  <p className="eval-download-modal__hint">
                    Choose which terms to include, then preview before downloading. PDF exports are black and white to keep the file small.
                  </p>

                  <label className="eval-download-option">
                    <input
                      type="radio"
                      name="downloadScope"
                      value="all"
                      checked={downloadScope === 'all'}
                      onChange={() => setDownloadScope('all')}
                      disabled={downloadingPdf || downloadingCsv}
                    />
                    <span>
                      <strong>All terms</strong>
                      <small>Download the full curriculum evaluation.</small>
                    </span>
                  </label>

                  <label className={`eval-download-option${!currentDownloadTermLabel ? ' is-disabled' : ''}`}>
                    <input
                      type="radio"
                      name="downloadScope"
                      value="current"
                      checked={downloadScope === 'current'}
                      onChange={() => setDownloadScope('current')}
                      disabled={downloadingPdf || downloadingCsv || !currentDownloadTermLabel}
                    />
                    <span>
                      <strong>Current selected term</strong>
                      <small>{currentDownloadTermLabel || 'Select a year and semester first.'}</small>
                    </span>
                  </label>

                  <label className="eval-download-option">
                    <input
                      type="radio"
                      name="downloadScope"
                      value="specific"
                      checked={downloadScope === 'specific'}
                      onChange={() => setDownloadScope('specific')}
                      disabled={downloadingPdf || downloadingCsv}
                    />
                    <span>
                      <strong>Specific terms</strong>
                      <small>Pick one or more year/semester sections.</small>
                    </span>
                  </label>

                  {downloadScope === 'specific' && (
                    <div className="eval-download-term-list">
                      <div className="eval-download-term-list__actions">
                        <button
                          type="button"
                          onClick={() => setDownloadSelectedTermKeys(downloadTermOptions.map((option) => option.key))}
                          disabled={downloadingPdf || downloadingCsv}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => setDownloadSelectedTermKeys([])}
                          disabled={downloadingPdf || downloadingCsv}
                        >
                          Clear term selection
                        </button>
                      </div>
                      {downloadTermOptions.map((option) => (
                        <label key={option.key} className="eval-download-term-check">
                          <input
                            type="checkbox"
                            checked={downloadSelectedTermKeys.includes(option.key)}
                            onChange={() => toggleDownloadTermKey(option.key)}
                            disabled={downloadingPdf || downloadingCsv}
                          />
                          <span>{option.label}</span>
                          <small>{option.rowCount} subject(s)</small>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="eval-download-modal__footer">
                  <span>{selectedDownloadCount} term(s) selected</span>
                  <div className="eval-download-modal__footer-actions">
                    <button
                      type="button"
                      className="eval-download-modal__cancel"
                      onClick={() => setDownloadModalOpen(false)}
                      disabled={downloadingPdf || downloadingCsv}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="eval-download-modal__download"
                      onClick={handlePreviewEvaluationDownload}
                      disabled={downloadingPdf || downloadingCsv || selectedDownloadCount < 1}
                    >
                      Preview
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="eval-download-modal__body eval-download-modal__body--preview">
                  <p className="eval-download-modal__hint">
                    Review the black-and-white report below. Download PDF or Export to Excel/CSV when ready.
                  </p>
                  <div
                    className="eval-download-preview"
                    dangerouslySetInnerHTML={{ __html: downloadPreviewHtml }}
                  />
                </div>

                <div className="eval-download-modal__footer">
                  <span>Black &amp; white PDF · smaller file size</span>
                  <div className="eval-download-modal__footer-actions">
                    <button
                      type="button"
                      className="eval-download-modal__cancel"
                      onClick={() => {
                        setDownloadModalStep('options');
                        setDownloadPreviewHtml('');
                      }}
                      disabled={downloadingPdf || downloadingCsv}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="eval-download-modal__download eval-download-modal__download--csv"
                      onClick={handleDownloadEvaluationCsv}
                      disabled={downloadingPdf || downloadingCsv}
                    >
                      {downloadingCsv ? 'Creating CSV...' : 'Export to Excel/CSV'}
                    </button>
                    <button
                      type="button"
                      className="eval-download-modal__download"
                      onClick={handleDownloadEvaluationPdf}
                      disabled={downloadingPdf || downloadingCsv}
                    >
                      {downloadingPdf ? 'Creating PDF...' : 'Download PDF'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <PromoteSemesterModal
        open={promoteModalOpen}
        onClose={() => {
          if (!promoteSaving) setPromoteModalOpen(false);
        }}
        onSave={handlePromoteSave}
        saving={promoteSaving}
        studentName={
          data?.student?.full_name ||
          `${data?.student?.last_name || ''}, ${data?.student?.first_name || ''} ${data?.student?.middle_name || ''}`.trim() ||
          'Student'
        }
        curriculumLabel={promotionCurriculumLabel}
        programLabel={evaluationFilterOptions.programLabel}
        yearLabel={nextPromotionTerm?.year_level_name || '—'}
        semesterLabel={nextPromotionTerm?.semester_name || '—'}
        rows={promotionTableRows}
        totalUnits={promotionModalTotalUnits}
        evaluatedBy={promoteEvaluatedBy}
        trackPickerVisible={nextTermNeedsTrackPicker && promoteModalTrackOptions.length > 0}
        trackPickerRequired={promotionTrackPickRequired}
        trackPickerOptions={promoteModalTrackOptions}
        trackPickerValue={promoteModalTrackId}
        onTrackPickerChange={(e) => {
          setPromoteModalTrackId(e.target.value);
          setPromoteModalElective4SubjectId('');
        }}
        elective4SubjectValue={promoteModalElective4SubjectId}
        onElective4SubjectChange={(e) => setPromoteModalElective4SubjectId(e.target.value)}
      />

      <SubjectEquivalenceQuickModal
        open={subjectEquivModalOpen}
        fixedLocal={subjectEquivFixedLocal}
        rosterStudentId={data?.student?.student_id ?? null}
        sourceContext="evaluation"
        onClose={() => {
          setSubjectEquivModalOpen(false);
          setSubjectEquivFixedLocal(null);
        }}
        onSaved={refreshSelectedStudentEvaluation}
      />
    </div>
  );
};

export default StudentEvaluationView;


