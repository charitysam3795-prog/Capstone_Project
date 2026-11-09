import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { swalError, swalInfo, swalToast } from '../../utils/swal';
import { formatCurriculumYearRange } from '../../utils/curriculumYear';
import { downloadGuestSimulationPdfs } from '../../utils/guestSimulationPdf';
import SearchableSelect from '../common/SearchableSelect';
import './GuestPanel.css';

const publicUrl = process.env.PUBLIC_URL || '';

const INSTITUTION_NAME =
  process.env.REACT_APP_INSTITUTION_NAME || 'Cagayan de Oro College — PHINMA Education';

/** @returns {string|number|null} */
function getYearLevelId(row) {
  const rel = row.yearLevel ?? row.year_level;
  if (rel != null && typeof rel === 'object') return rel.year_level_id ?? null;
  return row.year_level ?? null;
}

/** @returns {string|number|null} */
function getSemesterId(row) {
  const rel = row.semester;
  if (rel != null && typeof rel === 'object') return rel.semester_id ?? null;
  return row.semester_id ?? null;
}

function curriculumHeaderLabel(row) {
  const h = row.curriculumHeader ?? row.curriculum_header;
  if (!h) {
    return row.curriculum_header_id != null ? `Curriculum #${row.curriculum_header_id}` : '—';
  }
  const effectiveYear = h.Effective_Year ?? h.effective_year;
  const schoolYear = formatCurriculumYearRange(effectiveYear);
  return schoolYear || h.description || `Curriculum #${row.curriculum_header_id}`;
}

/** BSIT degree totals by curriculum Effective_Year (SY start year). */
const GUEST_DEGREE_TOTAL_BY_EFFECTIVE_YEAR = {
  2022: 154, // 2022-2023 — one additional subject vs later revision
  2023: 150, // 2023-2024
};

function getCurriculumEffectiveYear(row) {
  const h = row?.curriculumHeader ?? row?.curriculum_header;
  const y = Number(h?.Effective_Year ?? h?.effective_year);
  return Number.isFinite(y) && y > 0 ? y : null;
}

/** Degree total for the selected curriculum — not the program-wide required units. */
function resolveGuestDegreeTotal(listedTotal, effectiveYear, programRequired) {
  const year = Number(effectiveYear);
  if (Number.isFinite(year) && GUEST_DEGREE_TOTAL_BY_EFFECTIVE_YEAR[year] != null) {
    return GUEST_DEGREE_TOTAL_BY_EFFECTIVE_YEAR[year];
  }
  if (listedTotal > 0) return listedTotal;
  return programRequired > 0 ? programRequired : 0;
}

function electiveSlot(row) {
  return row.electiveSlot || row.elective_slot;
}

function electiveSubjects(row) {
  const slot = electiveSlot(row);
  const subjects = slot?.electiveSubjects || slot?.elective_subjects;
  return Array.isArray(subjects) ? subjects : [];
}

/** Curriculum row tied to an elective slot (not a single fixed subject). */
function isElectiveSlotRow(row) {
  return row.elective_slot_id != null && row.elective_slot_id !== '';
}

function isInformationTechnologyProgram(program) {
  if (!program) return false;
  const code = String(program.program_code || program.code || '').trim().toUpperCase();
  const name = String(program.program_name || program.name || '').trim().toLowerCase();
  return code === 'BSIT' || name.includes('information technology');
}

function programForRow(row, programs) {
  if (row.program) return row.program;
  const slot = electiveSlot(row);
  if (slot?.program) return slot.program;
  const programId = row.program_id ?? slot?.program_id;
  return programs.find((program) => String(program.program_id) === String(programId)) || null;
}

function isTrackBasedElectiveRow(row, programs) {
  if (!isElectiveSlotRow(row)) return false;
  if (!isInformationTechnologyProgram(programForRow(row, programs))) return false;
  return electiveSubjects(row).some((es) => es.track_id != null && es.track_id !== '');
}

function getPenCodes(row) {
  if (row.subject?.subject_code) return row.subject.subject_code;
  const subs = electiveSubjects(row);
  if (Array.isArray(subs) && subs.length > 0) {
    const codes = subs.map((es) => es.subject?.subject_code).filter(Boolean);
    if (codes.length) return codes.join(' / ');
  }
  if (row.elective_slot_id) return `Elective slot #${row.elective_slot_id}`;
  return '—';
}

function getPenCodeParts(row) {
  const raw = getPenCodes(row);
  if (raw === '—') return [];
  return raw.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
}

function getTitle(row) {
  if (row.subject?.subject_name) return row.subject.subject_name;
  const slot = electiveSlot(row);
  if (slot?.slot_name) return slot.slot_name;
  return '—';
}

/** Elective slot row + chosen track → matching elective_subject entry, if any. */
function resolveElectiveSubject(
  row,
  trackId,
  allElectiveRows = null,
  trackBySlot = null,
  programs = null,
) {
  if (!isElectiveSlotRow(row) || trackId == null || trackId === '') return null;

  // Elective 4 subject comes from admin (Lookup → Elective subjects assigned to this slot).
  // Digi full path (same track on 1–3): use Digi's 4th subject on this slot.
  if (isGuestElectiveFourRow(row) && Array.isArray(allElectiveRows) && allElectiveRows.length > 0) {
    const primaryTid = getGuestPrimaryElectiveTrackId(trackBySlot, allElectiveRows, programs);
    const digiFullPath = primaryTid && String(primaryTid) === String(trackId);

    if (digiFullPath) {
      const directOnFour =
        electiveSubjects(row).find((es) => String(es.track_id) === String(trackId)) ?? null;
      if (directOnFour) return directOnFour;

      const bySlot = [...allElectiveRows]
        .filter((r) => isElectiveSlotRow(r))
        .sort((a, b) => electiveSlotSortValue(a) - electiveSlotSortValue(b))
        .map((r) =>
          electiveSubjects(r).find((es) => String(es.track_id) === String(trackId)),
        )
        .filter(Boolean);
      if (bySlot.length >= 4) return bySlot[3];
      if (bySlot.length) return bySlot[bySlot.length - 1];
    }

    // Separate Elective 4 track: only subjects admin linked to Elective 4 for that track.
    const adminAssigned =
      electiveSubjects(row).find((es) => String(es.track_id) === String(trackId)) ?? null;
    if (adminAssigned) return adminAssigned;
    return null;
  }

  const direct =
    electiveSubjects(row).find((es) => String(es.track_id) === String(trackId)) ?? null;
  if (direct) return direct;

  // Other slots with no track link: borrow from the earliest elective that has this track.
  if (!Array.isArray(allElectiveRows) || allElectiveRows.length === 0) return null;
  const selfKey = guestElectiveSlotKey(row);
  const ordered = [...allElectiveRows]
    .filter((r) => isElectiveSlotRow(r) && guestElectiveSlotKey(r) !== selfKey)
    .sort((a, b) => electiveSlotSortValue(a) - electiveSlotSortValue(b));
  for (const other of ordered) {
    const hit = electiveSubjects(other).find((es) => String(es.track_id) === String(trackId));
    if (hit) return hit;
  }
  return null;
}

function electiveSlotSortValue(row) {
  const name = String(
    electiveSlot(row)?.slot_name || row?.elective_slot_name || '',
  ).toLowerCase();
  const numbered = name.match(/electives?\s*(\d+)/i);
  if (numbered) return Number(numbered[1]);
  return 50;
}

function isGuestElectiveFourRow(row) {
  return electiveSlotSortValue(row) === 4;
}

function isGuestDigiTrackOption(track) {
  const code = String(track?.track_code || '').toUpperCase();
  const name = String(track?.track_name || '').toLowerCase();
  return /DIGI/.test(code) || name.includes('digital art');
}

/**
 * Apply a track from the slot the user opened:
 * - Digi from Electives 1–3: fill slots 1–4 (Digi has four elective subjects).
 * - Other tracks from Electives 1–3: fill 1–3; clear Elective 4 if it was Digi-auto-filled
 *   (same track as previous Electives 1–3) so it resets to "Choose track".
 * - Elective 4 alone: set only Elective 4.
 */
function buildGuestElectiveTracksForChoice(track, electiveRows, programs, sourceRow, existingBySlot = {}) {
  const tid = String(track.track_id);
  const fromElectiveFour = sourceRow ? isGuestElectiveFourRow(sourceRow) : false;
  const isDigi = isGuestDigiTrackOption(track);
  const next = { ...(existingBySlot || {}) };
  const previousPrimaryTid = getGuestPrimaryElectiveTrackId(
    existingBySlot,
    electiveRows,
    programs,
  );

  electiveRows.forEach((row) => {
    if (!isTrackBasedElectiveRow(row, programs)) return;
    const key = guestElectiveSlotKey(row);
    if (!key) return;
    const num = electiveSlotSortValue(row);
    if (num < 1 || num > 4) return;

    if (fromElectiveFour) {
      if (num === 4) next[key] = tid;
      return;
    }

    if (isDigi) {
      // Digital Arts has 4 electives — auto-fill Elective 4 as well.
      next[key] = tid;
      return;
    }

    if (num <= 3) {
      next[key] = tid;
      return;
    }

    if (num === 4) {
      const onFour = String(existingBySlot[key] || '');
      // Leaving Digi (or any 1–4 auto-fill): clear Elective 4 back to unchosen.
      if (
        onFour &&
        (onFour === tid ||
          (previousPrimaryTid && onFour === String(previousPrimaryTid)))
      ) {
        delete next[key];
      }
    }
  });

  return next;
}

/** Clear tracks for the same group as the modal source slot (1–3 together, or 4 alone). */
function clearGuestElectiveTracksForSlot(sourceRow, electiveRows, programs, existingBySlot = {}) {
  if (!sourceRow) return {};
  const fromElectiveFour = isGuestElectiveFourRow(sourceRow);
  const next = { ...(existingBySlot || {}) };
  const primaryTid = getGuestPrimaryElectiveTrackId(existingBySlot, electiveRows, programs);

  electiveRows.forEach((row) => {
    if (!isTrackBasedElectiveRow(row, programs)) return;
    const key = guestElectiveSlotKey(row);
    if (!key) return;
    const num = electiveSlotSortValue(row);
    if (fromElectiveFour) {
      if (num === 4) delete next[key];
      return;
    }
    if (num >= 1 && num <= 3) {
      delete next[key];
    } else if (
      num === 4 &&
      primaryTid &&
      String(existingBySlot[key] || '') === String(primaryTid)
    ) {
      // Digi auto-fills Elective 4 — clear it with Electives 1–3.
      delete next[key];
    }
  });

  return next;
}

/** Track id currently applied to Electives 1–3 (if any). */
function getGuestPrimaryElectiveTrackId(trackBySlot, electiveRows, programs) {
  if (!trackBySlot) return '';
  for (const row of electiveRows || []) {
    if (!isTrackBasedElectiveRow(row, programs)) continue;
    const num = electiveSlotSortValue(row);
    if (num < 1 || num > 3) continue;
    const tid = getGuestTrackIdForRow(row, trackBySlot);
    if (tid) return tid;
  }
  return '';
}

function guestElectiveSlotKey(row) {
  const id = row?.elective_slot_id ?? electiveSlot(row)?.elective_slot_id;
  return id != null && id !== '' ? String(id) : null;
}

/** Per-slot track map → track id for this elective row. */
function getGuestTrackIdForRow(row, trackBySlot) {
  const key = guestElectiveSlotKey(row);
  if (!key || !trackBySlot) return '';
  const tid = trackBySlot[key];
  return tid != null && tid !== '' ? String(tid) : '';
}

function getAssignedElectiveSubjectNames(row) {
  return electiveSubjects(row)
    .map((es) => es.subject?.subject_name)
    .filter(Boolean);
}

function getPenCodePartsForGuest(
  row,
  electiveTrackId,
  programs,
  allElectiveRows = null,
  trackBySlot = null,
) {
  if (!isElectiveSlotRow(row)) return getPenCodeParts(row);
  if (!isTrackBasedElectiveRow(row, programs)) return getPenCodeParts(row);
  if (!electiveTrackId) return [];
  const es = resolveElectiveSubject(
    row,
    electiveTrackId,
    allElectiveRows,
    trackBySlot,
    programs,
  );
  const code = es?.subject?.subject_code;
  return code ? [String(code).trim()].filter(Boolean) : [];
}

function getDisplayTitleForGuest(
  row,
  electiveTrackId,
  programs,
  allElectiveRows = null,
  trackBySlot = null,
) {
  if (!isElectiveSlotRow(row)) return getTitle(row);
  const slot = electiveSlot(row);
  if (!isTrackBasedElectiveRow(row, programs)) {
    const names = getAssignedElectiveSubjectNames(row);
    if (names.length) return names.join(' / ');
    return slot?.slot_name || 'Elective';
  }
  if (!electiveTrackId) return slot?.slot_name || 'Elective';
  const es = resolveElectiveSubject(
    row,
    electiveTrackId,
    allElectiveRows,
    trackBySlot,
    programs,
  );
  if (es?.subject?.subject_name) return es.subject.subject_name;
  return '—';
}

function getUnitsForGuest(
  row,
  electiveTrackId,
  programs,
  allElectiveRows = null,
  trackBySlot = null,
) {
  if (!isElectiveSlotRow(row)) return getUnits(row);
  if (!isTrackBasedElectiveRow(row, programs)) return getUnits(row);
  // IT track electives are fixed at 3 units even before a track is chosen.
  if (electiveTrackId) {
    const es = resolveElectiveSubject(
      row,
      electiveTrackId,
      allElectiveRows,
      trackBySlot,
      programs,
    );
    if (es?.subject?.number_of_units != null) return es.subject.number_of_units;
  }
  const fromSlot = getUnits(row);
  if (fromSlot !== '—') return fromSlot;
  return 3;
}

function getUnits(row) {
  if (row.subject?.number_of_units != null) return row.subject.number_of_units;
  const slot = electiveSlot(row);
  const subs = slot?.electiveSubjects || slot?.elective_subjects;
  if (Array.isArray(subs) && subs[0]?.subject?.number_of_units != null) {
    return subs[0].subject.number_of_units;
  }
  return '—';
}

