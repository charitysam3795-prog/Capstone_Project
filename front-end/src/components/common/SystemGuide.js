import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '../../context/AuthContext';
import './SystemGuide.css';

const GUIDE_STORAGE_PREFIX = 'portalGuideSeen_v5_';

const SystemGuideContext = createContext(null);

export function useSystemGuide() {
  const ctx = useContext(SystemGuideContext);
  if (!ctx) {
    throw new Error('useSystemGuide must be used within SystemGuideProvider');
  }
  return ctx;
}

function guideStorageKey(userId) {
  return `${GUIDE_STORAGE_PREFIX}${userId}`;
}

function hasSeenGuide(userId) {
  if (userId == null) return true;
  try {
    return window.localStorage.getItem(guideStorageKey(userId)) === '1';
  } catch {
    return false;
  }
}

function markGuideSeen(userId) {
  if (userId == null) return;
  try {
    window.localStorage.setItem(guideStorageKey(userId), '1');
  } catch {
    // Ignore storage errors.
  }
}

function clearGuideSeen(userId) {
  if (userId == null) return;
  try {
    window.localStorage.removeItem(guideStorageKey(userId));
  } catch {
    // Ignore storage errors.
  }
}

function portalNameForRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'dean') return 'Dean Portal';
  if (r === 'program head') return 'Program Head portal';
  if (r === 'secretary') return 'Secretary portal';
  if (r === 'adviser' || r === 'evaluator' || r === 'faculty') return 'Adviser Portal';
  return 'Academic Evaluation Portal';
}

/**
 * Shared evaluation walkthrough for evaluating staff roles (not Admin):
 * regulars are auto-evaluated/promoted; manual work focuses on irregulars.
 */
