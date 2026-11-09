/**
 * Lookup Data Management panels — order matches former horizontal tabs (sidebar / external nav).
 * permissionSlug matches backend LookupResourcePermissions::SLUGS (lookup.{slug}.view|manage).
 * Curriculum headers is included here so admins can create/select curriculum headers from Lookup Data.
 */
export const CURRICULUM_HEADER_LOOKUP_PANEL = {
  panelKey: 'curriculumHeaders',
  permissionSlug: 'curriculum_headers',
  label: 'Curriculum headers',
};

export const LOOKUP_DATA_SIDEBAR_PANELS = [
  { panelKey: 'programs', permissionSlug: 'programs', label: 'Programs' },
  { panelKey: 'departments', permissionSlug: 'departments', label: 'Departments' },
  { panelKey: 'subjects', permissionSlug: 'subjects', label: 'Subjects' },
  { panelKey: 'yearLevels', permissionSlug: 'year_levels', label: 'Year levels' },
  { panelKey: 'semesters', permissionSlug: 'semesters', label: 'Semesters' },
  { panelKey: 'campus', permissionSlug: 'campus', label: 'Campus' },
  { panelKey: 'roles', permissionSlug: 'roles', label: 'Roles' },
  { panelKey: 'requisites', permissionSlug: 'requisites', label: 'Prerequisites' },
  { panelKey: 'academicYears', permissionSlug: 'academic_years', label: 'Academic year' },
  CURRICULUM_HEADER_LOOKUP_PANEL,
  { panelKey: 'tracks', permissionSlug: 'tracks', label: 'Tracks' },
  { panelKey: 'electiveSubjects', permissionSlug: 'elective_subjects', label: 'Elective subjects' },
  { panelKey: 'offeredSubjects', permissionSlug: 'offered_subjects', label: 'Offered subjects' },
];

/** All lookup-style resources for RBAC / slug resolution. */
export const allLookupResourcePanels = () => LOOKUP_DATA_SIDEBAR_PANELS;

/** All granular lookup.* permission names (for LOOKUP_TAB_PERMISSIONS, etc.). */
export const lookupGranularPermissionNames = () =>
  allLookupResourcePanels().flatMap((p) => [
    `lookup.${p.permissionSlug}.view`,
    `lookup.${p.permissionSlug}.manage`,
  ]);

export const lookupSidebarChildId = (panelKey) => `lookup-${panelKey}`;

export const parseLookupSidebarChildId = (id) => {
  if (typeof id !== 'string' || !id.startsWith('lookup-')) return null;
  return id.slice('lookup-'.length);
};

export const permissionSlugForPanelKey = (panelKey) =>
  allLookupResourcePanels().find((p) => p.panelKey === panelKey)?.permissionSlug ?? null;
