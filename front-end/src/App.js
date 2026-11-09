import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import SessionIdleController from './components/SessionIdleController';
import GlobalRequestLoading from './components/common/GlobalRequestLoading';
import NetworkRecoverabilityBanner from './components/common/NetworkRecoverabilityBanner';
import ForcePasswordChangeModal from './components/ForcePasswordChangeModal';
import { SystemGuideProvider } from './components/common/SystemGuide';
import Landing from './components/Landing';
import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import VerifyEmail from './components/VerifyEmail';
import { installGlobalInputGuards } from './utils/inputValidation';
import './App.css';

installGlobalInputGuards();

const AdminPanel = lazy(() => import('./components/admin/AdminPanel'));
const SecuritySettings = lazy(() => import('./components/admin/SecuritySettings'));
const StudentPanel = lazy(() => import('./components/student/StudentPanel'));
const DeanPanel = lazy(() => import('./components/dean/DeanPanel'));
const DeanStudentRecords = lazy(() => import('./components/dean/DeanStudentRecords'));
const FacultyPanel = lazy(() => import('./components/faculty/FacultyPanel'));
const ProgramHeadPanel = lazy(() => import('./components/program_head/ProgramHeadPanel'));
const SecretaryPanel = lazy(() => import('./components/secretary/SecretaryPanel'));
const GuestPanel = lazy(() => import('./components/guest/GuestPanel'));

const RouteFallback = () => (
  <div className="app-route-fallback" role="status" aria-live="polite">
    <span className="app-route-fallback__spinner" aria-hidden />
    <span>Loading module…</span>
  </div>
);

const PrivateRoute = ({ children, requiredRole = null }) => {
  const { user, loading, isAdmin, isDean, isFaculty, isProgramHead, isSecretary } = useAuth();

  if (loading) {
    return (
      <div className="app-route-fallback" role="status" aria-live="polite">
        <span className="app-route-fallback__spinner" aria-hidden />
        <span>Loading…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  const canOpenAdminShell = isAdmin || isDean || isProgramHead || isSecretary;

  if (requiredRole === 'admin' && !canOpenAdminShell) {
    return <Navigate to={isFaculty ? '/evaluator' : '/student'} />;
  }

  if (requiredRole === 'dean' && !isDean) {
    return (
      <Navigate
        to={
          isAdmin ? '/admin' : isProgramHead ? '/program-head' : isSecretary ? '/secretary' : isFaculty ? '/evaluator' : '/student'
        }
      />
    );
  }

  if (requiredRole === 'evaluator' && !isFaculty) {
    return (
      <Navigate
        to={
          isAdmin ? '/admin' : isDean ? '/dean' : isProgramHead ? '/program-head' : isSecretary ? '/secretary' : '/student'
        }
      />
    );
  }

  if (requiredRole === 'program-head' && !isProgramHead) {
    return (
      <Navigate
        to={
          isAdmin ? '/admin' : isSecretary ? '/secretary' : isDean ? '/dean' : isFaculty ? '/evaluator' : '/student'
        }
      />
    );
  }

  if (requiredRole === 'secretary' && !isSecretary) {
    return (
      <Navigate
        to={
          isAdmin ? '/admin' : isProgramHead ? '/program-head' : isDean ? '/dean' : isFaculty ? '/evaluator' : '/student'
        }
      />
    );
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <SystemGuideProvider>
      <a className="app-skip-link" href="#main-content">
        Skip to main content
      </a>
      <NetworkRecoverabilityBanner />
      <GlobalRequestLoading />
      <SessionIdleController />
      <ForcePasswordChangeModal />
      <Router>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/reset_password"
              element={<Navigate to={`/reset-password${window.location.search}`} replace />}
            />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route
              path="/admin"
              element={
                <PrivateRoute requiredRole="admin">
                  <AdminPanel />
                </PrivateRoute>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <PrivateRoute requiredRole="admin">
                  <div style={{ padding: '1.25rem', maxWidth: 900, margin: '0 auto' }}>
                    <SecuritySettings showBackLink />
                  </div>
                </PrivateRoute>
              }
            />
            <Route
              path="/student"
              element={
                <PrivateRoute>
                  <StudentPanel />
                </PrivateRoute>
              }
            />
            <Route
              path="/dean"
              element={
                <PrivateRoute requiredRole="dean">
                  <DeanPanel />
                </PrivateRoute>
              }
            />
            <Route
              path="/dean/student-records/:studentIdNumber"
              element={
                <PrivateRoute requiredRole="dean">
                  <DeanStudentRecords />
                </PrivateRoute>
              }
            />
            <Route
              path="/evaluator"
              element={
                <PrivateRoute requiredRole="evaluator">
                  <FacultyPanel />
                </PrivateRoute>
              }
            />
            <Route
              path="/program-head"
              element={
                <PrivateRoute requiredRole="program-head">
                  <ProgramHeadPanel />
                </PrivateRoute>
              }
            />
            <Route
              path="/secretary"
              element={
                <PrivateRoute requiredRole="secretary">
                  <SecretaryPanel />
                </PrivateRoute>
              }
            />
            <Route path="/faculty" element={<Navigate to="/evaluator" replace />} />
            <Route path="/guest" element={<GuestPanel />} />
          </Routes>
        </Suspense>
      </Router>
      </SystemGuideProvider>
    </AuthProvider>
  );
}

export default App;
