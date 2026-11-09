import React, { useState, useEffect, useMemo, useCallback, Suspense, lazy } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import { ADMIN_PANEL_TABS, ADMIN_SIDEBAR_GROUPS } from '../../config/adminPanelTabs';
import {
  LOOKUP_DATA_SIDEBAR_PANELS,
  lookupSidebarChildId,
  parseLookupSidebarChildId,
} from '../../config/lookupDataSidebarPanels';
import PortalSidebar from '../common/PortalSidebar';
import PortalSidebarUserFooter from '../common/PortalSidebarUserFooter';
import { GuideButton } from '../common/SystemGuide';
import { userDisplayName } from '../../utils/userDisplayName';
import './AdminPanel.css';

/** Heavy admin screens — load only when the tab is opened. */
const UserManagement = lazy(() => import('./UserManagement'));
const RoleSettings = lazy(() => import('./RoleSettings'));
const CurriculumManagement = lazy(() => import('./CurriculumManagement'));
const LookupDataManagement = lazy(() => import('./LookupDataManagement'));
const AcademicManagement = lazy(() => import('./AcademicManagement'));
const ElectiveSlotManagement = lazy(() => import('./ElectiveSlotManagement'));
const StudentManagement = lazy(() => import('./StudentManagement'));
const DataImportExport = lazy(() => import('./DataImportExport'));
const SecuritySettings = lazy(() => import('./SecuritySettings'));
const AuditLogsManagement = lazy(() => import('./AuditLogsManagement'));
const BackupManagement = lazy(() => import('./BackupManagement'));

const TabFallback = () => (
  <div className="app-route-fallback" role="status" aria-live="polite">
    <span className="app-route-fallback__spinner" aria-hidden />
    <span>Loading…</span>
  </div>
);

const ADMIN_ACTIVE_TAB_STORAGE_KEY = 'adminPortalActiveTab';
const ADMIN_LOOKUP_SUB_PANEL_STORAGE_KEY = 'adminLookupSubPanel';

function readStoredAdminTab() {
  try {
    return window.localStorage.getItem(ADMIN_ACTIVE_TAB_STORAGE_KEY) || 'dashboard';
  } catch {
    return 'dashboard';
  }
}

function readStoredAdminLookupSubPanel() {
  try {
    return window.localStorage.getItem(ADMIN_LOOKUP_SUB_PANEL_STORAGE_KEY) || 'programs';
  } catch {
    return 'programs';
  }
}

const homeRouteForUser = (user) => {
  if (!user?.role) return '/student';
  const r = user.role;
  if (r === 'Evaluator' || r === 'Adviser') return '/evaluator';
  if (r === 'Dean') return '/dean';
  if (r === 'Program Head') return '/program-head';
  if (r === 'Secretary') return '/secretary';
  return '/student';
};

