import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../../api/axios';
import { swalConfirm, swalSuccess, swalError } from '../../utils/swal';
import useDialogFocus from '../../hooks/useDialogFocus';
import SearchableSelect from '../common/SearchableSelect';
import './CsvImport.css';

/** For sis_mixed preview: put row-type and grade fields first so they are visible without horizontal scroll. */
const SIS_MIXED_PREVIEW_COLUMN_PRIORITY = [
  'record_type',
  'student_id_number',
  'subject_code',
  'grade',
  'evaluation_status',
  'academic_year_id',
  'semester_id',
  'section_id',
  'requisite_subject_code',
  'requisite_type',
  'enrolled_date',
  'evaluation_date',
  'modality_id',
  'inc_compliance_deadline',
  'first_name',
  'last_name',
  'email',
  'program_id',
  'year_level_id',
  'contact_number',
  'address',
  'academic_status',
  'status',
  'password',
];

function orderPreviewHeaders(importTypeKey, headers) {
  if (!Array.isArray(headers) || headers.length === 0) return [];
  if (importTypeKey === 'sis_grade_deliberation') {
    return headers;
  }
  if (importTypeKey !== 'sis_mixed') return headers;
  const seen = new Set();
  const ordered = [];
  for (const h of SIS_MIXED_PREVIEW_COLUMN_PRIORITY) {
    if (headers.includes(h)) {
      ordered.push(h);
      seen.add(h);
    }
  }
  for (const h of headers) {
    if (!seen.has(h)) {
      ordered.push(h);
      seen.add(h);
    }
  }
  return ordered;
}

const PREVIEW_PAGE_SIZE = 50;
const SIS_INTERNAL_COLUMN_GROUP_TITLES = new Set(['Mapped system fields']);

