import React, { useState, useEffect, useMemo, useCallback, Suspense, lazy } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import FacultyProfile from './FacultyProfile';
import EvaluatorDashboard from './EvaluatorDashboard';
import PortalSidebar from '../common/PortalSidebar';
import PortalSidebarUserFooter from '../common/PortalSidebarUserFooter';
import { GuideButton } from '../common/SystemGuide';
import { STUDENT_EVALUATION_TAB_PERMISSIONS } from '../../config/adminPanelTabs';
import { userDisplayName } from '../../utils/userDisplayName';
import './FacultyPanel.css';

const StudentEvaluationView = lazy(() => import('../common/StudentEvaluationView'));
const DeanAnalytics = lazy(() => import('../dean/DeanAnalytics'));
const AcademicManagement = lazy(() => import('../admin/AcademicManagement'));

const TabFallback = () => (
  <div className="app-route-fallback" role="status" aria-live="polite">
    <span className="app-route-fallback__spinner" aria-hidden />
    <span>Loading…</span>
  </div>
);

const FACULTY_ACTIVE_TAB_STORAGE_KEY = 'facultyPortalActiveTab';

function readStoredFacultyTab() {
  try {
    return window.localStorage.getItem(FACULTY_ACTIVE_TAB_STORAGE_KEY) || 'dashboard';
  } catch {
    return 'dashboard';
  }
}

/**
 * Adviser portal: dashboard, student evaluation, analytics, profile.
 * (Legacy Evaluator role was merged into Adviser.)
 */
