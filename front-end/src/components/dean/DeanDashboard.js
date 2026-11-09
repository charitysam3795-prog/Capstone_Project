import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { userDisplayName } from '../../utils/userDisplayName';
import '../common/StaffDashboard.css';

/**
 * @param {{
 *   onNavigate: (id: string) => void,
 *   showEvalModules: boolean,
 *   canManageCurriculum?: boolean,
 *   canManageUsers?: boolean,
 *   portalLabel?: string,
 *   analyticsTabId?: string,
 * }} props
 */
const DeanDashboard = ({
  onNavigate,
  showEvalModules,
  canManageCurriculum = false,
  canManageUsers = false,
  portalLabel = 'Dean',
  analyticsTabId = 'dean-analytics',
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!showEvalModules) {
      setLoading(false);
      setData(null);
      return undefined;
    }
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get('/evaluation/reports/dean-dashboard', { skipLoading: true });
        if (!cancelled) setData(res.data);
      } catch (e) {
        if (!cancelled) {
          setError(e?.response?.data?.message || 'Could not load dashboard.');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showEvalModules]);

  const total = Number(data?.total_students) || 0;
  const evaluated = Number(data?.evaluated_students) || 0;
  const completionPct = useMemo(() => {
    if (total <= 0) return 0;
    return Math.min(100, Math.round((evaluated / total) * 100));
  }, [evaluated, total]);

  const firstName = (userDisplayName(user) || 'there').split(/\s+/)[0];

  if (!showEvalModules) {
    return (
      <div className="staff-dash" data-tour="page-dean-dashboard">
        <header className="staff-dash__hero">
          <div>
            <p className="staff-dash__eyebrow">{portalLabel} workspace</p>
            <h1 className="staff-dash__title">Dashboard</h1>
            <p className="staff-dash__lead">
              You do not have access to evaluation insights for this portal.
            </p>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="staff-dash" data-tour="page-dean-dashboard">
      <header className="staff-dash__hero">
        <div>
          <p className="staff-dash__eyebrow">
            <i className="fa-solid fa-leaf" aria-hidden />
            {portalLabel} workspace
          </p>
          <h1 className="staff-dash__title">Welcome back, {firstName}</h1>
          <p className="staff-dash__lead">
            Snapshot of students, stored academic-record evaluations, and faculty evaluators in your
            scope.
          </p>
        </div>
        <aside className="staff-dash__hero-aside" aria-label="Evaluation completion">
          <div className="staff-dash__progress-label">
            <span>Records on file</span>
            <strong>{loading ? '—' : `${completionPct}%`}</strong>
          </div>
          <div className="staff-dash__progress-track" role="presentation">
            <div
              className="staff-dash__progress-fill"
              style={{ width: `${loading ? 0 : completionPct}%` }}
            />
          </div>
          <p className="staff-dash__progress-hint">
            {loading
              ? 'Loading completion…'
              : `${evaluated} of ${total} students have a stored evaluation.`}
          </p>
        </aside>
      </header>

      {loading ? (
        <p className="staff-dash__status">Loading dashboard…</p>
      ) : error ? (
        <p className="staff-dash__status staff-dash__status--error">{error}</p>
      ) : (
        <>
          <div className="staff-dash__stats" data-tour="dean-stats">
            <article className="staff-dash__stat staff-dash__stat--students">
              <div className="staff-dash__stat-icon" aria-hidden>
                <i className="fa-solid fa-users" />
              </div>
              <div className="staff-dash__stat-body">
                <span className="staff-dash__stat-label">Total students</span>
                <span className="staff-dash__stat-value">{total}</span>
                <span className="staff-dash__stat-meta">In your evaluation scope</span>
              </div>
            </article>
            <article className="staff-dash__stat staff-dash__stat--done">
              <div className="staff-dash__stat-icon" aria-hidden>
                <i className="fa-solid fa-user-check" />
              </div>
              <div className="staff-dash__stat-body">
                <span className="staff-dash__stat-label">Evaluated</span>
                <span className="staff-dash__stat-value">{evaluated}</span>
                <span className="staff-dash__stat-meta">Academic records on file</span>
              </div>
            </article>
            <article className="staff-dash__stat staff-dash__stat--staff">
              <div className="staff-dash__stat-icon" aria-hidden>
                <i className="fa-solid fa-chalkboard-user" />
              </div>
              <div className="staff-dash__stat-body">
                <span className="staff-dash__stat-label">Evaluators</span>
                <span className="staff-dash__stat-value">{data?.evaluators_count ?? 0}</span>
                <span className="staff-dash__stat-meta">Advisers in scope</span>
              </div>
            </article>
          </div>

          <div className="staff-dash__grid">
            <section className="staff-dash__panel">
              <div className="staff-dash__panel-head">
                <h2 className="staff-dash__panel-title">
                  <i className="fa-solid fa-bolt" aria-hidden />
                  Quick actions
                </h2>
              </div>
              <div className="staff-dash__actions" data-tour="dean-quick-actions">
                <button
                  type="button"
                  className="staff-dash__action staff-dash__action--primary"
                  onClick={() => onNavigate('academic-record')}
                >
                  <span className="staff-dash__action-icon" aria-hidden>
                    <i className="fa-solid fa-user-graduate" />
                  </span>
                  <span className="staff-dash__action-label">Evaluate a student</span>
                  <p className="staff-dash__action-hint">Open pending academic records</p>
                </button>
                <button
                  type="button"
                  className="staff-dash__action"
                  onClick={() => onNavigate(analyticsTabId)}
                >
                  <span className="staff-dash__action-icon" aria-hidden>
                    <i className="fa-solid fa-chart-column" />
                  </span>
                  <span className="staff-dash__action-label">View analytics</span>
                  <p className="staff-dash__action-hint">Trends and decision reports</p>
                </button>
                <button
                  type="button"
                  className="staff-dash__action"
                  disabled={!canManageCurriculum}
                  title={!canManageCurriculum ? 'No curriculum management permission' : undefined}
                  onClick={() => canManageCurriculum && onNavigate('admin-curriculum')}
                >
                  <span className="staff-dash__action-icon" aria-hidden>
                    <i className="fa-solid fa-book" />
                  </span>
                  <span className="staff-dash__action-label">Manage curriculum</span>
                  <p className="staff-dash__action-hint">Programs and subject maps</p>
                </button>
                <button
                  type="button"
                  className="staff-dash__action"
                  disabled={!canManageUsers}
                  title={!canManageUsers ? 'No user management permission' : undefined}
                  onClick={() => canManageUsers && onNavigate('user-management')}
                >
                  <span className="staff-dash__action-icon" aria-hidden>
                    <i className="fa-solid fa-users-gear" />
                  </span>
                  <span className="staff-dash__action-label">Manage users</span>
                  <p className="staff-dash__action-hint">Staff accounts and access</p>
                </button>
              </div>
            </section>

            <section className="staff-dash__panel">
              <div className="staff-dash__panel-head">
                <h2 className="staff-dash__panel-title">
                  <i className="fa-solid fa-clock-rotate-left" aria-hidden />
                  Recent activity
                </h2>
                <span className="staff-dash__panel-note">Latest stored evaluations</span>
              </div>
              {!data?.recent_activity?.length ? (
                <p className="staff-dash__empty">No recent stored evaluations yet.</p>
              ) : (
                <ul className="staff-dash__timeline">
                  {data.recent_activity.map((row) => (
                    <li key={row.academic_record_complete_id} className="staff-dash__timeline-item">
                      <div className="staff-dash__timeline-rail" aria-hidden>
                        <span className="staff-dash__timeline-dot" />
                      </div>
                      <div className="staff-dash__timeline-body">
                        <div className="staff-dash__timeline-name">{row.student_name}</div>
                        <div className="staff-dash__timeline-sub">{row.subtitle}</div>
                        <div className="staff-dash__timeline-meta">
                          <span className="staff-dash__timeline-time">{row.completed_at_human}</span>
                          <span className="staff-dash__badge">Approved</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
};

export default DeanDashboard;
