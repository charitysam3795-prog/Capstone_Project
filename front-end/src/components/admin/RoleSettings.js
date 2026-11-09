import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { permissionService, userService } from '../../services/rbacService';
import { swalToast, swalError, swalConfirm } from '../../utils/swal';
import './RoleSettings.css';

/** Modules without `*.view` (e.g. system.settings / system.backup): minimal tier = these ids. */
const VIEW_TIER_IDS_RESOLVER = {
  evaluation: (perms) =>
    perms
      .filter((p) => p.permission_name === 'evaluation.view')
      .map((p) => Number(p.permission_id)),
  system: (perms) =>
    perms
      .filter((p) => p.permission_name === 'system.settings')
      .map((p) => Number(p.permission_id)),
  data: (perms) =>
    perms
      .filter((p) => p.permission_name === 'data.export')
      .map((p) => Number(p.permission_id)),
};

/** Import / Export "Import only" tier. The legacy "Import / Export" grant implies both, so it is Full access only. */
const getImportOnlyPermissionIds = (moduleKey, perms) => {
  if (moduleKey !== 'data') return [];
  return perms
    .filter((p) => p.permission_name === 'data.import')
    .map((p) => Number(p.permission_id));
};

const getViewTierPermissionIds = (moduleKey, perms) => {
  if (VIEW_TIER_IDS_RESOLVER[moduleKey]) {
    return VIEW_TIER_IDS_RESOLVER[moduleKey](perms);
  }
  return perms
    .filter((p) => p.permission_name === `${moduleKey}.view`)
    .map((p) => Number(p.permission_id));
};

/** Only in Credit Evaluation → Full access: grade entry and Subject crediting (credit_eval.*). */
const isFullAccessOnlyEvaluationPermission = (name) =>
  ['evaluation.create', 'evaluation.edit', 'evaluation.approve', 'Credit Evaluation'].includes(name) ||
  String(name || '').startsWith('credit_eval.');

/** Credit Evaluation "Promote only" tier (Adviser default): view, promote, PDF — no grades, no Subject crediting. */
const getPromoteTierPermissionIds = (moduleKey, perms) => {
  if (moduleKey !== 'evaluation') return [];
  if (!perms.some((p) => p.permission_name === 'evaluation.promote')) return [];
  return perms
    .filter((p) => !isFullAccessOnlyEvaluationPermission(p.permission_name))
    .map((p) => Number(p.permission_id));
};

const sortNum = (a, b) => a - b;

const sameIdSet = (assignedSubset, targetIds) => {
  const ta = [...new Set(targetIds.map(Number))].sort(sortNum);
  const sa = [...new Set(assignedSubset.map(Number))].sort(sortNum);
  if (ta.length !== sa.length) return false;
  return ta.every((v, i) => v === sa[i]);
};

const FRIENDLY_PERMISSION_MERGE_INTO = {
  'Curriculum Management': 'curriculum',
  'Elective Slots': 'electives',
  'User Management': 'users',
  'Student Management': 'students',
  'Credit Evaluation': 'evaluation',
  'Student Evaluation': 'evaluation',
  /** Merge with system.settings / system.backup — one "Security Settings" block in the UI */
  'System Management': 'system',
  /** Legacy module grant + data.import / data.export — one "Import / Export" block */
  'Import / Export': 'data',
};

/** Curriculum headers are granted with Curriculum Management → Full access (not a separate Lookup Data item). */
const CURRICULUM_HEADER_PERMISSION_PREFIX = 'lookup.curriculum_headers.';

const moduleKeyFromPermissionName = (name) => {
  const mergeTarget = FRIENDLY_PERMISSION_MERGE_INTO[name];
  if (mergeTarget) return mergeTarget;
  if (name.startsWith(CURRICULUM_HEADER_PERMISSION_PREFIX)) {
    return 'curriculum';
  }
  const parts = name.split('.');
  if (parts[0] === 'lookup' && parts.length >= 3) {
    return `lookup.${parts[1]}`;
  }
  if (parts[0] === 'credit_eval') {
    return 'evaluation';
  }
  const dot = name.indexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};

/** Dot-prefix module keys → clearer titles (not the same as the user’s role name). */
const MODULE_LABEL_OVERRIDES = {
  curriculum: 'Curriculum Management',
  data: 'Import / Export',
  evaluation: 'Credit Evaluation',
  system: 'Security Settings',
  users: 'User Management',
  students: 'Student Management',
};

/** DB permission_name → label in lists (backend still uses "System Management"). */
const PERMISSION_DISPLAY_NAME_OVERRIDES = {
  'System Management': 'Security Settings',
};