function evaluationWalkthroughSteps({ portalName = 'portal' } = {}) {
  return [
    {
      title: 'How evaluation works',
      body: `Welcome to the ${portalName}. Dean, Program Head, Secretary, and Adviser all evaluate the same way. Regular students who passed their term subjects are auto-evaluated and auto-promoted — you normally do not need to open them. This guide walks you through evaluating irregular students (failed, incomplete, or off-track loads).`,
      target: null,
    },
    {
      title: 'Open Student evaluation',
      body: 'Go to Evaluation → Student (or use Evaluate a student from the dashboard). This list is where manual evaluation happens.',
      openTab: 'academic-record',
      target:
        '[data-tour="page-academic-record"], [data-tour="nav-academic-record"], [data-tour="dean-quick-actions"]',
    },
    {
      title: 'Focus on irregulars',
      body: 'Use Standing → Unevaluated (or Unevaluated irregular). That list is for students the system did not auto-evaluate/promote when the semester changed — incomplete loads, irregulars, or missed auto-runs. Promote those manually. Regulars who auto-promoted successfully leave this list.',
      openTab: 'academic-record',
      target:
        '[data-tour="evaluation-standing-filter"], [data-tour="evaluation-student-selector"], [data-tour="page-academic-record"]',
      allowInteraction: true,
    },
    {
      title: '1. Practice student',
      body: 'The guide loads an existing [Practice] SIMULATION student so you can try the workflow safely. Changes while the Guide is open are previews only and are not saved to real records.',
      openTab: 'academic-record',
      target: '[data-tour="page-academic-record"]',
      allowInteraction: true,
      requireBeforeNext: '[data-tour="evaluation-summary"]',
      requireMessage: 'Loading the practice student. Please wait.',
      blockedButtonLabel: 'Loading sample…',
    },
    {
      title: '2. Confirm irregular standing',
      body: 'Check academic status, credited/lacking units, Curriculum, Program, Year, and Semester. For irregulars, status should show Irregular — that is who you evaluate manually.',
      openTab: 'academic-record',
      target:
        '[data-tour="evaluation-summary"], [data-tour="evaluation-standing"], [data-tour="page-academic-record"]',
    },
    {
      title: '3. Record grades',
      body: 'In the curriculum table, enter or correct grades. Green check = passed, red X = failed, reset when needed. Failed or incomplete subjects keep a student irregular and block auto-promotion. With Promote only access (Adviser default), grades are read-only — just review them.',
      openTab: 'academic-record',
      target: '[data-tour="evaluation-grades"], [data-tour="page-academic-record"]',
    },
    {
      title: '4. Save grade changes',
      body: 'If you edited grades, click Save All Changes when the floating bar appears. If you did not edit grades (or have Promote only access), skip this — Guide mode lets you open Promote as a preview anyway.',
      openTab: 'academic-record',
      target:
        '[data-tour="evaluation-save"], [data-tour="evaluation-grades"], [data-tour="page-academic-record"]',
    },
    {
      title: '5. Promote (manual for irregulars)',
      body: 'Regulars who cleared the term are promoted automatically. For irregulars, use Promote to next semester. In Guide mode the button stays clickable for a preview even if the practice student looks Regular or has no grades yet — nothing is saved.',
      openTab: 'academic-record',
      target:
        '[data-tour="promote-student"], [data-tour="evaluation-summary"], [data-tour="page-academic-record"]',
      allowInteraction: true,
      requireBeforeNext: '[data-tour="promote-review"]',
      requireMessage: 'Click Promote to next semester before continuing.',
      blockedButtonLabel: 'Open promote first',
      autoAdvanceOnRequire: true,
    },
    {
      title: '6. Review next term',
      body: 'Review next-term subjects, prerequisites, and units. Pick a track or elective if required, enter the evaluator name, then Save. In Guide mode, Save only closes the preview.',
      openTab: 'academic-record',
      target: '[data-tour="promote-review"]',
      allowInteraction: true,
      requireBeforeNext:
        '[data-tour="page-academic-record"][data-guide-promotion-saved="true"]',
      requireMessage: 'Click Save in the promotion preview before continuing.',
      blockedButtonLabel: 'Save preview first',
      autoAdvanceOnRequire: true,
    },
    {
      title: '7. Open Subject placement',
      body: 'Irregular loads often need a custom mix of current and backlog subjects. Click Subject placement at the lower-right to build the term load.',
      openTab: 'academic-record',
      target:
        '[data-tour="subject-placement"], [data-tour="evaluation-summary"], [data-tour="page-academic-record"]',
      allowInteraction: true,
      requireBeforeNext: '[data-tour="subject-placement-panel"]',
      requireMessage: 'Open Subject placement before continuing.',
      blockedButtonLabel: 'Open placement first',
      autoAdvanceOnRequire: true,
    },
    {
      title: '8. Build the term load',
      body: 'Check Take for subjects to enroll and Drop for deferred ones. Prior subjects need met prerequisites and must be offered; stay within the unit cap. Preview-only while the Guide is open.',
      openTab: 'academic-record',
      target: '[data-tour="subject-placement-panel"]',
      allowInteraction: true,
    },
    {
      title: '9. Save subject placement',
      body: 'Click Save load plan (bottom of the placement window) to finish. In Guide mode this closes the preview without writing the load plan.',
      openTab: 'academic-record',
      target: '[data-tour="save-load-plan"]',
      allowInteraction: true,
      requireBeforeNext:
        '[data-tour="page-academic-record"][data-guide-load-saved="true"]',
      requireMessage: 'Click Save load plan before continuing.',
      blockedButtonLabel: 'Save load plan first',
      autoAdvanceOnRequire: true,
    },
    {
      title: 'Evaluation complete',
      body: 'Recheck Year/Semester, irregular vs regular status, remaining units, and This term load. Open Evaluated students later to review stored irregular evaluations.',
      openTab: 'academic-record',
      target: '[data-tour="evaluation-summary"]',
      closeEvalPanels: true,
    },
    {
      title: 'Guide anytime',
      body: 'Click Guide in the header anytime you need this irregular-evaluation walkthrough again. Logout is in the sidebar.',
      target: '[data-tour="guide-button"]',
      closeEvalPanels: true,
    },
  ];
}

