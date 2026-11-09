import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { swalError, swalSuccess } from '../utils/swal';
import './Login.css';

const publicUrl = process.env.PUBLIC_URL || '';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    const login = email.trim();
    if (!login) {
      await swalError('Missing login', 'Enter your email or Student ID.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/password/forgot', { email: login }, { skipLoading: true });
      setSent(true);
      await swalSuccess('Check your email', res.data?.message || 'If that account exists, a reset link was sent.');
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Could not send reset email. Try again later.';
      await swalError('Could not send', msg);
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
                <h1 className="login-page__title">Forgot password</h1>
                <p className="login-page__lead">
                  Enter the email on your staff account, or a Student ID that has a contact email. A reset
                  link will be sent when mail is available.
                </p>
              </div>

              {sent ? (
                <p className="login-page__lead" style={{ marginTop: '0.5rem' }}>
                  If that account can receive mail, check your inbox (and spam).
                </p>
              ) : (
                <form className="login-page__form" onSubmit={onSubmit} noValidate>
                  <div className="login-page__field">
                    <label htmlFor="forgot-email">Email or Student ID</label>
                    <div className="login-page__input-wrap">
                      <input
                        id="forgot-email"
                        type="text"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@school.edu or Student ID"
                        autoComplete="username"
                        disabled={loading}
                        required
                      />
                      <span className="login-page__input-icon" aria-hidden>
                        <i className="fa-regular fa-envelope" />
                      </span>
                    </div>
                  </div>

                  <button type="submit" className="login-page__submit" disabled={loading} aria-busy={loading}>
                    {loading ? (
                      <>
                        <span className="login-page__submit-spinner" aria-hidden />
                        <span>Sending…</span>
                      </>
                    ) : (
                      <span>Send reset link</span>
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
