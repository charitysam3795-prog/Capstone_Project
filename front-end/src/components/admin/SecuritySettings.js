import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { swalToast, swalError } from '../../utils/swal';
import useRecoverableFormDraft from '../../hooks/useRecoverableFormDraft';
import { recoverableDraftKey } from '../../utils/networkRecoverability';
import './SecuritySettings.css';

const emptyForm = {
  min_password_length: 8,
  password_expiry_days: 90,
  session_timeout_minutes: 30,
  student_session_timeout_minutes: 30,
  session_warning_minutes_left: 5,
  lockout_attempts: 10,
  lockout_duration_minutes: 15,
};

/**
 * @param {{ showBackLink?: boolean }} props
 */
const SecuritySettings = ({ showBackLink = false }) => {
  const navigate = useNavigate();
  const { refreshSessionPolicy } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsHydrated, setSettingsHydrated] = useState(false);

  const securityDraftKey = recoverableDraftKey(['security-settings']);
  const { clearDraft: clearSecurityDraft } = useRecoverableFormDraft({
    draftKey: securityDraftKey,
    formData: form,
    setFormData: setForm,
    enabled: settingsHydrated && !loading,
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/settings/security');
      const n = (v, fallback) => {
        const x = Number(v);
        return Number.isFinite(x) ? x : fallback;
      };
      setForm({
        min_password_length: n(data.min_password_length, 8),
        password_expiry_days: n(data.password_expiry_days, 90),
        session_timeout_minutes: n(data.session_timeout_minutes, 30),
        student_session_timeout_minutes: n(
          data.student_session_timeout_minutes,
          n(data.session_timeout_minutes, 30)
        ),
        session_warning_minutes_left: n(data.session_warning_minutes_left, 5),
        lockout_attempts: n(data.lockout_attempts, 10),
        lockout_duration_minutes: n(data.lockout_duration_minutes, 15),
      });
      setSettingsHydrated(true);
    } catch (err) {
      swalError(
        'Load failed',
        err.response?.data?.message ||
          (!err.response
            ? 'Network interrupted — reconnect to load settings. Any unsaved edits on this page are kept locally.'
            : 'Could not load security settings.'),
      );
      setSettingsHydrated(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onChange = (key) => (e) => {
    const v = e.target.value === '' ? '' : parseInt(e.target.value, 10);
    setForm((prev) => ({ ...prev, [key]: Number.isNaN(v) ? '' : v }));
  };

  const onSave = async (e) => {
    e.preventDefault();
    const payload = {
      min_password_length: Number(form.min_password_length),
      password_expiry_days: Number(form.password_expiry_days),
      session_timeout_minutes: Number(form.session_timeout_minutes),
      student_session_timeout_minutes: Number(form.student_session_timeout_minutes),
      session_warning_minutes_left: Number(form.session_warning_minutes_left),
      lockout_attempts: Number(form.lockout_attempts),
      lockout_duration_minutes: Number(form.lockout_duration_minutes),
    };
    if (Object.values(payload).some((n) => Number.isNaN(n))) {
      swalError('Invalid values', 'Please enter valid numbers in all fields.');
      return;
    }
    try {
      setSaving(true);
      await api.put('/settings/security', payload);
      clearSecurityDraft();
      swalToast('success', 'Security settings saved.');
      await load();
      await refreshSessionPolicy();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        (err.response?.data?.errors && JSON.stringify(err.response.data.errors)) ||
        (!err.response
          ? 'Network interrupted — your settings inputs were kept. Reconnect and save again.'
          : 'Save failed.');
      swalError('Save failed', msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="security-settings security-settings--loading">Loading security settings…</div>;
  }

  return (
    <div className="security-settings">
      {showBackLink && (
        <button type="button" className="security-settings__back" onClick={() => navigate('/admin')}>
          ← Admin panel
        </button>
      )}

      <div className="security-settings__card">
        <header className="security-settings__header">
          <h2>Security Settings</h2>
          <p className="security-settings__subtitle">
            Save the password, expiry, timeout, and lockout rules used by the system.
          </p>
        </header>

        <form onSubmit={onSave} className="security-settings__form">
          <div className="security-settings__row">
            <div className="security-settings__label-block">
              <label htmlFor="sec-min-pw-len">Minimum password length</label>
              <p className="security-settings__hint">Default 8. New passwords must be at least this many characters (6 to 32).</p>
            </div>
            <input
              id="sec-min-pw-len"
              type="number"
              min={6}
              max={32}
              className="security-settings__input"
              value={form.min_password_length}
              onChange={onChange('min_password_length')}
            />
          </div>

          <div className="security-settings__row">
            <div className="security-settings__label-block">
              <label htmlFor="sec-pw-expiry">Password expiry (days)</label>
              <p className="security-settings__hint">Default 90. Set to 0 to disable password expiry entirely.</p>
            </div>
            <input
              id="sec-pw-expiry"
              type="number"
              min={0}
              max={3650}
              className="security-settings__input"
              value={form.password_expiry_days}
              onChange={onChange('password_expiry_days')}
            />
          </div>

          <div className="security-settings__row">
            <div className="security-settings__label-block">
              <label htmlFor="sec-session">Staff session idle timeout (minutes)</label>
              <p className="security-settings__hint">
                Forced logout after this many minutes with <strong>no activity</strong> (typing, clicks, API calls).
                This is not the academic semester end — it only measures idle time in the portal.
                Example for “about one semester”: 181440 minutes (~18 weeks / 126 days). Default 30.
              </p>
            </div>
            <input
              id="sec-session"
              type="number"
              min={1}
              max={200000}
              className="security-settings__input"
              value={form.session_timeout_minutes}
              onChange={onChange('session_timeout_minutes')}
            />
          </div>

          <div className="security-settings__row">
            <div className="security-settings__label-block">
              <label htmlFor="sec-student-session">Student session idle timeout (minutes)</label>
              <p className="security-settings__hint">
                Same idle rule for Student accounts only. Use a large value (e.g. 181440) if students should stay
                signed in for a full semester unless idle that long. Default 30.
              </p>
            </div>
            <input
              id="sec-student-session"
              type="number"
              min={1}
              max={200000}
              className="security-settings__input"
              value={form.student_session_timeout_minutes}
              onChange={onChange('student_session_timeout_minutes')}
            />
          </div>

          <div className="security-settings__row">
            <div className="security-settings__label-block">
              <label htmlFor="sec-session-warn-left">Show idle warning after (minutes)</label>
              <p className="security-settings__hint">
                Example: timeout 30 and this set to 5 → warning appears after 5 minutes idle, with about 25 minutes
                left until logout. Keep this lower than the idle timeout.
              </p>
            </div>
            <input
              id="sec-session-warn-left"
              type="number"
              min={1}
              max={200000}
              className="security-settings__input"
              value={form.session_warning_minutes_left}
              onChange={onChange('session_warning_minutes_left')}
            />
          </div>

          <div className="security-settings__row">
            <div className="security-settings__label-block">
              <label htmlFor="sec-lockout-attempts">Lockout after failed attempts</label>
              <p className="security-settings__hint">Default 10. Accounts lock only after this many consecutive wrong passwords.</p>
            </div>
            <input
              id="sec-lockout-attempts"
              type="number"
              min={1}
              max={50}
              className="security-settings__input"
              value={form.lockout_attempts}
              onChange={onChange('lockout_attempts')}
            />
          </div>

          <div className="security-settings__row">
            <div className="security-settings__label-block">
              <label htmlFor="sec-lockout-mins">Lockout duration (minutes)</label>
              <p className="security-settings__hint">Default 15. Locked accounts unlock automatically after this duration.</p>
            </div>
            <input
              id="sec-lockout-mins"
              type="number"
              min={1}
              max={1440}
              className="security-settings__input"
              value={form.lockout_duration_minutes}
              onChange={onChange('lockout_duration_minutes')}
            />
          </div>

          <div className="security-settings__actions">
            <button type="button" className="security-settings__btn security-settings__btn--secondary" onClick={load}>
              Reset
            </button>
            <button type="submit" className="security-settings__btn security-settings__btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SecuritySettings;
