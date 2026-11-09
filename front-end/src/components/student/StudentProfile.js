import React, { useState, useEffect, useMemo } from 'react';
import { swalSuccess, swalError } from '../../utils/swal';
import {
  digitsOnlyContact,
  findUnsafeFormField,
  validateContactNumber,
} from '../../utils/inputValidation';
import useRecoverableFormDraft from '../../hooks/useRecoverableFormDraft';
import { recoverableDraftKey } from '../../utils/networkRecoverability';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import ProfileChangePassword from '../common/ProfileChangePassword';
import './StudentProfile.css';

const StudentProfile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [yearLevels, setYearLevels] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [formData, setFormData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    contact_number: '',
    student_id_number: '',
    address: '',
    academic_status: '',
    year_level_id: '',
    track_id: '',
  });

  const studentProfileDraftKey = recoverableDraftKey([
    'student-profile',
    user?.user_id || user?.id || 'self',
  ]);
  const { clearDraft: clearStudentProfileDraft } = useRecoverableFormDraft({
    draftKey: studentProfileDraftKey,
    formData,
    setFormData,
    enabled: !loading,
  });

  useEffect(() => {
    fetchProfile();
    fetchProfileOptions();
  }, []);

  const fetchProfileOptions = async () => {
    try {
      const response = await api.get('/students/profile-options');
      setYearLevels(response.data?.year_levels || []);
      setTracks(response.data?.tracks || []);
    } catch (err) {
      console.error('Error fetching profile options:', err);
    }
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      // Assuming there's an endpoint to get student profile by user_id
      const response = await api.get(`/students/profile`);
      setProfile(response.data);
      setFormData({
        first_name: response.data.first_name || '',
        middle_name: response.data.middle_name || '',
        last_name: response.data.last_name || '',
        contact_number: response.data.contact_number || '',
        student_id_number: response.data.student_id_number || '',
        address: response.data.address || '',
        academic_status: response.data.academic_status || '',
        year_level_id: response.data.year_level_id || '',
        track_id: response.data.track_id || '',
      });
      setError(null);
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError(err.response?.data?.message || 'Failed to load profile');
      // If profile doesn't exist yet, set empty state
      if (err.response?.status === 404) {
        setProfile(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const next = name === 'contact_number' ? digitsOnlyContact(value) : value;
    setFormData((prev) => ({
      ...prev,
      [name]: next,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const unsafeMsg = findUnsafeFormField(formData, {
        skipKeys: ['academic_status', 'year_level_id', 'track_id'],
        labelMap: {
          first_name: 'First name',
          last_name: 'Last name',
          middle_name: 'Middle name',
          address: 'Address',
          student_id_number: 'Student ID',
        },
      });
      if (unsafeMsg) {
        setError(unsafeMsg);
        await swalError('Invalid input', unsafeMsg);
        setSaving(false);
        return;
      }
      const contactCheck = validateContactNumber(formData.contact_number);
      if (!contactCheck.ok) {
        setError(contactCheck.message);
        await swalError('Invalid contact number', contactCheck.message);
        setSaving(false);
        return;
      }

      const payload = {
        ...formData,
        contact_number: contactCheck.value || null,
        year_level_id: formData.year_level_id ? Number(formData.year_level_id) : null,
        track_id: formData.track_id ? Number(formData.track_id) : null,
      };

      if (profile) {
        // Update existing profile
        await api.put(`/students/profile`, payload);
      } else {
        // Create new profile
        await api.post(`/students/profile`, payload);
      }
      clearStudentProfileDraft();
      await fetchProfile();
      await swalSuccess('Saved', 'Profile saved successfully.');
    } catch (err) {
      console.error('Error saving profile:', err);
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        (!err.response
          ? 'Network interrupted — your profile inputs were kept. Reconnect and save again.'
          : 'Failed to save profile');
      setError(msg);
      await swalError('Could not save profile', msg);
    } finally {
      setSaving(false);
    }
  };

  /** Same `track_id` as dean/program head sets — show whenever catalog has tracks (not only 3rd year). */
  const showTrackField = tracks.length > 0;
  const trackSelectValue =
    formData.track_id === '' || formData.track_id == null ? '' : String(formData.track_id);

  const displayName = useMemo(() => {
    const parts = [formData.first_name, formData.middle_name, formData.last_name]
      .map((s) => (s || '').trim())
      .filter(Boolean);
    if (parts.length) return parts.join(' ');
    return 'Your profile';
  }, [formData.first_name, formData.middle_name, formData.last_name]);

  const avatarLetter = (formData.first_name || formData.last_name || user?.email || '?')
    .toString()
    .trim()
    .charAt(0)
    .toUpperCase();

  if (loading) {
    return <div className="loading-message">Loading profile...</div>;
  }

  return (
    <div className="student-profile" data-tour="page-student-profile">
      <div className="student-profile-hero">
        <div className="student-profile-avatar" aria-hidden>
          {avatarLetter}
        </div>
        <div className="student-profile-hero-text">
          <h2>{displayName}</h2>
          {user?.email ? <p className="student-profile-email">{user.email}</p> : null}
          {formData.student_id_number ? (
            <span className="student-profile-id-pill">{formData.student_id_number}</span>
          ) : (
            <span className="student-profile-id-pill">ID pending</span>
          )}
        </div>
      </div>

      {error ? <div className="error-message">{error}</div> : null}

      <form onSubmit={handleSubmit} className="profile-form student-profile-form">
        <section className="student-profile-section" aria-labelledby="student-profile-personal-heading">
          <h3 id="student-profile-personal-heading" className="student-profile-section-title">
            Personal information
          </h3>
          <div className="student-profile-grid">
            <div className="form-group student-profile-field--full">
              <label htmlFor="student_id_number">Student ID number</label>
              <input
                type="text"
                id="student_id_number"
                name="student_id_number"
                value={formData.student_id_number}
                onChange={handleInputChange}
                disabled={!!profile?.student_id_number}
                className={profile?.student_id_number ? 'student-profile-input--locked' : undefined}
                required
                placeholder="Enter student ID number"
              />
              {profile?.student_id_number ? (
                <span className="student-profile-hint">Student ID cannot be changed after it is set.</span>
              ) : null}
            </div>

            <div className="form-group">
              <label htmlFor="first_name">First name</label>
              <input
                type="text"
                id="first_name"
                name="first_name"
                value={formData.first_name}
                onChange={handleInputChange}
                required
                placeholder="First name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="middle_name">Middle name</label>
              <input
                type="text"
                id="middle_name"
                name="middle_name"
                value={formData.middle_name}
                onChange={handleInputChange}
                placeholder="Optional"
              />
            </div>

            <div className="form-group student-profile-field--full">
              <label htmlFor="last_name">Last name</label>
              <input
                type="text"
                id="last_name"
                name="last_name"
                value={formData.last_name}
                onChange={handleInputChange}
                required
                placeholder="Last name"
              />
            </div>
          </div>
        </section>

        <section className="student-profile-section" aria-labelledby="student-profile-contact-heading">
          <h3 id="student-profile-contact-heading" className="student-profile-section-title">
            Contact &amp; address
          </h3>
          <div className="student-profile-grid">
            <div className="form-group student-profile-field--full">
              <label htmlFor="contact_number">Contact number</label>
              <input
                type="tel"
                id="contact_number"
                name="contact_number"
                value={formData.contact_number}
                onChange={handleInputChange}
                placeholder="11 digits only (e.g. 09123456789)"
                inputMode="numeric"
                maxLength={11}
              />
            </div>
            <div className="form-group student-profile-field--full">
              <label htmlFor="address">Address</label>
              <textarea
                id="address"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                placeholder="Street, city, region"
                rows={3}
              />
            </div>
          </div>
        </section>

        <section
          className="student-profile-section student-profile-section--readonly"
          aria-labelledby="student-profile-academic-heading"
        >
          <h3 id="student-profile-academic-heading" className="student-profile-section-title">
            Academic record
          </h3>
          <div className="student-profile-grid">
            <div className="form-group student-profile-field--full">
              <label htmlFor="student_program_readonly">Program</label>
              <input
                type="text"
                id="student_program_readonly"
                className="student-profile-input--locked"
                value={
                  profile?.program
                    ? `${profile.program.program_name || '—'}${
                        profile.program.program_code ? ` (${profile.program.program_code})` : ''
                      }`
                    : '—'
                }
                disabled
                readOnly
              />
            </div>

            <div className="form-group">
              <label htmlFor="academic_status">Academic status (on record)</label>
              <select
                id="academic_status"
                name="academic_status"
                value={formData.academic_status}
                onChange={handleInputChange}
                disabled
                className="student-profile-input--locked"
              >
                <option value="">Select status</option>
                <option value="Regular">Regular</option>
                <option value="Irregular">Irregular</option>
                <option value="Probationary">Probationary</option>
                <option value="On Leave">On Leave</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="year_level_id">Year level</label>
              <select
                id="year_level_id"
                name="year_level_id"
                value={formData.year_level_id}
                onChange={handleInputChange}
                disabled
                className="student-profile-input--locked"
              >
                <option value="">—</option>
                {yearLevels.map((yearLevel) => (
                  <option key={yearLevel.year_level_id} value={yearLevel.year_level_id}>
                    {yearLevel.year_level}
                  </option>
                ))}
              </select>
            </div>

            {showTrackField ? (
              <div className="form-group student-profile-field--full student-profile-track-field">
                <label htmlFor="track_id">Track</label>
                <select
                  id="track_id"
                  name="track_id"
                  value={trackSelectValue}
                  onChange={handleInputChange}
                  disabled
                  className="student-profile-input--locked"
                  aria-readonly="true"
                  title="Assigned by your dean or program head"
                >
                  <option value="">—</option>
                  {tracks.map((track) => (
                    <option key={track.track_id} value={String(track.track_id)}>
                      {track.track_name}
                      {track.track_code ? ` (${track.track_code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </section>

        <div className="form-actions student-profile-actions">
          <button type="submit" className="save-button" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
      <ProfileChangePassword />
    </div>
  );
};

export default StudentProfile;

