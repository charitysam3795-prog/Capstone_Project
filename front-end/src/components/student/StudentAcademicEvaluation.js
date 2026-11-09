import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import api from '../../api/axios';
import { swalError } from '../../utils/swal';
import './StudentAcademicEvaluation.css';

/**
 * Student-facing academic record: progress vs curriculum (same data faculty uses, scoped to self).
 */
const StudentAcademicEvaluation = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const printRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const prof = await api.get('/students/profile');
        const idNum =
          prof.data?.student_id_number ||
          prof.data?.student_number ||
          prof.data?.Student_Id_Number;
        if (!idNum) {
          throw new Error('Your profile has no student ID number.');
        }
        const res = await api.get(`/evaluation/student/${encodeURIComponent(String(idNum))}`);
        if (!cancelled) setData(res.data);
      } catch (e) {
        if (!cancelled) {
          const msg = e.response?.data?.message || e.message || 'Failed to load evaluation';
          setError(msg);
          setData(null);
          await swalError('Could not load evaluation', msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w || !printRef.current) return;
    w.document.write(
      `<html><head><title>Academic evaluation</title></head><body>${printRef.current.innerHTML}</body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  const handleDownloadPdf = async () => {
    if (!printRef.current) return;
    setPdfLoading(true);
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const st = data?.student;
      const rawId = st?.student_id_number || st?.student_number || 'student';
      const safeId = String(rawId).replace(/[^a-zA-Z0-9-_]/g, '_');
      pdf.save(`academic-evaluation-${safeId}.pdf`);
    } catch (e) {
      await swalError('Could not create PDF', e?.message || 'Unknown error');
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) {
    return <div className="stu-eval-loading">Loading your academic record…</div>;
  }

  if (error) {
    return <div className="stu-eval-error">{error}</div>;
  }

  const student = data?.student;
  const summary = data?.summary || {};
  const rows = data?.rows || [];
  const computedStatus = data?.computed_academic_status;
  const statusReasons = data?.academic_status_reasons || [];

  /** Same semester progression as faculty “need evaluation” and My Curriculum: next term after prior is fully recorded. */
  const apiRowTermComplete = (r) => {
    if (r.passed_via_transfer_credit) return true;
    if (r.subject_id == null || r.subject_id === '') return true;
    const st = String(r.status || '')
      .toLowerCase()
      .trim();
    if (st === 'ongoing') return false;
    if (
      st === 'passed' ||
      st === 'pass' ||
      st === 'failed' ||
      st === 'fail' ||
      st === 'f' ||
      st === 'inc' ||
      st === 'incomplete' ||
      st === 'credit'
    ) {
      return true;
    }
    if (r.grade != null && String(r.grade).trim() !== '') return true;
    return false;
  };

  const semesterGroups = {};
  rows.forEach((r) => {
    const key = `${r.year_level_name || 'Unknown'}|${r.semester_name || 'Unknown'}`;
    if (!semesterGroups[key]) semesterGroups[key] = [];
    semesterGroups[key].push(r);
  });
  const orderedSemesters = Object.entries(semesterGroups).sort(([, ra], [, rb]) => {
    const a = ra[0] || {};
    const b = rb[0] || {};
    const ay = Number(a.year_level_id ?? 0);
    const by = Number(b.year_level_id ?? 0);
    if (ay !== by) return ay - by;
    return Number(a.semester_id ?? 0) - Number(b.semester_id ?? 0);
  });
  const visibleSemesterEntries = [];
  for (let i = 0; i < orderedSemesters.length; i++) {
    if (i === 0) {
      visibleSemesterEntries.push(orderedSemesters[i]);
    } else if (orderedSemesters[i - 1][1].every(apiRowTermComplete)) {
      visibleSemesterEntries.push(orderedSemesters[i]);
    } else {
      break;
    }
  }
  const displayRows = visibleSemesterEntries.flatMap(([, rs]) => rs);
  const hiddenSemesterCount = orderedSemesters.length - visibleSemesterEntries.length;

  const name =
    student?.full_name ||
    [student?.last_name, student?.first_name].filter(Boolean).join(', ') ||
    '—';

  return (
    <div className="stu-academic-eval">
      <div className="stu-eval-toolbar">
        <h2>Academic evaluation</h2>
        <div className="stu-eval-toolbar-actions">
          <button type="button" className="stu-eval-download" onClick={handleDownloadPdf} disabled={pdfLoading}>
            {pdfLoading ? 'Preparing PDF…' : 'Download PDF'}
          </button>
          <button type="button" className="stu-eval-print" onClick={handlePrint}>
            Print
          </button>
        </div>
      </div>
      <p className="stu-eval-hint">
        Subjects taken, grades, and progress against your program curriculum. Use this for advising or
        graduation checking.
      </p>

      <div ref={printRef} className="stu-eval-print-area">
        <div className="stu-eval-header-block">
          <div>
            <strong>Student:</strong> {name}
          </div>
          <div>
            <strong>ID:</strong> {student?.student_id_number || student?.student_number || '—'}
          </div>
          <div>
            <strong>Program:</strong> {student?.program?.program_name || '—'}
          </div>
          <div>
            <strong>Record academic status:</strong> {student?.academic_status || '—'}
          </div>
          {computedStatus && (
            <div>
              <strong>Computed status (sequence):</strong>{' '}
              <span className={computedStatus === 'Irregular' ? 'stu-eval-status-irregular' : 'stu-eval-status-regular'}>
                {computedStatus}
              </span>
            </div>
          )}
          {statusReasons.length > 0 && (
            <div className="stu-eval-reasons">
              <strong>Note:</strong> {statusReasons.join(' ')}
            </div>
          )}
        </div>
        <div className="stu-eval-summary-grid">
          <div>
            Curriculum units: <strong>{summary.total_units_in_curriculum ?? '—'}</strong>
          </div>
          <div>
            Earned units: <strong>{summary.total_units_earned ?? '—'}</strong>
          </div>
          <div>
            Remaining (units): <strong>{summary.lacking_units ?? '—'}</strong>
          </div>
        </div>

        {hiddenSemesterCount > 0 ? (
          <p className="stu-eval-semester-hint" role="status">
            Later terms are hidden until every subject in the previous term has a recorded grade or status (same as{' '}
            <strong>My Curriculum</strong>). {hiddenSemesterCount} term{hiddenSemesterCount !== 1 ? 's' : ''} not shown
            yet.
          </p>
        ) : null}

        <table className="stu-eval-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Semester</th>
              <th>Code</th>
              <th>Subject</th>
              <th>Units</th>
              <th>Grade</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan="7">No curriculum rows loaded.</td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan="7">No rows in visible terms.</td>
              </tr>
            ) : (
              displayRows.map((r, i) => (
                <tr key={i}>
                  <td>{r.year_level_name || r.year_level_id || '—'}</td>
                  <td>{r.semester_name || r.semester_id || '—'}</td>
                  <td>{r.subject_code || '—'}</td>
                  <td>{r.subject_name || '—'}</td>
                  <td>{r.units ?? '—'}</td>
                  <td>{r.grade ?? '—'}</td>
                  <td>{r.status || (r.units_earned > 0 ? 'Completed' : '—')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StudentAcademicEvaluation;