function rowSearchText(row) {
  const data = row?.data && typeof row.data === 'object' ? row.data : {};
  const parts = [
    row?.row_number,
    data['STUDENT ID'],
    data['NAME'],
    data.student_id_number,
    data.first_name,
    data.last_name,
    data.email,
    ...(Array.isArray(row?.errors) ? row.errors : []),
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function previewRowStudentId(row) {
  const data = row?.data && typeof row.data === 'object' ? row.data : {};
  return String(
    data['STUDENT ID'] ||
      data.IDNO ||
      data.student_id_number ||
      data.Student_ID ||
      ''
  )
    .trim()
    .toLowerCase();
}

function previewRowRemarksText(row) {
  const data = row?.data && typeof row.data === 'object' ? row.data : {};
  return String(
    data.REMARKS ||
      data.REMARKS_FINAL ||
      data.evaluation_status ||
      data['FINAL REMARKS'] ||
      ''
  )
    .trim()
    .toLowerCase();
}

function previewRowGradeText(row) {
  const data = row?.data && typeof row.data === 'object' ? row.data : {};
  return String(
    data.GRADE ||
      data['FINAL GRADE'] ||
      data.GRADE_FINAL ||
      data.grade ||
      ''
  )
    .trim()
    .toLowerCase();
}

/** True when the preview row looks like a failed subject outcome. */
function previewRowIsFailed(row) {
  const remarks = previewRowRemarksText(row);
  if (
    remarks === 'failed' ||
    remarks === 'fail' ||
    remarks === 'f' ||
    remarks.includes('failed')
  ) {
    return true;
  }
  const grade = previewRowGradeText(row);
  if (!grade || grade === '-' || grade === 'n/a') return false;
  if (grade === '5' || grade === '5.0' || grade === '5.00') return true;
  const n = Number(grade.replace(/,/g, ''));
  if (!Number.isFinite(n)) return false;
  // PHINMA numeric fail mark, or percent-style fail (< 75).
  if (n === 5) return true;
  if (n >= 60 && n < 75) return true;
  return false;
}

function previewRowIsPassed(row) {
  const remarks = previewRowRemarksText(row);
  if (
    remarks === 'passed' ||
    remarks === 'pass' ||
    remarks === 'p' ||
    remarks.includes('passed') ||
    remarks.includes('credited')
  ) {
    return true;
  }
  if (previewRowIsFailed(row)) return false;
  const grade = previewRowGradeText(row);
  if (!grade || grade === '-' || grade === 'n/a') return false;
  const n = Number(grade.replace(/,/g, ''));
  if (Number.isFinite(n) && n > 0 && n < 5) return true;
  if (Number.isFinite(n) && n >= 75) return true;
  return false;
}

function normalizeGuideColumn(col) {
  if (col && typeof col === 'object') {
    const name = String(col.name || col.label || '').trim();
    if (!name) return null;
    return {
      name,
      accepted: col.accepted !== false && col.exclude !== true,
    };
  }
  const name = String(col || '').trim();
  if (!name) return null;
  return { name, accepted: true };
}

function filterColumnGroupsForGuide(groups, sisFileHeadersOnly) {
  if (!Array.isArray(groups)) return [];
  if (!sisFileHeadersOnly) return groups;
  return groups.filter(
    (group) =>
      !SIS_INTERNAL_COLUMN_GROUP_TITLES.has(group.title) &&
      Array.isArray(group.columns) &&
      group.columns.length > 0
  );
}

function getRowFixMeta(row) {
  if (row?.row_fix?.can_fix) return row.row_fix;
  if (row?.subject_fix?.can_fix) {
    return {
      can_fix: true,
      issues: [
        {
          field: 'subject_code',
          label: 'Subject code (CODE)',
          type: 'subject_select',
          import_value: row.subject_fix.import_code || '',
          import_detail: row.subject_fix.import_name || '',
          suggestions: row.subject_fix.suggestions || [],
          required: true,
        },
      ],
      bulk_keys: { subject_code: row.subject_fix.import_code || '' },
    };
  }
  return null;
}

function previewRowImportCode(row) {
  const meta = getRowFixMeta(row);
  const subjectIssue = meta?.issues?.find((i) => i.field === 'subject_code');
  return String(
    subjectIssue?.import_value ||
      row?.data?.CODE ||
      row?.data?.['SUBJECT CODE'] ||
      row?.data?.subject_code ||
      ''
  ).trim();
}

function rowBulkKeys(row) {
  return getRowFixMeta(row)?.bulk_keys || {};
}

function issueIsSatisfied(issue, fix, subjectCodeSet) {
  if (!issue?.required) return true;
  if (!fix) return false;

  if (issue.field === 'subject_code' || issue.type === 'subject_select') {
    const code = String(fix.subject_code || '').trim();
    return code !== '' && subjectCodeSet.has(code);
  }
  if (issue.type === 'term_select') {
    return Boolean(fix.academic_year_id) && Boolean(fix.semester_id);
  }
  if (issue.field === 'program_id') {
    return Boolean(fix.program_id);
  }
  if (issue.field === 'year_level_id') {
    return Boolean(fix.year_level_id);
  }
  if (issue.field === '_sis_student_name') {
    return String(fix._sis_student_name || '').trim() !== '';
  }
  if (issue.field === 'student_id_number') {
    return String(fix.student_id_number || '').trim() !== '';
  }
  if (issue.field === 'evaluation_status') {
    const allowed = new Set(['passed', 'failed', 'ongoing', 'dropped', 'incomplete', 'inc', 'complete']);
    const v = String(fix.evaluation_status || '').trim().toLowerCase();
    return allowed.has(v);
  }

  const val = fix[issue.field];
  return val !== undefined && val !== null && String(val).trim() !== '';
}

function isRowEffectivelyValid(row, rowFixes, subjectCodeSet) {
  if (row.valid) return true;
  const meta = getRowFixMeta(row);
  if (!meta?.issues?.length) return false;
  const fix = rowFixes[row.row_number];
  return meta.issues.every((issue) => issueIsSatisfied(issue, fix, subjectCodeSet));
}

function rowEffectiveIssue(row, rowFixes, subjectCodeSet) {
  if (isRowEffectivelyValid(row, rowFixes, subjectCodeSet) && !row.valid) {
    const parts = [];
    const fix = rowFixes[row.row_number] || {};
    if (fix.subject_code) {
      const importCode = previewRowImportCode(row) || 'import code';
      parts.push(`Subject: ${importCode} → ${fix.subject_code}`);
    }
    if (fix.academic_year_id && fix.semester_id) {
      parts.push(`Term set (AY id ${fix.academic_year_id}, Sem id ${fix.semester_id})`);
    }
    if (fix.program_id) parts.push(`Program id ${fix.program_id}`);
    if (fix.year_level_id) parts.push(`Year level id ${fix.year_level_id}`);
    if (fix._sis_student_name) parts.push(`Name: ${fix._sis_student_name}`);
    if (fix.evaluation_status) parts.push(`Status → ${fix.evaluation_status}`);
    return `${parts.join('; ')}. Ready to import.`;
  }
  if (row.valid) return '—';
  return (row.errors || []).join(' ');
}

function rowCanFix(row, rowFixes, subjectCodeSet) {
  const meta = getRowFixMeta(row);
  if (!meta?.can_fix) return false;
  return !isRowEffectivelyValid(row, rowFixes, subjectCodeSet);
}

function countRowsWithSameBulkKey(rows, bulkKey, bulkValue) {
  if (!bulkValue) return 0;
  return rows.filter((r) => {
    const keys = rowBulkKeys(r);
    return getRowFixMeta(r)?.can_fix && String(keys[bulkKey] || '') === String(bulkValue);
  }).length;
}

function initialFixFormForRow(row, existingFix) {
  const meta = getRowFixMeta(row);
  const values = { ...(existingFix || {}) };
  for (const issue of meta?.issues || []) {
    if (issue.field === 'subject_code' && !values.subject_code) {
      values.subject_code = issue.suggestions?.[0]?.subject_code || '';
    }
  }
  return values;
}

function rowMatchesBulkKeys(row, bulkKeys) {
  const rowKeys = rowBulkKeys(row);
  return Object.entries(bulkKeys).every(([k, v]) => String(rowKeys[k] || '') === String(v));
}

/**
 * @param {{
 *   restrictToImportKeys?: string[] | null,
 *   excludeImportKeys?: string[] | null,
 *   pageTitle?: string,
 *   pageSubtitle?: string,
 *   hideColumnGuide?: boolean,
 *   hideImportType?: boolean,
 *   sisFileHeadersOnly?: boolean,
 * }} props
 */
const CsvImport = ({
  restrictToImportKeys = null,
  excludeImportKeys = null,
  pageTitle,
  pageSubtitle,
  hideColumnGuide = false,
  hideImportType = false,
  sisFileHeadersOnly = false,
}) => {
  const [importTypes, setImportTypes] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sisTermAyId, setSisTermAyId] = useState('');
  const [sisTermSemId, setSisTermSemId] = useState('');
  const [previewFilter, setPreviewFilter] = useState('all');
  const [previewOutcomeFilter, setPreviewOutcomeFilter] = useState('all');
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [rowFixes, setRowFixes] = useState({});
  const [subjects, setSubjects] = useState([]);
  const [fixModalRow, setFixModalRow] = useState(null);
  const fixModalRef = useRef(null);
  const [fixFormValues, setFixFormValues] = useState({});
  const [fixApplyToAll, setFixApplyToAll] = useState(true);

  const applyTypeFilters = (types) => {
    let t = Array.isArray(types) ? [...types] : [];
    if (restrictToImportKeys?.length) {
      const allow = new Set(restrictToImportKeys);
      t = t.filter((x) => allow.has(x.key));
    }
    if (excludeImportKeys?.length) {
      const deny = new Set(excludeImportKeys);
      t = t.filter((x) => !deny.has(x.key));
    }
    return t;
  };

  useEffect(() => {
    fetchImportTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when CSV scope props change
  }, [restrictToImportKeys, excludeImportKeys]);

  useEffect(() => {
    const rows = Array.isArray(preview?.preview) ? preview.preview : [];
    const needsSubjects = rows.some((r) =>
      getRowFixMeta(r)?.issues?.some((i) => i.type === 'subject_select')
    );
    if (!needsSubjects) {
      setSubjects([]);
      return;
    }
    api
      .get('/subjects')
      .then((res) => {
        setSubjects(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => setSubjects([]));
  }, [preview]);

  const fetchImportTypes = async () => {
    try {
      const response = await api.get('/csv-import/types');
      const filtered = applyTypeFilters(response.data);
      setImportTypes(filtered);
      if (filtered.length > 0) {
        setSelectedType(filtered[0].key);
      } else {
        setSelectedType('');
      }
    } catch (err) {
      setError('Failed to load import types');
    }
  };

  const isSisGradeDeliberation = selectedType === 'sis_grade_deliberation';

  const maybeSwitchImportTypeForFile = (selectedFile) => {
    if (!selectedFile || !importTypes.some((type) => type.key === 'sis_grade_deliberation')) {
      return;
    }

    const name = String(selectedFile.name || '').toLowerCase();
    // Spreadsheet bytes are not plain text — type is chosen on the server after Preview.
    if (/\.(xlsx|xls|ods)$/i.test(name)) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const firstLine = String(reader.result || '').split(/\r?\n/)[0] || '';
      const firstCell = firstLine.split(/[,\t;]/)[0]?.replace(/^\uFEFF/, '').trim().toLowerCase();
      if (firstCell === 'session' && selectedType !== 'sis_grade_deliberation') {
        setSelectedType('sis_grade_deliberation');
        setPreview(null);
        setSisTermAyId('');
        setSisTermSemId('');
      }
    };
    reader.readAsText(selectedFile.slice(0, 2048));
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const name = selectedFile.name.toLowerCase();
      const okFile =
        selectedFile.type === 'text/csv' ||
        selectedFile.type === 'text/tab-separated-values' ||
        selectedFile.type === 'text/plain' ||
        selectedFile.type === 'application/vnd.ms-excel' ||
        selectedFile.type ===
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        selectedFile.type === 'application/vnd.oasis.opendocument.spreadsheet' ||
        name.endsWith('.csv') ||
        name.endsWith('.tsv') ||
        name.endsWith('.txt') ||
        name.endsWith('.xlsx') ||
        name.endsWith('.xls') ||
        name.endsWith('.ods');
      if (!okFile) {
        setError('Please select CSV, TSV, TXT, Excel (.xlsx / .xls), or ODS');
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setPreview(null);
      setRowFixes({});
      setFixModalRow(null);
      setError('');
      setSuccess('');
      maybeSwitchImportTypeForFile(selectedFile);
    }
  };

  const handlePreview = async () => {
    if (!file || !selectedType) {
      setError('Please select a file and import type');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const formData = new FormData();
      formData.append('csv_file', file);
      formData.append('import_type', selectedType);
      if (isSisGradeDeliberation && sisTermAyId.trim() && sisTermSemId.trim()) {
        formData.append('academic_year_id', sisTermAyId.trim());
        formData.append('semester_id', sisTermSemId.trim());
      }

      const response = await api.post('/csv-import/preview', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 300000,
        showLoading: true,
      });

      setPreview(response.data);
      setRowFixes({});
      setFixModalRow(null);
      setPreviewFilter('all');
      setPreviewOutcomeFilter('all');
      setPreviewSearch('');
      setPreviewPage(1);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Failed to preview CSV';
      setError(msg);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !selectedType) {
      setError('Please select a file and import type');
      return;
    }

    const confirmed = await swalConfirm(
      'Confirm Import',
      `Are you sure you want to import ${preview?.total_rows || 'these'} records?`,
      'Import',
      'Cancel'
    );

    if (!confirmed) return;

    try {
      setImporting(true);
      setError('');
      setSuccess('');

      const formData = new FormData();
      formData.append('csv_file', file);
      formData.append('import_type', selectedType);
      if (isSisGradeDeliberation && sisTermAyId.trim() && sisTermSemId.trim()) {
        formData.append('academic_year_id', sisTermAyId.trim());
        formData.append('semester_id', sisTermSemId.trim());
      }
      if (Object.keys(rowFixes).length > 0) {
        formData.append('row_fixes', JSON.stringify(rowFixes));
      }

      const response = await api.post('/csv-import/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 300000,
        showLoading: true,
      });

      const results = response.data.results || {};
      const imported = results.imported ?? 0;
      const failed = results.failed ?? 0;
      const total = results.total ?? preview?.total_rows ?? 0;
      const summary = `Imported ${imported} of ${total} records.${failed ? ` ${failed} row(s) failed.` : ''}`;
      setSuccess(summary);
      await swalSuccess('Import finished', summary);

      if (failed > 0) {
        setError(`${failed} rows failed to import. Check the error details.`);
      }
    } catch (err) {
      const network = !err.response;
      const msg = network
        ? 'The server did not respond. The import may have timed out on a large file, or php artisan serve stopped. Confirm the API is running, then try again.'
        : err.response?.data?.error ||
          err.response?.data?.message ||
          (err.response?.status === 403
            ? 'You do not have permission to import, or your session expired. Log in again and retry.'
            : 'Import failed');
      setError(msg);
      await swalError('Import failed', msg);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    if (!selectedType) return;

    const link = document.createElement('a');
    link.href = `${process.env.REACT_APP_API_URL || 'http://localhost:8000/api'}/csv-import/template/${selectedType}`;
    link.download =
      selectedType === 'sis_grade_deliberation'
        ? 'sis_grade_deliberation_template.csv'
        : `${selectedType}_template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedTypeConfig = importTypes.find(t => t.key === selectedType);

  const previewHeadersOrdered = useMemo(
    () => orderPreviewHeaders(selectedType, preview?.headers),
    [selectedType, preview?.headers]
  );

  const fixOptions = preview?.fix_options || {};

  const subjectCodeSet = useMemo(
    () => new Set((subjects || []).map((s) => String(s.subject_code || '').trim()).filter(Boolean)),
    [subjects]
  );

  const previewStats = useMemo(() => {
    const rows = Array.isArray(preview?.preview) ? preview.preview : [];
    let errorCount = 0;
    let validCount = 0;
    let fixedCount = 0;
    let fixableCount = 0;
    rows.forEach((r) => {
      if (r.row_fix?.can_fix || getRowFixMeta(r)?.can_fix) fixableCount += 1;
      if (isRowEffectivelyValid(r, rowFixes, subjectCodeSet)) {
        validCount += 1;
        if (!r.valid && rowFixes[r.row_number]) fixedCount += 1;
      } else {
        errorCount += 1;
      }
    });
    const failedRowCount = rows.filter((r) => previewRowIsFailed(r)).length;
    const studentIdsWithFail = new Set();
    rows.forEach((r) => {
      if (!previewRowIsFailed(r)) return;
      const sid = previewRowStudentId(r);
      if (sid) studentIdsWithFail.add(sid);
    });
    return {
      total: rows.length,
      errorCount,
      validCount,
      fixedCount,
      fixableCount,
      readyToImport: errorCount === 0 && rows.length > 0,
      failedRowCount,
      studentsWithFailCount: studentIdsWithFail.size,
    };
  }, [preview, rowFixes, subjectCodeSet]);

  const filteredPreviewRows = useMemo(() => {
    const rows = Array.isArray(preview?.preview) ? preview.preview : [];
    const q = previewSearch.trim().toLowerCase();

    let studentIdsWithFail = null;
    if (previewOutcomeFilter === 'students_with_fail') {
      studentIdsWithFail = new Set();
      rows.forEach((r) => {
        if (!previewRowIsFailed(r)) return;
        const sid = previewRowStudentId(r);
        if (sid) studentIdsWithFail.add(sid);
      });
    }

    return rows.filter((row) => {
      const effectivelyValid = isRowEffectivelyValid(row, rowFixes, subjectCodeSet);
      if (previewFilter === 'errors' && effectivelyValid) return false;
      if (previewFilter === 'valid' && !effectivelyValid) return false;

      if (previewOutcomeFilter === 'failed' && !previewRowIsFailed(row)) return false;
      if (previewOutcomeFilter === 'passed' && !previewRowIsPassed(row)) return false;
      if (previewOutcomeFilter === 'students_with_fail') {
        const sid = previewRowStudentId(row);
        if (!sid || !studentIdsWithFail.has(sid)) return false;
      }

      if (q && !rowSearchText(row).includes(q)) return false;
      return true;
    });
  }, [preview, previewFilter, previewOutcomeFilter, previewSearch, rowFixes, subjectCodeSet]);

  const openRowFixModal = (row) => {
    const existing = rowFixes[row.row_number] || {};
    const bulkKeys = rowBulkKeys(row);
    const matchCount = (preview?.preview || []).filter(
      (r) => getRowFixMeta(r)?.can_fix && rowMatchesBulkKeys(r, bulkKeys)
    ).length;
    setFixModalRow(row);
    setFixFormValues(initialFixFormForRow(row, existing));
    setFixApplyToAll(matchCount > 1);
  };

  const closeRowFixModal = () => {
    setFixModalRow(null);
    setFixFormValues({});
    setFixApplyToAll(true);
  };
  useDialogFocus(Boolean(fixModalRow), fixModalRef, null, closeRowFixModal);

  const fixFormIsComplete = useMemo(() => {
    if (!fixModalRow) return false;
    const meta = getRowFixMeta(fixModalRow);
    if (!meta?.issues?.length) return false;
    return meta.issues.every((issue) => issueIsSatisfied(issue, fixFormValues, subjectCodeSet));
  }, [fixModalRow, fixFormValues, subjectCodeSet]);

  const applyRowFix = () => {
    if (!fixModalRow || !fixFormIsComplete) return;
    const rows = Array.isArray(preview?.preview) ? preview.preview : [];
    const bulkKeys = rowBulkKeys(fixModalRow);
    const updates = {};

    const applyOne = (row) => {
      updates[row.row_number] = {
        ...(rowFixes[row.row_number] || {}),
        ...fixFormValues,
        import_code: previewRowImportCode(row) || undefined,
      };
    };

    if (fixApplyToAll && Object.keys(bulkKeys).length > 0) {
      rows.forEach((row) => {
        if (!getRowFixMeta(row)?.can_fix) return;
        if (rowMatchesBulkKeys(row, bulkKeys)) {
          applyOne(row);
        }
      });
    } else {
      applyOne(fixModalRow);
    }

    setRowFixes((prev) => ({ ...prev, ...updates }));
    closeRowFixModal();
  };

  const bulkFixGroups = useMemo(() => {
    const rows = Array.isArray(preview?.preview) ? preview.preview : [];
    const groups = new Map();
    rows.forEach((row) => {
      if (!rowCanFix(row, rowFixes, subjectCodeSet)) return;
      const keys = rowBulkKeys(row);
      if (keys.subject_code) {
        const k = `subject:${keys.subject_code}`;
        if (!groups.has(k)) {
          groups.set(k, {
            label: `Subject code ${keys.subject_code}`,
            count: 0,
            sampleRow: row,
            bulkKeys: { subject_code: keys.subject_code },
          });
        }
        groups.get(k).count += 1;
      }
      if (keys.session) {
        const k = `session:${keys.session}`;
        if (!groups.has(k)) {
          groups.set(k, {
            label: `SESSION ${keys.session}`,
            count: 0,
            sampleRow: row,
            bulkKeys: { session: keys.session },
          });
        }
        groups.get(k).count += 1;
      }
      if (keys.evaluation_status) {
        const k = `status:${keys.evaluation_status}`;
        if (!groups.has(k)) {
          groups.set(k, {
            label: `Status “${keys.evaluation_status}”`,
            count: 0,
            sampleRow: row,
            bulkKeys: { evaluation_status: keys.evaluation_status },
          });
        }
        groups.get(k).count += 1;
      }
    });
    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
  }, [preview, rowFixes, subjectCodeSet]);

  const previewPageCount = Math.max(1, Math.ceil(filteredPreviewRows.length / PREVIEW_PAGE_SIZE));
  const safePreviewPage = Math.min(previewPage, previewPageCount);
  const pagedPreviewRows = useMemo(() => {
    const start = (safePreviewPage - 1) * PREVIEW_PAGE_SIZE;
    return filteredPreviewRows.slice(start, start + PREVIEW_PAGE_SIZE);
  }, [filteredPreviewRows, safePreviewPage]);

  const columnGroupsForGuide = useMemo(
    () => filterColumnGroupsForGuide(selectedTypeConfig?.column_groups, sisFileHeadersOnly),
    [selectedTypeConfig?.column_groups, sisFileHeadersOnly]
  );

  const hideTypeSelect = importTypes.length <= 1;
  const showImportTypeField = !hideImportType && importTypes.length > 0;

  return (
    <div className="csv-import">
      <div className="csv-import-header">
        <h2>{pageTitle || 'Data Import'}</h2>
        <p className="csv-import-subtitle">
          {pageSubtitle || 'Bulk import data from CSV, Excel, or related tabular files.'}
        </p>
      </div>

      {error && <div className="csv-import-error">{error}</div>}
      {success && <div className="csv-import-success">{success}</div>}

      <div className="csv-import-form">
        {importTypes.length === 0 ? (
          <div className="csv-import-error">No import types are available for your account.</div>
        ) : null}
        {showImportTypeField ? (
          <div className="form-group">
            <label htmlFor="import_type">Import Type</label>
            {hideTypeSelect ? (
              <div className="csv-import-type-static" id="import_type">
                {importTypes[0]?.label || selectedType}
              </div>
            ) : (
              <select
                id="import_type"
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  setPreview(null);
                  setFile(null);
                  setSisTermAyId('');
                  setSisTermSemId('');
                }}
                className="form-select"
              >
                {importTypes.map((type) => (
                  <option key={type.key} value={type.key}>
                    {type.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : null}

        {selectedTypeConfig && !hideColumnGuide && (
          <div className="csv-requirements">
            {!sisFileHeadersOnly ? (
              <>
                <h4>Required Columns:</h4>
                <div className="column-tags">
                  {selectedTypeConfig.required_columns.map((col) => (
                    <span key={col} className="column-tag required">
                      {col}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <h4>Required column headers:</h4>
            )}
            {columnGroupsForGuide.length > 0 ? (
              <div className="csv-column-groups">
                {columnGroupsForGuide.map((group) => (
                  <div key={group.title} className="csv-column-group">
                    <h4 className="csv-column-group-title">{group.title}</h4>
                    {group.description ? (
                      <p className="csv-column-group-desc">{group.description}</p>
                    ) : null}
                    {group.columns?.length > 0 ? (
                      <div className="column-tags">
                        {group.columns.map((rawCol, idx) => {
                          const col = normalizeGuideColumn(rawCol);
                          if (!col || !col.accepted) return null;
                          return (
                            <span
                              key={`${col.name}-${idx}`}
                              className="column-tag accepted"
                              title="Used by this system"
                            >
                              {col.name}
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : !sisFileHeadersOnly && selectedTypeConfig.optional_columns.length > 0 ? (
              <>
                <h4>Optional Columns:</h4>
                <div className="column-tags">
                  {selectedTypeConfig.optional_columns.map((col) => (
                    <span key={col} className="column-tag optional">
                      {col}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        )}

        {isSisGradeDeliberation && !sisFileHeadersOnly ? (
          <div className="form-group csv-import-term-override">
            <p className="csv-column-group-desc">
              If preview shows a term error, set both IDs from <strong>Admin → Academic Years / Semesters</strong> (or your
              lookup API). Leave blank when <code>SESSION</code> (e.g. <code>SY 25-26 SEM 1</code>) can match Lookup{' '}
              <strong>Academic Year</strong> — <code>SY 25-26</code> maps to <code>2025-2026</code> in the database
              (created automatically if missing). Preview columns <code>→ Academic Year (DB)</code> and{' '}
              <code>→ Semester (DB)</code> show the matched Lookup rows.
            </p>
            <label htmlFor="sis_academic_year_id">Optional: Academic year ID</label>
            <input
              id="sis_academic_year_id"
              type="number"
              min="1"
              className="form-control"
              value={sisTermAyId}
              onChange={(e) => setSisTermAyId(e.target.value)}
              placeholder="e.g. 1"
            />
            <label htmlFor="sis_semester_id">Optional: Semester ID</label>
            <input
              id="sis_semester_id"
              type="number"
              min="1"
              className="form-control"
              value={sisTermSemId}
              onChange={(e) => setSisTermSemId(e.target.value)}
              placeholder="e.g. 2"
            />
          </div>
        ) : null}

        <div className="form-group">
          <label htmlFor="csv_file">
            {isSisGradeDeliberation
              ? 'Data file (CSV, TSV, Excel, or ODS)'
              : 'Data file (CSV, TSV, Excel, or ODS)'}
          </label>
          <div className="file-input-wrapper">
            <input
              type="file"
              id="csv_file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,.ods,text/csv,text/tab-separated-values,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet"
              onChange={handleFileChange}
              className="file-input"
            />
            <label htmlFor="csv_file" className="file-input-label">
              {file ? file.name : 'Choose file…'}
            </label>
          </div>
        </div>

        <div className="csv-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={downloadTemplate}
            disabled={!selectedType}
          >
            Download Template
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handlePreview}
            disabled={!file || loading}
          >
            {loading ? 'Previewing...' : 'Preview'}
          </button>
        </div>
      </div>

      {preview && (
        <div className="csv-preview">
          <h3>
            Preview ({preview.total_rows ?? preview.preview?.length ?? 0} rows — all validated)
          </h3>

          <div className="csv-preview-warning csv-preview-warning--info">
            Every row in the file is checked. Use <strong>Search</strong> with a row number (e.g.{' '}
            <code>1899</code>) or the <strong>Cannot import</strong> filter to find problems anywhere in the file.
          </div>

          {selectedType === 'sis_mixed' ? (
            <p className="csv-preview-sis-mixed-hint">
              <strong>How this file works:</strong> Only the <code>student</code> row carries name, email, program, and year
              level. Each <code>grade</code> row repeats <code>student_id_number</code> and fills subject and grade columns;
              other personal columns stay empty on purpose. Scroll the table horizontally if you do not see{' '}
              <code>subject_code</code>, <code>grade</code>, and <code>evaluation_status</code>.
            </p>
          ) : null}
          {selectedType === 'sis_grade_deliberation' ? (
            <p className="csv-preview-sis-mixed-hint">
              <strong>SIS export:</strong> Preview shows your <em>file</em> columns (SESSION, STUDENT ID, CODE,
              GRADE, REMARKS, etc.) plus <code>→ Academic Year (DB)</code> / <code>→ Semester (DB)</code> so you can
              verify SESSION matches Lookup. Example: <code>SY 25-26 SEM I</code> → Academic Year{' '}
              <code>2025-2026</code>, 1st Semester. You can upload Excel (.xlsx / .xls), ODS, CSV, or TSV directly.
            </p>
          ) : null}
          
          {bulkFixGroups.length > 0 && previewStats.errorCount > 0 ? (
            <div className="csv-bulk-fix-bar">
              <p className="csv-bulk-fix-bar-title">Quick fix — open Fix row for matching import values:</p>
              <div className="csv-bulk-fix-bar-actions">
                {bulkFixGroups.map((group) => (
                  <button
                    key={group.label}
                    type="button"
                    className="csv-fix-subject-btn csv-fix-subject-btn--bulk"
                    onClick={() => openRowFixModal(group.sampleRow)}
                  >
                    Fix {group.count} row{group.count === 1 ? '' : 's'} — {group.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {previewStats.errorCount > 0 && (
            <div className="csv-preview-warning">
              {previewStats.errorCount} row{previewStats.errorCount === 1 ? '' : 's'} cannot be imported yet.
              {previewStats.fixableCount > 0 ? (
                <>
                  {' '}
                  Some rows have values that do not match the system (subject code, term, program,
                  year level, name, etc.). Open <strong>Cannot import</strong> and use{' '}
                  <strong>Fix row</strong> to correct each problem row.
                </>
              ) : (
                <> Use the <strong>Cannot import</strong> filter to review them.</>
              )}
              {Array.isArray(preview.error_row_numbers) && preview.error_row_numbers.length > 0 ? (
                <>
                  {' '}
                  Problem rows:{' '}
                  <strong>
                    {preview.error_row_numbers.slice(0, 12).join(', ')}
                    {preview.error_row_numbers.length > 12
                      ? ` … +${preview.error_row_numbers.length - 12} more`
                      : ''}
                  </strong>
                </>
              ) : null}
            </div>
          )}

          {previewStats.fixedCount > 0 ? (
            <div className="csv-preview-warning csv-preview-warning--info">
              {previewStats.fixedCount} row{previewStats.fixedCount === 1 ? '' : 's'} corrected via{' '}
              <strong>Fix row</strong>
              and {previewStats.readyToImport ? 'are ready to import.' : 'will import once remaining issues are fixed.'}
            </div>
          ) : null}

          <div className="csv-preview-toolbar">
            <div className="csv-preview-filters" role="group" aria-label="Preview row filters">
              <button
                type="button"
                className={`csv-preview-filter${previewFilter === 'all' ? ' is-active' : ''}`}
                onClick={() => {
                  setPreviewFilter('all');
                  setPreviewPage(1);
                }}
              >
                All ({previewStats.total})
              </button>
              <button
                type="button"
                className={`csv-preview-filter csv-preview-filter--error${previewFilter === 'errors' ? ' is-active' : ''}`}
                onClick={() => {
                  setPreviewFilter('errors');
                  setPreviewPage(1);
                }}
              >
                Cannot import ({previewStats.errorCount})
              </button>
              <button
                type="button"
                className={`csv-preview-filter csv-preview-filter--ok${previewFilter === 'valid' ? ' is-active' : ''}`}
                onClick={() => {
                  setPreviewFilter('valid');
                  setPreviewPage(1);
                }}
              >
                Ready ({previewStats.validCount})
              </button>
            </div>
            <div className="csv-preview-toolbar-side">
              <label className="csv-preview-outcome">
                <span className="csv-preview-search-label">Grade outcome</span>
                <select
                  value={previewOutcomeFilter}
                  onChange={(e) => {
                    setPreviewOutcomeFilter(e.target.value);
                    setPreviewPage(1);
                  }}
                  aria-label="Filter by grade outcome"
                >
                  <option value="all">All outcomes</option>
                  <option value="failed">
                    Failed subjects only ({previewStats.failedRowCount})
                  </option>
                  <option value="students_with_fail">
                    Students with any fail ({previewStats.studentsWithFailCount})
                  </option>
                  <option value="passed">Passed subjects only</option>
                </select>
              </label>
              <label className="csv-preview-search">
                <span className="csv-preview-search-label">Search</span>
                <input
                  type="search"
                  value={previewSearch}
                  onChange={(e) => {
                    setPreviewSearch(e.target.value);
                    setPreviewPage(1);
                  }}
                  placeholder="Row #, name, student ID, or error…"
                />
              </label>
            </div>
          </div>

          <p className="csv-preview-scroll-hint" aria-hidden="true">
            {previewHeadersOrdered.length > 6 ? 'Scroll horizontally to view all columns →' : null}
          </p>

          <div className="preview-table-wrapper">
            <table className="preview-table">
              <thead>
                <tr>
                  <th>Row</th>
                  {previewHeadersOrdered.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                  <th className="csv-preview-sticky-col">Status</th>
                  <th className="csv-preview-sticky-col csv-preview-sticky-col--issue">Issue / Fix</th>
                </tr>
              </thead>
              <tbody>
                {pagedPreviewRows.length === 0 ? (
                  <tr>
                    <td colSpan={previewHeadersOrdered.length + 3} className="csv-preview-empty">
                      No rows match this filter.
                    </td>
                  </tr>
                ) : (
                  pagedPreviewRows.map((row) => {
                    const effectivelyValid = isRowEffectivelyValid(row, rowFixes, subjectCodeSet);
                    const canFix = rowCanFix(row, rowFixes, subjectCodeSet);
                    return (
                    <tr key={row.row_number} className={effectivelyValid ? 'valid' : 'invalid'}>
                      <td>{row.row_number}</td>
                      {previewHeadersOrdered.map((header) => (
                        <td key={header}>{row.data[header] || '-'}</td>
                      ))}
                      <td className="csv-preview-sticky-col">
                        {effectivelyValid ? (
                          <span className="status-badge valid">
                            {rowFixes[row.row_number] && !row.valid ? 'Fixed' : 'Ready'}
                          </span>
                        ) : (
                          <span className="status-badge invalid">Cannot import</span>
                        )}
                      </td>
                      <td className="csv-preview-issue csv-preview-sticky-col csv-preview-sticky-col--issue">
                        {canFix ? (
                          <button
                            type="button"
                            className="csv-fix-subject-btn"
                            onClick={() => openRowFixModal(row)}
                          >
                            Fix row
                          </button>
                        ) : null}
                        <div className="csv-preview-issue-text">
                          {rowEffectiveIssue(row, rowFixes, subjectCodeSet)}
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="csv-preview-pager">
            <span className="csv-preview-pager-meta">
              Showing {filteredPreviewRows.length === 0 ? 0 : (safePreviewPage - 1) * PREVIEW_PAGE_SIZE + 1}
              –
              {Math.min(safePreviewPage * PREVIEW_PAGE_SIZE, filteredPreviewRows.length)} of {filteredPreviewRows.length}
              {previewFilter !== 'all' ||
              previewOutcomeFilter !== 'all' ||
              previewSearch.trim()
                ? ' filtered'
                : ''}{' '}
              rows
              {' '}({PREVIEW_PAGE_SIZE} per page)
            </span>
            <div className="csv-preview-pager-btns">
              <button
                type="button"
                className="csv-preview-page-btn"
                disabled={safePreviewPage <= 1}
                onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="csv-preview-page-num">
                Page {safePreviewPage} of {previewPageCount}
              </span>
              <button
                type="button"
                className="csv-preview-page-btn"
                disabled={safePreviewPage >= previewPageCount}
                onClick={() => setPreviewPage((p) => Math.min(previewPageCount, p + 1))}
              >
                Next
              </button>
            </div>
          </div>

          {!previewStats.readyToImport ? (
            previewStats.fixedCount > 0 ? (
              <p className="csv-import-hint">
                Fix or map the remaining {previewStats.errorCount} row
                {previewStats.errorCount === 1 ? '' : 's'} before importing.
              </p>
            ) : null
          ) : (
            <div className="csv-import-action">
              <button
                type="button"
                className="btn-import"
                onClick={handleImport}
                disabled={importing}
              >
                {importing
                  ? 'Importing...'
                  : `Import ${preview.total_rows} Records${
                      previewStats.fixedCount > 0
                        ? ` (${previewStats.fixedCount} with row fixes)`
                        : ''
                    }`}
              </button>
            </div>
          )}
        </div>
      )}

      {fixModalRow ? (
        <div className="csv-fix-modal-overlay" onClick={closeRowFixModal}>
          <div
            ref={fixModalRef}
            className="csv-fix-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="csv-fix-modal-title"
            tabIndex="-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="csv-fix-modal-header">
              <h3 id="csv-fix-modal-title">Fix import row</h3>
              <button
                type="button"
                className="csv-fix-modal-close"
                onClick={closeRowFixModal}
                aria-label="Close import row editor"
              >
                ×
              </button>
            </div>
            <div className="csv-fix-modal-body">
              <p className="csv-fix-modal-intro">
                Correct values from the import file so they match the system. You can fix subject
                code, term, program, year level, student name, and other fields on this row.
              </p>
              <dl className="csv-fix-modal-meta">
                <div>
                  <dt>Row</dt>
                  <dd>{fixModalRow.row_number}</dd>
                </div>
                <div>
                  <dt>Student ID</dt>
                  <dd>
                    <code>
                      {fixModalRow.data?.['STUDENT ID'] ||
                        fixModalRow.data?.student_id_number ||
                        '—'}
                    </code>
                  </dd>
                </div>
              </dl>

              {(getRowFixMeta(fixModalRow)?.issues || []).map((issue) => (
                <div key={issue.field + issue.type} className="csv-fix-field">
                  <label className="csv-fix-select-label">{issue.label}</label>
                  {issue.import_value ? (
                    <p className="csv-fix-import-value">
                      From file: <code>{issue.import_value}</code>
                      {issue.import_detail ? ` — ${issue.import_detail}` : ''}
                    </p>
                  ) : null}

                  {issue.type === 'subject_select' ? (
                    <>
                      {(issue.suggestions || []).length > 0 ? (
                        <div className="csv-fix-suggestions">
                          <p className="csv-fix-suggestions-label">Suggested matches</p>
                          <div className="csv-fix-suggestion-list">
                            {issue.suggestions.map((s) => (
                              <button
                                key={s.subject_id || s.subject_code}
                                type="button"
                                className={`csv-fix-suggestion${
                                  fixFormValues.subject_code === s.subject_code ? ' is-selected' : ''
                                }`}
                                onClick={() =>
                                  setFixFormValues((prev) => ({
                                    ...prev,
                                    subject_code: s.subject_code,
                                  }))
                                }
                              >
                                <strong>
                                  {s.subject_code}
                                  {s.in_program ? (
                                    <em className="csv-fix-suggestion-badge"> program</em>
                                  ) : null}
                                </strong>
                                <span>{s.subject_name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <SearchableSelect
                        className="csv-fix-searchable"
                        value={fixFormValues.subject_code || ''}
                        onChange={(v) =>
                          setFixFormValues((prev) => ({
                            ...prev,
                            subject_code: v,
                          }))
                        }
                        options={(subjects || []).map((s) => ({
                          value: String(s.subject_code),
                          label: `${s.subject_code} — ${s.subject_name}`,
                        }))}
                        placeholder="Type to search subjects…"
                        emptyLabel="Select system subject…"
                        aria-label="System subject"
                      />
                    </>
                  ) : null}

                  {issue.type === 'term_select' ? (
                    <div className="csv-fix-term-row">
                      <SearchableSelect
                        className="csv-fix-searchable"
                        value={fixFormValues.academic_year_id || ''}
                        onChange={(v) =>
                          setFixFormValues((prev) => ({
                            ...prev,
                            academic_year_id: v,
                          }))
                        }
                        options={(fixOptions.academic_years || []).map((ay) => ({
                          value: String(ay.academic_year_id),
                          label: `${ay.academic_year_name} (id ${ay.academic_year_id})`,
                        }))}
                        placeholder="Type to search academic year…"
                        emptyLabel="Academic year…"
                        aria-label="Academic year"
                      />
                      <SearchableSelect
                        className="csv-fix-searchable"
                        value={fixFormValues.semester_id || ''}
                        onChange={(v) =>
                          setFixFormValues((prev) => ({
                            ...prev,
                            semester_id: v,
                          }))
                        }
                        options={(fixOptions.semesters || []).map((sem) => ({
                          value: String(sem.semester_id),
                          label: `${sem.semester_name} (id ${sem.semester_id})`,
                        }))}
                        placeholder="Type to search semester…"
                        emptyLabel="Semester…"
                        aria-label="Semester"
                      />
                    </div>
                  ) : null}

                  {issue.type === 'select' && issue.field === 'program_id' ? (
                    <SearchableSelect
                      className="csv-fix-searchable"
                      value={fixFormValues.program_id || ''}
                      onChange={(v) =>
                        setFixFormValues((prev) => ({ ...prev, program_id: v }))
                      }
                      options={(fixOptions.programs || []).map((p) => ({
                        value: String(p.program_id),
                        label: `${p.program_code || p.program_name} — ${p.program_name}`,
                      }))}
                      placeholder="Type to search program…"
                      emptyLabel="Select program…"
                      aria-label="Program"
                    />
                  ) : null}

                  {issue.type === 'select' && issue.field === 'year_level_id' ? (
                    <SearchableSelect
                      className="csv-fix-searchable"
                      value={fixFormValues.year_level_id || ''}
                      onChange={(v) =>
                        setFixFormValues((prev) => ({ ...prev, year_level_id: v }))
                      }
                      options={(fixOptions.year_levels || []).map((yl) => ({
                        value: String(yl.year_level_id),
                        label: String(yl.year_level),
                      }))}
                      placeholder="Type to search year level…"
                      emptyLabel="Select year level…"
                      aria-label="Year level"
                    />
                  ) : null}

                  {issue.type === 'select' && issue.field === 'evaluation_status' ? (
                    <select
                      className="csv-fix-text"
                      value={fixFormValues.evaluation_status || ''}
                      onChange={(e) =>
                        setFixFormValues((prev) => ({
                          ...prev,
                          evaluation_status: e.target.value,
                        }))
                      }
                      aria-label="Evaluation status"
                    >
                      <option value="">Select status…</option>
                      {(issue.options || []).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label || opt.value}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  {issue.type === 'text' ? (
                    <input
                      type="text"
                      className="csv-fix-text"
                      value={fixFormValues[issue.field] || ''}
                      onChange={(e) =>
                        setFixFormValues((prev) => ({ ...prev, [issue.field]: e.target.value }))
                      }
                      placeholder={`Enter ${issue.label}`}
                    />
                  ) : null}
                </div>
              ))}

              {(() => {
                const bulkKeys = rowBulkKeys(fixModalRow);
                const matchCount = (preview?.preview || []).filter(
                  (r) => getRowFixMeta(r)?.can_fix && rowMatchesBulkKeys(r, bulkKeys)
                ).length;
                return matchCount > 1 ? (
                  <label className="csv-fix-apply-all">
                    <input
                      type="checkbox"
                      checked={fixApplyToAll}
                      onChange={(e) => setFixApplyToAll(e.target.checked)}
                    />
                    Apply these fixes to all {matchCount} rows with the same import values
                  </label>
                ) : null;
              })()}
            </div>
            <div className="csv-fix-modal-footer">
              <button type="button" className="btn-secondary" onClick={closeRowFixModal}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!fixFormIsComplete}
                onClick={applyRowFix}
              >
                Apply fixes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CsvImport;
