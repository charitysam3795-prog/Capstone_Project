import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import './AdminDashboard.css';

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * @param {{ onNavigate?: (tabId: string) => void }} props
 */
export default function AdminDashboard({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get('/admin/dashboard', { skipLoading: true });
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
  }, []);

  const go = (tabId) => {
    if (typeof onNavigate === 'function') onNavigate(tabId);
  };

  return (
    <div className="admin-dash" data-tour="page-admin-dashboard">
      <header className="admin-dash__header">
        <div>
          <h1 className="admin-dash__title">Dashboard</h1>
          <p className="admin-dash__lead">
            System overview — users, students, catalog data, and recent activity.
          </p>
        </div>
      </header>

      {loading ? (
        <p className="admin-dash__status">Loading…</p>
      ) : error ? (
        <p className="admin-dash__status admin-dash__status--error">{error}</p>
      ) : (
        <>
          <div className="admin-dash__stats">
            <div className="admin-dash-stat admin-dash-stat--green">
              <i className="fa-solid fa-users" aria-hidden />
              <span className="admin-dash-stat__label">Staff & accounts</span>
              <span className="admin-dash-stat__value">{data?.users?.total ?? 0}</span>
              <span className="admin-dash-stat__meta">
                {data?.users?.active ?? 0} active · {data?.users?.inactive ?? 0} inactive
              </span>
            </div>
            <div className="admin-dash-stat admin-dash-stat--teal">
              <i className="fa-solid fa-user-graduate" aria-hidden />
              <span className="admin-dash-stat__label">Students</span>
              <span className="admin-dash-stat__value">{data?.students?.total ?? 0}</span>
              <span className="admin-dash-stat__meta">Profiles on file</span>
            </div>
            <div className="admin-dash-stat admin-dash-stat--blue">
              <i className="fa-solid fa-book" aria-hidden />
              <span className="admin-dash-stat__label">Programs</span>
              <span className="admin-dash-stat__value">{data?.catalog?.programs ?? 0}</span>
              <span className="admin-dash-stat__meta">
                {data?.catalog?.departments ?? 0} departments
              </span>
            </div>
            <div className="admin-dash-stat admin-dash-stat--slate">
              <i className="fa-solid fa-layer-group" aria-hidden />
              <span className="admin-dash-stat__label">Subjects</span>
              <span className="admin-dash-stat__value">{data?.catalog?.subjects ?? 0}</span>
              <span className="admin-dash-stat__meta">
                {data?.catalog?.curriculum_rows ?? 0} curriculum rows
              </span>
            </div>
          </div>

          <div className="admin-dash__grid">
            <section className="admin-dash-panel admin-dash-panel--actions">
              <h2 className="admin-dash-panel__title">
                <i className="fa-solid fa-bolt" aria-hidden />
                Quick actions
              </h2>
              <div className="admin-dash-actions">
                <button type="button" className="admin-dash-action" onClick={() => go('users')}>
                  <i className="fa-solid fa-users" aria-hidden />
                  User Management
                </button>
                <button type="button" className="admin-dash-action" onClick={() => go('student-management')}>
                  <i className="fa-solid fa-user-graduate" aria-hidden />
                  Student Management
                </button>
                <button type="button" className="admin-dash-action" onClick={() => go('lookup')}>
                  <i className="fa-solid fa-table-list" aria-hidden />
                  Lookup Data
                </button>
                <button type="button" className="admin-dash-action" onClick={() => go('curriculum')}>
                  <i className="fa-solid fa-book" aria-hidden />
                  Curriculum
                </button>
                <button type="button" className="admin-dash-action" onClick={() => go('security')}>
                  <i className="fa-solid fa-lock" aria-hidden />
                  Security Settings
                </button>
                <button type="button" className="admin-dash-action" onClick={() => go('import-export')}>
                  <i className="fa-solid fa-file-import" aria-hidden />
                  Import / Export
                </button>
              </div>
            </section>

            <section className="admin-dash-panel">
              <h2 className="admin-dash-panel__title">
                <i className="fa-solid fa-user-tag" aria-hidden />
                Accounts by role
              </h2>
              {(data?.roles || []).length === 0 ? (
                <p className="admin-dash-panel__empty">No roles found.</p>
              ) : (
                <ul className="admin-dash-role-list">
                  {(data.roles || [])
                    .filter((r) => Number(r.count) > 0)
                    .map((r) => (
                      <li key={r.role_id}>
                        <span>{r.role_name}</span>
                        <strong>{r.count}</strong>
                      </li>
                    ))}
                </ul>
              )}
            </section>

            <section className="admin-dash-panel">
              <h2 className="admin-dash-panel__title">
                <i className="fa-solid fa-right-to-bracket" aria-hidden />
                Recent logins
              </h2>
              {(data?.recent_logins || []).length === 0 ? (
                <p className="admin-dash-panel__empty">No recent login activity.</p>
              ) : (
                <ul className="admin-dash-feed">
                  {(data.recent_logins || []).map((row, idx) => {
                    const who = row.display_name || row.email || 'Unknown';
                    const whereBits = [
                      row.role,
                      row.affiliation
                        ? `${row.affiliation_kind || (row.role === 'Student' ? 'Program' : 'Department')}: ${row.affiliation}`
                        : null,
                    ].filter(Boolean);
                    const device = [row.browser, row.platform].filter(Boolean).join(' · ');
                    return (
                      <li key={`${who}-${row.login_at}-${idx}`}>
                        <div className="admin-dash-feed__main">
                          <span className="admin-dash-feed__title">{who}</span>
                          <span className="admin-dash-feed__sub">
                            {[whereBits.join(' · '), device].filter(Boolean).join(' · ') || 'Session'}
                          </span>
                        </div>
                        <time className="admin-dash-feed__time">{formatWhen(row.login_at)}</time>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="admin-dash-panel">
              <h2 className="admin-dash-panel__title">
                <i className="fa-solid fa-clipboard-list" aria-hidden />
                Recent audit activity
              </h2>
              {(data?.recent_audits || []).length === 0 ? (
                <p className="admin-dash-panel__empty">No audit entries yet.</p>
              ) : (
                <ul className="admin-dash-feed">
                  {(data.recent_audits || []).map((row, idx) => (
                    <li key={`${row.actions}-${row.action_timestamp}-${idx}`}>
                      <div className="admin-dash-feed__main">
                        <span className="admin-dash-feed__title">{row.actions || 'UPDATE'}</span>
                        <span className="admin-dash-feed__sub">{row.table_name || '—'}</span>
                      </div>
                      <time className="admin-dash-feed__time">{formatWhen(row.action_timestamp)}</time>
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
}