function parseUnitsNumber(units) {
  if (units === '—' || units === '' || units == null) return null;
  const n = typeof units === 'number' ? units : Number(String(units).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Collect curriculum + subject requisite rows for a guest curriculum row. */
function getGuestRequisiteList(row) {
  const fromCurriculum = row?.requisite;
  const fromSubject = row?.subject?.prerequisites;
  return [
    ...(Array.isArray(fromCurriculum) ? fromCurriculum : fromCurriculum ? [fromCurriculum] : []),
    ...(Array.isArray(fromSubject) ? fromSubject : fromSubject ? [fromSubject] : []),
  ];
}

/** Prerequisite labels only (P: …). Includes admin elective-slot prerequisites. */
function formatGuestPrerequisite(row) {
  const labels = [];
  const list = getGuestRequisiteList(row);

  const prereqRuleLabels = [
    ...new Set(
      list
        .filter((r) => {
          const type = String(r?.requisite_type || r?.type || 'prerequisite').toLowerCase();
          return type !== 'corequisite';
        })
        .map((r) => String(r?.rule_label || '').trim())
        .filter(Boolean),
    ),
  ];
  if (prereqRuleLabels.length) {
    prereqRuleLabels.forEach((label) => labels.push(`P: ${label}`));
  } else {
    list.forEach((r) => {
      const type = String(r?.requisite_type || r?.type || 'prerequisite').toLowerCase();
      if (type === 'corequisite') return;
      const required = r?.requiredSubject || r?.required_subject;
      const code = required?.subject_code;
      if (code) labels.push(`P: ${code}`);
    });
  }

  // Admin → Elective Slots → Prerequisite slot (e.g. Electives 2/3/4 → Electives 1)
  getGuestRequiredPrerequisiteSlots(row).forEach((p) => {
    if (p.slot_name) labels.push(`P: ${p.slot_name}`);
  });

  return labels.length ? [...new Set(labels)].join(', ') : '';
}

/** Corequisite subject codes for this row. */
function getGuestCorequisiteCodes(row) {
  const codes = [];
  for (const r of getGuestRequisiteList(row)) {
    const type = String(r?.requisite_type || r?.type || 'prerequisite').toLowerCase();
    if (type !== 'corequisite') continue;
    const required = r?.requiredSubject || r?.required_subject;
    const code = required?.subject_code;
    if (code) codes.push(String(code).trim());
  }
  return [...new Set(codes)];
}

/**
 * Tag copy for corequisites: both this subject and its coreq must be passed.
 * Uses bidirectional links so either side of the pair shows the note.
 * @returns {{ codes: string[], text: string } | null}
 */
function getGuestCorequisiteTag(row, scopeRows = null) {
  const forward = getGuestCorequisiteCodes(row);
  let codes = forward;
  if (scopeRows?.length) {
    const cluster = collectGuestCorequisiteCluster(row, scopeRows);
    if (cluster.length >= 2) {
      codes = cluster
        .filter((r) => String(r.curriculum_id) !== String(row.curriculum_id))
        .map((r) => r?.subject?.subject_code)
        .filter(Boolean);
    }
  }
  if (codes.length === 0) return null;
  const codeList = [...new Set(codes.map((c) => String(c).trim()))].join(', ');
  const text =
    codes.length === 1
      ? `Pass both this subject and ${codeList} (coreq)`
      : `Pass this subject together with ${codeList} (coreqs)`;
  return { codes: [...new Set(codes.map((c) => String(c).trim()))], text };
}

function normalizeGuestSubjectCode(code) {
  return String(code || '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

/** Prerequisite subject codes only (corequisites are concurrent and do not block credit). */
function getGuestPrerequisiteCodes(row) {
  const list = getGuestRequisiteList(row);
  const codes = [];
  for (const r of list) {
    const type = String(r?.requisite_type || r?.type || 'prerequisite').toLowerCase();
    if (type === 'corequisite') continue;
    // Standing / "all subjects" style rules have no required subject code — skip for click lock.
    if (r?.rule_label && !(r?.requiredSubject || r?.required_subject)?.subject_code) continue;
    const required = r?.requiredSubject || r?.required_subject;
    const code = required?.subject_code;
    if (code) codes.push(String(code).trim());
  }
  return [...new Set(codes)];
}

function findGuestRowBySubjectCode(rows, code) {
  const want = normalizeGuestSubjectCode(code);
  if (!want) return null;
  return (
    rows.find((row) => normalizeGuestSubjectCode(row?.subject?.subject_code) === want) || null
  );
}

/** Same-term / catalog rows linked by corequisite edges (bidirectional). */
function collectGuestCorequisiteCluster(seedRow, scopeRows) {
  if (!seedRow || !scopeRows?.length) return seedRow ? [seedRow] : [];
  const byCode = new Map();
  scopeRows.forEach((r) => {
    const c = normalizeGuestSubjectCode(r?.subject?.subject_code);
    if (c) byCode.set(c, r);
  });
  const cluster = new Set([seedRow]);
  let frontier = [seedRow];
  for (let hop = 0; hop < 6 && frontier.length; hop += 1) {
    const nextF = [];
    for (const r of frontier) {
      const rCode = normalizeGuestSubjectCode(r?.subject?.subject_code);
      const neighbors = [];
      for (const code of getGuestCorequisiteCodes(r)) {
        const hit = findGuestRowBySubjectCode(scopeRows, code);
        if (hit && hit !== r) neighbors.push(hit);
      }
      if (rCode) {
        for (const other of scopeRows) {
          if (other === r) continue;
          for (const code of getGuestCorequisiteCodes(other)) {
            if (normalizeGuestSubjectCode(code) === rCode) neighbors.push(other);
          }
        }
      }
      for (const nb of neighbors) {
        if (!cluster.has(nb)) {
          cluster.add(nb);
          nextF.push(nb);
        }
      }
    }
    frontier = nextF;
  }
  return [...cluster];
}

/**
 * @returns {{ ok: boolean, unmet: string[] }}
 */
function guestPrerequisitesMet(scopeRows, targetRow, remarksMap) {
  const codes = getGuestPrerequisiteCodes(targetRow);
  if (codes.length === 0) return { ok: true, unmet: [] };
  const unmet = [];
  for (const code of codes) {
    const prereqRow = findGuestRowBySubjectCode(scopeRows, code);
    // Subject not in this curriculum catalog → skip hard block.
    if (!prereqRow) continue;
    if (remarksMap[prereqRow.curriculum_id] !== 'passed') {
      unmet.push(code);
    }
  }
  return { ok: unmet.length === 0, unmet };
}

/**
 * Whether this row can be credited now, including corequisite partners
 * (partners must already be credited or have their own prerequisites met).
 * Elective slots also require 3rd year standing (credited units ≥ end of 2nd year).
 * @returns {{ ok: boolean, reason?: 'prereq'|'coreq'|'standing', unmet: string[], cluster: object[] }}
 */
function guestCanCreditWithCorequisites(
  scopeRows,
  targetRow,
  remarksMap,
  yearLevels,
  trackBySlot,
  programs,
) {
  const cluster = collectGuestCorequisiteCluster(targetRow, scopeRows);

  if (isElectiveSlotRow(targetRow) && yearLevels) {
    const adminSlotPrereqs = getGuestRequiredPrerequisiteSlots(targetRow, scopeRows);
    // Only slots without a slot-prereq (e.g. Electives 1) need 3rd year standing.
    // Electives 2/3/4 use Admin prerequisite slot (Electives 1) instead.
    if (adminSlotPrereqs.length === 0) {
      if (
        !guestHasThirdYearStandingForElectives(
          scopeRows,
          remarksMap,
          yearLevels,
          trackBySlot,
          programs,
        )
      ) {
        return {
          ok: false,
          reason: 'standing',
          unmet: ['3rd year standing (credited units must reach end of 2nd year)'],
          cluster,
        };
      }
    }
    const electivePrior = guestElectiveAdminPrerequisitesMet(scopeRows, targetRow, remarksMap);
    if (!electivePrior.ok) {
      return {
        ok: false,
        reason: 'elective_prior',
        unmet: electivePrior.unmet,
        cluster,
      };
    }
  }

  const standingReq = getGuestStandingPrerequisite(targetRow);
  if (standingReq && yearLevels) {
    const status = guestYearStandingPrerequisiteStatus(
      scopeRows,
      remarksMap,
      yearLevels,
      trackBySlot,
      programs,
      standingReq.standingYear,
      standingReq.label,
    );
    if (!status.ok) {
      return {
        ok: false,
        reason: 'standing',
        unmet: [
          `${status.label} needs ${status.needed} credited units (you have ${status.have.toFixed(1)})`,
        ],
        cluster,
      };
    }
  }

  const prereqGate = guestPrerequisitesMet(scopeRows, targetRow, remarksMap);
  if (!prereqGate.ok) {
    return { ok: false, reason: 'prereq', unmet: prereqGate.unmet, cluster };
  }

  const unmet = [];
  for (const partner of cluster) {
    if (String(partner.curriculum_id) === String(targetRow.curriculum_id)) continue;
    if (remarksMap[partner.curriculum_id] === 'passed') continue;
    const partnerPrereq = guestPrerequisitesMet(scopeRows, partner, remarksMap);
    if (!partnerPrereq.ok) {
      const code = partner?.subject?.subject_code || 'coreq';
      unmet.push(
        partnerPrereq.unmet.length
          ? `${code} (needs ${partnerPrereq.unmet.join(', ')})`
          : code,
      );
    }
  }
  if (unmet.length) {
    return { ok: false, reason: 'coreq', unmet, cluster };
  }
  return { ok: true, unmet: [], cluster };
}

/** Apply credit to a row and every linked corequisite partner. */
function creditGuestCluster(scopeRows, seedRow, remarksMap, yearLevels, trackBySlot, programs) {
  const gate = guestCanCreditWithCorequisites(
    scopeRows,
    seedRow,
    remarksMap,
    yearLevels,
    trackBySlot,
    programs,
  );
  if (!gate.ok) return { ok: false, next: remarksMap, gate };
  const next = { ...remarksMap };
  for (const row of gate.cluster) {
    if (isElectiveSlotRow(row) && yearLevels) {
      const adminSlotPrereqs = getGuestRequiredPrerequisiteSlots(row, scopeRows);
      if (adminSlotPrereqs.length === 0) {
        if (
          !guestHasThirdYearStandingForElectives(
            scopeRows,
            next,
            yearLevels,
            trackBySlot,
            programs,
          )
        ) {
          continue;
        }
      } else if (!guestElectiveAdminPrerequisitesMet(scopeRows, row, next).ok) {
        continue;
      }
    }
    if (guestPrerequisitesMet(scopeRows, row, next).ok) {
      next[row.curriculum_id] = 'passed';
    }
  }
  return { ok: true, next, gate };
}

/** Clear credit on a row and its corequisite cluster. */
function uncreditGuestCluster(scopeRows, seedRow, remarksMap, yearLevels, trackBySlot, programs) {
  const cluster = collectGuestCorequisiteCluster(seedRow, scopeRows);
  const next = { ...remarksMap };
  for (const row of cluster) {
    delete next[row.curriculum_id];
  }
  return clearGuestDependentCredits(scopeRows, next, yearLevels, trackBySlot, programs);
}

/** Marked Credited AND prereqs met AND linked coreqs also credited. */
function isGuestEffectivelyCredited(scopeRows, row, remarksMap) {
  if (remarksMap[row.curriculum_id] !== 'passed') return false;
  if (!guestPrerequisitesMet(scopeRows, row, remarksMap).ok) return false;
  const cluster = collectGuestCorequisiteCluster(row, scopeRows);
  if (cluster.length < 2) return true;
  return cluster.every((r) => remarksMap[r.curriculum_id] === 'passed');
}

/** After un-crediting a subject, also clear any subjects that required it. */
function clearGuestDependentCredits(scopeRows, remarksMap, yearLevels, trackBySlot, programs) {
  const next = { ...remarksMap };
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of scopeRows) {
      if (next[row.curriculum_id] !== 'passed') continue;
      if (!guestPrerequisitesMet(scopeRows, row, next).ok) {
        delete next[row.curriculum_id];
        // Also drop linked coreqs so pairs stay in sync.
        for (const partner of collectGuestCorequisiteCluster(row, scopeRows)) {
          if (next[partner.curriculum_id] === 'passed') {
            delete next[partner.curriculum_id];
          }
        }
        changed = true;
      } else {
        const cluster = collectGuestCorequisiteCluster(row, scopeRows);
        if (cluster.length >= 2 && cluster.some((r) => next[r.curriculum_id] !== 'passed')) {
          for (const partner of cluster) {
            if (next[partner.curriculum_id] === 'passed') {
              delete next[partner.curriculum_id];
              changed = true;
            }
          }
        }
      }
    }
  }
  if (!yearLevels) return next;
  let afterStanding = clearGuestElectivesWithoutStanding(
    scopeRows,
    next,
    yearLevels,
    trackBySlot,
    programs,
  );
  return clearGuestElectivesMissingAdminPrereq(scopeRows, afterStanding);
}

function getGuestRequiredPrerequisiteSlots(row, scopeRows = null) {
  const fromApi = row?.prerequisite_elective_slots;
  if (Array.isArray(fromApi) && fromApi.length) {
    return fromApi;
  }
  const slot = row?.elective_slot || row?.electiveSlot;
  const preId = slot?.prerequisite_slot_id;
  if (preId == null || preId === '') {
    return [];
  }
  const preSlot = slot?.prerequisite_slot || slot?.prerequisiteSlot;
  const name =
    (preSlot?.slot_name && String(preSlot.slot_name).trim()) || 'IT Electives 1';
  return [{ elective_slot_id: Number(preId), slot_name: name }];
}

/**
 * Electives 2/3/4 (etc.) follow admin Prerequisite Slot — usually Electives 1.
 */
function guestElectiveAdminPrerequisitesMet(scopeRows, targetRow, remarksMap) {
  const required = getGuestRequiredPrerequisiteSlots(targetRow, scopeRows);
  if (!required.length) return { ok: true, unmet: [] };

  const unmet = [];
  for (const req of required) {
    const prereqRow = (scopeRows || []).find((row) => {
      if (!isElectiveSlotRow(row)) return false;
      return String(guestElectiveSlotKey(row)) === String(req.elective_slot_id);
    });
    if (!prereqRow || !isGuestEffectivelyCredited(scopeRows, prereqRow, remarksMap)) {
      unmet.push(req.slot_name || 'required elective');
    }
  }
  return { ok: unmet.length === 0, unmet };
}

/** Clear electives whose admin prerequisite slot is no longer credited. */
function clearGuestElectivesMissingAdminPrereq(scopeRows, remarksMap) {
  const next = { ...remarksMap };
  let changed = false;
  for (const row of scopeRows || []) {
    if (!isElectiveSlotRow(row)) continue;
    if (next[row.curriculum_id] !== 'passed') continue;
    if (!guestElectiveAdminPrerequisitesMet(scopeRows, row, next).ok) {
      delete next[row.curriculum_id];
      changed = true;
    }
  }
  return changed ? clearGuestDependentCredits(scopeRows, next, null) : next;
}

/**
 * Electives require 3rd year standing by units:
 * credited units ≥ total units of year levels 1 + 2 (e.g. 46 + 48 = 96).
 */
function guestHasThirdYearStandingForElectives(
  scopeRows,
  remarksMap,
  yearLevels,
  trackBySlot = {},
  programs = [],
) {
  if (!Array.isArray(scopeRows) || !scopeRows.length || !yearLevels) return false;

  const studyMap = buildGuestStudyMap(
    scopeRows.filter((row) => !isElectiveSlotRow(row)),
    yearLevels,
    trackBySlot,
    programs,
  );
  if (!studyMap.length) return true;

  const yearTwoThreshold = studyMap
    .filter((year) => yearStandingIndex(yearLevels, year.yearId) <= 2)
    .reduce((sum, year) => sum + (Number(year.totalUnits) || 0), 0);

  // No 1st/2nd year rows in map → do not block.
  if (yearTwoThreshold <= 0) return true;

  let creditedUnits = 0;
  scopeRows.forEach((row) => {
    if (!isGuestEffectivelyCredited(scopeRows, row, remarksMap)) return;
    const trackId = getGuestTrackIdForRow(row, trackBySlot);
    const n = parseUnitsNumber(
      getUnitsForGuest(row, trackId, programs, scopeRows, trackBySlot),
    );
    if (n != null) creditedUnits += n;
  });

  return creditedUnits >= yearTwoThreshold;
}

/** Drop Elective-1-style credits when 3rd year standing is lost (slots with no admin slot-prereq). */
function clearGuestElectivesWithoutStanding(
  scopeRows,
  remarksMap,
  yearLevels,
  trackBySlot,
  programs,
) {
  if (
    guestHasThirdYearStandingForElectives(
      scopeRows,
      remarksMap,
      yearLevels,
      trackBySlot,
      programs,
    )
  ) {
    return remarksMap;
  }
  const next = { ...remarksMap };
  let changed = false;
  for (const row of scopeRows) {
    if (!isElectiveSlotRow(row)) continue;
    // Electives 2/3/4 keep admin prereq; only clear standing-gated slots (Elective 1).
    if (getGuestRequiredPrerequisiteSlots(row, scopeRows).length > 0) continue;
    if (next[row.curriculum_id] === 'passed') {
      delete next[row.curriculum_id];
      changed = true;
    }
  }
  // Pass null yearLevels so we do not recurse back into this sweep.
  return changed ? clearGuestDependentCredits(scopeRows, next, null) : next;
}

function lookupYearLabel(yearId, yearLevels) {
  if (yearId == null || yearId === '') return 'Unknown year';
  const y = yearLevels.find((yl) => String(yl.year_level_id) === String(yearId));
  return y?.year_level || `Year (${yearId})`;
}

function lookupSemesterLabel(semId, semesters) {
  if (semId == null || semId === '') return 'Unknown semester';
  const s = semesters.find((sem) => String(sem.semester_id) === String(semId));
  return s?.semester_name || `Semester (${semId})`;
}

/** Classify semester as first / second / summer for planner move rules. */
function getGuestSemesterKind(semId, semesters) {
  const name = String(lookupSemesterLabel(semId, semesters) || '').toLowerCase();
  if (/summer|mid\s*-?\s*year|midyear/.test(name)) return 'summer';
  if (/2nd|second/.test(name)) return 'second';
  if (/1st|first/.test(name)) return 'first';
  const id = String(semId ?? '');
  if (id === '3') return 'summer';
  if (id === '2') return 'second';
  if (id === '1') return 'first';
  return 'other';
}

/** Within a year: 1st → Summer (mid-year) → 2nd. */
function guestSemesterKindSortOrder(semId, semesters) {
  const kind = getGuestSemesterKind(semId, semesters);
  if (kind === 'first') return 0;
  if (kind === 'summer') return 1;
  if (kind === 'second') return 2;
  return 3 + orderInList(semesters, semId, 'semester_id');
}

/**
 * Planner move rules:
 * - 1st semester subjects → 1st semester or Summer (any year)
 * - 2nd semester subjects → 2nd semester or Summer (any year)
 * - Summer subjects → Summer only
 */
function guestSubjectCanMoveToSemester(homeSemId, targetSemId, semesters) {
  const home = getGuestSemesterKind(homeSemId, semesters);
  const target = getGuestSemesterKind(targetSemId, semesters);
  if (home === 'first') return target === 'first' || target === 'summer';
  if (home === 'second') return target === 'second' || target === 'summer';
  if (home === 'summer') return target === 'summer';
  return String(homeSemId ?? '') === String(targetSemId ?? '');
}

/** Comparable planner term order (earlier term = smaller rank). */
function guestPlannerTermRank(yearId, semId, yearLevels, semesters) {
  const y = yearStandingIndex(yearLevels, yearId);
  const s = guestSemesterKindSortOrder(semId, semesters);
  return y * 1000 + s;
}

function getGuestPlannerPlacement(row, placements) {
  const id = String(row?.curriculum_id ?? '');
  return (
    placements?.[id] || {
      yearId: getYearLevelId(row),
      semId: getSemesterId(row),
    }
  );
}

/**
 * Parse "Nth year standing" rule_label from admin requisites.
 * @returns {{ standingYear: number, label: string } | null}
 */
function getGuestStandingPrerequisite(row) {
  const list = getGuestRequisiteList(row);
  for (const r of list) {
    const type = String(r?.requisite_type || r?.type || 'prerequisite').toLowerCase();
    if (type === 'corequisite') continue;
    const label = String(r?.rule_label || '').trim();
    const match = label.match(
      /^(2|2nd|second|3|3rd|third|4|4th|fourth|5|5th|fifth)\s+year\s+standing$/i,
    );
    if (!match) continue;
    const key = String(match[1]).toLowerCase();
    const yearWords = {
      2: 2,
      '2nd': 2,
      second: 2,
      3: 3,
      '3rd': 3,
      third: 3,
      4: 4,
      '4th': 4,
      fourth: 4,
      5: 5,
      '5th': 5,
      fifth: 5,
    };
    const standingYear = yearWords[key];
    if (!standingYear) continue;
    const suffix = standingYear === 2 ? 'nd' : standingYear === 3 ? 'rd' : 'th';
    return {
      standingYear,
      label: `${standingYear}${suffix} year standing`,
    };
  }
  return null;
}

/** Total effectively credited units in the guest simulation. */
function guestCreditedUnitsTotal(scopeRows, remarksMap, trackBySlot = {}, programs = []) {
  let credited = 0;
  (scopeRows || []).forEach((row) => {
    if (!isGuestEffectivelyCredited(scopeRows, row, remarksMap)) return;
    const trackId = getGuestTrackIdForRow(row, trackBySlot);
    const n = parseUnitsNumber(
      getUnitsForGuest(row, trackId, programs, scopeRows, trackBySlot),
    );
    if (n != null) credited += n;
  });
  return credited;
}

/**
 * Units required to unlock Nth year standing = sum of years 1..(N-1)
 * e.g. 2nd≈46, 3rd≈94, 4th≈132 when curriculum totals match.
 */
function guestStandingUnitsThreshold(
  scopeRows,
  yearLevels,
  trackBySlot = {},
  programs = [],
  standingYear,
) {
  const studyMap = buildGuestStudyMap(scopeRows || [], yearLevels, trackBySlot, programs);
  return studyMap
    .filter((year) => yearStandingIndex(yearLevels, year.yearId) < standingYear)
    .reduce((sum, year) => sum + (Number(year.totalUnits) || 0), 0);
}

/**
 * @returns {{ ok: boolean, needed: number, have: number, label: string, standingYear: number }}
 */
function guestYearStandingPrerequisiteStatus(
  scopeRows,
  remarksMap,
  yearLevels,
  trackBySlot,
  programs,
  standingYear,
  label,
) {
  const needed = guestStandingUnitsThreshold(
    scopeRows,
    yearLevels,
    trackBySlot,
    programs,
    standingYear,
  );
  const have = guestCreditedUnitsTotal(scopeRows, remarksMap, trackBySlot, programs);
  return {
    ok: needed <= 0 ? true : have >= needed,
    needed,
    have,
    label: label || `${standingYear}th year standing`,
    standingYear,
  };
}

/**
 * Block planner moves that put a subject in the same term as (or before) its prerequisites,
 * or that push a prerequisite after a subject that still needs it.
 * Includes Admin elective-slot prerequisites and year-standing unit thresholds.
 * @returns {{ ok: boolean, conflicts: string[] }}
 */
function guestPlannerPrereqMoveGate(
  row,
  targetYearId,
  targetSemId,
  {
    scopeRows,
    remainingRows,
    placements,
    remarks,
    yearLevels,
    semesters,
    trackBySlot = {},
    programs = [],
  },
) {
  if (!row) return { ok: true, conflicts: [] };
  const targetRank = guestPlannerTermRank(targetYearId, targetSemId, yearLevels, semesters);
  const conflicts = [];

  const standingReq = getGuestStandingPrerequisite(row);
  if (standingReq) {
    const status = guestYearStandingPrerequisiteStatus(
      scopeRows,
      remarks,
      yearLevels,
      trackBySlot,
      programs,
      standingReq.standingYear,
      standingReq.label,
    );
    if (!status.ok) {
      conflicts.push(
        `${status.label} needs ${status.needed} credited units (you have ${status.have.toFixed(1)})`,
      );
    }
  }

  const movingCode = row?.subject?.subject_code || 'This subject';
  for (const code of getGuestPrerequisiteCodes(row)) {
    const prereqRow = findGuestRowBySubjectCode(scopeRows, code);
    if (!prereqRow) continue;
    if (remarks?.[prereqRow.curriculum_id] === 'passed') continue;
    const placement = getGuestPlannerPlacement(prereqRow, placements);
    const prereqRank = guestPlannerTermRank(
      placement.yearId,
      placement.semId,
      yearLevels,
      semesters,
    );
    if (prereqRank >= targetRank) {
      const sameTerm = prereqRank === targetRank;
      conflicts.push(
        sameTerm
          ? `Take ${code} first — ${movingCode} requires it and they cannot be taken in the same term.`
          : `Take ${code} first — it must be scheduled in an earlier term than ${movingCode}.`,
      );
    }
  }

  // Admin elective slot prerequisites (Electives 2/3/4 → Electives 1, etc.)
  for (const req of getGuestRequiredPrerequisiteSlots(row, scopeRows)) {
    const prereqRow = (scopeRows || []).find(
      (r) =>
        isElectiveSlotRow(r) && String(guestElectiveSlotKey(r)) === String(req.elective_slot_id),
    );
    const label = req.slot_name || 'required elective';
    if (!prereqRow) {
      conflicts.push(`${label} must be credited or scheduled before this elective`);
      continue;
    }
    if (remarks?.[prereqRow.curriculum_id] === 'passed') continue;

    const prereqStillOpen = (remainingRows || []).some(
      (r) => String(r.curriculum_id) === String(prereqRow.curriculum_id),
    );
    if (!prereqStillOpen) {
      conflicts.push(`Credit ${label} before inserting this elective`);
      continue;
    }

    const placement = getGuestPlannerPlacement(prereqRow, placements);
    const prereqRank = guestPlannerTermRank(
      placement.yearId,
      placement.semId,
      yearLevels,
      semesters,
    );
    if (prereqRank >= targetRank) {
      const sameTerm = prereqRank === targetRank;
      conflicts.push(
        sameTerm
          ? `Take ${label} first — this elective requires it and they cannot be taken in the same term.`
          : `Take ${label} first — it must be scheduled in an earlier term than this elective.`,
      );
    }
  }

  const myCode = row?.subject?.subject_code;
  if (myCode) {
    const myNorm = normalizeGuestSubjectCode(myCode);
    for (const other of remainingRows || []) {
      if (String(other.curriculum_id) === String(row.curriculum_id)) continue;
      if (remarks?.[other.curriculum_id] === 'passed') continue;
      const needsMe = getGuestPrerequisiteCodes(other).some(
        (c) => normalizeGuestSubjectCode(c) === myNorm,
      );
      if (!needsMe) continue;
      const otherPlacement = getGuestPlannerPlacement(other, placements);
      const otherRank = guestPlannerTermRank(
        otherPlacement.yearId,
        otherPlacement.semId,
        yearLevels,
        semesters,
      );
      if (otherRank <= targetRank) {
        const otherCode = other?.subject?.subject_code || 'another subject';
        const sameTerm = otherRank === targetRank;
        conflicts.push(
          sameTerm
            ? `Take ${myCode} first — ${otherCode} requires it and they cannot be taken in the same term.`
            : `Take ${myCode} before ${otherCode} — keep ${myCode} in an earlier term, or move ${otherCode} later.`,
        );
      }
    }
  }

  // If this row is an elective slot, keep dependent electives in later terms.
  if (isElectiveSlotRow(row)) {
    const mySlotId = String(guestElectiveSlotKey(row) || '');
    const mySlotName =
      electiveSlot(row)?.slot_name || row?.elective_slot_name || 'this elective';
    if (mySlotId) {
      for (const other of remainingRows || []) {
        if (String(other.curriculum_id) === String(row.curriculum_id)) continue;
        if (remarks?.[other.curriculum_id] === 'passed') continue;
        const needs = getGuestRequiredPrerequisiteSlots(other, scopeRows);
        if (!needs.some((n) => String(n.elective_slot_id) === mySlotId)) continue;
        const otherPlacement = getGuestPlannerPlacement(other, placements);
        const otherRank = guestPlannerTermRank(
          otherPlacement.yearId,
          otherPlacement.semId,
          yearLevels,
          semesters,
        );
        if (otherRank <= targetRank) {
          const otherName =
            electiveSlot(other)?.slot_name ||
            other?.elective_slot_name ||
            'another elective';
          const sameTerm = otherRank === targetRank;
          conflicts.push(
            sameTerm
              ? `Take ${mySlotName} first — ${otherName} requires it and they cannot be taken in the same term.`
              : `Take ${mySlotName} before ${otherName} — keep it in an earlier term.`,
          );
        }
      }
    }
  }

  return { ok: conflicts.length === 0, conflicts };
}

/** Plain-text planner hints: Summer eligibility + why some terms are blocked. */
function buildGuestPlannerMoveNotes(
  row,
  {
    scopeRows,
    remarks,
    semesters,
    yearLevels,
    trackBySlot = {},
    programs = [],
  },
) {
  if (!row) return [];
  const notes = [];
  const homeKind = getGuestSemesterKind(getSemesterId(row), semesters);

  if (homeKind === 'first' || homeKind === 'second') {
    const hasSummer = (semesters || []).some(
      (s) => getGuestSemesterKind(s.semester_id, semesters) === 'summer',
    );
    if (hasSummer) {
      notes.push('This subject can also be taken in Summer (see Summer options in Move to).');
    }
  } else if (homeKind === 'summer') {
    notes.push('This subject can only be taken in Summer.');
  }

  const standingReq = getGuestStandingPrerequisite(row);
  if (standingReq && yearLevels) {
    const status = guestYearStandingPrerequisiteStatus(
      scopeRows,
      remarks,
      yearLevels,
      trackBySlot,
      programs,
      standingReq.standingYear,
      standingReq.label,
    );
    if (!status.ok) {
      // Keep standing message simple (same style as before) — units in a short aside.
      notes.push(`Prerequisite: ${status.label}.`);
      notes.push(
        `Need ${status.needed} credited units for ${status.label} (you have ${status.have.toFixed(1)}).`,
      );
      return notes;
    }
  }

  const activePrereqCodes = getGuestPrerequisiteCodes(row).filter((code) => {
    const prereqRow = findGuestRowBySubjectCode(scopeRows, code);
    if (!prereqRow) return false;
    return remarks?.[prereqRow.curriculum_id] !== 'passed';
  });
  const activeElectiveSlotPrereqs = getGuestRequiredPrerequisiteSlots(row, scopeRows).filter(
    (req) => {
      const prereqRow = (scopeRows || []).find(
        (r) =>
          isElectiveSlotRow(r) && String(guestElectiveSlotKey(r)) === String(req.elective_slot_id),
      );
      if (!prereqRow) return true;
      return remarks?.[prereqRow.curriculum_id] !== 'passed';
    },
  );
  if (activePrereqCodes.length > 0 || activeElectiveSlotPrereqs.length > 0) {
    const parts = [];
    if (activePrereqCodes.length) {
      parts.push(activePrereqCodes.join(', '));
    }
    activeElectiveSlotPrereqs.forEach((p) => {
      const name = p.slot_name;
      if (name && !parts.some((part) => String(part).includes(name))) {
        parts.push(name);
      }
    });
    notes.push(`Prerequisite: ${parts.join('; ')}.`);
    notes.push(
      'Cannot insert/move here until prerequisite(s) are credited or scheduled in an earlier term.',
    );
  }

  return notes;
}

function orderInList(list, id, idField) {
  if (id == null || id === '') return 100000;
  const i = list.findIndex((x) => String(x[idField]) === String(id));
  return i === -1 ? Number(id) || 99999 : i;
}

/** Max enrollable units per regular semester by curriculum year level
 *  (institutional load limits: 1st=23, 2nd=24, 3rd=19, 4th=12). */
const GUEST_MAX_UNITS_BY_YEAR = {
  1: 23,
  2: 24,
  3: 19,
  4: 12,
};
/** Extended study containers (beyond curriculum) use the same per-semester cap as 4th year. */
const GUEST_EXTENDED_SEM_UNIT_CAP = 12;
const GUEST_EXTENDED_MAX_YEAR = 10;

/** Max enrollable units for Summer / mid-year term. */
const GUEST_MAX_UNITS_SUMMER = 9;

function getMaxUnitsForYearIndex(yearIndex) {
  const idx = Math.max(1, Number(yearIndex) || 1);
  if (idx >= 4) return GUEST_EXTENDED_SEM_UNIT_CAP;
  return GUEST_MAX_UNITS_BY_YEAR[idx] ?? 19;
}

function guestOrdinalYearLabel(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 1) return `Year ${n}`;
  const mod100 = num % 100;
  const mod10 = num % 10;
  let suffix = 'th';
  if (mod100 < 11 || mod100 > 13) {
    if (mod10 === 1) suffix = 'st';
    else if (mod10 === 2) suffix = 'nd';
    else if (mod10 === 3) suffix = 'rd';
  }
  return `${num}${suffix}`;
}

/** Retake containers are not lookup year levels — label by sequence past curriculum. */
function guestExtendedStudyLabel(yearId, curriculumMaxYearId = 4) {
  const n = Number(yearId);
  const max = Number(curriculumMaxYearId) || 4;
  const seq = Math.max(1, (Number.isFinite(n) ? n : max + 1) - max);
  return `Extended study ${seq}`;
}

function guestExtendedYearEntry(yearId, curriculumMaxYearId = 4) {
  const yid = String(yearId);
  return {
    year_level_id: yid,
    year_level: guestExtendedStudyLabel(yid, curriculumMaxYearId),
  };
}

/** Per-slot load limit: Summer is always 9; regular terms use year caps. */
function getMaxUnitsForSlot(yearIndex, semId, semesterLabel = '') {
  const name = String(semesterLabel || '').toLowerCase();
  if (
    /summer|mid\s*-?\s*year|midyear/.test(name) ||
    String(semId ?? '') === '3'
  ) {
    return GUEST_MAX_UNITS_SUMMER;
  }
  return getMaxUnitsForYearIndex(yearIndex);
}

function buildGuestStudyMap(rows, yearLevels, trackBySlot, programs) {
  const byYear = new Map();
  rows.forEach((row) => {
    const yid = getYearLevelId(row);
    const key = String(yid ?? 'unknown');
    if (!byYear.has(key)) {
      byYear.set(key, {
        yearId: yid,
        yearLabel: lookupYearLabel(yid, yearLevels),
        yearOrder: orderInList(yearLevels, yid, 'year_level_id'),
        totalUnits: 0,
      });
    }
    const trackId = getGuestTrackIdForRow(row, trackBySlot);
    const n = parseUnitsNumber(getUnitsForGuest(row, trackId, programs, rows, trackBySlot));
    if (n != null) byYear.get(key).totalUnits += n;
  });

  let cumulative = 0;
  return [...byYear.values()]
    .sort((a, b) => a.yearOrder - b.yearOrder)
    .map((year) => {
      cumulative += year.totalUnits;
      return {
        ...year,
        cumulativeThreshold: cumulative,
      };
    });
}

function resolveGuestStanding(studyMap, creditedUnits) {
  if (!studyMap.length) {
    return {
      standingYearIndex: 1,
      standingLabel: '1st Year',
      nextThreshold: null,
      unitsToNextStanding: 0,
    };
  }

  let standingYearIndex = 1;
  let standingLabel = studyMap[0].yearLabel;
  let nextThreshold = studyMap[0].cumulativeThreshold;

  for (let i = 0; i < studyMap.length; i++) {
    if (creditedUnits >= studyMap[i].cumulativeThreshold) {
      if (i + 1 < studyMap.length) {
        standingYearIndex = i + 2;
        standingLabel = studyMap[i + 1].yearLabel;
        nextThreshold = studyMap[i + 1].cumulativeThreshold;
      } else {
        standingYearIndex = studyMap.length;
        standingLabel = studyMap[i].yearLabel;
        nextThreshold = null;
      }
    } else {
      nextThreshold = studyMap[i].cumulativeThreshold;
      break;
    }
  }

  const unitsToNextStanding =
    nextThreshold != null ? Math.max(0, nextThreshold - creditedUnits) : 0;

  return { standingYearIndex, standingLabel, nextThreshold, unitsToNextStanding };
}

function groupGuestSections(rows, yearLevels, semesters) {
  const map = new Map();
  rows.forEach((row) => {
    const yid = getYearLevelId(row);
    const sid = getSemesterId(row);
    const key = `${yid ?? '∅'}|${sid ?? '∅'}`;
    if (!map.has(key)) {
      map.set(key, { yearId: yid, semId: sid, rows: [] });
    }
    map.get(key).rows.push(row);
  });

  const keys = [...map.keys()].sort((ka, kb) => {
    const a = map.get(ka);
    const b = map.get(kb);
    const yOrder =
      orderInList(yearLevels, a.yearId, 'year_level_id') -
      orderInList(yearLevels, b.yearId, 'year_level_id');
    if (yOrder !== 0) return yOrder;
    return (
      orderInList(semesters, a.semId, 'semester_id') -
      orderInList(semesters, b.semId, 'semester_id')
    );
  });

  return keys.map((key) => {
    const g = map.get(key);
    return {
      key,
      yearId: g.yearId,
      semId: g.semId,
      yearOrder: orderInList(yearLevels, g.yearId, 'year_level_id'),
      rows: g.rows,
    };
  });
}

function yearStandingIndex(yearLevels, yearId) {
  // year_level_id is 1-based standing (1st Year = 1, …, 5th+ extended).
  const n = Number(yearId);
  if (Number.isFinite(n) && n >= 1 && n <= GUEST_EXTENDED_MAX_YEAR) return n;
  const order = orderInList(yearLevels, yearId, 'year_level_id');
  return order === 100000 ? 1 : order + 1;
}

/**
 * Public curriculum simulation: filter catalog, mark rows completed, export PDF.
 */
export default function GuestPanel() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [curriculum, setCurriculum] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [yearLevels, setYearLevels] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [programFilter, setProgramFilter] = useState('');
  const [headerFilter, setHeaderFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [remarks, setRemarks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [guestName, setGuestName] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  /** Accordion open states: both containers stay stacked; Confirm/Back auto-collapse/expand. */
  const [simOpen, setSimOpen] = useState(true);
  const [plannerOpen, setPlannerOpen] = useState(false);
  /** Which step the floating Confirm/Back button follows. */
  const [activeStep, setActiveStep] = useState('simulate');
  /** Once Confirm is used, planner content is ready and can be opened manually. */
  const [plannerUnlocked, setPlannerUnlocked] = useState(false);
  /** curriculum_id → { yearId, semId } placement overrides for the planner. */
  const [plannerPlacements, setPlannerPlacements] = useState({});
  const [plannerDragId, setPlannerDragId] = useState(null);
  /** Extra years beyond the curriculum (5th, 6th, …) for longer guest simulations. */
  const [extendedYearIds, setExtendedYearIds] = useState([]);
  /** Semester slot key with inline insert dropdown open, e.g. "1|2". */
  const [plannerOpenInsertSlotKey, setPlannerOpenInsertSlotKey] = useState(null);
  /** slotId → trackId so each elective can use a different track (e.g. SysDev 1–3, Digi Arts 4). */
  const [guestElectiveTracks, setGuestElectiveTracks] = useState({});
  const [electiveTrackModalOpen, setElectiveTrackModalOpen] = useState(false);
  const [electiveTrackModalSlotId, setElectiveTrackModalSlotId] = useState(null);

  /** Guest subject-crediting simulation (other-school codes → local equivalence). */
  const [schools, setSchools] = useState([]);
  const [transferSchoolId, setTransferSchoolId] = useState('');
  const [transferCodesText, setTransferCodesText] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [transferResults, setTransferResults] = useState(null);

  useEffect(() => {
    setSimOpen(true);
    setPlannerOpen(false);
    setActiveStep('simulate');
    setPlannerUnlocked(false);
    setPlannerPlacements({});
    setPlannerDragId(null);
    setPlannerOpenInsertSlotKey(null);
    setExtendedYearIds([]);
  }, [programFilter, headerFilter, yearFilter, semesterFilter]);

  useEffect(() => {
    setGuestElectiveTracks({});
    setElectiveTrackModalSlotId(null);
    // Clear so the headerOptions effect auto-picks the first curriculum for the new program.
    setHeaderFilter('');
  }, [programFilter]);

  useEffect(() => {
    setGuestElectiveTracks({});
    setElectiveTrackModalSlotId(null);
  }, [headerFilter]);

  useEffect(() => {
    if (!electiveTrackModalOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setElectiveTrackModalOpen(false);
        setElectiveTrackModalSlotId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [electiveTrackModalOpen]);

  useEffect(() => {
    const load = async () => {
      try {
        const [curRes, lookRes, schoolsRes] = await Promise.all([
          api.get('/curriculum'),
          api.get('/curriculum/lookup/data'),
          api.get('/schools').catch(() => ({ data: [] })),
        ]);
        setCurriculum(Array.isArray(curRes.data) ? curRes.data : []);
        const p = lookRes.data?.programs || [];
        setPrograms(p);
        if (p.length >= 1) setProgramFilter(String(p[0].program_id));
        setYearLevels(lookRes.data?.yearLevels || lookRes.data?.year_levels || []);
        setSemesters(lookRes.data?.semesters || []);
        const schoolList = Array.isArray(schoolsRes.data) ? schoolsRes.data : schoolsRes.data?.data || [];
        setSchools(schoolList);
      } catch (e) {
        const msg = e.response?.data?.message || 'Could not load curriculum.';
        setError(msg);
        setCurriculum([]);
        await swalError('Could not load data', msg);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const headerOptions = useMemo(() => {
    const map = new Map();
    curriculum.forEach((row) => {
      if (programFilter && String(row.program_id) !== String(programFilter)) return;
      const hid = row.curriculum_header_id;
      if (hid == null) return;
      if (!map.has(hid)) {
        map.set(hid, curriculumHeaderLabel(row));
      }
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id: String(id), label }));
  }, [curriculum, programFilter]);

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

  useEffect(() => {
    if (headerOptions.length === 0) {
      if (headerFilter !== '') setHeaderFilter('');
      return;
    }
    // Always keep a real curriculum selected — never "All curricula".
    if (!headerFilter || !headerOptions.some((option) => option.id === headerFilter)) {
      setHeaderFilter(headerOptions[0].id);
    }
  }, [headerOptions, headerFilter]);

  const filteredRows = useMemo(() => {
    return curriculum.filter((row) => {
      if (programFilter && String(row.program_id) !== String(programFilter)) return false;
      if (headerFilter && String(row.curriculum_header_id ?? '') !== headerFilter) return false;
      if (yearFilter && String(getYearLevelId(row) ?? '') !== yearFilter) return false;
      if (semesterFilter && String(getSemesterId(row) ?? '') !== semesterFilter) return false;
      return true;
    });
  }, [curriculum, programFilter, headerFilter, yearFilter, semesterFilter]);

  /** Same program + curriculum header (ignore year/semester filters) — used for prerequisite checks. */
  const creditScopeRows = useMemo(() => {
    return curriculum.filter((row) => {
      if (programFilter && String(row.program_id) !== String(programFilter)) return false;
      if (headerFilter && String(row.curriculum_header_id ?? '') !== headerFilter) return false;
      return true;
    });
  }, [curriculum, programFilter, headerFilter]);

  const activeYearLevels = useMemo(() => {
    const yearIds = new Set(
      creditScopeRows
        .map((row) => getYearLevelId(row))
        .filter((id) => id != null && id !== '')
        .map((id) => String(id)),
    );
    if (yearIds.size === 0) return yearLevels;
    return yearLevels.filter((y) => yearIds.has(String(y.year_level_id)));
  }, [creditScopeRows, yearLevels]);

  const curriculumMaxYearId = useMemo(() => {
    let max = 0;
    activeYearLevels.forEach((y) => {
      const n = Number(y.year_level_id);
      if (Number.isFinite(n) && n > max) max = n;
    });
    return max > 0 ? max : 4;
  }, [activeYearLevels]);

  /** Curriculum years + guest-added extended study containers for the planner. */
  const plannerYearLevels = useMemo(() => {
    const base = [...activeYearLevels];
    const seen = new Set(base.map((y) => String(y.year_level_id)));
    extendedYearIds.forEach((yid) => {
      const id = String(yid);
      if (seen.has(id)) return;
      seen.add(id);
      base.push(guestExtendedYearEntry(id, curriculumMaxYearId));
    });
    return base.sort(
      (a, b) => Number(a.year_level_id) - Number(b.year_level_id)
    );
  }, [activeYearLevels, extendedYearIds, curriculumMaxYearId]);

  const nextExtendedYearId = useMemo(() => {
    const maxExt = extendedYearIds.reduce(
      (m, y) => Math.max(m, Number(y) || 0),
      curriculumMaxYearId
    );
    const next = maxExt + 1;
    return next <= GUEST_EXTENDED_MAX_YEAR ? String(next) : null;
  }, [extendedYearIds, curriculumMaxYearId]);

  const addGuestExtendedYear = useCallback(() => {
    if (!nextExtendedYearId) {
      swalToast(
        'info',
        `You can add up to ${GUEST_EXTENDED_MAX_YEAR - curriculumMaxYearId} extended study containers for retakes.`,
      );
      return;
    }
    setExtendedYearIds((prev) =>
      [...new Set([...prev.map(String), nextExtendedYearId])].sort(
        (a, b) => Number(a) - Number(b)
      )
    );
    swalToast(
      'success',
      `${guestExtendedStudyLabel(nextExtendedYearId, curriculumMaxYearId)} added — move unfinished subjects there (max ${GUEST_EXTENDED_SEM_UNIT_CAP}u / semester). Standing stays at ${guestOrdinalYearLabel(curriculumMaxYearId)} Year.`,
    );
  }, [nextExtendedYearId, curriculumMaxYearId]);

  const removeGuestExtendedYear = useCallback(
    (yearId) => {
      const yid = String(yearId);
      setExtendedYearIds((prev) => prev.filter((y) => String(y) !== yid));
      setPlannerPlacements((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((cid) => {
          if (String(next[cid]?.yearId) === yid) {
            delete next[cid];
          }
        });
        return next;
      });
      swalToast('info', `${guestExtendedStudyLabel(yid, curriculumMaxYearId)} removed.`);
    },
    [curriculumMaxYearId]
  );

  useEffect(() => {
    if (!yearFilter) return;
    if (!activeYearLevels.some((y) => String(y.year_level_id) === String(yearFilter))) {
      setYearFilter('');
    }
  }, [yearFilter, activeYearLevels]);

  const electiveTrackOptions = useMemo(() => {
    const map = new Map();
    creditScopeRows.forEach((row) => {
      if (!isTrackBasedElectiveRow(row, programs)) return;
      electiveSubjects(row).forEach((es) => {
        const tid = es.track_id;
        if (tid == null || tid === '') return;
        const key = String(tid);
        if (map.has(key)) return;
        const t = es.track;
        map.set(key, {
          track_id: tid,
          track_name: t?.track_name || t?.track_code || `Track ${tid}`,
          track_code: t?.track_code,
        });
      });
    });
    return [...map.values()].sort((a, b) => String(a.track_name).localeCompare(String(b.track_name)));
  }, [creditScopeRows, programs]);

  /** Full curriculum rows for units / planner (Elective 4 always included). */
  const visibleCreditScopeRows = creditScopeRows;

  /** One block per year level + semester (e.g. 1st Year — First Semester). */
  const groupedSections = useMemo(() => {
    const map = new Map();
    filteredRows.forEach((row) => {
      const yid = getYearLevelId(row);
      const sid = getSemesterId(row);
      const key = `${yid ?? '∅'}|${sid ?? '∅'}`;
      if (!map.has(key)) {
        map.set(key, { yearId: yid, semId: sid, rows: [] });
      }
      map.get(key).rows.push(row);
    });

    const keys = [...map.keys()].sort((ka, kb) => {
      const a = map.get(ka);
      const b = map.get(kb);
      const yOrder =
        orderInList(yearLevels, a.yearId, 'year_level_id') -
        orderInList(yearLevels, b.yearId, 'year_level_id');
      if (yOrder !== 0) return yOrder;
      return (
        orderInList(semesters, a.semId, 'semester_id') -
        orderInList(semesters, b.semId, 'semester_id')
      );
    });

    return keys.map((key) => {
      const g = map.get(key);
      const rows = [...g.rows].sort((r1, r2) => {
        const e1 = isElectiveSlotRow(r1);
        const e2 = isElectiveSlotRow(r2);
        if (e1 !== e2) return e1 ? 1 : -1;
        if (e1) {
          return Number(r1.elective_slot_id) - Number(r2.elective_slot_id);
        }
        return String(getPenCodes(r1)).localeCompare(String(getPenCodes(r2)));
      });
      const yLabel = lookupYearLabel(g.yearId, yearLevels);
      const sLabel = lookupSemesterLabel(g.semId, semesters);
      return {
        key,
        yearId: g.yearId,
        semId: g.semId,
        yearLabel: yLabel,
        semesterLabel: sLabel,
        title: `${yLabel} — ${sLabel}`,
        rows,
      };
    });
  }, [filteredRows, yearLevels, semesters]);

  const modalElectiveRow = useMemo(() => {
    if (!electiveTrackModalSlotId) return null;
    return (
      creditScopeRows.find(
        (row) => guestElectiveSlotKey(row) === String(electiveTrackModalSlotId),
      ) ||
      filteredRows.find(
        (row) => guestElectiveSlotKey(row) === String(electiveTrackModalSlotId),
      ) ||
      null
    );
  }, [electiveTrackModalSlotId, creditScopeRows, filteredRows]);

  /** Tracks for the modal. Elective 4 hides the track already used on Electives 1–3. */
  const modalTrackOptions = useMemo(() => {
    if (!modalElectiveRow || !isGuestElectiveFourRow(modalElectiveRow)) {
      return electiveTrackOptions;
    }
    const primaryTrackId = getGuestPrimaryElectiveTrackId(
      guestElectiveTracks,
      creditScopeRows,
      programs,
    );
    if (!primaryTrackId) return electiveTrackOptions;
    return electiveTrackOptions.filter((t) => String(t.track_id) !== String(primaryTrackId));
  }, [
    modalElectiveRow,
    electiveTrackOptions,
    guestElectiveTracks,
    creditScopeRows,
    programs,
  ]);

  const modalSlotLabel = useMemo(() => {
    if (!modalElectiveRow) return 'this elective';
    return (
      electiveSlot(modalElectiveRow)?.slot_name ||
      modalElectiveRow.elective_slot_name ||
      'this elective'
    );
  }, [modalElectiveRow]);

  const modalSelectedTrackId = electiveTrackModalSlotId
    ? String(guestElectiveTracks[electiveTrackModalSlotId] || '')
    : '';

  const hasTrackBasedElectiveRowsInView = useMemo(
    () => filteredRows.some((row) => isTrackBasedElectiveRow(row, programs)),
    [filteredRows, programs],
  );

  /** Units required per year level (study map) for the selected program + curriculum. */
  const studyMap = useMemo(
    () => buildGuestStudyMap(visibleCreditScopeRows, yearLevels, guestElectiveTracks, programs),
    [visibleCreditScopeRows, yearLevels, guestElectiveTracks, programs],
  );

  const isModalElectiveFour =
    modalElectiveRow != null && isGuestElectiveFourRow(modalElectiveRow);

  /** Credited / lacking units, standing, and remaining years & semesters. */
  const simulationStats = useMemo(() => {
    let creditedUnits = 0;
    let listedUncredited = 0;

    visibleCreditScopeRows.forEach((row) => {
      const n = parseUnitsNumber(getUnitsForGuest(row, getGuestTrackIdForRow(row, guestElectiveTracks), programs, creditScopeRows, guestElectiveTracks));
      const effectivelyCredited = isGuestEffectivelyCredited(creditScopeRows, row, remarks);
      if (effectivelyCredited) {
        if (n != null) creditedUnits += n;
      } else if (n != null) {
        listedUncredited += n;
      }
    });

    // Degree total follows the selected curriculum year (22-23=154, 23-24=150),
    // not program.total_units_required which is shared across all curricula.
    const selectedProgram =
      programs.find((p) => String(p.program_id) === String(programFilter)) || null;
    const programRequired = Number(selectedProgram?.total_units_required) || 0;
    const listedTotal = creditedUnits + listedUncredited;
    const effectiveYear = getCurriculumEffectiveYear(
      visibleCreditScopeRows[0] || creditScopeRows[0],
    );
    const degreeTotal = resolveGuestDegreeTotal(listedTotal, effectiveYear, programRequired);
    const lackingUnits = Math.max(0, degreeTotal - creditedUnits);

    const standing = resolveGuestStanding(studyMap, creditedUnits);
    const maxUnitsPerSemester = getMaxUnitsForYearIndex(standing.standingYearIndex);
    const totalProgramYears = studyMap.length;

    const lastThreshold =
      totalProgramYears > 0 ? studyMap[totalProgramYears - 1].cumulativeThreshold : 0;
    const completionTarget = Math.max(lastThreshold, degreeTotal);
    const programComplete = totalProgramYears > 0 && creditedUnits >= completionTarget;

    const remainingYears = programComplete
      ? 0
      : Math.max(0, totalProgramYears - standing.standingYearIndex + 1);

    const scopeSections = groupGuestSections(visibleCreditScopeRows, yearLevels, semesters);
    let remainingSemesters = 0;
    scopeSections.forEach((section) => {
      const sectionStanding = yearStandingIndex(yearLevels, section.yearId);
      if (sectionStanding < standing.standingYearIndex) return;
      const hasUncredited = section.rows.some(
        (row) => !isGuestEffectivelyCredited(creditScopeRows, row, remarks),
      );
      if (hasUncredited) remainingSemesters += 1;
    });

    return {
      creditedUnits,
      lackingUnits,
      degreeTotal,
      remainingYears,
      remainingSemesters,
      standingYearIndex: standing.standingYearIndex,
      standingLabel: standing.standingLabel,
      unitsToNextStanding: standing.unitsToNextStanding,
      nextThreshold: standing.nextThreshold,
      maxUnitsPerSemester,
      programComplete,
      studyMap,
    };
  }, [
    visibleCreditScopeRows,
    creditScopeRows,
    remarks,
    guestElectiveTracks,
    programs,
    programFilter,
    studyMap,
    yearLevels,
    semesters,
  ]);

  /** Always show the full curriculum on the marking page. */
  const groupedSectionsDisplay = useMemo(() => groupedSections, [groupedSections]);

  const remainingSubjectRows = useMemo(() => {
    return visibleCreditScopeRows.filter(
      (row) => !isGuestEffectivelyCredited(creditScopeRows, row, remarks),
    );
  }, [visibleCreditScopeRows, creditScopeRows, remarks]);

  const openPlanner = useCallback(() => {
    const next = {};
    remainingSubjectRows.forEach((row) => {
      next[row.curriculum_id] = {
        yearId: getYearLevelId(row),
        semId: getSemesterId(row),
      };
    });
    setPlannerPlacements(next);
    setPlannerDragId(null);
    setPlannerOpenInsertSlotKey(null);
    setPlannerUnlocked(true);
    setSimOpen(false);
    setPlannerOpen(true);
    setActiveStep('planner');
    window.requestAnimationFrame(() => {
      document.getElementById('guest-panel-planner')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [remainingSubjectRows]);

  const backToCurriculum = useCallback(() => {
    setPlannerOpen(false);
    setSimOpen(true);
    setActiveStep('simulate');
    setPlannerDragId(null);
    setPlannerOpenInsertSlotKey(null);
    window.requestAnimationFrame(() => {
      document.getElementById('guest-panel-simulate')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const toggleSimOpen = useCallback(() => {
    setSimOpen((open) => !open);
  }, []);

  const togglePlannerOpen = useCallback(() => {
    if (!plannerUnlocked) return;
    setPlannerOpen((open) => !open);
  }, [plannerUnlocked]);

  const runTransferSimulation = useCallback(async () => {
    const codes = String(transferCodesText || '')
      .split(/[\n,;]+/)
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 50);
    if (codes.length === 0) {
      setTransferError('Enter at least one prior-school subject code.');
      setTransferResults(null);
      return;
    }
    setTransferLoading(true);
    setTransferError('');
    try {
      const payload = {
        courses: codes.map((subject_code) => ({ subject_code })),
      };
      if (transferSchoolId) {
        payload.school_id = Number(transferSchoolId);
      }
      const res = await api.post('/guest/credit-simulation', payload);
      setTransferResults(Array.isArray(res.data?.results) ? res.data.results : []);
    } catch (e) {
      const msg = e.response?.data?.message || e.response?.data?.error || 'Could not run transfer match.';
      setTransferError(msg);
      setTransferResults(null);
      await swalError('Transfer match failed', msg);
    } finally {
      setTransferLoading(false);
    }
  }, [transferCodesText, transferSchoolId]);

  const applyTransferMatchesToCurriculum = useCallback(() => {
    if (!Array.isArray(transferResults) || transferResults.length === 0) return;
    const localCodes = new Set();
    transferResults.forEach((row) => {
      (row.equivalences || []).forEach((eq) => {
        const code = String(eq.local_subject_code || '').trim().toUpperCase();
        if (code) localCodes.add(code);
      });
    });
    if (localCodes.size === 0) {
      void swalInfo(
        'No local matches',
        'None of the entered codes have an active equivalence to a local subject yet. Ask staff to map them under Subject Crediting, or mark subjects manually below.'
      );
      return;
    }
    let applied = 0;
    creditScopeRows.forEach((row) => {
      const code = String(row.subject?.subject_code || row.subject_code || '')
        .trim()
        .toUpperCase();
      if (code && localCodes.has(code)) applied += 1;
    });
    setRemarks((prev) => {
      const next = { ...prev };
      creditScopeRows.forEach((row) => {
        const code = String(row.subject?.subject_code || row.subject_code || '')
          .trim()
          .toUpperCase();
        if (code && localCodes.has(code)) {
          next[row.curriculum_id] = 'passed';
        }
      });
      return next;
    });
    void swalToast(
      'success',
      applied > 0
        ? `Marked ${applied} local subject(s) as credited from transfer matches.`
        : 'Matches found, but none appear in the selected curriculum view.'
    );
  }, [transferResults, creditScopeRows]);

  const movePlannerSubject = useCallback((curriculumId, yearId, semId) => {
    const row = remainingSubjectRows.find(
      (r) => String(r.curriculum_id) === String(curriculumId),
    );
    if (row && !guestSubjectCanMoveToSemester(getSemesterId(row), semId, semesters)) {
      return false;
    }

    if (row) {
      const proposedPlacements = {
        ...plannerPlacements,
        [String(curriculumId)]: { yearId, semId },
      };
      const prereqGate = guestPlannerPrereqMoveGate(row, yearId, semId, {
        scopeRows: creditScopeRows,
        remainingRows: remainingSubjectRows,
        placements: proposedPlacements,
        remarks,
        yearLevels,
        semesters,
        trackBySlot: guestElectiveTracks,
        programs,
      });
      if (!prereqGate.ok) {
        swalInfo(
          'Prerequisite required',
          prereqGate.conflicts[0] ||
            'This subject cannot be placed in that term because of a prerequisite.',
        );
        return false;
      }
    }

    const yearIdx = yearStandingIndex(yearLevels, yearId);
    const semesterLabel =
      semesters.find((s) => String(s.semester_id) === String(semId))?.semester_name || '';
    const cap = getMaxUnitsForSlot(yearIdx, semId, semesterLabel);
    const movingUnits =
      row != null
        ? parseUnitsNumber(getUnitsForGuest(row, getGuestTrackIdForRow(row, guestElectiveTracks), programs, creditScopeRows, guestElectiveTracks)) || 0
        : 0;

    let slotUnits = 0;
    remainingSubjectRows.forEach((r) => {
      if (String(r.curriculum_id) === String(curriculumId)) return;
      const placement = plannerPlacements[String(r.curriculum_id)] || {
        yearId: getYearLevelId(r),
        semId: getSemesterId(r),
      };
      if (
        String(placement.yearId ?? '') !== String(yearId ?? '') ||
        String(placement.semId ?? '') !== String(semId ?? '')
      ) {
        return;
      }
      const n = parseUnitsNumber(getUnitsForGuest(r, getGuestTrackIdForRow(r, guestElectiveTracks), programs, creditScopeRows, guestElectiveTracks));
      if (n != null) slotUnits += n;
    });

    if (slotUnits + movingUnits > cap) {
      swalToast(
        'warning',
        `That term only allows ${cap} units${/summer/i.test(semesterLabel) ? ' (Summer)' : ''}.`,
      );
      return false;
    }

    setPlannerPlacements((prev) => ({
      ...prev,
      [curriculumId]: { yearId, semId },
    }));
    return true;
  }, [
    remainingSubjectRows,
    semesters,
    yearLevels,
    guestElectiveTracks,
    programs,
    plannerPlacements,
    creditScopeRows,
    remarks,
  ]);

  /** Put a moved subject back on its curriculum home year/semester. */
  const resetPlannerSubjectToHome = useCallback(
    (curriculumId) => {
      const row = remainingSubjectRows.find(
        (r) => String(r.curriculum_id) === String(curriculumId),
      );
      if (!row) return;
      const homeYearId = getYearLevelId(row);
      const homeSemId = getSemesterId(row);
      setPlannerPlacements((prev) => ({
        ...prev,
        [String(curriculumId)]: { yearId: homeYearId, semId: homeSemId },
      }));
      swalToast('info', 'Subject returned to its curriculum term.');
    },
    [remainingSubjectRows]
  );

  const plannerSlotOptions = useMemo(() => {
    const slots = [];
    plannerYearLevels.forEach((y) => {
      semesters.forEach((s) => {
        slots.push({
          key: `${y.year_level_id}|${s.semester_id}`,
          yearId: y.year_level_id,
          semId: s.semester_id,
          yearLabel: y.year_level,
          semesterLabel: s.semester_name,
          label: `${y.year_level} — ${s.semester_name}`,
        });
      });
    });
    return slots.sort((a, b) => {
      const yOrder =
        orderInList(plannerYearLevels, a.yearId, 'year_level_id') -
        orderInList(plannerYearLevels, b.yearId, 'year_level_id');
      if (yOrder !== 0) return yOrder;
      return (
        guestSemesterKindSortOrder(a.semId, semesters) -
        guestSemesterKindSortOrder(b.semId, semesters)
      );
    });
  }, [plannerYearLevels, semesters]);

  const plannerSubjectOptions = useMemo(() => {
    return remainingSubjectRows.map((row) => {
      const id = String(row.curriculum_id);
      const parts = getPenCodePartsForGuest(row, getGuestTrackIdForRow(row, guestElectiveTracks), programs, creditScopeRows, guestElectiveTracks);
      const code = parts.length ? parts.join(' / ') : '—';
      const title = getDisplayTitleForGuest(row, getGuestTrackIdForRow(row, guestElectiveTracks), programs, creditScopeRows, guestElectiveTracks);
      const homeSemId = getSemesterId(row);
      const placement = plannerPlacements[id] || {
        yearId: getYearLevelId(row),
        semId: homeSemId,
      };
      const slotKey = `${placement.yearId ?? ''}|${placement.semId ?? ''}`;
      const slot = plannerSlotOptions.find((s) => s.key === slotKey);
      const where = slot ? slot.label : 'Unplaced';
      return {
        id,
        label: `${code} — ${title}`,
        where,
        slotKey,
        homeSemId,
      };
    });
  }, [
    remainingSubjectRows,
    guestElectiveTracks,
    programs,
    plannerPlacements,
    plannerSlotOptions,
  ]);

  const getPlannerMoveOptionsForRow = useCallback(
    (row, currentKey) => {
      const homeSemId = getSemesterId(row);
      // Show all year/term options of the allowed semester kind. Prerequisite
      // conflicts are validated on move and shown as an alert (not hidden here).
      return plannerSlotOptions.filter((slot) => {
        if (slot.key === currentKey) return true;
        return guestSubjectCanMoveToSemester(homeSemId, slot.semId, semesters);
      });
    },
    [plannerSlotOptions, semesters],
  );

  const insertPlannerSubjectIntoSlot = useCallback(
    (curriculumId, yearId, semId) => {
      if (!curriculumId) return;
      const row = remainingSubjectRows.find(
        (r) => String(r.curriculum_id) === String(curriculumId),
      );
      if (row && !guestSubjectCanMoveToSemester(getSemesterId(row), semId, semesters)) {
        return;
      }
      if (movePlannerSubject(curriculumId, yearId, semId)) {
        setPlannerOpenInsertSlotKey(null);
      }
    },
    [movePlannerSubject, remainingSubjectRows, semesters],
  );

  const plannerYears = useMemo(() => {
    const byYear = new Map();
    plannerSlotOptions.forEach((slot) => {
      const yearKey = String(slot.yearId);
      if (!byYear.has(yearKey)) {
        byYear.set(yearKey, {
          key: yearKey,
          yearId: slot.yearId,
          yearLabel: slot.yearLabel,
          sections: [],
        });
      }
      byYear.get(yearKey).sections.push({
        key: slot.key,
        yearId: slot.yearId,
        semId: slot.semId,
        semesterLabel: slot.semesterLabel,
        rows: [],
      });
    });

    remainingSubjectRows.forEach((row) => {
      const placement = plannerPlacements[row.curriculum_id] || {
        yearId: getYearLevelId(row),
        semId: getSemesterId(row),
      };
      const yearKey = String(placement.yearId ?? 'unknown');
      const sectionKey = `${placement.yearId ?? '∅'}|${placement.semId ?? '∅'}`;
      let yearGroup = byYear.get(yearKey);
      if (!yearGroup) {
        yearGroup = {
          key: yearKey,
          yearId: placement.yearId,
          yearLabel: lookupYearLabel(placement.yearId, yearLevels),
          sections: [],
        };
        byYear.set(yearKey, yearGroup);
      }
      let section = yearGroup.sections.find((s) => s.key === sectionKey);
      if (!section) {
        section = {
          key: sectionKey,
          yearId: placement.yearId,
          semId: placement.semId,
          semesterLabel: lookupSemesterLabel(placement.semId, semesters),
          rows: [],
        };
        yearGroup.sections.push(section);
      }
      section.rows.push(row);
    });

    return [...byYear.values()]
      .map((year) => ({
        ...year,
        sections: [...year.sections].sort(
          (a, b) =>
            guestSemesterKindSortOrder(a.semId, semesters) -
            guestSemesterKindSortOrder(b.semId, semesters),
        ),
        isExtended: extendedYearIds.some((y) => String(y) === String(year.yearId)),
      }))
      .sort(
        (a, b) =>
          orderInList(plannerYearLevels, a.yearId, 'year_level_id') -
          orderInList(plannerYearLevels, b.yearId, 'year_level_id'),
      );
  }, [
    plannerSlotOptions,
    remainingSubjectRows,
    plannerPlacements,
    yearLevels,
    plannerYearLevels,
    extendedYearIds,
    semesters,
  ]);

  const plannerStats = useMemo(() => {
    let remainingUnits = 0;
    remainingSubjectRows.forEach((row) => {
      const n = parseUnitsNumber(getUnitsForGuest(row, getGuestTrackIdForRow(row, guestElectiveTracks), programs, creditScopeRows, guestElectiveTracks));
      if (n != null) remainingUnits += n;
    });

    // Project from current standing (e.g. 4th year = 12 u/sem), not from 1st-year caps.
    const startYearIndex = Math.max(1, Number(simulationStats.standingYearIndex) || 1);
    let unitsLeft = remainingUnits;
    let projectedYears = 0;
    let projectedSemesters = 0;
    for (
      let yearIndex = startYearIndex;
      unitsLeft > 0 && yearIndex <= GUEST_EXTENDED_MAX_YEAR;
      yearIndex += 1
    ) {
      const cap = getMaxUnitsForYearIndex(yearIndex);
      let usedThisYear = false;
      for (let s = 0; s < 2 && unitsLeft > 0; s += 1) {
        unitsLeft -= cap;
        projectedSemesters += 1;
        usedThisYear = true;
      }
      if (usedThisYear) projectedYears += 1;
    }
    if (remainingUnits > 0 && projectedYears === 0) projectedYears = 1;
    if (remainingUnits > 0 && projectedSemesters === 0) projectedSemesters = 1;

    let plannedSemesters = 0;
    let plannedYears = 0;
    let overloadedSlots = 0;
    plannerYears.forEach((year) => {
      const yearIdx = yearStandingIndex(yearLevels, year.yearId);
      let yearHasSubjects = false;
      year.sections.forEach((section) => {
        if (section.rows.length === 0) return;
        plannedSemesters += 1;
        yearHasSubjects = true;
        const cap = getMaxUnitsForSlot(yearIdx, section.semId, section.semesterLabel);
        const units = section.rows.reduce((acc, row) => {
          const n = parseUnitsNumber(getUnitsForGuest(row, getGuestTrackIdForRow(row, guestElectiveTracks), programs, creditScopeRows, guestElectiveTracks));
          return n != null ? acc + n : acc;
        }, 0);
        if (units > cap) overloadedSlots += 1;
      });
      if (yearHasSubjects) plannedYears += 1;
    });

    // Prefer the live plan when subjects are placed; otherwise use standing-based projection.
    const estimatedSemesters =
      plannedSemesters > 0 ? plannedSemesters : projectedSemesters;
    const estimatedYears = plannedYears > 0 ? plannedYears : projectedYears;

    return {
      remainingUnits,
      estimatedYears,
      estimatedSemesters,
      plannedSemesters,
      overloadedSlots,
      standingLabel: simulationStats.standingLabel,
    };
  }, [
    remainingSubjectRows,
    guestElectiveTracks,
    programs,
    creditScopeRows,
    simulationStats.standingLabel,
    simulationStats.standingYearIndex,
    plannerYears,
    yearLevels,
    semesters,
  ]);

  const groupedYearsDisplay = useMemo(() => {
    const yearMap = new Map();
    groupedSectionsDisplay.forEach((section) => {
      const yearKey = section.yearId ?? 'unknown';
      if (!yearMap.has(yearKey)) {
        yearMap.set(yearKey, {
          key: String(yearKey),
          yearId: section.yearId,
          yearLabel: section.yearLabel,
          sections: [],
        });
      }
      yearMap.get(yearKey).sections.push(section);
    });

    return [...yearMap.values()].sort((a, b) => {
      const yearOrder =
        orderInList(yearLevels, a.yearId, 'year_level_id') -
        orderInList(yearLevels, b.yearId, 'year_level_id');
      if (yearOrder !== 0) return yearOrder;
      return String(a.yearLabel).localeCompare(String(b.yearLabel));
    });
  }, [groupedSectionsDisplay, yearLevels]);

  const setRemark = useCallback((curriculumId, value) => {
    setRemarks((prev) => {
      const row = creditScopeRows.find(
        (r) => String(r.curriculum_id) === String(curriculumId),
      );
      if (!row) return prev;
      if (value) {
        const result = creditGuestCluster(
          creditScopeRows,
          row,
          prev,
          yearLevels,
          guestElectiveTracks,
          programs,
        );
        return result.ok ? result.next : prev;
      }
      return uncreditGuestCluster(
        creditScopeRows,
        row,
        prev,
        yearLevels,
        guestElectiveTracks,
        programs,
      );
    });
  }, [creditScopeRows, yearLevels, guestElectiveTracks, programs]);

  const setSectionRemarks = useCallback((rows, value) => {
    setRemarks((prev) => {
      let next = { ...prev };
      if (!value) {
        rows.forEach((row) => {
          next = uncreditGuestCluster(
            creditScopeRows,
            row,
            next,
            yearLevels,
            guestElectiveTracks,
            programs,
          );
        });
        return next;
      }

      // Credit rows (and their coreq clusters) whose prerequisites are satisfied.
      let changed = true;
      while (changed) {
        changed = false;
        rows.forEach((row) => {
          if (next[row.curriculum_id] === 'passed') return;
          const result = creditGuestCluster(
            creditScopeRows,
            row,
            next,
            yearLevels,
            guestElectiveTracks,
            programs,
          );
          if (result.ok) {
            next = result.next;
            changed = true;
          }
        });
      }
      return next;
    });
  }, [creditScopeRows, yearLevels, guestElectiveTracks, programs]);

  const handleDownloadPdf = async () => {
    if (groupedYearsDisplay.length === 0) return;
    setPdfLoading(true);
    try {
      const programLabel =
        programOptions.find((p) => String(p.value) === String(programFilter))?.label || '';

      const mapSimRow = (row) => {
        const trackId = getGuestTrackIdForRow(row, guestElectiveTracks);
        const parts = getPenCodePartsForGuest(
          row,
          trackId,
          programs,
          creditScopeRows,
          guestElectiveTracks,
        );
        const units = getUnitsForGuest(
          row,
          trackId,
          programs,
          creditScopeRows,
          guestElectiveTracks,
        );
        const credited = isGuestEffectivelyCredited(creditScopeRows, row, remarks);
        const prereqLabel = formatGuestPrerequisite(row);
        const electiveSlotPrereqLabel = getGuestRequiredPrerequisiteSlots(
          row,
          creditScopeRows,
        )
          .map((p) => `P: ${p.slot_name}`)
          .join(', ');
        const displayPrereqLabel = [
          prereqLabel,
          electiveSlotPrereqLabel &&
          !(prereqLabel || '').includes(electiveSlotPrereqLabel)
            ? electiveSlotPrereqLabel
            : '',
        ]
          .filter(Boolean)
          .join(', ');
        const coreqTag = getGuestCorequisiteTag(row, creditScopeRows);
        return {
          codes: parts.length ? parts : [],
          code: parts.length ? parts.join(' / ') : '—',
          title: getDisplayTitleForGuest(
            row,
            trackId,
            programs,
            creditScopeRows,
            guestElectiveTracks,
          ),
          units: units ?? '—',
          credited,
          status: credited ? 'Credited' : 'Not credited',
          prereq: displayPrereqLabel || '',
          coreq: coreqTag
            ? `Co: ${coreqTag.codes.join(', ')} — pass both this subject and its coreq`
            : '',
        };
      };

      const mapTakeRow = (row) => {
        const trackId = getGuestTrackIdForRow(row, guestElectiveTracks);
        const parts = getPenCodePartsForGuest(
          row,
          trackId,
          programs,
          creditScopeRows,
          guestElectiveTracks,
        );
        const units = getUnitsForGuest(
          row,
          trackId,
          programs,
          creditScopeRows,
          guestElectiveTracks,
        );
        return {
          codes: parts.length ? parts : [],
          code: parts.length ? parts.join(' / ') : '—',
          title: getDisplayTitleForGuest(
            row,
            trackId,
            programs,
            creditScopeRows,
            guestElectiveTracks,
          ),
          units: units ?? '—',
        };
      };

      const simulationYears = groupedYearsDisplay.map((yearGroup) => {
        const yearIdx = yearStandingIndex(yearLevels, yearGroup.yearId);
        return {
          yearLabel: yearGroup.yearLabel,
          sections: (yearGroup.sections || []).map((section) => {
            const totalUnits = section.rows.reduce((acc, row) => {
              const n = parseUnitsNumber(
                getUnitsForGuest(
                  row,
                  getGuestTrackIdForRow(row, guestElectiveTracks),
                  programs,
                  creditScopeRows,
                  guestElectiveTracks,
                ),
              );
              return n != null ? acc + n : acc;
            }, 0);
            const creditedUnits = section.rows.reduce((acc, row) => {
              if (!isGuestEffectivelyCredited(creditScopeRows, row, remarks)) return acc;
              const n = parseUnitsNumber(
                getUnitsForGuest(
                  row,
                  getGuestTrackIdForRow(row, guestElectiveTracks),
                  programs,
                  creditScopeRows,
                  guestElectiveTracks,
                ),
              );
              return n != null ? acc + n : acc;
            }, 0);
            const allowedUnits = getMaxUnitsForSlot(
              yearIdx,
              section.semId,
              section.semesterLabel,
            );
            return {
              semesterLabel: section.semesterLabel,
              totalUnits,
              creditedUnits,
              allowedUnits,
              allowedLabel: /summer/i.test(String(section.semesterLabel || ''))
                ? 'Summer'
                : yearGroup.yearLabel,
              rows: (section.rows || []).map(mapSimRow),
            };
          }),
        };
      });

      const subjectsYears = plannerYears.map((yearGroup) => {
        const yearIdx = yearStandingIndex(yearLevels, yearGroup.yearId);
        return {
          yearLabel: yearGroup.yearLabel,
          sections: (yearGroup.sections || []).map((section) => {
            const unitsUsed = section.rows.reduce((acc, row) => {
              const n = parseUnitsNumber(
                getUnitsForGuest(
                  row,
                  getGuestTrackIdForRow(row, guestElectiveTracks),
                  programs,
                  creditScopeRows,
                  guestElectiveTracks,
                ),
              );
              return n != null ? acc + n : acc;
            }, 0);
            const unitsCap = getMaxUnitsForSlot(
              yearIdx,
              section.semId,
              section.semesterLabel,
            );
            return {
              semesterLabel: section.semesterLabel,
              unitsUsed,
              unitsCap,
              rows: (section.rows || []).map(mapTakeRow),
            };
          }),
        };
      });

      const includeSubjectsToTake =
        plannerUnlocked || remainingSubjectRows.length > 0;

      const result = await downloadGuestSimulationPdfs({
        guestName,
        institution: INSTITUTION_NAME,
        curriculumLabel: selectedHeaderLabel,
        programLabel,
        simulation: {
          stats: [
            { label: 'Credited units', value: simulationStats.creditedUnits.toFixed(1) },
            { label: 'Lacking units', value: simulationStats.lackingUnits.toFixed(1) },
            { label: 'Remaining years', value: String(simulationStats.remainingYears) },
            { label: 'Remaining semesters', value: String(simulationStats.remainingSemesters) },
          ],
          years: simulationYears,
        },
        subjectsToTake: includeSubjectsToTake
          ? {
              stats: [
                { label: 'Remaining units', value: plannerStats.remainingUnits.toFixed(1) },
                { label: 'Estimated years', value: String(plannerStats.estimatedYears) },
                { label: 'Estimated semesters', value: String(plannerStats.estimatedSemesters) },
                { label: 'Load limits', value: '23 / 24 / 19 / 12 · Ext. 12 · Summer 9' },
              ],
              standingNote: `Standing: ${plannerStats.standingLabel}`,
              years: subjectsYears,
            }
          : null,
      });

      if (result.includesSubjectsToTake) {
        await swalToast(
          'success',
          'PDF downloaded (Curriculum simulation + Subjects to take)',
        );
      } else {
        await swalToast('success', 'PDF downloaded (Curriculum simulation)');
      }
    } catch (e) {
      await swalError('Could not create PDF', e?.message || 'Unknown error');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const selectedHeaderLabel =
    headerOptions.find((h) => h.id === headerFilter)?.label ||
    (headerFilter ? `Curriculum #${headerFilter}` : 'Select curriculum');

  const guestDisplayName = guestName.trim();

  return (
    <div className="guest-sim-page">
      <div className="guest-sim-page-bg" aria-hidden />
      <div
        className={`guest-sim-page-content${!loading ? ' guest-sim-page-content--sim-float' : ''}${
          activeStep === 'planner' ? ' guest-sim-page-content--planner' : ''
        }`}
      >
      <header className="guest-sim-topbar">
        <div className="guest-sim-brand">
          <img
            src={`${publicUrl}/assets/student_evaluation_system_logo.png`}
            alt="Student Evaluation System"
            className="guest-sim-seal"
          />
          <div className="guest-sim-brand-text">
            <span className="guest-sim-institution">Student Evaluation System</span>
            <span className="guest-sim-portal-tag">Academic Evaluation Portal · Guest</span>
          </div>
        </div>
        <div className="guest-sim-topbar-actions">
          <button type="button" className="guest-sim-back" onClick={() => navigate('/login')}>
            <span className="guest-sim-back-icon" aria-hidden="true">
              ←
            </span>
            Back to Login
          </button>
          <h1 className="guest-sim-page-badge">Curriculum Simulation</h1>
        </div>
      </header>

      <div className="guest-sim-user-row">
        {user ? (
          <>
            <span className="guest-user-email">{user.email}</span>
            <button type="button" className="logout-button" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <>
            <button type="button" className="guest-nav-btn" onClick={() => navigate('/')}>
              Home
            </button>
            <button type="button" className="guest-nav-btn guest-nav-btn-primary" onClick={() => navigate('/login')}>
              Login
            </button>
          </>
        )}
      </div>

      {loading ? (
        <p className="guest-loading">Loading…</p>
      ) : (
        <>
          {error && <div className="guest-error" role="alert">{error}</div>}

          <main id="main-content" className="guest-sim-print-wrap" tabIndex="-1">
            <div className="guest-sim-sticky-header">
            <div className="guest-sim-filters">
              <div className="guest-sim-filter-grid" role="group" aria-label="Filter curriculum">
                <label className="guest-sim-field guest-sim-field--name">
                  <span className="guest-sim-field-label">
                    <span className="guest-sim-icon guest-sim-icon-screen" /> Name
                  </span>
                  <input
                    type="text"
                    className="guest-sim-input"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Enter your name"
                    autoComplete="name"
                    aria-label="Guest name"
                  />
                </label>
                <label className="guest-sim-field">
                  <span className="guest-sim-field-label">
                    <span className="guest-sim-icon guest-sim-icon-calendar" /> Curriculum
                  </span>
                  <select
                    value={headerFilter}
                    onChange={(e) => setHeaderFilter(e.target.value)}
                    className="guest-sim-input"
                    disabled={headerOptions.length === 0}
                  >
                    {headerOptions.length === 0 ? (
                      <option value="">No curricula available</option>
                    ) : null}
                    {headerOptions.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="guest-sim-field">
                  <span className="guest-sim-field-label">
                    <span className="guest-sim-icon guest-sim-icon-screen" /> Program
                  </span>
                  <SearchableSelect
                    id="guest-program-filter"
                    value={programFilter}
                    onChange={setProgramFilter}
                    options={programOptions}
                    emptyLabel="Select program"
                    placeholder="Search program name or code..."
                    className="guest-sim-searchable"
                    required
                    aria-label="Program"
                  />
                </label>
                <label className="guest-sim-field">
                  <span className="guest-sim-field-label">
                    <span className="guest-sim-icon guest-sim-icon-screen" /> Year
                  </span>
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className="guest-sim-input"
                  >
                    <option value="">All years</option>
                    {activeYearLevels.map((y) => (
                      <option key={y.year_level_id} value={String(y.year_level_id)}>
                        {y.year_level}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="guest-sim-field">
                  <span className="guest-sim-field-label">
                    <span className="guest-sim-icon guest-sim-icon-screen" /> Semester
                  </span>
                  <select
                    value={semesterFilter}
                    onChange={(e) => setSemesterFilter(e.target.value)}
                    className="guest-sim-input"
                  >
                    <option value="">All semesters</option>
                    {semesters.map((s) => (
                      <option key={s.semester_id} value={String(s.semester_id)}>
                        {s.semester_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="guest-sim-pdf-wrap">
                <button
                  id="pdf-export"
                  type="button"
                  className="guest-sim-pdf-btn"
                  onClick={handleDownloadPdf}
                  disabled={pdfLoading || groupedSectionsDisplay.length === 0}
                >
                  {pdfLoading ? 'Preparing…' : 'Download PDF'}
                </button>
              </div>
            </div>

            <div className="guest-sim-summary guest-sim-summary-bar">
              {guestDisplayName ? (
                <p className="guest-sim-guest-name">
                  Name: <strong>{guestDisplayName}</strong>
                </p>
              ) : null}
              <div className="guest-sim-stats" aria-live="polite">
                <div className="guest-sim-stat">
                  <span className="guest-sim-stat-label">Credited units</span>
                  <span className="guest-sim-stat-value">
                    {simulationStats.creditedUnits.toFixed(1)}
                  </span>
                </div>
                <div className="guest-sim-stat">
                  <span className="guest-sim-stat-label">Lacking units</span>
                  <span className="guest-sim-stat-value">
                    {simulationStats.lackingUnits.toFixed(1)}
                  </span>
                </div>
                <div className="guest-sim-stat">
                  <span className="guest-sim-stat-label">Remaining years</span>
                  <span className="guest-sim-stat-value">{simulationStats.remainingYears}</span>
                </div>
                <div className="guest-sim-stat">
                  <span className="guest-sim-stat-label">Remaining semesters</span>
                  <span className="guest-sim-stat-value">{simulationStats.remainingSemesters}</span>
                </div>
              </div>
            </div>
            </div>

            {hasTrackBasedElectiveRowsInView && (
              <p className="guest-sim-elective-hint">
                <strong>IT Electives 1</strong> needs 3rd year standing (~96 credited units). Electives 2–4 follow
                Admin → Elective Slots → Prerequisite slot (Electives 1). Electives 1–3 share one track.{' '}
                <strong>Digital Arts</strong> also auto-fills Elective 4.
              </p>
            )}

            <div className="guest-sim-ux-guide" role="note" aria-live="polite">
              <strong>{activeStep === 'planner' ? 'Step 2 of 2:' : 'Step 1 of 2:'}</strong>{' '}
              {activeStep === 'planner'
                ? 'Review the suggested plan. Drag subjects between semesters (or use Move to) to adjust it.'
                : 'Optionally match prior-school codes below, mark credited subjects, then click Confirm to generate the remaining-subjects plan.'}
            </div>

            {activeStep !== 'planner' ? (
            <details className="guest-transfer-details">
              <summary>Simulate subject crediting (prior-school course codes)</summary>
              <p className="guest-sim-desc">
                Enter subject codes from another school. The system looks up active equivalences and can mark the
                matching local curriculum subjects as credited. Nothing is saved to the server.
              </p>
              <div className="guest-sim-form">
                <label className="guest-sim-row">
                  <span>Prior school (optional filter)</span>
                  <select
                    value={transferSchoolId}
                    onChange={(e) => setTransferSchoolId(e.target.value)}
                  >
                    <option value="">All schools on file</option>
                    {schools.map((s) => (
                      <option key={s.school_id} value={String(s.school_id)}>
                        {s.school_name || `School #${s.school_id}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="guest-sim-row">
                  <span>Subject codes (one per line or comma-separated)</span>
                  <textarea
                    rows={4}
                    value={transferCodesText}
                    onChange={(e) => setTransferCodesText(e.target.value)}
                    placeholder={'e.g.\nIT101\nMATH1\nENG1'}
                  />
                </label>
                <button
                  type="button"
                  className="guest-sim-submit"
                  onClick={runTransferSimulation}
                  disabled={transferLoading}
                >
                  {transferLoading ? 'Matching…' : 'Match codes to local subjects'}
                </button>
              </div>
              {transferError ? <p className="guest-sim-err">{transferError}</p> : null}
              {Array.isArray(transferResults) && transferResults.length > 0 ? (
                <div className="guest-sim-results">
                  {transferResults.map((row) => (
                    <div key={row.input_code} className="guest-sim-block">
                      <div className="guest-sim-code">
                        <strong>{row.input_code}</strong>{' '}
                        <span className={`guest-sim-badge guest-sim-${row.match || 'none'}`}>
                          {row.match || 'none'}
                        </span>
                      </div>
                      {row.message ? <p className="guest-sim-msg">{row.message}</p> : null}
                      {(row.equivalences || []).length > 0 ? (
                        <div className="guest-sim-table-wrap">
                          <table className="guest-sim-table-inner">
                            <thead>
                              <tr>
                                <th>External</th>
                                <th>Local subject</th>
                                <th>Units</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.equivalences.map((eq) => (
                                <tr key={`${eq.equivalence_id}-${eq.local_subject_id}`}>
                                  <td>
                                    {eq.external_subject_code}
                                    {eq.external_subject_name ? ` — ${eq.external_subject_name}` : ''}
                                  </td>
                                  <td>
                                    {eq.local_subject_code}
                                    {eq.local_subject_name ? ` — ${eq.local_subject_name}` : ''}
                                  </td>
                                  <td>{eq.credited_units ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="guest-sim-submit"
                    onClick={applyTransferMatchesToCurriculum}
                  >
                    Apply matched local subjects as credited
                  </button>
                </div>
              ) : null}
            </details>
            ) : null}

            <div id="guest-sim-stage" className="guest-sim-stage">
            <div
              id="guest-panel-simulate"
              className={`guest-sim-accordion${simOpen ? ' is-open' : ' is-collapsed'}`}
            >
              <button
                type="button"
                className="guest-sim-accordion-toggle"
                aria-expanded={simOpen}
                aria-controls="guest-panel-simulate-body"
                onClick={toggleSimOpen}
              >
                <span className="guest-sim-accordion-toggle-title">Curriculum simulation</span>
                <span className="guest-sim-accordion-toggle-sub">{selectedHeaderLabel}</span>
                <span className="guest-sim-accordion-chevron" aria-hidden>
                  {simOpen ? '▾' : '▸'}
                </span>
              </button>
              <div
                id="guest-panel-simulate-body"
                className="guest-sim-accordion-body"
                hidden={!simOpen}
              >
            <div className="guest-sim-curriculum-panel guest-sim-curriculum-panel--nested">
              <div className="guest-sim-curriculum-scroll">
              <div className="guest-sim-sections-body guest-sim-curriculum-layout">
                {groupedSectionsDisplay.length === 0 ? (
                  <div className="guest-sim-empty">No courses match the selected filters.</div>
                ) : (
                  groupedYearsDisplay.map((yearGroup, yearIdx) => (
                    <section
                      key={yearGroup.key}
                      className="guest-sim-year-card"
                      aria-labelledby={`guest-year-h-${yearIdx}`}
                    >
                      <div className="guest-sim-year-heading" id={`guest-year-h-${yearIdx}`}>
                        <span>{String(yearGroup.yearLabel || 'Unknown year').toUpperCase()}</span>
                      </div>
                      <div className="guest-sim-semester-grid">
                        {yearGroup.sections.map((section, secIdx) => (
                          <section
                            key={section.key}
                            className="guest-sim-section-card guest-sim-semester-card"
                            aria-labelledby={`guest-section-h-${yearIdx}-${secIdx}`}
                          >
                            <div className="guest-sim-section-heading">
                              <h3 id={`guest-section-h-${yearIdx}-${secIdx}`}>{section.semesterLabel}</h3>
                              <button
                                  type="button"
                                  className="guest-section-check-toggle"
                                  onClick={() => {
                                    const eligible = section.rows.filter(
                                      (row) =>
                                        remarks[row.curriculum_id] === 'passed' ||
                                        guestCanCreditWithCorequisites(
                                          creditScopeRows,
                                          row,
                                          remarks,
                                          yearLevels,
                                          guestElectiveTracks,
                                          programs,
                                        ).ok,
                                    );
                                    const allChecked =
                                      eligible.length > 0 &&
                                      eligible.every((row) => remarks[row.curriculum_id] === 'passed');
                                    setSectionRemarks(section.rows, allChecked ? '' : 'passed');
                                  }}
                                >
                                  {(() => {
                                    const eligible = section.rows.filter(
                                      (row) =>
                                        remarks[row.curriculum_id] === 'passed' ||
                                        guestCanCreditWithCorequisites(
                                          creditScopeRows,
                                          row,
                                          remarks,
                                          yearLevels,
                                          guestElectiveTracks,
                                          programs,
                                        ).ok,
                                    );
                                    const allChecked =
                                      eligible.length > 0 &&
                                      eligible.every((row) => remarks[row.curriculum_id] === 'passed');
                                    return allChecked ? 'Uncheck all' : 'Check all';
                                  })()}
                                </button>
                            </div>
                            <div className="guest-sim-mini-scroll">
                              <table className="guest-sim-mini-table">
                                <colgroup>
                                  <col className="guest-col-pen" />
                                  <col className="guest-col-title" />
                                  <col className="guest-col-units" />
                                  <col className="guest-col-remarks" />
                                </colgroup>
                                <thead>
                                  <tr>
                                    <th scope="col">Pen Code</th>
                                    <th scope="col">Descriptive Title</th>
                                    <th scope="col">Units</th>
                                    <th scope="col">Remarks</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {section.rows.map((row) => {
                                    const id = row.curriculum_id;
                                    const isTrackBasedElective = isTrackBasedElectiveRow(row, programs);
                                    const rowTrackId = getGuestTrackIdForRow(row, guestElectiveTracks);
                                    const parts = getPenCodePartsForGuest(row, rowTrackId, programs, creditScopeRows, guestElectiveTracks);
                                    const titleLabel = getDisplayTitleForGuest(row, rowTrackId, programs, creditScopeRows, guestElectiveTracks);
                                    const prereqLabel = formatGuestPrerequisite(row);
                                    // Rebuild with scope so "P: IT Electives 1" resolves for slots 2/3/4
                                    const electiveSlotPrereqLabel = getGuestRequiredPrerequisiteSlots(
                                      row,
                                      creditScopeRows,
                                    )
                                      .map((p) => `P: ${p.slot_name}`)
                                      .join(', ');
                                    const displayPrereqLabel = [
                                      prereqLabel,
                                      // Avoid duplicating if formatGuestPrerequisite already included it
                                      electiveSlotPrereqLabel &&
                                      !(prereqLabel || '').includes(electiveSlotPrereqLabel)
                                        ? electiveSlotPrereqLabel
                                        : '',
                                    ]
                                      .filter(Boolean)
                                      .join(', ');
                                    const coreqTag = getGuestCorequisiteTag(row, creditScopeRows);
                                    const val = remarks[id] || '';
                                    const creditGate = guestCanCreditWithCorequisites(
                                      creditScopeRows,
                                      row,
                                      remarks,
                                      yearLevels,
                                      guestElectiveTracks,
                                      programs,
                                    );
                                    const creditBlocked = val !== 'passed' && !creditGate.ok;
                                    const blockedTitle = creditBlocked
                                      ? creditGate.reason === 'standing'
                                        ? `Electives require 3rd year standing: ${creditGate.unmet.join(', ')}`
                                        : creditGate.reason === 'elective_prior'
                                          ? `Credit Elective 1 first: ${creditGate.unmet.join(', ')}`
                                          : creditGate.reason === 'coreq'
                                            ? `Credit corequisite together: ${creditGate.unmet.join(', ')}`
                                            : `Credit prerequisite first: ${creditGate.unmet.join(', ')}`
                                      : coreqTag
                                        ? `Crediting this also credits: ${coreqTag.codes.join(', ')}`
                                        : undefined;
                                    return (
                                      <tr key={id} className={creditBlocked ? 'guest-row--prereq-blocked' : undefined}>
                                        <td className="guest-td-pen">
                                          <div className="guest-code-pills">
                                            {parts.length === 0 ? (
                                              <span className="guest-code-pill guest-code-pill--empty">—</span>
                                            ) : (
                                              parts.map((code, pi) => (
                                                <span key={`${id}-code-${pi}`} className="guest-code-pill">
                                                  {code}
                                                </span>
                                              ))
                                            )}
                                          </div>
                                        </td>
                                        <td className="guest-td-title">
                                          <div className="guest-title-stack">
                                            {isTrackBasedElective ? (
                                              <button
                                                type="button"
                                                className="guest-elective-title-btn"
                                                onClick={() => {
                                                  setElectiveTrackModalSlotId(guestElectiveSlotKey(row));
                                                  setElectiveTrackModalOpen(true);
                                                }}
                                                title={
                                                  isGuestElectiveFourRow(row)
                                                    ? rowTrackId
                                                      ? 'Change track for Elective 4 only'
                                                      : 'Choose track for Elective 4 only'
                                                    : rowTrackId
                                                      ? 'Change track for Electives 1–3 (Digi also fills Elective 4)'
                                                      : 'Choose track for Electives 1–3 (Digi also fills Elective 4)'
                                                }
                                              >
                                                {titleLabel}
                                                {!rowTrackId ? (
                                                  <span className="guest-elective-title-btn__hint"> · Choose track</span>
                                                ) : null}
                                              </button>
                                            ) : (
                                              <span className="guest-title-main">{titleLabel}</span>
                                            )}
                                            {displayPrereqLabel ? (
                                              <span
                                                className={`guest-prereq-line${
                                                  creditBlocked &&
                                                  (creditGate.reason === 'prereq' ||
                                                    creditGate.reason === 'elective_prior')
                                                    ? ' guest-prereq-line--blocked'
                                                    : ''
                                                }`}
                                                title={blockedTitle || 'Prerequisite rules'}
                                              >
                                                {displayPrereqLabel}
                                              </span>
                                            ) : null}
                                            {isElectiveSlotRow(row) &&
                                            getGuestRequiredPrerequisiteSlots(row, creditScopeRows)
                                              .length === 0 ? (
                                              <span
                                                className={`guest-prereq-line${
                                                  creditBlocked && creditGate.reason === 'standing'
                                                    ? ' guest-prereq-line--blocked'
                                                    : ''
                                                }`}
                                                title="Electives unlock at 3rd year standing"
                                              >
                                                Requires 3rd year standing
                                              </span>
                                            ) : null}
                                            {coreqTag ? (
                                              <span
                                                className="guest-coreq-line"
                                                title={`Corequisite: mark ${coreqTag.codes.join(' and ')} credited in the same term as this subject`}
                                              >
                                                Co: {coreqTag.codes.join(', ')} — pass both this subject and its coreq
                                              </span>
                                            ) : null}
                                          </div>
                                        </td>
                                        <td className="guest-td-units">
                                          <span className="guest-units-pill">
                                            {getUnitsForGuest(row, rowTrackId, programs, creditScopeRows, guestElectiveTracks)}
                                          </span>
                                        </td>
                                        <td className="guest-td-remarks">
                                          <div className="guest-remarks-stack">
                                            <label
                                              className={`guest-remarks-check ${val === 'passed' ? 'guest-remarks-check--checked' : ''}${creditBlocked ? ' guest-remarks-check--blocked' : ''}`}
                                              title={blockedTitle}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={val === 'passed'}
                                                disabled={creditBlocked}
                                                onChange={(e) =>
                                                  setRemark(id, e.target.checked ? 'passed' : '')
                                                }
                                                aria-label={
                                                  creditBlocked
                                                    ? creditGate.reason === 'standing'
                                                      ? `${titleLabel} locked until 3rd year standing`
                                                      : creditGate.reason === 'elective_prior'
                                                        ? `${titleLabel} locked until Elective 1 is credited`
                                                        : creditGate.reason === 'coreq'
                                                          ? `${titleLabel} locked until corequisite can be credited: ${creditGate.unmet.join(', ')}`
                                                          : `${titleLabel} locked until prerequisite credited`
                                                    : coreqTag
                                                      ? `Mark ${titleLabel} and coreq ${coreqTag.codes.join(', ')} as credited`
                                                      : `Mark ${titleLabel} as credited`
                                                }
                                              />
                                              <span>Credited</span>
                                            </label>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr>
                                    <td colSpan={4} className="guest-term-footer">
                                      {(() => {
                                        const semTotal = section.rows.reduce((acc, row) => {
                                          const n = parseUnitsNumber(
                                            getUnitsForGuest(row, getGuestTrackIdForRow(row, guestElectiveTracks), programs, creditScopeRows, guestElectiveTracks),
                                          );
                                          return n != null ? acc + n : acc;
                                        }, 0);
                                        const semCredited = section.rows.reduce((acc, row) => {
                                          if (
                                            !isGuestEffectivelyCredited(
                                              creditScopeRows,
                                              row,
                                              remarks,
                                            )
                                          ) {
                                            return acc;
                                          }
                                          const n = parseUnitsNumber(
                                            getUnitsForGuest(row, getGuestTrackIdForRow(row, guestElectiveTracks), programs, creditScopeRows, guestElectiveTracks),
                                          );
                                          return n != null ? acc + n : acc;
                                        }, 0);
                                        const sectionYearIdx = yearStandingIndex(
                                          yearLevels,
                                          section.yearId,
                                        );
                                        const cap = getMaxUnitsForSlot(
                                          sectionYearIdx,
                                          section.semId,
                                          section.semesterLabel,
                                        );
                                        const overCap = semTotal > cap;
                                        return (
                                          <>
                                            Total units:{' '}
                                            <span
                                              className={`guest-units-pill guest-units-pill--footer${overCap ? ' guest-units-pill--over-cap' : ''}`}
                                            >
                                              {semTotal}
                                            </span>
                                            {' · '}
                                            Allowed (
                                            {/summer/i.test(String(section.semesterLabel || ''))
                                              ? 'Summer'
                                              : section.yearLabel}
                                            ): {cap}
                                            {semCredited > 0 ? ` · Credited: ${semCredited}` : ''}
                                            {overCap ? (
                                              <span className="guest-term-cap-warn">
                                                {' '}
                                                — only {cap} units count toward load for this term
                                              </span>
                                            ) : null}
                                          </>
                                        );
                                      })()}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </section>
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
              </div>
            </div>
              </div>
            </div>

            <div
              id="guest-panel-planner"
              className={`guest-sim-accordion guest-sim-accordion--planner${plannerOpen ? ' is-open' : ' is-collapsed'}${!plannerUnlocked ? ' is-locked' : ''}`}
            >
              <button
                type="button"
                className="guest-sim-accordion-toggle"
                aria-expanded={plannerOpen}
                aria-controls="guest-panel-planner-body"
                onClick={togglePlannerOpen}
                disabled={!plannerUnlocked}
                title={
                  plannerUnlocked
                    ? 'Show or hide subjects to take'
                    : 'Click Confirm first to open this container'
                }
              >
                <span className="guest-sim-accordion-toggle-title">Subjects to take</span>
                <span className="guest-sim-accordion-toggle-sub">
                  {plannerUnlocked
                    ? `${plannerStats.remainingUnits.toFixed(1)} remaining units · est. ${plannerStats.estimatedYears} yr`
                    : 'Confirm to unlock remaining subjects'}
                </span>
                <span className="guest-sim-accordion-chevron" aria-hidden>
                  {plannerOpen ? '▾' : '▸'}
                </span>
              </button>
              <div
                id="guest-panel-planner-body"
                className="guest-sim-accordion-body"
                hidden={!plannerOpen}
              >
            <section id="guest-planner" className="guest-planner guest-planner--nested" aria-labelledby="guest-planner-title">
              <div className="guest-planner-sticky-meta">
                <div className="guest-planner-head">
                  <div className="guest-planner-intro">
                    <h2 id="guest-planner-title" className="guest-planner-title">
                      Remaining subjects
                    </h2>
                    <p className="guest-planner-desc">
                      Credited subjects are hidden. Drag subjects between semesters or use Insert inside each slot.
                    </p>
                  </div>
                  <div className="guest-planner-estimates guest-sim-stats" aria-live="polite">
                    <div className="guest-planner-estimate guest-sim-stat">
                      <span className="guest-planner-estimate-label guest-sim-stat-label">Remaining units</span>
                      <span className="guest-planner-estimate-value guest-sim-stat-value">
                        {plannerStats.remainingUnits.toFixed(1)}
                      </span>
                    </div>
                    <div className="guest-planner-estimate guest-sim-stat">
                      <span className="guest-planner-estimate-label guest-sim-stat-label">Estimated years</span>
                      <span className="guest-planner-estimate-value guest-sim-stat-value">
                        {plannerStats.estimatedYears}
                      </span>
                    </div>
                    <div className="guest-planner-estimate guest-sim-stat">
                      <span className="guest-planner-estimate-label guest-sim-stat-label">Estimated semesters</span>
                      <span className="guest-planner-estimate-value guest-sim-stat-value">
                        {plannerStats.estimatedSemesters}
                      </span>
                    </div>
                    <div className="guest-planner-estimate guest-sim-stat">
                      <span className="guest-planner-estimate-label guest-sim-stat-label">Load limits</span>
                      <span className="guest-planner-estimate-value guest-sim-stat-value guest-planner-estimate-value--limits">
                        23 / 24 / 19 / 12 · Ext. 12 · Summer 9
                      </span>
                    </div>
                  </div>
                </div>
                <p className="guest-planner-note">
                  Standing: <strong>{plannerStats.standingLabel}</strong>
                  {' · '}
                  Unit limit by year: 1st = 23, 2nd = 24, 3rd = 19, 4th = 12 (per semester).
                  Extended years (5th+) = 12. Summer = 9.
                  {plannerStats.overloadedSlots > 0
                    ? ` ${plannerStats.overloadedSlots} semester slot(s) are over the allowed load.`
                    : ''}
                </p>
              </div>

              {remainingSubjectRows.length === 0 ? (
                <div className="guest-sim-empty">All subjects in this curriculum are credited.</div>
              ) : (
                <>
                <div className="guest-planner-years">
                  {plannerYears.map((yearGroup) => (
                    <section
                      key={yearGroup.key}
                      className={`guest-sim-year-card${yearGroup.isExtended ? ' guest-sim-year-card--extended' : ''}`}
                    >
                      <div className="guest-sim-year-heading">
                        <span className="guest-sim-year-heading__title">
                          {String(yearGroup.yearLabel || 'Unknown year').toUpperCase()}
                          {yearGroup.isExtended ? (
                            <span className="guest-extended-year-tag">Retake container</span>
                          ) : null}
                        </span>
                        {yearGroup.isExtended ? (
                          <button
                            type="button"
                            className="guest-extended-year-remove"
                            onClick={() => removeGuestExtendedYear(yearGroup.yearId)}
                          >
                            Remove container
                          </button>
                        ) : null}
                      </div>
                      <div className="guest-planner-term-layout">
                        {yearGroup.sections.map((section) => {
                          const termKind = getGuestSemesterKind(section.semId, semesters);
                          const yearIdx = yearStandingIndex(yearLevels, yearGroup.yearId);
                          const semCap = getMaxUnitsForSlot(
                            yearIdx,
                            section.semId,
                            section.semesterLabel,
                          );
                          const semUnits = section.rows.reduce((acc, row) => {
                            const n = parseUnitsNumber(
                              getUnitsForGuest(row, getGuestTrackIdForRow(row, guestElectiveTracks), programs, creditScopeRows, guestElectiveTracks),
                            );
                            return n != null ? acc + n : acc;
                          }, 0);
                          const overCap = semUnits > semCap;
                          const dropActive = plannerDragId != null;
                          const insertOpen = plannerOpenInsertSlotKey === section.key;
                          const slotInsertOptions = plannerSubjectOptions
                            .filter((opt) => {
                              if (opt.slotKey === section.key) return false;
                              return guestSubjectCanMoveToSemester(
                                opt.homeSemId,
                                section.semId,
                                semesters,
                              );
                            })
                            .map((opt) => ({
                              value: opt.id,
                              label: `${opt.label} (from ${opt.where})`,
                            }));
                          return (
                            <section
                              key={section.key}
                              className={`guest-planner-slot guest-planner-slot--kind-${termKind}${dropActive ? ' guest-planner-slot--droppable' : ''}${section.rows.length === 0 ? ' guest-planner-slot--empty' : ''}`}
                              onDragOver={(e) => {
                                if (!plannerDragId) return;
                                const dragRow = remainingSubjectRows.find(
                                  (r) => String(r.curriculum_id) === String(plannerDragId),
                                );
                                if (
                                  dragRow &&
                                  !guestSubjectCanMoveToSemester(
                                    getSemesterId(dragRow),
                                    section.semId,
                                    semesters,
                                  )
                                ) {
                                  e.dataTransfer.dropEffect = 'none';
                                  return;
                                }
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                const id =
                                  e.dataTransfer.getData('text/plain') || plannerDragId;
                                if (!id) return;
                                const dragRow = remainingSubjectRows.find(
                                  (r) => String(r.curriculum_id) === String(id),
                                );
                                if (
                                  dragRow &&
                                  !guestSubjectCanMoveToSemester(
                                    getSemesterId(dragRow),
                                    section.semId,
                                    semesters,
                                  )
                                ) {
                                  setPlannerDragId(null);
                                  return;
                                }
                                movePlannerSubject(id, section.yearId, section.semId);
                                setPlannerDragId(null);
                              }}
                            >
                              <div className="guest-sim-section-heading">
                                <h3>{section.semesterLabel}</h3>
                                <span
                                  className={`guest-planner-slot-units${overCap ? ' guest-planner-slot-units--over' : ''}`}
                                >
                                  {semUnits} / {semCap} u
                                </span>
                              </div>
                              {section.rows.length > 0 ? (
                                <ul className="guest-planner-list">
                                  {section.rows.map((row) => {
                                    const id = String(row.curriculum_id);
                                    const parts = getPenCodePartsForGuest(
                                      row,
                                      getGuestTrackIdForRow(row, guestElectiveTracks),
                                      programs,
                                      creditScopeRows,
                                      guestElectiveTracks,
                                    );
                                    const titleLabel = getDisplayTitleForGuest(
                                      row,
                                      getGuestTrackIdForRow(row, guestElectiveTracks),
                                      programs,
                                      creditScopeRows,
                                      guestElectiveTracks,
                                    );
                                    const units = getUnitsForGuest(
                                      row,
                                      getGuestTrackIdForRow(row, guestElectiveTracks),
                                      programs,
                                      creditScopeRows,
                                      guestElectiveTracks,
                                    );
                                    const placement = plannerPlacements[id] || {
                                      yearId: section.yearId,
                                      semId: section.semId,
                                    };
                                    const homeYearId = getYearLevelId(row);
                                    const homeSemId = getSemesterId(row);
                                    const isMovedFromHome =
                                      String(placement.yearId ?? '') !== String(homeYearId ?? '') ||
                                      String(placement.semId ?? '') !== String(homeSemId ?? '');
                                    const currentKey = `${placement.yearId ?? ''}|${placement.semId ?? ''}`;
                                    const moveOptions = getPlannerMoveOptionsForRow(row, currentKey);
                                    const moveNotes = buildGuestPlannerMoveNotes(row, {
                                      scopeRows: creditScopeRows,
                                      remarks,
                                      yearLevels,
                                      semesters,
                                      trackBySlot: guestElectiveTracks,
                                      programs,
                                    });
                                    return (
                                      <li
                                        key={id}
                                        className={`guest-planner-item${plannerDragId === id ? ' guest-planner-item--dragging' : ''}${isMovedFromHome ? ' guest-planner-item--moved' : ''}`}
                                        draggable
                                        onDragStart={(e) => {
                                          setPlannerDragId(id);
                                          e.dataTransfer.setData('text/plain', id);
                                          e.dataTransfer.effectAllowed = 'move';
                                        }}
                                        onDragEnd={() => setPlannerDragId(null)}
                                      >
                                        <div className="guest-planner-item-main">
                                          <div className="guest-code-pills">
                                            {parts.length === 0 ? (
                                              <span className="guest-code-pill guest-code-pill--empty">
                                                —
                                              </span>
                                            ) : (
                                              parts.map((code, pi) => (
                                                <span
                                                  key={`${id}-p-${pi}`}
                                                  className="guest-code-pill"
                                                >
                                                  {code}
                                                </span>
                                              ))
                                            )}
                                          </div>
                                          <span className="guest-planner-item-title">{titleLabel}</span>
                                          <span className="guest-units-pill">{units}</span>
                                          {isMovedFromHome ? (
                                            <button
                                              type="button"
                                              className="guest-planner-reset-btn"
                                              title="Return to curriculum term"
                                              aria-label={`Return ${parts[0] || titleLabel} to its curriculum term`}
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                resetPlannerSubjectToHome(id);
                                              }}
                                            >
                                              ×
                                            </button>
                                          ) : null}
                                        </div>
                                        <label className="guest-planner-move">
                                          <span className="guest-planner-move-label">Move to</span>
                                          <select
                                            key={`move-${id}-${currentKey}`}
                                            className="guest-sim-input guest-planner-move-select"
                                            value={
                                              moveOptions.some((slot) => slot.key === currentKey)
                                                ? currentKey
                                                : moveOptions[0]?.key || currentKey
                                            }
                                            onChange={(e) => {
                                              const [yearId, semId] = e.target.value.split('|');
                                              movePlannerSubject(
                                                id,
                                                yearId === '' ? null : yearId,
                                                semId === '' ? null : semId,
                                              );
                                            }}
                                          >
                                            {moveOptions.map((slot) => (
                                              <option key={slot.key} value={slot.key}>
                                                {slot.label}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        {moveNotes.length > 0 ? (
                                          <div className="guest-planner-move-notes">
                                            {moveNotes.map((note, ni) => (
                                              <p key={`${id}-note-${ni}`} className="guest-planner-move-note">
                                                {note}
                                              </p>
                                            ))}
                                          </div>
                                        ) : null}
                                      </li>
                                    );
                                  })}
                                </ul>
                              ) : null}
                              <div
                                className={`guest-planner-slot-insert-area${section.rows.length === 0 ? ' guest-planner-slot-insert-area--empty' : ''}`}
                              >
                                {section.rows.length === 0 && !insertOpen ? (
                                  <div className="guest-planner-empty-actions">
                                    <button
                                      type="button"
                                      className="guest-planner-slot-insert-btn guest-planner-slot-insert-btn--inline"
                                      onClick={() =>
                                        setPlannerOpenInsertSlotKey((open) =>
                                          open === section.key ? null : section.key,
                                        )
                                      }
                                    >
                                      + Insert subject
                                    </button>
                                    <p className="guest-planner-empty-slot">Drop subjects here</p>
                                  </div>
                                ) : null}
                                {insertOpen ? (
                                  <div className="guest-planner-slot-insert-panel">
                                    <label className="guest-planner-slot-insert-field">
                                      <span className="guest-planner-slot-insert-label">
                                        Subject to insert
                                      </span>
                                      <SearchableSelect
                                        id={`guest-planner-insert-${String(section.key).replace(/[^\w-]+/g, '-')}`}
                                        value=""
                                        onChange={(next) =>
                                          insertPlannerSubjectIntoSlot(
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
                                        className="guest-planner-slot-insert-search"
                                        aria-label={`Choose subject for ${section.semesterLabel}`}
                                        disabled={slotInsertOptions.length === 0}
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      className="guest-planner-slot-insert-cancel"
                                      onClick={() => setPlannerOpenInsertSlotKey(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : section.rows.length > 0 ? (
                                  <button
                                    type="button"
                                    className="guest-planner-slot-insert-btn"
                                    onClick={() =>
                                      setPlannerOpenInsertSlotKey((open) =>
                                        open === section.key ? null : section.key,
                                      )
                                    }
                                  >
                                    + Insert subject
                                  </button>
                                ) : null}
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
                {nextExtendedYearId ? (
                  <div className="guest-extended-year-cta">
                    <button
                      type="button"
                      className="guest-extended-year-cta__btn"
                      onClick={addGuestExtendedYear}
                    >
                      + Add retake container (
                      {guestExtendedStudyLabel(nextExtendedYearId, curriculumMaxYearId)})
                    </button>
                    <p className="guest-extended-year-cta__hint">
                      College year levels stay 1st–{guestOrdinalYearLabel(curriculumMaxYearId)} Year
                      (5th only for Architecture). This adds a planning container for retakes only —
                      standing unchanged, cap {GUEST_EXTENDED_SEM_UNIT_CAP} units per semester.
                    </p>
                  </div>
                ) : null}
                </>
              )}
            </section>
              </div>
            </div>
            </div>
          </main>

          {electiveTrackModalOpen && (
            <div
              className="guest-elective-modal-root"
              role="dialog"
              aria-modal="true"
              aria-labelledby="guest-elective-modal-title"
            >
              <button
                type="button"
                className="guest-elective-modal-backdrop"
                aria-label="Close"
                onClick={() => {
                  setElectiveTrackModalOpen(false);
                  setElectiveTrackModalSlotId(null);
                }}
              />
              <div className="guest-elective-modal">
                <h2 id="guest-elective-modal-title" className="guest-elective-modal-title">
                  Elective track
                </h2>
                <p className="guest-elective-modal-desc">
                  {isModalElectiveFour ? (
                    <>
                      Choosing a track here updates <strong>Elective 4 only</strong>. The subject for that track is
                      configured by admin under Lookup → Elective subjects (linked to the IT Electives 4 slot).
                    </>
                  ) : (
                    <>
                      Choosing a track here updates <strong>Electives 1–3</strong>.{' '}
                      <strong>Digital Arts</strong> also fills Elective 4 automatically.
                    </>
                  )}
                </p>
                {modalTrackOptions.length === 0 ? (
                  <p className="guest-elective-modal-empty">
                    No tracks were found on elective subjects for this slot. If this looks wrong, the curriculum may
                    need elective–track links in the admin.
                  </p>
                ) : (
                  <ul className="guest-elective-modal-list">
                    {modalTrackOptions.map((t) => {
                      const active = String(t.track_id) === String(modalSelectedTrackId);
                      return (
                        <li key={String(t.track_id)}>
                          <button
                            type="button"
                            className={`guest-elective-modal-option${active ? ' guest-elective-modal-option--active' : ''}`}
                            onClick={() => {
                              setGuestElectiveTracks(
                                buildGuestElectiveTracksForChoice(
                                  t,
                                  creditScopeRows,
                                  programs,
                                  modalElectiveRow,
                                  guestElectiveTracks,
                                ),
                              );
                              setElectiveTrackModalOpen(false);
                              setElectiveTrackModalSlotId(null);
                            }}
                          >
                            <span className="guest-elective-modal-option-name">{t.track_name}</span>
                            {t.track_code ? (
                              <span className="guest-elective-modal-option-code">{t.track_code}</span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="guest-elective-modal-footer">
                  {modalSelectedTrackId ? (
                    <button
                      type="button"
                      className="guest-elective-modal-clear"
                      onClick={() => {
                        setGuestElectiveTracks(
                          clearGuestElectiveTracksForSlot(
                            modalElectiveRow,
                            creditScopeRows,
                            programs,
                            guestElectiveTracks,
                          ),
                        );
                        setElectiveTrackModalOpen(false);
                        setElectiveTrackModalSlotId(null);
                      }}
                    >
                      {isModalElectiveFour ? 'Clear Elective 4' : 'Clear Electives 1–3'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="guest-elective-modal-close"
                    onClick={() => {
                      setElectiveTrackModalOpen(false);
                      setElectiveTrackModalSlotId(null);
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="guest-sim-action-dock" role="toolbar" aria-label="Curriculum simulation actions">
            {activeStep === 'planner' ? (
              <button
                type="button"
                className="guest-sim-float-btn guest-sim-float-btn--secondary"
                onClick={backToCurriculum}
              >
                Back
              </button>
            ) : (
              <button
                type="button"
                className="guest-sim-float-btn guest-sim-float-btn--primary"
                onClick={openPlanner}
              >
                Confirm
              </button>
            )}
          </div>
        </>
      )}
      </div>
    </div>
  );
}
