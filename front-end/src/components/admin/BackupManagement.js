import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import { swalConfirm, swalError, swalToast } from '../../utils/swal';
import './BackupManagement.css';

function formatBytes(n) {
  const size = Number(n) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'success') return 'backup-status backup-status--ok';
  if (s === 'running') return 'backup-status backup-status--run';
  if (s === 'failed') return 'backup-status backup-status--fail';
  return 'backup-status';
}

const HISTORY_PER_PAGE = 10;

const BackupManagement = () => {
  const [info, setInfo] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPagination, setHistoryPagination] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [busyAction, setBusyAction] = useState(null); // 'download' | 'restore'
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    enabled: true,
    schedule_type: 'daily',
    backup_time: '00:01',
    storage_path: '',
  });

  const loadHistory = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const histRes = await api.get('/system/backup/history', {
        params: { page, per_page: HISTORY_PER_PAGE },
      });
      const body = histRes.data || {};
      setHistory(Array.isArray(body.data) ? body.data : []);
      setHistoryPage(Number(body.current_page) || page);
      setHistoryPagination({
        currentPage: Number(body.current_page) || page,
        lastPage: Number(body.last_page) || 1,
        perPage: Number(body.per_page) || HISTORY_PER_PAGE,
        total: Number(body.total) || 0,
        from: body.from ?? null,
        to: body.to ?? null,
      });
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Could not load backup history';
      setError(msg);
      setHistory([]);
      setHistoryPagination(null);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadInfo = useCallback(async () => {
    const infoRes = await api.get('/system/backup/info');
    const nextInfo = infoRes.data || null;
    setInfo(nextInfo);
    if (nextInfo?.schedule) {
      setForm({
        enabled: Boolean(nextInfo.schedule.enabled),
        schedule_type: nextInfo.schedule.schedule_type || 'daily',
        backup_time: nextInfo.schedule.backup_time || '00:01',
        storage_path: nextInfo.schedule.storage_path || nextInfo.storage_path || '',
      });
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await loadInfo();
      await loadHistory(1);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Could not load backup data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [loadInfo, loadHistory]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const historyMetaLine = useMemo(() => {
    if (!historyPagination) return null;
    const { from, to, total, currentPage, lastPage } = historyPagination;
    return `Showing ${from ?? 0}–${to ?? 0} of ${total} · Page ${currentPage} of ${lastPage}`;
  }, [historyPagination]);

  const stats = info?.stats || {};

  const scheduleLabel = useMemo(() => {
    if (!form.enabled) return 'Disabled';
    return `Daily at ${form.backup_time || '00:01'}`;
  }, [form.enabled, form.backup_time]);

  const saveSchedule = async (e) => {
    e?.preventDefault?.();
    setSavingSchedule(true);
    setError('');
    try {
      await api.put('/system/backup/schedule', {
        enabled: Boolean(form.enabled),
        schedule_type: 'daily',
        backup_time: form.backup_time,
            storage_path: form.storage_path
              ? String(form.storage_path).replace(/\\/g, '/')
              : null,
      });
      swalToast('success', 'Backup schedule saved');
      await loadAll();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Could not save schedule';
      setError(msg);
      await swalError('Save failed', msg);
    } finally {
      setSavingSchedule(false);
    }
  };

  const createBackup = async () => {
    setCreating(true);
    setError('');
    try {
      await api.post('/system/backup/create', {}, { timeout: 0 });
      swalToast('success', 'Backup created on server');
      await loadInfo();
      await loadHistory(1);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        (typeof err.response?.data === 'string' ? err.response.data : null) ||
        err.message ||
        'Backup failed';
      setError(msg);
      await loadHistory(1);
      await swalError('Backup failed', msg);
    } finally {
      setCreating(false);
    }
  };

  const downloadRow = async (row) => {
    setBusyId(row.id);
    setBusyAction('download');
    try {
      const res = await api.get(`/system/backup/download/${row.id}`, {
        responseType: 'blob',
        timeout: 0,
        headers: {
          Accept: 'application/sql, application/octet-stream, */*',
        },
      });
      const contentType = String(res.headers['content-type'] || '');
      if (contentType.includes('application/json')) {
        const text = await res.data.text();
        const parsed = JSON.parse(text);
        throw new Error(parsed?.message || 'Download failed');
      }
      if (!(res.data instanceof Blob) || res.data.size === 0) {
        throw new Error('Download returned an empty file');
      }
      const blob = new Blob([res.data], { type: 'application/sql;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = row.file_name || `backup_${row.id}.sql`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      swalToast('success', 'Download started');
    } catch (err) {
      let msg = err.message || 'Download failed';
      if (err.response?.data instanceof Blob) {
        try {
          const parsed = JSON.parse(await err.response.data.text());
          msg = parsed.message || parsed.error || msg;
        } catch {
          // keep
        }
      } else if (err.response?.data?.message) {
        msg = err.response.data.message;
      }
      await swalError('Download failed', msg);
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const restoreRow = async (row) => {
    const ok = await swalConfirm({
      title: 'Restore this backup?',
      text: `This will overwrite the live database with ${row.file_name}. Continue only if you understand the risk.`,
      confirmButtonText: 'Restore',
    });
    if (!ok) return;
    setBusyId(row.id);
    setBusyAction('restore');
    try {
      await api.post(`/system/backup/restore/${row.id}`, {}, { timeout: 0 });
      swalToast('success', 'Database restored');
      await loadInfo();
      await loadHistory(historyPage);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Restore failed';
      await swalError('Restore failed', msg);
      await loadInfo();
      await loadHistory(historyPage);
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  return (
    <div className="backup-mgmt">
      {error ? <div className="backup-mgmt__error">{error}</div> : null}

      <div className="backup-mgmt__stats">
        <div className="backup-stat">
          <span className="backup-stat__label">Schedule</span>
          <strong className="backup-stat__value">{scheduleLabel}</strong>
          <small className="backup-stat__sub">
            Next run: {formatWhen(info?.schedule?.next_run_at)}
          </small>
        </div>
        <div className="backup-stat">
          <span className="backup-stat__label">Backups</span>
          <strong className="backup-stat__value">{stats.backups_success ?? 0}</strong>
          <small className="backup-stat__sub">{stats.backups_failed ?? 0} failed</small>
        </div>
        <div className="backup-stat">
          <span className="backup-stat__label">Restores</span>
          <strong className="backup-stat__value">{stats.restores_success ?? 0}</strong>
          <small className="backup-stat__sub">{stats.restores_failed ?? 0} failed</small>
        </div>
        <div className="backup-stat">
          <span className="backup-stat__label">Last success</span>
          <strong className="backup-stat__value backup-stat__value--sm">
            {formatWhen(stats.last_success_at)}
          </strong>
          <small className="backup-stat__sub">
            Server: {formatWhen(info?.server_time)}
          </small>
        </div>
      </div>

      <div className="backup-mgmt__grid">
        <section className="backup-panel">
          <header className="backup-panel__head">
            <h2>Backup schedule</h2>
            <p>Store SQL snapshots on the server and run them on a daily schedule.</p>
          </header>
          <form className="backup-schedule" onSubmit={saveSchedule}>
            <label className="backup-check">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                disabled={savingSchedule || loading}
              />
              Enable scheduled backups
            </label>

            <label className="backup-field">
              <span>Schedule type</span>
              <select
                value={form.schedule_type}
                onChange={(e) => setForm((f) => ({ ...f, schedule_type: e.target.value }))}
                disabled
              >
                <option value="daily">Daily</option>
              </select>
            </label>

            <label className="backup-field">
              <span>Backup time</span>
              <input
                type="time"
                value={form.backup_time}
                onChange={(e) => setForm((f) => ({ ...f, backup_time: e.target.value }))}
                disabled={savingSchedule || loading}
                required
              />
            </label>

            <label className="backup-field">
              <span>Backup storage path</span>
              <input
                type="text"
                value={form.storage_path}
                onChange={(e) => setForm((f) => ({ ...f, storage_path: e.target.value }))}
                placeholder={info?.storage_path || 'storage/app/backups'}
                disabled={savingSchedule || loading}
              />
              <small>Leave blank for the default server folder. Absolute paths are allowed.</small>
            </label>

            <div className="backup-profile">
              <div>
                <span>Summary</span>
                <strong>{info?.schedule?.summary || scheduleLabel}</strong>
              </div>
              <div>
                <span>Next scheduled run</span>
                <strong>{formatWhen(info?.schedule?.next_run_at)}</strong>
              </div>
              <div>
                <span>Server timezone</span>
                <strong>{info?.timezone || '—'}</strong>
              </div>
              <div>
                <span>Server storage</span>
                <strong className="backup-profile__path">{info?.storage_path || '—'}</strong>
              </div>
            </div>

            <div className="backup-schedule__actions">
              <button
                type="button"
                className="backup-btn backup-btn--ghost"
                onClick={loadAll}
                disabled={loading || savingSchedule || creating}
              >
                Reload
              </button>
              <button
                type="submit"
                className="backup-btn backup-btn--primary"
                disabled={savingSchedule || loading}
              >
                {savingSchedule ? 'Saving…' : 'Save schedule'}
              </button>
            </div>
          </form>
        </section>

        <section className="backup-panel">
          <header className="backup-panel__head">
            <h2>Backup safety</h2>
            <p>How backups are protected on this system.</p>
          </header>
          <ul className="backup-safety">
            <li>
              <strong>Conflict protection</strong>
              <span>A server lock prevents overlapping backup and restore jobs.</span>
            </li>
            <li>
              <strong>Server storage</strong>
              <span>
                Snapshots stay on the server and appear in history until you download or restore
                them.
              </span>
            </li>
            <li>
              <strong>Restore tracking</strong>
              <span>Every restore attempt is logged for auditability.</span>
            </li>
            <li>
              <strong>Database</strong>
              <span>
                {info?.database || '—'} · {info?.table_count ?? '—'} tables
              </span>
            </li>
          </ul>
          <button
            type="button"
            className="backup-btn backup-btn--primary backup-btn--block"
            onClick={createBackup}
            disabled={creating || loading}
          >
            <i className="fa-solid fa-database" aria-hidden />
            {creating ? 'Creating backup…' : 'Create backup now'}
          </button>
        </section>
      </div>

      <section className="backup-panel backup-panel--wide">
        <header className="backup-panel__head backup-panel__head--row">
          <div>
            <h2>Backup history</h2>
            <p>
              Review backup and restore activity, download stored backups, and restore from a
              previous successful snapshot. New backups are kept in the database as well as on disk
              so they stay downloadable after a redeploy. Restore replaces the entire live database
              with the chosen backup (all current data is overwritten).
            </p>
          </div>
        </header>

        <div className="backup-table-wrap">
          <table className="backup-table">
            <thead>
              <tr>
                <th>Date / time</th>
                <th>Action</th>
                <th>Trigger</th>
                <th>Status</th>
                <th>File name</th>
                <th>Size</th>
                <th>Details</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading || historyLoading ? (
                <tr>
                  <td colSpan={8} className="backup-table__empty">
                    Loading history…
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={8} className="backup-table__empty">
                    No backups yet. Create one or wait for the scheduled run.
                  </td>
                </tr>
              ) : (
                history.map((row) => {
                  const canUse =
                    row.action === 'backup' &&
                    row.status === 'success' &&
                    row.file_exists !== false;
                  const busy = busyId === row.id;
                  const downloading = busy && busyAction === 'download';
                  const restoring = busy && busyAction === 'restore';
                  return (
                    <tr key={row.id}>
                      <td>{formatWhen(row.started_at || row.created_at)}</td>
                      <td className="backup-cap">{row.action || '—'}</td>
                      <td className="backup-cap">{row.trigger || '—'}</td>
                      <td>
                        <span className={statusClass(row.status)}>{row.status || '—'}</span>
                      </td>
                      <td>
                        <div className="backup-file">
                          <span>{row.file_name || '—'}</span>
                          {row.action === 'backup' ? (
                            <small>
                              {row.file_exists === false
                                ? 'Not available (only history remains — run a new backup)'
                                : row.file_in_database && !row.file_on_disk
                                  ? 'Available (stored in database)'
                                  : row.file_on_disk
                                    ? 'Stored on server'
                                    : 'Available'}
                            </small>
                          ) : null}
                        </div>
                      </td>
                      <td>{formatBytes(row.file_size)}</td>
                      <td className="backup-details">{row.details || 'No details recorded'}</td>
                      <td>
                        <div className="backup-row-actions">
                          <button
                            type="button"
                            className={`backup-link${downloading ? ' backup-link--busy' : ''}`}
                            disabled={!canUse || busyId != null || creating}
                            onClick={() => downloadRow(row)}
                            aria-busy={downloading}
                          >
                            {downloading ? (
                              <>
                                <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                                Downloading…
                              </>
                            ) : (
                              'Download'
                            )}
                          </button>
                          <button
                            type="button"
                            className={`backup-link${restoring ? ' backup-link--busy' : ''}`}
                            disabled={!canUse || busyId != null || creating}
                            onClick={() => restoreRow(row)}
                            aria-busy={restoring}
                          >
                            {restoring ? (
                              <>
                                <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                                Restoring…
                              </>
                            ) : (
                              'Restore'
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {historyPagination && historyPagination.total > 0 ? (
          <div className="backup-pagination">
            <span>{historyMetaLine}</span>
            <div className="backup-pagination__btns">
              <button
                type="button"
                disabled={historyPagination.currentPage <= 1 || historyLoading || loading}
                onClick={() => loadHistory(historyPagination.currentPage - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={
                  historyPagination.currentPage >= historyPagination.lastPage ||
                  historyLoading ||
                  loading
                }
                onClick={() => loadHistory(historyPagination.currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default BackupManagement;
