import React, { useState, useCallback, useMemo } from 'react';
import api from '../../api/axios';
import { swalError } from '../../utils/swal';
import './AuditLogsManagement.css';

const formatJson = (value) => {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
};

const summarizeEntry = (item) => {
  const action = (item.actions || '').toUpperCase();
  const newVal = item.new_value;
  const oldVal = item.old_value;
  if (action === 'UPDATE' && newVal && typeof newVal === 'object' && !Array.isArray(newVal)) {
    const n = Object.keys(newVal).length;
    return n ? `${n} field(s) changed` : '—';
  }
  if (action === 'CREATE') return 'Record created';
  if (action === 'DELETE') return 'Record removed';
  if (oldVal || newVal) return 'See trail';
  return '—';
};

const hasTrail = (item) =>
  (item.old_value != null && item.old_value !== '') ||
  (item.new_value != null && item.new_value !== '');

const actionBadgeClass = (action) => {
  const a = String(action || '').toUpperCase();
  if (a === 'CREATE') return 'audit-action-badge audit-action-badge--create';
  if (a === 'UPDATE') return 'audit-action-badge audit-action-badge--update';
  if (a === 'DELETE') return 'audit-action-badge audit-action-badge--delete';
  return 'audit-action-badge audit-action-badge--other';
};

const formatTs = (ts) => {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
    });
  } catch {
    return ts;
  }
};

