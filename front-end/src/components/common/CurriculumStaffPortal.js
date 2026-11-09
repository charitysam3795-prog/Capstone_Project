import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense, lazy } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import PortalSidebar from './PortalSidebar';
import PortalSidebarUserFooter from './PortalSidebarUserFooter';
import { GuideButton } from './SystemGuide';
import { userDisplayName } from '../../utils/userDisplayName';
import EvaluatorDashboard from '../faculty/EvaluatorDashboard';
import DeanDashboard from '../dean/DeanDashboard';
import ProgramHeadProfile from '../program_head/ProgramHeadProfile';
import {
  ACADEMIC_MANAGEMENT_TAB_PERMISSIONS,
  CURRICULUM_HEADERS_TAB_PERMISSIONS,
  CURRICULUM_TAB_PERMISSIONS,
  ELECTIVE_SLOTS_TAB_PERMISSIONS,
  EVALUATION_REPORTS_TAB_PERMISSIONS,
  IMPORT_EXPORT_TAB_PERMISSIONS,
  LOOKUP_TAB_PERMISSIONS,
  STUDENT_EVALUATION_TAB_PERMISSIONS,
  STUDENT_MANAGEMENT_TAB_PERMISSIONS,
  USER_MANAGEMENT_TAB_PERMISSIONS,
} from '../../config/adminPanelTabs';
import {
  LOOKUP_DATA_SIDEBAR_PANELS,
  lookupSidebarChildId,
  parseLookupSidebarChildId,
} from '../../config/lookupDataSidebarPanels';
import '../faculty/FacultyPanel.css';
import '../program_head/ProgramHeadPanel.css';

/** Heavy tabs — load only when opened so portal shell paints quickly. */
const StudentEvaluationView = lazy(() => import('./StudentEvaluationView'));
const DeanAnalytics = lazy(() => import('../dean/DeanAnalytics'));
const LookupDataManagement = lazy(() => import('../admin/LookupDataManagement'));
const UserManagement = lazy(() => import('../admin/UserManagement'));
const StudentManagement = lazy(() => import('../admin/StudentManagement'));
const DataImportExport = lazy(() => import('../admin/DataImportExport'));
const CurriculumManagement = lazy(() => import('../admin/CurriculumManagement'));
const ElectiveSlotManagement = lazy(() => import('../admin/ElectiveSlotManagement'));
const AcademicManagement = lazy(() => import('../admin/AcademicManagement'));

const TabFallback = () => (
  <div className="app-route-fallback" role="status" aria-live="polite">
    <span className="app-route-fallback__spinner" aria-hidden />
    <span>Loading…</span>
  </div>
);

function readStoredStaffTab(key) {
  try {
    return window.localStorage.getItem(key) || 'dashboard';
  } catch {
    return 'dashboard';
  }
}

/**
 * @param {{ expectedRole: 'Program Head' | 'Secretary', sidebarVariant: string, collapsedStorageKey: string, sidebarBrand: string, workspaceTitle: string, roleChipLabel: string }} props
 */
function homeRouteForWrongRole(user, expectedRole) {
  if (!user?.role) return '/student';
  const r = user.role;
  if (r === 'Student') return '/student';
  if (r === 'Admin') return '/admin';
  if (expectedRole === 'Program Head' && r === 'Secretary') return '/secretary';
  if (expectedRole === 'Secretary' && r === 'Program Head') return '/program-head';
  if (r === 'Secretary') return '/secretary';
  if (r === 'Program Head') return '/program-head';
  if (r === 'Dean') return '/dean';
  if (r === 'Adviser' || r === 'Evaluator') return '/evaluator';
  return '/admin';
}

