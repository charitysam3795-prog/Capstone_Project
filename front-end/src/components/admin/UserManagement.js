import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { swalConfirm, swalToast, swalError, swalInfo } from '../../utils/swal';
import {
  digitsOnlyContact,
  findUnsafeFormField,
  validateContactNumber,
} from '../../utils/inputValidation';
import useRecoverableFormDraft from '../../hooks/useRecoverableFormDraft';
import useDialogFocus from '../../hooks/useDialogFocus';
import { recoverableDraftKey } from '../../utils/networkRecoverability';
import SearchableSelect from '../common/SearchableSelect';
import ClientPaginationBar from '../common/ClientPaginationBar';
import './UserManagement.css';

function isStudentRoleName(name) {
  return String(name || '').trim().toLowerCase() === 'student';
}

function studentProfileOf(user) {
  return user?.studentProfile || user?.student_profile || null;
}

function studentDisplayName(user) {
  const profile = studentProfileOf(user);
  if (!profile) return '';
  const last = String(profile.last_name || '').trim();
  const first = String(profile.first_name || '').trim();
  const middle = String(profile.middle_name || '').trim();
  return [last ? `${last},` : '', first, middle].filter(Boolean).join(' ').trim();
}

function studentIdNumberOf(user) {
  const profile = studentProfileOf(user);
  return String(profile?.student_id_number || profile?.student_number || '').trim();
}

function isAdminRoleName(name) {
  return String(name || '').trim().toLowerCase() === 'admin';
}

function getProgramOptionValue(program) {
  return program?.program_id ?? program?.id ?? '';
}

function getProgramOptionLabel(program) {
  const name = program?.program_name || program?.name || 'Unnamed Program';
  const code = program?.program_code || program?.code || '';
  return code ? `${name} (${code})` : name;
}

function isInformationTechnologyProgram(program) {
  if (!program) return false;
  const code = String(program.program_code || program.code || '').trim().toUpperCase();
  const name = String(program.program_name || program.name || '').trim().toLowerCase();
  return code === 'BSIT' || name.includes('information technology');
}

/** Admin User Management: only require a non-empty password when creating. Strength rules apply on first login / self-service change. */
function getAdminDirectoryPasswordError(password, { required = true } = {}) {
  const pwd = String(password || '');
  if (!pwd) {
    return required ? 'Password is required.' : '';
  }
  return '';
}

/** Default first-login password: first word of first name + 123 (e.g. John Cyrus -> john123). */
function buildDefaultStudentPassword(firstName) {
  const firstWord = String(firstName || '').trim().split(/\s+/).filter(Boolean)[0] || 'student';
  return `${firstWord.toLowerCase()}123`;
}

function isPlaceholderStudentEmail(email, studentIdNumber = '') {
  const value = String(email || '').trim().toLowerCase();
  const sid = String(studentIdNumber || '').trim().toLowerCase();
  if (!value) return true;
  if (value.endsWith('@student.local')) return true;
  if (sid && value === sid) return true;
  if (!value.includes('@')) return true;
  return false;
}

/**
 * @param {{ userScope?: 'staff' | 'students' }} props
 * staff — directory staff only (excludes Student role). students — Student role only.
 */
