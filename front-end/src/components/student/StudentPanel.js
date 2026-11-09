import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import StudentProfile from './StudentProfile';
import StudentCurriculum from './StudentCurriculum';
import StudentDashboard from './StudentDashboard';
import { GuideButton } from '../common/SystemGuide';
import { userDisplayName } from '../../utils/userDisplayName';
import './StudentPanel.css';

const STUDENT_ACTIVE_TAB_STORAGE_KEY = 'studentPortalActiveTab';

function readStoredStudentTab() {
  try {
    return window.localStorage.getItem(STUDENT_ACTIVE_TAB_STORAGE_KEY) || 'dashboard';
  } catch {
    return 'dashboard';
  }
}

const StudentPanel = () => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTabState] = useState(readStoredStudentTab);

  const setActiveTab = useCallback((tab) => {
    setActiveTabState(tab);
    try {
      window.localStorage.setItem(STUDENT_ACTIVE_TAB_STORAGE_KEY, tab);
    } catch {
      // Ignore storage errors; tab navigation should still work.
    }
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    // Student portal is for Student role only — staff should use their own shells.
    if (user.role && user.role !== 'Student') {
      if (isAdmin || user.role === 'Admin') {
        navigate('/admin', { replace: true });
      } else if (user.role === 'Dean') {
        navigate('/dean', { replace: true });
      } else if (user.role === 'Program Head') {
        navigate('/program-head', { replace: true });
      } else if (user.role === 'Secretary') {
        navigate('/secretary', { replace: true });
      } else if (user.role === 'Adviser' || user.role === 'Evaluator') {
        navigate('/evaluator', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    }
  }, [user, isAdmin, navigate]);

  const handleLogout = async () => {
    try {
      window.localStorage.removeItem(STUDENT_ACTIVE_TAB_STORAGE_KEY);
    } catch {
      // Ignore storage errors; logout should still continue.
    }
    await logout();
    navigate('/login');
  };

  const handleTabKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = Array.from(event.currentTarget.parentElement.querySelectorAll('[role="tab"]'));
    const currentIndex = tabs.indexOf(event.currentTarget);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab.dataset.tab);
    nextTab.focus();
  };

  if (!user) {
    return null;
  }

  return (
    <div className="student-panel">
      <header className="student-header">
        <h1>Student Portal</h1>
        <div className="header-info">
          <span>Welcome, {userDisplayName(user)}</span>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
          <GuideButton />
        </div>
      </header>

      <div className="student-tabs" role="tablist" aria-label="Student portal sections">
        <button
          type="button"
          role="tab"
          data-tab="dashboard"
          aria-selected={activeTab === 'dashboard'}
          aria-controls="main-content"
          tabIndex={activeTab === 'dashboard' ? 0 : -1}
          onKeyDown={handleTabKeyDown}
          data-tour="student-tab-dashboard"
          className={activeTab === 'dashboard' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          type="button"
          role="tab"
          data-tab="profile"
          aria-selected={activeTab === 'profile'}
          aria-controls="main-content"
          tabIndex={activeTab === 'profile' ? 0 : -1}
          onKeyDown={handleTabKeyDown}
          data-tour="student-tab-profile"
          className={activeTab === 'profile' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('profile')}
        >
          My Profile
        </button>
        <button
          type="button"
          role="tab"
          data-tab="curriculum"
          aria-selected={activeTab === 'curriculum'}
          aria-controls="main-content"
          tabIndex={activeTab === 'curriculum' ? 0 : -1}
          onKeyDown={handleTabKeyDown}
          data-tour="student-tab-curriculum"
          className={activeTab === 'curriculum' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('curriculum')}
        >
          My Curriculum
        </button>
      </div>

      <main
        id="main-content"
        className="student-content"
        role="tabpanel"
        aria-label={`${activeTab.replace('-', ' ')} section`}
        tabIndex="-1"
      >
        {activeTab === 'dashboard' && <StudentDashboard onNavigate={setActiveTab} />}
        {activeTab === 'profile' && <StudentProfile />}
        {activeTab === 'curriculum' && <StudentCurriculum />}
      </main>
    </div>
  );
};

export default StudentPanel;

