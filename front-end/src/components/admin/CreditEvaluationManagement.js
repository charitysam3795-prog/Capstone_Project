import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { swalToast, swalError } from '../../utils/swal';
import SearchableSelect from '../common/SearchableSelect';
import ClientPaginationBar from '../common/ClientPaginationBar';
import SubjectEquivalenceQuickModal from '../common/SubjectEquivalenceQuickModal';
import './CreditEvaluationManagement.css';

/** Normalize API relation key (Laravel uses snake_case in JSON). */
function getCreditDetailsList(item) {
  const raw = item.credit_details || item.creditDetails;
  return Array.isArray(raw) ? raw : [];
}

/** Credit detail row: external subject (Laravel uses `other_school_subject` in JSON). */
function formatDetailOtherSchoolSubject(detail, otherSchoolSubjectsLookup = []) {
  const oss = detail?.other_school_subject ?? detail?.otherSchoolSubject;
  if (oss && typeof oss === 'object') {
    const c = oss.subject_code;
    const n = oss.subject_name;
    if (c != null || n != null) {
      return `${c ?? '—'} - ${n ?? '—'}`;
    }
  }
  const oid = detail?.other_subject_id;
  if (oid != null && oid !== '' && Array.isArray(otherSchoolSubjectsLookup) && otherSchoolSubjectsLookup.length > 0) {
    const row = otherSchoolSubjectsLookup.find((x) => String(x.other_subject_id) === String(oid));
    if (row) {
      return `${row.subject_code ?? '—'} - ${row.subject_name ?? '—'}`;
    }
  }
  return '—';
}

/** Credit detail row: local equivalent subject. */
function formatDetailEquivalentSubject(detail, subjectsLookup = []) {
  const s = detail?.subject ?? detail?.Subject;
  if (s && typeof s === 'object') {
    const c = s.subject_code;
    const n = s.subject_name;
    if (c != null || n != null) {
      return `${c ?? '—'} - ${n ?? '—'}`;
    }
  }
  const sid = detail?.subject_id;
  if (sid == null || sid === '') {
    return 'Not yet mapped';
  }
  if (Array.isArray(subjectsLookup) && subjectsLookup.length > 0) {
    const row = subjectsLookup.find((x) => String(x.subject_id) === String(sid));
    if (row) {
      return `${row.subject_code ?? '—'} - ${row.subject_name ?? '—'}`;
    }
  }
  return '—';
}

/**
 * Laravel loads `otherSchoolSubject`; JSON then has `other_school_subject` as a nested object,
 * not the FK scalar — so we must read `other_subject_id` from the object when present.
 */
function getEquivalenceOtherSchoolSubjectId(eq) {
  const raw = eq?.other_school_subject ?? eq?.otherSchoolSubject;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const id = raw.other_subject_id;
    return id != null && id !== '' ? String(id) : null;
  }
  return String(raw);
}

/** Local subject id from equivalence row (scalar or nested `subject`). */
function getEquivalenceSubjectId(eq) {
  if (!eq) return '';
  const nested = eq.subject ?? eq.Subject;
  if (nested && typeof nested === 'object' && nested.subject_id != null) {
    return String(nested.subject_id);
  }
  if (eq.subject_id != null && eq.subject_id !== '') return String(eq.subject_id);
  return '';
}

function normKeyPart(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** One UI row per enrollee + school (catalog IDs or typed prior-school + transfer names). */
function groupingKeyForEvaluation(ev) {
  const sid = ev?.student_id;
  const schid = ev?.school_id;
  if (sid != null && sid !== '' && schid != null && schid !== '') {
    return `g:${sid}|${schid}`;
  }
  // No roster student: keep one table row per stored evaluation (avoid merging unrelated intakes by prior school only).
  if (sid == null || sid === '') {
    return `u:${ev?.credit_eval_id}`;
  }
  const ps = normKeyPart(ev?.prior_school_name);
  const fn = normKeyPart(ev?.transfer_first_name);
  const mn = normKeyPart(ev?.transfer_middle_name);
  const ln = normKeyPart(ev?.transfer_last_name);
  const nameKey = [ln, fn, mn].join('·');
  const hasTransferName = [ln, fn, mn].some((p) => p.length > 0);
  if (ps || hasTransferName) {
    const sk = schid != null && schid !== '' ? `id:${schid}` : `txt:${ps}`;
    return `ext:${nameKey}|${sk}`;
  }
  return `u:${ev?.credit_eval_id}`;
}

/** One credit line in the modal (`oss_entry_mode` = typed new course vs catalog OSS). */
function emptyCreditDetail(ossEntryMode = 'catalog') {
  return {
    oss_entry_mode: ossEntryMode,
    other_subject_id: '',
    external_subject_code: '',
    external_subject_name: '',
    subject_id: '',
    credited_units: '',
    credit_basis: '',
    remarks: '',
  };
}

/** Hydrate modal row from API detail (transfer intake uses free-text external lines). */
function detailRowFromSavedDetail(detail, forStudentInformationMode) {
  if (!forStudentInformationMode) {
    return {
      oss_entry_mode: 'catalog',
      other_subject_id: detail.other_subject_id || '',
      external_subject_code: '',
      external_subject_name: '',
      subject_id: detail.subject_id || '',
      credited_units: detail.credited_units ?? '',
      credit_basis: detail.credit_basis || '',
      remarks: detail.remarks || '',
    };
  }
  const oss = detail.other_school_subject ?? detail.otherSchoolSubject;
  let code = '';
  let name = '';
  if (oss && typeof oss === 'object') {
    code = (oss.subject_code || '').trim();
    name = (oss.subject_name || '').trim();
  }
  return {
    oss_entry_mode: 'new',
    other_subject_id: detail.other_subject_id || '',
    external_subject_code: code,
    external_subject_name: name || code,
    subject_id: detail.subject_id || '',
    credited_units: detail.credited_units ?? '',
    credit_basis: '',
    remarks: '',
  };
}

function buildEvaluationGroups(evaluations, statusFilter) {
  const filtered =
    statusFilter === 'all'
      ? evaluations
      : evaluations.filter(
          (e) => (e.status || 'pending').toLowerCase() === statusFilter.toLowerCase()
        );

  const map = new Map();
  for (const ev of filtered) {
    const k = groupingKeyForEvaluation(ev);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(ev);
  }

  const groups = [];
  for (const [, items] of map) {
    const sorted = [...items].sort((a, b) => {
      const ta = new Date(a.evaluation_date || 0).getTime();
      const tb = new Date(b.evaluation_date || 0).getTime();
      return tb - ta;
    });
    const allDetails = sorted.flatMap((ev) =>
      getCreditDetailsList(ev).map((d) => ({
        ...d,
        _sourceCreditEvalId: ev.credit_eval_id,
      }))
    );
    groups.push({
      key: groupingKeyForEvaluation(sorted[0]),
      evaluations: sorted,
      primary: sorted[0],
      allDetails,
    });
  }

  groups.sort((a, b) => {
    const ta = new Date(a.primary.evaluation_date || 0).getTime();
    const tb = new Date(b.primary.evaluation_date || 0).getTime();
    return tb - ta;
  });

  return groups;
}

function formatDetailShortLine(detail, otherSchoolSubjectsLookup, subjectsLookup) {
  const ext = formatDetailOtherSchoolSubject(detail, otherSchoolSubjectsLookup);
  const loc = formatDetailEquivalentSubject(detail, subjectsLookup);
  const u = detail.credited_units != null && detail.credited_units !== '' ? detail.credited_units : '—';
  return `${ext} → ${loc} (${u} u.)`;
}

function sumCreditedUnits(details) {
  let t = 0;
  let any = false;
  for (const d of details) {
    const n = Number(d.credited_units);
    if (Number.isFinite(n)) {
      t += n;
      any = true;
    }
  }
  return any ? t : null;
}

function uniqueCreditTypes(evaluations) {
  return [...new Set(evaluations.map((e) => (e.credit_type || '').trim()).filter(Boolean))];
}

function statusCountsForEvaluations(evaluations) {
  const c = {};
  for (const ev of evaluations) {
    const s = (ev.status || 'pending').toLowerCase();
    c[s] = (c[s] || 0) + 1;
  }
  return c;
}

function formatDateRangeSummary(evaluations) {
  const dates = evaluations
    .map((e) => e.evaluation_date)
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));
  if (dates.length === 0) return '—';
  const min = Math.min(...dates);
  const max = Math.max(...dates);
  const fmt = (ts) => new Date(ts).toISOString().slice(0, 10);
  if (min === max) return fmt(min);
  return `${fmt(min)} → ${fmt(max)}`;
}

