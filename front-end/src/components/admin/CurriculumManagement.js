import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import api, { jwtAuth } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { swalConfirm, swalError, swalToast } from '../../utils/swal';
import { formatEffectiveSchoolYear } from '../../utils/curriculumYear';
import SearchableSelect from '../common/SearchableSelect';
import './CurriculumManagement.css';

/** Mutate curriculum data (not view-only). Friendly name = full module from DefaultPermissionsSeeder. */
const CURRICULUM_MUTATE_PERMISSIONS = [
  'curriculum.create',
  'curriculum.edit',
  'curriculum.delete',
  'curriculum.approve',
  'Curriculum Management',
];

/** Curriculum API returns year_level as either an id or a nested { year_level_id, year_level } */
function normalizeYearLevelId(val) {
  if (val == null || val === '') return '';
  if (typeof val === 'object' && val.year_level_id != null) {
    return String(val.year_level_id);
  }
  return String(val);
}

/** Description column for elective curriculum rows: readable label from slot_name. */
function electiveSlotDescriptionLabel(slotName, electiveSlotId) {
  const s = (slotName || '').trim();
  const withoutProgramPrefix = s.replace(/^[A-Z0-9]+\s+/, '').trim();
  if (withoutProgramPrefix) return withoutProgramPrefix;

  const m = s.match(/electives?\s*(\d+)/i);
  if (m) return `Elective ${m[1]}`;

  return s || 'Elective';
}

/** e.g. 1 → "1st Year", 4 → "4th Year" (matches student My Curriculum wording). */
function ordinalYearLabel(yearNum) {
  const n = Number(yearNum);
  if (!Number.isFinite(n) || n < 1) {
    return yearNum != null && yearNum !== '' ? `Year ${yearNum}` : 'Year';
  }
  const j = n % 10;
  const k = n % 100;
  let suf = 'th';
  if (k < 11 || k > 13) {
    if (j === 1) suf = 'st';
    else if (j === 2) suf = 'nd';
    else if (j === 3) suf = 'rd';
  }
  return `${n}${suf} Year`;
}

function ordinalSemesterLabel(semesterNum) {
  const n = Number(semesterNum);
  if (n === 1) return '1st Semester';
  if (n === 2) return '2nd Semester';
  if (n === 3) return 'Summer';
  return semesterNum != null && semesterNum !== '' ? `Semester ${semesterNum}` : 'Semester';
}

/** ITE→core; GEN / PED / NST / SSP / MAT→minor (UI label GE). Other codes leave type empty. */
const SUBJECT_CODE_GE_PREFIXES = ['GEN', 'PED', 'NST', 'SSP', 'MAT'];
const IT_ELECTIVE_SUBJECT_CODES = new Set([
  'BAM285',
  'BAM286',
  'ITE382',
  'ITE383',
  'ITE384',
  'ITE385',
  'ITE387',
  'ITE235',
  'ITE386',
  'ITE391',
  'ITE392',
  'ITE240',
  'ITE388',
]);
const IT_ELECTIVE_SUBJECT_CODES_BY_TRACK = {
  sysdev: new Set(['ITE382', 'ITE387', 'ITE235', 'ITE386']),
  business: new Set(['BAM285', 'BAM286']),
  cyber: new Set(['ITE383', 'ITE384', 'ITE385']),
  digital: new Set(['ITE391', 'ITE392', 'ITE240', 'ITE388']),
};

const BULK_PREREQUISITE_RULE_OPTIONS = [
  { value: 'all professional subjects', label: 'All professional subjects' },
  { value: 'all core subjects', label: 'All core subjects' },
  { value: 'all major subjects', label: 'All major subjects' },
  { value: 'all professional education subjects', label: 'All professional education subjects' },
  { value: 'all professional and major subjects', label: 'All professional and major subjects' },
  { value: 'all professional and major specialization subjects', label: 'All professional and major specialization subjects' },
  { value: 'all board subjects', label: 'All board subjects' },
  { value: '100% professional units', label: '100% professional units' },
  { value: 'all subjects', label: 'All subjects' },
  {
    value: 'all general education, professional education, and specialization subjects',
    label: 'All general education, professional education, and specialization subjects',
  },
  { value: '2nd year standing', label: '2nd year standing' },
  { value: '3rd year standing', label: '3rd year standing' },
  { value: '4th year standing', label: '4th year standing' },
  {
    value: 'all subjects from 1st year to 4th year 1st semester',
    label: 'All subjects from 1st year to 4th year 1st semester',
  },
  { value: 'all subjects from 1st year to 3rd year', label: 'All subjects from 1st year to 3rd year' },
  { value: 'all subjects from 1st year to 2nd year', label: 'All subjects from 1st year to 2nd year' },
  { value: 'all subjects from 2nd year to 3rd year', label: 'All subjects from 2nd year to 3rd year' },
  { value: 'all subjects from 2nd year to 4th year', label: 'All subjects from 2nd year to 4th year' },
  { value: 'all subjects from 3rd year to 4th year', label: 'All subjects from 3rd year to 4th year' },
];

function normalizeSubjectCode(subjectCode) {
  return String(subjectCode || '').replace(/\s+/g, '').toUpperCase();
}

function itElectiveTrackKey(track) {
  if (!track) return '';
  const text = `${track.track_code || ''} ${track.track_name || ''}`.toLowerCase();
  if (text.includes('sys') || text.includes('system')) return 'sysdev';
  if (text.includes('bam') || text.includes('business')) return 'business';
  if (text.includes('cyber') || text.includes('computer security')) return 'cyber';
  if (text.includes('digi') || text.includes('digital') || text.includes('arts')) return 'digital';
  return '';
}

function isInformationTechnologyProgram(program) {
  if (!program) return false;
  const code = String(program.program_code || '').toLowerCase();
  const name = String(program.program_name || '').toLowerCase();
  return code === 'it' || code.includes('bsit') || name.includes('information technology');
}

function defaultSubjectTypeFromSubjectCode(subjectCode) {
  const c = (subjectCode || '').trim().toUpperCase();
  if (c.startsWith('ITE')) return 'core';
  if (SUBJECT_CODE_GE_PREFIXES.some((p) => c.startsWith(p))) return 'minor';
  return '';
}

function normalizeSubjectCodeKey(code) {
  return String(code || '').trim().toLowerCase();
}

const PASSING_GRADE_OPTIONS = [
  { value: '50', label: '50' },
  { value: '60', label: '60' },
  { value: '70', label: '70' },
  { value: '80', label: '80' },
  { value: '90', label: '90' },
  { value: 'complete', label: 'complete' },
];

const SUBJECT_TYPE_OPTIONS = [
  { value: 'minor', label: 'GE' },
  { value: 'core', label: 'Core / Major' },
  { value: 'elective subject', label: 'Elective Subject' },
];