const CurriculumStaffPortal = ({
  expectedRole,
  sidebarVariant,
  collapsedStorageKey,
  sidebarBrand,
  workspaceTitle,
  roleChipLabel,
}) => {
  const { user, logout, refreshUser, canAccessModule, hasPermission, isAdmin } = useAuth();
  const navigate = useNavigate();
  const activeTabStorageKey = `${collapsedStorageKey}_activeTab`;
  const [activeTab, setActiveTabState] = useState(() => readStoredStaffTab(activeTabStorageKey));
  const [lookupSubPanel, setLookupSubPanel] = useState('programs');
  const [academicMgmtRemountKey, setAcademicMgmtRemountKey] = useState(0);
  const refreshedUserIdRef = useRef(null);

  const hasExpectedRole = user?.role === expectedRole;
  const lockedProgramId = user?.program_id ?? user?.program?.program_id ?? null;

  const showEvalModules = canAccessModule(STUDENT_EVALUATION_TAB_PERMISSIONS);
  const showEvaluationReportsTab = canAccessModule(EVALUATION_REPORTS_TAB_PERMISSIONS);
  const showUserManagement = canAccessModule(USER_MANAGEMENT_TAB_PERMISSIONS);
  const showStudentManagement = canAccessModule(STUDENT_MANAGEMENT_TAB_PERMISSIONS);
  const showImportExport = canAccessModule(IMPORT_EXPORT_TAB_PERMISSIONS);
  const showCurriculumHeadersTab = canAccessModule(CURRICULUM_HEADERS_TAB_PERMISSIONS);
  const showAdminCurriculumTab = canAccessModule(CURRICULUM_TAB_PERMISSIONS);
  const showElectiveTab = canAccessModule(ELECTIVE_SLOTS_TAB_PERMISSIONS);
  const showSystemTab = canAccessModule(ACADEMIC_MANAGEMENT_TAB_PERMISSIONS);
  const showLookupTab = canAccessModule(LOOKUP_TAB_PERMISSIONS);

  /** Program Head / Secretary always use decision analytics (not adviser-only endpoint). */
  const useDecisionAnalytics =
    showEvaluationReportsTab || expectedRole === 'Program Head' || expectedRole === 'Secretary';

  const visibleLookupPanels = useMemo(
    () =>
      LOOKUP_DATA_SIDEBAR_PANELS.filter((p) => {
        // Curriculum headers has its own Administration nav item — keep Lookup Data clean.
        if (p.panelKey === 'curriculumHeaders' && showCurriculumHeadersTab) {
          return false;
        }
        return (
          isAdmin ||
          hasPermission('lookup.view') ||
          hasPermission('lookup.manage') ||
          hasPermission(`lookup.${p.permissionSlug}.view`) ||
          hasPermission(`lookup.${p.permissionSlug}.manage`)
        );
      }),
    [isAdmin, hasPermission, showCurriculumHeadersTab]
  );

  const setActiveTab = useCallback(
    (tab) => {
      setActiveTabState(tab);
      try {
        window.localStorage.setItem(activeTabStorageKey, tab);
      } catch {
        // Ignore storage errors; tab navigation should still work.
      }
    },
    [activeTabStorageKey]
  );

  const sidebarGroups = useMemo(() => {
    const overviewItems = [];
    if (showEvalModules || showEvaluationReportsTab || useDecisionAnalytics) {
      overviewItems.push({ id: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-table-columns' });
    }
    if (useDecisionAnalytics || showEvalModules) {
      overviewItems.push({ id: 'analytics', label: 'Analytics', icon: 'fa-solid fa-chart-column' });
    }

    const evaluationItems = [];
    if (showEvalModules) {
      evaluationItems.push(
        { id: 'academic-record', label: 'Student', icon: 'fa-solid fa-user-graduate' },
        { id: 'evaluated-students', label: 'Evaluated students', icon: 'fa-solid fa-clipboard-check' }
      );
    }

    const adminItems = [];
    if (showUserManagement) {
      adminItems.push({ id: 'user-management', label: 'User management', icon: 'fa-solid fa-users' });
    }
    if (showStudentManagement) {
      adminItems.push({
        id: 'student-management',
        label: 'Student management',
        icon: 'fa-solid fa-user-graduate',
      });
    }
    if (showImportExport) {
      adminItems.push({
        id: 'import-export',
        label: 'Import / Export',
        icon: 'fa-solid fa-file-import',
      });
    }
    if (showCurriculumHeadersTab) {
      adminItems.push({
        id: 'curriculum-headers',
        label: 'Curriculum headers',
        icon: 'fa-solid fa-file-lines',
      });
    }
    if (showAdminCurriculumTab) {
      adminItems.push({
        id: 'admin-curriculum',
        label: 'Curriculum management',
        icon: 'fa-solid fa-book',
      });
    }
    if (showElectiveTab) {
      adminItems.push({ id: 'elective-slots', label: 'Elective slots', icon: 'fa-solid fa-list-check' });
    }
    if (showSystemTab) {
      adminItems.push({
        id: 'system-mgmt',
        label: 'Subject crediting',
        icon: 'fa-solid fa-school',
      });
    }
    if (showLookupTab && visibleLookupPanels.length > 0) {
      adminItems.push({
        id: 'lookup-data',
        label: 'Lookup data',
        icon: 'fa-solid fa-table-list',
        children: visibleLookupPanels.map((p) => ({
          id: lookupSidebarChildId(p.panelKey),
          label: p.label,
        })),
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
    if (adminItems.length) {
      groups.push({ id: 'admin', title: 'Administration', items: adminItems });
    }
    groups.push({ id: 'account', title: 'Account', items: accountItems });
    return groups;
  }, [
    showEvalModules,
    showEvaluationReportsTab,
    showUserManagement,
    showStudentManagement,
    showImportExport,
    showCurriculumHeadersTab,
    showAdminCurriculumTab,
    showElectiveTab,
    showSystemTab,
    showLookupTab,
    visibleLookupPanels,
    useDecisionAnalytics,
  ]);

  const firstAllowedTab = useMemo(() => {
    const order = [
      ['dashboard', showEvalModules || showEvaluationReportsTab || useDecisionAnalytics],
      ['analytics', useDecisionAnalytics || showEvalModules],
      ['academic-record', showEvalModules],
      ['evaluated-students', showEvalModules],
      ['user-management', showUserManagement],
      ['student-management', showStudentManagement],
      ['import-export', showImportExport],
      ['curriculum-headers', showCurriculumHeadersTab],
      ['admin-curriculum', showAdminCurriculumTab],
      ['elective-slots', showElectiveTab],
      ['system-mgmt', showSystemTab],
      ['lookup-data', showLookupTab && visibleLookupPanels.length > 0],
      ['profile', true],
    ];
    const hit = order.find(([, ok]) => ok);
    return hit ? hit[0] : 'profile';
  }, [
    showEvalModules,
    showEvaluationReportsTab,
    showUserManagement,
    showStudentManagement,
    showImportExport,
    showCurriculumHeadersTab,
    showAdminCurriculumTab,
    showElectiveTab,
    showSystemTab,
    showLookupTab,
    visibleLookupPanels.length,
    useDecisionAnalytics,
  ]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else if (user.is_admin && !hasExpectedRole) {
      navigate('/admin');
    } else if (!hasExpectedRole && !user.is_admin) {
      navigate(homeRouteForWrongRole(user, expectedRole));
    }
  }, [user, navigate, hasExpectedRole, expectedRole]);

  useEffect(() => {
    if (!hasExpectedRole || !user?.user_id) return undefined;
    if (refreshedUserIdRef.current !== user.user_id) {
      refreshedUserIdRef.current = user.user_id;
      refreshUser();
    }
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
  }, [hasExpectedRole, user?.user_id, refreshUser]);

  useEffect(() => {
    const openAcademicManagement = () => {
      if (!showSystemTab) return;
      setActiveTab('system-mgmt');
      setAcademicMgmtRemountKey((k) => k + 1);
    };
    window.addEventListener('portal-open-credit-evaluation', openAcademicManagement);
    window.addEventListener('portal-open-academic-management', openAcademicManagement);
    return () => {
      window.removeEventListener('portal-open-credit-evaluation', openAcademicManagement);
      window.removeEventListener('portal-open-academic-management', openAcademicManagement);
    };
  }, [showSystemTab, setActiveTab]);

  useEffect(() => {
    if (!hasExpectedRole) return;
    const allowed = {
      dashboard: showEvalModules || showEvaluationReportsTab || useDecisionAnalytics,
      analytics: useDecisionAnalytics || showEvalModules,
      'academic-record': showEvalModules,
      'evaluated-students': showEvalModules,
      'user-management': showUserManagement,
      'student-management': showStudentManagement,
      'import-export': showImportExport,
      'curriculum-headers': showCurriculumHeadersTab,
      'admin-curriculum': showAdminCurriculumTab,
      'elective-slots': showElectiveTab,
      'system-mgmt': showSystemTab,
      'lookup-data': showLookupTab && visibleLookupPanels.length > 0,
      profile: true,
    };
    if (allowed[activeTab] === false) {
      setActiveTab(firstAllowedTab);
    }
  }, [
    hasExpectedRole,
    activeTab,
    firstAllowedTab,
    showEvalModules,
    showEvaluationReportsTab,
    showUserManagement,
    showStudentManagement,
    showImportExport,
    showCurriculumHeadersTab,
    showAdminCurriculumTab,
    showElectiveTab,
    showSystemTab,
    showLookupTab,
    visibleLookupPanels.length,
    setActiveTab,
    useDecisionAnalytics,
  ]);

  useEffect(() => {
    if (activeTab !== 'lookup-data' || visibleLookupPanels.length === 0) return;
    if (!visibleLookupPanels.some((p) => p.panelKey === lookupSubPanel)) {
      setLookupSubPanel(visibleLookupPanels[0].panelKey);
    }
  }, [activeTab, lookupSubPanel, visibleLookupPanels]);

  const handleSidebarSelect = (id) => {
    const panelKey = parseLookupSidebarChildId(id);
    if (panelKey) {
      setActiveTab('lookup-data');
      setLookupSubPanel(panelKey);
      return;
    }
    setActiveTab(id);
  };

  const sidebarActiveId = activeTab === 'lookup-data' ? lookupSidebarChildId(lookupSubPanel) : activeTab;

  const handleLogout = async () => {
    try {
      window.localStorage.removeItem(activeTabStorageKey);
    } catch {
      // Ignore storage errors; logout should still continue.
    }
    await logout();
    navigate('/login');
  };

  const noopPanelChange = () => {};

  if (!user) {
    return null;
  }

  const shellClass =
    expectedRole === 'Secretary'
      ? 'faculty-panel portal-shell faculty-panel--evaluator-ui program-head-panel secretary-staff-portal'
      : 'faculty-panel portal-shell faculty-panel--evaluator-ui program-head-panel';

  return (
    <div className={shellClass}>
      <PortalSidebar
        variant={sidebarVariant}
        storageKey={collapsedStorageKey}
        brandTitle={sidebarBrand}
        groups={sidebarGroups}
        activeId={sidebarActiveId}
        onSelect={handleSidebarSelect}
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
              {roleChipLabel}
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
          {activeTab === 'dashboard' && (showEvalModules || showEvaluationReportsTab) && (
            showEvaluationReportsTab ? (
              <DeanDashboard
                onNavigate={setActiveTab}
                showEvalModules={showEvalModules}
                canManageCurriculum={showAdminCurriculumTab}
                canManageUsers={showUserManagement}
                portalLabel={roleChipLabel || expectedRole}
                analyticsTabId="analytics"
              />
            ) : (
              <EvaluatorDashboard
                onNavigate={setActiveTab}
                showEvalModules={showEvalModules}
                portalLabel={roleChipLabel || expectedRole}
              />
            )
          )}
          {activeTab === 'academic-record' && showEvalModules && (
            <StudentEvaluationView listMode="need-evaluation" />
          )}
          {activeTab === 'evaluated-students' && showEvalModules && (
            <StudentEvaluationView listMode="already-evaluated" />
          )}
          {activeTab === 'user-management' && showUserManagement && (
            <UserManagement userScope="staff" />
          )}
          {activeTab === 'student-management' && showStudentManagement && <StudentManagement />}
          {activeTab === 'import-export' && showImportExport && <DataImportExport />}
          {activeTab === 'curriculum-headers' && showCurriculumHeadersTab && (
            <LookupDataManagement
              panelNav="external"
              activePanel="curriculumHeaders"
              onActivePanelChange={noopPanelChange}
            />
          )}
          {activeTab === 'admin-curriculum' && showAdminCurriculumTab && (
            <CurriculumManagement lockedProgramId={lockedProgramId} />
          )}
          {activeTab === 'elective-slots' && showElectiveTab && (
            <ElectiveSlotManagement lockedProgramId={lockedProgramId} />
          )}
          {activeTab === 'system-mgmt' && showSystemTab && (
            <AcademicManagement key={academicMgmtRemountKey} remountKey={academicMgmtRemountKey} />
          )}
          {activeTab === 'lookup-data' && showLookupTab && visibleLookupPanels.length > 0 && (
            <LookupDataManagement
              panelNav="external"
              activePanel={lookupSubPanel}
              onActivePanelChange={setLookupSubPanel}
            />
          )}
          {activeTab === 'analytics' && (useDecisionAnalytics || showEvalModules) && (
            <DeanAnalytics showEvalModules={useDecisionAnalytics || showEvalModules} />
          )}
          {activeTab === 'profile' && <ProgramHeadProfile />}
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default CurriculumStaffPortal;