const FacultyPanel = () => {
  const { user, logout, refreshUser, canAccessModule } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTabState] = useState(readStoredFacultyTab);
  const [facultyProfile, setFacultyProfile] = useState(null);

  const isEvaluatorOrAdviser = user?.role === 'Adviser' || user?.role === 'Evaluator';

  const showEvalModules = canAccessModule(STUDENT_EVALUATION_TAB_PERMISSIONS);
  const showCreditEval = canAccessModule([
    'Credit Evaluation',
    'credit_eval.view',
    'credit_eval.create',
    'credit_eval.approve',
  ]);

  const setActiveTab = useCallback((tab) => {
    setActiveTabState(tab);
    try {
      window.localStorage.setItem(FACULTY_ACTIVE_TAB_STORAGE_KEY, tab);
    } catch {
      // Ignore storage errors; tab navigation should still work.
    }
  }, []);

  const facultySidebarGroups = useMemo(() => {
    const overviewItems = [{ id: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-table-columns' }];
    if (showEvalModules) {
      overviewItems.push({ id: 'analytics', label: 'Analytics', icon: 'fa-solid fa-chart-column' });
    }

    const evaluationItems = [];
    if (showEvalModules) {
      evaluationItems.push(
        { id: 'academic-record', label: 'Student', icon: 'fa-solid fa-user-graduate' },
        { id: 'evaluated-students', label: 'Evaluated students', icon: 'fa-solid fa-clipboard-check' }
      );
    }
    if (showCreditEval) {
      evaluationItems.push({
        id: 'credit-evaluation',
        label: 'Subject crediting',
        icon: 'fa-solid fa-right-left',
      });
    }

    const accountItems = [{ id: 'profile', label: 'My Profile', icon: 'fa-solid fa-id-card' }];

    const groups = [];
    if (overviewItems.length) {
      groups.push({ id: 'overview', title: 'Overview', items: overviewItems });
    }
    if (evaluationItems.length) {
      groups.push({ id: 'evaluation', title: 'Evaluation', items: evaluationItems });
    }
    groups.push({ id: 'account', title: 'Account', items: accountItems });
    return groups;
  }, [showEvalModules, showCreditEval]);

  const fetchFacultyProfile = useCallback(async () => {
    try {
      const response = await api.get('/faculty/profile', { skipLoading: true, silent: true });
      setFacultyProfile(response.data);
    } catch (error) {
      console.error('Error fetching faculty profile:', error);
      setFacultyProfile(null);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else if (!isEvaluatorOrAdviser && !user.is_admin) {
      navigate('/');
    }
  }, [user, navigate, isEvaluatorOrAdviser]);

  useEffect(() => {
    if (isEvaluatorOrAdviser) {
      fetchFacultyProfile();
    }
  }, [user?.user_id, isEvaluatorOrAdviser, fetchFacultyProfile]);

  useEffect(() => {
    if (!isEvaluatorOrAdviser || !user) return undefined;
    let lastAt = 0;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastAt < 60_000) return;
      lastAt = now;
      refreshUser();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isEvaluatorOrAdviser, user?.user_id, refreshUser]);

  useEffect(() => {
    if (!isEvaluatorOrAdviser) return;
    if (
      !showEvalModules &&
      (activeTab === 'academic-record' || activeTab === 'evaluated-students')
    ) {
      setActiveTab('dashboard');
    }
    if (!showCreditEval && activeTab === 'credit-evaluation') {
      setActiveTab('dashboard');
    }
  }, [isEvaluatorOrAdviser, showEvalModules, showCreditEval, activeTab, setActiveTab]);

  useEffect(() => {
    if (!isEvaluatorOrAdviser) return;
    if (activeTab === 'curriculum') {
      setActiveTab('dashboard');
    }
  }, [isEvaluatorOrAdviser, activeTab, setActiveTab]);

  const handleLogout = async () => {
    try {
      window.localStorage.removeItem(FACULTY_ACTIVE_TAB_STORAGE_KEY);
    } catch {
      // Ignore storage errors; logout should still continue.
    }
    await logout();
    navigate('/login');
  };

  if (!user) {
    return null;
  }

  const portalTitle = 'Adviser Portal';

  return (
    <div className="faculty-panel portal-shell faculty-panel--evaluator-ui">
      <PortalSidebar
        variant="faculty"
        storageKey="portalSidebarCollapsed_faculty"
        brandTitle={portalTitle}
        groups={facultySidebarGroups}
        activeId={activeTab}
        onSelect={setActiveTab}
        footer={<PortalSidebarUserFooter onLogout={handleLogout} />}
      />

      <div className="portal-shell__main">
        <header className="faculty-header faculty-header--evaluator">
          <div className="faculty-header__brand">
            <span className="faculty-header__college">Cagayan de Oro College</span>
            <span className="faculty-header__sub">PHINMA Education</span>
          </div>
          <div className="faculty-header__actions">
            <span className="faculty-header__role-chip" title={user.email}>
              Adviser
            </span>
            <span className="faculty-header__welcome faculty-header__welcome--compact">
              {userDisplayName(user)}
            </span>
            <GuideButton />
          </div>
        </header>

        <main id="main-content" className="portal-shell__content faculty-content" tabIndex="-1">
          <h1 className="sr-only">{activeTab.replaceAll('-', ' ')}</h1>
          <Suspense fallback={<TabFallback />}>
          {activeTab === 'dashboard' && (
            <EvaluatorDashboard
              onNavigate={setActiveTab}
              showEvalModules={showEvalModules}
              portalLabel="Adviser"
            />
          )}
          {activeTab === 'academic-record' && showEvalModules && (
            <StudentEvaluationView listMode="need-evaluation" />
          )}
          {activeTab === 'evaluated-students' && showEvalModules && (
            <StudentEvaluationView listMode="already-evaluated" />
          )}
          {activeTab === 'analytics' && <DeanAnalytics showEvalModules={showEvalModules} />}
          {activeTab === 'credit-evaluation' && showCreditEval && <AcademicManagement />}
          {activeTab === 'profile' && (
            <FacultyProfile facultyProfile={facultyProfile} onUpdate={fetchFacultyProfile} />
          )}
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default FacultyPanel;
