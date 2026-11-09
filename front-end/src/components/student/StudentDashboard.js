import React, { useEffect, useState, useMemo } from 'react';
import api from '../../api/axios';
import './StudentDashboard.css';

function normStatus(s) {
  return String(s || '')
    .toLowerCase()
    .trim();
}

function parseDate(raw) {
  if (raw == null || raw === '') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatRelativeTime(date) {
  if (!date) return '';
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} minutes ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function summarizeEnrollments(list) {
  const rows = Array.isArray(list) ? list : [];
  let enrolled = 0;
  let completed = 0;
  let failed = 0;

  for (const e of rows) {
    const st = normStatus(e.evaluation_status || e.status);
    const gRaw = e.grade;
    const g = gRaw != null && gRaw !== '' ? parseFloat(gRaw) : NaN;
    const hasGrade = Number.isFinite(g);

    if (['ongoing', 'incomplete'].includes(st)) {
      enrolled += 1;
      continue;
    }
    if (st === 'dropped') {
      continue;
    }
    if (
      st === 'failed' ||
      (hasGrade && g < 75 && !['passed', 'pass', 'credit', 'completed'].includes(st))
    ) {
      failed += 1;
      continue;
    }
    if (
      ['passed', 'pass', 'credit', 'completed'].includes(st) ||
      (hasGrade && g >= 75)
    ) {
      completed += 1;
    }
  }

  const activeRows = rows.filter((e) =>
    ['ongoing', 'incomplete'].includes(normStatus(e.evaluation_status || e.status))
  );
  const semSource =
    activeRows.find((e) => e.academic_year_name && e.semester_name) ||
    rows.find((e) => e.academic_year_name && e.semester_name);
  const currentSemester = semSource
    ? `${semSource.academic_year_name} · ${semSource.semester_name}`
    : '—';

  return { enrolled, completed, failed, currentSemester, rows };
}

function buildActivityFeed(rows) {
  const withDates = rows
    .map((e) => ({
      ...e,
      _d: parseDate(e.evaluation_date) || parseDate(e.enrolled_date),
    }))
    .filter((e) => e._d)
    .sort((a, b) => b._d - a._d)
    .slice(0, 6);

  return withDates.map((e) => {
    const st = normStatus(e.evaluation_status || e.status);
    const ay = e.academic_year_name || '';
    const sem = e.semester_name || '';
    const term = [ay, sem].filter(Boolean).join(' · ') || 'this term';
    const code = e.subject_code || e.subject?.subject_code || 'Subject';

    let message = '';
    let tone = 'neutral';
    if (['passed', 'pass', 'credit', 'completed'].includes(st)) {
      message = `Your evaluation for ${code} (${term}) has been completed`;
      tone = 'success';
    } else if (st === 'failed') {
      message = `Grade recorded for ${code} (${term})`;
      tone = 'warning';
    } else if (['ongoing', 'incomplete'].includes(st)) {
      message = `You are enrolled in ${code} (${term})`;
      tone = 'info';
    } else {
      message = `Update for ${code} (${term})`;
      tone = 'neutral';
    }

    return {
      id: e.evaluation_id ?? e.enrollment_id ?? `${code}-${term}`,
      message,
      tone,
      when: formatRelativeTime(e._d),
    };
  });
}

const StudentDashboard = ({ onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [enrollments, setEnrollments] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get('/students/enrollments');
        const raw = res.data?.enrollments;
        const list = Array.isArray(raw) ? raw : [];
        if (!cancelled) setEnrollments(list);
      } catch (err) {
        if (!cancelled) {
          setEnrollments([]);
          setError(err.response?.data?.message || err.response?.data?.error || 'Could not load dashboard data');
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

  const stats = useMemo(() => summarizeEnrollments(enrollments), [enrollments]);
  const activities = useMemo(() => buildActivityFeed(enrollments), [enrollments]);

  return (
    <div className="student-dashboard" data-tour="page-student-dashboard">
      <div className="student-dashboard-shell">
        {error && (
          <div className="student-dashboard-banner" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="student-dashboard-loading">Loading your dashboard…</div>
        ) : (
          <>
            <div className="student-dashboard-stats">
              <article className="student-stat-card">
                <span className="student-stat-icon student-stat-icon--book" aria-hidden>
                  <i className="fa-solid fa-book-open" />
                </span>
                <div className="student-stat-text">
                  <span className="student-stat-label">Enrolled subjects</span>
                  <strong className="student-stat-value">{stats.enrolled}</strong>
                </div>
              </article>
              <article className="student-stat-card">
                <span className="student-stat-icon student-stat-icon--check" aria-hidden>
                  <i className="fa-solid fa-circle-check" />
                </span>
                <div className="student-stat-text">
                  <span className="student-stat-label">Completed subjects</span>
                  <strong className="student-stat-value">{stats.completed}</strong>
                </div>
              </article>
              <article className="student-stat-card">
                <span className="student-stat-icon student-stat-icon--warn" aria-hidden>
                  <i className="fa-solid fa-triangle-exclamation" />
                </span>
                <div className="student-stat-text">
                  <span className="student-stat-label">Failed subjects</span>
                  <strong className="student-stat-value">{stats.failed}</strong>
                </div>
              </article>
              <article className="student-stat-card">
                <span className="student-stat-icon student-stat-icon--cal" aria-hidden>
                  <i className="fa-solid fa-calendar-days" />
                </span>
                <div className="student-stat-text">
                  <span className="student-stat-label">Current term</span>
                  <strong className="student-stat-value student-stat-value--sm">{stats.currentSemester}</strong>
                </div>
              </article>
            </div>

            <div className="student-dashboard-actions">
              <button
                type="button"
                className="student-action-card student-action-card--green"
                onClick={() => onNavigate('curriculum')}
              >
                <span className="student-action-icon" aria-hidden>
                  <i className="fa-solid fa-clipboard-list" />
                </span>
                <span className="student-action-label">
                  View grades
                  <i className="fa-solid fa-chevron-right student-action-chevron" aria-hidden />
                </span>
              </button>
              <button
                type="button"
                className="student-action-card student-action-card--yellow"
                onClick={() => onNavigate('curriculum')}
              >
                <span className="student-action-icon" aria-hidden>
                  <i className="fa-solid fa-book" />
                </span>
                <span className="student-action-label">
                  View evaluation
                  <i className="fa-solid fa-chevron-right student-action-chevron" aria-hidden />
                </span>
              </button>
              <button
                type="button"
                className="student-action-card student-action-card--blue"
                onClick={() => onNavigate('profile')}
              >
                <span className="student-action-icon" aria-hidden>
                  <i className="fa-solid fa-user-circle" />
                </span>
                <span className="student-action-label">
                  Update profile
                  <i className="fa-solid fa-chevron-right student-action-chevron" aria-hidden />
                </span>
              </button>
            </div>

            <section className="student-dashboard-recent" aria-labelledby="student-recent-heading">
              <h2 id="student-recent-heading" className="student-recent-title">
                Recent activity
              </h2>
              {activities.length === 0 ? (
                <div className="student-recent-empty">No recent enrollment activity yet.</div>
              ) : (
                <ul className="student-recent-list">
                  {activities.map((a) => (
                    <li key={a.id} className="student-recent-row">
                      <span
                        className={`student-recent-dot student-recent-dot--${a.tone}`}
                        aria-hidden
                      >
                        <i className="fa-solid fa-check" />
                      </span>
                      <span className="student-recent-msg">{a.message}</span>
                      <span className="student-recent-time">{a.when}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default StudentDashboard;