function uniqueEvaluatorEmails(evaluations) {
  const emails = evaluations.map((e) => e.evaluator?.email || e.evaluator?.Email).filter(Boolean);
  return [...new Set(emails)].join(', ') || '—';
}

function groupRowActive(evaluations) {
  return evaluations.some((e) => e?.is_active !== false);
}

function pickEvaluationForNameDisplay(group) {
  const hasTor = (ev) =>
    ['transfer_first_name', 'transfer_middle_name', 'transfer_last_name'].some((k) =>
      String(ev?.[k] || '').trim()
    );
  return group.evaluations.find(hasTor) || group.primary;
}

function formatCreditEvalStudentLine(evaluation) {
  if (!evaluation) return '—';
  const st = evaluation.student;
  const tf = String(evaluation.transfer_first_name || '').trim();
  const tm = String(evaluation.transfer_middle_name || '').trim();
  const tl = String(evaluation.transfer_last_name || '').trim();
  const num = st && st.student_number ? ` (${st.student_number})` : '';
  if (tf || tm || tl) {
    return `${[tf, tm, tl].filter(Boolean).join(' ')}${num}`;
  }
  if (!st) return `—${num}`;
  const fn = String(st.first_name || '').trim();
  const mn = String(st.middle_name || '').trim();
  const ln = String(st.last_name || '').trim();
  const parts = [fn, mn, ln].filter(Boolean);
  if (parts.length) return `${parts.join(' ')}${num}`;
  const full = String(st.full_name || '').trim();
  return `${full || '—'}${num}`;
}

const SUBJECT_EQUIV_MUTATE_PERMS = [
  'System Management',
  'Credit Evaluation',
  'credit_eval.create',
  'credit_eval.approve',
];

/**
 * @param {{ approvalMode?: boolean, studentInformationMode?: boolean }} props
 *
 * Flow (studentInformationMode — Dean "External transfer credits"):
 * 1. Prior school + external courses (OSS rows are created/reused immediately; no separate approval).
 * 2. Subject equivalence is only a suggestion/helper; saved transfer detail rows with `subject_id` are the real credit decision.
 *
 * When approvalMode (e.g. secretary review), list-focused UI for approve/reject.
 */
