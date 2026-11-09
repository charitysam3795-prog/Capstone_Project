import React, { useCallback, useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { swalError, swalSuccess } from '../../utils/swal';
import CsvImport from './CsvImport';
import { DATA_EXPORT_PERMISSIONS, DATA_IMPORT_PERMISSIONS } from '../../config/adminPanelTabs';
import './DataImportExport.css';

async function downloadExport(path, fallbackName) {
  const response = await api.get(path, {
    responseType: 'blob',
    showLoading: true,
    loadingMessage: 'Preparing export…',
  });

  const contentType = String(response.headers?.['content-type'] || '');
  if (contentType.includes('application/json')) {
    const text = await response.data.text();
    let message = 'Could not export data.';
    try {
      message = JSON.parse(text)?.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const disposition = response.headers?.['content-disposition'] || '';
  const match = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : fallbackName;

  const url = window.URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Dedicated module for SIS import and directory CSV export.
 */
const DataImportExport = () => {
  const { canAccessModule, isAdmin } = useAuth();
  const canImport = isAdmin || canAccessModule(DATA_IMPORT_PERMISSIONS);
  const canExport = isAdmin || canAccessModule(DATA_EXPORT_PERMISSIONS);
  const canExportStudents = canExport;
  const canExportStaff = canExport;
  const [section, setSection] = useState(() => (canImport || !canExport ? 'import' : 'export'));
  const [exporting, setExporting] = useState('');

  const runExport = useCallback(async (key, path, filename) => {
    setExporting(key);
    try {
      await downloadExport(path, filename);
      await swalSuccess('Export ready', 'Your CSV download should start shortly.');
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Could not export data. Try again or contact an administrator.';
      await swalError('Export failed', msg);
    } finally {
      setExporting('');
    }
  }, []);

  return (
    <div className="data-import-export" data-tour="page-import-export">
      <div className="data-import-export__header">
        <h2>Import / Export</h2>
        <p className="data-import-export__subtitle">
          Import SIS grade deliberation files, and export grades in the same CSV layout (plus evaluator) or staff directory data.
        </p>
      </div>

      <div className="data-import-export__tabs" role="tablist">
        {canImport && (
          <button
            type="button"
            role="tab"
            aria-selected={section === 'import'}
            className={`data-import-export__tab ${section === 'import' ? 'active' : ''}`}
            onClick={() => setSection('import')}
          >
            Import
          </button>
        )}
        {canExport && (
          <button
            type="button"
            role="tab"
            aria-selected={section === 'export'}
            className={`data-import-export__tab ${section === 'export' ? 'active' : ''}`}
            onClick={() => setSection('export')}
          >
            Export
          </button>
        )}
      </div>

      <div className="data-import-export__panel" role="tabpanel">
        {section === 'import' && (
          canImport ? (
            <CsvImport
              restrictToImportKeys={['sis_grade_deliberation']}
              hideImportType
              sisFileHeadersOnly
              pageTitle="Import from SIS"
              pageSubtitle="Upload a Grade Deliberation Excel, CSV, TSV, or ODS export. Your file’s first row should use the column headers below."
            />
          ) : (
            <p className="data-import-export__empty">
              You do not have permission to import data.
            </p>
          )
        )}

        {section === 'export' && (
          <div className="data-import-export__export">
            <p className="data-import-export__export-lead">
              Download live directory data. Evaluation PDFs / grade sheets stay under Student Evaluation.
            </p>

            <div className="data-import-export__cards">
              <article className="data-import-export__card">
                <h3>Grade deliberation</h3>
                <p>
                  SIS-style export (SESSION … GRADE / REMARKS) for recorded subject grades, plus an{' '}
                  <strong>EVALUATOR</strong> column for who evaluated each grade.
                </p>
                <button
                  type="button"
                  className="data-import-export__download"
                  disabled={!canExportStudents || exporting === 'students'}
                  onClick={() =>
                    runExport(
                      'students',
                      '/data-export/students',
                      'Grade_Deliberation_export.csv'
                    )
                  }
                >
                  {exporting === 'students' ? 'Exporting…' : 'Download grade deliberation CSV'}
                </button>
              </article>

              <article className="data-import-export__card">
                <h3>Staff users</h3>
                <p>Non-student accounts: email, role, department, program, and status.</p>
                <button
                  type="button"
                  className="data-import-export__download"
                  disabled={!canExportStaff || exporting === 'staff'}
                  onClick={() =>
                    runExport('staff', '/data-export/staff-users', 'staff_users_export.csv')
                  }
                >
                  {exporting === 'staff' ? 'Exporting…' : 'Download staff CSV'}
                </button>
              </article>
            </div>

            {!canExportStudents && !canExportStaff ? (
              <p className="data-import-export__empty">You do not have permission to export directory data.</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataImportExport;
