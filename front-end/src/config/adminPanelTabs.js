/**
 * Maps Admin Panel tabs to permission names from tbl_permission (and DefaultPermissionsSeeder labels).
 * Reuse the same permission arrays on Evaluator/Dean portals so granted modules appear there too.
 */

import {
  allLookupResourcePanels,
  lookupGranularPermissionNames,
} from './lookupDataSidebarPanels';

/** Dean (and any role): “Academic record evaluation” + “Evaluated students” tabs. */
export const STUDENT_EVALUATION_TAB_PERMISSIONS = [
  'Student Evaluation',
  'evaluation.view',
  'evaluation.create',
  'evaluation.edit',
  'evaluation.approve',
];

export const USER_MANAGEMENT_TAB_PERMISSIONS = [
  'User Management',
  'users.view',
  'users.create',
  'users.edit',
  'users.delete',
  'users.manage_roles',
];

/** Student accounts (directory). SIS import/export is a separate module. */
export const STUDENT_MANAGEMENT_TAB_PERMISSIONS = [
  'Student Management',
  'students.view',
  'students.create',
  'students.edit',
  'students.enroll',
];

/** SIS import + CSV export. Granted only through User permissions → Import / Export. */
export const IMPORT_EXPORT_TAB_PERMISSIONS = ['Import / Export', 'data.import', 'data.export'];
export const DATA_IMPORT_PERMISSIONS = ['Import / Export', 'data.import'];
export const DATA_EXPORT_PERMISSIONS = ['Import / Export', 'data.export'];

export const ROLE_SETTINGS_TAB_PERMISSIONS = [
  'Role Settings',
  'roles.view',
  'roles.create',
  'roles.edit',
  'roles.delete',
];

export const LOOKUP_TAB_PERMISSIONS = [
  'lookup.view',
  'lookup.manage',
  'Lookup Data',
  ...lookupGranularPermissionNames(),
];

export const CURRICULUM_TAB_PERMISSIONS = [
  'Curriculum Management',
  'curriculum.view',
  'curriculum.create',
  'curriculum.edit',
  'curriculum.delete',
  'curriculum.approve',
];

/** Curriculum header records (lookup.curriculum_headers.*) — granted with Curriculum Management → Full access. */
export const CURRICULUM_HEADERS_TAB_PERMISSIONS = [
  'lookup.view',
  'lookup.manage',
  'Lookup Data',
  'lookup.curriculum_headers.view',
  'lookup.curriculum_headers.manage',
];

/** Credit evaluation area (sidebar / tab) — any of these grants the module. */
export const CREDIT_EVALUATION_SIDEBAR_PERMISSIONS = [
  'Credit Evaluation',
  'credit_eval.view',
  'credit_eval.create',
  'credit_eval.approve',
];

/** "Subject crediting" (transfer credits) — only with User permissions → Credit Evaluation → Full access. */
export const ACADEMIC_MANAGEMENT_TAB_PERMISSIONS = CREDIT_EVALUATION_SIDEBAR_PERMISSIONS;

export const EVALUATION_REPORTS_TAB_PERMISSIONS = [
  'Evaluation Reports',
  'reports.view',
  'reports.generate',
];

export const ELECTIVE_SLOTS_TAB_PERMISSIONS = ['Elective Slots', 'electives.view', 'electives.manage'];

export const SECURITY_TAB_PERMISSIONS = ['System Management', 'system.settings', 'system.backup'];

/** Audit log viewer (Security area). */
export const AUDIT_LOGS_TAB_PERMISSIONS = ['Audit Logs', 'audit.view'];

/** Full database SQL export (Security area). */
export const BACKUP_TAB_PERMISSIONS = [
  'system.backup',
  'System Management',
  'system.settings',
];

/** Sidebar section order + titles (admin shell). */
export const ADMIN_SIDEBAR_GROUPS = [
  { id: 'overview', title: 'Overview' },
  { id: 'directory', title: 'Directory & access' },
  { id: 'curriculum', title: 'Curriculum' },
  { id: 'operations', title: 'Records & import' },
  { id: 'security', title: 'Security' },
];

export const ADMIN_PANEL_TABS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    permissions: [],
    group: 'overview',
    icon: 'fa-solid fa-gauge-high',
  },
  {
    id: 'lookup',
    label: 'Lookup Data',
    permissions: LOOKUP_TAB_PERMISSIONS,
    group: 'directory',
    icon: 'fa-solid fa-table-list',
  },
  {
    id: 'role-settings',
    label: 'User permissions',
    permissions: ROLE_SETTINGS_TAB_PERMISSIONS,
    group: 'directory',
    icon: 'fa-solid fa-user-shield',
  },
  {
    id: 'curriculum',
    label: 'Curriculum Management',
    permissions: CURRICULUM_TAB_PERMISSIONS,
    group: 'curriculum',
    icon: 'fa-solid fa-book',
  },
  {
    id: 'elective-slots',
    label: 'Elective Slots',
    permissions: ELECTIVE_SLOTS_TAB_PERMISSIONS,
    group: 'curriculum',
    icon: 'fa-solid fa-list-check',
  },
  {
    id: 'users',
    label: 'User Management',
    permissions: USER_MANAGEMENT_TAB_PERMISSIONS,
    group: 'operations',
    icon: 'fa-solid fa-users',
  },
  {
    id: 'student-management',
    label: 'Student Management',
    permissions: STUDENT_MANAGEMENT_TAB_PERMISSIONS,
    group: 'operations',
    icon: 'fa-solid fa-user-graduate',
  },
  {
    id: 'system',
    label: 'Subject crediting',
    permissions: ACADEMIC_MANAGEMENT_TAB_PERMISSIONS,
    group: 'operations',
    icon: 'fa-solid fa-id-card',
  },
  {
    id: 'import-export',
    label: 'Import / Export',
    permissions: IMPORT_EXPORT_TAB_PERMISSIONS,
    group: 'operations',
    icon: 'fa-solid fa-file-import',
  },
  {
    id: 'security',
    label: 'Security Settings',
    permissions: SECURITY_TAB_PERMISSIONS,
    group: 'security',
    icon: 'fa-solid fa-lock',
  },
  {
    id: 'audit-logs',
    label: 'Audit Logs',
    permissions: AUDIT_LOGS_TAB_PERMISSIONS,
    group: 'security',
    icon: 'fa-solid fa-clipboard-list',
  },
  {
    id: 'backup',
    label: 'Backup',
    permissions: BACKUP_TAB_PERMISSIONS,
    group: 'security',
    icon: 'fa-solid fa-database',
  },
];

/** Lookup admin screen: allow edits only with manage-level grants. */
export const LOOKUP_MANAGE_PERMISSIONS = [
  'lookup.manage',
  'Lookup Data',
  ...allLookupResourcePanels().map((p) => `lookup.${p.permissionSlug}.manage`),
];