const displayPermissionName = (name) =>
  PERMISSION_DISPLAY_NAME_OVERRIDES[name] ?? name;

const LOOKUP_DATA_CATEGORY = 'lookup-data';
const LOOKUP_DATA_LABEL = 'Lookup Data';
const isLookupModuleKey = (key) => key.startsWith('lookup.');
const HIDDEN_PERMISSION_NAMES = new Set([
  'Evaluation Reports',
  'reports.view',
  'reports.generate',
  'Faculty',
  'faculty.view',
  'lookup.view',
  'lookup.manage',
  'roles.view',
  'roles.create',
  'roles.edit',
  'roles.delete',
]);

const HIDDEN_MODULE_KEYS = new Set(['faculty']);

const formatModuleLabel = (key) => {
  if (MODULE_LABEL_OVERRIDES[key]) {
    return MODULE_LABEL_OVERRIDES[key];
  }
  if (isLookupModuleKey(key)) {
    return key
      .replace(/^lookup\./, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatPermissionActionLabel = (name, moduleKey, multi) => {
  if (!multi) return null;
  const parts = name.split('.');
  if (isLookupModuleKey(moduleKey)) {
    return parts[2] || null;
  }
  const dot = name.indexOf('.');
  return dot > 0 ? name.slice(dot + 1) : null;
};

const userRoleName = (u) => u?.role?.role_name || u?.role_name || '';

/** Nested staff/student profile (API may use camelCase or snake_case). */
const profileOf = (u) =>
  u?.deanProfile ||
  u?.dean_profile ||
  u?.programHeadProfile ||
  u?.program_head_profile ||
  u?.secretaryProfile ||
  u?.secretary_profile ||
  u?.facultyProfile ||
  u?.faculty_profile ||
  u?.studentProfile ||
  u?.student_profile ||
  null;

const userDisplayName = (u) => {
  const p = profileOf(u);
  const first = String(p?.first_name || u?.first_name || '').trim();
  const middle = String(p?.middle_name || u?.middle_name || '').trim();
  const last = String(p?.last_name || u?.last_name || '').trim();
  return [first, middle, last].filter(Boolean).join(' ');
};

const userDepartmentName = (u) => {
  const fromUser = u?.department?.department_name || u?.department?.name;
  if (fromUser) return String(fromUser).trim();
  const p = profileOf(u);
  const fromProfile =
    p?.department?.department_name ||
    p?.department?.name ||
    p?.program?.department?.department_name ||
    p?.program?.department?.name ||
    u?.program?.department?.department_name ||
    u?.program?.department?.name;
  return fromProfile ? String(fromProfile).trim() : '';
};

/** User permissions UI is for editable staff roles only — not Student or Admin accounts. */
const editablePermissionUsers = (list) =>
  list.filter((u) => {
    const roleName = userRoleName(u);
    return roleName !== 'Student' && roleName !== 'Admin';
  });

const RoleSettings = () => {
  const { user, refreshUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const userPickerRef = useRef(null);
  const [permissions, setPermissions] = useState([]);
  const [assignedIds, setAssignedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [permissionsReadOnly, setPermissionsReadOnly] = useState(false);
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);
  const [yearLevels, setYearLevels] = useState([]);
  const [evalYearLevelSelectedIds, setEvalYearLevelSelectedIds] = useState([]);
  const selectedUserId = selectedUser?.user_id;

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      fetchPermissionsForUser(selectedUserId);
    } else {
      setPermissions([]);
      setAssignedIds([]);
      setPermissionsReadOnly(false);
      setUseCustomPermissions(false);
      setYearLevels([]);
      setEvalYearLevelSelectedIds([]);
    }
  }, [selectedUserId]);

  useEffect(() => {
    if (!userPickerOpen) return undefined;
    const onPointerDown = (event) => {
      if (userPickerRef.current && !userPickerRef.current.contains(event.target)) {
        setUserPickerOpen(false);
        if (selectedUser) {
          setUserSearch('');
        }
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setUserPickerOpen(false);
        if (selectedUser) setUserSearch('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [userPickerOpen, selectedUser]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await userService.getUsers();
      const raw = Array.isArray(data) ? data : [];
      const list = editablePermissionUsers(raw);
      setUsers(list);
      setSelectedUser((prev) => {
        if (prev && list.some((u) => Number(u.user_id) === Number(prev.user_id))) {
          return prev;
        }
        return null;
      });
    } catch (err) {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissionsForUser = async (userId) => {
    try {
      setLoading(true);
      setError('');
      const data = await permissionService.getPermissionsForUser(userId);
      setPermissions(data.permissions || []);
      setAssignedIds(data.assigned_ids || []);
      setPermissionsReadOnly(!!data.permissions_read_only);
      setUseCustomPermissions(!!data.use_custom_permissions);
      const yl = Array.isArray(data.year_levels) ? data.year_levels : [];
      setYearLevels(yl);
      const catalogIds = [...new Set(yl.map((r) => Number(r.year_level_id)))].filter(Number.isFinite).sort(
        (a, b) => a - b
      );
      const userOverride = data.evaluation_year_level_ids_user_override;
      const effective = data.evaluation_year_level_ids_effective;
      let selected = [];
      if (userOverride !== null && userOverride !== undefined) {
        selected = (Array.isArray(userOverride) ? userOverride : []).map(Number).filter(Number.isFinite);
      } else if (effective === null || effective === undefined) {
        selected = catalogIds;
      } else {
        selected = (Array.isArray(effective) ? effective : []).map(Number).filter(Number.isFinite);
      }
      setEvalYearLevelSelectedIds([...new Set(selected)].sort((a, b) => a - b));
    } catch (err) {
      setError('Failed to load permissions for user');
      setPermissions([]);
      setAssignedIds([]);
      setPermissionsReadOnly(false);
      setUseCustomPermissions(false);
      setYearLevels([]);
      setEvalYearLevelSelectedIds([]);
      swalError('Could not load permissions', 'Failed to load permissions for this user.');
    } finally {
      setLoading(false);
    }
  };

  const toggleEvalYearLevel = (yearLevelId) => {
    if (permissionsReadOnly) return;
    const n = Number(yearLevelId);
    if (!Number.isFinite(n)) return;
    setEvalYearLevelSelectedIds((prev) => {
      const has = prev.some((id) => Number(id) === n);
      if (has) return prev.filter((id) => Number(id) !== n);
      return [...prev, n].sort((a, b) => Number(a) - Number(b));
    });
  };

  const handleTogglePermission = (permissionId) => {
    if (permissionsReadOnly) return;
    const n = Number(permissionId);
    setAssignedIds((prev) =>
      prev.some((id) => Number(id) === n)
        ? prev.filter((id) => Number(id) !== n)
        : [...prev, n]
    );
  };

  const applyModuleAccessTier = (allModuleIds, viewTierIds, tier, promoteTierIds = []) => {
    if (permissionsReadOnly) return;
    const allNum = [...new Set(allModuleIds.map(Number))];
    const viewNum = [...new Set(viewTierIds.map(Number))];
    const promoteNum = [...new Set(promoteTierIds.map(Number))];
    setAssignedIds((prev) => {
      const without = prev.filter((id) => !allNum.includes(Number(id)));
      if (tier === 'none') return without;
      if (tier === 'view') return [...without, ...viewNum];
      if (tier === 'promote') return [...without, ...promoteNum];
      if (tier === 'full') return [...without, ...allNum];
      return without;
    });
  };

  const handleSavePermissions = async () => {
    if (!selectedUser || permissionsReadOnly) return;
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const evalPayload =
        yearLevels.length > 0 ? [...new Set(evalYearLevelSelectedIds.map(Number))].sort((a, b) => a - b) : undefined;
      await permissionService.syncUserPermissions(selectedUser.user_id, assignedIds, evalPayload);
      await fetchPermissionsForUser(selectedUser.user_id);
      const savedId = Number(selectedUser.user_id);
      const myId = user?.user_id != null ? Number(user.user_id) : NaN;
      if (Number.isFinite(savedId) && Number.isFinite(myId) && savedId === myId) {
        await refreshUser();
      }
      setSuccess('Permissions saved for this user only.');
      swalToast('success', 'Permissions saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      const msg = err?.message || err?.error || 'Failed to save permissions';
      setError(msg);
      swalError('Save failed', typeof msg === 'string' ? msg : 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToRole = async () => {
    if (!selectedUser || permissionsReadOnly) return;
    const confirmed = await swalConfirm(
      'Reset to role defaults?',
      'This removes custom permissions for this user. They will use their role’s permissions again.',
      'Reset',
      'Cancel'
    );
    if (!confirmed) return;
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      await permissionService.resetUserPermissionsToRole(selectedUser.user_id);
      await fetchPermissionsForUser(selectedUser.user_id);
      const savedId = Number(selectedUser.user_id);
      const myId = user?.user_id != null ? Number(user.user_id) : NaN;
      if (Number.isFinite(savedId) && Number.isFinite(myId) && savedId === myId) {
        await refreshUser();
      }
      swalToast('success', 'Reset to role defaults');
    } catch (err) {
      const msg = err?.message || err?.error || 'Failed to reset';
      swalError('Reset failed', typeof msg === 'string' ? msg : 'Failed to reset');
    } finally {
      setSaving(false);
    }
  };

  const modulesByCategory = useMemo(() => {
    const buckets = {};
    permissions.forEach((p) => {
      const name = p.permission_name || '';
      if (HIDDEN_PERMISSION_NAMES.has(name)) return;
      const mk = moduleKeyFromPermissionName(name);
      if (HIDDEN_MODULE_KEYS.has(mk)) return;
      if (!buckets[mk]) buckets[mk] = [];
      buckets[mk].push(p);
    });
    Object.keys(buckets).forEach((k) => {
      buckets[k].sort((a, b) =>
        (a.permission_name || '').localeCompare(b.permission_name || '')
      );
    });
    const moduleCategory = {};
    Object.entries(buckets).forEach(([mk, perms]) => {
      const dotted = perms.find((x) => (x.permission_name || '').includes('.'));
      moduleCategory[mk] = dotted?.category || perms[0]?.category || 'Other';
    });
    const byCat = {};
    Object.entries(buckets).forEach(([mk, perms]) => {
      const cat = moduleCategory[mk] || 'Other';
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push([mk, perms]);
    });
    const out = {};
    Object.entries(byCat).forEach(([category, entries]) => {
      out[category] = entries.sort(([a], [b]) =>
        formatModuleLabel(a).localeCompare(formatModuleLabel(b))
      );
    });
    return out;
  }, [permissions]);

  const permissionCategoryEntries = useMemo(() => {
    const entries = Object.entries(modulesByCategory).flatMap(([, moduleEntries]) => moduleEntries);
    const regularEntries = entries
      .filter(([moduleKey]) => !isLookupModuleKey(moduleKey))
      .sort(([a], [b]) => formatModuleLabel(a).localeCompare(formatModuleLabel(b)));
    const lookupEntries = entries
      .filter(([moduleKey]) => isLookupModuleKey(moduleKey))
      .sort(([a], [b]) => formatModuleLabel(a).localeCompare(formatModuleLabel(b)));

    const sections = regularEntries.map(([moduleKey, perms]) => [
      `module:${moduleKey}`,
      [[moduleKey, perms]],
    ]);
    if (lookupEntries.length > 0) {
      sections.push([LOOKUP_DATA_CATEGORY, lookupEntries]);
    }

    const sectionLabel = ([category, moduleEntries]) =>
      category === LOOKUP_DATA_CATEGORY
        ? LOOKUP_DATA_LABEL
        : formatModuleLabel(moduleEntries[0]?.[0] || category);

    return sections.sort((a, b) => sectionLabel(a).localeCompare(sectionLabel(b)));
  }, [modulesByCategory]);

  const [expandedModules, setExpandedModules] = useState({});
  const [lookupDataExpanded, setLookupDataExpanded] = useState(false);
  const moduleStorageKey = (category, moduleKey) => `${category}::${moduleKey}`;

  const isModuleExpanded = (category, moduleKey, permCount) => {
    if (permCount <= 1) return true;
    const k = moduleStorageKey(category, moduleKey);
    return expandedModules[k] === true;
  };

  const toggleModuleExpanded = (category, moduleKey) => {
    const k = moduleStorageKey(category, moduleKey);
    setExpandedModules((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const userLabel = (u) => userDisplayName(u) || u?.email || `User #${u?.user_id}`;
  const roleLabel = (u) => u?.role?.role_name || u?.role_name || '—';
  const departmentLabel = (u) => userDepartmentName(u) || '—';
  const formatUserOption = (u) => {
    const name = userDisplayName(u);
    const role = roleLabel(u);
    const dept = departmentLabel(u);
    return [
      name || u.email || `User #${u.user_id}`,
      u.email && name ? u.email : null,
      role !== '—' ? role : null,
      dept !== '—' ? dept : null,
    ]
      .filter(Boolean)
      .join(' · ');
  };

  const pickUser = (u) => {
    setSelectedUser(u);
    setUserSearch('');
    setUserPickerOpen(false);
  };

  const clearPickedUser = () => {
    setSelectedUser(null);
    setUserSearch('');
    setUserPickerOpen(false);
  };

  const roleFilterOptions = useMemo(() => {
    const names = new Set();
    users.forEach((u) => {
      const role = roleLabel(u);
      if (role && role !== '—') names.add(role);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      const role = roleLabel(u);
      if (roleFilter !== 'all' && role !== roleFilter) return false;
      if (!q) return true;
      const email = String(u?.email || '').toLowerCase();
      const name = userDisplayName(u).toLowerCase();
      const dept = userDepartmentName(u).toLowerCase();
      return (
        email.includes(q) ||
        name.includes(q) ||
        dept.includes(q) ||
        role.toLowerCase().includes(q)
      );
    });
  }, [users, userSearch, roleFilter]);

  if (loading && users.length === 0) {
    return (
      <div className="role-settings">
        <div className="role-settings-loading">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="role-settings">
      <div className="role-settings-header">
        <h2>User permissions</h2>
        <p className="role-settings-subtitle">
          Give each staff member the modules they need. Changes apply only to the person you pick.
        </p>
      </div>

      {error && <div className="role-settings-error">{error}</div>}
      {success && <div className="role-settings-success">{success}</div>}

      <section className="role-settings-section" aria-labelledby="choose-user-heading">
        <h3 id="choose-user-heading" className="role-settings-section-title">Choose a user</h3>
        <p className="role-settings-section-hint">Type a name or email to find them faster.</p>
        <div className="role-user-picker">
          <div className="role-user-picker-row">
            <div className="role-user-combobox" ref={userPickerRef}>
              <div className="role-user-combobox__control">
                <input
                  id="role-users-search"
                  type="text"
                  className="role-users-search role-user-combobox__input"
                  placeholder={selectedUser ? formatUserOption(selectedUser) : 'Select a user…'}
                  value={
                    userPickerOpen
                      ? userSearch
                      : selectedUser
                        ? formatUserOption(selectedUser)
                        : userSearch
                  }
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setUserPickerOpen(true);
                    if (selectedUser) setSelectedUser(null);
                  }}
                  onFocus={() => {
                    setUserPickerOpen(true);
                    if (selectedUser) setUserSearch('');
                  }}
                  onClick={() => setUserPickerOpen(true)}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={userPickerOpen}
                  aria-controls="role-users-listbox"
                  aria-autocomplete="list"
                  aria-label="Search and select a user"
                />
                {selectedUser && !userPickerOpen ? (
                  <button
                    type="button"
                    className="role-user-combobox__clear"
                    onClick={clearPickedUser}
                    aria-label="Clear selected user"
                  >
                    ×
                  </button>
                ) : (
                  <span className="role-user-combobox__chevron" aria-hidden>
                    ▾
                  </span>
                )}
              </div>
              {userPickerOpen && (
                <ul
                  id="role-users-listbox"
                  className="role-user-combobox__list"
                  role="listbox"
                >
                  {filteredUsers.length === 0 ? (
                    <li className="role-user-combobox__empty" role="presentation">
                      {users.length === 0 ? 'No users found' : 'No users match your search'}
                    </li>
                  ) : (
                    filteredUsers.map((u) => {
                      const active =
                        selectedUser &&
                        String(selectedUser.user_id) === String(u.user_id);
                      return (
                        <li key={u.user_id} role="option" aria-selected={active}>
                          <button
                            type="button"
                            className={
                              active
                                ? 'role-user-combobox__option is-active'
                                : 'role-user-combobox__option'
                            }
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickUser(u)}
                          >
                            <span className="role-user-combobox__option-name">
                              {userDisplayName(u) || u.email || `User #${u.user_id}`}
                            </span>
                            <span className="role-user-combobox__option-meta">
                              {[
                                u.email && userDisplayName(u) ? u.email : null,
                                roleLabel(u) !== '—' ? roleLabel(u) : null,
                                departmentLabel(u) !== '—' ? departmentLabel(u) : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </div>
            <select
              id="role-users-filter"
              className="role-users-filter"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter users by role"
            >
              <option value="all">All roles</option>
              {roleFilterOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section
        className={`role-settings-section role-settings-section--permissions${
          selectedUser && !permissionsReadOnly ? ' role-settings-section--permissions-float-pad' : ''
        }`}
        aria-labelledby="set-permissions-heading"
      >
        <div className="role-settings-section-head">
          <h3 id="set-permissions-heading" className="role-settings-section-title">Set permissions</h3>
        </div>
        {selectedUser ? (

            <>
              <p className="permissions-for-label">
                <span className="permissions-for-name">{userLabel(selectedUser)}</span>
                {selectedUser.email && userDisplayName(selectedUser) ? (
                  <span className="permissions-user-email"> ({selectedUser.email})</span>
                ) : null}
                {roleLabel(selectedUser) !== '—' && (
                  <span className="permissions-user-role"> — {roleLabel(selectedUser)}</span>
                )}
                {departmentLabel(selectedUser) !== '—' && (
                  <span className="permissions-user-dept"> · {departmentLabel(selectedUser)}</span>
                )}
                {useCustomPermissions && !permissionsReadOnly && (
                  <span className="permissions-custom-badge"> Custom</span>
                )}
              </p>
              {permissionsReadOnly && (
                <p className="role-settings-permissions-hint role-settings-readonly-note">
                  Admin accounts always have full access. Permission rows are shown for reference only.
                </p>
              )}
              {loading ? (
                <div className="role-settings-loading">Loading permissions...</div>
              ) : (
                <div className="permissions-list">
                  {permissionCategoryEntries.map(([category, moduleEntries]) => {
                    const isLookupCategory = category === LOOKUP_DATA_CATEGORY;
                    const allLookupIds = isLookupCategory
                      ? [
                          ...new Set(
                            moduleEntries.flatMap(([, perms]) =>
                              perms.map((p) => Number(p.permission_id))
                            )
                          ),
                        ]
                      : [];
                    const assignedLookupCount = isLookupCategory
                      ? assignedIds.filter((id) => allLookupIds.includes(Number(id))).length
                      : 0;
                    const lookupAllChecked =
                      isLookupCategory &&
                      allLookupIds.length > 0 &&
                      assignedLookupCount === allLookupIds.length;
                    const lookupIndeterminate =
                      isLookupCategory &&
                      assignedLookupCount > 0 &&
                      !lookupAllChecked;

                    return (
                    <div
                      key={category}
                      className={
                        isLookupCategory
                          ? 'permission-category permission-category-lookup'
                          : 'permission-category'
                      }
                    >
                      {isLookupCategory && (
                        <div className="permission-module-toggle permission-lookup-toggle">
                          <button
                            type="button"
                            className="permission-lookup-expand-button"
                            onClick={() => setLookupDataExpanded((v) => !v)}
                            aria-expanded={lookupDataExpanded}
                          >
                            <span className="permission-module-chevron" aria-hidden>
                              {lookupDataExpanded ? '▼' : '▶'}
                            </span>
                            <span className="permission-module-title">{LOOKUP_DATA_LABEL}</span>
                          </button>
                          {!permissionsReadOnly && allLookupIds.length > 0 && (
                            <label className="permission-category-lookup-master">
                              <input
                                type="checkbox"
                                checked={lookupAllChecked}
                                ref={(el) => {
                                  if (el) el.indeterminate = lookupIndeterminate;
                                }}
                                onChange={(e) => {
                                  const on = e.target.checked;
                                  setAssignedIds((prev) => {
                                    const without = prev.filter(
                                      (id) => !allLookupIds.includes(Number(id))
                                    );
                                    if (!on) return without;
                                    return [...without, ...allLookupIds];
                                  });
                                }}
                              />
                              <span>All lookup data</span>
                            </label>
                          )}
                        </div>
                      )}
                      {(!isLookupCategory || lookupDataExpanded) && (
                        <div className={isLookupCategory ? 'permission-lookup-modules' : undefined}>
                      {moduleEntries.map(([moduleKey, perms]) => {
                        const multi = perms.length > 1;
                        const open = isModuleExpanded(category, moduleKey, perms.length);
                        const allIds = perms.map((p) => Number(p.permission_id));
                        const viewTierIds = getViewTierPermissionIds(moduleKey, perms);
                        const promoteTierIds = getPromoteTierPermissionIds(moduleKey, perms);
                        const importOnlyIds = getImportOnlyPermissionIds(moduleKey, perms);
                        const isImportExportModule = moduleKey === 'data';
                        const useTierUi = multi && viewTierIds.length > 0;
                        const anyAssignedInModule = assignedIds.some((id) =>
                          allIds.includes(Number(id))
                        );
                        const tierUiClass = `permission-module permission-module-tier ${
                          anyAssignedInModule ? 'is-enabled' : 'is-disabled'
                        }`;
                        const uid = selectedUser.user_id;

                        if (perms.length === 1) {
                          const p = perms[0];
                          const pid = Number(p.permission_id);
                          const checked = assignedIds.some((id) => Number(id) === pid);
                          return (
                            <div
                              key={`${category}-${moduleKey}`}
                              className={tierUiClass}
                            >
                              <div className="permission-tier-parent-row">
                                <label className="permission-tier-parent-label">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={permissionsReadOnly}
                                    onChange={() => handleTogglePermission(p.permission_id)}
                                  />
                                  <span className="permission-tier-parent-title">
                                    {formatModuleLabel(moduleKey)}
                                  </span>
                                </label>
                              </div>
                            </div>
                          );
                        }

                        if (useTierUi) {
                          const assignedInModule = assignedIds
                            .map(Number)
                            .filter((id) => allIds.includes(id));
                          const moduleEnabled = assignedInModule.length > 0;
                          let tier = 'none';
                          if (moduleEnabled) {
                            if (sameIdSet(assignedInModule, allIds)) tier = 'full';
                            else if (sameIdSet(assignedInModule, viewTierIds)) tier = 'view';
                            else if (importOnlyIds.length > 0 && sameIdSet(assignedInModule, importOnlyIds)) {
                              tier = 'import';
                            } else if (promoteTierIds.length > 0) {
                              const assignedNames = perms
                                .filter((p) => assignedInModule.includes(Number(p.permission_id)))
                                .map((p) => p.permission_name);
                              const canPromote = assignedNames.includes('evaluation.promote');
                              const hasFullOnly = assignedNames.some(isFullAccessOnlyEvaluationPermission);
                              tier = canPromote && !hasFullOnly ? 'promote' : 'mixed';
                            } else tier = 'mixed';
                          }
                          const nestedKey = `${category}::tier_nested::${moduleKey}::${uid}`;
                          const nestedOpen =
                            expandedModules[nestedKey] === undefined
                              ? moduleEnabled
                              : expandedModules[nestedKey];
                          const radioName = `module-tier-${uid}-${category}-${moduleKey}`;
                          return (
                            <div key={`${category}-${moduleKey}-tier`} className={tierUiClass}>
                              <div className="permission-tier-parent-row">
                                <label className="permission-tier-parent-label">
                                  <input
                                    type="checkbox"
                                    checked={moduleEnabled}
                                    disabled={permissionsReadOnly}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        applyModuleAccessTier(allIds, viewTierIds, 'view');
                                        setExpandedModules((prev) => ({
                                          ...prev,
                                          [nestedKey]: true,
                                        }));
                                      } else {
                                        applyModuleAccessTier(allIds, viewTierIds, 'none');
                                      }
                                    }}
                                  />
                                  <span className="permission-tier-parent-title">
                                    {formatModuleLabel(moduleKey)}
                                  </span>
                                </label>
                                <button
                                  type="button"
                                  className="permission-tier-chevron"
                                  aria-expanded={nestedOpen}
                                  aria-label={
                                    nestedOpen ? 'Collapse access options' : 'Expand access options'
                                  }
                                  disabled={!moduleEnabled || permissionsReadOnly}
                                  onClick={() =>
                                    setExpandedModules((prev) => ({
                                      ...prev,
                                      [nestedKey]: !prev[nestedKey],
                                    }))
                                  }
                                >
                                  {nestedOpen ? '▼' : '▶'}
                                </button>
                              </div>
                              {moduleEnabled && nestedOpen && (
                                <div
                                  className="permission-tier-nested"
                                  role="group"
                                  aria-label={`${formatModuleLabel(moduleKey)} access level`}
                                >
                                  <label className="permission-tier-radio-label">
                                    <input
                                      type="radio"
                                      name={radioName}
                                      checked={tier === 'view'}
                                      disabled={permissionsReadOnly}
                                      onChange={() =>
                                        applyModuleAccessTier(allIds, viewTierIds, 'view')
                                      }
                                    />
                                    <span>{isImportExportModule ? 'EXPORT ONLY' : 'VIEW ONLY'}</span>
                                  </label>
                                  {importOnlyIds.length > 0 && (
                                    <label className="permission-tier-radio-label">
                                      <input
                                        type="radio"
                                        name={radioName}
                                        checked={tier === 'import'}
                                        disabled={permissionsReadOnly}
                                        onChange={() =>
                                          applyModuleAccessTier(allIds, importOnlyIds, 'view')
                                        }
                                      />
                                      <span>IMPORT ONLY</span>
                                    </label>
                                  )}
                                  {promoteTierIds.length > 0 && (
                                    <label
                                      className="permission-tier-radio-label"
                                      title="Can promote students to the next semester but cannot add or edit grades"
                                    >
                                      <input
                                        type="radio"
                                        name={radioName}
                                        checked={tier === 'promote'}
                                        disabled={permissionsReadOnly}
                                        onChange={() =>
                                          applyModuleAccessTier(
                                            allIds,
                                            viewTierIds,
                                            'promote',
                                            promoteTierIds
                                          )
                                        }
                                      />
                                      <span>PROMOTE ONLY (no grade editing)</span>
                                    </label>
                                  )}
                                  <label className="permission-tier-radio-label">
                                    <input
                                      type="radio"
                                      name={radioName}
                                      checked={tier === 'full'}
                                      disabled={permissionsReadOnly}
                                      onChange={() =>
                                        applyModuleAccessTier(allIds, viewTierIds, 'full')
                                      }
                                    />
                                    <span>
                                      {isImportExportModule
                                        ? 'FULL ACCESS (import + export)'
                                        : moduleKey === 'curriculum'
                                          ? 'FULL ACCESS (includes Curriculum headers)'
                                          : 'FULL ACCESS'}
                                    </span>
                                  </label>
                                  {moduleKey === 'evaluation' && yearLevels.length > 0 && (
                                    <div className="permission-eval-year-nested">
                                      <div className="permission-eval-year-checkboxes">
                                        {yearLevels.map((yl) => {
                                          const id = Number(yl.year_level_id);
                                          const checked = evalYearLevelSelectedIds.some(
                                            (x) => Number(x) === id
                                          );
                                          return (
                                            <label
                                              key={id}
                                              className="permission-checkbox-label permission-eval-year-label"
                                            >
                                              <input
                                                type="checkbox"
                                                checked={checked}
                                                disabled={permissionsReadOnly}
                                                onChange={() => toggleEvalYearLevel(id)}
                                              />
                                              <span className="permission-name">
                                                {yl.year_level || `Year level #${id}`}
                                              </span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        }

                        return (
                          <div
                            key={`${category}-${moduleKey}`}
                            className={`${
                              multi ? 'permission-module' : 'permission-module permission-module-single'
                            } ${anyAssignedInModule ? 'is-enabled' : 'is-disabled'}`}
                          >
                            {multi && (
                              <button
                                type="button"
                                className="permission-module-toggle"
                                onClick={() => toggleModuleExpanded(category, moduleKey)}
                                aria-expanded={open}
                                disabled={permissionsReadOnly}
                              >
                                <span className="permission-module-chevron" aria-hidden>
                                  {open ? '▼' : '▶'}
                                </span>
                                <span className="permission-module-title">
                                  {formatModuleLabel(moduleKey)}
                                </span>
                              </button>
                            )}
                            <ul
                              className={
                                multi
                                  ? `permission-module-items${open ? ' is-open' : ' is-collapsed'}`
                                  : 'permission-module-items permission-module-items-flat'
                              }
                            >
                              {perms.map((p) => {
                                const name = p.permission_name || '';
                                const actionLabel = formatPermissionActionLabel(name, moduleKey, multi);
                                return (
                                  <li
                                    key={p.permission_id}
                                    className={
                                      assignedIds.some((id) => Number(id) === Number(p.permission_id))
                                        ? 'permission-item permission-item-portal'
                                        : 'permission-item'
                                    }
                                  >
                                    <label className="permission-checkbox-label">
                                      <input
                                        type="checkbox"
                                        disabled={permissionsReadOnly}
                                        checked={assignedIds.some(
                                          (id) => Number(id) === Number(p.permission_id)
                                        )}
                                        onChange={() => handleTogglePermission(p.permission_id)}
                                      />
                                      {actionLabel ? (
                                        <span className="permission-name permission-name-crud">
                                          <span className="permission-crud-action">{actionLabel}</span>
                                        </span>
                                      ) : (
                                        <span className="permission-name">
                                          {displayPermissionName(name)}
                                        </span>
                                      )}
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })}
                        </div>
                      )}
                    </div>
                    );
                  })}
                  {permissions.length === 0 && (
                    <p className="no-data">No permissions defined.</p>
                  )}
                </div>
              )}
            </>
        ) : (
          <p className="permissions-placeholder">
            Pick a user above first. Their modules will show up here.
          </p>
        )}
      </section>

      {selectedUser && !permissionsReadOnly ? (
        <div className="role-permissions-float" role="toolbar" aria-label="Permission actions">
          <button
            type="button"
            className="role-reset-button"
            onClick={handleResetToRole}
            disabled={saving || !useCustomPermissions}
            title={
              useCustomPermissions
                ? 'Clear custom list and use role defaults'
                : 'Already using role defaults'
            }
          >
            Reset to role
          </button>
          <button
            type="button"
            className="role-save-button"
            onClick={handleSavePermissions}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save permissions'}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default RoleSettings;
