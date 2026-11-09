import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import './Login.css';

const publicUrl = process.env.PUBLIC_URL || '';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get('token') || '', [params]);
  const [status, setStatus] = useState(token ? 'loading' : 'missing');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const res = await api.post('/email/verify', { token }, { skipLoading: true });
        if (cancelled) return;
        setStatus('ok');
        setMessage(res.data?.message || 'Email verified.');
      } catch (err) {
        if (cancelled) return;
        const data = err.response?.data;
        setStatus('error');
        setMessage(
          data?.errors?.token?.[0] || data?.message || 'This verification link is invalid or expired.'
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

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
                <span className="login-page__eyebrow">Secure access</span>
                <h1 className="login-page__title">Email verification</h1>
                <p className="login-page__lead">
                  {status === 'loading' && 'Confirming your email…'}
                  {status === 'ok' && (message || 'Your email is verified. You can sign in.')}
                  {status === 'missing' && 'Sign-in does not send an email. Use Forgot password on the login page if you need a reset link.'}
                  {status === 'error' && (message || 'This verification link is invalid or expired. You can still sign in. Use Forgot password if you need a reset link.')}
                </p>
              </div>

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
