import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { userDisplayName } from '../../utils/userDisplayName';
import '../common/StaffDashboard.css';

/**
 * @param {{
 *   onNavigate: (tabId: string) => void,
 *   showEvalModules: boolean,
 *   portalLabel?: string,
 * }} props
 */
const EvaluatorDashboard = ({ onNavigate, showEvalModules, portalLabel = 'Adviser' }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState([]);
  const [evaluated, setEvaluated] = useState([]);

  useEffect(() => {
    let cancelled = false;
    if (!showEvalModules) {
      setPending([]);
      setEvaluated([]);
      setLoading(false);
      return undefined;
    }
    (async () => {
      setLoading(true);
      try {
        const [pRes, eRes] = await Promise.all([
          api.get('/evaluation/students', { params: { academic_record: 'pending' }, skipLoading: true }),
          api.get('/evaluation/students', { params: { academic_record: 'completed' }, skipLoading: true }),
        ]);
        if (cancelled) return;
        setPending(pRes.data?.students || []);
        setEvaluated(eRes.data?.students || []);
      } catch {
        if (!cancelled) {
          setPending([]);
          setEvaluated([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showEvalModules]);

  const totalInScope = pending.length + evaluated.length;
  const completionPct = useMemo(() => {
    if (totalInScope <= 0) return 0;
    return Math.min(100, Math.round((evaluated.length / totalInScope) * 100));
  }, [evaluated.length, totalInScope]);

  const recentActivity = useMemo(() => {
    return evaluated
      .filter((s) => s.academic_record_completed_at)
      .map((s) => ({
        ...s,
        ts: new Date(s.academic_record_completed_at).getTime(),
      }))
      .filter((s) => !Number.isNaN(s.ts))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 8);
  }, [evaluated]);

  const formatRelative = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 48) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const firstName = (userDisplayName(user) || 'there').split(/\s+/)[0];

  return (
    <div className="staff-dash" data-tour="page-evaluator-dashboard">
      <header className="staff-dash__hero">
        <div>
          <p className="staff-dash__eyebrow">
            <i className="fa-solid fa-leaf" aria-hidden />
            {portalLabel} workspace
          </p>
          <h1 className="staff-dash__title">Welcome back, {firstName}</h1>
          <p className="staff-dash__lead">
            Overview of students in your evaluation scope. Jump into pending records or review
            analytics when you need a wider picture.
          </p>
        </div>
        <aside className="staff-dash__hero-aside" aria-label="Evaluation completion">
          <div className="staff-dash__progress-label">
            <span>Completion</span>
            <strong>
              {loading || !showEvalModules ? '—' : `${completionPct}%`}
            </strong>
          </div>
          <div className="staff-dash__progress-track" role="presentation">
            <div
              className="staff-dash__progress-fill"
              style={{ width: `${loading || !showEvalModules ? 0 : completionPct}%` }}
            />
          </div>
          <p className="staff-dash__progress-hint">
            {!showEvalModules
              ? 'Evaluation modules are not enabled for this account.'
              : loading
                ? 'Loading completion…'
                : `${evaluated.length} evaluated · ${pending.length} still pending`}
          </p>
        </aside>
      </header>

      <div className="staff-dash__stats">
        <article className="staff-dash__stat staff-dash__stat--students">
          <div className="staff-dash__stat-icon" aria-hidden>
            <i className="fa-solid fa-users" />
          </div>
          <div className="staff-dash__stat-body">
            <span className="staff-dash__stat-label">In scope</span>
            <span className="staff-dash__stat-value">
              {loading || !showEvalModules ? '—' : totalInScope}
            </span>
            <span className="staff-dash__stat-meta">Students assigned to you</span>
          </div>
        </article>
        <article className="staff-dash__stat staff-dash__stat--done">
          <div className="staff-dash__stat-icon" aria-hidden>
            <i className="fa-solid fa-user-check" />
          </div>
          <div className="staff-dash__stat-body">
            <span className="staff-dash__stat-label">Evaluated</span>
            <span className="staff-dash__stat-value">
              {loading || !showEvalModules ? '—' : evaluated.length}
            </span>
            <span className="staff-dash__stat-meta">Records already on file</span>
          </div>
        </article>
        <article className="staff-dash__stat staff-dash__stat--pending">
          <div className="staff-dash__stat-icon" aria-hidden>
            <i className="fa-solid fa-clipboard-list" />
          </div>
          <div className="staff-dash__stat-body">
            <span className="staff-dash__stat-label">Pending</span>
            <span className="staff-dash__stat-value">
              {loading || !showEvalModules ? '—' : pending.length}
            </span>
            <span className="staff-dash__stat-meta">Ready for your review</span>
          </div>
        </article>
      </div>

      {!showEvalModules ? (
        <p className="staff-dash__empty">
          You do not have student evaluation permissions. Use <strong>My Profile</strong> or contact
          an administrator to update your role.
        </p>
      ) : (
        <div className="staff-dash__grid">
          <section className="staff-dash__panel">
            <div className="staff-dash__panel-head">
              <h2 className="staff-dash__panel-title">
                <i className="fa-solid fa-bolt" aria-hidden />
                Quick actions
              </h2>
            </div>
            <div className="staff-dash__actions">
              <button
                type="button"
                className="staff-dash__action staff-dash__action--primary"
                onClick={() => onNavigate('academic-record')}
              >
                <span className="staff-dash__action-icon" aria-hidden>
                  <i className="fa-solid fa-user-graduate" />
                </span>
                <span className="staff-dash__action-label">Evaluate a student</span>
                <p className="staff-dash__action-hint">Continue with pending records</p>
              </button>
              <button
                type="button"
                className="staff-dash__action"
                onClick={() => onNavigate('analytics')}
              >
                <span className="staff-dash__action-icon" aria-hidden>
                  <i className="fa-solid fa-chart-column" />
                </span>
                <span className="staff-dash__action-label">View analytics</span>
                <p className="staff-dash__action-hint">See progress across your caseload</p>
              </button>
            </div>
          </section>

          <section className="staff-dash__panel">
            <div className="staff-dash__panel-head">
              <h2 className="staff-dash__panel-title">
                <i className="fa-solid fa-clock-rotate-left" aria-hidden />
                Recent activity
              </h2>
              <span className="staff-dash__panel-note">Latest completions</span>
            </div>
            {recentActivity.length === 0 ? (
              <p className="staff-dash__empty">
                No stored evaluation records yet, or none with a completion date.
              </p>
            ) : (
              <ul className="staff-dash__timeline">
                {recentActivity.map((s) => (
                  <li key={`${s.student_id}-${s.ts}`} className="staff-dash__timeline-item">
                    <div className="staff-dash__timeline-rail" aria-hidden>
                      <span className="staff-dash__timeline-dot" />
                    </div>
                    <div className="staff-dash__timeline-body">
                      <div className="staff-dash__timeline-name">{s.full_name}</div>
                      <div className="staff-dash__timeline-sub">
                        Academic record evaluation stored
                      </div>
                      <div className="staff-dash__timeline-meta">
                        <span className="staff-dash__timeline-time">
                          {formatRelative(s.academic_record_completed_at)}
                        </span>
                        <span className="staff-dash__badge">Approved</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default EvaluatorDashboard;
