import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import api, { jwtAuth } from '../../api/axios';
import { swalConfirm, swalToast, swalError } from '../../utils/swal';
import { findUnsafeFormField } from '../../utils/inputValidation';
import useRecoverableFormDraft from '../../hooks/useRecoverableFormDraft';
import useDialogFocus from '../../hooks/useDialogFocus';
import { recoverableDraftKey } from '../../utils/networkRecoverability';
import { formatCurriculumYearRange, parseCurriculumStartYear } from '../../utils/curriculumYear';
import { usePermission } from '../../hooks/usePermission';
import { permissionSlugForPanelKey } from '../../config/lookupDataSidebarPanels';
import SearchableSelect from '../common/SearchableSelect';
import ClientPaginationBar from '../common/ClientPaginationBar';
import './LookupDataManagement.css';

/** Match CurriculumManagement default types: ITE→core; GEN/PED/NST/SSP/MAT→GE (minor). */
const SUBJECT_CODE_GE_PREFIXES = ['GEN', 'PED', 'NST', 'SSP', 'MAT'];

function subjectCodeCurriculumCategory(subjectCode) {
  const c = (subjectCode || '').trim().toUpperCase();
  if (c.startsWith('ITE')) return 'core';
  if (SUBJECT_CODE_GE_PREFIXES.some((p) => c.startsWith(p))) return 'ge';
  return 'other';
}

/** Units for one curriculum row (elective slots default to 3 when subject units are empty). */
function curriculumRowUnits(row) {
  const subj = row?.subject;
  let u = Number(subj?.number_of_units ?? row?.number_of_units);
  const isElectiveSlot = Boolean(row?.elective_slot_id || row?.electiveSlot || row?.elective_slot);
  if ((!Number.isFinite(u) || u <= 0) && isElectiveSlot) {
    u = 3;
  }
  return Number.isFinite(u) && u > 0 ? u : 0;
}

/**
 * Latest curriculum total units per program_id (by Effective_Year).
 * Totals come from curriculum rows — not program.total_units_required.
 */
function buildProgramCurriculumUnitsMap(curriculums, curriculumHeaders) {
  const sumsByHeader = new Map();
  (curriculums || []).forEach((row) => {
    const hid = row.curriculum_header_id
      ?? row.curriculumHeader?.curriculum_header_id
      ?? row.curriculum_header?.curriculum_header_id;
    if (hid == null) return;
    const key = String(hid);
    sumsByHeader.set(key, (sumsByHeader.get(key) || 0) + curriculumRowUnits(row));
  });

  const headersByProgram = new Map();
  (curriculumHeaders || []).forEach((h) => {
    const pid = String(h.program_id ?? h.program?.program_id ?? '');
    if (!pid) return;
    if (!headersByProgram.has(pid)) headersByProgram.set(pid, []);
    headersByProgram.get(pid).push(h);
  });

  // Also attribute headers from curriculum rows when header list is incomplete.
  (curriculums || []).forEach((row) => {
    const pid = String(row.program_id ?? row.program?.program_id ?? '');
    const hid = row.curriculum_header_id
      ?? row.curriculumHeader?.curriculum_header_id
      ?? row.curriculum_header?.curriculum_header_id;
    if (!pid || hid == null) return;
    if (!headersByProgram.has(pid)) headersByProgram.set(pid, []);
    const list = headersByProgram.get(pid);
    if (!list.some((h) => String(h.curriculum_header_id) === String(hid))) {
      const h = row.curriculumHeader ?? row.curriculum_header ?? {
        curriculum_header_id: hid,
        program_id: pid,
        Effective_Year: 0,
      };
      list.push(h);
    }
  });

  const result = new Map();
  headersByProgram.forEach((headers, pid) => {
    const sorted = [...headers].sort(
      (a, b) =>
        Number(b.Effective_Year ?? b.effective_year ?? 0) -
        Number(a.Effective_Year ?? a.effective_year ?? 0),
    );
    for (const h of sorted) {
      const sum = sumsByHeader.get(String(h.curriculum_header_id));
      if (sum != null && sum > 0) {
        result.set(pid, sum);
        return;
      }
    }
  });
  return result;
}

/** Lookup tabs that show a client-side search field above the grid */
const SEARCHABLE_LOOKUP_SECTIONS = new Set([
  'programs',
  'departments',
  'subjects',
  'requisites',
  'curriculumHeaders',
  'electiveSubjects',
  'offeredSubjects',
]);

const LOOKUP_SEARCH_PLACEHOLDER = {
  programs: 'Search by department code or program name…',
  departments: 'Search by campus, name, or code…',
  subjects: 'Search by code or name…',
  requisites: 'Search by type, subject, or required subject…',
  curriculumHeaders: 'Search by program, effective year, or description…',
  electiveSubjects: 'Search by department, program, track, slot, subject, or description…',
  offeredSubjects: 'Search by subject, year, semester, program, track…',
};

/** Primary keys for lookup tables — newest rows (highest id) first. */
const LOOKUP_NEWEST_FIRST_ID = {
  programs: 'program_id',
  departments: 'department_id',
  subjects: 'subject_id',
  // yearLevels: natural 1st→4th/5th order (not newest-first)
  semesters: 'semester_id',
  campus: 'campus_id',
  roles: 'role_id',
  requisites: 'requisites_id',
  academicYears: 'academic_year_id',
  tracks: 'track_id',
  curriculumHeaders: 'curriculum_header_id',
  offeredSubjects: 'offered_subject_id',
  electiveSubjects: 'elective_subject_id',
  electiveSlots: 'elective_slot_id',
};

/** Stable PK field for every lookup tab (edit/delete). Includes yearLevels. */
const LOOKUP_RECORD_ID = {
  ...LOOKUP_NEWEST_FIRST_ID,
  yearLevels: 'year_level_id',
};

/** Sections that support Activate / Deactivate (maps to /lookup/{path}/{id}/status). */
const LOOKUP_STATUS_API_PATH = {
  programs: 'programs',
  departments: 'departments',
  subjects: 'subjects',
  yearLevels: 'year-levels',
  semesters: 'semesters',
  campus: 'campus',
  roles: 'roles',
  academicYears: 'academic-years',
  tracks: 'tracks',
  curriculumHeaders: 'curriculum-headers',
  offeredSubjects: 'offered-subjects',
  electiveSubjects: 'elective-subjects',
};

const lookupItemIsActive = (item) => String(item?.status || 'active').toLowerCase() === 'active';

/**
 * Resolve the DB primary key for a lookup row.
 * Avoids broken camelCase guesses like academicYears → academicYear_id.
 */
function getLookupRecordId(section, item) {
  if (!item || typeof item !== 'object') return null;
  const field = LOOKUP_RECORD_ID[section];
  let raw = field != null ? item[field] : undefined;
  if ((raw === null || raw === undefined || raw === '') && section === 'requisites') {
    raw = item.requisites_id ?? item.requisite_id;
  }
  if (raw === null || raw === undefined || raw === '') {
    raw = item.id;
  }
  if (raw === null || raw === undefined || raw === '') return null;
  const asText = String(raw).trim();
  if (!asText || asText === 'undefined' || asText === 'null') return null;
  return raw;
}

/** College year levels: 1–4 typical; 5 only for Architecture. Not for retake extensions. */
const LOOKUP_MAX_COLLEGE_YEAR_LEVEL = 5;

