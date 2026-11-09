import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import {
  digitsOnlyContact,
  findUnsafeFormField,
  validateContactNumber,
} from '../../utils/inputValidation';
import ProfilePhotoCard from '../common/ProfilePhotoCard';
import ProfileChangePassword from '../common/ProfileChangePassword';

function profileApiBase(roleName) {
  const r = String(roleName || '').trim().toLowerCase();
  if (r === 'secretary') return '/secretaries';
  if (r === 'program head') return '/program-heads';
  return '/program-heads';
}

/**
 * My Profile for Program Head and Secretary portals.
 * Uses dedicated profile tables (not faculty profile).
 */
const ProgramHeadProfile = () => {
  const { user, refreshUser } = useAuth();
  const roleName = user?.role || user?.role_name || '';
  const apiBase = profileApiBase(roleName);
  const [staffProfile, setStaffProfile] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    contact_number: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    employee_id: '',
    department: '',
    program: '',
    specialization: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (!user) return;
    setFormData({
      email: user.email || '',
      contact_number: user.contact_number || '',
      department: user.department?.department_name || '',
      program: user.program?.program_name
        ? `${user.program.program_name}${user.program.program_code ? ` (${user.program.program_code})` : ''}`
        : '',
      first_name: staffProfile?.first_name || '',
      middle_name: staffProfile?.middle_name || '',
      last_name: staffProfile?.last_name || '',
      employee_id: staffProfile?.employee_id || '',
      specialization: staffProfile?.specialization || '',
    });
  }, [user, staffProfile]);

  useEffect(() => {
    fetchStaffProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  const fetchStaffProfile = async () => {
    try {
      const response = await api.get(`${apiBase}/profile`);
      setStaffProfile(response.data);
    } catch (error) {
      if (error.response?.status !== 404) {
        console.error('Error fetching staff profile:', error);
      }
      setStaffProfile(null);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const next = name === 'contact_number' ? digitsOnlyContact(value) : value;
    setFormData((prev) => ({
      ...prev,
      [name]: next,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.user_id) return;

    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const unsafeMsg = findUnsafeFormField(formData, {
        skipKeys: ['email', 'department', 'program'],
        labelMap: {
          first_name: 'First name',
          last_name: 'Last name',
          middle_name: 'Middle name',
          employee_id: 'Employee ID',
          specialization: 'Specialization',
        },
      });
      if (unsafeMsg) {
        setMessage({ type: 'error', text: unsafeMsg });
        setSaving(false);
        return;
      }
      const contactCheck = validateContactNumber(formData.contact_number);
      if (!contactCheck.ok) {
        setMessage({ type: 'error', text: contactCheck.message });
        setSaving(false);
        return;
      }

      await api.put('/profile/account', {
        contact_number: contactCheck.value || null,
      });
      const profilePayload = {
        first_name: formData.first_name,
        middle_name: formData.middle_name,
        last_name: formData.last_name,
        specialization: formData.specialization,
      };
      const response = staffProfile
        ? await api.put(`${apiBase}/profile`, profilePayload)
        : await api.post(`${apiBase}/profile`, profilePayload);
      setStaffProfile(response.data);
      setMessage({
        type: 'success',
        text: 'Profile updated successfully!',
      });
      refreshUser();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Failed to update profile. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="program-head-profile dean-section" data-tour="page-profile">
      <div className="section-header">
        <h2>My Profile</h2>
      </div>

      {message.text && (
        <div className={message.type === 'error' ? 'error-message' : 'success-message'}>
          {message.text}
        </div>
      )}

      <div className="profile-layout">
      <form onSubmit={handleSubmit} className="profile-form">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="staff_email">Email</label>
            <input
              type="email"
              id="staff_email"
              name="email"
              value={formData.email}
              disabled
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="staff_contact_number">Contact Number</label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={11}
              id="staff_contact_number"
              name="contact_number"
              value={formData.contact_number}
              onChange={handleChange}
              placeholder="11 digits only (e.g. 09123456789)"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="staff_first_name">First Name</label>
            <input
              type="text"
              id="staff_first_name"
              name="first_name"
              value={formData.first_name}
              onChange={handleChange}
              placeholder="Enter first name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="staff_middle_name">Middle Name</label>
            <input
              type="text"
              id="staff_middle_name"
              name="middle_name"
              value={formData.middle_name}
              onChange={handleChange}
              placeholder="Enter middle name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="staff_last_name">Last Name</label>
            <input
              type="text"
              id="staff_last_name"
              name="last_name"
              value={formData.last_name}
              onChange={handleChange}
              placeholder="Enter last name"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="staff_employee_id">Employee ID</label>
            <input
              type="text"
              id="staff_employee_id"
              name="employee_id"
              value={formData.employee_id}
              disabled
              readOnly
              placeholder="Set by administrator"
            />
            <small style={{ color: '#64748b', fontSize: '0.85rem', display: 'block', marginTop: '0.25rem' }}>
              Used for login. Only an administrator can change this.
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="staff_department">Assigned Department</label>
            <input
              type="text"
              id="staff_department"
              value={formData.department || 'Not assigned'}
              disabled
            />
          </div>

          <div className="form-group">
            <label htmlFor="staff_program">Assigned Program</label>
            <input
              type="text"
              id="staff_program"
              value={formData.program || 'Not assigned'}
              disabled
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="staff_specialization">Specialization</label>
          <input
            type="text"
            id="staff_specialization"
            name="specialization"
            value={formData.specialization}
            onChange={handleChange}
            placeholder="Enter area of specialization"
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
      <ProfilePhotoCard />
      <ProfileChangePassword />
      </div>
    </div>
  );
};

export default ProgramHeadProfile;
