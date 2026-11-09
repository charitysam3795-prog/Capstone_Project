import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { swalError, swalInfo } from '../utils/swal';
import './Login.css';

const publicUrl = process.env.PUBLIC_URL || '';
const PORTAL_ACTIVE_TAB_STORAGE_KEYS = [
  'facultyPortalActiveTab',
  'deanPortalActiveTab',
  'adminPortalActiveTab',
  'adminLookupSubPanel',
  'studentPortalActiveTab',
  'portalSidebarCollapsed_program_head_activeTab',
  'portalSidebarCollapsed_secretary_activeTab',
];

function clearStoredPortalTabs() {
  try {
    PORTAL_ACTIVE_TAB_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore storage errors; login routing should still work.
  }
}

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [captchaA, setCaptchaA] = useState(0);
  const [captchaB, setCaptchaB] = useState(0);
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaStatus, setCaptchaStatus] = useState('idle');
  const [deviceOtpStep, setDeviceOtpStep] = useState(false);
  const [challengeToken, setChallengeToken] = useState('');
  const [emailHint, setEmailHint] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const {
    login,
    verifyDeviceOtp,
    resendDeviceOtp,
    user,
    loading: authLoading,
    isAdmin,
    isDean,
    isFaculty,
    isProgramHead,
    isSecretary,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const slideFromLanding = Boolean(location.state?.fromLanding);

  const refreshCaptcha = useCallback(() => {
    setCaptchaA(Math.floor(Math.random() * 90) + 10);
    setCaptchaB(Math.floor(Math.random() * 9) + 1);
    setCaptchaInput('');
    setCaptchaStatus('idle');
  }, []);

  const captchaExpected = captchaA + captchaB;

  const evaluateCaptchaDigits = useCallback((digits, a, b) => {
    const expected = a + b;
    const needLen = String(expected).length;
    if (!digits) return 'idle';
    const n = parseInt(digits, 10);
    if (!Number.isFinite(n)) return 'idle';
    if (digits.length < needLen) return 'idle';
    return n === expected ? 'correct' : 'incorrect';
  }, []);

  const handleCaptchaChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    setCaptchaInput(digits);
    setCaptchaStatus(evaluateCaptchaDigits(digits, captchaA, captchaB));
  };

  useEffect(() => {
    refreshCaptcha();
  }, [refreshCaptcha]);

  useEffect(() => {
    if (authLoading || !user) return;

    if (isAdmin || user.role === 'Admin') {
      navigate('/admin', { replace: true });
    } else if (isDean) {
      navigate('/dean', { replace: true });
    } else if (isProgramHead) {
      navigate('/program-head', { replace: true });
    } else if (isSecretary) {
      navigate('/secretary', { replace: true });
    } else if (isFaculty) {
      navigate('/evaluator', { replace: true });
    } else {
      navigate('/student', { replace: true });
    }
  }, [authLoading, user, isAdmin, isDean, isFaculty, isProgramHead, isSecretary, navigate]);

  const navigateAfterLogin = (resultUser) => {
    clearStoredPortalTabs();
    const userRole = resultUser?.role;
    const userIsAdmin = resultUser?.is_admin || false;

    if (userIsAdmin || userRole === 'Admin') {
      navigate('/admin');
    } else if (userRole === 'Dean') {
      navigate('/dean');
    } else if (userRole === 'Program Head') {
      navigate('/program-head');
    } else if (userRole === 'Secretary') {
      navigate('/secretary');
    } else if (userRole === 'Evaluator' || userRole === 'Adviser') {
      navigate('/evaluator');
    } else {
      navigate('/student');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Guard before setState — React state updates are async, so double-clicks can fire twice.
    if (submittingRef.current || loading) {
      return;
    }

    if (deviceOtpStep) {
      const code = String(otpCode || '').replace(/\D/g, '');
      if (code.length !== 6) {
        await swalError('Code required', 'Enter the 6-digit code from your email.');
        return;
      }
      submittingRef.current = true;
      setLoading(true);
      try {
        const result = await verifyDeviceOtp(challengeToken, code);
        if (result.success) {
          setDeviceOtpStep(false);
          setOtpCode('');
          navigateAfterLogin(result.data?.user);
        } else {
          await swalError('Verification failed', result.error || 'Incorrect or expired code.');
        }
      } finally {
        submittingRef.current = false;
        setLoading(false);
      }
      return;
    }

    const expected = captchaExpected;
    const entered = parseInt(String(captchaInput).trim(), 10);
    if (!Number.isFinite(entered) || entered !== expected) {
      setCaptchaStatus('incorrect');
      await swalError('Verification failed', 'Please solve the math problem correctly.');
      return;
    }

    setCaptchaStatus('correct');
    submittingRef.current = true;
    setLoading(true);

    try {
      const result = await login(email, password);

      if (result.requiresDeviceOtp) {
        setDeviceOtpStep(true);
        setChallengeToken(result.challengeToken || '');
        setEmailHint(result.emailHint || '');
        setOtpCode('');
        return;
      }

      if (result.success) {
        navigateAfterLogin(result.data?.user);
      } else {
        const msg = result.error || 'Login failed. Please check your credentials.';
        await swalError('Login failed', msg);
        refreshCaptcha();
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (submittingRef.current || loading || !challengeToken) return;
    submittingRef.current = true;
    setLoading(true);
    try {
      const result = await resendDeviceOtp(challengeToken);
      if (result.success) {
        setChallengeToken(result.challengeToken || challengeToken);
        setEmailHint(result.emailHint || emailHint);
        setOtpCode('');
        await swalInfo('Code sent', result.message || 'A new code was sent to your email.');
      } else {
        await swalError('Could not resend', result.error || 'Try signing in again.');
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleBackFromOtp = () => {
    setDeviceOtpStep(false);
    setChallengeToken('');
    setEmailHint('');
    setOtpCode('');
    refreshCaptcha();
  };

  return (
    <div className={['login-page', slideFromLanding && 'login-page--from-landing'].filter(Boolean).join(' ')}>
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
                src={`${publicUrl}/assets/student_evaluation_system_logo.png`}
                alt="Student Evaluation System"
                className="login-page__seal"
              />
              <div className="login-page__identity-text">
                <span className="login-page__college-name">Student Evaluation System</span>
                <span className="login-page__address">
                  Academic Evaluation Portal · PHINMA Education
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
                <h1 className="login-page__title">
                  {deviceOtpStep ? 'Verify this device' : 'Log in to continue'}
                </h1>
                {deviceOtpStep ? (
                  <p className="login-page__lead">
                    {`We emailed a 6-digit code to ${emailHint || 'your email'}. Enter it below to trust this device.`}
                  </p>
                ) : null}
              </div>

              <form className="login-page__form" onSubmit={handleSubmit} noValidate>
                {deviceOtpStep ? (
                  <>
                    <div className="login-page__field">
                      <label htmlFor="login-page-otp">
                        <span className="login-page__req" aria-hidden>
                          *
                        </span>{' '}
                        Verification code
                      </label>
                      <div className="login-page__input-wrap">
                        <input
                          id="login-page-otp"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          value={otpCode}
                          onChange={(e) =>
                            setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                          }
                          placeholder="6-digit code"
                          required
                          disabled={loading}
                          maxLength={6}
                        />
                        <span className="login-page__input-icon" aria-hidden>
                          <i className="fa-regular fa-envelope" />
                        </span>
                      </div>
                    </div>

                    <button type="submit" disabled={loading} className="login-page__submit" aria-busy={loading}>
                      {loading ? (
                        <>
                          <span className="login-page__submit-spinner" aria-hidden />
                          <span>Verifying…</span>
                        </>
                      ) : (
                        <>
                          <span>Verify and continue</span>
                          <i className="fa-solid fa-arrow-right-long" aria-hidden />
                        </>
                      )}
                    </button>

                    <div className="login-page__otp-actions">
                      <button
                        type="button"
                        className="login-page__forgot-btn"
                        onClick={() => void handleResendOtp()}
                        disabled={loading}
                      >
                        Resend code
                      </button>
                      <button
                        type="button"
                        className="login-page__home-link"
                        onClick={handleBackFromOtp}
                        disabled={loading}
                      >
                        Back to sign in
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                <div className="login-page__field">
                  <label htmlFor="login-page-user">
                    <span className="login-page__req" aria-hidden>
                      *
                    </span>{' '}
                    Username
                  </label>
                  <div className="login-page__input-wrap">
                    <input
                      id="login-page-user"
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Your Email"
                      required
                      autoComplete="username"
                      disabled={loading}
                    />
                    <span className="login-page__input-icon" aria-hidden>
                      <i className="fa-regular fa-user" />
                    </span>
                  </div>
                </div>

                <div className="login-page__field">
                  <label htmlFor="login-page-pass">
                    <span className="login-page__req" aria-hidden>
                      *
                    </span>{' '}
                    Password
                  </label>
                  <div className="login-page__input-wrap">
                    <input
                      id="login-page-pass"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                      required
                      autoComplete="current-password"
                      disabled={loading}
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

                <fieldset className="login-page__captcha-field">
                  <legend className="login-page__captcha-legend">Verification</legend>
                  <div className="login-page__captcha-row">
                    <span className="login-page__cap-box">{captchaA}</span>
                    <span className="login-page__cap-op">+</span>
                    <span className="login-page__cap-box">{captchaB}</span>
                    <span className="login-page__cap-op">=</span>
                    <div className="login-page__captcha-answer">
                      <input
                        type="text"
                        inputMode="numeric"
                        className={[
                          'login-page__cap-input',
                          captchaStatus === 'correct' && 'login-page__cap-input--correct',
                          captchaStatus === 'incorrect' && 'login-page__cap-input--incorrect',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        value={captchaInput}
                        onChange={handleCaptchaChange}
                        maxLength={4}
                        disabled={loading}
                        aria-label={`What is ${captchaA} plus ${captchaB}?`}
                        aria-invalid={captchaStatus === 'incorrect'}
                        aria-describedby="login-captcha-status"
                      />
                      <button
                        type="button"
                        className="login-page__cap-refresh"
                        onClick={refreshCaptcha}
                        title="New question"
                        aria-label="Refresh verification question"
                        disabled={loading}
                      >
                        <i className="fa-solid fa-rotate-right" aria-hidden />
                      </button>
                    </div>
                  </div>
                  <span
                    id="login-captcha-status"
                    className={`login-page__captcha-status login-page__captcha-status--${captchaStatus || 'pending'}`}
                    role="status"
                    aria-live="polite"
                  >
                    {captchaStatus === 'correct'
                      ? 'Verification answer is correct.'
                      : captchaStatus === 'incorrect'
                        ? 'Verification answer is incorrect.'
                        : `Enter the answer to ${captchaA} plus ${captchaB}.`}
                  </span>
                </fieldset>

                <button type="submit" disabled={loading} className="login-page__submit" aria-busy={loading}>
                  {loading ? (
                    <>
                      <span className="login-page__submit-spinner" aria-hidden />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    <>
                      <span>Continue</span>
                      <i className="fa-solid fa-arrow-right-long" aria-hidden />
                    </>
                  )}
                </button>
                  </>
                )}
              </form>

              {!deviceOtpStep ? (
              <div className="login-page__card-footer">
                <button
                  type="button"
                  className="login-page__forgot-btn"
                  onClick={() => navigate('/forgot-password')}
                >
                  Forgot password?
                </button>
                <Link to="/" className="login-page__home-link">
                  Back to home
                </Link>
              </div>
              ) : null}
            </div>
          </main>
        </div>

        <footer className="login-page__footer">
          All rights reserved @2026
        </footer>
      </div>
    </div>
  );
};

export default Login;
