import React, { useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { swalError, swalToast } from '../../utils/swal';
import './ProfileChangePassword.css';

function resolveMinPasswordLength(minLength = 8) {
  return Number.isFinite(Number(minLength)) ? Math.max(8, Number(minLength)) : 8;
}

function getPasswordRuleChecks(password, minLength = 8) {
  const pwd = String(password || '');
  const min = resolveMinPasswordLength(minLength);

  return {
    minLength: pwd.length >= min,
    uppercase: /[A-Z]/.test(pwd),
    symbol: /[^A-Za-z0-9]/.test(pwd),
  };
}

function passwordStrengthError(password, minLength = 8) {
  const pwd = String(password || '');
  const min = resolveMinPasswordLength(minLength);
  const checks = getPasswordRuleChecks(pwd, min);

  if (!pwd) return 'New password is required.';
  if (!checks.minLength) return `Password must be at least ${min} characters.`;
  if (!checks.uppercase) return 'Password must include at least one uppercase letter.';
  if (!checks.symbol) return 'Password must include at least one symbol.';
  return '';
}

/**
 * Self-service password change for My Profile (any role except Admin).
 * Uses POST /password/change with current_password + confirmed new password.
 */
export default function ProfileChangePassword() {
  const { minPasswordLength, applyUser, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const minLen = resolveMinPasswordLength(minPasswordLength);
  const ruleChecks = getPasswordRuleChecks(password, minPasswordLength);
  const allRulesMet = ruleChecks.minLength && ruleChecks.uppercase && ruleChecks.symbol;
  const ruleClass = (met) =>
    met ? 'profile-change-pwd__rule profile-change-pwd__rule--met' : 'profile-change-pwd__rule';
  const ruleIcon = (met) => (met ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle');

  const resetFields = () => {
    setCurrentPassword('');
    setPassword('');
    setPasswordConfirmation('');
    setFieldError('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      setFieldError('Current password is required.');
      return;
    }
    const strengthErr = passwordStrengthError(password, minPasswordLength);
    if (strengthErr) {
      setFieldError(strengthErr);
      return;
    }
    if (password !== passwordConfirmation) {
      setFieldError('New password and confirmation do not match.');
      return;
    }

    setFieldError('');
    setSubmitting(true);
    try {
      const response = await api.post('/password/change', {
        current_password: currentPassword,
        password,
        password_confirmation: passwordConfirmation,
      });
      if (response.data?.user) {
        applyUser(response.data.user);
      } else {
        await refreshUser();
      }
      resetFields();
      swalToast('success', 'Password updated');
    } catch (error) {
      const data = error.response?.data;
      const msg =
        data?.errors?.current_password?.[0] ||
        data?.errors?.password?.[0] ||
        data?.message ||
        data?.error ||
        'Failed to change password';
      setFieldError(msg);
      await swalError('Could not update password', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="profile-change-pwd" aria-labelledby="profile-change-pwd-title">
      <div className="profile-change-pwd__panel">
        <div className="profile-change-pwd__intro">
          <span className="profile-change-pwd__icon" aria-hidden>
            <i className="fa-solid fa-key" />
          </span>
          <div>
            <h3 id="profile-change-pwd-title" className="profile-change-pwd__title">
              Change password
            </h3>
            <p className="profile-change-pwd__lead">Update anytime. New password must meet the rules on the right.</p>
          </div>
        </div>

        <form id="profile-change-pwd-form" onSubmit={handleSubmit} className="profile-change-pwd__form" noValidate>
          <label htmlFor="profile-pwd-current">Current password</label>
          <div className="profile-change-pwd__wrap">
            <input
              id="profile-pwd-current"
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                if (fieldError) setFieldError('');
              }}
              autoComplete="current-password"
              required
              disabled={submitting}
            />
            <button
              type="button"
              className="profile-change-pwd__eye"
              onClick={() => setShowCurrent((v) => !v)}
              aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
            >
              <i className={showCurrent ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'} aria-hidden />
            </button>
          </div>

          <label htmlFor="profile-pwd-new">New password</label>
          <div className="profile-change-pwd__wrap">
            <input
              id="profile-pwd-new"
              type={showNew ? 'text' : 'password'}
              className={fieldError && !allRulesMet ? 'input-error' : undefined}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldError) setFieldError('');
              }}
              autoComplete="new-password"
              required
              disabled={submitting}
              aria-describedby="profile-pwd-rules"
            />
            <button
              type="button"
              className="profile-change-pwd__eye"
              onClick={() => setShowNew((v) => !v)}
              aria-label={showNew ? 'Hide new password' : 'Show new password'}
            >
              <i className={showNew ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'} aria-hidden />
            </button>
          </div>

          <label htmlFor="profile-pwd-confirm">Confirm new password</label>
          <div className="profile-change-pwd__wrap">
            <input
              id="profile-pwd-confirm"
              type={showConfirm ? 'text' : 'password'}
              className={
                fieldError === 'New password and confirmation do not match.' ? 'input-error' : undefined
              }
              value={passwordConfirmation}
              onChange={(e) => {
                setPasswordConfirmation(e.target.value);
                if (fieldError === 'New password and confirmation do not match.') {
                  setFieldError('');
                }
              }}
              autoComplete="new-password"
              required
              disabled={submitting}
            />
            <button
              type="button"
              className="profile-change-pwd__eye"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
            >
              <i className={showConfirm ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'} aria-hidden />
            </button>
          </div>
        </form>

        <aside className="profile-change-pwd__aside" aria-label="Password requirements">
          <p className="profile-change-pwd__aside-title">Requirements</p>
          <ul id="profile-pwd-rules" className="profile-change-pwd__rules" aria-live="polite">
            <li className={ruleClass(ruleChecks.minLength)} aria-checked={ruleChecks.minLength}>
              <i className={ruleIcon(ruleChecks.minLength)} aria-hidden />
              <span>At least {minLen} characters</span>
            </li>
            <li className={ruleClass(ruleChecks.uppercase)} aria-checked={ruleChecks.uppercase}>
              <i className={ruleIcon(ruleChecks.uppercase)} aria-hidden />
              <span>At least 1 uppercase letter (A–Z)</span>
            </li>
            <li className={ruleClass(ruleChecks.symbol)} aria-checked={ruleChecks.symbol}>
              <i className={ruleIcon(ruleChecks.symbol)} aria-hidden />
              <span>At least 1 symbol (e.g. ! @ # $)</span>
            </li>
          </ul>
        </aside>

        {fieldError ? (
          <p className="profile-change-pwd__error" role="alert">
            {fieldError}
          </p>
        ) : null}

        <div className="profile-change-pwd__actions">
          <button
            type="button"
            className="profile-change-pwd__secondary"
            onClick={resetFields}
            disabled={submitting}
          >
            Clear
          </button>
          <button
            type="submit"
            form="profile-change-pwd-form"
            className="profile-change-pwd__primary"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </div>
    </section>
  );
}