function parseLookupYearLevelNumber(value) {
  const text = String(value || '').toLowerCase();
  if (/(^|\D)(1|1st|first)(\D|$)/.test(text)) return 1;
  if (/(^|\D)(2|2nd|second)(\D|$)/.test(text)) return 2;
  if (/(^|\D)(3|3rd|third)(\D|$)/.test(text)) return 3;
  if (/(^|\D)(4|4th|fourth)(\D|$)/.test(text)) return 4;
  if (/(^|\D)(5|5th|fifth)(\D|$)/.test(text)) return 5;
  if (/(^|\D)(6|6th|sixth)(\D|$)/.test(text)) return 6;
  if (/(^|\D)(7|7th|seventh)(\D|$)/.test(text)) return 7;
  if (/(^|\D)(8|8th|eighth)(\D|$)/.test(text)) return 8;
  if (/(^|\D)(9|9th|ninth)(\D|$)/.test(text)) return 9;
  if (/(^|\D)(10|10th|tenth)(\D|$)/.test(text)) return 10;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sortYearLevelsNatural(rows) {
  if (!Array.isArray(rows)) return [];
  return [...rows].sort((a, b) => {
    const na =
      parseLookupYearLevelNumber(a?.year_level) || Number(a?.year_level_id) || 0;
    const nb =
      parseLookupYearLevelNumber(b?.year_level) || Number(b?.year_level_id) || 0;
    return na - nb;
  });
}

function sortLookupNewestFirst(section, rows) {
  const idField = LOOKUP_NEWEST_FIRST_ID[section];
  if (!idField || !Array.isArray(rows)) return rows || [];
  return [...rows].sort((a, b) => Number(b?.[idField] || 0) - Number(a?.[idField] || 0));
}

const BULK_REQUISITE_RULE_OPTIONS = [
  { value: 'all professional subjects', label: 'All Core / Major subjects before this subject' },
  { value: 'all subjects', label: 'All earlier subjects in the program' },
  { value: '2nd year standing', label: '2nd year standing' },
  { value: '3rd year standing', label: '3rd year standing' },
  { value: '4th year standing', label: '4th year standing' },
  { value: 'all subjects from 1st year to 2nd year', label: 'All subjects from 1st year to 2nd year' },
  { value: 'all subjects from 1st year to 3rd year', label: 'All subjects from 1st year to 3rd year' },
  {
    value: 'all subjects from 1st year to 4th year 1st semester',
    label: 'All subjects from 1st year to 4th year 1st semester',
  },
  { value: 'all subjects from 2nd year to 3rd year', label: 'All subjects from 2nd year to 3rd year' },
  { value: 'all subjects from 2nd year to 4th year', label: 'All subjects from 2nd year to 4th year' },
  { value: 'all subjects from 3rd year to 4th year', label: 'All subjects from 3rd year to 4th year' },
  { value: '__year_range__', label: 'Custom year range…' },
  { value: 'all core subjects', label: 'All core subjects' },
  { value: 'all major subjects', label: 'All major subjects' },
  { value: 'all professional education subjects', label: 'All professional education subjects' },
  { value: 'all professional and major subjects', label: 'All professional and major subjects' },
  { value: 'all professional and major specialization subjects', label: 'All professional and major specialization subjects' },
  { value: 'all board subjects', label: 'All board subjects' },
  { value: '100% professional units', label: '100% professional units' },
  {
    value: 'all general education, professional education, and specialization subjects',
    label: 'All GE, professional education, and specialization subjects',
  },
];

/**
 * @param {object} props
 * @param {'inline'|'external'} [props.panelNav] inline = horizontal tabs; external = parent sidebar (Dean/Admin)
 * @param {string} [props.activePanel] required when panelNav is external — panel key e.g. programs
 * @param {(key: string) => void} [props.onActivePanelChange]
 */
const LookupDataManagement = ({
  panelNav = 'inline',
  activePanel: activePanelProp,
  onActivePanelChange,
}) => {
  const [lookupData, setLookupData] = useState({
    programs: [],
    subjects: [],
    departments: [],
    yearLevels: [],
    semesters: [],
    prerequisites: [],
    corequisites: [],
    roles: [],
    campus: [],
    requisites: [],
    academicYears: [],
    tracks: [],
    curriculumHeaders: [],
    curriculums: [],
    offeredSubjects: [],
    electiveSubjects: [],
    electiveSlots: [],
  });

  /** Present school year: the active Lookup year (same rule as the API). */
  const currentAcademicYear = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const years = (lookupData.academicYears || []).filter((ay) => {
      const status = String(ay.status || '').trim().toLowerCase();
      return ['active', 'open', 'current'].includes(status);
    });
    if (years.length === 1) return years[0];
    const startOf = (ay) => {
      const m = String(ay.academic_year_name || ay.name || '').match(/(\d{4})\s*[-–/]\s*(\d{4})/);
      return m ? [Number(m[1]), Number(m[2])] : null;
    };
    const sorted = [...years].sort((a, b) => (startOf(b)?.[0] || 0) - (startOf(a)?.[0] || 0));
    return (
      sorted.find((ay) => {
        const r = startOf(ay);
        return r && thisYear >= r[0] && thisYear <= r[1];
      }) ||
      sorted[0] ||
      null
    );
  }, [lookupData.academicYears]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTabInternal, setActiveTabInternal] = useState('programs');
  const externalNav = panelNav === 'external';
  const activeTab = externalNav ? activePanelProp || 'programs' : activeTabInternal;

  const { hasPermission, isAdmin, user } = usePermission();
  const canMutateCurrentPanel = useMemo(() => {
    if (isAdmin) return true;
    if (hasPermission('lookup.manage')) return true;
    if (hasPermission('Lookup Data')) return true;
    const slug = permissionSlugForPanelKey(activeTab);
    if (slug && hasPermission(`lookup.${slug}.manage`)) return true;
    return false;
  }, [isAdmin, hasPermission, activeTab]);

  const programCurriculumUnitsById = useMemo(
    () =>
      buildProgramCurriculumUnitsMap(lookupData.curriculums, lookupData.curriculumHeaders),
    [lookupData.curriculums, lookupData.curriculumHeaders],
  );

  const setActiveTab = (key) => {
    if (externalNav) {
      onActivePanelChange?.(key);
    } else {
      setActiveTabInternal(key);
    }
  };

  const [showModal, setShowModal] = useState(false);
  const lookupModalRef = useRef(null);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingBulkSubjects, setIsAddingBulkSubjects] = useState(false);
  useDialogFocus(showModal, lookupModalRef, null, () => {
    if (isSubmitting || isAddingBulkSubjects) return;
    setShowModal(false);
    setError('');
  });
  const isSubmittingRef = useRef(false);
  const isAddingBulkSubjectsRef = useRef(false);
  const lookupFetchInFlightRef = useRef(false);
  /** Per-section query string for searchable lookup grids */
  const [lookupSearchBySection, setLookupSearchBySection] = useState({});
  /** Subjects tab: filter by curriculum-style category (Core / GE). */
  const [subjectCategoryFilter, setSubjectCategoryFilter] = useState('all');
  const [lookupListPage, setLookupListPage] = useState(1);
  const [lookupListPageSize, setLookupListPageSize] = useState(10);

  const lookupFormDraftKey = showModal
    ? recoverableDraftKey([
        'lookup-form',
        activeTab,
        editingItem
          ? String(getLookupRecordId(activeTab, editingItem) ?? 'edit')
          : 'new',
      ])
    : '';

  const { clearDraft: clearLookupFormDraft } = useRecoverableFormDraft({
    draftKey: lookupFormDraftKey,
    formData,
    setFormData,
    enabled: showModal && Boolean(lookupFormDraftKey),
  });

  const lookupSearchForActiveTab = SEARCHABLE_LOOKUP_SECTIONS.has(activeTab)
    ? (lookupSearchBySection[activeTab] ?? '')
    : '';

  useEffect(() => {
    setLookupListPage(1);
  }, [activeTab, lookupSearchForActiveTab]);

  useEffect(() => {
    setLookupListPage(1);
  }, [subjectCategoryFilter]);

  useEffect(() => {
    if (activeTab !== 'subjects') setSubjectCategoryFilter('all');
  }, [activeTab]);

  useEffect(() => {
    if (!user || !jwtAuth.isAuthenticated()) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    fetchLookupData({ signal: controller.signal });

    return () => {
      controller.abort();
      lookupFetchInFlightRef.current = false;
    };
  }, [user]);

  const fetchLookupData = async ({ signal, force = false } = {}) => {
    if (!jwtAuth.isAuthenticated()) {
      setLoading(false);
      return;
    }
    if (lookupFetchInFlightRef.current && !force) {
      return;
    }

    lookupFetchInFlightRef.current = true;
    try {
      setLoading(true);
      const res = await api.get('/lookup/page-bundle', { signal });
      const d = res.data || {};
      const campusData = Array.isArray(d.campus) ? d.campus : [];
      const requisites = Array.isArray(d.requisites) ? d.requisites : [];
      const prerequisites = requisites.filter(
        (r) => (r.requisite_type || r.type || '').toString().toLowerCase() === 'prerequisite'
      );
      const corequisites = requisites.filter(
        (r) => (r.requisite_type || r.type || '').toString().toLowerCase() === 'corequisite'
      );

      let curriculumRows = Array.isArray(d.curriculums) ? d.curriculums : [];
      if (curriculumRows.length === 0) {
        try {
          const curriculumRes = await api.get('/curriculum', { signal });
          curriculumRows = Array.isArray(curriculumRes.data)
            ? curriculumRes.data
            : Array.isArray(curriculumRes.data?.data)
              ? curriculumRes.data.data
              : [];
        } catch (curriculumError) {
          console.warn('Unable to load curriculum rows for bulk requisites:', curriculumError);
        }
      }

      const normalized = {
        programs: sortLookupNewestFirst('programs', Array.isArray(d.programs) ? d.programs : []),
        subjects: sortLookupNewestFirst('subjects', Array.isArray(d.subjects) ? d.subjects : []),
        yearLevels: sortYearLevelsNatural(Array.isArray(d.yearLevels) ? d.yearLevels : []),
        semesters: sortLookupNewestFirst('semesters', Array.isArray(d.semesters) ? d.semesters : []),
        requisites: sortLookupNewestFirst('requisites', requisites),
        prerequisites: sortLookupNewestFirst('requisites', prerequisites),
        corequisites: sortLookupNewestFirst('requisites', corequisites),
        roles: sortLookupNewestFirst('roles', Array.isArray(d.roles) ? d.roles : []),
        campus: sortLookupNewestFirst('campus', campusData),
        campuses: sortLookupNewestFirst('campus', campusData),
        departments: sortLookupNewestFirst(
          'departments',
          Array.isArray(d.departments) ? d.departments : [],
        ),
        academicYears: sortLookupNewestFirst(
          'academicYears',
          Array.isArray(d.academicYears) ? d.academicYears : [],
        ),
        tracks: sortLookupNewestFirst('tracks', Array.isArray(d.tracks) ? d.tracks : []),
        curriculumHeaders: sortLookupNewestFirst(
          'curriculumHeaders',
          Array.isArray(d.curriculumHeaders) ? d.curriculumHeaders : [],
        ),
        curriculums: curriculumRows,
        offeredSubjects: sortLookupNewestFirst(
          'offeredSubjects',
          Array.isArray(d.offeredSubjects) ? d.offeredSubjects : [],
        ),
        electiveSubjects: sortLookupNewestFirst(
          'electiveSubjects',
          Array.isArray(d.electiveSubjects) ? d.electiveSubjects : [],
        ),
        electiveSlots: sortLookupNewestFirst(
          'electiveSlots',
          Array.isArray(d.electiveSlots) ? d.electiveSlots : [],
        ),
      };

      setLookupData(normalized);
    } catch (error) {
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        return;
      }
      console.error('Error fetching lookup data:', error);
      setError('Failed to fetch lookup data');
    } finally {
      lookupFetchInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleAdd = () => {
    if (!canMutateCurrentPanel) return;
    isSubmittingRef.current = false;
    isAddingBulkSubjectsRef.current = false;
    setIsSubmitting(false);
    setIsAddingBulkSubjects(false);
    setEditingItem(null);
    setFormData(getDefaultFormData(activeTab));
    setShowModal(true);
  };

  const handleEdit = (item) => {
    if (!canMutateCurrentPanel) return;
    isSubmittingRef.current = false;
    isAddingBulkSubjectsRef.current = false;
    setIsSubmitting(false);
    setIsAddingBulkSubjects(false);
    setEditingItem(item);
    const nextFormData = getFormDataFromItem(activeTab, item);
    if (activeTab === 'curriculumHeaders') {
      nextFormData.Effective_Year = formatCurriculumYearRange(nextFormData.Effective_Year);
    }
    setFormData(nextFormData);
    setShowModal(true);
  };

  const handleToggleLookupStatus = async (section, item) => {
    if (!canMutateCurrentPanel) return;
    const apiPath = LOOKUP_STATUS_API_PATH[section];
    const id = getLookupRecordId(section, item);
    if (!apiPath || id == null || id === '') {
      await swalError('Status update failed', 'Could not resolve this record’s id. Refresh and try again.');
      return;
    }
    const currentActive = lookupItemIsActive(item);
    const nextStatus = currentActive ? 'inactive' : 'active';
    const actionLabel = nextStatus === 'active' ? 'Activate' : 'Deactivate';
    const ok = await swalConfirm({
      title: `${actionLabel} item?`,
      text:
        section === 'semesters' && nextStatus === 'active'
          ? 'This semester will become the only active term. Regular students who fully passed their current standing will be auto-evaluated and auto-promoted into this semester. Irregulars stay for manual evaluation.'
          : section === 'academicYears' && nextStatus === 'active'
            ? 'This becomes the current school year (used by Offered subjects and new grades). All other academic years will be set to inactive.'
            : nextStatus === 'active'
            ? 'This record will be marked active and available for use.'
            : 'This record will be deactivated. Linked data stays — you just hide it from normal use.',
      confirmButtonText: actionLabel,
    });
    if (!ok) return;
    try {
      const res = await api.patch(`/lookup/${apiPath}/${id}/status`, { status: nextStatus });
      fetchLookupData({ force: true });
      const msg =
        res?.data?.message ||
        (section === 'semesters' && nextStatus === 'active' && res?.data?.auto_promotion
          ? `Activated. Auto-promoted ${res.data.auto_promotion.promoted ?? 0} regular student(s).`
          : null);
      swalToast('success', msg || `${actionLabel}d`);
    } catch (error) {
      const data = error.response?.data;
      const errorMessage = data?.message || data?.error || `Failed to ${actionLabel.toLowerCase()}`;
      setError(errorMessage);
      await swalError('Status update failed', errorMessage);
    }
  };

  const handleDelete = async (id) => {
    if (!canMutateCurrentPanel) return;
    if (id === null || id === undefined || String(id).trim() === '' || String(id) === 'undefined') {
      await swalError(
        'Delete failed',
        'Could not resolve this record’s id. Refresh the page and try again.'
      );
      return;
    }
    const tabTitle = formatTabTitle(activeTab).toLowerCase();
    const ok = await swalConfirm({
      title: 'Delete item?',
      text: `Are you sure you want to delete this ${tabTitle}? If it is linked to other records, deletion will be blocked.`,
      confirmButtonText: 'Delete',
    });
    if (!ok) return;

    try {
      // Determine the correct API endpoint and prefix for each tab
      let apiEndpoint = activeTab;
      let prefix = '';

      // Tabs backed by the lookup controller live under /lookup
      const lookupTabs = ['programs', 'subjects', 'campus', 'departments', 'roles', 'yearLevels', 'semesters', 'requisites', 'academicYears', 'tracks', 'curriculumHeaders', 'offeredSubjects', 'electiveSubjects'];
      if (lookupTabs.includes(activeTab)) {
        prefix = 'lookup';
      }

      // Handle special path name cases
      if (activeTab === 'yearLevels') {
        apiEndpoint = 'year-levels';
      } else if (activeTab === 'academicYears') {
        apiEndpoint = 'academic-years';
      } else if (activeTab === 'curriculumHeaders') {
        apiEndpoint = 'curriculum-headers';
      } else if (activeTab === 'offeredSubjects') {
        apiEndpoint = 'offered-subjects';
      } else if (activeTab === 'electiveSubjects') {
        apiEndpoint = 'elective-subjects';
      }

      const url = `/${prefix ? prefix + '/' : ''}${apiEndpoint}/${id}`;
      await api.delete(url);
      fetchLookupData({ force: true });
      swalToast('success', 'Item deleted');
    } catch (error) {
      const data = error.response?.data;
      const messages = data?.messages || data?.errors;
      const validationText = messages
        ? Object.values(messages)
            .flat()
            .filter(Boolean)
            .join(' ')
        : '';
      const msg =
        validationText ||
        data?.message ||
        data?.error ||
        `Failed to delete ${formatTabTitle(activeTab).toLowerCase()}`;
      setError(msg);
      const title =
        error.response?.status === 409 || /^cannot delete/i.test(String(msg))
          ? 'Cannot delete'
          : 'Delete failed';
      await swalError(title, msg);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canMutateCurrentPanel) return;
    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setError('');

    try {
      const unsafeMsg = findUnsafeFormField(formData, {
        skipKeys: [
          'status',
          'requisite_type',
          'required_subjects',
          'corequisite_subjects',
          'bulk_requisite_group',
          'bulk_requisite_text',
        ],
        labelMap: {
          subject_code: 'Subject code',
          subject_name: 'Subject name',
          program_name: 'Program name',
          program_code: 'Program code',
          department_name: 'Department name',
          department_code: 'Department code',
          campus_name: 'Campus name',
          year_level: 'Year level',
          semester_name: 'Semester name',
          description: 'Description',
          slot_name: 'Slot name',
          track_name: 'Track name',
          track_code: 'Track code',
        },
      });
      if (unsafeMsg) {
        setError(unsafeMsg);
        await swalError('Invalid input', unsafeMsg);
        return;
      }

      // Special handling for requisites with multiple required subjects
      if (activeTab === 'requisites') {
        const isPrerequisiteMode = formData.requisite_type === 'prerequisite';
        const hasBulkText = isPrerequisiteMode ? String(formData.bulk_requisite_text || '').trim() : '';
        const parsedText = isPrerequisiteMode ? parsedBulkRequisiteText() : null;

        if (isPrerequisiteMode && hasBulkText && !parsedText && !isProfessionalBulkRequisiteText() && !isAllSubjectsBeforeTargetRule()) {
          setError('Use a saved rule, a year standing rule, or a range like: all subjects from 1st year to 4th year 1st semester.');
          return;
        }

        const shouldApplyBulkRule = isPrerequisiteMode && canTryBulkRequisite();
        let bulkSubjectIds = [];
        if (shouldApplyBulkRule) {
          try {
            bulkSubjectIds = await getBulkRequisiteSubjectIdsAsync();
          } catch (bulkError) {
            setError('Unable to load curriculum subjects for that range. Please try again.');
            return;
          }
        }

        const requiredSubjects = shouldApplyBulkRule
          ? bulkSubjectIds
          : (formData.required_subjects || []);
        const filteredRequiredSubjects = requiredSubjects.filter(id => id && id !== '');
        const uniqueRequiredSubjects = Array.from(
          new Set(filteredRequiredSubjects.map((id) => Number(id))),
        );
        const uniqueCorequisiteSubjects = Array.from(
          new Set(
            (isPrerequisiteMode ? formData.corequisite_subjects || [] : [])
              .filter((id) => id && id !== '')
              .map((id) => Number(id)),
          ),
        );

        if (!formData.subject_id || !formData.requisite_type) {
          setError('Subject and Requisite Type are required');
          return;
        }

        if (uniqueRequiredSubjects.length === 0 && uniqueCorequisiteSubjects.length === 0) {
          if (editingItem && !shouldApplyBulkRule && !hasBulkText) {
            const ok = await swalConfirm({
              title: 'Remove requisites?',
              text: 'This will remove all subjects for the selected requisite type.',
              confirmButtonText: 'Remove',
            });
            if (!ok) return;
          } else {
            const hasBulkProgram = formData.bulk_requisite_group?.program_id;
            setError(
              hasBulkText
                ? hasBulkProgram
                  ? 'No subjects were found for that program and rule. Check the program, subject, and prerequisite text.'
                : 'Select a subject and program, then choose a saved rule or a year/range rule.'
                : formData.requisite_type === 'corequisite'
                  ? 'At least one co-requisite subject is needed'
                  : 'At least one prerequisite or co-requisite subject is needed',
            );
            await swalError(
              'Cannot save requisite',
              hasBulkText
                ? hasBulkProgram
                  ? 'No subjects were found for that program and rule. Check the program, subject, and prerequisite text.'
                  : 'Select a subject and program, then choose a saved rule or a year/range rule.'
                : formData.requisite_type === 'corequisite'
                  ? 'At least one co-requisite subject is needed'
                  : 'At least one prerequisite or co-requisite subject is needed',
            );
            return;
          }
        }

        const base = '/lookup/requisites';

        if (uniqueRequiredSubjects.length > 0 || editingItem || formData.requisite_type === 'corequisite') {
          await syncRequisitesForSubject({
            base,
            subjectId: formData.subject_id,
            requisiteType: formData.requisite_type,
            requiredSubjectIds: uniqueRequiredSubjects,
            ruleLabel: shouldApplyBulkRule ? hasBulkText : null,
          });
        }

        if (isPrerequisiteMode && (uniqueCorequisiteSubjects.length > 0 || editingItem)) {
          await syncRequisitesForSubject({
            base,
            subjectId: formData.subject_id,
            requisiteType: 'corequisite',
            requiredSubjectIds: uniqueCorequisiteSubjects,
            ruleLabel: null,
          });
        }

        setShowModal(false);
        fetchLookupData({ force: true });
        swalToast('success', 'Requisites saved');
        return;
      }

      if (activeTab === 'subjects') {
        const codeNorm = String(formData.subject_code || '').trim().toLowerCase();
        if (!codeNorm) {
          setError('Subject code is required');
          return;
        }
        const currentId = editingItem
          ? String(editingItem.subject_id ?? editingItem.id ?? '')
          : '';
        const duplicate = (lookupData.subjects || []).find((s) => {
          const sameCode = String(s.subject_code || '').trim().toLowerCase() === codeNorm;
          if (!sameCode) return false;
          if (!editingItem) return true;
          return String(s.subject_id) !== currentId;
        });
        if (duplicate) {
          const msg = `A subject with code "${duplicate.subject_code}" already exists.`;
          setError(msg);
          await swalError('Duplicate subject code', msg);
          return;
        }
      }

      // Determine the correct API endpoint and prefix for each tab
      let apiEndpoint = activeTab;
      let prefix = '';
      let itemId = getLookupRecordId(activeTab, editingItem);

      // Tabs backed by the lookup controller live under /lookup
      const lookupTabs = ['programs', 'subjects', 'campus', 'departments', 'roles', 'yearLevels', 'semesters', 'requisites', 'academicYears', 'tracks', 'curriculumHeaders', 'offeredSubjects', 'electiveSubjects'];
      if (lookupTabs.includes(activeTab)) {
        prefix = 'lookup';
      }

      // Handle special path name cases
      if (activeTab === 'yearLevels') {
        apiEndpoint = 'year-levels';
      } else if (activeTab === 'campus') {
        apiEndpoint = 'campus';
      } else if (activeTab === 'academicYears') {
        apiEndpoint = 'academic-years';
      } else if (activeTab === 'curriculumHeaders') {
        apiEndpoint = 'curriculum-headers';
      } else if (activeTab === 'offeredSubjects') {
        apiEndpoint = 'offered-subjects';
      } else if (activeTab === 'electiveSubjects') {
        apiEndpoint = 'elective-subjects';
      }

      const payload = { ...formData };
      // Degree totals come from curriculum rows — never write total_units_required from this form.
      if (activeTab === 'programs') {
        delete payload.total_units_required;
      }
      // New lookup rows (except semester) always start Active — change later via Activate/Deactivate.
      if (
        !editingItem &&
        activeTab !== 'semesters' &&
        activeTab !== 'requisites' &&
        activeTab !== 'academicYears'
      ) {
        if (Object.prototype.hasOwnProperty.call(LOOKUP_STATUS_API_PATH, activeTab)) {
          payload.status = 'active';
        }
      }
      if (activeTab === 'yearLevels') {
        const yearNum = parseLookupYearLevelNumber(payload.year_level);
        if (yearNum != null && yearNum > LOOKUP_MAX_COLLEGE_YEAR_LEVEL) {
          setError(
            `Year levels stop at ${LOOKUP_MAX_COLLEGE_YEAR_LEVEL}th Year (Architecture). For retakes after the last curriculum year, use Extended study containers on the evaluation screen — not new year levels.`,
          );
          return;
        }
      }
      if (activeTab === 'curriculumHeaders') {
        const startYear = parseCurriculumStartYear(payload.Effective_Year);
        if (!startYear || Number.isNaN(startYear)) {
          const msg = 'Enter an effective school year like 2023 or 2023-2024.';
          setError(msg);
          await swalError('Invalid effective year', msg);
          return;
        }
        payload.Effective_Year = startYear;
        if (payload.academic_year_id === '' || payload.academic_year_id == null) {
          const msg = 'Select the Academic Year bound to this curriculum.';
          setError(msg);
          await swalError('Academic Year required', msg);
          return;
        }
        payload.academic_year_id = Number(payload.academic_year_id);
      }
      if (activeTab === 'offeredSubjects' && !shouldShowOfferedSubjectTrack(payload)) {
        payload.track_id = null;
      }
      if (activeTab === 'offeredSubjects') {
        payload.academic_year_id = currentAcademicYear
          ? Number(currentAcademicYear.academic_year_id ?? currentAcademicYear.id)
          : null;
      }

      const base = `/${prefix ? prefix + '/' : ''}${apiEndpoint}`;

      let saveRes;
      if (editingItem && itemId) {
        saveRes = await api.put(`${base}/${itemId}`, payload);
      } else {
        saveRes = await api.post(base, payload);
      }

      setShowModal(false);
      clearLookupFormDraft();
      fetchLookupData({ force: true });
      const saveMsg =
        activeTab === 'semesters' && saveRes?.data?.message
          ? saveRes.data.message
          : editingItem
            ? 'Updated'
            : 'Created';
      swalToast('success', saveMsg);
    } catch (error) {
      const data = error.response?.data;
      const messages = data?.messages || data?.errors;
      const validationText = messages
        ? Object.values(messages)
            .flat()
            .filter(Boolean)
            .join(' ')
        : '';
      const msg =
        validationText ||
        data?.message ||
        data?.error ||
        (error.isAxiosNetworkError || !error.response
          ? 'Network interrupted — your form inputs were kept. Reconnect and save again.'
          : null) ||
        `Failed to ${editingItem ? 'update' : 'create'} ${formatTabTitle(activeTab).toLowerCase()}`;
      setError(msg);
      await swalError('Save failed', msg);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const getDefaultFormData = (section) => {
    const defaults = {
      programs: { department_id: '', program_code: '', program_name: '' },
      departments: { campus_id: '', department_name: '', department_code: '' },
      subjects: { subject_code: '', subject_name: '', number_of_units: 3, number_of_hrs: 3 },
      yearLevels: { year_level: '' },
      semesters: { semester_name: '', status: '' },
      roles: { role_name: '', description: '', access_level: '' },
      campus: { campus_name: '' },
      academicYears: { name: '', status: 'inactive' },
      requisites: {
        requisite_type: '',
        subject_id: '',
        required_subjects: [],
        corequisite_subjects: [],
        bulk_requisite_text: '',
        bulk_requisite_group: { program_id: '', from_year_level: '', to_year_level: '' },
      },
      tracks: { track_code: '', track_name: '' },
      curriculumHeaders: { program_id: '', Effective_Year: '', academic_year_id: '', description: '' },
      offeredSubjects: { subject_id: '', academic_year_id: '', semester_id: '', program_id: '', track_id: '', year_level_id: '', status: 'active' },
      electiveSubjects: { department_id: '', program_id: '', track_id: '', subject_id: '', elective_slot_id: '', description: '' },
    };
    return defaults[section] || {};
  };

  const getFormDataFromItem = (section, item) => {
    if (section === 'programs') {
      return {
        department_id: item.department_id ?? '',
        program_code: item.program_code ?? '',
        program_name: item.program_name ?? '',
      };
    }

    if (section === 'departments') {
      return {
        campus_id: item.campus_id ?? '',
        department_name: item.department_name ?? '',
        department_code: item.department_code ?? '',
      };
    }

    if (section === 'semesters') {
      return {
        semester_name: item.semester_name ?? '',
        status: item.status ?? '',
      };
    }

    if (section === 'academicYears') {
      return {
        name: item.name ?? item.academic_year_name ?? '',
        status: item.status ?? '',
      };
    }

    if (section === 'requisites') {
      // Editing a requisite should edit the whole set for this subject/type.
      const itemType = String(item.requisite_type || '').toLowerCase();
      const subjectId = item.subject_id ?? requisiteSubjectIdForItem(item) ?? '';
      const requiredSubjectId = item.requisites_subject_id ?? item.required_subject_id ?? '';
      const requiredSubjectIds = getExistingRequisitesForTarget(
        subjectId,
        itemType,
      )
        .map(requisiteRequiredSubjectIdForItem)
        .filter(Boolean);
      const prerequisiteSubjectIds = getExistingRequisitesForTarget(subjectId, 'prerequisite')
        .map(requisiteRequiredSubjectIdForItem)
        .filter(Boolean);
      const corequisiteSubjectIds = getExistingRequisitesForTarget(subjectId, 'corequisite')
        .map(requisiteRequiredSubjectIdForItem)
        .filter(Boolean);
      return {
        requisite_type: itemType,
        subject_id: subjectId,
        required_subjects: (itemType === 'prerequisite' ? prerequisiteSubjectIds : requiredSubjectIds).length > 0
          ? Array.from(new Set((itemType === 'prerequisite' ? prerequisiteSubjectIds : requiredSubjectIds).map((id) => Number(id))))
          : requiredSubjectId
            ? [requiredSubjectId]
            : [],
        corequisite_subjects: itemType === 'prerequisite'
          ? Array.from(new Set(corequisiteSubjectIds.map((id) => Number(id))))
          : [],
        bulk_requisite_text: itemType === 'prerequisite' ? item.rule_label || '' : '',
        bulk_requisite_group: { program_id: '', from_year_level: '', to_year_level: '' },
      };
    }

    if (section === 'electiveSubjects') {
      const programId = item.program?.program_id ?? item.program_id ?? '';
      const program = (lookupData.programs || []).find(
        (p) => String(p.program_id) === String(programId),
      );

      return {
        department_id: item.department?.department_id ?? item.department_id ?? departmentIdForProgram(program) ?? '',
        program_id: programId,
        track_id: item.track?.track_id ?? item.track_id ?? '',
        subject_id: item.subject?.subject_id ?? item.subject_id ?? '',
        elective_slot_id: item.electiveSlot?.elective_slot_id ?? item.elective_slot_id ?? '',
        description: item.description ?? '',
      };
    }

    return { ...item };
  };

  // Helper to correctly format the tab title (e.g., "departments" -> "Department")
  const formatTabTitle = (tab) => {
    if (tab === 'requisites') return 'Requisite';
    if (tab === 'programs') return 'Program';
    if (tab === 'academicYears') return 'Academic Year';
    if (tab === 'roles') return 'Role';
    if (tab === 'campus') return 'Campus';
    if (tab === 'curriculumHeaders') return 'Curriculum Header';
    if (tab === 'offeredSubjects') return 'Offered Subject';
    if (tab === 'electiveSubjects') return 'Elective Subject';
    if (tab === 'tracks') return 'Track';
    const singular = tab.slice(0, -1); // Remove trailing 's'
    return singular.charAt(0).toUpperCase() + singular.slice(1);
  };

  const subjectLabelById = (subjectId) => {
    const subject = (lookupData.subjects || []).find(
      (s) => String(s.subject_id) === String(subjectId),
    );
    return subject ? `${subject.subject_code} - ${subject.subject_name}` : `Subject #${subjectId}`;
  };

  const departmentIdForProgram = (program) =>
    program?.department?.department_id ?? program?.department_id ?? '';

  const programLabel = (program) =>
    `${program.program_code || 'Program'} - ${program.program_name || ''}`.trim();

  const departmentLabel = (department) =>
    `${department.department_name || 'Department'}${department.department_code ? ` (${department.department_code})` : ''}`;

  const isInformationTechnologyProgram = (program) => {
    if (!program) return false;
    const code = String(program.program_code || '').toLowerCase();
    const name = String(program.program_name || '').toLowerCase();
    return code.includes('it') || name.includes('information technology');
  };

  const requisiteSubjectIdForItem = (item) => item?.subject?.subject_id || item?.subject_id;

  const requisiteRequiredSubjectIdForItem = (item) =>
    item?.requiredSubject?.subject_id || item?.requisites_subject_id || item?.required_subject_id;

  const getExistingRequisitesForTarget = (subjectId, requisiteType) =>
    (lookupData.requisites || []).filter(
      (item) =>
        String(requisiteSubjectIdForItem(item)) === String(subjectId) &&
        String(item.requisite_type) === String(requisiteType),
    );

  const syncRequisitesForSubject = async ({
    base,
    subjectId,
    requisiteType,
    requiredSubjectIds,
    ruleLabel = null,
  }) => {
    const targetRequiredIds = Array.from(
      new Set(requiredSubjectIds.map((id) => Number(id)).filter(Boolean)),
    );

    await api.post(`${base}/sync`, {
      subject_id: subjectId,
      requisite_type: requisiteType,
      required_subject_ids: targetRequiredIds,
      rule_label: ruleLabel,
    });
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
    const match = (lookupData.yearLevels || []).find(
      (year) => parseYearNumber(year.year_level) === yearNumber,
    );
    return match?.year_level_id || yearNumber;
  };

  const isItProgramId = (programId) => {
    const selectedProgram = (lookupData.programs || []).find(
      (program) => String(program.program_id) === String(programId),
    );
    const programCode = String(selectedProgram?.program_code || '').trim().toUpperCase();
    return programCode === 'BSIT' || programCode === 'IT';
  };

  const isThirdYearLevelId = (yearLevelId) => {
    const selectedYearLevel = (lookupData.yearLevels || []).find(
      (yearLevel) => String(yearLevel.year_level_id) === String(yearLevelId),
    );
    return parseYearNumber(selectedYearLevel?.year_level || yearLevelId) === 3;
  };

  const shouldShowOfferedSubjectTrack = (data = formData) =>
    isItProgramId(data.program_id) && isThirdYearLevelId(data.year_level_id);

  const parsedBulkRequisiteText = () => {
    const text = String(formData.bulk_requisite_text || '').trim();
    if (!text) return null;

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

  const resolvedBulkRequisiteGroup = () => {
    const group = formData.bulk_requisite_group || {};
    const parsedText = parsedBulkRequisiteText();

    return {
      ...group,
      ...(parsedText || {}),
    };
  };

  const normalizeCurriculumYearLevelId = (row) => {
    const yearValue = row?.year_level ?? row?.year_level_id;
    if (row?.year_level && typeof row.year_level === 'object') {
      return Number(row.year_level.year_level_id ?? parseYearNumber(row.year_level.year_level));
    }
    if (row?.yearLevel && typeof row.yearLevel === 'object') {
      return Number(row.yearLevel.year_level_id ?? parseYearNumber(row.yearLevel.year_level));
    }

    const numericYear = Number(yearValue);
    return Number.isNaN(numericYear) ? parseYearNumber(yearValue) : numericYear;
  };

  const curriculumTermOrder = (row) => {
    const rowYear = normalizeCurriculumYearLevelId(row);
    const semesterId = Number(row?.semester_id ?? row?.semester?.semester_id);
    if (!Number.isFinite(rowYear) || !Number.isFinite(semesterId)) return null;

    // Summer is stored as semester_id 3, but appears before regular semesters in these curricula.
    const semesterOrder = semesterId === 3 ? 0 : semesterId;
    return rowYear * 10 + semesterOrder;
  };

  const isProfessionalCurriculumSubject = (row) => {
    if (!row || row.elective_slot_id) return false;
    const type = String(row.subject_type || '').trim().toLowerCase();
    if (type === 'core' || type === 'major') return true;

    const subjectCode = String(row.subject?.subject_code || '').trim().toUpperCase();
    return /^(NUR|HES|BIO|MLS)\s*\d+/.test(subjectCode);
  };

  const rowSubjectCode = (row) =>
    String(row?.subject?.subject_code || row?.subject_code || '').replace(/\s+/g, '').toUpperCase();

  const exceptSubjectCodesFromRule = () => {
    const text = String(formData.bulk_requisite_text || '').trim();
    const match = text.match(/\bexcept\b(.+)$/i);
    if (!match) return new Set();

    return new Set(
      match[1]
        .split(/,|\band\b/i)
        .map((code) => code.replace(/[^a-z0-9]/gi, '').toUpperCase())
        .filter(Boolean),
    );
  };

  const isProfessionalBulkRequisiteText = () =>
    /^(all\s+(professional|major|core|board)\s+subjects?|all\s+professional\s+education\s+subjects?|all\s+professional\s+and\s+major\s+(specialization\s+)?subjects?|100%\s+professional\s+units|all\s+.*\bmajor\b.*\bsubjects?\b.*)$/i.test(
      String(formData.bulk_requisite_text || '').trim(),
    );

  const isAllSubjectsBeforeTargetRule = () =>
    /^(all\s+subjects?|all\s+general\s+education,\s*professional\s+education,\s*and\s+specialization\s+subjects?)$/i.test(
      String(formData.bulk_requisite_text || '').trim(),
    );

  const getProfessionalRequisiteSubjectIdsFromRows = (curriculumRows) => {
    const group = resolvedBulkRequisiteGroup();
    const programId = group.program_id ? String(group.program_id) : '';
    const subjectId = formData.subject_id ? String(formData.subject_id) : '';

    if (!programId || !subjectId) return [];

    const rowsForProgram = (curriculumRows || []).filter(
      (row) => String(row.program_id) === programId,
    );
    const targetRow = rowsForProgram.find((row) => String(row.subject_id) === subjectId);
    const targetOrder = targetRow ? curriculumTermOrder(targetRow) : null;

    const exceptCodes = exceptSubjectCodesFromRule();

    return Array.from(
      new Set(
        rowsForProgram
          .filter((row) => String(row.subject_id) !== subjectId)
          .filter(isProfessionalCurriculumSubject)
          .filter((row) => !exceptCodes.has(rowSubjectCode(row)))
          .filter((row) => {
            if (targetOrder == null) return true;
            const rowOrder = curriculumTermOrder(row);
            return rowOrder != null && rowOrder < targetOrder;
          })
          .map((row) => row.subject_id)
          .filter(Boolean)
          .map((subjectIdValue) => Number(subjectIdValue)),
      ),
    );
  };

  const getBulkRequisiteSubjectIdsFromRows = (curriculumRows) => {
    if (isProfessionalBulkRequisiteText()) {
      return getProfessionalRequisiteSubjectIdsFromRows(curriculumRows);
    }

    const group = resolvedBulkRequisiteGroup();
    const programId = group.program_id ? String(group.program_id) : '';
    const subjectId = formData.subject_id ? String(formData.subject_id) : '';
    const fromYear = group.from_year_level ? Number(group.from_year_level) : null;
    const toYear = group.to_year_level ? Number(group.to_year_level) : null;
    const toSemester = group.to_semester_id ? Number(group.to_semester_id) : null;

    if (isAllSubjectsBeforeTargetRule()) {
      if (!programId || !subjectId) return [];
      const rowsForProgram = (curriculumRows || []).filter(
        (row) => String(row.program_id) === programId,
      );
      const targetRow = rowsForProgram.find((row) => String(row.subject_id) === subjectId);
      const targetOrder = targetRow ? curriculumTermOrder(targetRow) : null;

      return Array.from(
        new Set(
          rowsForProgram
            .filter((row) => String(row.subject_id) !== subjectId)
            .filter((row) => {
              if (targetOrder == null) return true;
              const rowOrder = curriculumTermOrder(row);
              return rowOrder != null && rowOrder < targetOrder;
            })
            .map((row) => row.subject_id)
            .filter(Boolean)
            .map((subjectIdValue) => Number(subjectIdValue)),
        ),
      );
    }

    if (!programId || !fromYear || !toYear) return [];

    const minYear = Math.min(fromYear, toYear);
    const maxYear = Math.max(fromYear, toYear);
    const maxSemesterOrder = toSemester === 3 ? 0 : toSemester;

    return Array.from(
      new Set(
        (curriculumRows || [])
          .filter((row) => String(row.program_id) === programId)
          .filter((row) => {
            const rowYear = normalizeCurriculumYearLevelId(row);
            const rowSemester = Number(row?.semester_id ?? row?.semester?.semester_id);
            if (toSemester && rowYear === maxYear) {
              const rowSemesterOrder = rowSemester === 3 ? 0 : rowSemester;
              return rowYear >= minYear && rowYear <= maxYear && rowSemesterOrder <= maxSemesterOrder;
            }
            return rowYear >= minYear && rowYear <= maxYear;
          })
          .map((row) => row.subject_id)
          .filter(Boolean)
          .filter((subjectId) => String(subjectId) !== String(formData.subject_id || '')),
      ),
    );
  };

  const getBulkRequisiteSubjectIds = () => getBulkRequisiteSubjectIdsFromRows(lookupData.curriculums || []);

  const fetchCurriculumRowsForBulk = async () => {
    if (Array.isArray(lookupData.curriculums) && lookupData.curriculums.length > 0) {
      return lookupData.curriculums;
    }

    const curriculumRes = await api.get('/curriculum');
    const rows = Array.isArray(curriculumRes.data)
      ? curriculumRes.data
      : Array.isArray(curriculumRes.data?.data)
        ? curriculumRes.data.data
        : [];
    setLookupData((prev) => ({ ...prev, curriculums: rows }));
    return rows;
  };

  const getBulkRequisiteSubjectIdsAsync = async () => {
    const existingIds = getBulkRequisiteSubjectIds();
    if (existingIds.length > 0) return existingIds;

    const rows = await fetchCurriculumRowsForBulk();
    return getBulkRequisiteSubjectIdsFromRows(rows);
  };

  const canTryBulkRequisite = () => {
    const group = resolvedBulkRequisiteGroup();
    if (isProfessionalBulkRequisiteText() || isAllSubjectsBeforeTargetRule()) {
      return Boolean(group.program_id && formData.subject_id);
    }
    return Boolean(group.program_id && group.from_year_level && group.to_year_level);
  };

  const addBulkRequisiteSubjects = async () => {
    if (isAddingBulkSubjectsRef.current) {
      return;
    }

    isAddingBulkSubjectsRef.current = true;
    setIsAddingBulkSubjects(true);

    try {
      const text = String(formData.bulk_requisite_text || '').trim();
      const parsedText = parsedBulkRequisiteText();
      if (text && !parsedText && !isProfessionalBulkRequisiteText() && !isAllSubjectsBeforeTargetRule()) {
        const msg =
          'Use a saved rule, a year standing rule, or a range like: all subjects from 1st year to 4th year 1st semester.';
        setError(msg);
        await swalError('Cannot fill prerequisites', msg);
        return;
      }

      if (!canTryBulkRequisite()) {
        const msg = 'Select a subject and program, then choose a saved rule or a year/range rule.';
        setError(msg);
        await swalError('Cannot fill prerequisites', msg);
        return;
      }

      let bulkIds = [];
      try {
        bulkIds = await getBulkRequisiteSubjectIdsAsync();
      } catch (bulkError) {
        console.error('Unable to load curriculum rows for bulk requisites:', bulkError);
        const msg = 'Unable to load curriculum subjects for that range. Please try again.';
        setError(msg);
        await swalError('Cannot fill prerequisites', msg);
        return;
      }
      if (bulkIds.length === 0) {
        const msg =
          'No subjects were found for that program and rule. Check that the program has curriculum rows, and that the subject/rule match.';
        setError(msg);
        await swalError('Cannot fill prerequisites', msg);
        return;
      }

      const rangeIds = Array.from(
        new Set(bulkIds.map((id) => Number(id))),
      ).filter((id) => String(id) !== String(formData.subject_id || ''));

      setFormData({
        ...formData,
        bulk_requisite_group: {
          ...(formData.bulk_requisite_group || {}),
          ...(parsedText || {}),
        },
        required_subjects: rangeIds,
      });
    } finally {
      isAddingBulkSubjectsRef.current = false;
      setIsAddingBulkSubjects(false);
    }
  };

  const renderForm = () => {
    const selectedElectiveProgram = (lookupData.programs || []).find(
      (program) => String(program.program_id) === String(formData.program_id || ''),
    );
    const selectedElectiveDepartmentId = formData.department_id
      ? String(formData.department_id)
      : '';
    const electiveProgramOptions = (lookupData.programs || [])
      .filter((program) => {
        if (!selectedElectiveDepartmentId) return false;
        return String(departmentIdForProgram(program) || '') === selectedElectiveDepartmentId;
      })
      .map((program) => ({
        value: String(program.program_id),
        label: programLabel(program),
      }));
    const selectedElectiveProgramId = formData.program_id ? String(formData.program_id) : '';
    const shouldShowElectiveTrack = isInformationTechnologyProgram(selectedElectiveProgram);

    /** Subject ids allowed in the Elective subjects form (IT track electives, not only fixed curriculum rows). */
    const electiveAllowedSubjectIds = new Set();
    const addElectiveAllowedId = (rawId) => {
      if (rawId == null || rawId === '') return;
      electiveAllowedSubjectIds.add(String(rawId));
    };

    (lookupData.curriculums || []).forEach((row) => {
      if (String(row.program_id ?? row.program?.program_id ?? '') !== selectedElectiveProgramId) return;
      addElectiveAllowedId(row.subject_id ?? row.subject?.subject_id);
    });

    (lookupData.electiveSubjects || []).forEach((es) => {
      const programId = String(es.program_id ?? es.program?.program_id ?? '');
      if (programId !== selectedElectiveProgramId) return;
      addElectiveAllowedId(es.subject_id ?? es.subject?.subject_id);
    });

    (lookupData.electiveSlots || []).forEach((slot) => {
      if (String(slot.program_id ?? slot.program?.program_id ?? '') !== selectedElectiveProgramId) return;
      (slot.electiveSubjects || slot.elective_subjects || []).forEach((es) => {
        addElectiveAllowedId(es.subject_id ?? es.subject?.subject_id);
      });
    });

    // IT: include electives already used on any IT program so Elective 4 can reuse
    // Advanced Programming / Network Security / Freehand / etc. from Electives 1–3.
    if (shouldShowElectiveTrack) {
      (lookupData.electiveSubjects || []).forEach((es) => {
        const program = (lookupData.programs || []).find(
          (p) => String(p.program_id) === String(es.program_id ?? es.program?.program_id ?? ''),
        );
        if (!isInformationTechnologyProgram(program || es.program)) return;
        addElectiveAllowedId(es.subject_id ?? es.subject?.subject_id);
      });
      (lookupData.electiveSlots || []).forEach((slot) => {
        const program = (lookupData.programs || []).find(
          (p) => String(p.program_id) === String(slot.program_id ?? slot.program?.program_id ?? ''),
        );
        if (!isInformationTechnologyProgram(program || slot.program)) return;
        (slot.electiveSubjects || slot.elective_subjects || []).forEach((es) => {
          addElectiveAllowedId(es.subject_id ?? es.subject?.subject_id);
        });
      });
    }

    addElectiveAllowedId(formData.subject_id);

    const electiveSubjectOptionMap = new Map();
    const pushElectiveSubjectOption = (subjectId, code, name) => {
      if (subjectId == null || subjectId === '') return;
      const id = String(subjectId);
      if (!electiveAllowedSubjectIds.has(id)) return;
      if (electiveSubjectOptionMap.has(id)) return;
      const codePart = String(code || '').trim();
      const namePart = String(name || '').trim();
      const label =
        codePart && namePart
          ? `${codePart} - ${namePart}`
          : codePart || namePart || `Subject #${id}`;
      electiveSubjectOptionMap.set(id, { value: id, label });
    };

    (lookupData.subjects || []).forEach((subject) => {
      pushElectiveSubjectOption(subject.subject_id, subject.subject_code, subject.subject_name);
    });
    (lookupData.electiveSubjects || []).forEach((es) => {
      pushElectiveSubjectOption(
        es.subject_id ?? es.subject?.subject_id,
        es.subject?.subject_code,
        es.subject?.subject_name,
      );
    });
    (lookupData.electiveSlots || []).forEach((slot) => {
      (slot.electiveSubjects || slot.elective_subjects || []).forEach((es) => {
        pushElectiveSubjectOption(
          es.subject_id ?? es.subject?.subject_id,
          es.subject?.subject_code,
          es.subject?.subject_name,
        );
      });
    });

    // IT + elective slot selected: if the elective pool is still empty, fall back to all subjects
    // (same as Curriculum → ElectiveSlots assign UI) so ITE 387 etc. can be found.
    if (
      shouldShowElectiveTrack &&
      selectedElectiveProgramId &&
      formData.elective_slot_id &&
      electiveSubjectOptionMap.size === 0
    ) {
      (lookupData.subjects || []).forEach((subject) => {
        const id = String(subject.subject_id);
        electiveSubjectOptionMap.set(id, {
          value: id,
          label: `${subject.subject_code} - ${subject.subject_name}`,
        });
      });
    }

    // IT with a slot: include known track-elective subjects from the subject catalog
    // (Advanced Programming, Network Security, Digi Arts electives, etc.).
    if (shouldShowElectiveTrack && selectedElectiveProgramId && formData.elective_slot_id) {
      (lookupData.subjects || []).forEach((subject) => {
        const code = String(subject.subject_code || '').toUpperCase().replace(/\s+/g, '');
        const name = String(subject.subject_name || '').toLowerCase();
        const looksLikeTrackElective =
          code.startsWith('BAM') ||
          name.includes('advanced programming') ||
          name.includes('game development') ||
          name.includes('cloud programming') ||
          name.includes('network security') ||
          name.includes('computer forensics') ||
          name.includes('ethical hacking') ||
          name.includes('business analysis for it') ||
          name.includes('applied analytics') ||
          name.includes('intelligent systems') ||
          name.includes('freehand') ||
          name.includes('scriptwriting') ||
          name.includes('story board') ||
          name.includes('3d animation') ||
          name.includes('clean-up') ||
          name.includes('cleanup') ||
          name.includes('in-between');
        if (!looksLikeTrackElective) return;
        const id = String(subject.subject_id);
        if (electiveSubjectOptionMap.has(id)) return;
        electiveSubjectOptionMap.set(id, {
          value: id,
          label: `${subject.subject_code} - ${subject.subject_name}`,
        });
      });
    }

    const electiveSubjectOptions = [...electiveSubjectOptionMap.values()].sort((a, b) =>
      String(a.label).localeCompare(String(b.label)),
    );
    const electiveSlotOptions = (lookupData.electiveSlots || [])
      .filter((slot) => {
        if (!selectedElectiveProgramId) return false;
        return String(slot.program_id ?? slot.program?.program_id ?? '') === selectedElectiveProgramId;
      })
      .map((slot) => {
        const year = slot.yearLevel?.year_level || slot.year_level || '';
        const sem = slot.semester?.semester_name || slot.semester_name || '';
        const name = slot.slot_name || `Slot #${slot.elective_slot_id}`;
        const meta = [year, sem].filter(Boolean).join(' · ');
        return {
          value: String(slot.elective_slot_id),
          label: meta ? `${name} (${meta})` : name,
        };
      });

    const formFields = {
      programs: (
        <>
          <div className="form-group">
            <label htmlFor="ldm-program-department">Department</label>
            <SearchableSelect
              id="ldm-program-department"
              value={formData.department_id === '' || formData.department_id == null ? '' : String(formData.department_id)}
              onChange={(v) =>
                setFormData({ ...formData, department_id: v ? parseInt(v, 10) : '' })
              }
              options={(lookupData.departments || []).map((dept) => ({
                value: String(dept.department_id),
                label: `${dept.department_name} (${dept.department_code})`,
              }))}
              emptyLabel="Select Department"
              placeholder="Search department…"
              required
              aria-label="Department"
            />
          </div>

          <div className="form-group">
            <label>Program Code</label>
            <input
              type="text"
              aria-label="Program code"
              value={formData.program_code || ''}
              onChange={(e) => setFormData({ ...formData, program_code: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Program Name</label>
            <input
              type="text"
              aria-label="Program name"
              value={formData.program_name || ''}
              onChange={(e) => setFormData({ ...formData, program_name: e.target.value })}
              required
            />
          </div>
        </>
      ),
      departments: (
        <>
          <div className="form-group">
            <label htmlFor="ldm-dept-campus">Campus</label>
            <SearchableSelect
              id="ldm-dept-campus"
              value={formData.campus_id === '' || formData.campus_id == null ? '' : String(formData.campus_id)}
              onChange={(v) =>
                setFormData({ ...formData, campus_id: v ? parseInt(v, 10) : '' })
              }
              options={(lookupData.campus || lookupData.campuses || []).map((campus) => ({
                value: String(campus.campus_id),
                label: campus.campus_name,
              }))}
              emptyLabel="Select Campus (Optional)"
              placeholder="Search campus…"
              aria-label="Campus (optional)"
            />
          </div>
          <div className="form-group">
            <label>Department Name</label>
            <input
              type="text"
              aria-label="Department name"
              value={formData.department_name || ''}
              onChange={(e) => setFormData({ ...formData, department_name: e.target.value })}
              placeholder="e.g., College of Engineering Architecture"
              required
            />
          </div>
          <div className="form-group">
            <label>Department Code</label>
            <input
              type="text"
              aria-label="Department code"
              value={formData.department_code || ''}
              onChange={(e) => setFormData({ ...formData, department_code: e.target.value })}
              placeholder="e.g., CEA"
              required
            />
          </div>
        </>
      ),
      subjects: (
        <>
          <div className="form-group">
            <label>Subject Code</label>
            <input
              type="text"
              aria-label="Subject code"
              value={formData.subject_code || ''}
              onChange={(e) => setFormData({ ...formData, subject_code: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Subject Name</label>
            <input
              type="text"
              aria-label="Subject name"
              value={formData.subject_name || ''}
              onChange={(e) => setFormData({ ...formData, subject_name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Units</label>
            <input
              type="number"
              aria-label="Subject units"
              min="1"
              max="10"
              value={formData.number_of_units ?? 3}
              onChange={(e) => setFormData({ ...formData, number_of_units: parseInt(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label>Hours</label>
            <input
              type="number"
              aria-label="Subject hours"
              min="1"
              max="100"
              value={formData.number_of_hrs ?? 3}
              onChange={(e) => setFormData({ ...formData, number_of_hrs: parseInt(e.target.value) })}
            />
          </div>
        </>
      ),
      yearLevels: (
        <>
          <div className="form-group">
            <label>Year Level</label>
            <input
              type="text"
              aria-label="Year level"
              value={formData.year_level || ''}
              onChange={(e) => setFormData({ ...formData, year_level: e.target.value })}
              placeholder="e.g., 1st Year, 2nd Year"
              required
            />
          </div>
        </>
      ),
      semesters: (
        <>
          <div className="form-group">
            <label>Semester Name</label>
            <input
              type="text"
              aria-label="Semester name"
              value={formData.semester_name || ''}
              onChange={(e) => setFormData({ ...formData, semester_name: e.target.value })}
              placeholder="e.g., First Semester, Second Semester"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="ldm-semester-status">Status</label>
            <SearchableSelect
              id="ldm-semester-status"
              value={formData.status || ''}
              onChange={(v) => setFormData({ ...formData, status: v })}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              emptyLabel="Select Status (Optional)"
              placeholder="Filter status…"
              aria-label="Semester status"
            />
          </div>
        </>
      ),
      campus: (
        <>
          <div className="form-group">
            <label>Campus Name</label>
            <input
              type="text"
              aria-label="Campus name"
              value={formData.campus_name || ''}
              onChange={(e) => setFormData({ ...formData, campus_name: e.target.value })}
              required
            />
          </div>
        </>
      ),
      roles: (
        <>
          <div className="form-group">
            <label>Role Name</label>
            <input
              type="text"
              aria-label="Role name"
              value={formData.role_name || ''}
              onChange={(e) => setFormData({ ...formData, role_name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Access Level</label>
            <input
              type="number"
              aria-label="Access level"
              value={formData.access_level || ''}
              onChange={(e) => setFormData({ ...formData, access_level: e.target.value ? parseInt(e.target.value) : '' })}
              placeholder="e.g., 10"
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              aria-label="Role description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
        </>
      ),
      academicYears: (
        <>
          <div className="form-group">
            <label>Academic Year Name</label>
            <input
              type="text"
              aria-label="Academic year name"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., 2024-2025"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="ldm-ay-status">Status</label>
            <SearchableSelect
              id="ldm-ay-status"
              value={editingItem ? (formData.status || 'inactive') : 'inactive'}
              onChange={(v) => setFormData({ ...formData, status: v })}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              emptyLabel="Inactive"
              placeholder="Status"
              aria-label="Academic year status"
              disabled
            />
            <small style={{ color: '#666', fontSize: '0.85rem', display: 'block', marginTop: '0.25rem' }}>
              Only one academic year is active — the current school year. Use{' '}
              <strong>Activate</strong> in the list to switch; the others become inactive.
            </small>
          </div>
        </>
      ),
      requisites: (
        <>
          <div className="form-group">
            <label htmlFor="ldm-req-type">Requisite Type</label>
            <SearchableSelect
              id="ldm-req-type"
              value={formData.requisite_type || ''}
              onChange={(v) =>
                setFormData({
                  ...formData,
                  requisite_type: v,
                  bulk_requisite_text: v === 'prerequisite' ? formData.bulk_requisite_text || '' : '',
                  bulk_requisite_group: v === 'prerequisite'
                    ? formData.bulk_requisite_group || { program_id: '', from_year_level: '', to_year_level: '' }
                    : { program_id: '', from_year_level: '', to_year_level: '' },
                })
              }
              options={[
                { value: 'prerequisite', label: 'Prerequisite' },
                { value: 'corequisite', label: 'Corequisite' },
              ]}
              emptyLabel="Select Type"
              placeholder="Filter type…"
              required
              aria-label="Requisite type"
            />
          </div>
          <div className="form-group">
            <label htmlFor="ldm-req-subject">Subject</label>
            <SearchableSelect
              id="ldm-req-subject"
              value={formData.subject_id === '' || formData.subject_id == null ? '' : String(formData.subject_id)}
              onChange={(v) =>
                setFormData({ ...formData, subject_id: v ? parseInt(v, 10) : '' })
              }
              options={(lookupData.subjects || []).map((subject) => ({
                value: String(subject.subject_id),
                label: `${subject.subject_code} - ${subject.subject_name}`,
              }))}
              emptyLabel="Select Subject"
              placeholder="Search subject…"
              required
              aria-label="Subject for requisite"
            />
          </div>
          {formData.requisite_type === 'prerequisite' && (() => {
            const bulkRuleSelectValue =
              formData.bulk_requisite_text ||
              (formData.bulk_requisite_group?.from_year_level || formData.bulk_requisite_group?.to_year_level
                ? '__year_range__'
                : '');
            const showCustomYearRange = bulkRuleSelectValue === '__year_range__';
            const filledPrereqCount = (formData.required_subjects || []).filter(
              (id) => id !== '' && id != null,
            ).length;
            const previewCount = getBulkRequisiteSubjectIds().length;

            return (
              <div className="requisite-builder">
                <div className="requisite-builder__intro">
                  <h4 className="requisite-builder__title">Add prerequisites</h4>
                  <p className="requisite-builder__help">
                    Fast way: choose the program and a rule, then fill the list.
                    Or skip the rule and add subjects one by one below.
                  </p>
                </div>

                <div className="requisite-builder__rule-card">
                  <div className="requisite-builder__step">
                    <span className="requisite-builder__step-num" aria-hidden="true">1</span>
                    <div className="requisite-builder__step-body">
                      <label htmlFor="ldm-req-bulk-program">Which program&apos;s curriculum?</label>
                      <SearchableSelect
                        id="ldm-req-bulk-program"
                        value={formData.bulk_requisite_group?.program_id ? String(formData.bulk_requisite_group.program_id) : ''}
                        onChange={(v) =>
                          setFormData({
                            ...formData,
                            bulk_requisite_group: {
                              ...(formData.bulk_requisite_group || {}),
                              program_id: v ? parseInt(v, 10) : '',
                            },
                          })
                        }
                        options={(lookupData.programs || []).map((program) => ({
                          value: String(program.program_id),
                          label: `${program.program_code || 'Program'} - ${program.program_name || ''}`.trim(),
                        }))}
                        emptyLabel="Select Program"
                        placeholder="Search program…"
                        aria-label="Bulk prerequisite program"
                      />
                    </div>
                  </div>

                  <div className="requisite-builder__step">
                    <span className="requisite-builder__step-num" aria-hidden="true">2</span>
                    <div className="requisite-builder__step-body">
                      <label htmlFor="ldm-req-bulk-text">What should be required?</label>
                      <SearchableSelect
                        id="ldm-req-bulk-text"
                        value={bulkRuleSelectValue}
                        onChange={(v) => {
                          const isYearRangeRule = v === '__year_range__';
                          setFormData({
                            ...formData,
                            bulk_requisite_text: isYearRangeRule ? '' : v,
                            bulk_requisite_group: {
                              ...(formData.bulk_requisite_group || {}),
                              from_year_level: isYearRangeRule ? formData.bulk_requisite_group?.from_year_level || '' : '',
                              to_year_level: isYearRangeRule ? formData.bulk_requisite_group?.to_year_level || '' : '',
                              to_semester_id: '',
                            },
                          });
                        }}
                        options={BULK_REQUISITE_RULE_OPTIONS}
                        emptyLabel="Select a rule"
                        placeholder="Search rules…"
                        // Free-text allowed: custom standing/range wording when not in the list
                        allowCustomValue
                        aria-label="Bulk prerequisite rule"
                      />
                      {showCustomYearRange && (
                        <div className="requisite-builder__year-range">
                          <SearchableSelect
                            id="ldm-req-bulk-from-year"
                            value={formData.bulk_requisite_group?.from_year_level ? String(formData.bulk_requisite_group.from_year_level) : ''}
                            onChange={(v) =>
                              setFormData({
                                ...formData,
                                bulk_requisite_text: '',
                                bulk_requisite_group: {
                                  ...(formData.bulk_requisite_group || {}),
                                  from_year_level: v ? parseInt(v, 10) : '',
                                  to_semester_id: '',
                                },
                              })
                            }
                            options={(lookupData.yearLevels || []).map((year) => ({
                              value: String(year.year_level_id),
                              label: `From ${year.year_level}`,
                            }))}
                            emptyLabel="From Year"
                            placeholder="From year…"
                            aria-label="Bulk prerequisite from year"
                          />
                          <SearchableSelect
                            id="ldm-req-bulk-to-year"
                            value={formData.bulk_requisite_group?.to_year_level ? String(formData.bulk_requisite_group.to_year_level) : ''}
                            onChange={(v) =>
                              setFormData({
                                ...formData,
                                bulk_requisite_text: '',
                                bulk_requisite_group: {
                                  ...(formData.bulk_requisite_group || {}),
                                  to_year_level: v ? parseInt(v, 10) : '',
                                  to_semester_id: '',
                                },
                              })
                            }
                            options={(lookupData.yearLevels || []).map((year) => ({
                              value: String(year.year_level_id),
                              label: `To ${year.year_level}`,
                            }))}
                            emptyLabel="To Year"
                            placeholder="To year…"
                            aria-label="Bulk prerequisite to year"
                          />
                        </div>
                      )}
                      <p className="requisite-builder__hint">
                        Tip: &quot;Core / Major&quot; means professional subjects marked Core or Major in that program&apos;s curriculum.
                      </p>
                    </div>
                  </div>

                  <div className="requisite-builder__step">
                    <span className="requisite-builder__step-num" aria-hidden="true">3</span>
                    <div className="requisite-builder__step-body">
                      <label>Fill the list</label>
                      <button
                        type="button"
                        className="requisite-builder__fill-btn"
                        onClick={addBulkRequisiteSubjects}
                        disabled={!canTryBulkRequisite() || isAddingBulkSubjects || isSubmitting}
                      >
                        {isAddingBulkSubjects ? 'Filling list…' : 'Fill prerequisite list from rule'}
                      </button>
                      {previewCount > 0 && canTryBulkRequisite() && (
                        <p className="requisite-builder__preview">
                          This rule matches about {previewCount} subject{previewCount === 1 ? '' : 's'}.
                          Click fill to put them in the list below.
                        </p>
                      )}
                      {filledPrereqCount > 0 && (
                        <p className="requisite-builder__filled">
                          {filledPrereqCount} subject{filledPrereqCount === 1 ? '' : 's'} in the list — review, then click{' '}
                          {editingItem ? 'Update' : 'Create'}.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="requisite-builder__list-card">
                  <div className="requisite-builder__list-head">
                    <div>
                      <h4 className="requisite-builder__title">Prerequisite list</h4>
                      <p className="requisite-builder__help">
                        Subjects filled from the rule appear here. You can still add or remove individual subjects.
                      </p>
                    </div>
                  </div>

                  <div className="requisite-builder__rows">
                    {(formData.required_subjects || []).map((reqSubjectId, index) => (
                      <div key={index} className="requisite-builder__row">
                        <div className="requisite-builder__row-select">
                          <SearchableSelect
                            id={`ldm-req-required-${index}`}
                            value={reqSubjectId === '' || reqSubjectId == null ? '' : String(reqSubjectId)}
                            onChange={(v) => {
                              const newRequiredSubjects = [...(formData.required_subjects || [])];
                              newRequiredSubjects[index] = v ? parseInt(v, 10) : '';
                              setFormData({
                                ...formData,
                                bulk_requisite_text: '',
                                bulk_requisite_group: { program_id: '', from_year_level: '', to_year_level: '' },
                                required_subjects: newRequiredSubjects,
                              });
                            }}
                            options={(lookupData.subjects || [])
                              .filter(
                                (subject) =>
                                  String(subject.subject_id) !== String(formData.subject_id || '') &&
                                  !formData.required_subjects?.some(
                                    (id, idx) => idx !== index && String(id) === String(subject.subject_id),
                                  ),
                              )
                              .map((subject) => ({
                                value: String(subject.subject_id),
                                label: `${subject.subject_code} - ${subject.subject_name}`,
                              }))}
                            emptyLabel="Select Prerequisite Subject"
                            placeholder="Search subject…"
                            required
                            aria-label={`Required subject ${index + 1}`}
                          />
                        </div>
                        <button
                          type="button"
                          className="requisite-builder__remove-btn"
                          disabled={isSubmitting || isAddingBulkSubjects}
                          onClick={() => {
                            const newRequiredSubjects = formData.required_subjects?.filter((_, idx) => idx !== index) || [];
                            setFormData({
                              ...formData,
                              bulk_requisite_text: '',
                              bulk_requisite_group: { program_id: '', from_year_level: '', to_year_level: '' },
                              required_subjects: newRequiredSubjects,
                            });
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="requisite-builder__list-actions">
                    <button
                      type="button"
                      className="requisite-builder__add-one-btn"
                      disabled={isSubmitting || isAddingBulkSubjects}
                      onClick={() => {
                        const newRequiredSubjects = [...(formData.required_subjects || []), ''];
                        setFormData({
                          ...formData,
                          bulk_requisite_text: '',
                          bulk_requisite_group: { program_id: '', from_year_level: '', to_year_level: '' },
                          required_subjects: newRequiredSubjects,
                        });
                      }}
                    >
                      + Add one subject
                    </button>
                    {(formData.required_subjects || []).length > 0 && (
                      <button
                        type="button"
                        className="requisite-builder__clear-btn"
                        disabled={isSubmitting || isAddingBulkSubjects}
                        onClick={() =>
                          setFormData({
                            ...formData,
                            bulk_requisite_text: '',
                            bulk_requisite_group: { program_id: '', from_year_level: '', to_year_level: '' },
                            required_subjects: [],
                          })
                        }
                      >
                        Clear list
                      </button>
                    )}
                  </div>

                  {filledPrereqCount === 0 && !(formData.corequisite_subjects || []).length && (
                    <div className={`requisite-builder__empty-note${editingItem ? ' is-muted' : ''}`}>
                      {editingItem
                        ? 'No prerequisite subjects selected. Updating will remove this requisite set.'
                        : 'Add subjects with the rule above, or add one subject — unless you only need co-requisites below.'}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          {formData.requisite_type === 'corequisite' && (
          <div className="form-group">
            <label>
              Co-requisite Subjects
            </label>
            <p style={{ margin: '4px 0 10px', color: '#6c757d', fontSize: '12px' }}>
              {`Choose the subjects that must be taken together, then click ${editingItem ? 'Update' : 'Create'}.`}
            </p>
            <div style={{ marginBottom: '10px' }}>
              {(formData.required_subjects || []).map((reqSubjectId, index) => {
                return (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <SearchableSelect
                        id={`ldm-req-required-${index}`}
                        value={reqSubjectId === '' || reqSubjectId == null ? '' : String(reqSubjectId)}
                        onChange={(v) => {
                          const newRequiredSubjects = [...(formData.required_subjects || [])];
                          newRequiredSubjects[index] = v ? parseInt(v, 10) : '';
                          setFormData({
                            ...formData,
                            bulk_requisite_text: '',
                            bulk_requisite_group: { program_id: '', from_year_level: '', to_year_level: '' },
                            required_subjects: newRequiredSubjects,
                          });
                        }}
                        options={(lookupData.subjects || [])
                          .filter(
                            (subject) =>
                              String(subject.subject_id) !== String(formData.subject_id || '') &&
                              !formData.required_subjects?.some(
                                (id, idx) => idx !== index && String(id) === String(subject.subject_id),
                              ),
                          )
                          .map((subject) => ({
                            value: String(subject.subject_id),
                            label: `${subject.subject_code} - ${subject.subject_name}`,
                          }))}
                        emptyLabel="Select Co-requisite Subject"
                        placeholder="Search subject…"
                        required
                        aria-label={`Required subject ${index + 1}`}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={isSubmitting || isAddingBulkSubjects}
                      onClick={() => {
                        const newRequiredSubjects = formData.required_subjects?.filter((_, idx) => idx !== index) || [];
                        setFormData({
                          ...formData,
                          bulk_requisite_text: '',
                          bulk_requisite_group: { program_id: '', from_year_level: '', to_year_level: '' },
                          required_subjects: newRequiredSubjects,
                        });
                      }}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: isSubmitting || isAddingBulkSubjects ? '#adb5bd' : '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isSubmitting || isAddingBulkSubjects ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              disabled={isSubmitting || isAddingBulkSubjects}
              onClick={() => {
                const newRequiredSubjects = [...(formData.required_subjects || []), ''];
                setFormData({
                  ...formData,
                  bulk_requisite_text: '',
                  bulk_requisite_group: { program_id: '', from_year_level: '', to_year_level: '' },
                  required_subjects: newRequiredSubjects,
                });
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: isSubmitting || isAddingBulkSubjects ? '#adb5bd' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isSubmitting || isAddingBulkSubjects ? 'not-allowed' : 'pointer',
                marginTop: '5px'
              }}
            >
              + Add Co-requisite Subject
            </button>
            {editingItem && (formData.required_subjects || []).length > 0 && (
              <button
                type="button"
                disabled={isSubmitting || isAddingBulkSubjects}
                onClick={() =>
                  setFormData({
                    ...formData,
                    bulk_requisite_text: '',
                    bulk_requisite_group: { program_id: '', from_year_level: '', to_year_level: '' },
                    required_subjects: [],
                  })
                }
                style={{
                  padding: '8px 16px',
                  backgroundColor: isSubmitting || isAddingBulkSubjects ? '#adb5bd' : '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isSubmitting || isAddingBulkSubjects ? 'not-allowed' : 'pointer',
                  marginTop: '5px',
                  marginLeft: '8px',
                }}
              >
                Remove All Co-requisite Subjects
              </button>
            )}
            {(!formData.required_subjects || formData.required_subjects.length === 0) && (
              <div style={{ color: editingItem ? '#6c757d' : '#dc3545', fontSize: '12px', marginTop: '5px' }}>
                {editingItem
                  ? 'No co-requisite subjects selected. Updating will remove this requisite set.'
                  : 'At least one co-requisite subject is needed'}
              </div>
            )}
          </div>
          )}
          {formData.requisite_type === 'prerequisite' && (
            <div
              className="form-group"
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px',
                background: '#fff',
              }}
            >
              <label>Co-requisite Subjects (Optional)</label>
              <p style={{ margin: '4px 0 10px', color: '#6c757d', fontSize: '12px' }}>
                Use this when a subject has a prerequisite rule and a co-requisite at the same time.
              </p>
              <div style={{ marginBottom: '10px' }}>
                {(formData.corequisite_subjects || []).map((coreqSubjectId, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <SearchableSelect
                        id={`ldm-req-coreq-${index}`}
                        value={coreqSubjectId === '' || coreqSubjectId == null ? '' : String(coreqSubjectId)}
                        onChange={(v) => {
                          const nextCorequisites = [...(formData.corequisite_subjects || [])];
                          nextCorequisites[index] = v ? parseInt(v, 10) : '';
                          setFormData({ ...formData, corequisite_subjects: nextCorequisites });
                        }}
                        options={(lookupData.subjects || [])
                          .filter(
                            (subject) =>
                              String(subject.subject_id) !== String(formData.subject_id || '') &&
                              !formData.corequisite_subjects?.some(
                                (id, idx) => idx !== index && String(id) === String(subject.subject_id),
                              ),
                          )
                          .map((subject) => ({
                            value: String(subject.subject_id),
                            label: `${subject.subject_code} - ${subject.subject_name}`,
                          }))}
                        emptyLabel="Select Co-requisite Subject"
                        placeholder="Search subject..."
                        required
                        aria-label={`Co-requisite subject ${index + 1}`}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={isSubmitting || isAddingBulkSubjects}
                      onClick={() => {
                        const nextCorequisites = formData.corequisite_subjects?.filter((_, idx) => idx !== index) || [];
                        setFormData({ ...formData, corequisite_subjects: nextCorequisites });
                      }}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: isSubmitting || isAddingBulkSubjects ? '#adb5bd' : '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isSubmitting || isAddingBulkSubjects ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={isSubmitting || isAddingBulkSubjects}
                onClick={() => {
                  const nextCorequisites = [...(formData.corequisite_subjects || []), ''];
                  setFormData({ ...formData, corequisite_subjects: nextCorequisites });
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: isSubmitting || isAddingBulkSubjects ? '#adb5bd' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isSubmitting || isAddingBulkSubjects ? 'not-allowed' : 'pointer',
                  marginTop: '5px',
                }}
              >
                + Add Co-requisite Subject
              </button>
            </div>
          )}
        </>
      ),
      tracks: (
        <>
          <div className="form-group">
            <label>Track Code</label>
            <input
              type="text"
              value={formData.track_code || ''}
              onChange={(e) => setFormData({ ...formData, track_code: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Track Name</label>
            <input
              type="text"
              value={formData.track_name || ''}
              onChange={(e) => setFormData({ ...formData, track_name: e.target.value })}
              required
            />
          </div>
        </>
      ),
      curriculumHeaders: (
        <>
          <div className="form-group">
            <label htmlFor="ldm-ch-program">Program</label>
            <SearchableSelect
              id="ldm-ch-program"
              value={formData.program_id === '' || formData.program_id == null ? '' : String(formData.program_id)}
              onChange={(v) => {
                const nextProgramId = v ? parseInt(v, 10) : '';
                setFormData((prev) => {
                  const nextData = { ...prev, program_id: nextProgramId };
                  return shouldShowOfferedSubjectTrack(nextData)
                    ? nextData
                    : { ...nextData, track_id: '' };
                });
              }}
              options={(lookupData.programs || []).map((program) => ({
                value: String(program.program_id),
                label: `${program.program_code} - ${program.program_name}`,
              }))}
              emptyLabel="Select Program"
              placeholder="Search program…"
              required
              aria-label="Curriculum header program"
            />
          </div>
          <div className="form-group">
            <label>Effective Year</label>
            <input
              type="text"
              inputMode="numeric"
              value={formData.Effective_Year || ''}
              onChange={(e) => setFormData({ ...formData, Effective_Year: e.target.value })}
              placeholder="e.g., 2023-2024"
              pattern="\d{4}([-/]\d{4})?"
              title="Enter a start year like 2023 or a school year like 2023-2024"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="ldm-ch-ay">Academic Year</label>
            <SearchableSelect
              id="ldm-ch-ay"
              value={
                formData.academic_year_id === '' || formData.academic_year_id == null
                  ? ''
                  : String(formData.academic_year_id)
              }
              onChange={(v) =>
                setFormData({
                  ...formData,
                  academic_year_id: v ? parseInt(v, 10) : '',
                })
              }
              options={(lookupData.academicYears || []).map((ay) => ({
                value: String(ay.academic_year_id || ay.id),
                label: ay.academic_year_name || ay.name || `AY ${ay.academic_year_id || ay.id}`,
              }))}
              emptyLabel="Select Academic Year"
              placeholder="Search academic year…"
              required
              aria-label="Curriculum header academic year"
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g., Based on CMO No.25 series of 2015"
            />
          </div>
        </>
      ),
      offeredSubjects: (
        <>
          <div className="form-group">
            <label htmlFor="ldm-os-subject">Subject</label>
            <SearchableSelect
              id="ldm-os-subject"
              value={formData.subject_id === '' || formData.subject_id == null ? '' : String(formData.subject_id)}
              onChange={(v) =>
                setFormData({ ...formData, subject_id: v ? parseInt(v, 10) : '' })
              }
              options={(lookupData.subjects || []).map((subject) => ({
                value: String(subject.subject_id),
                label: `${subject.subject_code} - ${subject.subject_name}`,
              }))}
              emptyLabel="Select Subject"
              placeholder="Search subject…"
              required
              aria-label="Offered subject"
            />
          </div>
          <div className="form-group">
            <label htmlFor="ldm-os-ay">Academic Year</label>
            <input
              id="ldm-os-ay"
              type="text"
              value={
                currentAcademicYear
                  ? currentAcademicYear.academic_year_name || currentAcademicYear.name
                  : 'No current academic year — add it under Academic year'
              }
              disabled
              readOnly
              aria-label="Academic year (present school year)"
            />
            <small style={{ color: '#6c757d', display: 'block', marginTop: '6px' }}>
              Offered subjects always apply to the present school year.
            </small>
          </div>
          <div className="form-group">
            <label htmlFor="ldm-os-semester">Semester</label>
            <SearchableSelect
              id="ldm-os-semester"
              value={formData.semester_id === '' || formData.semester_id == null ? '' : String(formData.semester_id)}
              onChange={(v) =>
                setFormData({ ...formData, semester_id: v ? parseInt(v, 10) : '' })
              }
              options={(lookupData.semesters || []).map((sem) => ({
                value: String(sem.semester_id),
                label: sem.semester_name,
              }))}
              emptyLabel="Select Semester"
              placeholder="Search semester…"
              required
              aria-label="Semester"
            />
          </div>
          <div className="form-group">
            <label htmlFor="ldm-os-program">Program</label>
            <SearchableSelect
              id="ldm-os-program"
              value={formData.program_id === '' || formData.program_id == null ? '' : String(formData.program_id)}
              onChange={(v) =>
                setFormData({ ...formData, program_id: v ? parseInt(v, 10) : '' })
              }
              options={(lookupData.programs || []).map((program) => ({
                value: String(program.program_id),
                label: `${program.program_code} - ${program.program_name}`,
              }))}
              emptyLabel="Select Program"
              placeholder="Search program…"
              required
              aria-label="Program"
            />
          </div>
          <div className="form-group">
            <label htmlFor="ldm-os-yl">Year Level (Optional)</label>
            <SearchableSelect
              id="ldm-os-yl"
              value={formData.year_level_id === '' || formData.year_level_id == null ? '' : String(formData.year_level_id)}
              onChange={(v) => {
                const nextYearLevelId = v ? parseInt(v, 10) : '';
                setFormData((prev) => {
                  const nextData = { ...prev, year_level_id: nextYearLevelId };
                  return shouldShowOfferedSubjectTrack(nextData)
                    ? nextData
                    : { ...nextData, track_id: '' };
                });
              }}
              options={(lookupData.yearLevels || []).map((yl) => ({
                value: String(yl.year_level_id),
                label: yl.year_level,
              }))}
              emptyLabel="Select Year Level (Optional)"
              placeholder="Search year level…"
              aria-label="Year level (optional)"
            />
          </div>
          {shouldShowOfferedSubjectTrack() && (
            <div className="form-group">
              <label htmlFor="ldm-os-track">Track (Optional)</label>
              <SearchableSelect
                id="ldm-os-track"
                value={formData.track_id === '' || formData.track_id == null ? '' : String(formData.track_id)}
                onChange={(v) =>
                  setFormData({ ...formData, track_id: v ? parseInt(v, 10) : '' })
                }
                options={(lookupData.tracks || []).map((track) => ({
                  value: String(track.track_id),
                  label: `${track.track_code} - ${track.track_name}`,
                }))}
                emptyLabel="Select Track (Optional)"
                placeholder="Search track…"
                aria-label="Track (optional)"
              />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="ldm-os-status">Status</label>
            <SearchableSelect
              id="ldm-os-status"
              value={editingItem ? (formData.status || 'active') : 'active'}
              onChange={(v) => setFormData({ ...formData, status: v })}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              emptyLabel="Active"
              placeholder="Status"
              aria-label="Offered subject status (always Active on create)"
              disabled
            />
          </div>
        </>
      ),
      electiveSubjects: (
        <>
          <div className="form-group">
            <label htmlFor="ldm-es-department">Department</label>
            <SearchableSelect
              id="ldm-es-department"
              value={formData.department_id === '' || formData.department_id == null ? '' : String(formData.department_id)}
              onChange={(v) => {
                const nextDepartmentId = v ? parseInt(v, 10) : '';
                const currentProgram = (lookupData.programs || []).find(
                  (program) => String(program.program_id) === String(formData.program_id || ''),
                );
                const keepProgram =
                  currentProgram &&
                  String(departmentIdForProgram(currentProgram) || '') === String(nextDepartmentId || '');

                setFormData({
                  ...formData,
                  department_id: nextDepartmentId,
                  program_id: keepProgram ? formData.program_id : '',
                  track_id: keepProgram && isInformationTechnologyProgram(currentProgram) ? formData.track_id : '',
                  subject_id: keepProgram ? formData.subject_id : '',
                  elective_slot_id: keepProgram ? formData.elective_slot_id : '',
                });
              }}
              options={(lookupData.departments || []).map((department) => ({
                value: String(department.department_id),
                label: departmentLabel(department),
              }))}
              emptyLabel="Select Department"
              placeholder="Search department…"
              required
              aria-label="Elective department"
            />
          </div>
          {selectedElectiveDepartmentId && (
            <div className="form-group">
              <label htmlFor="ldm-es-program">Program</label>
              <SearchableSelect
                id="ldm-es-program"
                value={formData.program_id === '' || formData.program_id == null ? '' : String(formData.program_id)}
                onChange={(v) => {
                  const program = (lookupData.programs || []).find(
                    (item) => String(item.program_id) === String(v || ''),
                  );

                  setFormData({
                    ...formData,
                    program_id: v ? parseInt(v, 10) : '',
                    department_id: program ? departmentIdForProgram(program) : formData.department_id || '',
                    track_id: program && isInformationTechnologyProgram(program) ? formData.track_id : '',
                    subject_id: '',
                    elective_slot_id: '',
                  });
                }}
                options={electiveProgramOptions}
                emptyLabel="Select Program"
                placeholder="Search program…"
                required
                aria-label="Elective program"
              />
            </div>
          )}
          {shouldShowElectiveTrack && (
            <div className="form-group">
              <label htmlFor="ldm-es-track">Track</label>
              <SearchableSelect
                id="ldm-es-track"
                value={formData.track_id === '' || formData.track_id == null ? '' : String(formData.track_id)}
                onChange={(v) =>
                  setFormData({ ...formData, track_id: v ? parseInt(v, 10) : '' })
                }
                options={(lookupData.tracks || []).map((track) => ({
                  value: String(track.track_id),
                  label: `${track.track_code} - ${track.track_name}`,
                }))}
                emptyLabel="Select Track"
                placeholder="Search track…"
                required
                aria-label="Elective track"
              />
            </div>
          )}
          {selectedElectiveProgramId && (
            <div className="form-group">
              <label htmlFor="ldm-es-slot">Elective slot (e.g. IT Electives 4)</label>
              <SearchableSelect
                id="ldm-es-slot"
                value={
                  formData.elective_slot_id === '' || formData.elective_slot_id == null
                    ? ''
                    : String(formData.elective_slot_id)
                }
                onChange={(v) =>
                  setFormData({ ...formData, elective_slot_id: v ? parseInt(v, 10) : '' })
                }
                options={electiveSlotOptions}
                emptyLabel="No slot (catalog only)"
                placeholder="Search elective slot…"
                aria-label="Elective slot"
              />
              <small style={{ color: '#6c757d', display: 'block', marginTop: '6px' }}>
                To control Elective 4 on the guest portal, choose <strong>IT Electives 4</strong>, then pick the
                track and the IT elective subject (e.g. Advanced Programming). Guests only pick the track.
              </small>
              {electiveSlotOptions.length === 0 && (
                <small style={{ color: '#b45309', display: 'block', marginTop: '6px' }}>
                  No elective slots found for this program. Create them under Curriculum → Elective Slots first.
                </small>
              )}
            </div>
          )}
          {selectedElectiveProgramId && (
            <div className="form-group">
              <label htmlFor="ldm-es-subject">Subject</label>
              <SearchableSelect
                id="ldm-es-subject"
                value={formData.subject_id === '' || formData.subject_id == null ? '' : String(formData.subject_id)}
                onChange={(v) =>
                  setFormData({ ...formData, subject_id: v ? parseInt(v, 10) : '' })
                }
                options={electiveSubjectOptions}
                emptyLabel="Select Subject"
                placeholder="Search subject…"
                required
                aria-label="Elective subject"
              />
              {electiveSubjectOptions.length === 0 && (
                <small style={{ color: '#6c757d', display: 'block', marginTop: '6px' }}>
                  No IT elective subjects found yet. Select an elective slot above, or assign electives under
                  Curriculum → Elective Slots first.
                </small>
              )}
            </div>
          )}
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
        </>
      ),
    };

    return formFields[activeTab] || null;
  };

  //diri maka ilis og mga table headers sa table
  const renderTable = (section, data) => {
    const showActions = canMutateCurrentPanel;
    const tableHeaders = {
      programs: ['Department Code', 'Program Name', 'Total Units (curriculum)', 'Status'],
      departments: ['Campus', 'Department Name', 'Department Code', 'Status'],
      subjects: ['Subject Code', 'Subject Name', 'Units', 'Hours', 'Status'],
      yearLevels: ['Year Level', 'Status'],
      semesters: ['Semester Name', 'Status'],
      roles: ['Role Name', 'Access Level', 'Description', 'Status'],
      campus: ['Campus Name', 'Status'],
      academicYears: ['Academic Year Name', 'Status'],
      requisites: ['Type', 'Subject', 'Required Subject'],
      tracks: ['Track Code', 'Track Name', 'Status'],
      curriculumHeaders: ['Program', 'Effective Year', 'Academic Year', 'Description', 'Status'],
      offeredSubjects: ['Subject', 'Academic Year', 'Semester', 'Program', 'Track', 'Year Level', 'Status'],
      electiveSubjects: ['Department', 'Program', 'Track', 'Slot', 'Subject', 'Description', 'Status'],
    };

    const getRowData = (section, item) => {
      const rowData = {
        programs: [
          item.department?.department_code || item.department_code || item.department_id || '-',
          item.program_name,
          (() => {
            const fromCurriculum = programCurriculumUnitsById.get(String(item.program_id));
            return fromCurriculum != null ? fromCurriculum : '—';
          })(),
          lookupItemIsActive(item) ? 'Active' : 'Inactive',
        ],
        departments: [
          (() => {
            const campusId = item.campus?.campus_id || item.campus_id;
            const campus = lookupData.campus?.find(c => c.campus_id === campusId);
            return campus ? campus.campus_name : (campusId || '-');
          })(),
          item.department_name,
          item.department_code,
          lookupItemIsActive(item) ? 'Active' : 'Inactive',
        ],
        subjects: [
          item.subject_code,
          item.subject_name,
          (item.number_of_units === null || item.number_of_units === undefined) ? '-' : item.number_of_units,
          (item.number_of_hrs === null || item.number_of_hrs === undefined) ? '-' : item.number_of_hrs,
          lookupItemIsActive(item) ? 'Active' : 'Inactive',
        ],
        yearLevels: [item.year_level, lookupItemIsActive(item) ? 'Active' : 'Inactive'],
        semesters: [item.semester_name, item.status || item.Status || '-'],
        roles: [
          item.role_name || item.name || '-',
          (item.access_level === null || item.access_level === undefined) ? '-' : item.access_level,
          item.description || '-',
          lookupItemIsActive(item) ? 'Active' : 'Inactive',
        ],
        campus: [item.campus_name, lookupItemIsActive(item) ? 'Active' : 'Inactive'],
        academicYears: [item.name || item.academic_year_name || '-', item.status || '-'],
        requisites: [
          item.requisite_type || item.type || '-',
          (() => {
            const subjectId = item.subject?.subject_id || item.subject_id;
            const subject = lookupData.subjects?.find(s => s.subject_id === subjectId);
            return subject ? `${subject.subject_code} - ${subject.subject_name}` : subjectId || '-';
          })(),
          (() => {
            const requiredSubjectId = item.requiredSubject?.subject_id || item.requisites_subject_id || item.required_subject_id;
            const requiredSubject = lookupData.subjects?.find(s => s.subject_id === requiredSubjectId);
            return requiredSubject ? `${requiredSubject.subject_code} - ${requiredSubject.subject_name}` : requiredSubjectId || '-';
          })()
        ],
        tracks: [
          item.track_code,
          item.track_name,
          lookupItemIsActive(item) ? 'Active' : 'Inactive',
        ],
        curriculumHeaders: [
          (() => {
            const programId = item.program?.program_id || item.program_id;
            const program = lookupData.programs?.find(p => p.program_id === programId);
            return program ? `${program.program_code} - ${program.program_name}` : programId || '-';
          })(),
          formatCurriculumYearRange(item.Effective_Year) || '-',
          (() => {
            const ayId = item.academicYear?.academic_year_id || item.academic_year_id;
            const ay = lookupData.academicYears?.find(
              (a) => (a.academic_year_id || a.id) === ayId
            );
            return ay
              ? ay.academic_year_name || ay.name
              : item.academicYear?.academic_year_name || ayId || '-';
          })(),
          item.description || '-',
          lookupItemIsActive(item) ? 'Active' : 'Inactive',
        ],
        offeredSubjects: [
          (() => {
            const subjectId = item.subject?.subject_id || item.subject_id;
            const subject = lookupData.subjects?.find(s => s.subject_id === subjectId);
            return subject ? `${subject.subject_code} - ${subject.subject_name}` : subjectId || '-';
          })(),
          (() => {
            const ayId = item.academicYear?.academic_year_id || item.academic_year_id;
            const ay = lookupData.academicYears?.find(a => (a.academic_year_id || a.id) === ayId);
            return ay ? (ay.name || ay.academic_year_name) : ayId || '-';
          })(),
          (() => {
            const semId = item.semester?.semester_id || item.semester_id;
            const sem = lookupData.semesters?.find(s => s.semester_id === semId);
            return sem ? sem.semester_name : semId || '-';
          })(),
          (() => {
            const programId = item.program?.program_id || item.program_id;
            const program = lookupData.programs?.find(p => p.program_id === programId);
            return program ? `${program.program_code} - ${program.program_name}` : programId || '-';
          })(),
          (() => {
            const trackId = item.track?.track_id || item.track_id;
            const track = lookupData.tracks?.find(t => t.track_id === trackId);
            return track ? `${track.track_code} - ${track.track_name}` : (trackId ? trackId : '-');
          })(),
          (() => {
            const ylId = item.yearLevel?.year_level_id || item.year_level_id;
            const yl = lookupData.yearLevels?.find(y => y.year_level_id === ylId);
            return yl ? yl.year_level : (ylId ? ylId : '-');
          })(),
          item.status || '-',
        ],
        electiveSubjects: [
          (() => {
            const departmentId = item.department?.department_id || item.department_id;
            const department = lookupData.departments?.find(d => d.department_id === departmentId);
            return department ? departmentLabel(department) : departmentId || '-';
          })(),
          (() => {
            const programId = item.program?.program_id || item.program_id;
            const program = lookupData.programs?.find(p => p.program_id === programId);
            return program ? programLabel(program) : programId || '-';
          })(),
          (() => {
            const trackId = item.track?.track_id || item.track_id;
            const track = lookupData.tracks?.find(t => t.track_id === trackId);
            return track ? `${track.track_code} - ${track.track_name}` : trackId || '-';
          })(),
          (() => {
            const slotId = item.electiveSlot?.elective_slot_id || item.elective_slot_id;
            const slot =
              item.electiveSlot ||
              (lookupData.electiveSlots || []).find(
                (s) => String(s.elective_slot_id) === String(slotId || ''),
              );
            return slot?.slot_name || (slotId ? `Slot #${slotId}` : '—');
          })(),
          (() => {
            const subjectId = item.subject?.subject_id || item.subject_id;
            const subject = lookupData.subjects?.find(s => s.subject_id === subjectId);
            return subject ? `${subject.subject_code} - ${subject.subject_name}` : subjectId || '-';
          })(),
          item.description || '-',
          lookupItemIsActive(item) ? 'Active' : 'Inactive',
        ],
      };
      return rowData[section] || [];
    };

    const headers = tableHeaders[section];
    const dataColCount = headers.length;
    const scrollMinPx = Math.min(1200, 160 + dataColCount * 92 + (showActions ? 128 : 0));
    const gridClassName = [
      'lookup-data-grid',
      'lookup-data-grid--scroll-table',
      showActions ? 'lookup-data-grid--with-actions' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const searchQ = SEARCHABLE_LOOKUP_SECTIONS.has(section)
      ? (lookupSearchBySection[section] || '').trim().toLowerCase()
      : '';
    let filteredData =
      !searchQ
        ? data
        : data.filter((item) =>
            getRowData(section, item).some((cell) =>
              String(cell ?? '').toLowerCase().includes(searchQ)
            )
          );

    if (LOOKUP_NEWEST_FIRST_ID[section]) {
      filteredData = sortLookupNewestFirst(section, filteredData);
    }
    if (section === 'yearLevels') {
      filteredData = sortYearLevelsNatural(filteredData);
    }

    if (section === 'subjects' && subjectCategoryFilter !== 'all') {
      filteredData = filteredData.filter((item) => {
        const cat = subjectCodeCurriculumCategory(item.subject_code);
        return subjectCategoryFilter === 'core' ? cat === 'core' : cat === 'ge';
      });
    }

    const totalFiltered = filteredData.length;
    const lookupTotalPages = Math.max(1, Math.ceil(totalFiltered / lookupListPageSize) || 1);
    const lookupEffectivePage = Math.min(Math.max(1, lookupListPage), lookupTotalPages);
    const lookupPageStart = (lookupEffectivePage - 1) * lookupListPageSize;
    const paginatedData = filteredData.slice(lookupPageStart, lookupPageStart + lookupListPageSize);

    const renderActions = (item) => {
      if (!showActions) return null;
      const supportsStatus = Boolean(LOOKUP_STATUS_API_PATH[section]);
      const isActive = lookupItemIsActive(item);
      return (
        <div className="lookup-data-grid__cell lookup-data-grid__cell--actions">
          <span className="lookup-data-grid__mobile-label">Actions</span>
          <div className="actions">
            {supportsStatus && (
              <button
                type="button"
                className={
                  isActive ? 'lookup-action lookup-action--off' : 'lookup-action lookup-action--on'
                }
                onClick={() => handleToggleLookupStatus(section, item)}
              >
                {isActive ? 'Deactivate' : 'Activate'}
              </button>
            )}
            <button type="button" className="lookup-action lookup-action--edit" onClick={() => handleEdit(item)}>
              Edit
            </button>
            <button
              type="button"
              className="lookup-action lookup-action--delete"
              onClick={() => handleDelete(getLookupRecordId(section, item))}
            >
              Delete
            </button>
          </div>
        </div>
      );
    };

    return (
      <div className="table-section">
        <div className="section-header">
          <h3>{formatTabTitle(section)}</h3>
          {showActions && (
            <button type="button" className="lookup-btn lookup-btn--primary" onClick={handleAdd}>
              Add {formatTabTitle(section)}
            </button>
          )}
        </div>
        {SEARCHABLE_LOOKUP_SECTIONS.has(section) && (
          section === 'subjects' ? (
            <div className="lookup-subjects-filters">
              <div className="lookup-table-search-wrap">
                <label htmlFor={`lookup-search-${section}`} className="lookup-table-search-label">
                  Search
                </label>
                <input
                  id={`lookup-search-${section}`}
                  type="search"
                  className="lookup-table-search"
                  placeholder={LOOKUP_SEARCH_PLACEHOLDER[section] || 'Search…'}
                  value={lookupSearchBySection[section] ?? ''}
                  onChange={(e) =>
                    setLookupSearchBySection((prev) => ({ ...prev, [section]: e.target.value }))
                  }
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="lookup-table-search-wrap">
                <label htmlFor="lookup-subject-category" className="lookup-table-search-label">
                  Core / GE
                </label>
                <select
                  id="lookup-subject-category"
                  className="lookup-table-search"
                  value={subjectCategoryFilter}
                  onChange={(e) => setSubjectCategoryFilter(e.target.value)}
                  aria-label="Filter subjects by Core or GE category"
                >
                  <option value="all">All subjects</option>
                  <option value="core">Core (ITE…)</option>
                  <option value="ge">GE (GEN, PED, NST, SSP, MAT…)</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="lookup-table-search-wrap">
              <label htmlFor={`lookup-search-${section}`} className="lookup-table-search-label">
                Search
              </label>
              <input
                id={`lookup-search-${section}`}
                type="search"
                className="lookup-table-search"
                placeholder={LOOKUP_SEARCH_PLACEHOLDER[section] || 'Search…'}
                value={lookupSearchBySection[section] ?? ''}
                onChange={(e) =>
                  setLookupSearchBySection((prev) => ({ ...prev, [section]: e.target.value }))
                }
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )
        )}
        <div className="table-container">
          <div
            className={gridClassName}
            style={{
              '--lookup-data-cols': dataColCount,
              '--lookup-scroll-min-width': `${scrollMinPx}px`,
            }}
            role="table"
            aria-label={`${formatTabTitle(section)} data`}
          >
            <div className="lookup-data-grid__head" role="row">
              {headers.map((header, index) => (
                <div key={index} className="lookup-data-grid__th" role="columnheader">
                  {header}
                </div>
              ))}
              {showActions && (
                <div className="lookup-data-grid__th lookup-data-grid__th--actions" role="columnheader">
                  Actions
                </div>
              )}
            </div>
            <div className="lookup-data-grid__body" role="rowgroup">
              {data.length === 0 ? (
                <div className="lookup-data-grid__empty no-data" role="row">
                  <div role="cell">
                    No {section === 'academicYears' ? 'Academic Years' : section} found
                  </div>
                </div>
              ) : filteredData.length === 0 ? (
                <div className="lookup-data-grid__empty no-data lookup-data-grid__empty--filter" role="row">
                  <div role="cell">
                    {section === 'subjects' && subjectCategoryFilter !== 'all' && !searchQ
                      ? 'No subjects match this Core / GE filter.'
                      : 'No results match your search or filters.'}
                  </div>
                </div>
              ) : (
                paginatedData.map((item, index) => (
                  <div
                    key={getLookupRecordId(section, item) || item.audit_logs_id || index}
                    className="lookup-data-grid__row"
                    role="row"
                  >
                    {getRowData(section, item).map((cell, cellIndex) => (
                      <div key={cellIndex} className="lookup-data-grid__cell" role="cell">
                        <span className="lookup-data-grid__mobile-label">{headers[cellIndex]}</span>
                        <span className="lookup-data-grid__cell-value">{cell}</span>
                      </div>
                    ))}
                    {renderActions(item)}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        {data.length > 0 && filteredData.length > 0 && (
          <ClientPaginationBar
            page={lookupEffectivePage}
            pageSize={lookupListPageSize}
            totalItems={totalFiltered}
            totalPages={lookupTotalPages}
            onPageChange={setLookupListPage}
            onPageSizeChange={(n) => {
              setLookupListPageSize(n);
              setLookupListPage(1);
            }}
          />
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="loading">Loading lookup data...</div>;
  }

  return (
    <div className="lookup-data-management" data-tour="page-lookup-data">
      <div className="management-header">
        <h2>
          Lookup Data Management
          {!canMutateCurrentPanel && (
            <span className="lookup-view-only-badge"> View only</span>
          )}
        </h2>
        <button type="button" className="lookup-btn lookup-btn--primary" onClick={fetchLookupData}>
          Refresh Data
        </button>
      </div>
      {error && !showModal && <div className="error-message">{error}</div>}

      {!externalNav && (
        <>
          <div className="lookup-tabs">
            <button
              className={activeTab === 'programs' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('programs')}
            >
              Programs
            </button>
            <button
              className={activeTab === 'departments' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('departments')}
            >
              Departments
            </button>
            <button
              className={activeTab === 'subjects' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('subjects')}
            >
              Subjects
            </button>
            <button
              className={activeTab === 'yearLevels' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('yearLevels')}
            >
              Year Levels
            </button>
            <button
              className={activeTab === 'semesters' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('semesters')}
            >
              Semesters
            </button>
            <button
              className={activeTab === 'campus' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('campus')}
            >
              Campus
            </button>
            <button
              className={activeTab === 'roles' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('roles')}
            >
              Roles
            </button>
            <button
              className={activeTab === 'requisites' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('requisites')}
            >
              Prerequisites
            </button>
            <button
              className={activeTab === 'academicYears' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('academicYears')}
            >
              Academic Year
            </button>
            <button
              className={activeTab === 'tracks' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('tracks')}
            >
              Tracks
            </button>
            <button
              className={activeTab === 'curriculumHeaders' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('curriculumHeaders')}
            >
              Curriculum Headers
            </button>
            <button
              className={activeTab === 'offeredSubjects' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('offeredSubjects')}
            >
              Offered Subjects
            </button>
          </div>

          {(activeTab === 'tracks' || activeTab === 'electiveSubjects') && (
            <div className="sub-tabs">
              <button
                className={activeTab === 'tracks' ? 'sub-tab active' : 'sub-tab'}
                onClick={() => setActiveTab('tracks')}
              >
                Tracks
              </button>
              <button
                className={activeTab === 'electiveSubjects' ? 'sub-tab active' : 'sub-tab'}
                onClick={() => setActiveTab('electiveSubjects')}
              >
                Elective Subjects
              </button>
            </div>
          )}
        </>
      )}

      <div className="tab-content">
        {activeTab === 'programs' && renderTable('programs', lookupData.programs || [])}
        {activeTab === 'departments' && renderTable('departments', lookupData.departments || [])}
        {activeTab === 'subjects' && renderTable('subjects', lookupData.subjects || [])}
        {activeTab === 'yearLevels' && renderTable('yearLevels', lookupData.yearLevels || [])}
        {activeTab === 'semesters' && renderTable('semesters', lookupData.semesters || [])}
        {activeTab === 'campus' && renderTable('campus', lookupData.campus || [])}
        {activeTab === 'roles' && renderTable('roles', lookupData.roles || [])}
        {activeTab === 'requisites' && renderTable('requisites', lookupData.requisites || lookupData.prerequisites || lookupData.corequisites || [])}
        {activeTab === 'academicYears' && renderTable('academicYears', lookupData.academicYears || [])}
        {activeTab === 'tracks' && renderTable('tracks', lookupData.tracks || [])}
        {activeTab === 'curriculumHeaders' && renderTable('curriculumHeaders', lookupData.curriculumHeaders || [])}
        {activeTab === 'offeredSubjects' && renderTable('offeredSubjects', lookupData.offeredSubjects || [])}
        {activeTab === 'electiveSubjects' && renderTable('electiveSubjects', lookupData.electiveSubjects || [])}
      </div>

      {showModal &&
        canMutateCurrentPanel &&
        createPortal(
          <div className="lookup-data-management">
            <div className="modal-overlay">
              <div
                ref={lookupModalRef}
                className="app-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="lookup-data-modal-title"
                tabIndex="-1"
              >
                <div className="modal-header">
                  <h3 id="lookup-data-modal-title">
                    {editingItem ? 'Edit' : 'Add'} {formatTabTitle(activeTab)}
                  </h3>
                  <button
                    type="button"
                    className="close-button"
                    disabled={isSubmitting || isAddingBulkSubjects}
                    aria-label={`Close ${formatTabTitle(activeTab)} form`}
                    onClick={() => {
                      if (isSubmitting || isAddingBulkSubjects) return;
                      setShowModal(false);
                      setError('');
                    }}
                  >
                    ×
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="modal-form">
                  {error && <div className="error-message">{error}</div>}
                  {renderForm()}
                  <div className="form-actions">
                    <button
                      type="button"
                      className="cancel-button"
                      disabled={isSubmitting || isAddingBulkSubjects}
                      onClick={() => {
                        if (isSubmitting || isAddingBulkSubjects) return;
                        setShowModal(false);
                        setError('');
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="submit-button" disabled={isSubmitting || isAddingBulkSubjects}>
                      {isSubmitting ? 'Saving...' : editingItem ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default LookupDataManagement;