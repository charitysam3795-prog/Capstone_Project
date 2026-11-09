import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { swalError, swalSuccess } from '../utils/swal';
import './Login.css';

const publicUrl = process.env.PUBLIC_URL || '';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get('token') || '', [params]);
  const emailFromLink = useMemo(() => params.get('email') || '', [params]);

  const [email, setEmail] = useState(emailFromLink);
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      await swalError('Invalid link', 'This reset link is missing a token. Request a new one.');
      return;
    }
    if (!email.trim()) {
      await swalError('Email required', 'Enter the email from your reset link.');
      return;
    }
    if (password !== passwordConfirmation) {
      await swalError('Passwords do not match', 'Re-enter the same password in both fields.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post(
        '/password/reset',
        {
          token,
          email: email.trim(),
          password,
          password_confirmation: passwordConfirmation,
        },
        { skipLoading: true }
      );
      await swalSuccess('Password updated', res.data?.message || 'You can sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      const data = err.response?.data;
      const msg =
        data?.errors?.token?.[0] ||
        data?.errors?.email?.[0] ||
        data?.errors?.password?.[0] ||
        data?.message ||
        'Could not reset password.';
      await swalError('Reset failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div
        className="login-page__bg"
        aria-hidden
        style={{ backgroundImage: `url(${publicUrl}/assets/login_campus_bg.png)` }}
      />

      <div className="login-page__frame">
        <header className="login-page__masthead">
          <div className="login-page__masthead-inner">
            <div className="login-page__identity">
              <img
                src={`${publicUrl}/assets/cit_cagayan_de_oro_college_seal.png`}
                alt="College of Information Technology — Cagayan De Oro College"
                className="login-page__seal"
              />
              <div className="login-page__identity-text">
                <span className="login-page__college-name">Cagayan De Oro College</span>
                <span className="login-page__address">
                  College of Information Technology · PHINMA Education Network
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="login-page__split">
          <aside className="login-page__visual">
            <div className="login-page__logo-frame">
              <img
                src={`${publicUrl}/assets/student_evaluation_system_logo.png`}
                alt="Student Evaluation System"
                className="login-page__hero-logo"
              />
            </div>
          </aside>

          <main id="main-content" className="login-page__main" tabIndex="-1">
            <div className="login-page__card">
              <div className="login-page__card-head">
                <span className="login-page__eyebrow">Account recovery</span>
                <h1 className="login-page__title">Reset password</h1>
                <p className="login-page__lead">Choose a new password for your account.</p>
              </div>

              {!token ? (
                <p className="login-page__lead" style={{ color: '#b91c1c' }}>
                  Invalid reset link.{' '}
                  <Link to="/forgot-password" className="login-page__home-link">
                    Request a new one
                  </Link>
                </p>
              ) : (
                <form className="login-page__form" onSubmit={onSubmit} noValidate>
                  <div className="login-page__field">
                    <label htmlFor="reset-email">Email</label>
                    <div className="login-page__input-wrap">
                      <input
                        id="reset-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="username"
                        disabled={loading}
                        required
                      />
                    </div>
                  </div>

                  <div className="login-page__field">
                    <label htmlFor="reset-password">New password</label>
                    <div className="login-page__input-wrap">
                      <input
                        id="reset-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        disabled={loading}
                        required
                      />
                      <button
                        type="button"
                        className="login-page__eye"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        disabled={loading}
                      >
                        <i
                          className={showPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'}
                          aria-hidden
                        />
                      </button>
                    </div>
                  </div>

                  <div className="login-page__field">
                    <label htmlFor="reset-password-confirm">Confirm password</label>
                    <div className="login-page__input-wrap">
                      <input
                        id="reset-password-confirm"
                        type={showPasswordConfirm ? 'text' : 'password'}
                        value={passwordConfirmation}
                        onChange={(e) => setPasswordConfirmation(e.target.value)}
                        autoComplete="new-password"
                        disabled={loading}
                        required
                      />
                      <button
                        type="button"
                        className="login-page__eye"
                        onClick={() => setShowPasswordConfirm((v) => !v)}
                        aria-label={showPasswordConfirm ? 'Hide confirm password' : 'Show confirm password'}
                        disabled={loading}
                      >
                        <i
                          className={
                            showPasswordConfirm ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'
                          }
                          aria-hidden
                        />
                      </button>
                    </div>
                  </div>

                  <button type="submit" className="login-page__submit" disabled={loading} aria-busy={loading}>
                    {loading ? (
                      <>
                        <span className="login-page__submit-spinner" aria-hidden />
                        <span>Saving…</span>
                      </>
                    ) : (
                      <span>Update password</span>
                    )}
                  </button>
                </form>
              )}

              <div className="login-page__card-footer">
                <Link to="/login" className="login-page__home-link">
                  Back to sign in
                </Link>
              </div>
            </div>
          </main>
        </div>

        <footer className="login-page__footer">All rights reserved @2026</footer>
      </div>
    </div>
  );
}
