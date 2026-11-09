import React, { useRef, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import useDialogFocus from '../hooks/useDialogFocus';
import { swalError, swalToast } from '../utils/swal';
import './ForcePasswordChangeModal.css';

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
 * Blocks portal use until accounts with a temporary password set a strong one.
 * Strength rules (length / uppercase / symbol) apply here and on self-service
 * /password/change — not when an admin sets a temporary password in User Management.
 */
const ForcePasswordChangeModal = () => {
  const { user, refreshUser, applyUser, logout, minPasswordLength } = useAuth();
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef(null);
  const passwordInputRef = useRef(null);
  const dialogOpen = Boolean(user?.must_change_password);
  useDialogFocus(dialogOpen, dialogRef, passwordInputRef);

  if (!dialogOpen) {
    return null;
  }

  const minLen = resolveMinPasswordLength(minPasswordLength);
  const ruleChecks = getPasswordRuleChecks(password, minPasswordLength);
  const allRulesMet = ruleChecks.minLength && ruleChecks.uppercase && ruleChecks.symbol;

  const handleSubmit = async (e) => {
    e.preventDefault();
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
      const response = await api.post(
        '/password/change',
        {
          password,
          password_confirmation: passwordConfirmation,
        },
        { skipLoading: true }
      );
      if (response.data?.user) {
        applyUser(response.data.user);
      } else {
        await refreshUser();
      }
      swalToast('success', 'Password updated');
    } catch (error) {
      const data = error.response?.data;
      const msg =
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

  const handleLogout = async () => {
    await logout();
  };

  const handleClearPassword = () => {
    setPassword('');
    setPasswordConfirmation('');
    setFieldError('');
    passwordInputRef.current?.focus();
  };

  const ruleClass = (met) => (met ? 'force-pwd-rules__item force-pwd-rules__item--met' : 'force-pwd-rules__item');

  return (
    <div className="force-pwd-overlay">
      <div
        ref={dialogRef}
        className="force-pwd-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="force-pwd-title"
        aria-describedby="force-pwd-rules force-pwd-error"
        tabIndex="-1"
      >
        <div className="force-pwd-header">
          <h2 id="force-pwd-title">Change your password</h2>
        </div>
        <form onSubmit={handleSubmit} className="force-pwd-form" noValidate>
          <label htmlFor="force-pwd-new">New password</label>
          <div className="force-pwd-input-wrap">
            <input
              ref={passwordInputRef}
              id="force-pwd-new"
              type={showPassword ? 'text' : 'password'}
              className={fieldError && !allRulesMet ? 'input-error' : undefined}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldError) setFieldError('');
              }}
              autoComplete="new-password"
              required
              aria-invalid={Boolean(fieldError && !allRulesMet)}
              aria-describedby="force-pwd-rules force-pwd-error"
            />
            <button
              type="button"
              className="force-pwd-eye"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              <i className={showPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'} aria-hidden />
            </button>
          </div>

          <ul id="force-pwd-rules" className="force-pwd-rules" aria-live="polite">
            <li className={ruleClass(ruleChecks.minLength)}>
              At least {minLen} characters
            </li>
            <li className={ruleClass(ruleChecks.uppercase)}>
              At least 1 uppercase letter (A–Z)
            </li>
            <li className={ruleClass(ruleChecks.symbol)}>
              At least 1 symbol (e.g. ! @ # $)
            </li>
          </ul>

          <label htmlFor="force-pwd-confirm">Confirm new password</label>
          <div className="force-pwd-input-wrap">
            <input
              id="force-pwd-confirm"
              type={showPasswordConfirm ? 'text' : 'password'}
              className={fieldError === 'New password and confirmation do not match.' ? 'input-error' : undefined}
              value={passwordConfirmation}
              onChange={(e) => {
                setPasswordConfirmation(e.target.value);
                if (fieldError === 'New password and confirmation do not match.') {
                  setFieldError('');
                }
              }}
              autoComplete="new-password"
              required
              aria-invalid={fieldError === 'New password and confirmation do not match.'}
              aria-describedby="force-pwd-error"
            />
            <button
              type="button"
              className="force-pwd-eye"
              onClick={() => setShowPasswordConfirm((v) => !v)}
              aria-label={showPasswordConfirm ? 'Hide confirm password' : 'Show confirm password'}
              title={showPasswordConfirm ? 'Hide password' : 'Show password'}
            >
              <i
                className={showPasswordConfirm ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'}
                aria-hidden
              />
            </button>
          </div>

          <p
            id="force-pwd-error"
            className={fieldError ? 'force-pwd-error' : 'sr-only'}
            role={fieldError ? 'alert' : undefined}
          >
            {fieldError}
          </p>

          <div className="force-pwd-actions">
            <button
              type="button"
              className="force-pwd-secondary"
              onClick={handleClearPassword}
              disabled={submitting}
            >
              Clear
            </button>
            <button type="button" className="force-pwd-secondary" onClick={handleLogout} disabled={submitting}>
              Log out
            </button>
            <button type="submit" className="force-pwd-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save new password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ForcePasswordChangeModal;