function resolvePassingGradeValue(row) {
  if (!row) return null;
  let value = row.passing_grade;
  if (value === 'other' && row.custom_grade) {
    value = row.custom_grade;
  }
  const trimmed = value == null ? '' : String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function emptySubjectRow() {
  return {
    subject_id: '',
    subject_code: '',
    subject_name: '',
    elective_slot_id: '',
    is_elective_slot: false,
    passing_grade: '',
    custom_grade: '',
    subject_type: '',
    requisite_id: '',
    number_of_units: '',
    number_of_hrs: '',
  };
}

function subjectRowFromCurriculum(curriculum) {
  if (!curriculum) return emptySubjectRow();
  return {
    subject_id: curriculum.subject_id?.toString() || '',
    subject_code:
      curriculum.subject?.subject_code ||
      curriculum.subject_code ||
      '',
    subject_name:
      curriculum.subject?.subject_name ||
      curriculum.subject_name ||
      '',
    elective_slot_id: curriculum.elective_slot_id?.toString() || '',
    is_elective_slot: !!curriculum.elective_slot_id,
    passing_grade: curriculum.passing_grade?.toString() || '',
    custom_grade: '',
    subject_type: curriculum.subject_type || '',
    requisite_id:
      (curriculum.requisite_id ??
        curriculum.prerequisite_id ??
        curriculum.requisites_id)?.toString() || '',
    number_of_units:
      curriculum.subject?.number_of_units ??
      curriculum.number_of_units ??
      '',
    number_of_hrs:
      curriculum.subject?.number_of_hrs ??
      curriculum.number_of_hrs ??
      '',
  };
}

/** Requisite row id for `<select>` value (aligned with getRequisiteOptionsForBulkRow). */
function getRequisiteRecordId(requisite) {
  if (!requisite) return '';
  const requisiteId =
    requisite.requisite_id ??
    requisite.prerequisite_id ??
    requisite.corequisite_id ??
    requisite.prereq_id ??
    requisite.coreq_id ??
    requisite.requisites_id;
  return requisiteId != null && requisiteId !== '' ? String(requisiteId) : '';
}

/** Prefer first prerequisite, else first corequisite (user can change in dropdown). */
function pickDefaultRequisiteId(prereqs, coreqs) {
  const firstId = (arr) => (Array.isArray(arr) && arr.length ? getRequisiteRecordId(arr[0]) : '');
  return firstId(prereqs) || firstId(coreqs);
}

/** UI label for stored subject_type (value stays `minor` for API). */
function formatSubjectTypeForDisplay(type) {
  if (type == null || type === '') return '-';
  const t = String(type).trim().toLowerCase();
  if (t === 'minor') return 'GE';
  return type;
}

function yearLevelPillLabel(yearLevelId, fallbackName) {
  const id =
    yearLevelId != null && yearLevelId !== ''
      ? Number.parseInt(String(yearLevelId), 10)
      : NaN;
  if (Number.isFinite(id) && id >= 1) {
    return ordinalYearLabel(id);
  }
  const s = (fallbackName || '').trim();
  return s || 'Year';
}

const CurriculumManagement = ({ lockedProgramId = null } = {}) => {
  const { hasAnyPermission, user } = useAuth();
  const canMutateCurriculum = hasAnyPermission(CURRICULUM_MUTATE_PERMISSIONS);
  const curriculumFetchInFlightRef = useRef(false);
  const lookupFetchInFlightRef = useRef(false);

  /** When set (e.g. Dean’s assigned program), filter + add forms stay on that program only. */
  const scopedProgramId =
    lockedProgramId != null && String(lockedProgramId).trim() !== ''
      ? String(lockedProgramId)
      : '';

  const [curricula, setCurricula] = useState([]);
  const [lookupData, setLookupData] = useState({
    programs: [],
    subjects: [],
    yearLevels: [],
    semesters: [],
    prerequisites: [],
    corequisites: [],
    curriculumHeaders: [],
    electiveSlots: [],
    tracks: [],
  });
  
  // Ensure lookupData is always an object with arrays
  const safeLookupData = {
    programs: Array.isArray(lookupData.programs) ? lookupData.programs : [],
    subjects: Array.isArray(lookupData.subjects) ? 
      // Remove duplicates based on subject_code, keeping the first occurrence
      lookupData.subjects.filter((subject, index, self) => 
        index === self.findIndex((s) => s.subject_code === subject.subject_code)
      ) : [],
    yearLevels: Array.isArray(lookupData.yearLevels) ? lookupData.yearLevels : [],
    semesters: Array.isArray(lookupData.semesters) ? lookupData.semesters : [],
    prerequisites: Array.isArray(lookupData.prerequisites) ? lookupData.prerequisites : [],
    corequisites: Array.isArray(lookupData.corequisites) ? lookupData.corequisites : [],
    curriculumHeaders: Array.isArray(lookupData.curriculumHeaders) ? lookupData.curriculumHeaders : [],
    requisites: Array.isArray(lookupData.requisites) ? lookupData.requisites : [],
    electiveSlots: Array.isArray(lookupData.electiveSlots) ? lookupData.electiveSlots : [],
    electiveSubjects: Array.isArray(lookupData.electiveSubjects) ? lookupData.electiveSubjects : [],
    tracks: Array.isArray(lookupData.tracks) ? lookupData.tracks : [],
  };

  const programSearchOptions = useMemo(
    () =>
      safeLookupData.programs
        .filter((p) => !scopedProgramId || String(p.program_id) === scopedProgramId)
        .map((p) => ({
          value: String(p.program_id),
          label: `${p.program_name} (${p.program_code})`,
        })),
    [safeLookupData.programs, scopedProgramId],
  );

  const subjectSearchOptions = useMemo(
    () =>
      safeLookupData.subjects.map((s) => ({
        value: String(s.subject_id),
        label: `${s.subject_code} - ${s.subject_name}`,
      })),
    [safeLookupData.subjects],
  );

  const trackSearchOptions = useMemo(
    () =>
      safeLookupData.tracks.map((t) => ({
        value: String(t.track_id),
        label: `${t.track_code || 'Track'} - ${t.track_name || ''}`.trim(),
      })),
    [safeLookupData.tracks],
  );

  // caches for per-subject requisites (keyed by subject id string)
  const [availablePrerequisites, setAvailablePrerequisites] = useState({});
  const [availableCorequisites, setAvailableCorequisites] = useState({});

  // Helper: resolve requisite's required subject id and label (subject code/name) from various shapes
  // FIX: Added fallback to look up subject code from safeLookupData if requiredSubject is missing
  const resolveRequisiteLabel = (requisite) => {
    if (!requisite) {
      return { id: null, label: '-' };
    }

    const prefix =
      requisite.requisite_type === 'prerequisite'
        ? 'P:'
        : requisite.requisite_type === 'corequisite'
        ? 'Co:'
        : 'REQ:';

    const id = requisite.requisites_id || requisite.requisite_id || requisite.prerequisite_id || requisite.corequisite_id || requisite.prereq_id || requisite.coreq_id || null;
    
    let subjectCode = '-';
    
    // Try to get code from nested relationship first
    if (requisite.requiredSubject && requisite.requiredSubject.subject_code) {
      subjectCode = requisite.requiredSubject.subject_code;
    } else {
      // Fallback: Manually find the subject in the global list using the ID
      // This fixes the issue where dropdown options show "-" because the global lookup
      // didn't eager load the requiredSubject relationship.
      const requiredSubjectId = requisite.requisites_subject_id || requisite.required_subject_id || requisite.coreq_subject_id;
      if (requiredSubjectId) {
        const found = safeLookupData.subjects.find(s => s.subject_id?.toString() === requiredSubjectId.toString());
        if (found) {
          subjectCode = found.subject_code;
        }
      }
    }

    return {
      id,
      label: subjectCode !== '-' ? `${prefix} ${subjectCode}` : '-'
    };
  };

  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCurriculum, setEditingCurriculum] = useState(null);
  
  // For bulk add form
  const [bulkFormData, setBulkFormData] = useState({
    program_id: '',
    curriculum_header_id: '',
    year_level: '',
    semester_id: '',
  });
  
  // Array of subjects to add/edit
  const [subjectRows, setSubjectRows] = useState([emptySubjectRow()]);
  const [suggestOpen, setSuggestOpen] = useState(null); // { index, field: 'code' | 'title' } | null
  /** 'edit' = update selected curriculum row; 'insert' = add new subject into group/term */
  const [editPanelMode, setEditPanelMode] = useState('edit');
  const [editGroupContext, setEditGroupContext] = useState(null);
  const [editPanelDirty, setEditPanelDirty] = useState(false);
  
  const [error, setError] = useState('');
  const [filterProgram, setFilterProgram] = useState(scopedProgramId || '');
  const [filterCurriculumYear, setFilterCurriculumYear] = useState('');

  useEffect(() => {
    if (!scopedProgramId) return;
    setFilterProgram(scopedProgramId);
  }, [scopedProgramId]);

  // Keep Edit Group subject picker in sync after insert/edit refreshes curricula
  useEffect(() => {
    if (!editGroupContext?.programId || !editGroupContext?.yearLevelId) return;
    if (!Array.isArray(curricula) || curricula.length === 0) return;
    const refreshed = curricula.filter(
      (c) =>
        String(c.program_id) === String(editGroupContext.programId) &&
        normalizeYearLevelId(c.year_level) === String(editGroupContext.yearLevelId),
    );
    setEditGroupContext((prev) =>
      prev ? { ...prev, curricula: refreshed } : prev,
    );
  }, [curricula]); // eslint-disable-line react-hooks/exhaustive-deps
  const curriculumYearOptions = useMemo(() => {
    const years = new Set();
    safeLookupData.curriculumHeaders
      .filter((header) => {
        if (!filterProgram) return true;
        return String(header?.program_id ?? header?.program?.program_id ?? '') === String(filterProgram);
      })
      .forEach((header) => {
        const year = header?.Effective_Year ?? header?.effective_year;
        if (year !== null && year !== undefined && String(year).trim() !== '') {
          years.add(String(year));
        }
      });

    return Array.from(years)
      .sort((a, b) => Number(b) - Number(a))
      .map((year) => ({
        value: year,
        label: formatEffectiveSchoolYear(year) || `Effective SY ${year}`,
      }));
  }, [safeLookupData.curriculumHeaders, filterProgram]);
  /** Which year-level group is shown (1-based index into grouped curricula for the current filter) */
  const [yearLevelPage, setYearLevelPage] = useState(1);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [showCorequisiteModal, setShowCorequisiteModal] = useState(false);
  const [selectedCurriculum, setSelectedCurriculum] = useState(null);
  const [editBulkPrerequisiteText, setEditBulkPrerequisiteText] = useState('');
  const [editBulkPrerequisiteRange, setEditBulkPrerequisiteRange] = useState({
    from_year_level: '',
    to_year_level: '',
  });
  const [showElectiveSubjectModal, setShowElectiveSubjectModal] = useState(false);
  const [selectedElectiveSlot, setSelectedElectiveSlot] = useState(null);
  const [electiveSubjectForm, setElectiveSubjectForm] = useState({
    subject_id: '',
    track_id: '',
  });
  const [electiveSubjectSaving, setElectiveSubjectSaving] = useState(false);

  const selectedElectiveSlotProgram = useMemo(
    () =>
      selectedElectiveSlot?.program ||
      safeLookupData.programs.find(
        (program) => String(program.program_id) === String(selectedElectiveSlot?.program_id || ''),
      ) ||
      null,
    [selectedElectiveSlot, safeLookupData.programs],
  );

  const selectedElectiveSlotIsIt = isInformationTechnologyProgram(selectedElectiveSlotProgram);

  const electiveSlotSubjectOptions = useMemo(() => {
    const assignedSubjectIds = new Set(
      (selectedElectiveSlot?.electiveSubjects || [])
        .map((item) => item.subject_id ?? item.subject?.subject_id)
        .filter(Boolean)
        .map((subjectId) => String(subjectId)),
    );

    const slotProgramId = selectedElectiveSlotProgram?.program_id ?? selectedElectiveSlot?.program_id ?? '';
    const programElectiveSubjectIds = new Set();
    safeLookupData.electiveSubjects.forEach((row) => {
      const rowProgramId = row?.program_id ?? row?.program?.program_id;
      if (slotProgramId && String(rowProgramId || '') === String(slotProgramId)) {
        const subjectId = row?.subject_id ?? row?.subject?.subject_id;
        if (subjectId) programElectiveSubjectIds.add(String(subjectId));
      }
    });
    safeLookupData.electiveSlots.forEach((slot) => {
      const rowProgramId = slot?.program_id ?? slot?.program?.program_id;
      if (slotProgramId && String(rowProgramId || '') === String(slotProgramId)) {
        (slot.electiveSubjects || slot.elective_subjects || []).forEach((row) => {
          const subjectId = row?.subject_id ?? row?.subject?.subject_id;
          if (subjectId) programElectiveSubjectIds.add(String(subjectId));
        });
      }
    });
    const selectedTrack = safeLookupData.tracks.find(
      (track) => String(track.track_id) === String(electiveSubjectForm.track_id || ''),
    );
    const selectedItTrackKey = itElectiveTrackKey(selectedTrack);
    const selectedTrackSubjectCodes = selectedItTrackKey
      ? IT_ELECTIVE_SUBJECT_CODES_BY_TRACK[selectedItTrackKey]
      : null;

    return safeLookupData.subjects
      .filter((subject) => !assignedSubjectIds.has(String(subject.subject_id)))
      .filter((subject) => {
        if (!selectedElectiveSlotIsIt) {
          return programElectiveSubjectIds.has(String(subject.subject_id));
        }
        const subjectCode = normalizeSubjectCode(subject.subject_code);
        if (selectedTrackSubjectCodes) {
          return selectedTrackSubjectCodes.has(subjectCode);
        }
        return IT_ELECTIVE_SUBJECT_CODES.has(subjectCode);
      })
      .map((subject) => ({
        value: String(subject.subject_id),
        label: `${subject.subject_code} - ${subject.subject_name}`,
      }));
  }, [
    electiveSubjectForm.track_id,
    selectedElectiveSlot,
    selectedElectiveSlotIsIt,
    selectedElectiveSlotProgram,
    safeLookupData.electiveSlots,
    safeLookupData.electiveSubjects,
    safeLookupData.subjects,
    safeLookupData.tracks,
  ]);

  useEffect(() => {
    if (!canMutateCurriculum) {
      setShowModal(false);
      setShowEditPanel(false);
      setShowCorequisiteModal(false);
      setShowElectiveSubjectModal(false);
    }
  }, [canMutateCurriculum]);
  
  // Co-requisite form state
  const [corequisiteForm, setCorequisiteForm] = useState({
    subject_id: '',
    coreq_subject_id: '',
  });

  const bulkElectiveSlotSearchOptions = useMemo(() => {
    if (!bulkFormData.program_id || !bulkFormData.year_level || !bulkFormData.semester_id) {
      return [];
    }
    return safeLookupData.electiveSlots
      .filter(
        (slot) =>
          slot.program_id?.toString() === bulkFormData.program_id.toString() &&
          slot.year_level_id?.toString() === bulkFormData.year_level.toString() &&
          slot.semester_id?.toString() === bulkFormData.semester_id.toString(),
      )
      .map((s) => ({
        value: String(s.elective_slot_id),
        label: s.slot_name || `Slot ${s.elective_slot_id}`,
      }));
  }, [
    bulkFormData.program_id,
    bulkFormData.year_level,
    bulkFormData.semester_id,
    safeLookupData.electiveSlots,
  ]);

  const bulkCurriculumHeaderOptions = useMemo(() => {
    const programId = bulkFormData.program_id;
    return safeLookupData.curriculumHeaders
      .filter((header) => {
        if (!programId) return true;
        return String(header?.program_id ?? header?.program?.program_id ?? '') === String(programId);
      })
      .slice()
      .sort((a, b) => {
        const yearA = parseInt(a?.Effective_Year ?? a?.effective_year ?? 0, 10) || 0;
        const yearB = parseInt(b?.Effective_Year ?? b?.effective_year ?? 0, 10) || 0;
        if (yearB !== yearA) return yearB - yearA;
        return Number(b?.curriculum_header_id ?? 0) - Number(a?.curriculum_header_id ?? 0);
      })
      .map((header) => {
        const id = header?.curriculum_header_id ?? header?.id;
        const desc = String(header?.description || '').trim();
        const year = formatEffectiveSchoolYear(header?.Effective_Year ?? header?.effective_year);
        const programCode =
          header?.program?.program_code ||
          header?.program?.program_name ||
          '';
        const label = [desc || programCode || `Header #${id}`, year ? `SY ${year}` : '']
          .filter(Boolean)
          .join(' · ');
        return {
          value: String(id),
          label,
        };
      })
      .filter((option) => option.value);
  }, [bulkFormData.program_id, safeLookupData.curriculumHeaders]);

  const editElectiveSlotSearchOptions = useMemo(() => {
    const programId = bulkFormData.program_id || selectedCurriculum?.program_id;
    const yearLevelId = normalizeYearLevelId(
      bulkFormData.year_level || selectedCurriculum?.year_level,
    );
    const semesterId = bulkFormData.semester_id || selectedCurriculum?.semester_id;
    return safeLookupData.electiveSlots
      .filter((slot) => {
        if (!programId || !yearLevelId || !semesterId) return true;
        return (
          slot.program_id?.toString() === programId.toString() &&
          slot.year_level_id?.toString() === yearLevelId &&
          slot.semester_id?.toString() === semesterId.toString()
        );
      })
      .map((s) => ({
        value: String(s.elective_slot_id),
        label: s.slot_name || `Slot ${s.elective_slot_id}`,
      }));
  }, [
    bulkFormData.program_id,
    bulkFormData.year_level,
    bulkFormData.semester_id,
    selectedCurriculum,
    safeLookupData.electiveSlots,
  ]);

  const coreqCoSubjectSearchOptions = useMemo(
    () =>
      subjectSearchOptions.filter(
        (o) => o.value !== (corequisiteForm.subject_id ? String(corequisiteForm.subject_id) : ''),
      ),
    [subjectSearchOptions, corequisiteForm.subject_id],
  );

  const getRequisiteOptionsForBulkRow = (row) => {
    if (!row) return [];
    const subjectIdForRow = row.subject_id ? row.subject_id.toString() : null;
    const cachedPrereqs = subjectIdForRow ? availablePrerequisites[subjectIdForRow] : null;
    const cachedCoreqs = subjectIdForRow ? availableCorequisites[subjectIdForRow] : null;
    const cachedMerged = [
      ...(Array.isArray(cachedPrereqs) ? cachedPrereqs : []),
      ...(Array.isArray(cachedCoreqs) ? cachedCoreqs : []),
    ];

    const combined =
      Array.isArray(safeLookupData.requisites) && safeLookupData.requisites.length
        ? safeLookupData.requisites
        : [
            ...(Array.isArray(safeLookupData.prerequisites) ? safeLookupData.prerequisites : []),
            ...(Array.isArray(safeLookupData.corequisites) ? safeLookupData.corequisites : []),
          ];

    const getRequisitesForSubject = (subjectId, requisites) => {
      if (!subjectId) return [];
      return requisites.filter((r) => r && r.subject_id?.toString() === subjectId.toString());
    };

    let relevant =
      cachedMerged.length > 0
        ? cachedMerged
        : getRequisitesForSubject(subjectIdForRow, combined);

    if (row.requisite_id) {
      const selectedRequisite = combined.find((r) => {
        const requisiteId =
          r.requisite_id ||
          r.prerequisite_id ||
          r.corequisite_id ||
          r.prereq_id ||
          r.coreq_id;
        const fallbackId = r.requisites_id;
        return (
          (requisiteId || fallbackId) &&
          (requisiteId || fallbackId).toString() === row.requisite_id.toString()
        );
      });
      if (
        selectedRequisite &&
        !relevant.find((r) => {
          const requisiteId =
            r.requisite_id ||
            r.prerequisite_id ||
            r.corequisite_id ||
            r.prereq_id ||
            r.coreq_id;
          const fallbackId = r.requisites_id;
          return (
            (requisiteId || fallbackId) &&
            (requisiteId || fallbackId).toString() === row.requisite_id.toString()
          );
        })
      ) {
        relevant = [...relevant, selectedRequisite];
      }
    }

    return relevant
      .map((requisite, idx) => {
        if (!requisite) return null;
        const requisiteId =
          requisite.requisite_id ||
          requisite.prerequisite_id ||
          requisite.corequisite_id ||
          requisite.prereq_id ||
          requisite.coreq_id ||
          requisite.requisites_id;
        if (requisiteId == null) return null;
        const resolved = resolveRequisiteLabel(requisite);
        return {
          value: String(requisiteId),
          label: resolved.label,
          key: resolved.id ?? `req-${idx}`,
        };
      })
      .filter(Boolean);
  };

  const getRequisiteOptionsForEdit = () => {
    const combined =
      Array.isArray(safeLookupData.requisites) && safeLookupData.requisites.length
        ? safeLookupData.requisites
        : [
            ...(Array.isArray(safeLookupData.prerequisites) ? safeLookupData.prerequisites : []),
            ...(Array.isArray(safeLookupData.corequisites) ? safeLookupData.corequisites : []),
          ];

    const subjectIdForEdit =
      (subjectRows[0] && subjectRows[0].subject_id
        ? subjectRows[0].subject_id.toString()
        : null) ||
      (selectedCurriculum?.subject_id != null ? String(selectedCurriculum.subject_id) : null);

    let relevantEdit = combined.filter(
      (r) => r.subject_id?.toString() === subjectIdForEdit,
    );

    const currentRequisiteId = subjectRows[0]?.requisite_id || selectedCurriculum?.requisite_id;
    if (currentRequisiteId) {
      const selectedRequisite = combined.find((r) => {
        const requisiteId =
          r.requisite_id ||
          r.prerequisite_id ||
          r.corequisite_id ||
          r.prereq_id ||
          r.coreq_id ||
          r.requisites_id;
        return requisiteId && requisiteId.toString() === currentRequisiteId.toString();
      });
      if (
        selectedRequisite &&
        !relevantEdit.find((r) => {
          const requisiteId =
            r.requisite_id ||
            r.prerequisite_id ||
            r.corequisite_id ||
            r.prereq_id ||
            r.coreq_id ||
            r.requisites_id;
          return requisiteId && requisiteId.toString() === currentRequisiteId.toString();
        })
      ) {
        relevantEdit = [...relevantEdit, selectedRequisite];
      }
    }

    return relevantEdit.map((requisite, idx) => {
      if (!requisite) return null;
      const requisiteId =
        requisite.requisite_id ||
        requisite.prerequisite_id ||
        requisite.corequisite_id ||
        requisite.prereq_id ||
        requisite.coreq_id ||
        requisite.requisites_id;
      if (requisiteId == null) return null;
      const resolved = resolveRequisiteLabel(requisite);
      return {
        value: String(requisiteId),
        label: resolved.label,
        key: resolved.id ?? `edit-req-${idx}`,
      };
    }).filter(Boolean);
  };

  useEffect(() => {
    if (!user || !jwtAuth.isAuthenticated()) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    fetchCurricula({ signal: controller.signal });
    fetchLookupData({ signal: controller.signal });

    return () => {
      controller.abort();
      curriculumFetchInFlightRef.current = false;
      lookupFetchInFlightRef.current = false;
    };
  }, [user]);

  useEffect(() => {
    setYearLevelPage(1);
  }, [filterProgram, filterCurriculumYear]);

  useEffect(() => {
    if (!filterProgram) {
      if (filterCurriculumYear) {
        setFilterCurriculumYear('');
      }
      return;
    }

    if (curriculumYearOptions.length === 0) {
      if (filterCurriculumYear) {
        setFilterCurriculumYear('');
      }
      return;
    }

    const selectedYearStillAvailable = curriculumYearOptions.some(
      (option) => String(option.value) === String(filterCurriculumYear)
    );

    if (!selectedYearStillAvailable) {
      setFilterCurriculumYear(curriculumYearOptions[0].value);
    }
  }, [curriculumYearOptions, filterCurriculumYear, filterProgram]);

  const fetchCurricula = async ({ signal, force = false } = {}) => {
    if (!jwtAuth.isAuthenticated()) {
      setLoading(false);
      return;
    }
    if (curriculumFetchInFlightRef.current && !force) {
      return;
    }

    curriculumFetchInFlightRef.current = true;
    try {
      const response = await api.get('/curriculum', { signal });
      setCurricula(response.data);
    } catch (error) {
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        return;
      }
      console.error('Error fetching curriculum:', error);
      setError('Failed to fetch curriculum');
    } finally {
      curriculumFetchInFlightRef.current = false;
      setLoading(false);
    }
  };

  const fetchLookupData = async ({ signal, force = false } = {}) => {
    if (!jwtAuth.isAuthenticated()) {
      return;
    }
    if (lookupFetchInFlightRef.current && !force) {
      return;
    }

    lookupFetchInFlightRef.current = true;
    try {
      const res = await api.get('/lookup/page-bundle', { signal });
      const combinedData = res.data || {};
      const curriculumHeadersData = Array.isArray(combinedData.curriculumHeaders)
        ? combinedData.curriculumHeaders
        : [];

      // Normalize lookup data: backend returns 'requisites' (mixed prerequisites/corequisites)
      let normalizedLookup = {
        ...combinedData,
        curriculumHeaders: curriculumHeadersData,
        electiveSlots: Array.isArray(combinedData.electiveSlots) ? combinedData.electiveSlots : [],
      };
      if (combinedData.requisites && Array.isArray(combinedData.requisites)) {
        const requisites = combinedData.requisites;
        normalizedLookup.prerequisites = requisites.filter(r => (r.requisite_type || r.type || '').toString().toLowerCase() === 'prerequisite');
        normalizedLookup.corequisites = requisites.filter(r => (r.requisite_type || r.type || '').toString().toLowerCase() === 'corequisite');
      }
      setLookupData(normalizedLookup);
      
      // Handle prerequisites: could be Object or Array or come from mixed 'requisites'
      const prereqSource = normalizedLookup.prerequisites || combinedData.prerequisites || [];
      if (prereqSource) {
        let prereqsBySubject = {};
        if (Array.isArray(prereqSource)) {
          // If it's an array, group it by subject_id
          prereqSource.forEach(prereq => {
            const subjectId = prereq.subject_id?.toString();
            if (subjectId) {
              if (!prereqsBySubject[subjectId]) {
                prereqsBySubject[subjectId] = [];
              }
              prereqsBySubject[subjectId].push(prereq);
            }
          });
        } else if (typeof prereqSource === 'object') {
          // If it's already an object keyed by subject id, use it directly
          prereqsBySubject = prereqSource;
        }
        setAvailablePrerequisites(prereqsBySubject);
      }

      // Handle corequisites: could be Object or Array
      const coreqSource = normalizedLookup.corequisites || combinedData.corequisites || [];
      if (coreqSource) {
        let coreqsBySubject = {};
        if (Array.isArray(coreqSource)) {
          // If it's an array, group it by subject_id and also index by other related ids
          coreqSource.forEach(coreq => {
            const subjectId = coreq.subject_id?.toString();
            const otherId = coreq.coreq_subject_id?.toString() || coreq.coreqSubjectId?.toString();
            const requiredId = coreq.requiredSubject?.subject_id?.toString();

            const indexFor = (id) => {
              if (!id) return;
              if (!coreqsBySubject[id]) coreqsBySubject[id] = [];
              coreqsBySubject[id].push(coreq);
            };

            indexFor(subjectId);
            indexFor(otherId);
            indexFor(requiredId);
          });
        } else if (typeof coreqSource === 'object') {
          coreqsBySubject = coreqSource;
        }
        setAvailableCorequisites(coreqsBySubject);
      }
    } catch (error) {
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        return;
      }
      console.error('Error fetching lookup data:', error);
    } finally {
      lookupFetchInFlightRef.current = false;
    }
  };

  const fetchPrerequisitesForSubject = async (subjectId) => {
    if (!subjectId) {
      return [];
    }

    const subjectIdStr = subjectId.toString();
    
    // Check if prerequisites are already loaded from pre-population
    const existingPrereqs = availablePrerequisites[subjectIdStr];
    if (existingPrereqs) {
      return existingPrereqs; // Return existing prerequisites (even if empty array)
    }
    
    try {
      // First try to fetch from API
      const response = await api.get(`/prerequisites/subject/${subjectId}`);
      const apiPrereqs = response.data || [];
      
      // FIX: Always update state, even if empty, to prevent repeated fetches
      setAvailablePrerequisites(prev => {
        const updated = { ...prev, [subjectIdStr]: apiPrereqs };
        return updated;
      });
      
      return apiPrereqs;
    } catch (error) {
      console.error('Error fetching prerequisites from API for subject', subjectIdStr, ':', error);
    }
    
    // Fallback: use prerequisites from lookup data
    const lookupPrereqs = safeLookupData.prerequisites || [];
    const lookupPrereqsForSubject = lookupPrereqs.filter(prereq => {
      if (!prereq) return false;
      if (!prereq.subject_id) return false;
      const prereqSubjectId = parseInt(prereq.subject_id);
      const subjectIdInt = parseInt(subjectIdStr);
      return prereqSubjectId === subjectIdInt;
    });
    
    // Only update if we found prerequisites - don't overwrite with empty array
    if (lookupPrereqsForSubject.length > 0) {
      setAvailablePrerequisites(prev => {
        const updated = { ...prev, [subjectIdStr]: lookupPrereqsForSubject };
        return updated;
      });
      return lookupPrereqsForSubject;
    } else {
      // FIX: Cache empty array to prevent fallback loop if API also failed
      setAvailablePrerequisites(prev => ({ ...prev, [subjectIdStr]: [] }));
      return [];
    }
  };

  const fetchCorequisitesForSubject = async (subjectId) => {
    if (!subjectId) {
      return [];
    }

    const subjectIdStr = subjectId.toString();
    
    // Check if corequisites are already loaded from pre-population
    const existingCoreqs = availableCorequisites[subjectIdStr];
    if (existingCoreqs) {
      return existingCoreqs; 
    }
    
    // Fallback: use corequisites from lookup data
    const lookupCoreqs = safeLookupData.corequisites || [];
    const subjectIdInt = parseInt(subjectIdStr);
    const lookupCoreqsForSubject = lookupCoreqs.filter(coreq => {
      if (!coreq) return false;

      const candidates = [];
      if (coreq.subject_id !== undefined) candidates.push(parseInt(coreq.subject_id));
      if (coreq.coreq_subject_id !== undefined) candidates.push(parseInt(coreq.coreq_subject_id));
      if (coreq.coreqSubjectId !== undefined) candidates.push(parseInt(coreq.coreqSubjectId));
      if (coreq.prereq_subject_id !== undefined) candidates.push(parseInt(coreq.prereq_subject_id));
      if (coreq.requiredSubject?.subject_id !== undefined) candidates.push(parseInt(coreq.requiredSubject.subject_id));
      if (coreq.coreq_subject?.subject_id !== undefined) candidates.push(parseInt(coreq.coreq_subject.subject_id));

      const matches = candidates.some(c => !isNaN(c) && c === subjectIdInt);
      return matches;
    });
    
    // Only update if we found corequisites
    if (lookupCoreqsForSubject.length > 0) {
      setAvailableCorequisites(prev => {
        const updated = { ...prev, [subjectIdStr]: lookupCoreqsForSubject };
        return updated;
      });
      return lookupCoreqsForSubject;
    } else {
      setAvailableCorequisites(prev => ({ ...prev, [subjectIdStr]: [] }));
      return [];
    }
  };

  const normalizeElectiveSlot = (slot) => ({
    ...(slot || {}),
    electiveSubjects: Array.isArray(slot?.electiveSubjects)
      ? slot.electiveSubjects
      : Array.isArray(slot?.elective_subjects)
        ? slot.elective_subjects
        : [],
  });

  const updateElectiveSlotInState = (slot) => {
    const normalizedSlot = normalizeElectiveSlot(slot);
    if (!normalizedSlot.elective_slot_id) return normalizedSlot;

    setLookupData((prev) => {
      const existingSlots = Array.isArray(prev.electiveSlots) ? prev.electiveSlots : [];
      const found = existingSlots.some(
        (item) => String(item.elective_slot_id) === String(normalizedSlot.elective_slot_id),
      );

      return {
        ...prev,
        electiveSlots: found
          ? existingSlots.map((item) =>
              String(item.elective_slot_id) === String(normalizedSlot.elective_slot_id)
                ? normalizedSlot
                : item,
            )
          : [...existingSlots, normalizedSlot],
      };
    });

    setCurricula((prev) =>
      (Array.isArray(prev) ? prev : []).map((row) =>
        String(row.elective_slot_id || '') === String(normalizedSlot.elective_slot_id)
          ? { ...row, electiveSlot: normalizedSlot }
          : row,
      ),
    );

    return normalizedSlot;
  };

  const refreshElectiveSlotDetails = async (slotId) => {
    const response = await api.get(`/elective-slots/${slotId}`);
    const normalizedSlot = updateElectiveSlotInState(response.data);
    setSelectedElectiveSlot(normalizedSlot);
    return normalizedSlot;
  };

  const openElectiveSubjectAssignment = async (curriculum) => {
    const slotId = curriculum?.elective_slot_id;
    if (!slotId) return;

    setElectiveSubjectForm({ subject_id: '', track_id: '' });
    try {
      const slot = await refreshElectiveSlotDetails(slotId);
      setSelectedElectiveSlot(slot);
      setShowElectiveSubjectModal(true);
    } catch (err) {
      const fallbackSlot = normalizeElectiveSlot(curriculum.electiveSlot || {
        elective_slot_id: slotId,
        slot_name: `Elective Slot #${slotId}`,
        program_id: curriculum.program_id,
        semester_id: curriculum.semester_id,
        year_level_id: normalizeYearLevelId(curriculum.year_level),
      });
      setSelectedElectiveSlot(fallbackSlot);
      setShowElectiveSubjectModal(true);
      await swalError('Could not load latest elective slot', err.response?.data?.message || 'Showing saved slot data instead.');
    }
  };

  const handleAssignElectiveSubject = async () => {
    if (!selectedElectiveSlot?.elective_slot_id || !electiveSubjectForm.subject_id) {
      await swalError('Missing subject', 'Select a subject to assign to this elective slot.');
      return;
    }

    setElectiveSubjectSaving(true);
    try {
      const response = await api.post(`/elective-slots/${selectedElectiveSlot.elective_slot_id}/assign-subject`, {
        subject_id: Number(electiveSubjectForm.subject_id),
        track_id: selectedElectiveSlotIsIt && electiveSubjectForm.track_id ? Number(electiveSubjectForm.track_id) : null,
      });

      if (response.data?.slot) {
        const normalizedSlot = updateElectiveSlotInState(response.data.slot);
        setSelectedElectiveSlot(normalizedSlot);
      } else {
        await refreshElectiveSlotDetails(selectedElectiveSlot.elective_slot_id);
      }

      setElectiveSubjectForm({ subject_id: '', track_id: '' });
      swalToast('success', 'Elective subject assigned.');
    } catch (err) {
      await swalError('Assign failed', err.response?.data?.message || err.response?.data?.error || 'Could not assign subject.');
    } finally {
      setElectiveSubjectSaving(false);
    }
  };

  const handleRemoveElectiveSubject = async (subjectId) => {
    if (!selectedElectiveSlot?.elective_slot_id || !subjectId) return;
    const ok = await swalConfirm('Remove elective subject?', 'Remove this subject from the elective slot?', 'Remove', 'Cancel');
    if (!ok) return;

    setElectiveSubjectSaving(true);
    try {
      await api.delete(`/elective-slots/${selectedElectiveSlot.elective_slot_id}/subjects/${subjectId}`);
      await refreshElectiveSlotDetails(selectedElectiveSlot.elective_slot_id);
      swalToast('success', 'Elective subject removed.');
    } catch (err) {
      await swalError('Remove failed', err.response?.data?.message || 'Could not remove subject.');
    } finally {
      setElectiveSubjectSaving(false);
    }
  };

  const handleAddRow = () => {
    setSubjectRows([...subjectRows, emptySubjectRow()]);
  };

  const handleRemoveRow = (index) => {
    if (subjectRows.length > 1) {
      const newRows = subjectRows.filter((_, i) => i !== index);
      setSubjectRows(newRows);
      setSuggestOpen(null);
    }
  };

  const findSubjectByCode = (code) => {
    const key = normalizeSubjectCodeKey(code);
    if (!key) return null;
    return (
      (safeLookupData.subjects || []).find(
        (s) => s && normalizeSubjectCodeKey(s.subject_code) === key,
      ) || null
    );
  };

  const getSubjectSuggestions = (query, limit = 10) => {
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 1) return [];
    const seen = new Set();
    const matches = [];
    for (const s of safeLookupData.subjects || []) {
      const code = String(s?.subject_code || '').trim();
      const name = String(s?.subject_name || '').trim();
      if (!code && !name) continue;
      const key = `${code.toLowerCase()}|${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      const codeHit = code.toLowerCase().includes(q);
      const nameHit = name.toLowerCase().includes(q);
      if (!codeHit && !nameHit) continue;
      seen.add(key);
      matches.push(s);
      if (matches.length >= limit) break;
    }
    return matches;
  };

  /** When a subject is identified, pre-select its prereq (user can still switch to None). */
  const autoFillRequisiteForRow = async (index, subjectId) => {
    if (subjectId == null || subjectId === '') return;
    const subjectChosen = String(subjectId);
    try {
      const prereqs = await fetchPrerequisitesForSubject(subjectChosen);
      const coreqs = await fetchCorequisitesForSubject(subjectChosen);
      const rid = pickDefaultRequisiteId(prereqs, coreqs);
      setSubjectRows((prev) => {
        const copy = [...prev];
        if (String(copy[index]?.subject_id || '') !== subjectChosen) return prev;
        copy[index] = { ...copy[index], requisite_id: rid };
        return copy;
      });
    } catch (_) {
      // keep None if lookup fails
    }
  };

  const applySubjectSuggestion = (index, subject, { fillCode = true } = {}) => {
    if (!subject) return;
    const nextSubjectId = subject.subject_id != null ? String(subject.subject_id) : '';
    const prevSubjectId = String(subjectRows[index]?.subject_id || '');
    const subjectChanged = nextSubjectId !== prevSubjectId;

    setSubjectRows((prev) => {
      const next = [...prev];
      const row = { ...next[index] };
      if (fillCode) {
        row.subject_code = subject.subject_code || row.subject_code || '';
      }
      row.subject_name = subject.subject_name || '';
      row.subject_id = nextSubjectId;
      if (subjectChanged) {
        row.requisite_id = '';
      }
      if (row.number_of_units === '' || row.number_of_units == null) {
        row.number_of_units = subject.number_of_units ?? '';
      }
      if (row.number_of_hrs === '' || row.number_of_hrs == null) {
        row.number_of_hrs = subject.number_of_hrs ?? '';
      }
      if (!row.passing_grade) row.passing_grade = '50';
      if (!row.subject_type) {
        row.subject_type = defaultSubjectTypeFromSubjectCode(row.subject_code || subject.subject_code);
      }
      next[index] = row;
      return next;
    });
    setSuggestOpen(null);
    setEditPanelDirty(true);
    if (nextSubjectId && subjectChanged) {
      void autoFillRequisiteForRow(index, nextSubjectId);
    } else if (nextSubjectId && !String(subjectRows[index]?.requisite_id || '').trim()) {
      // Same subject but still on None — fill catalog default once
      void autoFillRequisiteForRow(index, nextSubjectId);
    }
  };

  // Back-compat aliases used by older call sites
  const getTitleSuggestions = getSubjectSuggestions;
  const applyTitleSuggestion = (index, subject) =>
    applySubjectSuggestion(index, subject, { fillCode: false });

  const resolveOrCreateSubject = async (row) => {
    const code = String(row.subject_code || '').trim();
    const name = String(row.subject_name || '').trim();
    if (!code) throw new Error('Subject code is required');
    if (!name) throw new Error('Subject title is required');

    const existing = findSubjectByCode(code);
    if (existing) return existing;

    if (row.subject_id) {
      const byId = (safeLookupData.subjects || []).find(
        (s) => s && String(s.subject_id) === String(row.subject_id),
      );
      if (byId && normalizeSubjectCodeKey(byId.subject_code) === normalizeSubjectCodeKey(code)) {
        return byId;
      }
    }

    const units =
      row.number_of_units === '' || row.number_of_units == null
        ? null
        : Number(row.number_of_units);
    const hrs =
      row.number_of_hrs === '' || row.number_of_hrs == null
        ? null
        : Number(row.number_of_hrs);

    const res = await api.post('/lookup/subjects', {
      subject_code: code,
      subject_name: name,
      number_of_units: Number.isFinite(units) ? units : null,
      number_of_hrs: Number.isFinite(hrs) ? hrs : null,
    });
    return res.data;
  };

  const handleRowChange = async (index, field, value) => {
    const newRows = [...subjectRows];
    newRows[index] = { ...newRows[index], [field]: value };
    setEditPanelDirty(true);

    if (field === 'is_elective_slot') {
      if (value) {
        newRows[index].subject_id = '';
        newRows[index].subject_code = '';
        newRows[index].subject_name = '';
        newRows[index].subject_type = 'elective subject';
        setSuggestOpen(null);
      } else {
        newRows[index].elective_slot_id = '';
      }
    }

    if (field === 'elective_slot_id' && value) {
      newRows[index].subject_type = 'elective subject';
      newRows[index].is_elective_slot = true;
    }

    if (field === 'subject_code') {
      const codeValue = String(value || '').trim();
      const previousSubjectId = String(subjectRows[index]?.subject_id || '');
      if (!codeValue) {
        // Clearing course code also clears title + linked catalog fields
        newRows[index].subject_id = '';
        newRows[index].subject_name = '';
        newRows[index].number_of_units = '';
        newRows[index].number_of_hrs = '';
        newRows[index].passing_grade = '';
        newRows[index].custom_grade = '';
        newRows[index].subject_type = '';
        newRows[index].requisite_id = '';
        setSuggestOpen(null);
      } else {
        setSuggestOpen({ index, field: 'code' });
        const match = findSubjectByCode(value);
        if (match) {
          const nextSubjectId = String(match.subject_id);
          const subjectChanged = nextSubjectId !== previousSubjectId;
          newRows[index].subject_id = nextSubjectId;
          if (subjectChanged) {
            newRows[index].requisite_id = '';
          }
          if (!String(newRows[index].subject_name || '').trim()) {
            newRows[index].subject_name = match.subject_name || '';
          }
          if (newRows[index].number_of_units === '' || newRows[index].number_of_units == null) {
            newRows[index].number_of_units = match.number_of_units ?? '';
          }
          if (newRows[index].number_of_hrs === '' || newRows[index].number_of_hrs == null) {
            newRows[index].number_of_hrs = match.number_of_hrs ?? '';
          }
          if (!newRows[index].passing_grade) newRows[index].passing_grade = '50';
          if (!newRows[index].subject_type) {
            newRows[index].subject_type = defaultSubjectTypeFromSubjectCode(match.subject_code);
          }
          setSubjectRows(newRows);
          if (subjectChanged) {
            await autoFillRequisiteForRow(index, nextSubjectId);
          }
          return;
        }
        newRows[index].subject_id = '';
        newRows[index].requisite_id = '';
        newRows[index].subject_type =
          newRows[index].subject_type || defaultSubjectTypeFromSubjectCode(value);
        if (!newRows[index].passing_grade) newRows[index].passing_grade = '50';
      }
    }

    if (field === 'subject_name') {
      const nameValue = String(value || '').trim();
      setSuggestOpen(nameValue.length >= 1 ? { index, field: 'title' } : null);
    }

    if (field === 'subject_id') {
      if (value) {
        const previousSubjectId = String(subjectRows[index]?.subject_id || '');
        const subjectChanged = String(value) !== previousSubjectId;
        newRows[index].requisite_id = subjectChanged ? '' : newRows[index].requisite_id;
        newRows[index].passing_grade = '50';
        newRows[index].custom_grade = '';
        const sub = safeLookupData.subjects.find(
          (s) => s && s.subject_id != null && String(s.subject_id) === String(value),
        );
        newRows[index].subject_type = defaultSubjectTypeFromSubjectCode(sub?.subject_code);
        newRows[index].subject_code = sub?.subject_code || newRows[index].subject_code || '';
        newRows[index].subject_name = sub?.subject_name || newRows[index].subject_name || '';
        newRows[index].number_of_units = sub?.number_of_units ?? '';
        newRows[index].number_of_hrs = sub?.number_of_hrs ?? '';
        setSubjectRows(newRows);
        if (subjectChanged || !String(newRows[index].requisite_id || '').trim()) {
          await autoFillRequisiteForRow(index, value);
        }
        return;
      }
      newRows[index].requisite_id = '';
      newRows[index].passing_grade = '';
      newRows[index].custom_grade = '';
      newRows[index].subject_type = '';
    }

    setSubjectRows(newRows);
  };

  const parseYearNumber = (value) => {
    const text = String(value || '').toLowerCase();
    if (/(^|\D)(1|1st|first)(\D|$)/.test(text)) return 1;
    if (/(^|\D)(2|2nd|second)(\D|$)/.test(text)) return 2;
    if (/(^|\D)(3|3rd|third)(\D|$)/.test(text)) return 3;
    if (/(^|\D)(4|4th|fourth)(\D|$)/.test(text)) return 4;
    if (/(^|\D)(5|5th|fifth)(\D|$)/.test(text)) return 5;
    return null;
  };

  const parseSemesterNumber = (value) => {
    const text = String(value || '').toLowerCase();
    if (/(^|\D)(1|1st|first)(\D|$)/.test(text)) return 1;
    if (/(^|\D)(2|2nd|second)(\D|$)/.test(text)) return 2;
    if (/(^|\D)(3|3rd|third|summer)(\D|$)/.test(text)) return 3;
    return null;
  };

  const yearLevelIdForNumber = (yearNumber) => {
    const match = (safeLookupData.yearLevels || []).find(
      (year) => parseYearNumber(year.year_level) === yearNumber,
    );
    return match?.year_level_id || yearNumber;
  };

  const parsedEditBulkPrerequisiteText = () => {
    const text = String(editBulkPrerequisiteText || '').trim();
    if (!text) return null;

    if (/^(all\s+(professional|major|core|board)\s+subjects?|all\s+professional\s+education\s+subjects?|all\s+professional\s+and\s+major\s+(specialization\s+)?subjects?|100%\s+professional\s+units|all\s+.*\bmajor\b.*\bsubjects?\b.*)$/i.test(text)) {
      return { professional_subjects: true };
    }

    if (/^(all\s+subjects?|all\s+general\s+education,\s*professional\s+education,\s*and\s+specialization\s+subjects?)$/i.test(text)) {
      return { all_previous_subjects: true };
    }

    const standingMatch = text.match(/^(2|2nd|second|3|3rd|third|4|4th|fourth|5|5th|fifth)\s+year\s+standing$/i);
    if (standingMatch) {
      const standingYear = parseYearNumber(standingMatch[1]);
      if (!standingYear || standingYear <= 1) return null;

      return {
        from_year_level: yearLevelIdForNumber(1),
        to_year_level: yearLevelIdForNumber(standingYear - 1),
      };
    }

    const termRangeMatch = text.match(/all\s+subjects\s+from\s+(.+?)\s+to\s+(.+?)\s+(1|1st|first|2|2nd|second|3|3rd|third|summer)\s*(?:sem|semester)$/i);
    if (termRangeMatch) {
      const fromYear = parseYearNumber(termRangeMatch[1]);
      const toYear = parseYearNumber(termRangeMatch[2]);
      const toSemester = parseSemesterNumber(termRangeMatch[3]);
      if (!fromYear || !toYear || !toSemester) return null;

      return {
        from_year_level: yearLevelIdForNumber(fromYear),
        to_year_level: yearLevelIdForNumber(toYear),
        to_semester_id: toSemester,
      };
    }

    const match = text.match(/all\s+subjects\s+from\s+(.+?)\s+to\s+(.+)$/i);
    if (!match) return null;

    const fromYear = parseYearNumber(match[1]);
    const toYear = parseYearNumber(match[2]);
    if (!fromYear || !toYear) return null;

    return {
      from_year_level: yearLevelIdForNumber(fromYear),
      to_year_level: yearLevelIdForNumber(toYear),
    };
  };

  const resolvedEditBulkPrerequisiteRange = () => ({
    ...editBulkPrerequisiteRange,
    ...(parsedEditBulkPrerequisiteText() || {}),
  });

  const editCurriculumOrderValue = (row) => {
    const rowYear = Number(normalizeYearLevelId(row?.year_level ?? row?.yearLevel));
    const rowSemester = Number(row?.semester_id ?? row?.semester?.semester_id);
    if (!Number.isFinite(rowYear) || !Number.isFinite(rowSemester)) return null;

    // Summer is stored as semester_id 3, but appears before regular semesters in these curricula.
    const semesterOrder = rowSemester === 3 ? 0 : rowSemester;
    return rowYear * 10 + semesterOrder;
  };

  const isProfessionalCurriculumRow = (row) => {
    if (!row || row.elective_slot_id) return false;
    const type = String(row.subject_type || '').trim().toLowerCase();
    if (type === 'core' || type === 'major') return true;

    const subjectCode = String(row.subject?.subject_code || '').trim().toUpperCase();
    return /^(NUR|HES|BIO|MLS)\s*\d+/.test(subjectCode);
  };

  const editRowSubjectCode = (row) =>
    String(row?.subject?.subject_code || row?.subject_code || '').replace(/\s+/g, '').toUpperCase();

  const editExceptSubjectCodesFromRule = () => {
    const text = String(editBulkPrerequisiteText || '').trim();
    const match = text.match(/\bexcept\b(.+)$/i);
    if (!match) return new Set();

    return new Set(
      match[1]
        .split(/,|\band\b/i)
        .map((code) => code.replace(/[^a-z0-9]/gi, '').toUpperCase())
        .filter(Boolean),
    );
  };

  const getEditBulkPrerequisiteSubjectIds = () => {
    const row = subjectRows[0] || {};
    const range = resolvedEditBulkPrerequisiteRange();
    const programId = bulkFormData.program_id || selectedCurriculum?.program_id;
    const subjectId = row.subject_id || selectedCurriculum?.subject_id;

    if (range.professional_subjects) {
      if (!programId || !subjectId) return [];

      const rowsForProgram = (curricula || []).filter(
        (curriculum) => String(curriculum.program_id) === String(programId),
      );
      const targetRow = rowsForProgram.find(
        (curriculum) => String(curriculum.subject_id) === String(subjectId),
      );
      const targetOrder = targetRow ? editCurriculumOrderValue(targetRow) : null;
      const exceptCodes = editExceptSubjectCodesFromRule();

      return Array.from(
        new Set(
          rowsForProgram
            .filter((curriculum) => String(curriculum.subject_id) !== String(subjectId))
            .filter(isProfessionalCurriculumRow)
            .filter((curriculum) => !exceptCodes.has(editRowSubjectCode(curriculum)))
            .filter((curriculum) => {
              if (targetOrder == null) return true;
              const rowOrder = editCurriculumOrderValue(curriculum);
              return rowOrder != null && rowOrder < targetOrder;
            })
            .map((curriculum) => curriculum.subject_id)
            .filter(Boolean)
            .map((requiredSubjectId) => Number(requiredSubjectId)),
        ),
      );
    }

    if (range.all_previous_subjects) {
      if (!programId || !subjectId) return [];

      const rowsForProgram = (curricula || []).filter(
        (curriculum) => String(curriculum.program_id) === String(programId),
      );
      const targetRow = rowsForProgram.find(
        (curriculum) => String(curriculum.subject_id) === String(subjectId),
      );
      const targetOrder = targetRow ? editCurriculumOrderValue(targetRow) : null;

      return Array.from(
        new Set(
          rowsForProgram
            .filter((curriculum) => String(curriculum.subject_id) !== String(subjectId))
            .filter((curriculum) => {
              if (targetOrder == null) return true;
              const rowOrder = editCurriculumOrderValue(curriculum);
              return rowOrder != null && rowOrder < targetOrder;
            })
            .map((curriculum) => curriculum.subject_id)
            .filter(Boolean)
            .map((requiredSubjectId) => Number(requiredSubjectId)),
        ),
      );
    }

    const fromYear = range.from_year_level ? Number(range.from_year_level) : null;
    const toYear = range.to_year_level ? Number(range.to_year_level) : null;
    const toSemester = range.to_semester_id ? Number(range.to_semester_id) : null;

    if (!programId || !subjectId || !fromYear || !toYear) return [];

    const minYear = Math.min(fromYear, toYear);
    const maxYear = Math.max(fromYear, toYear);
    const maxSemesterOrder = toSemester === 3 ? 0 : toSemester;

    return Array.from(
      new Set(
        (curricula || [])
          .filter((curriculum) => String(curriculum.program_id) === String(programId))
          .filter((curriculum) => {
            const rowYear = Number(normalizeYearLevelId(curriculum.year_level ?? curriculum.yearLevel));
            const rowSemester = Number(curriculum.semester_id ?? curriculum.semester?.semester_id);
            if (toSemester && rowYear === maxYear) {
              const rowSemesterOrder = rowSemester === 3 ? 0 : rowSemester;
              return (
                Number.isFinite(rowYear) &&
                rowYear >= minYear &&
                rowYear <= maxYear &&
                rowSemesterOrder <= maxSemesterOrder
              );
            }
            return Number.isFinite(rowYear) && rowYear >= minYear && rowYear <= maxYear;
          })
          .map((curriculum) => curriculum.subject_id)
          .filter(Boolean)
          .filter((requiredSubjectId) => String(requiredSubjectId) !== String(subjectId))
          .map((requiredSubjectId) => Number(requiredSubjectId)),
      ),
    );
  };

  const canSyncEditBulkPrerequisites = () => {
    const range = resolvedEditBulkPrerequisiteRange();
    const row = subjectRows[0] || {};
    if (range.professional_subjects || range.all_previous_subjects) {
      return Boolean(
        (bulkFormData.program_id || selectedCurriculum?.program_id) &&
          (row.subject_id || selectedCurriculum?.subject_id),
      );
    }

    return Boolean(
      (bulkFormData.program_id || selectedCurriculum?.program_id) &&
        (row.subject_id || selectedCurriculum?.subject_id) &&
        range.from_year_level &&
        range.to_year_level,
    );
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate bulk form data
    if (
      !bulkFormData.program_id ||
      !bulkFormData.curriculum_header_id ||
      !bulkFormData.year_level ||
      !bulkFormData.semester_id
    ) {
      const msg = 'Please fill in Program, Curriculum Header, Year Level, and Semester';
      setError(msg);
      await swalError('Missing fields', msg);
      return;
    }

    // Filter out empty rows (need code+title, or elective slot)
    const validRows = subjectRows.filter((row) => {
      if (row.is_elective_slot) return !!row.elective_slot_id;
      return String(row.subject_code || '').trim() && String(row.subject_name || '').trim();
    });

    if (validRows.length === 0) {
      const msg = 'Please add at least one subject (code + title) or elective slot';
      setError(msg);
      await swalError('Nothing to save', msg);
      return;
    }

    try {
      const resolvedRows = [];
      const createdByCode = new Map();
      for (const row of validRows) {
        if (row.is_elective_slot) {
          resolvedRows.push({ ...row, subject_id: null });
          continue;
        }
        const codeKey = normalizeSubjectCodeKey(row.subject_code);
        let subject = codeKey ? createdByCode.get(codeKey) : null;
        if (!subject) {
          subject = await resolveOrCreateSubject(row);
          if (codeKey && subject) createdByCode.set(codeKey, subject);
        }
        resolvedRows.push({
          ...row,
          subject_id: subject.subject_id,
          subject_code: subject.subject_code || row.subject_code,
          subject_name: row.subject_name || subject.subject_name,
        });
      }

      // Prepare subjects data
      const subjectsData = resolvedRows.map(row => {
        return {
          subject_id: row.is_elective_slot ? null : (row.subject_id ? parseInt(row.subject_id, 10) : null),
          elective_slot_id: row.is_elective_slot ? (row.elective_slot_id ? parseInt(row.elective_slot_id, 10) : null) : null,
          passing_grade: resolvePassingGradeValue(row),
          subject_type: row.subject_type || null,
          requisite_id: row.requisite_id ? parseInt(row.requisite_id, 10) : null,
          number_of_units:
            row.number_of_units === '' || row.number_of_units == null
              ? null
              : Number(row.number_of_units),
          number_of_hrs:
            row.number_of_hrs === '' || row.number_of_hrs == null
              ? null
              : Number(row.number_of_hrs),
        };
      });
      
      // Batch create all curriculum entries at once
      const { data: batchResult } = await api.post('/curriculum/batch', {
        program_id: parseInt(bulkFormData.program_id, 10),
        curriculum_header_id: bulkFormData.curriculum_header_id
          ? parseInt(bulkFormData.curriculum_header_id, 10)
          : null,
        year_level: parseInt(bulkFormData.year_level, 10),
        semester_id: parseInt(bulkFormData.semester_id, 10),
        subjects: subjectsData
      });

      const createdCount = Number(batchResult?.created_count ?? 0);
      const skipped = Array.isArray(batchResult?.skipped) ? batchResult.skipped : [];
      const serverMessage = batchResult?.message || '';

      if (createdCount <= 0) {
        const msg =
          serverMessage ||
          (skipped.length ? skipped.join(' ') : 'No subjects were added to this term.');
        setError(msg);
        await swalError('Subject not added', msg);
        return;
      }

      setShowModal(false);
      resetBulkForm();
      fetchCurricula({ force: true });
      fetchLookupData({ force: true });
      if (skipped.length > 0) {
        await swalError('Partially saved', serverMessage || `${createdCount} added. ${skipped.join(' ')}`);
      } else {
        swalToast('success', serverMessage || 'Curriculum saved');
      }
    } catch (error) {
      console.error('Error saving curriculum:', error);
      console.error('Error response:', error.response?.data);
      
      let errorMessage = error?.message || 'Failed to save curriculum';
      if (error.response?.data) {
        const payload = error.response.data;
        if (Array.isArray(payload.skipped) && payload.skipped.length > 0) {
          errorMessage = payload.message
            ? `${payload.message}`
            : payload.skipped.join(' ');
        } else if (payload.errors) {
          const errorMessages = Object.values(payload.errors).flat();
          errorMessage = errorMessages.join(', ') || errorMessage;
        } else if (payload.message) {
          errorMessage = payload.message;
        } else if (payload.error) {
          errorMessage = payload.error;
        }
      }
      
      setError(errorMessage);
      await swalError('Subject not added', errorMessage);
    }
  };

  const resetBulkForm = () => {
    setBulkFormData({
      program_id: scopedProgramId || '',
      curriculum_header_id: '',
      year_level: '',
      semester_id: '',
    });
    setSubjectRows([emptySubjectRow()]);
    setSuggestOpen(null);
    setEditPanelDirty(false);
    setError('');
  };

  const handleUpdate = async (e) => {
    if (e) e.preventDefault();
    setError('');

    const baseCurriculum = editingCurriculum || selectedCurriculum;
    if (!baseCurriculum) return;

    try {
      const row = subjectRows[0] || {};
      const finalPassingGrade = resolvePassingGradeValue(row);

      const desiredProgramId = bulkFormData.program_id || baseCurriculum.program_id;
      const desiredYearLevelId = normalizeYearLevelId(
        bulkFormData.year_level || baseCurriculum.year_level
      );
      const desiredSemesterId = bulkFormData.semester_id || baseCurriculum.semester_id;
      const isElectiveSlot = row.is_elective_slot || !!baseCurriculum.elective_slot_id;
      let desiredSubjectId = isElectiveSlot ? null : (row.subject_id || baseCurriculum.subject_id);
      if (!isElectiveSlot) {
        const resolved = await resolveOrCreateSubject({
          ...row,
          subject_code:
            row.subject_code ||
            baseCurriculum.subject?.subject_code ||
            baseCurriculum.subject_code ||
            '',
          subject_name:
            row.subject_name ||
            baseCurriculum.subject?.subject_name ||
            baseCurriculum.subject_name ||
            '',
          number_of_units:
            row.number_of_units ??
            baseCurriculum.subject?.number_of_units ??
            '',
          number_of_hrs:
            row.number_of_hrs ??
            baseCurriculum.subject?.number_of_hrs ??
            '',
        });
        desiredSubjectId = resolved.subject_id;
      }
      const desiredElectiveSlotId = isElectiveSlot ? (row.elective_slot_id || baseCurriculum.elective_slot_id) : null;
      const hasBulkPrerequisiteText = String(editBulkPrerequisiteText || '').trim();
      const parsedBulkPrerequisiteText = parsedEditBulkPrerequisiteText();

      if (hasBulkPrerequisiteText && !parsedBulkPrerequisiteText) {
        const msg = 'Use a saved rule, a year standing rule, or a range like: all subjects from 1st year to 4th year 1st semester.';
        setError(msg);
        await swalError('Invalid prerequisite rule', msg);
        return;
      }

      const resolvedCurriculumToUpdate = Array.isArray(curricula)
        ? (curricula.find(c =>
            c &&
            c.program_id?.toString() === desiredProgramId?.toString() &&
            normalizeYearLevelId(c.year_level) === desiredYearLevelId &&
            c.semester_id?.toString() === desiredSemesterId?.toString() &&
            (isElectiveSlot 
              ? c.elective_slot_id?.toString() === desiredElectiveSlotId?.toString()
              : c.subject_id?.toString() === desiredSubjectId?.toString())
          ) || baseCurriculum)
        : baseCurriculum;

      await api.put(`/curriculum/${resolvedCurriculumToUpdate.curriculum_id}`, {
        program_id: parseInt(desiredProgramId, 10),
        year_level: parseInt(desiredYearLevelId, 10),
        semester_id: parseInt(desiredSemesterId, 10),
        subject_id: desiredSubjectId,
        elective_slot_id: desiredElectiveSlotId,
        passing_grade: finalPassingGrade ? finalPassingGrade : (resolvedCurriculumToUpdate.passing_grade || null),
        subject_type: row.subject_type || resolvedCurriculumToUpdate.subject_type || (isElectiveSlot ? 'elective subject' : null),
        requisite_id: row.requisite_id || resolvedCurriculumToUpdate.requisite_id || null,
        ...(desiredSubjectId
          ? {
              number_of_units:
                row.number_of_units === '' || row.number_of_units == null
                  ? null
                  : Number(row.number_of_units),
              number_of_hrs:
                row.number_of_hrs === '' || row.number_of_hrs == null
                  ? null
                  : Number(row.number_of_hrs),
            }
          : {}),
      });

      if (!isElectiveSlot && canSyncEditBulkPrerequisites()) {
        const requiredSubjectIds = getEditBulkPrerequisiteSubjectIds();
        if (requiredSubjectIds.length === 0) {
          const msg = 'No subjects were found for that prerequisite rule.';
          setError(msg);
          await swalError('No prerequisites found', msg);
          return;
        }

        await api.post('/lookup/requisites/sync', {
          subject_id: parseInt(desiredSubjectId, 10),
          requisite_type: 'prerequisite',
          required_subject_ids: requiredSubjectIds,
          rule_label: hasBulkPrerequisiteText || null,
        });
      }

      setShowModal(false);
      setShowEditPanel(false);
      setEditingCurriculum(null);
      setSelectedCurriculum(null);
      setEditBulkPrerequisiteText('');
      setEditBulkPrerequisiteRange({ from_year_level: '', to_year_level: '' });
      resetBulkForm();
      fetchCurricula({ force: true });
      fetchLookupData({ force: true }); 
      swalToast('success', 'Curriculum updated');
    } catch (error) {
      const msg = error?.message || error.response?.data?.message || 'Failed to update curriculum';
      setError(msg);
      await swalError('Update failed', msg);
    }
  };

  const closeEditPanel = () => {
    setShowEditPanel(false);
    setSelectedCurriculum(null);
    setEditingCurriculum(null);
    setEditGroupContext(null);
    setEditPanelMode('edit');
    setEditPanelDirty(false);
    setSuggestOpen(null);
    setEditBulkPrerequisiteText('');
    setEditBulkPrerequisiteRange({ from_year_level: '', to_year_level: '' });
    resetBulkForm();
  };

  const loadCurriculumIntoEditPanel = async (curriculum, mode = 'edit') => {
    setEditPanelMode(mode);
    setSelectedCurriculum(curriculum);
    setEditingCurriculum(curriculum);
    setEditBulkPrerequisiteText('');
    setEditBulkPrerequisiteRange({ from_year_level: '', to_year_level: '' });
    setBulkFormData({
      program_id: curriculum.program_id?.toString() || '',
      curriculum_header_id: String(
        curriculum.curriculum_header_id ||
          curriculum.curriculumHeader?.curriculum_header_id ||
          '',
      ),
      year_level: normalizeYearLevelId(curriculum.year_level),
      semester_id: curriculum.semester_id?.toString() || '',
    });
    setSubjectRows([subjectRowFromCurriculum(curriculum)]);
    setEditPanelDirty(false);
    setSuggestOpen(null);
    if (curriculum.subject_id) {
      await fetchPrerequisitesForSubject(curriculum.subject_id);
    }
    setShowEditPanel(true);
  };

  const startInsertInEditPanel = (context = {}) => {
    const programId = context.programId || bulkFormData.program_id || scopedProgramId || '';
    const yearLevelId = context.yearLevelId || bulkFormData.year_level || '';
    const semesterId = context.semesterId || '';
    const curriculumHeaderId =
      context.curriculumHeaderId ||
      bulkFormData.curriculum_header_id ||
      editGroupContext?.curriculumHeaderId ||
      '';
    setEditPanelMode('insert');
    setSelectedCurriculum(null);
    setEditingCurriculum(null);
    setEditBulkPrerequisiteText('');
    setEditBulkPrerequisiteRange({ from_year_level: '', to_year_level: '' });
    setBulkFormData({
      program_id: programId?.toString() || '',
      curriculum_header_id: curriculumHeaderId?.toString() || '',
      year_level: yearLevelId?.toString() || '',
      semester_id: semesterId?.toString() || '',
    });
    setSubjectRows([emptySubjectRow()]);
    setEditPanelDirty(false);
    setSuggestOpen(null);
    setShowEditPanel(true);
  };

  const handleEditPanelSave = async (e) => {
    if (e) e.preventDefault();
    setError('');

    if (editPanelMode === 'insert') {
      if (!bulkFormData.program_id || !bulkFormData.year_level || !bulkFormData.semester_id) {
        const msg = 'Please fill in Program, Year Level, and Semester';
        setError(msg);
        await swalError('Missing fields', msg);
        return;
      }
      const row = subjectRows[0] || {};
      if (row.is_elective_slot) {
        if (!row.elective_slot_id) {
          const msg = 'Please select an elective slot';
          setError(msg);
          await swalError('Missing elective slot', msg);
          return;
        }
      } else if (!String(row.subject_code || '').trim() || !String(row.subject_name || '').trim()) {
        const msg = 'Please enter subject code and title';
        setError(msg);
        await swalError('Missing subject', msg);
        return;
      }

      try {
        let subjectId = null;
        let electiveSlotId = null;
        if (row.is_elective_slot) {
          electiveSlotId = parseInt(row.elective_slot_id, 10);
        } else {
          const subject = await resolveOrCreateSubject(row);
          subjectId = parseInt(subject.subject_id, 10);
        }

        const finalPassingGrade = resolvePassingGradeValue(row);

        await api.post('/curriculum/batch', {
          program_id: parseInt(bulkFormData.program_id, 10),
          curriculum_header_id: bulkFormData.curriculum_header_id
            ? parseInt(bulkFormData.curriculum_header_id, 10)
            : null,
          year_level: parseInt(bulkFormData.year_level, 10),
          semester_id: parseInt(bulkFormData.semester_id, 10),
          subjects: [
            {
              subject_id: subjectId,
              elective_slot_id: electiveSlotId,
              passing_grade: finalPassingGrade,
              subject_type: row.subject_type || (row.is_elective_slot ? 'elective subject' : null),
              requisite_id: row.requisite_id ? parseInt(row.requisite_id, 10) : null,
              number_of_units:
                row.number_of_units === '' || row.number_of_units == null
                  ? null
                  : Number(row.number_of_units),
              number_of_hrs:
                row.number_of_hrs === '' || row.number_of_hrs == null
                  ? null
                  : Number(row.number_of_hrs),
            },
          ],
        });

        fetchCurricula({ force: true });
        fetchLookupData({ force: true });
        setEditPanelDirty(false);
        swalToast('success', 'Subject inserted');
        // Stay open in insert mode so more subjects can be added
        setSubjectRows([emptySubjectRow()]);
      } catch (error) {
        let errorMessage = error?.message || 'Failed to insert subject';
        if (error.response?.data) {
          if (error.response.data.errors) {
            errorMessage = Object.values(error.response.data.errors).flat().join(', ') || errorMessage;
          } else if (error.response.data.message) {
            errorMessage = error.response.data.message;
          }
        }
        setError(errorMessage);
        await swalError('Insert failed', errorMessage);
      }
      return;
    }

    await handleUpdate(e);
    setEditPanelDirty(false);
  };

  const handleDelete = async (id, options = {}) => {
    const { confirmText, title = 'Delete curriculum entry?' } = options;
    const ok = await swalConfirm({
      title,
      text: confirmText || 'Are you sure you want to delete this curriculum entry?',
      confirmButtonText: 'Delete',
    });
    if (!ok) return false;

    try {
      await api.delete(`/curriculum/${id}`);
      fetchCurricula({ force: true });
      swalToast('success', 'Curriculum entry deleted');
      return true;
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to delete curriculum';
      setError(msg);
      await swalError('Could not delete', msg);
      return false;
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingCurriculum(null);
    setEditBulkPrerequisiteText('');
    setEditBulkPrerequisiteRange({ from_year_level: '', to_year_level: '' });
    resetBulkForm();
  };

  const handleCorequisiteSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!corequisiteForm.subject_id || !corequisiteForm.coreq_subject_id) {
      setError('Both subjects are required for co-requisite');
      return;
    }

    if (corequisiteForm.subject_id === corequisiteForm.coreq_subject_id) {
      setError('A subject cannot be a co-requisite of itself');
      return;
    }

    try {
      await api.post('/corequisites', corequisiteForm);
      setShowCorequisiteModal(false);
      setCorequisiteForm({ subject_id: '', coreq_subject_id: '' });
      fetchLookupData({ force: true }); 
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to create co-requisite');
    }
  };

  const handleCloseCorequisiteModal = () => {
    setShowCorequisiteModal(false);
    setCorequisiteForm({ subject_id: '', coreq_subject_id: '' });
    setError('');
  };

  // Group curricula by program and year level, then organize semesters side-by-side
  const groupCurriculaByProgramYear = () => {
    if (!filterProgram || !Array.isArray(curricula) || curricula.length === 0) {
      return [];
    }
    
    const filtered = curricula.filter(
      curriculum => curriculum && curriculum.program_id?.toString() === filterProgram
    );

    const grouped = {};
    
    filtered.forEach(curriculum => {
      if (!curriculum) return;
      
      const programId = curriculum.program_id;
      const programName = curriculum.program?.program_name || curriculum.program?.program_code || 'Unknown Program';

      const curriculumHeaderId =
        curriculum.curriculum_header_id ||
        curriculum.curriculumHeader?.curriculum_header_id ||
        null;

      const inferredHeader = (!curriculumHeaderId && safeLookupData.curriculumHeaders.length)
        ? safeLookupData.curriculumHeaders
            .filter(h => (h?.program_id ?? h?.program?.program_id)?.toString() === programId?.toString())
            .sort((a, b) => {
              const ay = parseInt(a?.Effective_Year ?? a?.effective_year ?? 0);
              const by = parseInt(b?.Effective_Year ?? b?.effective_year ?? 0);
              return by - ay;
            })[0]
        : null;

      const resolvedHeaderId = curriculumHeaderId || inferredHeader?.curriculum_header_id || null;

      const header = resolvedHeaderId
        ? safeLookupData.curriculumHeaders.find(
            h => (h?.curriculum_header_id ?? h?.id)?.toString() === resolvedHeaderId.toString()
          ) || inferredHeader
        : inferredHeader;

      const headerProgramName =
        header?.program?.program_name ||
        header?.program?.program_code ||
        programName;

      const headerDescription = (header?.description || '').toString().trim();
      const headerEffectiveYear = header?.Effective_Year || header?.effective_year || null;
      if (
        filterCurriculumYear &&
        String(headerEffectiveYear || '') !== String(filterCurriculumYear)
      ) {
        return;
      }

      const yearLevelId = curriculum.year_level?.year_level_id || curriculum.year_level;
      let yearLevelName = curriculum.year_level?.year_level;
      if (!yearLevelName && yearLevelId && safeLookupData.yearLevels) {
        const yearLevel = safeLookupData.yearLevels.find(yl => yl.year_level_id === parseInt(yearLevelId));
        yearLevelName = yearLevel?.year_level;
      }
      yearLevelName = yearLevelName || `Year ${yearLevelId}`;
      
      const semesterId = curriculum.semester_id;
      let semesterName = curriculum.semester?.semester_name;
      if (!semesterName && semesterId && safeLookupData.semesters) {
        const semester = safeLookupData.semesters.find(s => s.semester_id === parseInt(semesterId));
        semesterName = semester?.semester_name;
      }
      semesterName = semesterName || `Semester ${semesterId}`;
      
      const key = `${resolvedHeaderId || programId}-${yearLevelId}`;
      
      if (!grouped[key]) {
        grouped[key] = {
          programId,
          programName: headerProgramName,
          curriculumHeaderId: resolvedHeaderId,
          curriculumHeaderDescription: headerDescription,
          curriculumHeaderEffectiveYear: headerEffectiveYear,
          yearLevelId,
          yearLevelName,
          semesters: {}
        };
      }
      
      if (!grouped[key].semesters[semesterId]) {
        grouped[key].semesters[semesterId] = {
          semesterId,
          semesterName,
          curricula: []
        };
      }
      
      grouped[key].semesters[semesterId].curricula.push(curriculum);
    });

    return Object.values(grouped).sort((a, b) => {
      if (a.programName !== b.programName) {
        return a.programName.localeCompare(b.programName);
      }
      return a.yearLevelName.localeCompare(b.yearLevelName);
    });
  };

  const groupedCurricula = Array.isArray(curricula) ? groupCurriculaByProgramYear() : [];

  const yearLevelTotalPages = groupedCurricula.length;
  const yearLevelSafePage =
    yearLevelTotalPages > 0
      ? Math.min(Math.max(1, yearLevelPage), yearLevelTotalPages)
      : 1;
  const pagedYearGroups =
    yearLevelTotalPages > 0
      ? groupedCurricula.slice(yearLevelSafePage - 1, yearLevelSafePage)
      : [];

  const getCurriculumRequisiteDisplay = (curriculum) => {
    if (!curriculum) return '-';

    const programCode = String(curriculum.program?.program_code || curriculum.program_code || '').trim().toUpperCase();
    const subjectCode = String(curriculum.subject?.subject_code || curriculum.subject_code || '').replace(/\s+/g, '').toUpperCase();
    if (programCode === 'BECED' && ['EDU011', 'EDU532'].includes(subjectCode)) {
      return '-';
    }

    const requisiteRequiredSubjectId = (requisite) => {
      const required =
        requisite?.requiredSubject ||
        requisite?.required_subject ||
        null;
      return (
        required?.subject_id ??
        requisite?.requisites_subject_id ??
        requisite?.required_subject_id ??
        requisite?.coreq_subject_id ??
        null
      );
    };

    const getPrerequisiteSubjectIdSet = (requisites) =>
      new Set(
        (Array.isArray(requisites) ? requisites : [])
          .filter((r) => String(r?.requisite_type || r?.type || '').toLowerCase() === 'prerequisite')
          .map(requisiteRequiredSubjectId)
          .filter(Boolean)
          .map((id) => String(id)),
      );

    const curriculumOrderValue = (row) => {
      const rowYear = Number(normalizeYearLevelId(row?.year_level ?? row?.yearLevel));
      const rowSemester = Number(row?.semester_id ?? row?.semester?.semester_id);
      if (!Number.isFinite(rowYear) || !Number.isFinite(rowSemester)) return null;
      const semesterOrder = rowSemester === 3 ? 0 : rowSemester;
      return rowYear * 10 + semesterOrder;
    };

    const isProfessionalSubjectRow = (row) => {
      if (!row || row.elective_slot_id) return false;
      const type = String(row.subject_type || '').trim().toLowerCase();
      if (type === 'core' || type === 'major') return true;

      const subjectCode = String(row.subject?.subject_code || '').trim().toUpperCase();
      return /^(NUR|HES|BIO|MLS)\s*\d+/.test(subjectCode);
    };

    const getAllProfessionalSubjectsPrerequisiteSummary = (requisites) => {
      if (!Array.isArray(requisites) || requisites.length === 0) return null;

      const targetProgramId = curriculum.program_id;
      const targetOrder = curriculumOrderValue(curriculum);
      if (!targetProgramId || targetOrder == null) return null;

      const prerequisiteSubjectIds = getPrerequisiteSubjectIdSet(requisites);
      const professionalSubjectIds = Array.from(
        new Set(
          (curricula || [])
            .filter((row) => String(row.program_id) === String(targetProgramId))
            .filter((row) => String(row.subject_id) !== String(curriculum.subject_id))
            .filter((row) => {
              const rowOrder = curriculumOrderValue(row);
              return rowOrder != null && rowOrder < targetOrder;
            })
            .filter(isProfessionalSubjectRow)
            .map((row) => row.subject_id)
            .filter(Boolean)
            .map((id) => String(id)),
        ),
      );

      if (professionalSubjectIds.length < 10) return null;

      const hasEveryProfessionalSubject = professionalSubjectIds.every((id) =>
        prerequisiteSubjectIds.has(id),
      );

      return hasEveryProfessionalSubject ? 'P: All professional subjects' : null;
    };

    const getAllPreviousYearsPrerequisiteSummary = (requisites) => {
      if (!Array.isArray(requisites) || requisites.length === 0) return null;

      const targetYear = Number(normalizeYearLevelId(curriculum.year_level ?? curriculum.yearLevel));
      const targetProgramId = curriculum.program_id;
      if (!Number.isFinite(targetYear) || targetYear <= 1 || !targetProgramId) return null;

      const prerequisiteSubjectIds = getPrerequisiteSubjectIdSet(requisites);

      const prerequisiteYears = (curricula || [])
        .filter((row) => String(row.program_id) === String(targetProgramId))
        .filter((row) => prerequisiteSubjectIds.has(String(row.subject_id)))
        .map((row) => Number(normalizeYearLevelId(row.year_level ?? row.yearLevel)))
        .filter((rowYear) => Number.isFinite(rowYear) && rowYear >= 1 && rowYear < targetYear);

      if (prerequisiteYears.length === 0) return null;

      const maxPrerequisiteYear = Math.max(...prerequisiteYears);
      const expectedRangeSubjectIds = Array.from(
        new Set(
          (curricula || [])
            .filter((row) => String(row.program_id) === String(targetProgramId))
            .filter((row) => {
              const rowYear = Number(normalizeYearLevelId(row.year_level ?? row.yearLevel));
              return Number.isFinite(rowYear) && rowYear >= 1 && rowYear <= maxPrerequisiteYear;
            })
            .map((row) => row.subject_id)
            .filter(Boolean)
            .map((id) => String(id)),
        ),
      );

      if (expectedRangeSubjectIds.length === 0) return null;

      const hasEverySubjectInRange = expectedRangeSubjectIds.every((id) =>
        prerequisiteSubjectIds.has(id),
      );

      if (!hasEverySubjectInRange) return null;

      if (targetYear === maxPrerequisiteYear + 1 && maxPrerequisiteYear === 1) {
        return `P: ${ordinalYearLabel(targetYear)} standing`;
      }

      return `P: All subjects from ${ordinalYearLabel(1)} to ${ordinalYearLabel(maxPrerequisiteYear)}`;
    };

    const formatSavedRuleLabel = (requisites) => {
      const labels = Array.from(
        new Set(
          (Array.isArray(requisites) ? requisites : [])
            .map((requisite) => String(requisite?.rule_label || '').trim())
            .filter(Boolean),
        ),
      );

      if (labels.length !== 1) return null;

      const label = labels[0];
      const lower = label.toLowerCase();
      if (/^all\s+professional\s+subjects?$/.test(lower)) return 'P: All professional subjects';
      if (/^all\s+core\s+subjects?$/.test(lower)) return 'P: All core subjects';
      if (/^all\s+major\s+subjects?$/.test(lower)) return 'P: All major subjects';

      const standingMatch = lower.match(/^(2|2nd|second|3|3rd|third|4|4th|fourth|5|5th|fifth)\s+year\s+standing$/);
      if (standingMatch) {
        const standingYear = parseYearNumber(standingMatch[1]);
        return standingYear ? `P: ${ordinalYearLabel(standingYear)} standing` : `P: ${label}`;
      }

      const termRangeMatch = lower.match(/^all\s+subjects\s+from\s+(.+?)\s+to\s+(.+?)\s+(1|1st|first|2|2nd|second|3|3rd|third|summer)\s*(?:sem|semester)$/);
      if (termRangeMatch) {
        const fromYear = parseYearNumber(termRangeMatch[1]);
        const toYear = parseYearNumber(termRangeMatch[2]);
        const toSemester = parseSemesterNumber(termRangeMatch[3]);
        if (fromYear && toYear && toSemester) {
          return `P: All subjects from ${ordinalYearLabel(fromYear)} to ${ordinalYearLabel(toYear)} ${ordinalSemesterLabel(toSemester)}`;
        }
      }

      const rangeMatch = lower.match(/^all\s+subjects\s+from\s+(.+?)\s+to\s+(.+)$/);
      if (rangeMatch) {
        const fromYear = parseYearNumber(rangeMatch[1]);
        const toYear = parseYearNumber(rangeMatch[2]);
        if (fromYear && toYear) {
          return `P: All subjects from ${ordinalYearLabel(fromYear)} to ${ordinalYearLabel(toYear)}`;
        }
      }

      return `P: ${label}`;
    };

    // Case 1: curriculum has loaded requisite relationship (now an array from hasMany)
    const req = curriculum.requisite;
    if (req) {
      // Handle array of requisites (new hasMany relationship)
      if (Array.isArray(req) && req.length > 0) {
        const savedRuleSummary = formatSavedRuleLabel(req);
        if (savedRuleSummary) return savedRuleSummary;

        const bulkSummary = getAllPreviousYearsPrerequisiteSummary(req);
        if (bulkSummary) return bulkSummary;

        const professionalSummary = getAllProfessionalSubjectsPrerequisiteSummary(req);
        if (professionalSummary) return professionalSummary;

        const labels = req.map(r => {
          const required = r?.requiredSubject || r?.required_subject || null;
          if (required?.subject_code) {
            const typeHint = (r?.requisite_type || r?.type || '').toString().toLowerCase();
            const prefix = typeHint === 'prerequisite' ? 'P:' : (typeHint === 'corequisite' ? 'Co:' : 'REQ:');
            return `${prefix} ${required.subject_code}`;
          }
          // Fallback: try to resolve from lookup data
          const resolved = resolveRequisiteLabel(r);
          return resolved?.label !== '-' ? resolved.label : null;
        }).filter(Boolean);
        
        if (labels.length > 0) {
          return labels.join(', ');
        }
      }
      // Handle single object (backward compatibility)
      else if (!Array.isArray(req)) {
        const required = req?.requiredSubject || req?.required_subject || null;
        if (required?.subject_code) {
          const typeHint = (req?.requisite_type || req?.type || '').toString().toLowerCase();
          const prefix = typeHint === 'prerequisite' ? 'P:' : (typeHint === 'corequisite' ? 'Co:' : 'REQ:');
          return `${prefix} ${required.subject_code}`;
        }
      }
    }

    const combinedLookup = (Array.isArray(safeLookupData.requisites) && safeLookupData.requisites.length)
      ? safeLookupData.requisites
      : [
          ...(Array.isArray(safeLookupData.prerequisites) ? safeLookupData.prerequisites : []),
          ...(Array.isArray(safeLookupData.corequisites) ? safeLookupData.corequisites : [])
        ];

    // Case 2: curriculum row stores a specific requisite id
    if (curriculum.requisite_id) {
      const found = combinedLookup.find(
        r => (r?.requisite_id || r?.prerequisite_id || r?.corequisite_id || r?.requisites_id) === parseInt(curriculum.requisite_id)
      );
      const resolved = resolveRequisiteLabel(found || {});
      return resolved?.label || '-';
    }

    // Case 3: Look up requisites by subject_id for this curriculum's subject
    if (curriculum.subject_id) {
      const subjectRequisites = combinedLookup.filter(
        r => r?.subject_id?.toString() === curriculum.subject_id.toString()
      );
      if (subjectRequisites.length > 0) {
        const savedRuleSummary = formatSavedRuleLabel(subjectRequisites);
        if (savedRuleSummary) return savedRuleSummary;

        const bulkSummary = getAllPreviousYearsPrerequisiteSummary(subjectRequisites);
        if (bulkSummary) return bulkSummary;

        const professionalSummary = getAllProfessionalSubjectsPrerequisiteSummary(subjectRequisites);
        if (professionalSummary) return professionalSummary;

        const labels = subjectRequisites.map(r => resolveRequisiteLabel(r).label).filter(l => l !== '-');
        if (labels.length > 0) {
          return labels.join(', ');
        }
      }
    }

    return '-';
  };

  const schoolName = 'Cagayan de Oro College';
  const defaultBasisLine = 'Based on CMO No. 25 Series of 2015';

  const formatEffectiveSY = (effectiveYear) => {
    return formatEffectiveSchoolYear(effectiveYear);
  };

  const buildCurriculumHeaderModel = (yearGroup) => {
    const desc = (yearGroup?.curriculumHeaderDescription || '').toString().trim();
    const effectiveLine = formatEffectiveSY(yearGroup?.curriculumHeaderEffectiveYear);
    const programLine = `${(yearGroup?.programName || 'Unknown Program').toString()} Curriculum`;
    const basisLine = desc || defaultBasisLine;

    return {
      schoolName,
      programLine,
      effectiveLine,
      basisLine,
    };
  };

  if (loading) {
    return <div className="loading">Loading curriculum...</div>;
  }

  return (
    <div className="curriculum-management" data-tour="page-curriculum">
      <div className="management-header">
        <h2>Curriculum Management</h2>
        {canMutateCurriculum && (
          <button className="add-button" onClick={() => {
            resetBulkForm();
            setShowModal(true);
          }}>
            Add Curriculum
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Filter by Program */}
      <div className="filter-section">
        <label htmlFor="program-filter">Filter by Program: </label>
        <SearchableSelect
          id="program-filter"
          value={filterProgram}
          onChange={(value) => {
            if (scopedProgramId) return;
            setFilterProgram(value);
            setFilterCurriculumYear('');
          }}
          options={programSearchOptions}
          emptyLabel="Select Program"
          placeholder="Search programs…"
          className="filter-select curriculum-search-select searchable-select--program"
          disabled={Boolean(scopedProgramId)}
        />
        <label htmlFor="curriculum-year-filter">Curriculum Year: </label>
        <SearchableSelect
          id="curriculum-year-filter"
          value={filterCurriculumYear}
          onChange={setFilterCurriculumYear}
          options={curriculumYearOptions}
          emptyLabel="Latest Curriculum Year"
          placeholder="Search curriculum years…"
          className="filter-select curriculum-search-select searchable-select--year"
          disabled={!filterProgram || curriculumYearOptions.length === 0}
        />
      </div>

      {/* Display one year-level group at a time when multiple exist */}
      {Array.isArray(groupedCurricula) && groupedCurricula.length > 0 ? (
        <>
          {yearLevelTotalPages > 1 && (
            <nav className="curriculum-pagination curriculum-year-pagination" aria-label="Year level pages">
              <div className="curriculum-year-pagination__pills" role="tablist" aria-label="Year levels">
                {groupedCurricula.map((yg, idx) => {
                  const pageNum = idx + 1;
                  const isActive = pageNum === yearLevelSafePage;
                  const yearLabel = yearLevelPillLabel(yg.yearLevelId, yg.yearLevelName);
                  const programName = (yg.programName || '').trim();
                  const tabId = `curriculum-year-tab-${idx}`;
                  return (
                    <button
                      key={`${yg.curriculumHeaderId || yg.programId}-${yg.yearLevelId}-${idx}`}
                      type="button"
                      id={tabId}
                      role="tab"
                      aria-selected={isActive}
                      className={`curriculum-year-pagination__pill${isActive ? ' is-active' : ''}`}
                      onClick={() => setYearLevelPage(pageNum)}
                      title={programName ? `${yearLabel} · ${programName}` : yearLabel}
                    >
                      {yearLabel}
                    </button>
                  );
                })}
              </div>
            </nav>
          )}
          {pagedYearGroups.map((yearGroup) => {
            if (!yearGroup || !yearGroup.semesters) return null;

            const semesterIds = Object.keys(yearGroup.semesters || {}).sort((a, b) => {
            const semA = yearGroup.semesters[a];
            const semB = yearGroup.semesters[b];
            if (!semA || !semB) return 0;
            return (semA.semesterName || '').localeCompare(semB.semesterName || '');
          });

            return (
            <div key={`${yearGroup.curriculumHeaderId || yearGroup.programId}-${yearGroup.yearLevelId}`} className="year-group">
              <div className="year-group-header">
                {(() => {
                  const hdr = buildCurriculumHeaderModel(yearGroup);
                  return (
                    <div className="curriculum-header-block">
                      <div className="curriculum-header-school">{hdr.schoolName}</div>
                      <div className="curriculum-header-program">{hdr.programLine}</div>
                      {hdr.effectiveLine ? (
                        <div className="curriculum-header-effective">{hdr.effectiveLine}</div>
                      ) : null}
                      {hdr.basisLine ? (
                        <div className="curriculum-header-basis">{hdr.basisLine}</div>
                      ) : null}
                    </div>
                  );
                })()}
                {canMutateCurriculum && (
                  <div className="year-group-actions">
                    <button
                      type="button"
                      className="edit-group-button"
                      onClick={async () => {
                        const allCurricula = [];
                        Object.values(yearGroup.semesters).forEach((semester) => {
                          allCurricula.push(...semester.curricula);
                        });
                        await fetchLookupData({ force: true });
                        const firstSemId =
                          Object.keys(yearGroup.semesters || [])[0] ||
                          allCurricula[0]?.semester_id ||
                          '';
                        setEditGroupContext({
                          programId: yearGroup.programId,
                          yearLevelId: yearGroup.yearLevelId,
                          programName: yearGroup.programName,
                          yearLevelName: yearGroup.yearLevelName,
                          curricula: allCurricula,
                        });
                        startInsertInEditPanel({
                          programId: yearGroup.programId,
                          yearLevelId: yearGroup.yearLevelId,
                          semesterId: firstSemId,
                        });
                      }}
                      title="Edit this curriculum group — insert or edit subjects"
                    >
                      <i className="fa-solid fa-pen-to-square" aria-hidden />
                      Edit Group
                    </button>
                  </div>
                )}
              </div>
              <div className="semesters-stacked-container">
                {semesterIds.map((semesterId) => {
                  const semester = yearGroup.semesters[semesterId];
                  if (!semester || !Array.isArray(semester.curricula)) return null;

                  return (
                    <div key={semesterId} className="semester-section">
                      <div className="semester-section-header">
                        <h3>{(yearGroup.yearLevelName || 'Unknown Year').toUpperCase()} - {(semester.semesterName || 'Unknown Semester').toUpperCase()}</h3>
                        {canMutateCurriculum && (
                          <button
                            className="delete-semester-button"
                            onClick={async () => {
                              if (semester.curricula.length === 0) return;
                              const confirmMessage = `Are you sure you want to delete all subjects in:\n\nProgram: ${yearGroup.programName}\nYear Level: ${yearGroup.yearLevelName}\nSemester: ${semester.semesterName}\n\nThis will delete ${semester.curricula.length} subject(s).\n\nThis action cannot be undone!`;
                              const ok = await swalConfirm({
                                title: 'Delete entire semester?',
                                text: confirmMessage,
                                confirmButtonText: 'Delete all',
                              });
                              if (!ok) return;
                              try {
                                const deletePromises = semester.curricula.map(curriculum => 
                                  api.delete(`/curriculum/${curriculum.curriculum_id}`)
                                );
                                await Promise.all(deletePromises);
                                fetchCurricula({ force: true });
                                swalToast('success', 'Semester subjects deleted');
                              } catch (error) {
                                const msg = error.response?.data?.message || 'Failed to delete semester curriculum';
                                setError(msg);
                                await swalError('Delete failed', msg);
                              }
                            }}
                            title="Delete all subjects in this semester"
                          >
                            Delete Semester
                          </button>
                        )}
                      </div>
                      <div className="table-container">
                        <div
                          className={`curriculum-data-grid curriculum-data-grid--scroll-table${canMutateCurriculum ? ' curriculum-data-grid--with-actions' : ''}`}
                          style={{ '--curriculum-data-cols': 7 }}
                          role="table"
                          aria-label="Curriculum subjects for this semester"
                        >
                          <div className="curriculum-data-grid__head" role="row">
                            {['Subject Code', 'Pre/Co-requisite', 'Description', 'Units', 'Hours', 'Passing Grade', 'Type'].map((label) => (
                              <div key={label} className="curriculum-data-grid__th" role="columnheader">
                                {label}
                              </div>
                            ))}
                            {canMutateCurriculum && (
                              <div className="curriculum-data-grid__th curriculum-data-grid__th--actions" role="columnheader">
                                Actions
                              </div>
                            )}
                          </div>
                          <div className="curriculum-data-grid__body" role="rowgroup">
                            {semester.curricula.length === 0 ? (
                              <div className="curriculum-data-grid__empty no-subjects" role="row">
                                <div role="cell">No subjects</div>
                              </div>
                            ) : (
                              semester.curricula.map((curriculum) => {
                                if (!curriculum) return null;
                                const subject = curriculum.subject;
                                const electiveSlot = curriculum.electiveSlot;
                                const isElectiveSlot = !!curriculum.elective_slot_id;
                                const preCoRequisiteDisplay = getCurriculumRequisiteDisplay(curriculum);

                                return (
                                  <div key={curriculum.curriculum_id} className="curriculum-data-grid__row" role="row">
                                    <div className="curriculum-data-grid__cell" role="cell">
                                      <span className="curriculum-data-grid__mobile-label">Subject Code</span>
                                      <span className="curriculum-data-grid__cell-value">
                                        {isElectiveSlot ? (
                                          canMutateCurriculum ? (
                                            <button
                                              type="button"
                                              className="curriculum-elective-link curriculum-elective-link--slot"
                                              onClick={() => void openElectiveSubjectAssignment(curriculum)}
                                              title={`Assign subjects for ${electiveSlot?.slot_name || 'this elective slot'}`}
                                            >
                                              {electiveSlot?.slot_name || `Elective Slot #${curriculum.elective_slot_id}`}
                                            </button>
                                          ) : (
                                            <span style={{ fontWeight: 'bold', color: '#0066cc' }}>
                                              {electiveSlot?.slot_name || `Elective Slot #${curriculum.elective_slot_id}`}
                                            </span>
                                          )
                                        ) : (
                                          subject?.subject_code || '-'
                                        )}
                                      </span>
                                    </div>
                                    <div className="curriculum-data-grid__cell" role="cell">
                                      <span className="curriculum-data-grid__mobile-label">Pre/Co-requisite</span>
                                      <span className="curriculum-data-grid__cell-value">{preCoRequisiteDisplay}</span>
                                    </div>
                                    <div className="curriculum-data-grid__cell" role="cell">
                                      <span className="curriculum-data-grid__mobile-label">Description</span>
                                      <span className="curriculum-data-grid__cell-value">
                                        {isElectiveSlot
                                          ? electiveSlotDescriptionLabel(
                                              electiveSlot?.slot_name,
                                              curriculum.elective_slot_id
                                            )
                                          : subject?.subject_name || '-'}
                                      </span>
                                    </div>
                                    <div className="curriculum-data-grid__cell" role="cell">
                                      <span className="curriculum-data-grid__mobile-label">Units</span>
                                      <span className="curriculum-data-grid__cell-value">
                                        {isElectiveSlot ? '-' : (subject?.number_of_units || '-')}
                                      </span>
                                    </div>
                                    <div className="curriculum-data-grid__cell" role="cell">
                                      <span className="curriculum-data-grid__mobile-label">Hours</span>
                                      <span className="curriculum-data-grid__cell-value">
                                        {isElectiveSlot ? '-' : (subject?.number_of_hrs || '-')}
                                      </span>
                                    </div>
                                    <div className="curriculum-data-grid__cell" role="cell">
                                      <span className="curriculum-data-grid__mobile-label">Passing Grade</span>
                                      <span className="curriculum-data-grid__cell-value">{curriculum.passing_grade || '-'}</span>
                                    </div>
                                    <div className="curriculum-data-grid__cell" role="cell">
                                      <span className="curriculum-data-grid__mobile-label">Type</span>
                                      <span className="curriculum-data-grid__cell-value">
                                        {isElectiveSlot ? (
                                          canMutateCurriculum ? (
                                            <button
                                              type="button"
                                              className="curriculum-elective-link"
                                              onClick={() => void openElectiveSubjectAssignment(curriculum)}
                                              title={`Assign subjects for ${electiveSlot?.slot_name || 'this elective slot'}`}
                                            >
                                              Elective Subject
                                            </button>
                                          ) : (
                                            <span style={{ color: '#0066cc', fontWeight: 'bold' }}>Elective Subject</span>
                                          )
                                        ) : (
                                          formatSubjectTypeForDisplay(curriculum.subject_type)
                                        )}
                                      </span>
                                    </div>
                                    {canMutateCurriculum && (
                                      <div className="curriculum-data-grid__cell curriculum-data-grid__cell--actions" role="cell">
                                        <span className="curriculum-data-grid__mobile-label">Actions</span>
                                        <div className="action-buttons">
                                          <button
                                            type="button"
                                            className="edit-button"
                                            onClick={async () => {
                                              await fetchLookupData({ force: true });
                                              setEditGroupContext(null);
                                              await loadCurriculumIntoEditPanel(curriculum, 'edit');
                                            }}
                                            title="Edit this curriculum"
                                          >
                                            Edit
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })}
        </>
      ) : (
        <div className="no-data">
          {!filterProgram
            ? 'Select a program to view its curriculum.'
            : filterCurriculumYear
              ? 'No curriculum entries found for this program and curriculum year.'
            : canMutateCurriculum
              ? 'No curriculum entries found for this program. Click "Add Curriculum" to create one.'
              : 'No curriculum entries found for this program.'}
        </div>
      )}


      {canMutateCurriculum && showModal &&
        createPortal(
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content bulk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingCurriculum ? 'Edit Curriculum' : 'Add Curriculum - Multiple Subjects'}</h3>
            </div>
            <div className="modal-form-container">
              <form onSubmit={editingCurriculum ? handleUpdate : handleBulkSubmit}>
              {/* Common fields for all subjects */}
              <div className="bulk-form-header">
                <div className="form-group form-group--program-search">
                  <label>Program <span className="required">*</span></label>
                  <SearchableSelect
                    value={bulkFormData.program_id ? String(bulkFormData.program_id) : ''}
                    onChange={(v) => {
                      if (scopedProgramId) return;
                      setBulkFormData({
                        ...bulkFormData,
                        program_id: v,
                        curriculum_header_id: '',
                      });
                    }}
                    options={programSearchOptions}
                    emptyLabel="Select Program"
                    placeholder="Search programs…"
                    required
                    disabled={!!editingCurriculum || Boolean(scopedProgramId)}
                    className="subject-select curriculum-search-select"
                  />
                </div>
                <div className="form-group form-group--curriculum-header">
                  <label>Curriculum Header <span className="required">*</span></label>
                  <SearchableSelect
                    value={bulkFormData.curriculum_header_id ? String(bulkFormData.curriculum_header_id) : ''}
                    onChange={(v) =>
                      setBulkFormData({
                        ...bulkFormData,
                        curriculum_header_id: v,
                      })
                    }
                    options={bulkCurriculumHeaderOptions}
                    emptyLabel={
                      bulkFormData.program_id
                        ? bulkCurriculumHeaderOptions.length
                          ? 'Select Curriculum Header'
                          : 'No headers for this program'
                        : 'Select a program first'
                    }
                    placeholder="Search curriculum header…"
                    required
                    disabled={!!editingCurriculum || !bulkFormData.program_id}
                    className="subject-select curriculum-search-select"
                    aria-label="Curriculum header"
                  />
                  {bulkFormData.program_id && bulkCurriculumHeaderOptions.length === 0 && (
                    <small style={{ color: '#64748b', fontSize: '0.82rem' }}>
                      Create a curriculum header under Lookup Data first.
                    </small>
                  )}
                </div>
                <div className="form-group">
                  <label>Year Level <span className="required">*</span></label>
                  <SearchableSelect
                    value={bulkFormData.year_level ? String(bulkFormData.year_level) : ''}
                    onChange={(v) => setBulkFormData({ ...bulkFormData, year_level: v })}
                    options={safeLookupData.yearLevels.map((level) => ({
                      value: String(level.year_level_id),
                      label: String(level.year_level),
                    }))}
                    emptyLabel="Select Year Level"
                    placeholder="Search year level…"
                    required
                    disabled={!!editingCurriculum}
                    className="subject-select curriculum-search-select"
                    aria-label="Year level"
                  />
                </div>
                <div className="form-group">
                  <label>Semester <span className="required">*</span></label>
                  <SearchableSelect
                    value={bulkFormData.semester_id ? String(bulkFormData.semester_id) : ''}
                    onChange={(v) => setBulkFormData({ ...bulkFormData, semester_id: v })}
                    options={safeLookupData.semesters.map((semester) => ({
                      value: String(semester.semester_id),
                      label: String(semester.semester_name),
                    }))}
                    emptyLabel="Select Semester"
                    placeholder="Search semester…"
                    required
                    disabled={!!editingCurriculum}
                    className="subject-select curriculum-search-select"
                    aria-label="Semester"
                  />
                </div>
              </div>

              {/* Subject rows (responsive div grid) */}
              <div className="subjects-table-container">
                <div
                  className="curriculum-data-grid curriculum-data-grid--with-actions curriculum-subjects-form-grid"
                  style={{ '--curriculum-data-cols': 8 }}
                  role="table"
                  aria-label="Subjects to add or edit"
                >
                  <div className="curriculum-data-grid__head" role="row">
                    {['Is Elective', 'Course Code / Elective Slot', 'Subject Title', 'Units', 'Hours', 'Passing Grade', 'Type', 'Pre/Co-requisite'].map((label) => (
                      <div key={label} className="curriculum-data-grid__th" role="columnheader">
                        {label}
                      </div>
                    ))}
                    <div className="curriculum-data-grid__th curriculum-data-grid__th--actions" role="columnheader">
                      Actions
                    </div>
                  </div>
                  <div className="curriculum-data-grid__body" role="rowgroup">
                    {subjectRows.map((row, index) => {
                      // Filter elective slots based on selected program, year level, and semester
                      const filteredElectiveSlots = safeLookupData.electiveSlots.filter(slot => {
                        if (!bulkFormData.program_id || !bulkFormData.year_level || !bulkFormData.semester_id) {
                          return false;
                        }
                        return (
                          slot.program_id?.toString() === bulkFormData.program_id.toString() &&
                          slot.year_level_id?.toString() === bulkFormData.year_level.toString() &&
                          slot.semester_id?.toString() === bulkFormData.semester_id.toString()
                        );
                      });
                      
                      return (
                        <div key={index} className="curriculum-data-grid__row" role="row">
                          <div className="curriculum-data-grid__cell" role="cell">
                            <span className="curriculum-data-grid__mobile-label">Is Elective</span>
                            <div className="curriculum-data-grid__cell-value">
                              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={row.is_elective_slot || false}
                                  onChange={(e) => handleRowChange(index, 'is_elective_slot', e.target.checked)}
                                  style={{ cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '12px' }}>Elective</span>
                              </label>
                            </div>
                          </div>
                          <div className="curriculum-data-grid__cell" role="cell">
                            <span className="curriculum-data-grid__mobile-label">Course Code / Elective Slot</span>
                            <div className="curriculum-data-grid__cell-value">
                            {row.is_elective_slot ? (
                              <SearchableSelect
                                value={row.elective_slot_id != null && row.elective_slot_id !== '' ? String(row.elective_slot_id) : ''}
                                onChange={(v) => void handleRowChange(index, 'elective_slot_id', v)}
                                options={bulkElectiveSlotSearchOptions}
                                emptyLabel={
                                  bulkFormData.program_id && bulkFormData.year_level && bulkFormData.semester_id
                                    ? 'No elective slots available'
                                    : 'Select Program, Year Level, and Semester first'
                                }
                                placeholder="Search elective slots…"
                                disabled={bulkElectiveSlotSearchOptions.length === 0}
                                required={index === 0 && row.is_elective_slot}
                                className="subject-select curriculum-search-select curriculum-search-select--course-col"
                              />
                            ) : (
                              <div className="curriculum-title-suggest">
                                <input
                                  type="text"
                                  value={row.subject_code || ''}
                                  onChange={(e) => void handleRowChange(index, 'subject_code', e.target.value)}
                                  onFocus={() => {
                                    if (String(row.subject_code || '').trim().length >= 1) {
                                      setSuggestOpen({ index, field: 'code' });
                                    }
                                  }}
                                  onBlur={() => {
                                    window.setTimeout(() => {
                                      setSuggestOpen((open) =>
                                        open?.index === index && open?.field === 'code' ? null : open,
                                      );
                                    }, 180);
                                    const code = String(row.subject_code || '').trim();
                                    if (!code || row.is_elective_slot) return;
                                    const match = findSubjectByCode(code);
                                    if (!match?.subject_id) return;
                                    if (String(row.subject_id || '') !== String(match.subject_id)) {
                                      void handleRowChange(index, 'subject_code', code);
                                      return;
                                    }
                                    if (!String(row.requisite_id || '').trim()) {
                                      void autoFillRequisiteForRow(index, match.subject_id);
                                    }
                                  }}
                                  className="subject-select curriculum-code-input"
                                  placeholder="e.g. ITE 366"
                                  required={index === 0 && !row.is_elective_slot}
                                  autoComplete="off"
                                />
                                {suggestOpen?.index === index &&
                                  suggestOpen?.field === 'code' &&
                                  (() => {
                                    const suggestions = getSubjectSuggestions(row.subject_code);
                                    if (suggestions.length === 0) return null;
                                    return (
                                      <ul className="curriculum-title-suggest__list" role="listbox">
                                        {suggestions.map((s) => (
                                          <li key={`code-${s.subject_id}`}>
                                            <button
                                              type="button"
                                              className="curriculum-title-suggest__option"
                                              onMouseDown={(e) => e.preventDefault()}
                                              onClick={() =>
                                                applySubjectSuggestion(index, s, { fillCode: true })
                                              }
                                            >
                                              <span className="curriculum-title-suggest__code">
                                                {s.subject_code}
                                              </span>
                                              <span className="curriculum-title-suggest__name">
                                                {s.subject_name}
                                              </span>
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                    );
                                  })()}
                              </div>
                            )}
                            </div>
                          </div>
                          <div className="curriculum-data-grid__cell" role="cell">
                            <span className="curriculum-data-grid__mobile-label">Subject Title</span>
                            <div className="curriculum-data-grid__cell-value">
                            {row.is_elective_slot ? (
                              (() => {
                                const selectedSlot = filteredElectiveSlots.find(s => s.elective_slot_id?.toString() === row.elective_slot_id?.toString());
                                const label = electiveSlotDescriptionLabel(selectedSlot?.slot_name, row.elective_slot_id);
                                return (
                                  <input
                                    type="text"
                                    value={label}
                                    readOnly
                                    className="subject-name-readonly"
                                    placeholder="Elective"
                                  />
                                );
                              })()
                            ) : (
                              <div className="curriculum-title-suggest">
                                <input
                                  type="text"
                                  value={row.subject_name || ''}
                                  onChange={(e) => void handleRowChange(index, 'subject_name', e.target.value)}
                                  onFocus={() => {
                                    if (String(row.subject_name || '').trim().length >= 1) {
                                      setSuggestOpen({ index, field: 'title' });
                                    }
                                  }}
                                  onBlur={() => {
                                    window.setTimeout(() => {
                                      setSuggestOpen((open) =>
                                        open?.index === index && open?.field === 'title' ? null : open,
                                      );
                                    }, 180);
                                  }}
                                  className="subject-select curriculum-title-input"
                                  placeholder="Type title (suggests existing…)"
                                  required={index === 0 && !row.is_elective_slot}
                                  autoComplete="off"
                                />
                                {suggestOpen?.index === index &&
                                  suggestOpen?.field === 'title' &&
                                  (() => {
                                    const suggestions = getSubjectSuggestions(row.subject_name);
                                    if (suggestions.length === 0) return null;
                                    return (
                                      <ul className="curriculum-title-suggest__list" role="listbox">
                                        {suggestions.map((s) => (
                                          <li key={`title-${s.subject_id}`}>
                                            <button
                                              type="button"
                                              className="curriculum-title-suggest__option"
                                              onMouseDown={(e) => e.preventDefault()}
                                              onClick={() =>
                                                applySubjectSuggestion(index, s, { fillCode: false })
                                              }
                                            >
                                              <span className="curriculum-title-suggest__name">
                                                {s.subject_name}
                                              </span>
                                              <span className="curriculum-title-suggest__code">
                                                {s.subject_code}
                                              </span>
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                    );
                                  })()}
                              </div>
                            )}
                            </div>
                          </div>
                          <div className="curriculum-data-grid__cell" role="cell">
                            <span className="curriculum-data-grid__mobile-label">Units</span>
                            <div className="curriculum-data-grid__cell-value">
                            {row.is_elective_slot ? (
                              <input
                                type="text"
                                value="-"
                                readOnly
                                className="units-hours-input"
                                placeholder="N/A"
                              />
                            ) : (
                              <input
                                type="number"
                                min="0"
                                max="30"
                                value={row.number_of_units ?? ''}
                                onChange={(e) => handleRowChange(index, 'number_of_units', e.target.value)}
                                className="units-hours-input"
                                placeholder="Units"
                              />
                            )}
                            </div>
                          </div>
                          <div className="curriculum-data-grid__cell" role="cell">
                            <span className="curriculum-data-grid__mobile-label">Hours</span>
                            <div className="curriculum-data-grid__cell-value">
                            {row.is_elective_slot ? (
                              <input
                                type="text"
                                value="-"
                                readOnly
                                className="units-hours-input"
                                placeholder="N/A"
                              />
                            ) : (
                              <input
                                type="number"
                                min="0"
                                max="60"
                                value={row.number_of_hrs ?? ''}
                                onChange={(e) => handleRowChange(index, 'number_of_hrs', e.target.value)}
                                className="units-hours-input"
                                placeholder="Hours"
                              />
                            )}
                            </div>
                          </div>
                          <div className="curriculum-data-grid__cell" role="cell">
                            <span className="curriculum-data-grid__mobile-label">Passing Grade</span>
                            <div className="curriculum-data-grid__cell-value">
                            <SearchableSelect
                              className="curriculum-search-select subject-select"
                              value={row.passing_grade || ''}
                              onChange={(value) => handleRowChange(index, 'passing_grade', value)}
                              options={PASSING_GRADE_OPTIONS}
                              allowCustomValue
                              emptyLabel="Select Grade"
                              placeholder="Type or pick grade…"
                              aria-label={`Passing grade for subject row ${index + 1}`}
                            />
                            </div>
                          </div>
                          <div className="curriculum-data-grid__cell" role="cell">
                            <span className="curriculum-data-grid__mobile-label">Type</span>
                            <div className="curriculum-data-grid__cell-value">
                            <SearchableSelect
                              className="curriculum-search-select subject-select"
                              value={row.subject_type || ''}
                              onChange={(value) => handleRowChange(index, 'subject_type', value)}
                              options={SUBJECT_TYPE_OPTIONS}
                              allowCustomValue
                              emptyLabel="Select Type"
                              placeholder="Type or pick…"
                              disabled={row.is_elective_slot}
                              aria-label={`Subject type for row ${index + 1}`}
                            />
                            {row.is_elective_slot && (
                              <span style={{ fontSize: '10px', color: '#666', display: 'block', marginTop: '2px' }}>
                                Auto-set to Elective
                              </span>
                            )}
                            </div>
                          </div>
                          <div className="curriculum-data-grid__cell" role="cell">
                            <span className="curriculum-data-grid__mobile-label">Pre/Co-requisite</span>
                            <div className="curriculum-data-grid__cell-value">
                            <SearchableSelect
                              className="curriculum-search-select subject-select"
                              value={row.requisite_id ? String(row.requisite_id) : ''}
                              onChange={(value) => handleRowChange(index, 'requisite_id', value)}
                              options={getRequisiteOptionsForBulkRow(row)}
                              emptyLabel="None"
                              placeholder="Search requisite…"
                              aria-label={`Pre/co-requisite for row ${index + 1}`}
                            />
                            </div>
                          </div>
                          <div className="curriculum-data-grid__cell curriculum-data-grid__cell--actions" role="cell">
                            <span className="curriculum-data-grid__mobile-label">Actions</span>
                            <div className="curriculum-data-grid__cell-value">
                              <button
                                type="button"
                                className="remove-row-button"
                                onClick={() => handleRemoveRow(index)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {!editingCurriculum && (
                  <button
                    type="button"
                    className="add-row-button"
                    onClick={handleAddRow}
                  >
                    + Add Subject Row
                  </button>
                )}
              </div>
              </form>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={handleCloseModal}>
                Cancel
              </button>
              <button type="submit" onClick={editingCurriculum ? handleUpdate : handleBulkSubmit}>
                {editingCurriculum ? 'Update' : 'Save All Subjects'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Panel — centered modal */}
      {canMutateCurriculum && showEditPanel &&
        createPortal(
        <div className="edit-panel-overlay" onClick={closeEditPanel}>
          <div
            className="edit-panel"
            role="dialog"
            aria-modal="true"
            aria-label={editPanelMode === 'insert' ? 'Insert subject' : 'Edit subject'}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="edit-panel-header">
              <div className="edit-panel-header__text">
                <span className="edit-panel-eyebrow">Curriculum group</span>
                <h3>{editPanelMode === 'insert' ? 'Insert subject' : 'Edit subject'}</h3>
                {(editGroupContext?.programName || editGroupContext?.yearLevelName) && (
                  <p className="edit-panel-context">
                    {[editGroupContext.programName, editGroupContext.yearLevelName]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
              <button
                className="close-panel-button"
                onClick={closeEditPanel}
                type="button"
                aria-label="Close edit group panel"
              >
                ×
              </button>
            </div>

            <div className="edit-panel-content">
              <div className="edit-single-curriculum">
                <div className="edit-panel-mode-tabs" role="tablist" aria-label="Edit group mode">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={editPanelMode === 'insert'}
                    className={`edit-panel-mode-tab${editPanelMode === 'insert' ? ' is-active' : ''}`}
                    onClick={() =>
                      startInsertInEditPanel({
                        programId: editGroupContext?.programId || bulkFormData.program_id,
                        yearLevelId: editGroupContext?.yearLevelId || bulkFormData.year_level,
                        semesterId: bulkFormData.semester_id,
                      })
                    }
                  >
                    Insert subject
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={editPanelMode === 'edit'}
                    className={`edit-panel-mode-tab${editPanelMode === 'edit' ? ' is-active' : ''}`}
                    onClick={() => {
                      const list =
                        editGroupContext?.curricula ||
                        (selectedCurriculum ? [selectedCurriculum] : []);
                      if (list.length > 0) {
                        void loadCurriculumIntoEditPanel(list[0], 'edit');
                      } else {
                        setEditPanelMode('edit');
                      }
                    }}
                  >
                    Edit subject
                  </button>
                </div>

                {editPanelMode === 'edit' && (editGroupContext?.curricula?.length > 0 || selectedCurriculum) && (
                  <div className="form-group">
                    <label>Select subject to edit</label>
                    <select
                      className="subject-select"
                      value={selectedCurriculum?.curriculum_id != null ? String(selectedCurriculum.curriculum_id) : ''}
                      onChange={(e) => {
                        const list = editGroupContext?.curricula || [];
                        const found =
                          list.find((c) => String(c.curriculum_id) === String(e.target.value)) ||
                          (Array.isArray(curricula)
                            ? curricula.find((c) => String(c.curriculum_id) === String(e.target.value))
                            : null);
                        if (found) void loadCurriculumIntoEditPanel(found, 'edit');
                      }}
                    >
                      {(editGroupContext?.curricula?.length
                        ? editGroupContext.curricula
                        : selectedCurriculum
                          ? [selectedCurriculum]
                          : []
                      ).map((c) => {
                        const code = c.subject?.subject_code || c.elective_slot?.slot_name || '—';
                        const title = c.subject?.subject_name || c.elective_slot?.slot_name || '';
                        const sem = c.semester?.semester_name || c.semester_name || '';
                        return (
                          <option key={c.curriculum_id} value={c.curriculum_id}>
                            {code} — {title}{sem ? ` (${sem})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                <h4 className="edit-panel-section-title">
                  {editPanelMode === 'insert' ? 'New subject details' : 'Selected subject details'}
                </h4>
                <form
                  id="edit-curriculum-panel-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleEditPanelSave(e);
                  }}
                >
                    <div className="form-group form-group--program-search">
                      <label>Program <span className="required">*</span></label>
                      <SearchableSelect
                        value={
                          bulkFormData.program_id || selectedCurriculum?.program_id
                            ? String(bulkFormData.program_id || selectedCurriculum?.program_id)
                            : ''
                        }
                        onChange={(v) => {
                          if (scopedProgramId) return;
                          setBulkFormData({ ...bulkFormData, program_id: v });
                          setEditPanelDirty(true);
                        }}
                        options={programSearchOptions}
                        emptyLabel="Select Program"
                        placeholder="Search programs…"
                        required
                        disabled={Boolean(scopedProgramId) || Boolean(editGroupContext)}
                        className="subject-select curriculum-search-select"
                      />
                    </div>

                    <div className="form-group">
                      <label>Year Level <span className="required">*</span></label>
                      <select
                        value={bulkFormData.year_level || normalizeYearLevelId(selectedCurriculum?.year_level) || ''}
                        onChange={(e) => {
                          setBulkFormData({ ...bulkFormData, year_level: e.target.value });
                          setEditPanelDirty(true);
                        }}
                        required
                        disabled={Boolean(editGroupContext)}
                        className="subject-select"
                      >
                        <option value="">Select Year Level</option>
                        {safeLookupData.yearLevels.map((level) => (
                          <option key={level.year_level_id} value={level.year_level_id}>
                            {level.year_level}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Semester <span className="required">*</span></label>
                      <select
                        value={bulkFormData.semester_id || selectedCurriculum?.semester_id || ''}
                        onChange={(e) => {
                          setBulkFormData({ ...bulkFormData, semester_id: e.target.value });
                          setEditPanelDirty(true);
                        }}
                        required
                        className="subject-select"
                      >
                        <option value="">Select Semester</option>
                        {safeLookupData.semesters.map((semester) => (
                          <option key={semester.semester_id} value={semester.semester_id}>
                            {semester.semester_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={!!subjectRows[0]?.is_elective_slot}
                          onChange={(e) => void handleRowChange(0, 'is_elective_slot', e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                        <span>Is Elective Slot</span>
                      </label>
                    </div>

                    {subjectRows[0]?.is_elective_slot ? (
                      <div className="form-group">
                        <label>Elective Slot <span className="required">*</span></label>
                        <SearchableSelect
                          value={String(subjectRows[0]?.elective_slot_id || '')}
                          onChange={(v) => void handleRowChange(0, 'elective_slot_id', v)}
                          options={editElectiveSlotSearchOptions}
                          emptyLabel="Select Elective Slot"
                          placeholder="Search elective slots…"
                          required
                          className="subject-select curriculum-search-select"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="form-group">
                          <label>Course Code <span className="required">*</span></label>
                          <div className="curriculum-title-suggest">
                            <input
                              type="text"
                              value={subjectRows[0]?.subject_code || ''}
                              onChange={(e) => void handleRowChange(0, 'subject_code', e.target.value)}
                              onFocus={() => {
                                if (String(subjectRows[0]?.subject_code || '').trim().length >= 1) {
                                  setSuggestOpen({ index: 0, field: 'code' });
                                }
                              }}
                              onBlur={() => {
                                window.setTimeout(() => {
                                  setSuggestOpen((open) =>
                                    open?.index === 0 && open?.field === 'code' ? null : open,
                                  );
                                }, 180);
                              }}
                              className="subject-select"
                              placeholder="e.g. ITE 366"
                              required
                              autoComplete="off"
                            />
                            {suggestOpen?.index === 0 &&
                              suggestOpen?.field === 'code' &&
                              (() => {
                                const suggestions = getSubjectSuggestions(subjectRows[0]?.subject_code);
                                if (suggestions.length === 0) return null;
                                return (
                                  <ul className="curriculum-title-suggest__list" role="listbox">
                                    {suggestions.map((s) => (
                                      <li key={`edit-code-${s.subject_id}`}>
                                        <button
                                          type="button"
                                          className="curriculum-title-suggest__option"
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() =>
                                            applySubjectSuggestion(0, s, { fillCode: true })
                                          }
                                        >
                                          <span className="curriculum-title-suggest__code">
                                            {s.subject_code}
                                          </span>
                                          <span className="curriculum-title-suggest__name">
                                            {s.subject_name}
                                          </span>
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                );
                              })()}
                          </div>
                        </div>
                        <div className="form-group">
                          <label>Subject Title <span className="required">*</span></label>
                          <div className="curriculum-title-suggest">
                            <input
                              type="text"
                              value={subjectRows[0]?.subject_name || ''}
                              onChange={(e) => void handleRowChange(0, 'subject_name', e.target.value)}
                              onFocus={() => {
                                if (String(subjectRows[0]?.subject_name || '').trim().length >= 1) {
                                  setSuggestOpen({ index: 0, field: 'title' });
                                }
                              }}
                              onBlur={() => {
                                window.setTimeout(() => {
                                  setSuggestOpen((open) =>
                                    open?.index === 0 && open?.field === 'title' ? null : open,
                                  );
                                }, 180);
                              }}
                              className="subject-select curriculum-title-input"
                              placeholder="Type title (suggests existing…)"
                              required
                              autoComplete="off"
                            />
                            {suggestOpen?.index === 0 &&
                              suggestOpen?.field === 'title' &&
                              (() => {
                                const suggestions = getSubjectSuggestions(subjectRows[0]?.subject_name);
                                if (suggestions.length === 0) return null;
                                return (
                                  <ul className="curriculum-title-suggest__list" role="listbox">
                                    {suggestions.map((s) => (
                                      <li key={`edit-title-${s.subject_id}`}>
                                        <button
                                          type="button"
                                          className="curriculum-title-suggest__option"
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() =>
                                            applySubjectSuggestion(0, s, { fillCode: false })
                                          }
                                        >
                                          <span className="curriculum-title-suggest__name">
                                            {s.subject_name}
                                          </span>
                                          <span className="curriculum-title-suggest__code">
                                            {s.subject_code}
                                          </span>
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                );
                              })()}
                          </div>
                        </div>
                      </>
                    )}

                    {!subjectRows[0]?.is_elective_slot && (
                      <div className="form-row-2">
                        <div className="form-group">
                          <label>Units</label>
                          <input
                            type="number"
                            min="0"
                            max="30"
                            step="1"
                            value={subjectRows[0]?.number_of_units ?? ''}
                            onChange={(e) => void handleRowChange(0, 'number_of_units', e.target.value)}
                            className="subject-select"
                            placeholder="e.g. 3"
                          />
                        </div>
                        <div className="form-group">
                          <label>Hours</label>
                          <input
                            type="number"
                            min="0"
                            max="60"
                            step="1"
                            value={subjectRows[0]?.number_of_hrs ?? ''}
                            onChange={(e) => void handleRowChange(0, 'number_of_hrs', e.target.value)}
                            className="subject-select"
                            placeholder="e.g. 3"
                          />
                        </div>
                      </div>
                    )}

                    <div className="form-group">
                      <label>Passing Grade</label>
                      <SearchableSelect
                        className="curriculum-search-select subject-select"
                        value={subjectRows[0]?.passing_grade || ''}
                        onChange={(value) => void handleRowChange(0, 'passing_grade', value)}
                        options={PASSING_GRADE_OPTIONS}
                        allowCustomValue
                        emptyLabel="Select Grade"
                        placeholder="Type or pick grade…"
                        aria-label="Passing grade"
                      />
                    </div>

                    <div className="form-group">
                      <label>Type</label>
                      <SearchableSelect
                        className="curriculum-search-select subject-select"
                        value={subjectRows[0]?.subject_type || ''}
                        onChange={(value) => void handleRowChange(0, 'subject_type', value)}
                        options={SUBJECT_TYPE_OPTIONS}
                        allowCustomValue
                        emptyLabel="Select Type"
                        placeholder="Type or pick…"
                        disabled={subjectRows[0]?.is_elective_slot}
                        aria-label="Subject type"
                      />
                    </div>

                    <div className="form-group">
                      <label>Pre/Co-requisite</label>
                      <SearchableSelect
                        className="curriculum-search-select subject-select"
                        value={
                          subjectRows[0]?.requisite_id || selectedCurriculum?.requisite_id
                            ? String(subjectRows[0]?.requisite_id || selectedCurriculum?.requisite_id)
                            : ''
                        }
                        onChange={(value) => void handleRowChange(0, 'requisite_id', value)}
                        options={getRequisiteOptionsForEdit()}
                        emptyLabel="None"
                        placeholder="Search requisite…"
                        aria-label="Pre/co-requisite"
                      />
                    </div>

                    {editPanelMode === 'edit' && !(subjectRows[0]?.is_elective_slot || selectedCurriculum?.elective_slot_id) && (
                      <div
                        className="form-group"
                        style={{
                          border: '1px solid #dbe4f0',
                          borderRadius: '8px',
                          padding: '12px',
                          background: '#f8fbff',
                        }}
                      >
                        <label>Bulk prerequisite rule</label>
                        <p style={{ margin: '4px 0 10px', color: '#6c757d', fontSize: '12px' }}>
                          Use this to replace the subject&apos;s prerequisites with a saved rule, year range, or Core/Major subject group.
                        </p>
                        <SearchableSelect
                          value={editBulkPrerequisiteText}
                          onChange={(v) => {
                            setEditBulkPrerequisiteText(v);
                            setEditPanelDirty(true);
                          }}
                          options={BULK_PREREQUISITE_RULE_OPTIONS}
                          emptyLabel="Type or select a rule"
                          placeholder="4th year standing, all subjects from 1st year to 4th year 1st semester, or all professional subjects"
                          allowCustomValue
                          aria-label="Bulk prerequisite rule"
                        />
                        {canSyncEditBulkPrerequisites() && (
                          <div style={{ color: '#495057', fontSize: '12px', marginTop: '8px' }}>
                            Will save {getEditBulkPrerequisiteSubjectIds().length} subjects from this rule.
                          </div>
                        )}
                      </div>
                    )}

                    {editPanelMode === 'edit' && selectedCurriculum && (
                      <div className="edit-panel-actions">
                        <button
                          type="button"
                          className="delete-button"
                          onClick={async () => {
                            const deleted = await handleDelete(selectedCurriculum.curriculum_id);
                            if (deleted) closeEditPanel();
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </form>
                </div>
            </div>

            {editPanelDirty && (
              <div className="floating-save-bar curriculum-edit-floating-bar">
                <span>
                  {editPanelMode === 'insert'
                    ? '1 subject ready to insert'
                    : '1 subject(s) with unsaved changes'}
                </span>
                <div className="floating-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      if (editPanelMode === 'insert') {
                        setSubjectRows([emptySubjectRow()]);
                        setEditPanelDirty(false);
                        setSuggestOpen(null);
                      } else if (selectedCurriculum) {
                        void loadCurriculumIntoEditPanel(selectedCurriculum, 'edit');
                      }
                    }}
                  >
                    Clear All
                  </button>
                  <button
                    type="submit"
                    form="edit-curriculum-panel-form"
                    className="btn-primary"
                  >
                    Save All Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Co-requisite Modal */}
      {canMutateCurriculum && showCorequisiteModal &&
        createPortal(
        <div className="modal-overlay" onClick={handleCloseCorequisiteModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Add Co-requisite</h3>
            <form onSubmit={handleCorequisiteSubmit}>
              <div className="form-group">
                <label>Subject <span className="required">*</span></label>
                <SearchableSelect
                  value={corequisiteForm.subject_id ? String(corequisiteForm.subject_id) : ''}
                  onChange={(v) =>
                    setCorequisiteForm({ ...corequisiteForm, subject_id: v, coreq_subject_id: '' })
                  }
                  options={subjectSearchOptions}
                  emptyLabel="Select Subject"
                  required
                  className="subject-select"
                />
              </div>
              
              <div className="form-group">
                <label>Co-requisite Subject <span className="required">*</span></label>
                <SearchableSelect
                  value={corequisiteForm.coreq_subject_id ? String(corequisiteForm.coreq_subject_id) : ''}
                  onChange={(v) => setCorequisiteForm({ ...corequisiteForm, coreq_subject_id: v })}
                  options={coreqCoSubjectSearchOptions}
                  emptyLabel="Select Co-requisite Subject"
                  required
                  className="subject-select"
                />
              </div>
              
              {error && <div className="error-message">{error}</div>}
              
              <div className="modal-actions">
                <button type="button" onClick={handleCloseCorequisiteModal}>
                  Cancel
                </button>
                <button type="submit">
                  Add Co-requisite
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {canMutateCurriculum && showElectiveSubjectModal && selectedElectiveSlot &&
        createPortal(
        <div
          className="modal-overlay"
          onClick={() => setShowElectiveSubjectModal(false)}
        >
          <div
            className="modal-content large-modal curriculum-elective-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>Assign Elective Subjects</h3>
                <p className="curriculum-elective-modal__subtitle">
                  {selectedElectiveSlot.slot_name || `Elective Slot #${selectedElectiveSlot.elective_slot_id}`}
                </p>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setShowElectiveSubjectModal(false)}
                aria-label="Close elective subject dialog"
              >
                ×
              </button>
            </div>

            <div className={`curriculum-elective-assign-card${selectedElectiveSlotIsIt ? '' : ' curriculum-elective-assign-card--no-track'}`}>
              {selectedElectiveSlotIsIt && (
                <div className="form-group">
                  <label>Track</label>
                  <SearchableSelect
                    value={electiveSubjectForm.track_id ? String(electiveSubjectForm.track_id) : ''}
                    onChange={(v) =>
                      setElectiveSubjectForm((prev) => ({ ...prev, track_id: v || '', subject_id: '' }))
                    }
                    options={trackSearchOptions}
                    emptyLabel="No specific track"
                    placeholder="Search track…"
                    className="subject-select"
                    aria-label="Optional track for elective subject"
                  />
                </div>
              )}

              <div className="form-group">
                <label>Subject</label>
                <SearchableSelect
                  value={electiveSubjectForm.subject_id ? String(electiveSubjectForm.subject_id) : ''}
                  onChange={(v) =>
                    setElectiveSubjectForm((prev) => ({ ...prev, subject_id: v || '' }))
                  }
                  options={electiveSlotSubjectOptions}
                  emptyLabel="Select Subject"
                  placeholder="Search subject to assign…"
                  className="subject-select"
                  aria-label="Subject to assign to elective slot"
                />
              </div>

              <button
                type="button"
                className="add-button"
                onClick={handleAssignElectiveSubject}
                disabled={electiveSubjectSaving || !electiveSubjectForm.subject_id}
              >
                {electiveSubjectSaving ? 'Saving...' : 'Assign Subject'}
              </button>
            </div>

            <div className="curriculum-elective-assigned">
              <h4>
                Assigned Subjects ({selectedElectiveSlot.electiveSubjects?.length || 0})
              </h4>
              {selectedElectiveSlot.electiveSubjects?.length > 0 ? (
                <div className={`curriculum-elective-assigned__table${selectedElectiveSlotIsIt ? '' : ' curriculum-elective-assigned__table--no-track'}`}>
                  <div className="curriculum-elective-assigned__head">
                    <span>Code</span>
                    <span>Subject</span>
                    {selectedElectiveSlotIsIt && <span>Track</span>}
                    <span>Action</span>
                  </div>
                  {selectedElectiveSlot.electiveSubjects.map((item) => (
                    <div
                      className="curriculum-elective-assigned__row"
                      key={item.elective_subject_id || `${item.subject_id}-${item.track_id || 'none'}`}
                    >
                      <span>{item.subject?.subject_code || '-'}</span>
                      <span>{item.subject?.subject_name || '-'}</span>
                      {selectedElectiveSlotIsIt && <span>{item.track?.track_name || item.track?.track_code || '-'}</span>}
                      <span>
                        <button
                          type="button"
                          className="delete-button"
                          onClick={() => void handleRemoveElectiveSubject(item.subject_id)}
                          disabled={electiveSubjectSaving}
                        >
                          Remove
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="curriculum-elective-assigned__empty">
                  No subjects assigned yet. Add the subject choices for this elective slot above.
                </p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CurriculumManagement;