import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import {
  digitsOnlyContact,
  findUnsafeFormField,
  validateContactNumber,
} from '../../utils/inputValidation';
import ProfilePhotoCard from '../common/ProfilePhotoCard';
import ProfileChangePassword from '../common/ProfileChangePassword';
import './FacultyPanel.css';

const FacultyProfile = ({ facultyProfile, onUpdate }) => {
  const { user, refreshUser } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    contact_number: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    employee_id: '',
    department_id: '',
    program_id: '',
  });
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchProfileOptions();
    if (user) {
      setFormData((prev) => ({
        ...prev,
        email: user.email || '',
        contact_number: user.contact_number || '',
      }));
    }
    if (facultyProfile) {
      setFormData((prev) => ({
        ...prev,
        first_name: facultyProfile.first_name || '',
        middle_name: facultyProfile.middle_name || '',
        last_name: facultyProfile.last_name || '',
        employee_id: facultyProfile.employee_id || '',
        department_id: facultyProfile.department_id || '',
        program_id: facultyProfile.program_id || '',
      }));
    }
  }, [user, facultyProfile]);

  const fetchProfileOptions = async () => {
    try {
      const response = await api.get('/profile/options');
      setDepartments(response.data?.departments || []);
      setPrograms(response.data?.programs || []);
    } catch (error) {
      console.error('Error fetching profile options:', error);
      setDepartments([]);
      setPrograms([]);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const next =
      name === 'contact_number' ? digitsOnlyContact(value) : value;
    setFormData((prev) => ({
      ...prev,
      [name]: next,
      ...(name === 'department_id' ? { program_id: '' } : {}),
    }));
  };

  const filteredPrograms = programs.filter((program) => {
    if (!formData.department_id) return true;
    return String(program.department_id) === String(formData.department_id);
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const unsafeMsg = findUnsafeFormField(formData, {
        skipKeys: ['email', 'department_id', 'program_id'],
        labelMap: {
          first_name: 'First name',
          last_name: 'Last name',
          middle_name: 'Middle name',
          employee_id: 'Employee ID',
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

      // Update user info
      await api.put('/profile/account', {
        contact_number: contactCheck.value || null,
      });

      // Update or create faculty profile
      if (facultyProfile) {
        await api.put(`/faculty/profile`, {
          first_name: formData.first_name,
          middle_name: formData.middle_name,
          last_name: formData.last_name,
        });
      } else {
        await api.post(`/faculty/profile`, {
          first_name: formData.first_name,
          middle_name: formData.middle_name,
          last_name: formData.last_name,
        });
      }

      setMessage({
        type: 'success',
        text: 'Profile updated successfully!',
      });

      if (onUpdate) {
        onUpdate();
      }
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
    <div className="faculty-section" data-tour="page-faculty-profile">
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
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              disabled
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="contact_number">Contact Number</label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={11}
              id="contact_number"
              name="contact_number"
              value={formData.contact_number}
              onChange={handleChange}
              placeholder="11 digits only (e.g. 09123456789)"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="first_name">First Name</label>
            <input
              type="text"
              id="first_name"
              name="first_name"
              value={formData.first_name}
              onChange={handleChange}
              placeholder="Enter first name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="middle_name">Middle Name</label>
            <input
              type="text"
              id="middle_name"
              name="middle_name"
              value={formData.middle_name}
              onChange={handleChange}
              placeholder="Enter middle name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="last_name">Last Name</label>
            <input
              type="text"
              id="last_name"
              name="last_name"
              value={formData.last_name}
              onChange={handleChange}
              placeholder="Enter last name"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="employee_id">Employee ID</label>
            <input
              type="text"
              id="employee_id"
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
            <label htmlFor="department_id">Department</label>
            <select
              id="department_id"
              name="department_id"
              value={formData.department_id}
              disabled
            >
              <option value="">Select Department</option>
              {departments.map((dept) => (
                <option key={dept.department_id} value={dept.department_id}>
                  {dept.department_name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="program_id">Program</label>
            <select
              id="program_id"
              name="program_id"
              value={formData.program_id}
              disabled
            >
              <option value="">Select Program</option>
              {filteredPrograms.map((program) => (
                <option key={program.program_id} value={program.program_id}>
                  {program.program_name}
                  {program.program_code ? ` (${program.program_code})` : ''}
                </option>
              ))}
            </select>
          </div>
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

export default FacultyProfile;