/**
 * Tour steps:
 * - openTab: open that sidebar/student tab first
 * - target: spotlight this element after open
 */
function tourStepsForRole(role) {
  const r = String(role || '').trim().toLowerCase();

  // Students see their own portal tour (they do not evaluate others).
  if (r === 'student') {
    return [
      {
        title: 'How it works',
        body: 'Welcome to the Student Portal. Each step opens a tab and explains what is inside.',
        target: null,
      },
      {
        title: 'Dashboard',
        body: 'Your home page: enrolled subjects, current term, and shortcuts to grades and profile.',
        openTab: 'student-dashboard',
        target: '[data-tour="page-student-dashboard"]',
      },
      {
        title: 'My Profile',
        body: 'Update contact number, address, and personal details on this page.',
        openTab: 'student-profile',
        target: '[data-tour="page-student-profile"]',
      },
      {
        title: 'My Curriculum',
        body: 'Browse program subjects, status, and remaining requirements here.',
        openTab: 'student-curriculum',
        target: '[data-tour="page-student-curriculum"]',
      },
      {
        title: 'Guide anytime',
        body: 'Click Guide in the header whenever you need this walkthrough again. Logout is in the sidebar.',
        target: '[data-tour="guide-button"]',
      },
    ];
  }

  // Admin manages the system — no student-evaluation walkthrough.
  if (r === 'admin') {
    return [
      {
        title: 'How it works',
        body: 'Welcome to the Admin Panel. Each step opens a module and shows what you manage there. Student evaluation is handled by Dean, Adviser, Program Head, and Secretary — not this guide.',
        target: null,
      },
      {
        title: 'Sidebar',
        body: 'Every administration module lives in this left menu.',
        target: '[data-tour="portal-sidebar"]',
        spotlight: 'sidebar',
      },
      {
        title: 'Lookup data',
        body: 'Maintain programs, departments, subjects, campuses, and other reference lists.',
        openTab: 'lookup',
        target: '[data-tour="page-lookup-data"], .portal-shell__content',
      },
      {
        title: 'User management',
        body: 'Create and edit staff accounts, assign roles, and control access.',
        openTab: 'users',
        target: '[data-tour="page-user-management"]',
      },
      {
        title: 'Student management',
        body: 'Manage student profiles and import grade CSV files with preview and Fix row.',
        openTab: 'student-management',
        target: '[data-tour="page-student-management"]',
      },
      {
        title: 'Curriculum',
        body: 'Maintain program curricula, subjects, and prerequisites used across evaluation.',
        openTab: 'curriculum',
        target: '[data-tour="page-curriculum"]',
      },
      {
        title: 'Elective slots',
        body: 'Configure elective slots available to programs and evaluation.',
        openTab: 'elective-slots',
        target: '[data-tour="page-elective-slots"]',
      },
      {
        title: 'Guide anytime',
        body: 'Need a refresher? Click Guide in the header. Logout is in the sidebar.',
        target: '[data-tour="guide-button"]',
      },
    ];
  }

  // Dean, Adviser, Evaluator, Program Head, Secretary, and other evaluating staff.
  return evaluationWalkthroughSteps({ portalName: portalNameForRole(role) });
}

function resolveTargetRect(selector) {
  if (!selector) return null;
  const parts = String(selector)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    const el = document.querySelector(part);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 && rect.height < 2) continue;
    return { el, rect };
  }
  return null;
}

function expandSidebarIfNeeded() {
  const aside = document.querySelector('[data-tour="portal-sidebar"]');
  if (!aside) return false;
  if (!aside.classList.contains('portal-sidebar--collapsed')) return true;
  window.dispatchEvent(new CustomEvent('portal-sidebar-expand'));
  return false;
}

function resolveSidebarRect() {
  const expanded = expandSidebarIfNeeded();
  const el = document.querySelector('[data-tour="portal-sidebar"]');
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  // Wait until the rail is actually wide (expanded), avoid highlighting a thin strip.
  if (!expanded || rect.width < 180) return null;
  if (rect.height < 80) return null;
  return { el, rect };
}