const CreditEvaluationManagement = ({
  approvalMode = false,
  studentInformationMode = false,
}) => {
  const { isAdmin, hasAnyPermission } = useAuth();
  const canManageSubjectEquivalences = isAdmin || hasAnyPermission(SUBJECT_EQUIV_MUTATE_PERMS);
  const canApprove =
    !approvalMode ||
    isAdmin ||
    hasAnyPermission(['credit_eval.approve', 'Credit Evaluation']);
  /** Approve permission implies intake workflow (same as Dean); create is explicit for Secretary etc. */
  const canCreateCreditEval =
    isAdmin || hasAnyPermission(['credit_eval.create', 'credit_eval.approve']);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  /** One or more `CreditEvaluation` rows shown together in the details modal (same student + school group). */
  const [detailsModalEvaluations, setDetailsModalEvaluations] = useState([]);
  const [subjectEquivModalOpen, setSubjectEquivModalOpen] = useState(false);
  const [subjectEquivFixedLocal, setSubjectEquivFixedLocal] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(() => ({
    student_id: '',
    school_id: '',
    prior_school_name: '',
    credit_type: 'Transfer',
    evaluated_by: '',
    evaluation_date: '',
    status: 'pending',
    remarks: '',
    transfer_first_name: '',
    transfer_middle_name: '',
    transfer_last_name: '',
    credit_details: [emptyCreditDetail(studentInformationMode ? 'new' : 'catalog')],
  }));
  const [lookupData, setLookupData] = useState({
    students: [],
    schools: [],
    users: [],
    subjects: [],
    otherSchoolSubjects: [],
  });
  /** From Academic Management → Subject Equivalences (used to auto-fill local subject). */
  const [subjectEquivalences, setSubjectEquivalences] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [transferSearch, setTransferSearch] = useState('');
  const [ceListPage, setCeListPage] = useState(1);
  const [ceListPageSize, setCeListPageSize] = useState(10);
  const [torPaste, setTorPaste] = useState('');

  const isActiveEquivalence = (eq) => !eq.status || String(eq.status).toLowerCase() === 'active';

  /** Single source of truth: Laravel nests `other_school_subject` as an object — never key a Map with String(object). */
  const getActiveEquivalencesForOtherId = useCallback(
    (otherId) => {
      const oid = String(otherId || '');
      if (!oid) return [];
      return subjectEquivalences.filter(
        (eq) => isActiveEquivalence(eq) && getEquivalenceOtherSchoolSubjectId(eq) === oid
      );
    },
    [subjectEquivalences]
  );

  useEffect(() => {
    fetchData();
    fetchLookupData();
  }, []);

  useEffect(() => {
    setCeListPage(1);
  }, [statusFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/credit-evaluations');
      setEvaluations(response.data || []);
      setError('');
    } catch (err) {
      console.error('Error fetching credit evaluations:', err);
      setError(err.response?.data?.message || 'Failed to load credit evaluations');
      setEvaluations([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchLookupData = async () => {
    try {
      const [subjectsResp, otherSubjectsResp, equivResp] = await Promise.allSettled([
        api.get('/lookup/subjects'),
        api.get('/other-school-subjects'),
        api.get('/subject-equivalences').catch(() => ({ data: [] })),
      ]);

      setLookupData({
        students: [],
        schools: [],
        users: [],
        subjects: subjectsResp.status === 'fulfilled' ? (subjectsResp.value.data || []) : [],
        otherSchoolSubjects: otherSubjectsResp.status === 'fulfilled' ? (otherSubjectsResp.value.data || []) : [],
      });

      let equivData = equivResp.status === 'fulfilled' ? equivResp.value.data : [];
      if (!Array.isArray(equivData) && equivData && Array.isArray(equivData.data)) {
        equivData = equivData.data;
      }
      setSubjectEquivalences(Array.isArray(equivData) ? equivData : []);
    } catch (err) {
      console.error('Error fetching lookup data:', err);
    }
  };

  const openAddCreditModal = () => {
    setEditingItem(null);
    setTorPaste('');
    setFormData({
      student_id: '',
      school_id: '',
      prior_school_name: '',
      credit_type: 'Transfer',
      evaluated_by: '',
      evaluation_date: '',
      status: 'pending',
      remarks: '',
      transfer_first_name: '',
      transfer_middle_name: '',
      transfer_last_name: '',
      credit_details: [emptyCreditDetail(studentInformationMode ? 'new' : 'catalog')],
    });
    setShowModal(true);
  };

  const handleAdd = () => openAddCreditModal();

  const handleEdit = (item) => {
    setEditingItem(item);
    setTorPaste('');
    const details = getCreditDetailsList(item);
    setFormData({
      student_id: item.student_id || '',
      school_id: item.school_id || '',
      prior_school_name: item.prior_school_name || '',
      credit_type: item.credit_type || 'Transfer',
      evaluated_by: item.evaluated_by || '',
      evaluation_date: item.evaluation_date || new Date().toISOString().split('T')[0],
      status: item.status || 'pending',
      remarks: item.remarks || '',
      transfer_first_name: item.transfer_first_name || '',
      transfer_middle_name: item.transfer_middle_name || '',
      transfer_last_name: item.transfer_last_name || '',
      credit_details: details.length > 0
        ? details.map((detail) => detailRowFromSavedDetail(detail, studentInformationMode))
        : [emptyCreditDetail(studentInformationMode ? 'new' : 'catalog')],
    });
    setShowModal(true);
  };

  const quickSetStatus = async (evaluation, status, { onSuccess } = {}) => {
    if (!canApprove) return;
    try {
      await api.put(`/credit-evaluations/${evaluation.credit_eval_id}`, {
        status,
        remarks: evaluation.remarks || '',
      });
      await fetchData();
      onSuccess?.();
      swalToast('success', status === 'approved' ? 'Marked approved' : 'Marked rejected');
    } catch (err) {
      const msg = err.response?.data?.message || 'Update failed';
      await swalError('Could not update', msg);
    }
  };

  const evaluationGroups = useMemo(
    () => buildEvaluationGroups(evaluations, statusFilter),
    [evaluations, statusFilter]
  );

  const visibleEvaluationGroups = useMemo(() => {
    const q = transferSearch.trim().toLowerCase();
    if (!q) return evaluationGroups;
    return evaluationGroups.filter((group) => {
      const primary = group.primary || {};
      const school = String(primary.school?.school_name || primary.prior_school_name || '').toLowerCase();
      if (school.includes(q)) return true;
      return (group.allDetails || []).some((detail) => {
        const line = formatDetailShortLine(
          detail,
          lookupData.otherSchoolSubjects,
          lookupData.subjects
        ).toLowerCase();
        return line.includes(q);
      });
    });
  }, [evaluationGroups, transferSearch, lookupData.otherSchoolSubjects, lookupData.subjects]);

  const ceTotal = visibleEvaluationGroups.length;
  const ceTotalPages = Math.max(1, Math.ceil(ceTotal / ceListPageSize) || 1);
  const ceEffectivePage = Math.min(Math.max(1, ceListPage), ceTotalPages);
  const ceStart = (ceEffectivePage - 1) * ceListPageSize;
  const pagedEvaluationGroups = visibleEvaluationGroups.slice(ceStart, ceStart + ceListPageSize);

  const openSubjectEquivFromGroup = useCallback((group) => {
    if (!canManageSubjectEquivalences) return;
    const mapped = group?.allDetails?.find((d) => d.subject_id != null && d.subject_id !== '');
    const withOss = group?.allDetails?.find((d) => {
      const oid = d?.other_subject_id ?? d?.other_school_subject?.other_subject_id;
      return oid != null && oid !== '';
    });
    const ossIdRaw =
      withOss?.other_subject_id ??
      withOss?.other_school_subject?.other_subject_id ??
      null;
    const ossNum = ossIdRaw != null && ossIdRaw !== '' ? Number(ossIdRaw) : NaN;
    const linkedOss = Number.isInteger(ossNum) && ossNum > 0 ? ossNum : null;

    if (mapped?.subject_id != null && mapped.subject_id !== '') {
      const s = mapped.subject ?? mapped.Subject;
      setSubjectEquivFixedLocal({
        id: Number(mapped.subject_id),
        code: s?.subject_code || '',
        name: s?.subject_name || '',
        transfer_credit_other_subject_id: linkedOss,
      });
    } else if (linkedOss != null) {
      setSubjectEquivFixedLocal({
        transfer_credit_other_subject_id: linkedOss,
      });
    } else {
      setSubjectEquivFixedLocal(null);
    }
    setSubjectEquivModalOpen(true);
  }, [canManageSubjectEquivalences]);

  const isCreditEvalActive = (record) => record?.is_active !== false;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (approvalMode && editingItem) {
        await api.put(`/credit-evaluations/${editingItem.credit_eval_id}`, {
          status: formData.status,
          remarks: formData.remarks || '',
        });
      } else {
        let data = { ...formData };
        delete data.status;
        if (studentInformationMode) {
          const prior = String(formData.prior_school_name || '').trim();
          const sid = String(formData.school_id || '').trim();
          if (!prior && !sid) {
            await swalError('Prior school required', 'Type the prior school name (as on the transcript).');
            return;
          }
          for (let i = 0; i < formData.credit_details.length; i++) {
            const d = formData.credit_details[i];
            const isNew = d.oss_entry_mode === 'new';
            if (isNew) {
              if (!String(d.external_subject_code || '').trim()) {
                await swalError('Course code required', `Row ${i + 1}: enter the external course code (and optional title).`);
                return;
              }
            } else if (!String(d.other_subject_id || '').trim()) {
              await swalError('External subject required', `Row ${i + 1}: pick a catalog course or choose "New (not in list yet)".`);
              return;
            }
            const u = Number(d.credited_units);
            if (d.credited_units === '' || d.credited_units == null || !Number.isFinite(u) || !Number.isInteger(u) || u < 0) {
              await swalError('Units required', `Row ${i + 1}: enter a whole number of units for this course.`);
              return;
            }
          }
          const seenCatalogOss = new Set();
          const seenNewCodes = new Set();
          for (let i = 0; i < formData.credit_details.length; i++) {
            const d = formData.credit_details[i];
            const isNew = d.oss_entry_mode === 'new';
            if (isNew) {
              const code = String(d.external_subject_code || '').trim().toLowerCase();
              if (code && seenNewCodes.has(code)) {
                await swalError(
                  'Duplicate external course',
                  `The same course code appears more than once (see row ${i + 1}). Use a single row or increase units there.`
                );
                return;
              }
              if (code) seenNewCodes.add(code);
            } else {
              const oid = String(d.other_subject_id || '').trim();
              if (oid && seenCatalogOss.has(oid)) {
                await swalError(
                  'Duplicate external subject',
                  'The same catalog external course is listed twice. Remove the duplicate row.'
                );
                return;
              }
              if (oid) seenCatalogOss.add(oid);
            }
          }
          const rosterId = String(formData.student_id || '').trim();
          data = {
            student_id: rosterId ? Number(rosterId) : null,
            school_id: formData.school_id || null,
            prior_school_name: prior || null,
            credit_type: String(formData.credit_type || '').trim() || 'Transfer',
            remarks: String(formData.remarks || '').trim() || null,
            transfer_first_name: String(formData.transfer_first_name || '').trim() || null,
            transfer_middle_name: String(formData.transfer_middle_name || '').trim() || null,
            transfer_last_name: String(formData.transfer_last_name || '').trim() || null,
            credit_details: formData.credit_details.map((d) => {
              const isNew = d.oss_entry_mode === 'new';
              const extCode = String(d.external_subject_code || '').trim();
              const extName = String(d.external_subject_name || '').trim();
              return {
                other_subject_id:
                  isNew || !String(d.other_subject_id || '').trim() ? null : Number(d.other_subject_id),
                external_subject_code: isNew && extCode ? extCode : null,
                external_subject_name: isNew ? extName || extCode || null : null,
                subject_id:
                  d.subject_id !== '' && d.subject_id != null && String(d.subject_id).trim() !== ''
                    ? Number(d.subject_id)
                    : null,
                credited_units:
                  d.credited_units === '' || d.credited_units == null
                    ? null
                    : Math.round(Number(d.credited_units)),
                credit_basis: d.credit_basis ? String(d.credit_basis).trim() : null,
                remarks: d.remarks ? String(d.remarks).trim() : null,
              };
            }),
          };
          data.student_information_intake = true;
        } else {
          for (let i = 0; i < formData.credit_details.length; i++) {
            const d = formData.credit_details[i];
            if (!String(d.subject_id || '').trim()) {
              await swalError('Local subject required', `Row ${i + 1}: select the equivalent local subject.`);
              return;
            }
          }
        }
        if (editingItem) {
          await api.put(`/credit-evaluations/${editingItem.credit_eval_id}`, data);
        } else if (studentInformationMode) {
          await api.post('/credit-evaluations', data);
        } else {
          data.status = 'pending';
          await api.post('/credit-evaluations', data);
        }
      }

      setShowModal(false);
      await fetchData();
      fetchLookupData();
      swalToast(
        'success',
        editingItem
          ? studentInformationMode
            ? 'Transfer record updated'
            : 'Credit evaluation updated'
          : studentInformationMode
            ? 'Transfer record created'
            : 'Credit evaluation created'
      );
    } catch (err) {
      const msg = err.response?.data?.message || `Failed to ${editingItem ? 'update' : 'create'} credit evaluation`;
      setError(msg);
      await swalError('Save failed', msg);
    }
  };

  const addCreditDetail = () => {
    setFormData({
      ...formData,
      credit_details: [
        ...formData.credit_details,
        emptyCreditDetail(studentInformationMode ? 'new' : 'catalog'),
      ],
    });
  };

  /** Full credit-eval modal (non–transfer-intake): append a typed external line without catalog OSS. */
  const addCreditDetailNew = () => {
    setFormData({
      ...formData,
      credit_details: [...formData.credit_details, emptyCreditDetail('new')],
    });
  };

  const removeCreditDetail = (index) => {
    const newDetails = formData.credit_details.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      credit_details:
        newDetails.length > 0 ? newDetails : [emptyCreditDetail(studentInformationMode ? 'new' : 'catalog')],
    });
  };

  const updateCreditDetail = (index, field, value) => {
    const newDetails = [...formData.credit_details];
    newDetails[index][field] = value;
    setFormData({ ...formData, credit_details: newDetails });
  };

  /** Build one credit detail row from an other-school subject id, applying first active Subject Equivalence when present. */
  const buildDetailFromOtherSubjectId = useCallback(
    (rawOtherId) => {
      const otherId = rawOtherId === '' || rawOtherId == null ? '' : String(rawOtherId);
      const next = {
        oss_entry_mode: 'catalog',
        other_subject_id: otherId,
        external_subject_code: '',
        external_subject_name: '',
        subject_id: '',
        credited_units: '',
        credit_basis: '',
        remarks: '',
      };
      if (!otherId) return next;
      const active = getActiveEquivalencesForOtherId(otherId);
      if (active.length >= 1) {
        const eq = active[0];
        next.subject_id = getEquivalenceSubjectId(eq);
        next.credited_units = eq.credited_units != null && eq.credited_units !== '' ? eq.credited_units : '';
        next.credit_basis = eq.credit_basis || '';
      }
      return next;
    },
    [getActiveEquivalencesForOtherId]
  );

  /** When external subject changes, apply saved Subject Equivalence (local subject, units, basis). */
  const handleOtherSubjectChange = (index, rawValue) => {
    const otherId = rawValue === '' || rawValue == null ? '' : String(rawValue);
    const newDetails = formData.credit_details.map((row, i) => {
      if (i !== index) return row;
      return buildDetailFromOtherSubjectId(otherId);
    });
    setFormData({ ...formData, credit_details: newDetails });
  };

  const applyEquivalencesToAllRows = () => {
    setFormData((prev) => ({
      ...prev,
      credit_details: prev.credit_details.map((row) =>
        row.oss_entry_mode !== 'new' && row.other_subject_id
          ? buildDetailFromOtherSubjectId(row.other_subject_id)
          : row
      ),
    }));
    swalToast('success', 'Applied subject equivalences to all rows with a catalog external subject selected');
  };

  const addRowsFromPastedCodes = async () => {
    const prior = String(formData.prior_school_name || '').trim();
    const lines = torPaste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      await swalError(
        'Nothing to add',
        'Paste one course code per line (optional: code TAB name). Codes must match Other School Subjects for the selected school.'
      );
      return;
    }

    if (!prior && !formData.school_id) {
      await swalError(
        'Prior school required',
        'Enter the prior school name (as on the transcript), then paste course codes.'
      );
      return;
    }
    const schoolSubjects = formData.school_id
      ? (lookupData.otherSchoolSubjects || []).filter((s) => String(s.school_id) === String(formData.school_id))
      : lookupData.otherSchoolSubjects || [];
    const existingCatalog = new Set(
      formData.credit_details.map((d) => String(d.other_subject_id || '')).filter(Boolean)
    );
    const existingNewCodes = new Set(
      formData.credit_details
        .filter((d) => d.oss_entry_mode === 'new' && String(d.external_subject_code || '').trim())
        .map((d) => String(d.external_subject_code || '').trim().toLowerCase())
    );
    const newRows = [];
    const missing = [];
    const addedAsNewCodes = [];
    for (const line of lines) {
      const parts = line.split(/[\t,|]/);
      const code = (parts[0] || '').trim();
      const nameFromLine = (parts[1] || '').trim();
      if (!code) continue;
      const match = schoolSubjects.find((s) => (s.subject_code || '').trim().toLowerCase() === code.toLowerCase());
      if (match) {
        const idStr = String(match.other_subject_id);
        if (existingCatalog.has(idStr)) continue;
        existingCatalog.add(idStr);
        newRows.push(buildDetailFromOtherSubjectId(idStr));
        continue;
      }
      if (String(formData.prior_school_name || '').trim() || formData.school_id) {
        const nk = code.toLowerCase();
        if (existingNewCodes.has(nk)) continue;
        existingNewCodes.add(nk);
        newRows.push({
          ...emptyCreditDetail('new'),
          external_subject_code: code,
          external_subject_name: nameFromLine || code,
        });
        addedAsNewCodes.push(code);
        continue;
      }
      missing.push(code);
    }
    if (newRows.length === 0 && missing.length === 0 && addedAsNewCodes.length === 0) {
      await swalError('No new rows', 'Every line is already listed or empty.');
      return;
    }
    const isRowBlank = (r) =>
      !String(r.other_subject_id || '').trim() &&
      !String(r.subject_id || '').trim() &&
      !String(r.external_subject_code || '').trim();
    setFormData((prev) => {
      const base = prev.credit_details;
      const onlyBlank = base.length === 1 && isRowBlank(base[0]);
      const merged = onlyBlank ? [...newRows] : [...base, ...newRows];
      return {
        ...prev,
        credit_details: merged.length ? merged : [emptyCreditDetail('catalog')],
      };
    });
    if (newRows.length) {
      const parts = [];
      if (addedAsNewCodes.length) {
        parts.push(`${addedAsNewCodes.length} new — saved as Other School Subjects when you submit`);
      }
      const catCount = newRows.length - addedAsNewCodes.length;
      if (catCount) parts.push(`${catCount} from catalog`);
      swalToast('success', `Added ${newRows.length} row(s) from paste${parts.length ? ` (${parts.join('; ')})` : ''}`);
    }
    if (missing.length) {
      await swalError(
        'Some codes were skipped',
        `No catalog match for this school: ${missing.slice(0, 15).join(', ')}${missing.length > 15 ? '…' : ''}.`
      );
    }
    setTorPaste('');
  };

  const getEquivalentSubjectOptions = (detail) => {
    const oid = detail.other_subject_id;
    const noCatalogExternal = detail.oss_entry_mode === 'new' || !oid;
    let opts;
    if (noCatalogExternal) {
      opts = lookupData.subjects;
    } else {
      const active = getActiveEquivalencesForOtherId(oid);
      if (active.length === 0) {
        opts = lookupData.subjects;
      } else {
        const allowed = new Set(active.map((e) => getEquivalenceSubjectId(e)).filter(Boolean));
        const filtered = lookupData.subjects.filter((s) => allowed.has(String(s.subject_id)));
        opts = filtered.length > 0 ? filtered : lookupData.subjects;
      }
    }
    const sid = detail.subject_id;
    if (!sid || opts.some((s) => String(s.subject_id) === String(sid))) return opts;
    const extra = lookupData.subjects.find((s) => String(s.subject_id) === String(sid));
    return extra ? [...opts, extra] : opts;
  };

  const hasEquivalenceForOther = (detail) => {
    if (detail.oss_entry_mode === 'new') return false;
    const oid = detail.other_subject_id;
    if (!oid) return false;
    return getActiveEquivalencesForOtherId(oid).length > 0;
  };

  const creditDetailOssOptions = useMemo(() => {
    let list = lookupData.otherSchoolSubjects || [];
    if (formData.school_id) {
      list = list.filter((s) => String(s.school_id) === String(formData.school_id));
    }
    return list.map((subj) => ({
      value: String(subj.other_subject_id),
      label: `${subj.subject_code} - ${subj.subject_name}`,
    }));
  }, [lookupData.otherSchoolSubjects, formData.school_id]);

  const mapSubjectsToOptions = useCallback((subjects) => {
    if (!Array.isArray(subjects)) return [];
    return subjects.map((subj) => ({
      value: String(subj.subject_id),
      label: `${subj.subject_code} - ${subj.subject_name}`,
    }));
  }, []);

  if (loading) {
    return (
      <div className="loading">
        {studentInformationMode ? 'Loading transfer records…' : 'Loading credit evaluations…'}
      </div>
    );
  }

  return (
    <div className={`credit-evaluation-management${studentInformationMode ? ' credit-evaluation-management--student-info' : ''}`}>
      <div className="management-header">
        <div className="ce-header-copy">
          <h2>
            {approvalMode
              ? 'Credit evaluation (review)'
              : studentInformationMode
                ? 'Subject crediting'
                : 'Credit Evaluation Management'}
          </h2>
          {studentInformationMode ? (
            <p className="ce-header-subtitle">
              External transfer credits from prior schools. Map courses to local subjects when you evaluate.
            </p>
          ) : null}
        </div>
        {canCreateCreditEval && (
          <button type="button" className="add-button" onClick={handleAdd}>
            {studentInformationMode ? 'Add transfer record' : 'Add credit evaluation'}
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {studentInformationMode ? (
        <div className="ce-student-info-toolbar">
          <div className="ce-student-info-search-wrap">
            <label htmlFor="ce-transfer-search" className="ce-student-info-search-label">
              Search
            </label>
            <input
              id="ce-transfer-search"
              type="search"
              className="ce-student-info-search"
              placeholder="Search by school or subject…"
              value={transferSearch}
              onChange={(e) => {
                setTransferSearch(e.target.value);
                setCeListPage(1);
              }}
              autoComplete="off"
            />
          </div>
        </div>
      ) : null}

      {approvalMode && (
        <div className="credit-eval-filters" role="tablist" aria-label="Filter by status">
          {['all', 'pending', 'approved', 'rejected'].map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={statusFilter === f}
              className={`credit-eval-filter-chip ${statusFilter === f ? 'active' : ''}`}
              onClick={() => setStatusFilter(f)}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      )}

      <div className="table-container">
        <table className="data-table credit-eval-grouped-table">
          <thead>
            <tr>
              {!studentInformationMode && <th>Student (first · middle · last)</th>}
              <th>Prior school</th>
              <th>
                {studentInformationMode ? 'Prior-school subjects' : 'Credited subjects (external → local)'}
              </th>
              <th>Σ Units</th>
              {!studentInformationMode && (
                <>
                  <th>Credit types</th>
                  <th>Evaluation date(s)</th>
                  <th>Status</th>
                  <th>Evaluated by</th>
                </>
              )}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleEvaluationGroups.length === 0 ? (
              <tr>
                <td colSpan={studentInformationMode ? 4 : 9} className="no-data">
                  No credit evaluations found
                    {transferSearch.trim() ? ' matching your search' : ''}
                </td>
              </tr>
            ) : (
              pagedEvaluationGroups.map((group) => {
                const evs = group.evaluations;
                const primary = group.primary;
                const rowActive = groupRowActive(evs);
                const statusCounts = !studentInformationMode ? statusCountsForEvaluations(evs) : null;
                const unitSum = sumCreditedUnits(group.allDetails);
                const types = !studentInformationMode ? uniqueCreditTypes(evs) : [];
                const recordCount = evs.length;
                return (
                  <tr
                    key={group.key}
                    className={!rowActive ? 'credit-eval-row-inactive' : undefined}
                    title={
                      recordCount > 1
                        ? `${recordCount} credit evaluation records grouped for this school`
                        : undefined
                    }
                  >
                    {!studentInformationMode ? (
                      <td>
                        <span className="ce-student-line">
                          {formatCreditEvalStudentLine(pickEvaluationForNameDisplay(group))}
                        </span>
                        {recordCount > 1 ? (
                          <span className="ce-group-record-count">{recordCount} records</span>
                        ) : null}
                      </td>
                    ) : null}
                    <td>{primary.school?.school_name || primary.prior_school_name || '—'}</td>
                    <td className="ce-group-subjects-cell">
                      {group.allDetails.length === 0 ? (
                        <span className="ce-group-empty">—</span>
                      ) : (
                        <ul className="ce-group-subjects-list">
                          {group.allDetails.map((detail, idx) => (
                            <li key={detail.credit_detail_id || `${detail._sourceCreditEvalId}-${idx}`}>
                              {formatDetailShortLine(
                                detail,
                                lookupData.otherSchoolSubjects,
                                lookupData.subjects
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="ce-group-units-sum">{unitSum != null ? unitSum : '—'}</td>
                    {!studentInformationMode && (
                      <>
                        <td className="ce-group-types-cell">{types.length ? types.join(', ') : '—'}</td>
                        <td>{formatDateRangeSummary(evs)}</td>
                        <td className="credit-eval-status-cell">
                          <div className="credit-eval-status-inline credit-eval-status-inline--wrap">
                            {statusCounts &&
                              Object.entries(statusCounts).map(([st, n]) => (
                                <span key={st} className={`status-badge status-${st}`} title={`${n} evaluation(s)`}>
                                  {n > 1 ? `${n}× ` : ''}
                                  {st.charAt(0).toUpperCase() + st.slice(1)}
                                </span>
                              ))}
                            {!rowActive && (
                              <span
                                className="status-badge status-record-inactive"
                                title="All records in this group are inactive"
                              >
                                Inactive
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="ce-group-evaluators-cell">{uniqueEvaluatorEmails(evs)}</td>
                      </>
                    )}
                    <td className="credit-eval-actions-cell">
                      <div className="ce-action-group" role="group" aria-label="Transfer record actions">
                        <button
                          type="button"
                          className="ce-action-btn ce-action-btn--view"
                          onClick={() => {
                            setDetailsModalEvaluations(evs);
                            setShowDetailsModal(true);
                          }}
                        >
                          Details
                        </button>
                        {(!approvalMode || canApprove) && (
                          <button
                            type="button"
                            className="ce-action-btn ce-action-btn--edit"
                            onClick={() => handleEdit(primary)}
                            title={
                              recordCount > 1
                                ? 'Edit the most recent evaluation for this school (add lines there or open other records from Details)'
                                : undefined
                            }
                          >
                            {approvalMode ? 'Status' : 'Edit'}
                          </button>
                        )}
                        {canManageSubjectEquivalences && (
                          <button
                            type="button"
                            className="ce-action-btn ce-action-btn--map"
                            onClick={() => openSubjectEquivFromGroup(group)}
                            title="Map prior-school course to a catalog subject"
                          >
                            Map
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <ClientPaginationBar
          page={ceEffectivePage}
          pageSize={ceListPageSize}
          totalItems={ceTotal}
          totalPages={ceTotalPages}
          onPageChange={setCeListPage}
          onPageSizeChange={(n) => {
            setCeListPageSize(n);
            setCeListPage(1);
          }}
        />
      </div>

      {showModal &&
        createPortal(
          <div className="credit-evaluation-management">
            <div className="modal-overlay" onClick={() => setShowModal(false)}>
              <div
                className={`modal-content${studentInformationMode && !(approvalMode && editingItem) ? ' modal-content--transfer' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="credit-evaluation-modal-title"
                tabIndex="-1"
                onClick={(e) => e.stopPropagation()}
              >
            <div className="modal-header">
              <h3 id="credit-evaluation-modal-title">
                {approvalMode && editingItem
                  ? 'Review credit request'
                  : studentInformationMode
                    ? `${editingItem ? 'Edit' : 'Add'} transfer record`
                    : `${editingItem ? 'Edit' : 'Add'} Credit Evaluation`}
              </h3>
              <button
                type="button"
                className="close-button"
                onClick={() => setShowModal(false)}
                aria-label="Close credit evaluation form"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              {error && <div className="error-message">{error}</div>}

              {approvalMode && editingItem ? (
                <>
                  <p className="help-text" style={{ marginBottom: '1rem', color: '#555' }}>
                    Set the decision for this credit request. Only status and remarks are saved.
                  </p>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Remarks</label>
                    <textarea
                      value={formData.remarks}
                      onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                      rows="4"
                    />
                  </div>
                  <div className="form-actions">
                    <button type="button" className="cancel-button" onClick={() => setShowModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="submit-button">
                      Save decision
                    </button>
                  </div>
                </>
              ) : (
                <>
              {studentInformationMode ? (
                <div className="form-group">
                  <label htmlFor="ce-prior-school">
                    Prior school (as on transcript) <span className="required">*</span>
                  </label>
                  <input
                    id="ce-prior-school"
                    type="text"
                    value={formData.prior_school_name}
                    onChange={(e) => setFormData({ ...formData, prior_school_name: e.target.value })}
                    placeholder="e.g. Demo State University — name of the school they transferred from"
                    autoComplete="organization"
                  />
                </div>
              ) : null}

              {studentInformationMode ? (
                <div className="form-group ce-transfer-section">
                  <div className="ce-transfer-section__head">
                    <label>
                      Subjects at prior school <span className="required">*</span>
                    </label>
                    <p className="credit-equiv-hint">
                      One row per prior-school course. Local catalog mapping can wait until evaluation.
                    </p>
                  </div>
                  <div className="ce-transfer-rows">
                    {formData.credit_details.map((detail, index) => (
                      <div key={index} className="ce-transfer-detail-row">
                        <div className="form-group ce-transfer-grid-field">
                          <label htmlFor={`ce-tf-code-${index}`}>
                            Course code <span className="required">*</span>
                          </label>
                          <input
                            id={`ce-tf-code-${index}`}
                            type="text"
                            value={detail.external_subject_code}
                            onChange={(e) => {
                              const v = e.target.value;
                              setFormData({
                                ...formData,
                                credit_details: formData.credit_details.map((r, i) =>
                                  i === index ? { ...r, external_subject_code: v, other_subject_id: '' } : r
                                ),
                              });
                            }}
                            placeholder="e.g. ITE 401"
                            autoComplete="off"
                          />
                        </div>
                        <div className="form-group ce-transfer-grid-field ce-transfer-grid-field--title">
                          <label htmlFor={`ce-tf-title-${index}`}>Course title</label>
                          <input
                            id={`ce-tf-title-${index}`}
                            type="text"
                            value={detail.external_subject_name}
                            onChange={(e) => {
                              const v = e.target.value;
                              setFormData({
                                ...formData,
                                credit_details: formData.credit_details.map((r, i) =>
                                  i === index ? { ...r, external_subject_name: v, other_subject_id: '' } : r
                                ),
                              });
                            }}
                            placeholder="As on TOR (optional)"
                            autoComplete="off"
                          />
                        </div>
                        <div className="form-group ce-transfer-grid-field ce-transfer-grid-field--units">
                          <label htmlFor={`ce-tf-units-${index}`}>
                            Units <span className="required">*</span>
                          </label>
                          <input
                            id={`ce-tf-units-${index}`}
                            type="number"
                            min="0"
                            step="any"
                            value={detail.credited_units}
                            onChange={(e) => updateCreditDetail(index, 'credited_units', e.target.value)}
                            placeholder="3"
                          />
                        </div>
                        {formData.credit_details.length > 1 ? (
                          <div className="ce-transfer-remove-wrap">
                            <span className="ce-transfer-remove-label" aria-hidden="true">
                              &nbsp;
                            </span>
                            <button
                              type="button"
                              className="ce-transfer-remove-btn"
                              onClick={() => removeCreditDetail(index)}
                              aria-label={`Remove subject row ${index + 1}`}
                            >
                              Remove
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="credit-eval-add-detail-actions">
                    <button type="button" className="add-detail-button" onClick={addCreditDetail}>
                      + Add subject row
                    </button>
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label>Credit Details <span className="required">*</span></label>
                  <p className="credit-equiv-hint">
                    Pick the school of origin first. Subject Equivalences only suggest a matching local subject, units,
                    and basis; the saved transfer row is the actual student credit decision.
                  </p>
                  <div className="credit-eval-bulk-actions">
                    <button type="button" className="add-detail-button" onClick={applyEquivalencesToAllRows}>
                      Apply subject equivalences to all rows
                    </button>
                  </div>
                  <div className="credit-eval-paste-block">
                    <label htmlFor="ce-tor-paste">Paste external course codes (one per line)</label>
                    <textarea
                      id="ce-tor-paste"
                      className="credit-eval-paste-textarea"
                      rows={4}
                      value={torPaste}
                      onChange={(e) => setTorPaste(e.target.value)}
                      placeholder={'ITE 401\nSSP 008\nOr: CODE then TAB and description'}
                    />
                    <button type="button" className="add-detail-button" onClick={addRowsFromPastedCodes}>
                      Add rows from pasted codes
                    </button>
                  </div>
                  {formData.credit_details.map((detail, index) => (
                    <div key={index} className="credit-detail-row">
                      <div className="detail-fields">
                        {detail.oss_entry_mode === 'new' ? (
                          <>
                            <div className="form-group ce-new-oss-fields">
                              <label htmlFor={`ce-new-code-${index}`}>
                                External course code <span className="required">*</span>
                              </label>
                              <input
                                id={`ce-new-code-${index}`}
                                type="text"
                                value={detail.external_subject_code}
                                onChange={(e) => updateCreditDetail(index, 'external_subject_code', e.target.value)}
                                placeholder="e.g. ITE 401"
                                autoComplete="off"
                              />
                            </div>
                            <div className="form-group ce-new-oss-fields">
                              <label htmlFor={`ce-new-name-${index}`}>Course title (as on TOR)</label>
                              <input
                                id={`ce-new-name-${index}`}
                                type="text"
                                value={detail.external_subject_name}
                                onChange={(e) => updateCreditDetail(index, 'external_subject_name', e.target.value)}
                                placeholder="Optional if same as code"
                                autoComplete="off"
                              />
                            </div>
                          </>
                        ) : (
                          <SearchableSelect
                            id={`ce-detail-oss-${index}`}
                            value={detail.other_subject_id === '' || detail.other_subject_id == null ? '' : String(detail.other_subject_id)}
                            onChange={(v) => handleOtherSubjectChange(index, v)}
                            options={creditDetailOssOptions}
                            emptyLabel="Select Other School Subject"
                            placeholder="Search external subject…"
                            required
                            aria-label={`Other school subject, row ${index + 1}`}
                          />
                        )}
                        <SearchableSelect
                          id={`ce-detail-local-${index}`}
                          value={detail.subject_id === '' || detail.subject_id == null ? '' : String(detail.subject_id)}
                          onChange={(v) => updateCreditDetail(index, 'subject_id', v)}
                          options={mapSubjectsToOptions(getEquivalentSubjectOptions(detail))}
                          emptyLabel="Select Equivalent Subject"
                          placeholder="Search local subject…"
                          required
                          aria-label={`Equivalent local subject, row ${index + 1}`}
                        />
                        {detail.oss_entry_mode !== 'new' && detail.other_subject_id && !hasEquivalenceForOther(detail) && (
                          <span className="credit-equiv-warning">
                            No active equivalence for this external subject — choose a local subject manually or add an
                            equivalence in the database.
                          </span>
                        )}
                        <input
                          type="number"
                          value={detail.credited_units}
                          onChange={(e) => updateCreditDetail(index, 'credited_units', e.target.value)}
                          placeholder="Credited Units"
                        />
                        <input
                          type="text"
                          value={detail.credit_basis}
                          onChange={(e) => updateCreditDetail(index, 'credit_basis', e.target.value)}
                          placeholder="Credit Basis (TOR, Syllabus)"
                        />
                        <input
                          type="text"
                          value={detail.remarks}
                          onChange={(e) => updateCreditDetail(index, 'remarks', e.target.value)}
                          placeholder="Remarks"
                        />
                      </div>
                      {formData.credit_details.length > 1 && (
                        <button type="button" className="remove-detail-button" onClick={() => removeCreditDetail(index)}>
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="credit-eval-add-detail-actions">
                    <button type="button" className="add-detail-button" onClick={addCreditDetail}>
                      + Add from catalog
                    </button>
                    <button type="button" className="add-detail-button add-detail-button--secondary" onClick={addCreditDetailNew}>
                      + Add new external course
                    </button>
                  </div>
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="cancel-button" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="submit-button">
                  {editingItem ? 'Update' : 'Create'}
                </button>
              </div>
                </>
              )}
            </form>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showDetailsModal &&
        detailsModalEvaluations.length > 0 &&
        createPortal(
          <div className="credit-evaluation-management">
            <div
              className="modal-overlay"
              onClick={() => {
                setShowDetailsModal(false);
                setDetailsModalEvaluations([]);
              }}
            >
              <div
                className="modal-content modal-content--credit-details-wide"
                role="dialog"
                aria-modal="true"
                aria-labelledby="credit-details-modal-title"
                tabIndex="-1"
                onClick={(e) => e.stopPropagation()}
              >
            <div className="modal-header">
              <h3 id="credit-details-modal-title">
                {studentInformationMode ? 'Transfer subjects' : 'Credit evaluation details'}
              </h3>
              <button
                type="button"
                className="close-button"
                onClick={() => {
                  setShowDetailsModal(false);
                  setDetailsModalEvaluations([]);
                }}
                aria-label="Close credit evaluation details"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {(() => {
                const head = detailsModalEvaluations[0];
                return (
                  <div className="details-section">
                    <h4>{studentInformationMode ? 'Prior school' : 'Student & school'}</h4>
                    {!studentInformationMode ? (
                      <div className="detail-row">
                        <strong>Student:</strong>
                        <span>{formatCreditEvalStudentLine(head)}</span>
                      </div>
                    ) : null}
                    <div className="detail-row">
                      <strong>{studentInformationMode ? 'Prior school:' : 'School:'}</strong>
                      <span>{head.school?.school_name || head.prior_school_name || '—'}</span>
                    </div>
                    {detailsModalEvaluations.length > 1 ? (
                      <p className="ce-details-merge-note">
                        {studentInformationMode ? (
                          <>
                            There are <strong>{detailsModalEvaluations.length}</strong> transfer batches for this school.
                            Each section below lists the prior-school courses for one batch.
                          </>
                        ) : (
                          <>
                            This view groups <strong>{detailsModalEvaluations.length}</strong> separate evaluations for
                            the same student and school. Each record keeps its own status and subject lines below.
                          </>
                        )}
                      </p>
                    ) : null}
                  </div>
                );
              })()}

              {detailsModalEvaluations.map((evaluation) => {
                const st = (evaluation.status || 'pending').toLowerCase();
                const details = getCreditDetailsList(evaluation);
                const rowActive = isCreditEvalActive(evaluation);
                return (
                  <div key={evaluation.credit_eval_id} className="details-section ce-details-one-record">
                    {!studentInformationMode ? (
                      <>
                        <h4>
                          Evaluation #{evaluation.credit_eval_id}
                          <span className="ce-details-record-meta">
                            {' '}
                            · {evaluation.credit_type || '—'} · {evaluation.evaluation_date || '—'}
                          </span>
                        </h4>
                        <div className="detail-row">
                          <strong>Evaluated by:</strong>
                          <span>{evaluation.evaluator?.email || evaluation.evaluator?.Email || '—'}</span>
                        </div>
                        {evaluation.remarks ? (
                          <div className="detail-row">
                            <strong>Remarks:</strong>
                            <span>{evaluation.remarks}</span>
                          </div>
                        ) : null}
                        <div className="detail-row credit-detail-status-row">
                          <strong>Status:</strong>
                          <span className={`status-badge status-${st}`}>{evaluation.status || 'Pending'}</span>
                          {!rowActive && (
                            <span
                              className="status-badge status-record-inactive"
                              title="Not applied to transfer credits"
                            >
                              Inactive
                            </span>
                          )}
                        </div>
                        {!rowActive && (
                          <p className="credit-eval-inactive-notice">
                            This evaluation is <strong>inactive</strong> and does not apply toward transfer credits on
                            the student record.
                          </p>
                        )}
                      </>
                    ) : null}
                    <h5 className="ce-details-subheading">
                      {studentInformationMode ? 'Prior-school subjects' : 'Credited subjects'} ({details.length})
                    </h5>
                    {details.length > 0 ? (
                      <table className="details-table">
                        <thead>
                          <tr>
                            <th>Other school subject</th>
                            <th>Local equivalent</th>
                            <th>Credited units</th>
                            <th>Credit basis</th>
                            <th>Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {details.map((detail, index) => (
                            <tr key={detail.credit_detail_id || `${evaluation.credit_eval_id}-${index}`}>
                              <td>{formatDetailOtherSchoolSubject(detail, lookupData.otherSchoolSubjects)}</td>
                              <td>{formatDetailEquivalentSubject(detail, lookupData.subjects)}</td>
                              <td>{detail.credited_units ?? '—'}</td>
                              <td>{detail.credit_basis || '—'}</td>
                              <td>{detail.remarks || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="no-data">No credit lines on this record.</p>
                    )}
                    {!studentInformationMode &&
                    st === 'pending' &&
                    canApprove &&
                    (approvalMode || isAdmin) ? (
                      <div className="ce-details-inline-actions">
                        <button
                          type="button"
                          className="approve-quick-btn"
                          onClick={() =>
                            quickSetStatus(evaluation, 'approved', {
                              onSuccess: () => {
                                setShowDetailsModal(false);
                                setDetailsModalEvaluations([]);
                              },
                            })
                          }
                        >
                          Approve this record
                        </button>
                        <button
                          type="button"
                          className="reject-quick-btn"
                          onClick={() =>
                            quickSetStatus(evaluation, 'rejected', {
                              onSuccess: () => {
                                setShowDetailsModal(false);
                                setDetailsModalEvaluations([]);
                              },
                            })
                          }
                        >
                          Reject this record
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="modal-footer credit-details-modal-footer">
              <button
                type="button"
                className="modal-footer-close-btn"
                onClick={() => {
                  setShowDetailsModal(false);
                  setDetailsModalEvaluations([]);
                }}
              >
                Close
              </button>
              </div>
            </div>
            </div>
          </div>,
          document.body
        )}

      <SubjectEquivalenceQuickModal
        open={subjectEquivModalOpen}
        fixedLocal={subjectEquivFixedLocal}
        sourceContext={studentInformationMode ? 'student-information' : null}
        onClose={() => {
          setSubjectEquivModalOpen(false);
          setSubjectEquivFixedLocal(null);
        }}
        onSaved={() => fetchLookupData()}
      />
    </div>
  );
};

export default CreditEvaluationManagement;