const formatDuration = (loginAt, logoutAt) => {
  if (!loginAt || !logoutAt) return '—';
  const start = new Date(loginAt).getTime();
  const end = new Date(logoutAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—';
  const totalSeconds = Math.floor((end - start) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const sessionStatusLabel = (item) => {
  if (item.status === 'failed') return 'Failed';
  if (item.logout_at) return 'Logged out';
  return 'Active';
};

const AuditLogsManagement = () => {
  const [activeTab, setActiveTab] = useState('activity');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [filterTable, setFilterTable] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [sessionRows, setSessionRows] = useState([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionPagination, setSessionPagination] = useState(null);
  const [filterEmail, setFilterEmail] = useState('');
  const [filterSessionStatus, setFilterSessionStatus] = useState('');
  const [filterIp, setFilterIp] = useState('');
  const perPage = 25;

  const fetchLogs = useCallback(
    async (targetPage = 1) => {
      setError('');
      setLoading(true);
      try {
        const params = {
          per_page: perPage,
          page: targetPage,
        };
        if (filterTable.trim()) params.table_name = filterTable.trim();
        if (filterAction) params.actions = filterAction;

        const resp = await api.get('/audit-logs', { params });
        const body = resp?.data;

        if (body && Array.isArray(body.data)) {
          setRows(body.data);
          setPagination({
            currentPage: body.current_page,
            lastPage: body.last_page,
            total: body.total,
            from: body.from,
            to: body.to,
          });
          setPage(body.current_page);
        } else if (Array.isArray(body)) {
          setRows(body);
          setPagination(null);
        } else {
          setRows([]);
          setPagination(null);
        }
      } catch (err) {
        const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to load audit logs';
        setError(msg);
        await swalError('Audit logs', msg);
        setRows([]);
        setPagination(null);
      } finally {
        setLoading(false);
      }
    },
    [filterTable, filterAction, perPage]
  );

  const fetchSessions = useCallback(
    async (targetPage = 1) => {
      setError('');
      setSessionLoading(true);
      try {
        const params = {
          per_page: perPage,
          page: targetPage,
        };
        if (filterEmail.trim()) params.email = filterEmail.trim();
        if (filterSessionStatus) params.status = filterSessionStatus;
        if (filterIp.trim()) params.ip_address = filterIp.trim();

        const resp = await api.get('/audit-logs/sessions', { params });
        const body = resp?.data;
        if (body && Array.isArray(body.data)) {
          setSessionRows(body.data);
          setSessionPagination({
            currentPage: body.current_page,
            lastPage: body.last_page,
            total: body.total,
            from: body.from,
            to: body.to,
          });
          setSessionPage(body.current_page);
        } else if (Array.isArray(body)) {
          setSessionRows(body);
          setSessionPagination(null);
        } else {
          setSessionRows([]);
          setSessionPagination(null);
        }
      } catch (err) {
        const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to load session activity';
        setError(msg);
        await swalError('Session activity', msg);
        setSessionRows([]);
        setSessionPagination(null);
      } finally {
        setSessionLoading(false);
      }
    },
    [filterEmail, filterSessionStatus, filterIp, perPage]
  );

  React.useEffect(() => {
    fetchLogs(1);
    // Initial load only; use Apply filters / pagination / Refresh afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (activeTab === 'sessions' && sessionRows.length === 0) {
      fetchSessions(1);
    }
  }, [activeTab, fetchSessions, sessionRows.length]);

  const applyFilters = () => {
    setExpandedId(null);
    fetchLogs(1);
  };

  const applySessionFilters = () => {
    fetchSessions(1);
  };

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const metaLine = useMemo(() => {
    if (!pagination) return null;
    const { from, to, total, currentPage, lastPage } = pagination;
    if (total === 0) return 'No entries';
    return `Showing ${from ?? 0}–${to ?? 0} of ${total} · Page ${currentPage} of ${lastPage}`;
  }, [pagination]);

  const sessionMetaLine = useMemo(() => {
    if (!sessionPagination) return null;
    const { from, to, total, currentPage, lastPage } = sessionPagination;
    if (total === 0) return 'No entries';
    return `Showing ${from ?? 0}–${to ?? 0} of ${total} · Page ${currentPage} of ${lastPage}`;
  }, [sessionPagination]);

  if (loading && rows.length === 0) {
    return <div className="loading">Loading audit trail…</div>;
  }

  return (
    <div className="audit-logs-management">
      <div className="management-header">
        <h2>Audit trail</h2>
        <button
          type="button"
          className="refresh-button"
          onClick={() => (activeTab === 'sessions' ? fetchSessions(sessionPage) : fetchLogs(page))}
        >
          Refresh
        </button>
      </div>
      <p className="audit-intro">
        Review data changes and user login sessions, including IP address, browser/device, and login/logout times.
      </p>
      {error && <div className="error-message">{error}</div>}

      <div className="audit-tabs" role="tablist" aria-label="Audit trail sections">
        <button
          type="button"
          className={activeTab === 'activity' ? 'audit-tab active' : 'audit-tab'}
          onClick={() => setActiveTab('activity')}
        >
          Activity log
        </button>
        <button
          type="button"
          className={activeTab === 'sessions' ? 'audit-tab active' : 'audit-tab'}
          onClick={() => setActiveTab('sessions')}
        >
          Login sessions
        </button>
      </div>

      {activeTab === 'activity' && (
        <>
        <div className="audit-logs-filters">
        <label>
          Table
          <input
            type="text"
            placeholder="e.g. tbl_users"
            value={filterTable}
            onChange={(e) => setFilterTable(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
          />
        </label>
        <label>
          Action
          <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
            <option value="">All</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
        </label>
        <button type="button" className="refresh-button" onClick={applyFilters}>
          Apply filters
        </button>
      </div>

      <div className="table-section">
        <div className="section-header">
          <h3>Activity log</h3>
        </div>
        <div className="table-container">
          <table className="audit-table audit-table--activity">
            <thead>
              <tr>
                <th>User</th>
                <th>Action</th>
                <th>Table</th>
                <th>Summary</th>
                <th>Timestamp</th>
                <th>Trail</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="no-data">
                    No audit entries yet. Changes to users, profiles, evaluations, enrollments, and related records
                    will appear here.
                  </td>
                </tr>
              ) : (
                rows.flatMap((item) => {
                  const id = item.audit_logs_id ?? item.id;
                  const open = expandedId === id;
                  const action = item.actions || '—';
                  const mainRow = (
                    <tr key={id}>
                      <td>{item.user?.email || item.user?.Email || '—'}</td>
                      <td>
                        <span className={actionBadgeClass(action)}>{action}</span>
                      </td>
                      <td>
                        <span className="audit-table-chip">{item.table_name || '—'}</span>
                      </td>
                      <td>{summarizeEntry(item)}</td>
                      <td>{formatTs(item.action_timestamp)}</td>
                      <td>
                        {hasTrail(item) ? (
                          <button type="button" className="audit-trail-toggle" onClick={() => toggleExpand(id)}>
                            {open ? 'Hide' : 'View'} before / after
                          </button>
                        ) : (
                          <span className="audit-trail-empty">No snapshot</span>
                        )}
                      </td>
                    </tr>
                  );
                  if (!open || !hasTrail(item)) {
                    return [mainRow];
                  }
                  return [
                    mainRow,
                    <tr key={`${id}-detail`} className="audit-trail-row">
                      <td colSpan={6}>
                        <div className="audit-trail-panel">
                          <h4>Previous values</h4>
                          {item.old_value != null && item.old_value !== '' ? (
                            <pre>{formatJson(item.old_value)}</pre>
                          ) : (
                            <p className="audit-trail-empty">None (create or no prior state captured)</p>
                          )}
                          <h4>New values</h4>
                          {item.new_value != null && item.new_value !== '' ? (
                            <pre>{formatJson(item.new_value)}</pre>
                          ) : (
                            <p className="audit-trail-empty">None (delete or cleared)</p>
                          )}
                        </div>
                      </td>
                    </tr>,
                  ];
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.lastPage > 1 && (
          <div className="audit-logs-pagination">
            <span>{metaLine}</span>
            <div>
              <button
                type="button"
                disabled={pagination.currentPage <= 1 || loading}
                onClick={() => fetchLogs(pagination.currentPage - 1)}
              >
                Previous
              </button>
              {' '}
              <button
                type="button"
                disabled={pagination.currentPage >= pagination.lastPage || loading}
                onClick={() => fetchLogs(pagination.currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
        </>
      )}

      {activeTab === 'sessions' && (
        <>
          <div className="audit-logs-filters">
            <label>
              Email
              <input
                type="text"
                placeholder="e.g. dean@example.com"
                value={filterEmail}
                onChange={(e) => setFilterEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applySessionFilters()}
              />
            </label>
            <label>
              Status
              <select value={filterSessionStatus} onChange={(e) => setFilterSessionStatus(e.target.value)}>
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="logged_out">Logged out</option>
                <option value="failed">Failed login</option>
              </select>
            </label>
            <label>
              IP address
              <input
                type="text"
                placeholder="e.g. 127.0.0.1"
                value={filterIp}
                onChange={(e) => setFilterIp(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applySessionFilters()}
              />
            </label>
            <button type="button" className="refresh-button" onClick={applySessionFilters}>
              Apply filters
            </button>
          </div>

          <div className="table-section">
            <div className="section-header">
              <h3>Login sessions</h3>
            </div>
            <div className="table-container">
              <table className="audit-table audit-table--sessions">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Status</th>
                    <th>Login time</th>
                    <th>Logout time</th>
                    <th>Duration</th>
                    <th>IP address</th>
                    <th>Device / browser</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionLoading && sessionRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="no-data">Loading login sessions...</td>
                    </tr>
                  ) : sessionRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="no-data">
                        No session entries yet. New login/logout attempts will appear here.
                      </td>
                    </tr>
                  ) : (
                    sessionRows.map((item) => {
                      const status = sessionStatusLabel(item);
                      const statusClass =
                        item.status === 'failed'
                          ? 'failed'
                          : item.logout_at
                            ? 'logged-out'
                            : 'active';

                      return (
                        <tr key={item.session_log_id}>
                          <td>
                            <div className="audit-session-user">
                              <strong>
                                {item.display_name ||
                                  item.email ||
                                  item.user?.email ||
                                  'Unknown user'}
                              </strong>
                              <span>
                                {[
                                  item.actor_role || item.user?.role?.role_name,
                                  item.affiliation
                                    ? `${item.affiliation_kind || 'Unit'}: ${item.affiliation}`
                                    : null,
                                  item.student_id_number
                                    ? `ID: ${item.student_id_number}`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`audit-session-status audit-session-status--${statusClass}`}>
                              {status}
                            </span>
                          </td>
                          <td>{formatTs(item.login_at)}</td>
                          <td>{formatTs(item.logout_at)}</td>
                          <td>{formatDuration(item.login_at, item.logout_at)}</td>
                          <td>
                            <span className="audit-ip-chip">{item.ip_address || '—'}</span>
                          </td>
                          <td>
                            <div className="audit-session-device">
                              <strong>
                                {item.device || 'Unknown'} · {item.browser || 'Unknown'}
                              </strong>
                              <span>{item.platform || 'Unknown platform'}</span>
                            </div>
                          </td>
                          <td>{item.failure_reason || item.logout_reason || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {sessionPagination && sessionPagination.lastPage > 1 && (
              <div className="audit-logs-pagination">
                <span>{sessionMetaLine}</span>
                <div>
                  <button
                    type="button"
                    disabled={sessionPagination.currentPage <= 1 || sessionLoading}
                    onClick={() => fetchSessions(sessionPagination.currentPage - 1)}
                  >
                    Previous
                  </button>
                  {' '}
                  <button
                    type="button"
                    disabled={sessionPagination.currentPage >= sessionPagination.lastPage || sessionLoading}
                    onClick={() => fetchSessions(sessionPagination.currentPage + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AuditLogsManagement;