const STUDENT_TAB_MAP = {
  'student-dashboard': '[data-tour="student-tab-dashboard"]',
  'student-profile': '[data-tour="student-tab-profile"]',
  'student-curriculum': '[data-tour="student-tab-curriculum"]',
};

function activateTourTab(openTab) {
  if (!openTab) return false;
  expandSidebarIfNeeded();

  const studentSel = STUDENT_TAB_MAP[openTab];
  if (studentSel) {
    const tabBtn = document.querySelector(studentSel);
    if (tabBtn) {
      tabBtn.click();
      return true;
    }
  }

  const navBtn = document.querySelector(`[data-tour="nav-${openTab}"]`);
  if (navBtn) {
    navBtn.click();
    return true;
  }
  return false;
}

/** Drop steps whose tab is not in this user's sidebar. */
function filterAvailableSteps(steps) {
  return steps.filter((step) => {
    if (!step.openTab) return true;
    if (STUDENT_TAB_MAP[step.openTab]) {
      return Boolean(document.querySelector(STUDENT_TAB_MAP[step.openTab]));
    }
    return Boolean(document.querySelector(`[data-tour="nav-${step.openTab}"]`));
  });
}

export function SystemGuideProvider({ children }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [autoPromptedFor, setAutoPromptedFor] = useState(null);

  const userId = user?.user_id ?? user?.id ?? null;
  const role = user?.role || '';
  const mustChangePassword = Boolean(user?.must_change_password);
  const allSteps = useMemo(() => tourStepsForRole(role), [role]);
  const [steps, setSteps] = useState(allSteps);

  useEffect(() => {
    setSteps(allSteps);
  }, [allSteps]);

  const openGuide = useCallback(() => {
    expandSidebarIfNeeded();
    window.setTimeout(() => {
      setSteps(filterAvailableSteps(allSteps));
      setStepIndex(0);
      setOpen(true);
    }, 80);
  }, [allSteps]);

  const closeGuide = useCallback(() => {
    setOpen(false);
    setStepIndex(0);
    if (userId != null) markGuideSeen(userId);
    window.dispatchEvent(new CustomEvent('system-guide-close-eval-panels'));
  }, [userId]);

  useEffect(() => {
    document.body.classList.toggle('system-guide-open', open);
    return () => document.body.classList.remove('system-guide-open');
  }, [open]);

  const resetGuide = useCallback(() => {
    clearGuideSeen(userId);
    openGuide();
  }, [userId, openGuide]);

  useEffect(() => {
    if (!user || userId == null) return;
    if (mustChangePassword) return;
    if (autoPromptedFor === userId) return;
    if (hasSeenGuide(userId)) {
      setAutoPromptedFor(userId);
      return;
    }
    setAutoPromptedFor(userId);
    const timer = window.setTimeout(() => {
      openGuide();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [user, userId, mustChangePassword, autoPromptedFor, openGuide]);

  const value = useMemo(
    () => ({ open, openGuide, closeGuide, resetGuide }),
    [open, openGuide, closeGuide, resetGuide]
  );

  return (
    <SystemGuideContext.Provider value={value}>
      {children}
      {open && user && !mustChangePassword && steps.length > 0 ? (
        <SpotlightTour
          steps={steps}
          stepIndex={stepIndex}
          setStepIndex={setStepIndex}
          onClose={closeGuide}
        />
      ) : null}
    </SystemGuideContext.Provider>
  );
}

function SpotlightTour({ steps, stepIndex, setStepIndex, onClose }) {
  const [hole, setHole] = useState(null);
  const [tipPos, setTipPos] = useState({ top: 0, left: 0, placement: 'center' });
  const [blockedMessage, setBlockedMessage] = useState('');

  const step = steps[stepIndex] || steps[0];
  const total = steps.length;
  const isLast = stepIndex >= total - 1;
  const isFirst = stepIndex <= 0;
  const isSidebarStep = step?.spotlight === 'sidebar' || step?.target === '[data-tour="portal-sidebar"]';
  const isInteractiveStep = Boolean(step?.allowInteraction);

  const placeTipRight = useCallback((holeRect) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const preferredWidth = Math.min(360, viewportWidth - 24);
    const estimatedHeight = 230;
    const navReserve = 92;
    const gap = 14;
    const safeTop = 12;
    const safeBottom = viewportHeight - navReserve;

    if (!holeRect) {
      setTipPos({
        top: 72,
        left: Math.max(12, viewportWidth - preferredWidth - 20),
        placement: 'right',
        tipWidth: preferredWidth,
      });
      return;
    }

    const rightSpace = viewportWidth - (holeRect.left + holeRect.width) - gap;
    const leftSpace = holeRect.left - gap;
    const belowSpace = safeBottom - (holeRect.top + holeRect.height) - gap;
    const aboveSpace = holeRect.top - safeTop - gap;
    const clampTop = (top) =>
      Math.max(safeTop, Math.min(top, safeBottom - estimatedHeight));

    if (rightSpace >= 260) {
      const tipWidth = Math.min(preferredWidth, rightSpace);
      setTipPos({
        top: clampTop(holeRect.top),
        left: holeRect.left + holeRect.width + gap,
        placement: 'right',
        tipWidth,
      });
      return;
    }

    if (leftSpace >= 260) {
      const tipWidth = Math.min(preferredWidth, leftSpace);
      setTipPos({
        top: clampTop(holeRect.top),
        left: holeRect.left - tipWidth - gap,
        placement: 'left',
        tipWidth,
      });
      return;
    }

    if (aboveSpace >= estimatedHeight) {
      setTipPos({
        top: Math.max(safeTop, holeRect.top - estimatedHeight - gap),
        left: Math.max(
          12,
          Math.min(holeRect.left, viewportWidth - preferredWidth - 12)
        ),
        placement: 'above',
        tipWidth: preferredWidth,
      });
      return;
    }

    if (belowSpace >= estimatedHeight) {
      setTipPos({
        top: holeRect.top + holeRect.height + gap,
        left: Math.max(
          12,
          Math.min(holeRect.left, viewportWidth - preferredWidth - 12)
        ),
        placement: 'below',
        tipWidth: preferredWidth,
      });
      return;
    }

    // Large spotlight: use the narrow space over the sidebar so the
    // evaluation controls inside the highlighted area remain unobstructed.
    if (holeRect.left >= 150) {
      const tipWidth = Math.max(150, Math.min(220, holeRect.left - 24));
      setTipPos({
        top: clampTop(holeRect.top),
        left: 12,
        placement: 'sidebar',
        tipWidth,
      });
      return;
    }

    // Mobile fallback: dock to the least obstructive lower corner.
    setTipPos({
      top: clampTop(holeRect.top + 12),
      left: Math.max(12, viewportWidth - preferredWidth - 12),
      placement: 'overlay',
      tipWidth: preferredWidth,
    });
  }, []);

  const applyHoleFromFound = useCallback(
    (found) => {
      found.el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
      const padding = 8;
      const r = found.el.getBoundingClientRect();
      const top = Math.max(8, r.top - padding);
      const left = Math.max(8, r.left - padding);
      const bottom = Math.min(window.innerHeight - 8, r.bottom + padding);
      const right = Math.min(window.innerWidth - 8, r.right + padding);
      const holeRect = {
        top,
        left,
        width: Math.max(48, right - left),
        height: Math.max(48, bottom - top),
      };
      setHole(holeRect);
      placeTipRight(holeRect);
    },
    [placeTipRight]
  );

  const measure = useCallback(() => {
    if (!step) return;

    if (!step.target && !step.openTab) {
      setHole(null);
      setTipPos({ top: window.innerHeight / 2, left: window.innerWidth / 2, placement: 'center' });
      return;
    }

    if (isSidebarStep) {
      const sidebar = resolveSidebarRect();
      if (!sidebar) {
        // Keep retrying until expanded width is ready.
        return;
      }
      applyHoleFromFound(sidebar);
      return;
    }

    expandSidebarIfNeeded();

    // Prefer the required control/modal once it appears (e.g. promote preview after click).
    let found = step.requireBeforeNext
      ? resolveTargetRect(step.requireBeforeNext)
      : null;
    if (!found && step.target) {
      found = resolveTargetRect(step.target);
    }
    if (!found && step.openTab) {
      found = resolveTargetRect(
        '[data-tour="page-academic-record"], [data-tour="page-evaluated-students"], .portal-shell__content'
      );
    }
    if (!found) {
      found = resolveTargetRect('.portal-shell__content');
    }
    if (!found) {
      setHole(null);
      placeTipRight(null);
      return;
    }

    applyHoleFromFound(found);
  }, [step, isSidebarStep, applyHoleFromFound, placeTipRight]);

  useLayoutEffect(() => {
    let cancelled = false;
    const timers = [];

    const run = () => {
      if (!step) return;
      expandSidebarIfNeeded();
      if (step.openTab) {
        activateTourTab(step.openTab);
      }
      if (step.closeEvalPanels) {
        window.dispatchEvent(new CustomEvent('system-guide-close-eval-panels'));
      }
      const delays = isSidebarStep || step.openTab || step.allowInteraction
        ? [50, 150, 300, 500, 800, 1200]
        : [40, 120];
      delays.forEach((ms) => {
        timers.push(
          window.setTimeout(() => {
            if (!cancelled) measure();
          }, ms)
        );
      });
    };

    run();
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [step, stepIndex, measure, isSidebarStep]);

  useEffect(() => {
    setBlockedMessage('');
  }, [stepIndex]);

  useEffect(() => {
    if (!step?.requireBeforeNext) return undefined;
    let advanced = false;
    const checkRequirement = () => {
      const ready = Boolean(resolveTargetRect(step.requireBeforeNext));
      if (ready) {
        setBlockedMessage('');
        measure();
        if (step.autoAdvanceOnRequire && !advanced) {
          advanced = true;
          setStepIndex((i) => Math.min(total - 1, i + 1));
        }
      } else {
        setBlockedMessage(step.requireMessage || 'Complete this step before continuing.');
      }
    };
    checkRequirement();
    const timer = window.setInterval(checkRequirement, 200);
    return () => window.clearInterval(timer);
  }, [step, stepIndex, total, setStepIndex, measure]);

  // Keep the spotlight glued to modals/buttons that appear during interactive steps.
  useEffect(() => {
    if (!isInteractiveStep) return undefined;
    const timer = window.setInterval(() => measure(), 300);
    return () => window.clearInterval(timer);
  }, [isInteractiveStep, stepIndex, measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        if (step?.requireBeforeNext && !resolveTargetRect(step.requireBeforeNext)) {
          setBlockedMessage(step.requireMessage || 'Complete this step before continuing.');
          measure();
          return;
        }
        if (isLast) onClose();
        else setStepIndex((i) => Math.min(total - 1, i + 1));
      }
      if (e.key === 'ArrowLeft' && !isFirst) {
        setStepIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, isLast, isFirst, setStepIndex, total, step, measure]);

  const goNext = () => {
    if (step?.requireBeforeNext && !resolveTargetRect(step.requireBeforeNext)) {
      setBlockedMessage(step.requireMessage || 'Complete this step before continuing.');
      measure();
      return;
    }
    if (isLast) onClose();
    else setStepIndex((i) => i + 1);
  };

  const goBack = () => {
    if (!isFirst) setStepIndex((i) => i - 1);
  };

  const stopNavClick = (e) => e.stopPropagation();
  const centered = !hole || tipPos.placement === 'center';

  // 4 shade panels around the hole (hole stays clear for a correct highlight).
  const shadePanels = hole
    ? [
        {
          key: 'top',
          style: { top: 0, left: 0, width: '100%', height: Math.max(0, hole.top) },
        },
        {
          key: 'left',
          style: {
            top: hole.top,
            left: 0,
            width: Math.max(0, hole.left),
            height: hole.height,
          },
        },
        {
          key: 'right',
          style: {
            top: hole.top,
            left: hole.left + hole.width,
            width: Math.max(0, window.innerWidth - (hole.left + hole.width)),
            height: hole.height,
          },
        },
        {
          key: 'bottom',
          style: {
            top: hole.top + hole.height,
            left: 0,
            width: '100%',
            height: Math.max(0, window.innerHeight - (hole.top + hole.height)),
          },
        },
      ]
    : null;

  return (
    <div
      className="spotlight-tour"
      role="dialog"
      aria-modal="true"
      aria-labelledby="spotlight-tour-title"
    >
      {shadePanels ? (
        shadePanels.map((panel) => (
          <button
            key={panel.key}
            type="button"
            className={`spotlight-tour__shade-panel${
              isInteractiveStep ? ' spotlight-tour__shade-panel--interactive' : ''
            }`}
            style={panel.style}
            aria-label={isLast ? 'Finish guide' : 'Continue to next step'}
            onClick={goNext}
          />
        ))
      ) : (
        <button
          type="button"
          className={`spotlight-tour__shade-panel spotlight-tour__shade-panel--full${
            isInteractiveStep ? ' spotlight-tour__shade-panel--interactive' : ''
          }`}
          aria-label={isLast ? 'Finish guide' : 'Continue to next step'}
          onClick={goNext}
        />
      )}

      {hole ? (
        <div
          className={`spotlight-tour__hole${
            isInteractiveStep ? '' : ' spotlight-tour__hole--blocked'
          }`}
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
          }}
          aria-hidden
        />
      ) : null}

      <div
        className={`spotlight-tour__card${centered ? ' spotlight-tour__card--center' : ''}`}
        style={
          centered
            ? undefined
            : {
                top: tipPos.top,
                left: tipPos.left,
                width: tipPos.tipWidth || 360,
              }
        }
        onClick={goNext}
        role="presentation"
      >
        <div className="spotlight-tour__card-top">
          <p className="spotlight-tour__eyebrow">How it works</p>
          <button
            type="button"
            className="spotlight-tour__skip"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            Skip
          </button>
        </div>
        <h2 id="spotlight-tour-title" className="spotlight-tour__title">
          {step?.title}
        </h2>
        <p className="spotlight-tour__body">{step?.body}</p>
        {blockedMessage ? (
          <p className="spotlight-tour__required" role="alert">
            {blockedMessage}
          </p>
        ) : null}
        <div className="spotlight-tour__footer">
          <span className="spotlight-tour__progress">
            {stepIndex + 1} / {total}
          </span>
          <span className="spotlight-tour__hint">
            {isInteractiveStep ? 'Use the highlighted controls' : 'Click dimmed area to continue'}
          </span>
        </div>
      </div>

      <div className="spotlight-tour__float-nav" onClick={stopNavClick}>
        {!isFirst ? (
          <button type="button" className="spotlight-tour__btn spotlight-tour__btn--ghost" onClick={goBack}>
            Back
          </button>
        ) : null}
        <button type="button" className="spotlight-tour__btn spotlight-tour__btn--primary" onClick={goNext}>
          {blockedMessage
            ? step?.blockedButtonLabel || 'Complete this step'
            : isLast
              ? 'Finish'
              : 'Continue'}
        </button>
      </div>
    </div>
  );
}

export function GuideButton({ className = '' }) {
  const { openGuide } = useSystemGuide();

  return (
    <button
      type="button"
      className={`guide-button ${className}`.trim()}
      data-tour="guide-button"
      onClick={openGuide}
    >
      Guide
    </button>
  );
}

export default SystemGuideProvider;