const UserManagement = ({ userScope = 'staff' }) => {
  const { user: sessionUser } = useAuth();
  const { hasAnyPermission, isAdmin } = usePermission();
  const sessionUserId = Number(sessionUser?.user_id ?? sessionUser?.id ?? NaN);

  const canCreateUsers = useMemo(() => {
    if (isAdmin) return true;
    if (userScope === 'students') {
      return hasAnyPermission(['Student Management', 'students.create', 'students.enroll']);
    }
    return hasAnyPermission(['User Management', 'users.create']);
  }, [isAdmin, userScope, hasAnyPermission]);

  const canEditUsers = useMemo(() => {
    if (isAdmin) return true;
    if (userScope === 'students') {
      return hasAnyPermission(['Student Management', 'students.edit']);
    }
    return hasAnyPermission(['User Management', 'users.edit', 'users.manage_roles']);
  }, [isAdmin, userScope, hasAnyPermission]);

  const canChangeUserStatus = useMemo(() => {
    if (isAdmin) return true;
    if (userScope === 'students') {
      return hasAnyPermission(['Student Management', 'students.edit']);
    }
    // View-only has users.view only — deactivate needs edit or delete.
    return hasAnyPermission(['User Management', 'users.edit', 'users.delete']);
  }, [isAdmin, userScope, hasAnyPermission]);

  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [yearLevels, setYearLevels] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [passwordFieldError, setPasswordFieldError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const modalRef = useRef(null);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(10);

  const userFormDraftKey = showModal
    ? recoverableDraftKey([
        'user-form',
        userScope,
        editingUser
          ? String(editingUser.user_id ?? editingUser.student_id ?? 'edit')
          : 'new',
      ])
    : '';

  const { clearDraft: clearUserFormDraft } = useRecoverableFormDraft({
    draftKey: userFormDraftKey,
    formData,
    setFormData,
    enabled: showModal && Boolean(userFormDraftKey),
  });

  const assignableRoles = useMemo(() => {
    if (userScope === 'staff') {
      const editingRoleId = editingUser?.role_id ?? '';
      return roles.filter((r) => {
        const roleName = r.role_name || r.name;
        const roleId = r.id || r.role_id;
        if (isStudentRoleName(roleName)) return false;
        // Evaluator was merged into Adviser and voided — hide from assignment lists.
        if (String(roleName || '').trim().toLowerCase() === 'evaluator') return false;
        if (isAdminRoleName(roleName)) {
          return editingRoleId && String(roleId) === String(editingRoleId);
        }
        return true;
      });
    }
    if (userScope === 'students') {
      return roles.filter((r) => isStudentRoleName(r.role_name || r.name));
    }
    return roles.filter(
      (r) => String(r.role_name || r.name || '').trim().toLowerCase() !== 'evaluator',
    );
  }, [roles, userScope, editingUser]);

  const programOptions = useMemo(
    () =>
      programs
        .map((program) => ({
          value: String(getProgramOptionValue(program)),
          label: getProgramOptionLabel(program),
        }))
        .filter((option) => option.value),
    [programs]
  );

  const departmentOptions = useMemo(
    () =>
      departments
        .map((department) => {
          const id = department.department_id ?? department.id ?? '';
          const name = department.department_name || department.name || 'Unnamed Department';
          const code = department.department_code || department.code || '';
          return {
            value: String(id),
            label: code ? `${name} (${code})` : name,
          };
        })
        .filter((option) => option.value),
    [departments]
  );

  const formatAxiosError = (err) => {
    const data = err?.response?.data;
    if (!data) return err?.message || 'Request failed';

    if (data.messages && typeof data.messages === 'object') {
      // Laravel validation: { error: 'Validation failed', messages: { field: [msg] } }
      const flat = Object.values(data.messages).flat().filter(Boolean);
      if (flat.length) return flat.join('\n');
    }

    return data.message || data.error || err.message || 'Request failed';
  };

  useEffect(() => {
    fetchUsers();
    // Secondary lookups: skip global blocking loader so they don't stack
    // behind /users on PHP's single-threaded `artisan serve`.
    fetchRoles();
    fetchPrograms();
    fetchDepartments();
    fetchProfileOptions();
  }, []);

  const fetchProfileOptions = async () => {
    try {
      const response = await api.get('/students/profile-options', { skipLoading: true });
      setYearLevels(response.data?.year_levels || []);
      setTracks(response.data?.tracks || []);
    } catch (err) {
      console.warn('Could not fetch student profile options:', err);
      setYearLevels([]);
      setTracks([]);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await api.get(userScope === 'students' ? '/students/directory' : '/users');
      const usersData = response.data || [];
      setUsers(usersData);
      setFilteredUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
      setError(userScope === 'students' ? 'Failed to fetch students' : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  // Filter and search users
  useEffect(() => {
    let filtered = [...users];

    if (userScope === 'staff') {
      filtered = filtered.filter(
        (u) => !isStudentRoleName(u.role?.role_name || u.role?.name)
      );
    } else if (userScope === 'students') {
      filtered = filtered.filter((u) =>
        isStudentRoleName(u.role?.role_name || u.role?.name)
      );
    }

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((user) =>
        (user.email && user.email.toLowerCase().includes(term)) ||
        (user.contact_number && user.contact_number.includes(term)) ||
        (user.role && user.role.role_name && user.role.role_name.toLowerCase().includes(term)) ||
        (user.program?.program_name &&
          user.program.program_name.toLowerCase().includes(term)) ||
        (user.faculty_profile?.program?.program_name &&
          user.faculty_profile.program.program_name.toLowerCase().includes(term)) ||
        (user.facultyProfile?.program?.program_name &&
          user.facultyProfile.program.program_name.toLowerCase().includes(term)) ||
        studentDisplayName(user).toLowerCase().includes(term) ||
        studentIdNumberOf(user).toLowerCase().includes(term)
      );
    }

    // Apply role filter
    if (roleFilter) {
      filtered = filtered.filter(user => 
        user.role_id && user.role_id.toString() === roleFilter
      );
    }

    // Apply status filter
    if (statusFilter) {
      filtered = filtered.filter(user => 
        (user.status || 'active').toLowerCase() === statusFilter.toLowerCase()
      );
    }

    setFilteredUsers(filtered);
  }, [users, searchTerm, roleFilter, statusFilter, userScope]);

  useEffect(() => {
    setListPage(1);
  }, [searchTerm, roleFilter, statusFilter, userScope]);

  const listTotalPages = Math.max(1, Math.ceil(filteredUsers.length / listPageSize));
  const safeListPage = Math.min(listPage, listTotalPages);
  const pagedUsers = useMemo(() => {
    const start = (safeListPage - 1) * listPageSize;
    return filteredUsers.slice(start, start + listPageSize);
  }, [filteredUsers, safeListPage, listPageSize]);

  const fetchRoles = async () => {
    const normalizeRoles = (payload) =>
      Array.isArray(payload) ? payload : (payload?.data || payload || []);

    // Dean / Student Management users may lack Lookup Data access; directory roles always work.
    if (userScope === 'students') {
      try {
        const response = await api.get('/users/roles/list', { skipLoading: true });
        setRoles(normalizeRoles(response.data));
        return;
      } catch (error) {
        console.warn('Could not fetch roles from /users/roles/list:', error);
      }
    }

    try {
      const response = await api.get('/lookup/roles', { skipLoading: true });
      setRoles(normalizeRoles(response.data));
    } catch (error) {
      console.warn('Could not fetch roles from /lookup/roles, trying /users/roles/list:', error);
      try {
        const fallbackResponse = await api.get('/users/roles/list', { skipLoading: true });
        setRoles(normalizeRoles(fallbackResponse.data));
      } catch (fallbackError) {
        console.warn('Could not fetch roles from fallback endpoint:', fallbackError);
      }
    }
  };

  const fetchPrograms = async () => {
    const normalizePrograms = (payload) => {
      const rows = Array.isArray(payload) ? payload : (payload?.data || payload?.programs || payload || []);
      return Array.isArray(rows) ? rows : [];
    };

    try {
      const response = await api.get('/lookup/programs', { skipLoading: true });
      setPrograms(normalizePrograms(response.data));
    } catch (error) {
      console.warn('Could not fetch programs from /lookup/programs, trying /profile/options:', error);
      try {
        const fallbackResponse = await api.get('/profile/options', { skipLoading: true });
        setPrograms(normalizePrograms(fallbackResponse.data?.programs));
      } catch (fallbackError) {
        console.warn('Could not fetch programs from fallback endpoint:', fallbackError);
      }
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/lookup/departments', { skipLoading: true });
      const departmentData = Array.isArray(response.data) ? response.data : (response.data?.data || response.data || []);
      setDepartments(departmentData);
    } catch (error) {
      console.warn('Could not fetch departments:', error);
      setDepartments([]);
    }
  };

  const studentRoleRecord = useMemo(
    () => roles.find((r) => isStudentRoleName(r.role_name || r.name)),
    [roles],
  );

  const resolveStudentRoleId = () => {
    const fromForm = formData.role_id;
    if (fromForm) return String(fromForm);
    // Only Student Management may default to the Student role when the form is blank.
    if (userScope !== 'students') return '';
    const rid = studentRoleRecord?.role_id ?? studentRoleRecord?.id;
    return rid != null && rid !== '' ? String(rid) : '';
  };

  const isStudentRole = () => {
    if (userScope === 'staff') return false;
    const roleId = resolveStudentRoleId();
    if (!roleId) return userScope === 'students';
    const selectedRole = roles.find((r) => String(r.id || r.role_id) === String(roleId));
    const roleName = (selectedRole?.role_name || selectedRole?.name || '').toString().trim().toLowerCase();
    return roleName === 'student';
  };

  /** Student Management only. User Management (staff) never shows student profile fields. */
  const isStudentForm = () => userScope === 'students';
  /** Edit Student: only login email and password can change. */
  const lockStudentProfile = userScope === 'students' && Boolean(editingUser);

  const isDeanRole = () => {
    if (!formData.role_id) return false;
    const selectedRole = roles.find(r => String(r.id || r.role_id) === String(formData.role_id));
    const roleName = (selectedRole?.role_name || selectedRole?.name || '').toString().trim().toLowerCase();
    return roleName === 'dean';
  };

  const selectedRoleName = () => {
    if (!formData.role_id) return '';
    const selectedRole = roles.find(r => String(r.id || r.role_id) === String(formData.role_id));
    return (selectedRole?.role_name || selectedRole?.name || '').toString().trim();
  };

  const isProgramHeadRole = () => selectedRoleName().toLowerCase() === 'program head';

  const isEvaluatorProgramRole = () =>
    ['adviser'].includes(selectedRoleName().toLowerCase());

  /** Dean included: Dean Analytics always shows the dean's assigned program. */
  const isProgramAssignedStaffRole = () => isProgramHeadRole() || isEvaluatorProgramRole() || isDeanRole();

  const isDepartmentManagedRole = () => {
    if (!formData.role_id) return false;
    const selectedRole = roles.find(r => String(r.id || r.role_id) === String(formData.role_id));
    const roleName = (selectedRole?.role_name || selectedRole?.name || '').toString().trim().toLowerCase();
    return ['dean', 'program head', 'secretary'].includes(roleName);
  };

  /** Staff who sign in with Employee ID (email is for mail / reset only). */
  const isEmployeeIdLoginRole = () => {
    const roleName = selectedRoleName().toLowerCase();
    return ['dean', 'adviser', 'evaluator', 'program head', 'secretary'].includes(roleName);
  };

  const handleAdd = () => {
    if (!canCreateUsers) {
      swalError('View only', 'You do not have permission to add users.');
      return;
    }
    setEditingUser(null);
    setPasswordFieldError('');
    setShowPassword(false);
    const studentRole = roles.find((r) => isStudentRoleName(r.role_name || r.name));
    const sid = studentRole ? studentRole.role_id || studentRole.id : '';
    const studentAccess =
      studentRole && studentRole.access_level !== undefined && studentRole.access_level !== null
        ? String(studentRole.access_level)
        : '';
    setFormData({
      email: '',
      password: '',
      contact_number: '',
      role_id: userScope === 'students' && sid ? String(sid) : '',
      access_level_id: userScope === 'students' && studentAccess ? studentAccess : '',
      department_id: '',
      status: 'active',
      employee_id: '',
      // Student-specific fields
      student_id_number: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      address: '',
      age: '',
      academic_status: '',
      // Distinct from Regular/Irregular; set when creating the student account
      student_entry_type: '',
      current_program: '',
      year_level_id: '',
      track_id: '',
      // Legacy dean-specific field kept for backend compatibility
      program_id: '',
    });
    setShowModal(true);
  };

  const handleEdit = async (user) => {
    if (!canEditUsers) {
      swalError('View only', 'You do not have permission to edit users.');
      return;
    }
    setEditingUser(user);
    setPasswordFieldError('');
    const roleId = user.role_id || '';
    
    // Auto-populate access level from role if available
    let accessLevelId = '';
    if (roleId) {
      const userRole = roles.find(r => String(r.id || r.role_id) === String(roleId));
      if (userRole && userRole.access_level !== undefined) {
        accessLevelId = userRole.access_level;
      } else if (user.role && user.role.access_level !== undefined) {
        // Fallback: get from user.role if roles array doesn't have it yet
        accessLevelId = user.role.access_level;
      }
    }
    
    const formDataToSet = {
      email: isPlaceholderStudentEmail(user.email, studentIdNumberOf(user)) ? '' : (user.email || ''),
      password: '', // Don't pre-fill password for security
      contact_number: user.contact_number || '',
      role_id: roleId,
      access_level_id: accessLevelId,
      department_id:
        user.department_id ??
        user.department?.department_id ??
        user.faculty_profile?.department_id ??
        user.facultyProfile?.department_id ??
        user.faculty_profile?.department?.department_id ??
        user.facultyProfile?.department?.department_id ??
        user.program_head_profile?.department_id ??
        user.programHeadProfile?.department_id ??
        user.program_head_profile?.department?.department_id ??
        user.programHeadProfile?.department?.department_id ??
        user.secretary_profile?.department_id ??
        user.secretaryProfile?.department_id ??
        user.secretary_profile?.department?.department_id ??
        user.secretaryProfile?.department?.department_id ??
        user.dean_profile?.department_id ??
        user.deanProfile?.department_id ??
        user.dean_profile?.department?.department_id ??
        user.deanProfile?.department?.department_id ??
        '',
      status: user.status || 'active',
      employee_id:
        user.dean_profile?.employee_id ||
        user.deanProfile?.employee_id ||
        user.faculty_profile?.employee_id ||
        user.facultyProfile?.employee_id ||
        user.program_head_profile?.employee_id ||
        user.programHeadProfile?.employee_id ||
        user.secretary_profile?.employee_id ||
        user.secretaryProfile?.employee_id ||
        '',
      // Student-specific fields - initialize as empty
      student_id_number: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      address: '',
      age: '',
      academic_status: '',
      student_entry_type: '',
      current_program: '',
      year_level_id: '',
      track_id: '',
      program_id:
        user.program_id ??
        user.program?.program_id ??
        user.faculty_profile?.program_id ??
        user.facultyProfile?.program_id ??
        user.faculty_profile?.program?.program_id ??
        user.facultyProfile?.program?.program_id ??
        user.program_head_profile?.program_id ??
        user.programHeadProfile?.program_id ??
        user.program_head_profile?.program?.program_id ??
        user.programHeadProfile?.program?.program_id ??
        user.secretary_profile?.program_id ??
        user.secretaryProfile?.program_id ??
        user.secretary_profile?.program?.program_id ??
        user.secretaryProfile?.program?.program_id ??
        user.dean_profile?.program_id ??
        user.deanProfile?.program_id ??
        user.dean_profile?.program?.program_id ??
        user.deanProfile?.program?.program_id ??
        '',
    };

    const nestedProfile = studentProfileOf(user);
    if (nestedProfile) {
      formDataToSet.student_id_number = nestedProfile.student_id_number || nestedProfile.student_number || '';
      formDataToSet.first_name = nestedProfile.first_name || '';
      formDataToSet.middle_name = nestedProfile.middle_name || '';
      formDataToSet.last_name = nestedProfile.last_name || '';
      formDataToSet.address = nestedProfile.address || '';
      formDataToSet.academic_status = nestedProfile.academic_status || '';
      formDataToSet.student_entry_type = nestedProfile.student_entry_type || '';
      formDataToSet.current_program =
        nestedProfile.current_program || nestedProfile.Current_Program || nestedProfile.currentProgram || '';
      formDataToSet.year_level_id = nestedProfile.year_level_id || '';
      formDataToSet.track_id = nestedProfile.track_id || '';
      if (nestedProfile.contact_number && !formDataToSet.contact_number) {
        formDataToSet.contact_number = nestedProfile.contact_number;
      }
    }

    // If user is a student, fetch their student profile
    const isStudent = user.role && (user.role.role_name === 'Student' || user.role.name === 'Student');
    if (isStudent && user.user_id) {
      try {
        // Fetch student profile - we'll need to create an admin endpoint or use a workaround
        // For now, try to get it via the student endpoint with user_id in query
        const profileResponse = await api.get(`/students/profile?user_id=${user.user_id}`, { silent: true });
        if (profileResponse.data) {
          const profile = profileResponse.data;
          formDataToSet.student_id_number = profile.student_id_number || '';
          formDataToSet.first_name = profile.first_name || '';
          formDataToSet.middle_name = profile.middle_name || '';
          formDataToSet.last_name = profile.last_name || '';
          formDataToSet.address = profile.address || '';
          formDataToSet.academic_status = profile.academic_status || '';
          formDataToSet.student_entry_type = profile.student_entry_type || '';
          formDataToSet.current_program = profile.current_program || profile.Current_Program || profile.currentProgram || '';
          formDataToSet.year_level_id = profile.year_level_id || '';
          formDataToSet.track_id = profile.track_id || '';
        }
      } catch (error) {
        // If profile doesn't exist or error, continue with empty fields
        // Backend returns an empty object {} when profile doesn't exist,
        // so only warn for real errors (not 404).
        if (error?.response?.status !== 404) {
          console.warn('Could not fetch student profile:', error);
        }
      }
    }

    // If user is a dean, fetch their dean profile
    const isDean = user.role && (user.role.role_name === 'Dean' || user.role.name === 'Dean');
    if (isDean && user.user_id) {
      try {
        const deanResponse = await api.get(`/deans/profile?user_id=${user.user_id}`, { silent: true });
        if (deanResponse.data) {
          if (deanResponse.data.employee_id) {
            formDataToSet.employee_id = deanResponse.data.employee_id;
          }
          if (deanResponse.data.department_id) {
            formDataToSet.department_id = deanResponse.data.department_id;
          } else if (deanResponse.data.program?.department_id) {
            formDataToSet.department_id = deanResponse.data.program.department_id;
          }
          if (deanResponse.data.program_id) {
            formDataToSet.program_id = deanResponse.data.program_id;
          }
        }
      } catch (error) {
        console.warn('Could not fetch dean profile:', error);
      }
    }

    const roleName = String(user.role?.role_name || user.role?.name || '').trim().toLowerCase();
    if (!formDataToSet.employee_id && user.user_id) {
      const profileFetch =
        roleName === 'adviser' || roleName === 'evaluator'
          ? api.get(`/faculty/profile?user_id=${user.user_id}`, { silent: true })
          : roleName === 'program head'
            ? api.get(`/program-heads/profile?user_id=${user.user_id}`, { silent: true })
            : roleName === 'secretary'
              ? api.get(`/secretaries/profile?user_id=${user.user_id}`, { silent: true })
              : null;
      if (profileFetch) {
        try {
          const res = await profileFetch;
          if (res.data?.employee_id) {
            formDataToSet.employee_id = res.data.employee_id;
          }
        } catch {
          // profile may not exist yet
        }
      }
    }
    
    setFormData(formDataToSet);
    setPasswordFieldError('');
    setShowPassword(false);
    setShowModal(true);
  };

  const handleToggleUserStatus = async (row) => {
    if (!canChangeUserStatus) {
      swalError('View only', 'You do not have permission to change account status.');
      return;
    }
    const id = row.user_id || row.id;
    const current = String(row.status || 'active').toLowerCase();
    const isActive = current === 'active';
    const next = isActive ? 'inactive' : 'active';

    if (Number.isFinite(sessionUserId) && sessionUserId === Number(id) && next === 'inactive') {
      await swalError('Not allowed', 'You cannot deactivate your own account.');
      return;
    }

    const ok = await swalConfirm({
      title: next === 'inactive' ? 'Deactivate account?' : 'Activate account?',
      text:
        next === 'inactive'
          ? 'This user will not be able to sign in until an administrator activates the account again.'
          : 'Restore login access for this user.',
      confirmButtonText: next === 'inactive' ? 'Deactivate' : 'Activate',
    });
    if (!ok) return;

    try {
      const payload = {
        email: row.email,
        contact_number: row.contact_number ?? '',
        role_id: row.role_id,
        department_id:
          row.department_id ??
          row.department?.department_id ??
          row.faculty_profile?.department_id ??
          row.facultyProfile?.department_id ??
          row.faculty_profile?.department?.department_id ??
          row.facultyProfile?.department?.department_id ??
          row.program_head_profile?.department_id ??
          row.programHeadProfile?.department_id ??
          row.program_head_profile?.department?.department_id ??
          row.programHeadProfile?.department?.department_id ??
          row.secretary_profile?.department_id ??
          row.secretaryProfile?.department_id ??
          row.secretary_profile?.department?.department_id ??
          row.secretaryProfile?.department?.department_id ??
          row.dean_profile?.department_id ??
          row.deanProfile?.department_id ??
          row.dean_profile?.department?.department_id ??
          row.deanProfile?.department?.department_id ??
          null,
        status: next,
      };
      const staffProgramId =
        row.program_id ??
        row.program?.program_id ??
        row.faculty_profile?.program_id ??
        row.facultyProfile?.program_id ??
        row.faculty_profile?.program?.program_id ??
        row.facultyProfile?.program?.program_id ??
        row.program_head_profile?.program_id ??
        row.programHeadProfile?.program_id ??
        row.program_head_profile?.program?.program_id ??
        row.programHeadProfile?.program?.program_id ??
        row.secretary_profile?.program_id ??
        row.secretaryProfile?.program_id ??
        row.secretary_profile?.program?.program_id ??
        row.secretaryProfile?.program?.program_id ??
        row.dean_profile?.program_id ??
        row.deanProfile?.program_id ??
        row.dean_profile?.program?.program_id ??
        row.deanProfile?.program?.program_id;
      if (staffProgramId != null && staffProgramId !== '') {
        payload.program_id = staffProgramId;
      }
      await api.put(`/users/${id}`, payload);
      fetchUsers();
      swalToast('success', next === 'active' ? 'User activated' : 'User deactivated');
    } catch (error) {
      const msg = formatAxiosError(error) || 'Failed to update status';
      setError(msg);
      await swalError('Update failed', msg);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current || saving) return;
    submittingRef.current = true;
    setSaving(true);
    setError('');

    try {
      const submitData = { ...formData };

      if (lockStudentProfile && editingUser.student_id) {
        const passwordErr = getAdminDirectoryPasswordError(submitData.password, { required: false });
        if (passwordErr) {
          setPasswordFieldError(passwordErr);
          await swalError('Save failed', passwordErr);
          return;
        }
        setPasswordFieldError('');
        const accountData = { email: String(submitData.email || '').trim() || null };
        if (submitData.password) {
          accountData.password = submitData.password;
        }
        await api.put(`/students/directory/${editingUser.student_id}`, accountData);
        setShowModal(false);
        clearUserFormDraft();
        setEditingUser(null);
        setShowPassword(false);
        fetchUsers();
        swalToast('success', 'Student account updated');
        return;
      }

      if (isStudentForm()) {
        const studentRoleId = submitData.role_id || String(studentRoleRecord?.role_id ?? studentRoleRecord?.id ?? '');
        if (!studentRoleId) {
          await swalError('Setup error', 'Student role is not available. Please refresh the page and try again.');
          return;
        }
        submitData.role_id = studentRoleId;
        if (!submitData.access_level_id && studentRoleRecord?.access_level != null) {
          submitData.access_level_id = String(studentRoleRecord.access_level);
        }
        if (!editingUser) {
          submitData.status = 'active';
        }
      }

      // Admin validation: ensure year level is set for students,
      // and ensure track is set when year level is 3rd year.
      if (isStudentForm()) {
        if (!submitData.student_id_number) {
          await swalError('Student ID required', 'Please enter Student ID Number to save student profile.');
          return;
        }
        if (!submitData.current_program) {
          await swalError('Program required', 'Please select the student program so their curriculum appears in the student portal.');
          return;
        }
        // Year level is no longer set on create/edit here; keep any existing value or leave null.
        submitData.year_level_id = submitData.year_level_id || '';
        const selectedProgram = programs.find(
          (program) => String(getProgramOptionValue(program)) === String(submitData.current_program)
        );
        // Track only applies when a 3rd-year standing is already on the profile (not chosen in this form).
        const yearLevelId = submitData.year_level_id ? Number(submitData.year_level_id) : null;
        const selectedYearLevel = yearLevels.find(
          (yearLevel) => Number(yearLevel.year_level_id) === yearLevelId
        );
        const selectedYearLabel = String(selectedYearLevel?.year_level || '').toLowerCase();
        const shouldRequireTrack =
          isInformationTechnologyProgram(selectedProgram) &&
          (yearLevelId === 3 || selectedYearLabel.includes('3rd') || selectedYearLabel.includes('third'));
        if (shouldRequireTrack && !submitData.track_id) {
          await swalError('Track required', 'Please assign a Track for 3rd year IT students.');
          return;
        }
        if (!shouldRequireTrack) {
          submitData.track_id = '';
        }
      }

      if (isEmployeeIdLoginRole() && !String(submitData.employee_id || '').trim()) {
        await swalError(
          'Employee ID required',
          'Faculty and staff sign in with their Employee ID. Email is only for verification and password reset.'
        );
        return;
      }

      if (isDepartmentManagedRole() && !submitData.department_id) {
        await swalError('Department required', 'Please select the department for this user.');
        return;
      }

      if (isProgramAssignedStaffRole() && !submitData.program_id) {
        await swalError('Program required', 'Please select the program this user will handle.');
        return;
      }

      const unsafeMsg = findUnsafeFormField(submitData, {
        skipKeys: ['password', 'email', 'status', 'academic_status', 'student_entry_type'],
        labelMap: {
          first_name: 'First name',
          last_name: 'Last name',
          middle_name: 'Middle name',
          address: 'Address',
          student_id_number: 'Student ID',
        },
      });
      if (unsafeMsg) {
        await swalError('Invalid input', unsafeMsg);
        return;
      }

      const contactCheck = validateContactNumber(submitData.contact_number);
      if (!contactCheck.ok) {
        await swalError('Invalid contact number', contactCheck.message);
        return;
      }
      submitData.contact_number = contactCheck.value || null;

      const creatingStudent = isStudentForm() && !editingUser;
      if (creatingStudent) {
        const studentId = String(submitData.student_id_number || '').trim();
        const firstName = String(submitData.first_name || '').trim();
        if (!studentId) {
          await swalError('Student ID required', 'Please enter Student ID Number.');
          return;
        }
        if (!firstName) {
          await swalError('First name required', 'Please enter the student first name.');
          return;
        }
        submitData.email = studentId; // Backend maps Student ID to internal login placeholder; not shown as email.
        submitData.password = buildDefaultStudentPassword(firstName);
        setPasswordFieldError('');
      } else {
        const passwordRequired = !editingUser;
        const passwordErr = getAdminDirectoryPasswordError(submitData.password, {
          required: passwordRequired,
        });
        if (passwordErr) {
          setPasswordFieldError(passwordErr);
          await swalError('Save failed', passwordErr);
          return;
        }
        setPasswordFieldError('');
      }
      
      // Only include password if it's provided (for updates)
      if (!submitData.password && editingUser) {
        delete submitData.password;
      }

      // Separate user creation and student profile creation
      if (editingUser) {
        if (userScope === 'students' && editingUser.student_id) {
          const directoryData = {
            email: String(submitData.email || '').trim() || null,
            contact_number: submitData.contact_number || null,
            status: submitData.status,
            student_id_number: submitData.student_id_number,
            first_name: submitData.first_name,
            middle_name: submitData.middle_name,
            last_name: submitData.last_name,
            address: submitData.address,
            academic_status: submitData.academic_status || null,
            student_entry_type: submitData.student_entry_type || null,
            current_program: submitData.current_program || null,
            year_level_id: submitData.year_level_id ? Number(submitData.year_level_id) : null,
            track_id: submitData.track_id ? Number(submitData.track_id) : null,
          };
          if (submitData.password) {
            directoryData.password = submitData.password;
          }
          await api.put(`/students/directory/${editingUser.student_id}`, directoryData);
        } else {
        // Update user account
        const userData = {
          email: submitData.email,
          password: submitData.password,
          contact_number: submitData.contact_number,
          role_id: submitData.role_id,
          department_id:
            isDepartmentManagedRole() || isEvaluatorProgramRole()
              ? submitData.department_id || null
              : null,
          status: submitData.status,
          employee_id: String(submitData.employee_id || '').trim() || null,
        };
        if (!userData.password) {
          delete userData.password;
        }

        // Program is used for Dean legacy fallback, Program Head assignment, and Evaluator/Adviser profile assignment.
        if ((isDeanRole() || isProgramAssignedStaffRole()) && submitData.program_id) {
          userData.program_id = submitData.program_id;
        }

        await api.put(`/users/${editingUser.user_id}`, userData);
        
        // If student role, update student profile
        if (isStudentForm()) {
          try {
            const profileData = {
              user_id: editingUser.user_id,
              student_id_number: submitData.student_id_number,
              first_name: submitData.first_name,
              middle_name: submitData.middle_name,
              last_name: submitData.last_name,
              contact_number: submitData.contact_number,
              address: submitData.address,
              academic_status: submitData.academic_status || null,
              student_entry_type: submitData.student_entry_type || null,
              current_program: submitData.current_program || null,
              year_level_id: submitData.year_level_id ? Number(submitData.year_level_id) : null,
              track_id: submitData.track_id ? Number(submitData.track_id) : null,
            };
            await api.put('/students/profile', profileData);
          } catch (studentError) {
            console.error('Error updating student profile:', studentError);
            await swalError('Student profile save failed', formatAxiosError(studentError));
            return;
          }
        }
        }
      } else {
        // Create user first
        const userData = {
          email: submitData.email,
          password: submitData.password,
          contact_number: submitData.contact_number,
          role_id: submitData.role_id,
          department_id:
            isDepartmentManagedRole() || isEvaluatorProgramRole()
              ? submitData.department_id || null
              : null,
          status: submitData.status,
          employee_id: String(submitData.employee_id || '').trim() || null,
        };

        // Program is used for Dean legacy fallback, Program Head assignment, and Evaluator/Adviser profile assignment.
        if ((isDeanRole() || isProgramAssignedStaffRole()) && submitData.program_id) {
          userData.program_id = submitData.program_id;
        }
        
        const userResponse = await api.post('/users', userData);
        const newUser = userResponse.data;
        
        // If student role, create student profile
        if (isStudentForm() && newUser.user_id) {
          try {
            await api.post('/students/profile', {
              user_id: newUser.user_id,
              student_id_number: submitData.student_id_number,
              first_name: submitData.first_name,
              middle_name: submitData.middle_name,
              last_name: submitData.last_name,
              contact_number: submitData.contact_number,
              address: submitData.address,
              academic_status: submitData.academic_status || null,
              student_entry_type: submitData.student_entry_type || null,
              current_program: submitData.current_program || null,
              year_level_id: submitData.year_level_id ? Number(submitData.year_level_id) : null,
              track_id: submitData.track_id ? Number(submitData.track_id) : null,
            });
          } catch (studentError) {
            console.error('Error creating student profile:', studentError);
            await swalError('Student profile save failed', formatAxiosError(studentError));
            return;
          }
        }

        // If dean role, dean profile is created automatically via UserController
        // The program_id is sent with the user creation request
      }
      
      setShowModal(false);
      clearUserFormDraft();
      const wasEditing = Boolean(editingUser);
      setEditingUser(null);
      setShowPassword(false);
      fetchUsers();
      if (creatingStudent) {
        const loginId = String(submitData.email || '').trim();
        const tempPassword = String(submitData.password || '');
        await swalInfo(
          'Student created',
          `Login username: ${loginId}\nTemporary password: ${tempPassword}\n\nThe student must change this password on first login.`
        );
      } else {
        swalToast('success', wasEditing ? 'User updated' : 'User created');
      }
    } catch (error) {
      const msg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        (!error.response
          ? 'Network interrupted — your form inputs were kept. Reconnect and save again.'
          : null) ||
        `Failed to ${editingUser ? 'update' : 'create'} user`;
      setError(msg);
      if (/password/i.test(String(msg))) {
        setPasswordFieldError(msg);
      }
      await swalError('Save failed', msg);
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  const handleCloseModal = () => {
    if (saving) return;
    setShowModal(false);
    setEditingUser(null);
    setPasswordFieldError('');
    setShowPassword(false);
    // Don't immediately clear error - let user see it for a moment
    setTimeout(() => setError(''), 3000);
  };

  useDialogFocus(showModal, modalRef, null, handleCloseModal);

  const getAccessLevelName = (user) => {
    // Get access level from role
    if (user && user.role && user.role.access_level !== undefined && user.role.access_level !== null) {
      return user.role.access_level.toString();
    }
    if (user && user.role_id) {
      const userRole = roles.find(r => String(r.id || r.role_id) === String(user.role_id));
      if (userRole && userRole.access_level !== undefined && userRole.access_level !== null) {
        return userRole.access_level.toString();
      }
    }
    return 'Not Set';
  };

  const getRoleName = (roleId) => {
    const role = roles.find(r => r.id === roleId || r.role_id === roleId);
    return role ? (role.role_name || role.name || 'Unknown') : 'No Role';
  };

  const adminSelectedYearId = formData.year_level_id ? Number(formData.year_level_id) : null;
  const adminSelectedYearLevel = yearLevels.find(
    (yearLevel) => Number(yearLevel.year_level_id) === adminSelectedYearId
  );
  const adminSelectedYearLabel = String(adminSelectedYearLevel?.year_level || '').toLowerCase();
  const adminIsThirdYear =
    adminSelectedYearId === 3 ||
    adminSelectedYearLabel.includes('3rd') ||
    adminSelectedYearLabel.includes('third');
  const adminSelectedProgram = programs.find(
    (program) => String(getProgramOptionValue(program)) === String(formData.current_program || '')
  );
  const adminSelectedProgramIsIT = isInformationTechnologyProgram(adminSelectedProgram);
  const adminShouldShowTrack = adminSelectedProgramIsIT && adminIsThirdYear;
  const selectedStaffDepartmentId = formData.department_id ? String(formData.department_id) : '';
  const staffProgramOptions = programs
    .filter((program) => {
      if (!(isProgramHeadRole() || isDeanRole()) || !selectedStaffDepartmentId) return true;
      const departmentId = program.department_id ?? program.department?.department_id ?? '';
      return String(departmentId) === selectedStaffDepartmentId;
    })
    .map((program) => ({
      value: String(getProgramOptionValue(program)),
      label: getProgramOptionLabel(program),
    }))
    .filter((option) => option.value);

  useEffect(() => {
    if (!adminShouldShowTrack && formData.track_id) {
      setFormData((prev) => (prev.track_id ? { ...prev, track_id: '' } : prev));
    }
  }, [adminShouldShowTrack, formData.track_id]);

  useEffect(() => {
    if (!showModal || editingUser || userScope !== 'students' || !studentRoleRecord) return;
    const studentRoleId = String(studentRoleRecord.role_id ?? studentRoleRecord.id ?? '');
    if (!studentRoleId) return;
    setFormData((prev) => {
      const accessLevel =
        studentRoleRecord.access_level !== undefined && studentRoleRecord.access_level !== null
          ? String(studentRoleRecord.access_level)
          : prev.access_level_id || '';
      if (String(prev.role_id || '') === studentRoleId && String(prev.access_level_id || '') === accessLevel) {
        return prev;
      }
      return {
        ...prev,
        role_id: studentRoleId,
        access_level_id: accessLevel,
      };
    });
  }, [showModal, editingUser, userScope, studentRoleRecord]);

  if (loading) {
    return <div className="loading">Loading users...</div>;
  }

  return (
      <div
        className={`user-management${userScope === 'students' ? ' user-management--students' : ''}`}
        data-tour="page-user-management"
      >
      <div
        className={`management-header${userScope === 'students' ? ' management-header--minimal' : ''}`}
      >
        {userScope !== 'students' ? (
          <h2>User Management</h2>
        ) : (
          <span className="management-header__minimal-spacer" aria-hidden />
        )}
        {canCreateUsers ? (
          <button type="button" className="add-button" onClick={handleAdd}>
            {userScope === 'students' ? 'Add Student' : 'Add User'}
          </button>
        ) : null}
      </div>

      {error && <div className="error-message" role="alert">{error}</div>}

      <div className="list-panel">
      {/* Search and Filter Section */}
      <div className="filter-section">
        <div className="search-box">
          <input
            type="text"
            aria-label={userScope === 'students' ? 'Search students' : 'Search users'}
            placeholder={
              userScope === 'students'
                ? 'Search by name, student ID, or email...'
                : 'Search by email, contact, role, or program...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-controls">
          {userScope !== 'students' && (
          <select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Roles</option>
            {assignableRoles.map((role) => (
              <option key={role.id || role.role_id} value={role.id || role.role_id}>
                {role.role_name || role.name}
              </option>
            ))}
          </select>
          )}
          <select
            aria-label="Filter by account status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {(searchTerm || roleFilter || statusFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setRoleFilter('');
                setStatusFilter('');
              }}
              className="clear-filters-button"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="table-section">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                {userScope === 'students' ? (
                  <>
                    <th>Name</th>
                    <th>Student ID</th>
                    <th>Role</th>
                    <th>Program</th>
                    <th>Status</th>
                    <th>Email</th>
                    <th>Contact</th>
                    <th>Access</th>
                    <th>Actions</th>
                  </>
                ) : (
                  <>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Department / Program</th>
                    <th>Status</th>
                    <th>Contact</th>
                    <th>Access</th>
                    <th>Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={userScope === 'students' ? 9 : 7} className="no-data">
                    {users.length === 0 ? 'No users found' : 'No users match your filters'}
                  </td>
                </tr>
              ) : (
                pagedUsers.map((user) => {
                  const getDepartmentName = () => {
                    const department =
                      user.department ||
                      user.secretary_profile?.department ||
                      user.secretaryProfile?.department ||
                      user.dean_profile?.department ||
                      user.deanProfile?.department ||
                      user.program_head_profile?.department ||
                      user.programHeadProfile?.department ||
                      user.faculty_profile?.department ||
                      user.facultyProfile?.department;
                    return department?.department_name || department?.department_code || '';
                  };
                  const getProgramName = () => {
                    const roleName = String(getRoleName(user.role_id) || '').toLowerCase();
                    if (['dean', 'secretary', 'program head'].includes(roleName)) {
                      return getDepartmentName() || '-';
                    }
                    if (user.program) {
                      return user.program.program_name || 'N/A';
                    }
                    if (user.faculty_profile?.program) {
                      return user.faculty_profile.program.program_name || 'N/A';
                    }
                    if (user.facultyProfile?.program) {
                      return user.facultyProfile.program.program_name || 'N/A';
                    }
                    if (user.program_head_profile?.program) {
                      return user.program_head_profile.program.program_name || 'N/A';
                    }
                    if (user.programHeadProfile?.program) {
                      return user.programHeadProfile.program.program_name || 'N/A';
                    }
                    if (user.secretary_profile?.program) {
                      return user.secretary_profile.program.program_name || 'N/A';
                    }
                    if (user.secretaryProfile?.program) {
                      return user.secretaryProfile.program.program_name || 'N/A';
                    }
                    if (user.dean_profile?.program) {
                      return user.dean_profile.program.program_name || 'N/A';
                    }
                    if (user.deanProfile?.program) {
                      return user.deanProfile.program.program_name || 'N/A';
                    }
                    if (user.student_profile?.program) {
                      return user.student_profile.program.program_name || 'N/A';
                    }
                    if (user.studentProfile?.program) {
                      return user.studentProfile.program.program_name || 'N/A';
                    }
                    return getDepartmentName() || '-';
                  };
                  
                  return (
                    <tr key={user.student_id || user.user_id || user.id}>
                      {userScope === 'students' ? (
                        <>
                          <td>{studentDisplayName(user) || '-'}</td>
                          <td>{studentIdNumberOf(user) || '-'}</td>
                          <td>{getRoleName(user.role_id)}</td>
                          <td className="program-cell" title={getProgramName()}>
                            {getProgramName()}
                          </td>
                          <td>
                            <span className={`status-badge ${user.status === 'active' ? 'active' : 'inactive'}`}>
                              {user.status === 'active' ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="email-cell">{user.email || '-'}</td>
                          <td>{user.contact_number || '-'}</td>
                          <td>
                            <span className="access-level-badge">
                              {getAccessLevelName(user)}
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="email-cell">{user.email || '-'}</td>
                          <td>{getRoleName(user.role_id)}</td>
                          <td className="program-cell" title={getProgramName()}>
                            {getProgramName()}
                          </td>
                          <td>
                            <span className={`status-badge ${user.status === 'active' ? 'active' : 'inactive'}`}>
                              {user.status === 'active' ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>{user.contact_number || '-'}</td>
                          <td>
                            <span className="access-level-badge">
                              {getAccessLevelName(user)}
                            </span>
                          </td>
                        </>
                      )}
                      <td className="actions-cell">
                        <div className="actions">
                        {canEditUsers ? (
                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => handleEdit(user)}
                          >
                            Edit
                          </button>
                        ) : null}
                        {canChangeUserStatus && user.user_id ? (
                          <button
                            type="button"
                            className={`status-toggle-button ${
                              (user.status || 'active').toLowerCase() === 'active'
                                ? 'status-toggle-button--deactivate'
                                : 'status-toggle-button--activate'
                            }`}
                            onClick={() => handleToggleUserStatus(user)}
                            disabled={
                              Number.isFinite(sessionUserId) &&
                              sessionUserId === Number(user.user_id || user.id) &&
                              (user.status || 'active').toLowerCase() === 'active'
                            }
                            title={
                              Number.isFinite(sessionUserId) &&
                              sessionUserId === Number(user.user_id || user.id) &&
                              (user.status || 'active').toLowerCase() === 'active'
                                ? 'You cannot deactivate your own account'
                                : undefined
                            }
                          >
                            {(user.status || 'active').toLowerCase() === 'active'
                              ? 'Deactivate'
                              : 'Activate'}
                          </button>
                        ) : null}
                        {!canEditUsers && !canChangeUserStatus ? (
                          <span className="actions-readonly">View only</span>
                        ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filteredUsers.length > 0 ? (
          <ClientPaginationBar
            page={safeListPage}
            pageSize={listPageSize}
            totalItems={filteredUsers.length}
            totalPages={listTotalPages}
            onPageChange={setListPage}
            onPageSizeChange={(n) => {
              setListPageSize(n);
              setListPage(1);
            }}
          />
        ) : null}
      </div>
      </div>

      {showModal &&
        createPortal(
        <div className="user-management">
        <div className="modal-overlay">
          <div
            ref={modalRef}
            className="app-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-management-modal-title"
            tabIndex="-1"
          >
            <div className="modal-header">
              <h3 id="user-management-modal-title">
                {userScope === 'students'
                  ? editingUser
                    ? 'Edit Student'
                    : 'Add Student'
                  : editingUser
                    ? 'Edit User'
                    : 'Add User'}
              </h3>
              <button
                type="button"
                className="close-button"
                onClick={handleCloseModal}
                aria-label="Close user form"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              {/* Student Information first when adding/editing a student */}
              {isStudentForm() && (
                <>
                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ margin: '0 0 1rem 0', color: '#333' }}>Student Information</h4>
                    {lockStudentProfile ? (
                      <small style={{ color: '#666', fontSize: '0.85rem', display: 'block', marginTop: '-0.5rem' }}>
                        Student details are read-only. Only the password and email can be changed here.
                      </small>
                    ) : null}
                  </div>

                  <div className="form-group">
                    <label>Student ID Number *</label>
                    <input
                      type="text"
                      aria-label="Student ID number"
                      value={formData.student_id_number || ''}
                      onChange={(e) => {
                        const studentId = e.target.value;
                        setFormData({
                          ...formData,
                          student_id_number: studentId,
                          ...(editingUser ? {} : { email: studentId }),
                        });
                      }}
                      placeholder="e.g., 02-2324-07413"
                      required={isStudentForm() && (!editingUser || !formData.student_id_number)}
                      disabled={lockStudentProfile}
                    />
                    {!editingUser && (
                      <small style={{ color: '#666', fontSize: '0.85rem', display: 'block', marginTop: '0.25rem' }}>
                        This becomes the student&apos;s login username.
                      </small>
                    )}
                  </div>

                  <div className="form-group">
                    <label>First Name *</label>
                    <input
                      type="text"
                      aria-label="First name"
                      value={formData.first_name || ''}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      placeholder="Enter first name"
                      required={isStudentForm()}
                      disabled={lockStudentProfile}
                    />
                    {!editingUser && formData.first_name && (
                      <small style={{ color: '#666', fontSize: '0.85rem', display: 'block', marginTop: '0.25rem' }}>
                        Default password will be{' '}
                        <strong>{buildDefaultStudentPassword(formData.first_name)}</strong> (must change on first login).
                      </small>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Middle Name</label>
                    <input
                      type="text"
                      aria-label="Middle name"
                      value={formData.middle_name || ''}
                      onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                      placeholder="Enter middle name (optional)"
                      disabled={lockStudentProfile}
                    />
                  </div>

                  <div className="form-group">
                    <label>Last Name *</label>
                    <input
                      type="text"
                      aria-label="Last name"
                      value={formData.last_name || ''}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      placeholder="Enter last name"
                      required={isStudentForm()}
                      disabled={lockStudentProfile}
                    />
                  </div>

                  <div className="form-group">
                    <label>Contact Number</label>
                    <input
                      type="tel"
                      aria-label="Student contact number"
                      inputMode="numeric"
                      autoComplete="tel"
                      maxLength={11}
                      value={formData.contact_number || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          contact_number: digitsOnlyContact(e.target.value),
                        })
                      }
                      placeholder="11 digits only (e.g. 09123456789)"
                      disabled={lockStudentProfile}
                    />
                  </div>

                  <div className="form-group">
                    <label>Address (optional)</label>
                    <textarea
                      aria-label="Student address"
                      value={formData.address || ''}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Optional — student can update this after login"
                      rows="3"
                      disabled={lockStudentProfile}
                    />
                  </div>

                  <div className="form-group">
                    <label>Academic Status</label>
                    <select
                      aria-label="Academic status"
                      value={formData.academic_status || ''}
                      onChange={(e) => setFormData({ ...formData, academic_status: e.target.value })}
                      disabled={lockStudentProfile}
                    >
                      <option value="">Select Status</option>
                      <option value="Regular">Regular</option>
                      <option value="Irregular">Irregular</option>
                    </select>
                    <small style={{ color: '#666', fontSize: '0.85rem', display: 'block', marginTop: '0.25rem' }}>
                      Course standing (Regular / Irregular). Separate from Student type below.
                    </small>
                  </div>

                  <div className="form-group">
                    <label>Student type</label>
                    <select
                      aria-label="Student type"
                      value={formData.student_entry_type || ''}
                      onChange={(e) => setFormData({ ...formData, student_entry_type: e.target.value })}
                      disabled={lockStudentProfile}
                    >
                      <option value="">Standard (none)</option>
                      <option value="Shiftee">Shiftee</option>
                      <option value="Returnee">Returnee</option>
                      <option value="Transferee">Transferee</option>
                    </select>
                    <small style={{ color: '#666', fontSize: '0.85rem', display: 'block', marginTop: '0.25rem' }}>
                      Shiftee / Returnee / Transferee — not the same as Regular / Irregular.
                    </small>
                  </div>

                  <div className="form-group">
                    <label>Program *</label>
                    <SearchableSelect
                      id="student-program-select"
                      aria-label="Student program"
                      value={formData.current_program || ''}
                      onChange={(value) =>
                        setFormData({
                          ...formData,
                          current_program: value,
                          track_id: isInformationTechnologyProgram(
                            programs.find((program) => String(getProgramOptionValue(program)) === String(value))
                          )
                            ? formData.track_id
                            : '',
                        })
                      }
                      options={programOptions}
                      emptyLabel="Select Program"
                      placeholder="Search programs..."
                      required={isStudentForm()}
                      disabled={lockStudentProfile}
                    />
                  </div>

                  {adminShouldShowTrack && (
                    <div className="form-group">
                      <label>Track (IT 3rd Year) *</label>
                      <select
                        aria-label="Student track"
                        value={formData.track_id || ''}
                        onChange={(e) => setFormData({ ...formData, track_id: e.target.value })}
                        required={adminShouldShowTrack}
                        disabled={lockStudentProfile}
                      >
                        <option value="">Select Track</option>
                        {tracks.map((track) => (
                          <option key={track.track_id} value={track.track_id}>
                            {track.track_name}
                            {track.track_code ? ` (${track.track_code})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: '1.5rem',
                      marginBottom: '1rem',
                      borderTop: '2px solid #e0e0e0',
                      paddingTop: '1rem',
                    }}
                  >
                    <h4 style={{ margin: '0 0 1rem 0', color: '#333' }}>Account</h4>
                  </div>
                </>
              )}

              {/* Staff: Role first, then Employee ID (portal login), password, email (mail only) */}
              {userScope !== 'students' && (
              <div className="form-group">
                <label>Role</label>
                <select
                  aria-label="Role"
                  value={formData.role_id || ''}
                  onChange={(e) => {
                    const selectedRoleId = e.target.value;
                    const selectedRole = roles.find(
                      (r) => String(r.id || r.role_id) === String(selectedRoleId)
                    );
                    
                    // Auto-fill access level based on selected role
                    const newFormData = { ...formData, role_id: selectedRoleId };
                    if (selectedRole && selectedRole.access_level !== undefined) {
                      newFormData.access_level_id = selectedRole.access_level;
                    }
                    const roleName = String(selectedRole?.role_name || selectedRole?.name || '').trim().toLowerCase();
                    if (!['dean', 'program head', 'secretary', 'adviser'].includes(roleName)) {
                      newFormData.department_id = '';
                    }
                    if (!['dean', 'program head', 'adviser'].includes(roleName)) {
                      newFormData.program_id = '';
                    }
                    setFormData(newFormData);
                  }}
                  required
                >
                  <option value="">Select Role</option>
                  {assignableRoles.map((role) => (
                    <option key={role.id || role.role_id} value={role.id || role.role_id}>
                      {role.role_name || role.name}
                    </option>
                  ))}
                </select>
              </div>
              )}
              {userScope !== 'students' && (
              <div className="form-group">
                <label>Access Level</label>
                <input
                  type="number"
                  aria-label="Access level"
                  value={formData.access_level_id || ''}
                  placeholder="Select a role first"
                  min="1"
                  max="10"
                  required
                  disabled
                  readOnly
                  tabIndex={-1}
                />
                <small style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                  Automatically set based on selected role
                </small>
              </div>
              )}

              {!isStudentForm() && (
              <div className="form-group">
                <label>
                  Faculty / Employee ID{isEmployeeIdLoginRole() ? ' *' : ''}
                </label>
                <input
                  type="text"
                  aria-label="Faculty or Employee ID"
                  value={formData.employee_id || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      employee_id: e.target.value,
                    })
                  }
                  placeholder={
                    isEmployeeIdLoginRole()
                      ? 'Required — this is their portal login ID'
                      : 'Optional for Admin'
                  }
                  required={isEmployeeIdLoginRole()}
                  maxLength={50}
                />
                <small style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                  {isEmployeeIdLoginRole()
                    ? 'Faculty and staff sign in with this ID only. Do not use email on the login screen.'
                    : 'Admin accounts sign in with email. Employee ID is optional.'}
                </small>
              </div>
              )}

              {/* Login credentials: auto for new students; editable when editing or for staff */}
              {!(isStudentForm() && !editingUser) && (
                <>
                  <div className="form-group">
                    <label>Password {editingUser && '(leave blank to keep current)'}</label>
                    <div className="user-password-wrap">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        aria-label="Password"
                        className={passwordFieldError ? 'input-error' : undefined}
                        value={formData.password || ''}
                        onChange={(e) => {
                          const nextPassword = e.target.value;
                          setFormData({ ...formData, password: nextPassword });
                          setPasswordFieldError(
                            getAdminDirectoryPasswordError(nextPassword, { required: !editingUser })
                          );
                        }}
                        onBlur={() => {
                          setPasswordFieldError(
                            getAdminDirectoryPasswordError(formData.password, { required: !editingUser })
                          );
                        }}
                        required={!editingUser}
                        autoComplete="new-password"
                        aria-invalid={Boolean(passwordFieldError)}
                        aria-describedby="user-password-guidance"
                      />
                      <button
                        type="button"
                        className="user-password-eye"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <i
                          className={showPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'}
                          aria-hidden
                        />
                      </button>
                    </div>
                    {passwordFieldError ? (
                      <span id="user-password-guidance" className="field-error" role="alert">
                        {passwordFieldError}
                      </span>
                    ) : editingUser ? (
                      <span id="user-password-guidance" className="field-hint">
                        Leave blank to keep the current password.
                      </span>
                    ) : (
                      <span id="user-password-guidance" className="field-hint">
                        Temporary password is fine here. On first login the user must set a strong password (length,
                        uppercase, and a symbol).
                      </span>
                    )}
                  </div>
                  <div className="form-group">
                    <label>{isStudentForm() ? 'Email (optional)' : 'Email'}</label>
                    <input
                      type="email"
                      aria-label={isStudentForm() ? 'Student email (optional)' : 'Email'}
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required={!isStudentForm()}
                      placeholder={isStudentForm() ? 'student@example.com — add later if unknown' : undefined}
                    />
                    {isStudentForm() ? (
                      <small style={{ color: '#666', fontSize: '0.85rem', display: 'block', marginTop: '0.25rem' }}>
                        Students sign in with their Student ID, not email. Add a contact email here or via CSV import.
                      </small>
                    ) : null}
                  </div>
                </>
              )}

              {isStudentForm() && !editingUser && (
                <div className="form-group">
                  <small style={{ color: '#475569', fontSize: '0.9rem', lineHeight: 1.45, display: 'block' }}>
                    Login username = Student ID Number. Default password = first name + <code>123</code> (lowercase).
                    The student must change this password on first login.
                  </small>
                </div>
              )}

              {!isStudentForm() && (
              <div className="form-group">
                <label>Contact Number</label>
                <input
                  type="tel"
                  aria-label="Contact number"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={11}
                  value={formData.contact_number || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      contact_number: digitsOnlyContact(e.target.value),
                    })
                  }
                  placeholder="11 digits only (e.g. 09123456789)"
                />
              </div>
              )}
              {!(isStudentForm() && !editingUser) && (
              <div className="form-group">
                <label>Status</label>
                <select
                  aria-label="Account status"
                  value={formData.status || 'active'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  disabled={lockStudentProfile}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              )}

              {/* Department assignment for curriculum/records staff */}
              {isDepartmentManagedRole() && (
                <>
                  <div style={{ marginTop: '1.5rem', marginBottom: '1rem', borderTop: '2px solid #e0e0e0', paddingTop: '1rem' }}>
                    <h4 style={{ margin: '0 0 1rem 0', color: '#333' }}>Department Assignment</h4>
                  </div>
                  
                  <div className="form-group">
                    <label>Department *</label>
                    <SearchableSelect
                      id="staff-department-select"
                      value={formData.department_id ? String(formData.department_id) : ''}
                      onChange={(value) => setFormData({ ...formData, department_id: value || '', program_id: '' })}
                      options={departmentOptions}
                      emptyLabel="Select Department"
                      placeholder="Search departments..."
                      required={isDepartmentManagedRole()}
                      aria-label="Department"
                    />
                    <small style={{ color: '#666', fontSize: '0.85rem', display: 'block', marginTop: '0.25rem' }}>
                      Select the department this user will manage
                    </small>
                  </div>
                </>
              )}

              {isProgramAssignedStaffRole() && (
                <>
                  {!isDepartmentManagedRole() && (
                    <div style={{ marginTop: '1.5rem', marginBottom: '1rem', borderTop: '2px solid #e0e0e0', paddingTop: '1rem' }}>
                      <h4 style={{ margin: '0 0 1rem 0', color: '#333' }}>Program Assignment</h4>
                    </div>
                  )}
                  <div className="form-group">
                    <label>Program *</label>
                    <SearchableSelect
                      id="staff-program-select"
                      value={formData.program_id ? String(formData.program_id) : ''}
                      onChange={(value) => {
                        const selectedProgram = programs.find(
                          (program) => String(getProgramOptionValue(program)) === String(value || '')
                        );
                        const departmentId =
                          selectedProgram?.department_id ??
                          selectedProgram?.department?.department_id ??
                          formData.department_id ??
                          '';
                        setFormData({
                          ...formData,
                          program_id: value || '',
                          department_id: departmentId || '',
                        });
                      }}
                      options={staffProgramOptions}
                      emptyLabel="Select Program"
                      placeholder="Search programs..."
                      required={isProgramAssignedStaffRole()}
                      aria-label="Program assignment"
                    />
                    <small style={{ color: '#666', fontSize: '0.85rem', display: 'block', marginTop: '0.25rem' }}>
                      {isDeanRole()
                        ? 'Program shown in this dean’s Analytics'
                        : 'Select the program this user will handle'}
                    </small>
                  </div>
                </>
              )}

              <div className="form-actions">
                <button type="button" className="cancel-button" onClick={handleCloseModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="submit-button" disabled={saving}>
                  {saving ? 'Saving…' : editingUser ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default UserManagement;