/** Admin role, or Dean / Program Head / Secretary — same shell; tabs permission-based. */
const AdminPanel = () => {
  const { user, logout, isAdmin, isDean, isProgramHead, isSecretary, canAccessModule, hasPermission } =
    useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTabState] = useState(readStoredAdminTab);
  const [lookupSubPanel, setLookupSubPanelState] = useState(readStoredAdminLookupSubPanel);
  const [academicMgmtRemountKey, setAcademicMgmtRemountKey] = useState(0);

  const canUseAdminShell = isAdmin || isDean || isProgramHead || isSecretary;

  const setActiveTab = useCallback((tab) => {
    setActiveTabState(tab);
    try {
      window.localStorage.setItem(ADMIN_ACTIVE_TAB_STORAGE_KEY, tab);
    } catch {
      // Ignore storage errors; tab navigation should still work.
    }
  }, []);

  const setLookupSubPanel = useCallback((panelKey) => {
    setLookupSubPanelState(panelKey);
    try {
      window.localStorage.setItem(ADMIN_LOOKUP_SUB_PANEL_STORAGE_KEY, panelKey);
    } catch {
      // Ignore storage errors; lookup navigation should still work.
    }
  }, []);

  const visibleTabs = useMemo(() => {
    return ADMIN_PANEL_TABS.filter((tab) => {
      if (tab.id === 'dashboard') {
        return true;
      }
      if (tab.id === 'role-settings') {
        return isAdmin;
      }
      return canAccessModule(tab.permissions || []);
    });
  }, [isAdmin, canAccessModule]);

  const visibleLookupPanels = useMemo(
    () =>
      LOOKUP_DATA_SIDEBAR_PANELS.filter(
        (p) =>
          isAdmin ||
          hasPermission('lookup.view') ||
          hasPermission('lookup.manage') ||
          hasPermission(`lookup.${p.permissionSlug}.view`) ||
          hasPermission(`lookup.${p.permissionSlug}.manage`)
      ),
    [isAdmin, hasPermission]
  );

  const sidebarGroups = useMemo(() => {
    const map = new Map(ADMIN_SIDEBAR_GROUPS.map((g) => [g.id, { ...g, items: [] }]));
    visibleTabs.forEach((tab) => {
      const gid = tab.group || 'directory';
      const bucket = map.get(gid);
      if (bucket) {
        if (tab.id === 'lookup') {
          if (visibleLookupPanels.length === 0) {
            bucket.items.push({ id: tab.id, label: tab.label, icon: tab.icon });
          } else {
            bucket.items.push({
              id: tab.id,
              label: tab.label,
              icon: tab.icon,
              children: visibleLookupPanels.map((p) => ({
                id: lookupSidebarChildId(p.panelKey),
                label: p.label,
              })),
            });
          }
        } else {
          bucket.items.push({ id: tab.id, label: tab.label, icon: tab.icon });
        }
      }
    });
    return ADMIN_SIDEBAR_GROUPS.map((g) => map.get(g.id)).filter((g) => g && g.items.length > 0);
  }, [visibleTabs, visibleLookupPanels]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else if (!canUseAdminShell) {
      navigate(homeRouteForUser(user));
    }
  }, [user, canUseAdminShell, navigate]);

  useEffect(() => {
    const openAcademicManagement = () => {
      setActiveTab('system');
      setAcademicMgmtRemountKey((k) => k + 1);
    };
    window.addEventListener('portal-open-credit-evaluation', openAcademicManagement);
    window.addEventListener('portal-open-academic-management', openAcademicManagement);
    return () => {
      window.removeEventListener('portal-open-credit-evaluation', openAcademicManagement);
      window.removeEventListener('portal-open-academic-management', openAcademicManagement);
    };
  }, [setActiveTab]);

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab, setActiveTab]);

  useEffect(() => {
    if (activeTab !== 'lookup' || visibleLookupPanels.length === 0) return;
    if (!visibleLookupPanels.some((p) => p.panelKey === lookupSubPanel)) {
      setLookupSubPanel(visibleLookupPanels[0].panelKey);
    }
  }, [activeTab, lookupSubPanel, visibleLookupPanels, setLookupSubPanel]);

  const handleAdminSidebarSelect = (id) => {
    const panelKey = parseLookupSidebarChildId(id);
    if (panelKey) {
      setActiveTab('lookup');
      setLookupSubPanel(panelKey);
      return;
    }
    setActiveTab(id);
  };

  const adminSidebarActiveId =
    activeTab === 'lookup' ? lookupSidebarChildId(lookupSubPanel) : activeTab;

  const handleLogout = async () => {
    try {
      window.localStorage.removeItem(ADMIN_ACTIVE_TAB_STORAGE_KEY);
      window.localStorage.removeItem(ADMIN_LOOKUP_SUB_PANEL_STORAGE_KEY);
    } catch {
      // Ignore storage errors; logout should still continue.
    }
    await logout();
    navigate('/login');
  };

  if (!user || !canUseAdminShell) {
    return null;
  }

  const panelTitle = isAdmin ? 'Admin Panel' : 'Administration';

  return (
    <div className="admin-panel portal-shell">
      {visibleTabs.length > 0 && (
        <PortalSidebar
          variant="admin"
          storageKey="portalSidebarCollapsed_admin"
          brandTitle={panelTitle}
          groups={sidebarGroups}
          activeId={adminSidebarActiveId}
          onSelect={handleAdminSidebarSelect}
            footer={<PortalSidebarUserFooter onLogout={handleLogout} />}
          />
      )}

      <div className="portal-shell__main">
        <header className="admin-header">
          <h1>{panelTitle}</h1>
          <div className="header-info">
            <span className="admin-header__welcome">Welcome, {userDisplayName(user)}</span>
            {isDean && !isAdmin && (
              <button type="button" className="admin-dean-portal-link" onClick={() => navigate('/dean')}>
                Dean portal
              </button>
            )}
            {isProgramHead && !isAdmin && (
              <button type="button" className="admin-dean-portal-link" onClick={() => navigate('/program-head')}>
                Program head portal
              </button>
            )}
            {isSecretary && !isAdmin && (
              <button type="button" className="admin-dean-portal-link" onClick={() => navigate('/secretary')}>
                Secretary portal
              </button>
            )}
            <GuideButton />
          </div>
        </header>

        {visibleTabs.length === 0 ? (
          <div className="admin-panel-empty">
            <p>
              No administration modules are assigned to your account. An administrator can grant them under User
              permissions.
            </p>
            {isDean && !isAdmin && (
              <button type="button" className="admin-panel-empty__cta" onClick={() => navigate('/dean')}>
                Back to Dean portal
              </button>
            )}
            {isProgramHead && !isAdmin && (
              <button type="button" className="admin-panel-empty__cta" onClick={() => navigate('/program-head')}>
                Program head portal
              </button>
            )}
            {isSecretary && !isAdmin && (
              <button type="button" className="admin-panel-empty__cta" onClick={() => navigate('/secretary')}>
                Secretary portal
              </button>
            )}
          </div>
        ) : (
          <main id="main-content" className="portal-shell__content admin-content" tabIndex="-1">
            <Suspense fallback={<TabFallback />}>
            {activeTab === 'dashboard' && <AdminDashboard onNavigate={setActiveTab} />}
            {activeTab === 'lookup' && (
              <LookupDataManagement
                panelNav="external"
                activePanel={lookupSubPanel}
                onActivePanelChange={setLookupSubPanel}
              />
            )}
            {activeTab === 'curriculum-headers' && (
              <LookupDataManagement
                panelNav="external"
                activePanel="curriculumHeaders"
                onActivePanelChange={() => {}}
              />
            )}
            {activeTab === 'users' && <UserManagement userScope="staff" />}
            {activeTab === 'student-management' && <StudentManagement />}
            {activeTab === 'import-export' && <DataImportExport />}
            {activeTab === 'role-settings' && <RoleSettings />}
            {activeTab === 'curriculum' && <CurriculumManagement />}
            {activeTab === 'system' && (
              <AcademicManagement key={academicMgmtRemountKey} remountKey={academicMgmtRemountKey} />
            )}
            {activeTab === 'elective-slots' && <ElectiveSlotManagement />}
            {activeTab === 'security' && <SecuritySettings />}
            {activeTab === 'audit-logs' && <AuditLogsManagement />}
            {activeTab === 'backup' && <BackupManagement />}
            </Suspense>
          </main>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
