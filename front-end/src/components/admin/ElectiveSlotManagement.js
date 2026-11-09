import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/axios';
import { swalConfirm, swalToast, swalError } from '../../utils/swal';
import SearchableSelect from '../common/SearchableSelect';
import ClientPaginationBar from '../common/ClientPaginationBar';
import useDialogFocus from '../../hooks/useDialogFocus';
import './ElectiveSlotManagement.css';

const ElectiveSlotManagement = ({ lockedProgramId = null } = {}) => {
  const scopedProgramId =
    lockedProgramId != null && String(lockedProgramId).trim() !== ''
      ? String(lockedProgramId)
      : '';

  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const slotModalRef = useRef(null);
  const subjectModalRef = useRef(null);
  useDialogFocus(showModal, slotModalRef, null, () => {
    setShowModal(false);
    setFormSubjects([]);
  });
  useDialogFocus(showSubjectModal, subjectModalRef, null, () => setShowSubjectModal(false));
  const [editingItem, setEditingItem] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [formData, setFormData] = useState({});
  const [formSubjects, setFormSubjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(10);
  const [lookupData, setLookupData] = useState({
    programs: [],
    semesters: [],
    yearLevels: [],
    subjects: [],
    tracks: [],
  });
  const [assignSubjectPickerKey, setAssignSubjectPickerKey] = useState(0);

  const programSelectOptions = useMemo(
    () =>
      (lookupData.programs || [])
        .filter((p) => !scopedProgramId || String(p.program_id) === scopedProgramId)
        .map((p) => ({
          value: String(p.program_id),
          label: `${p.program_code} - ${p.program_name}`,
        })),
    [lookupData.programs, scopedProgramId],
  );

  const trackSelectOptions = useMemo(
    () =>
      (lookupData.tracks || []).map((t) => ({
        value: String(t.track_id),
        label: t.track_name || t.track_code || `Track ${t.track_id}`,
      })),
    [lookupData.tracks],
  );

  const assignSubjectModalOptions = useMemo(() => {
    if (!selectedSlot) return [];
    return (lookupData.subjects || [])
      .filter(
        (subject) =>
          !selectedSlot.electiveSubjects?.some((es) => es.subject_id === subject.subject_id),
      )
      .map((subject) => ({
        value: String(subject.subject_id),
        label: `${subject.subject_code} - ${subject.subject_name}`,
      }));
  }, [lookupData.subjects, selectedSlot]);

  const programScopedSlots = useMemo(() => {
    if (!scopedProgramId) return slots;
    return slots.filter(
      (slot) =>
        String(slot.program_id ?? slot.program?.program_id ?? '') === scopedProgramId,
    );
  }, [slots, scopedProgramId]);

  const filteredSlots = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return programScopedSlots;

    return programScopedSlots.filter((slot) => {
      const electiveSubjects = slot.electiveSubjects || [];
      const subjectText = electiveSubjects
        .map((es) =>
          [
            es.subject?.subject_code,
            es.subject?.subject_name,
            es.track?.track_name,
            es.track?.track_code,
          ]
            .filter(Boolean)
            .join(' '),
        )
        .join(' ');

      const searchable = [
        slot.slot_name,
        slot.status,
        slot.program?.program_code,
        slot.program?.program_name,
        slot.yearLevel?.year_level,
        slot.semester?.semester_name,
        subjectText,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(q);
    });
  }, [programScopedSlots, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredSlots.length / listPageSize));
  const effectivePage = Math.min(Math.max(1, listPage), totalPages);
  const paginatedSlots = useMemo(() => {
    const start = (effectivePage - 1) * listPageSize;
    return filteredSlots.slice(start, start + listPageSize);
  }, [filteredSlots, effectivePage, listPageSize]);

  useEffect(() => {
    fetchSlots();
    fetchLookupData();
  }, []);

  useEffect(() => {
    setListPage(1);
  }, [searchTerm, listPageSize, programScopedSlots.length]);

  const fetchLookupData = async () => {
    try {
      const [programsResp, semestersResp, yearLevelsResp, subjectsResp, tracksResp] = await Promise.allSettled([
        api.get('/lookup/programs'),
        api.get('/lookup/semesters'),
        api.get('/lookup/year-levels'),
        api.get('/lookup/subjects'),
        api.get('/lookup/tracks'),
      ]);

      setLookupData({
        programs: programsResp.status === 'fulfilled' ? (programsResp.value.data || []) : [],
        semesters: semestersResp.status === 'fulfilled' ? (semestersResp.value.data || []) : [],
        yearLevels: yearLevelsResp.status === 'fulfilled' ? (yearLevelsResp.value.data || []) : [],
        subjects: subjectsResp.status === 'fulfilled' ? (subjectsResp.value.data || []) : [],
        tracks: tracksResp.status === 'fulfilled' ? (tracksResp.value.data || []) : [],
      });
    } catch (err) {
      console.error('Error fetching lookup data:', err);
    }
  };

  const fetchSlots = async () => {
    try {
      setLoading(true);
      const response = await api.get('/elective-slots');
      // Normalize the data to use camelCase
      const normalizedSlots = (response.data || [])
        .map((slot) => ({
          ...slot,
          electiveSubjects: slot.electiveSubjects || slot.elective_subjects || [],
        }))
        .sort(
          (a, b) =>
            Number(b?.elective_slot_id || 0) - Number(a?.elective_slot_id || 0),
        );
      setSlots(normalizedSlots);
    } catch (err) {
      console.error('Error fetching elective slots:', err);
      setError('Failed to fetch elective slots');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({
      program_id: scopedProgramId || '',
      semester_id: '',
      year_level_id: '',
      slot_name: '',
      status: 'active',
    });
    setFormSubjects([]);
    setShowModal(true);
  };

  const handleEdit = (slot) => {
    setEditingItem(slot);
    setFormData({
      program_id: slot.program_id,
      semester_id: slot.semester_id,
      year_level_id: slot.year_level_id,
      slot_name: slot.slot_name,
      status: slot.status || 'active',
    });
    // Initialize form subjects from existing slot subjects
    const initialSubjects = (slot.electiveSubjects || []).map(es => ({
      subject_id: es.subject_id,
      track_id: es.track_id || '',
      description: es.description || '',
    }));
    setFormSubjects(initialSubjects);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    const ok = await swalConfirm({
      title: 'Delete elective slot?',
      text: 'Are you sure you want to delete this elective slot?',
      confirmButtonText: 'Delete',
    });
    if (!ok) return;
    try {
      await api.delete(`/elective-slots/${id}`);
      fetchSlots();
      swalToast('success', 'Elective slot deleted');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete elective slot';
      setError(msg);
      await swalError('Delete failed', msg);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      let slotId;
      const payload = {
        ...formData,
      };
      
      if (editingItem) {
        await api.put(`/elective-slots/${editingItem.elective_slot_id}`, payload);
        slotId = editingItem.elective_slot_id;
      } else {
        const response = await api.post('/elective-slots', payload);
        slotId = response.data.elective_slot_id;
      }
      
      // Handle subjects - remove existing ones and add new ones
      if (editingItem) {
        // Get current subjects and remove them
        const currentSlot = await api.get(`/elective-slots/${slotId}`);
        const currentSubjects = currentSlot.data.electiveSubjects || [];
        for (const es of currentSubjects) {
          await api.delete(`/elective-slots/${slotId}/subjects/${es.subject_id}`).catch(() => {});
        }
      }
      
      // Add new subjects
      for (const subject of formSubjects) {
        if (subject.subject_id) {
          await api.post(`/elective-slots/${slotId}/assign-subject`, {
            subject_id: parseInt(subject.subject_id),
            track_id: subject.track_id ? parseInt(subject.track_id) : null,
            description: subject.description || null,
          }).catch(err => {
            console.error('Error assigning subject:', err);
          });
        }
      }
      
      setShowModal(false);
      setFormSubjects([]);
      // Refresh the slots list to show updated data with subjects
      await fetchSlots();
      swalToast('success', editingItem ? 'Elective slot updated' : 'Elective slot created');
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || `Failed to ${editingItem ? 'update' : 'create'} elective slot`;
      setError(msg);
      await swalError('Save failed', msg);
    }
  };

  const addFormSubject = () => {
    setFormSubjects([...formSubjects, { subject_id: '', track_id: '', description: '' }]);
  };

  const removeFormSubject = (index) => {
    setFormSubjects(formSubjects.filter((_, i) => i !== index));
  };

  const updateFormSubject = (index, field, value) => {
    const updated = [...formSubjects];
    updated[index][field] = value;
    setFormSubjects(updated);
  };

  const handleManageSubjects = async (slot) => {
    try {
      setError('');
      // Fetch the latest slot data with all subjects
      const response = await api.get(`/elective-slots/${slot.elective_slot_id}`);
      setSelectedSlot(response.data);
      setShowSubjectModal(true);
    } catch (err) {
      console.error('Error fetching slot details:', err);
      setError('Failed to load slot details');
      // Fallback to using the slot from the array if API call fails
      setSelectedSlot(slot);
      setShowSubjectModal(true);
    }
  };

  const handleAssignSubject = async (subjectId, trackId = null) => {
    try {
      setError('');
      const response = await api.post(`/elective-slots/${selectedSlot.elective_slot_id}/assign-subject`, {
        subject_id: parseInt(subjectId),
        track_id: trackId ? parseInt(trackId) : null,
      });
      
      // Refresh slots list
      await fetchSlots();
      
      // Update selectedSlot with the new data from response or fetch fresh
      if (response.data?.slot) {
        setSelectedSlot(response.data.slot);
      } else {
        // Fallback: fetch the slot again
        const slotResponse = await api.get(`/elective-slots/${selectedSlot.elective_slot_id}`);
        setSelectedSlot(slotResponse.data);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 
                      err.response?.data?.message || 
                      (err.response?.data?.errors ? JSON.stringify(err.response.data.errors) : 'Failed to assign subject to slot');
      setError(errorMsg);
      console.error('Error assigning subject:', err);
      console.error('Error response:', err.response?.data);
      await swalError('Assign failed', errorMsg);
    }
  };

  const handleRemoveSubject = async (subjectId) => {
    const ok = await swalConfirm({
      title: 'Remove subject?',
      text: 'Remove this subject from the elective slot?',
      confirmButtonText: 'Remove',
    });
    if (!ok) return;
    try {
      setError('');
      await api.delete(`/elective-slots/${selectedSlot.elective_slot_id}/subjects/${subjectId}`);
      
      // Refresh slots and update selected slot
      await fetchSlots();
      
      // Update selectedSlot with the new data
      const updatedSlots = await api.get('/elective-slots');
      const updatedSlot = updatedSlots.data.find(s => s.elective_slot_id === selectedSlot.elective_slot_id);
      if (updatedSlot) {
        setSelectedSlot(updatedSlot);
      }
      swalToast('success', 'Subject removed from slot');
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to remove subject from slot';
      setError(errorMsg);
      console.error('Error removing subject:', err);
      await swalError('Remove failed', errorMsg);
    }
  };

  if (loading && slots.length === 0) {
    return <div className="loading">Loading elective slots...</div>;
  }

  return (
    <div className="elective-slot-management" data-tour="page-elective-slots">
      <div className="management-header">
        <h2>Elective Slot Management</h2>
        <button className="add-button" onClick={handleAdd}>
          Add Elective Slot
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="elective-slot-toolbar">
        <div className="elective-slot-search">
          <i className="fa-solid fa-magnifying-glass elective-slot-search__icon" aria-hidden />
          <input
            className="elective-slot-search__input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search elective slots by name, program, semester, or subject..."
            aria-label="Search elective slots"
          />
        </div>
        <span className="elective-slot-toolbar__count">
          {filteredSlots.length} of {programScopedSlots.length} slot(s)
        </span>
        {searchTerm ? (
          <button
            type="button"
            className="elective-slot-search__clear"
            onClick={() => setSearchTerm('')}
          >
            Clear search
          </button>
        ) : null}
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Slot Name</th>
              <th>Program</th>
              <th>Year Level</th>
              <th>Semester</th>
              <th>Status</th>
              <th>Subjects</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {programScopedSlots.length === 0 ? (
              <tr>
                <td colSpan="7" className="no-data">No elective slots found</td>
              </tr>
            ) : filteredSlots.length === 0 ? (
              <tr>
                <td colSpan="7" className="no-data">No elective slots match your search</td>
              </tr>
            ) : (
              paginatedSlots.map((slot) => (
                <tr key={slot.elective_slot_id}>
                  <td>{slot.slot_name}</td>
                  <td>{slot.program?.program_code || slot.program?.program_name || '-'}</td>
                  <td>{slot.yearLevel?.year_level || '-'}</td>
                  <td>{slot.semester?.semester_name || '-'}</td>
                  <td>
                    <span className={`status-badge status-${(slot.status || 'active')?.toLowerCase()}`}>
                      {slot.status || 'Active'}
                    </span>
                  </td>
                  <td>
                    {slot.electiveSubjects && slot.electiveSubjects.length > 0 ? (
                      <span className="subject-count">{slot.electiveSubjects.length} subject(s)</span>
                    ) : (
                      <span className="no-subjects">No subjects</span>
                    )}
                  </td>
                  <td>
                    <div className="actions">
                    <button className="manage-button" onClick={() => handleManageSubjects(slot)}>
                      Manage Subjects
                    </button>
                    <button className="edit-button" onClick={() => handleEdit(slot)}>
                      Edit
                    </button>
                    <button className="delete-button" onClick={() => handleDelete(slot.elective_slot_id)}>
                      Delete
                    </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filteredSlots.length > 0 && (
        <ClientPaginationBar
          page={effectivePage}
          pageSize={listPageSize}
          totalItems={filteredSlots.length}
          totalPages={totalPages}
          onPageChange={setListPage}
          onPageSizeChange={(n) => {
            setListPageSize(n);
            setListPage(1);
          }}
          pageSizeOptions={[10, 25, 50, 100]}
        />
      )}

      {showModal &&
        createPortal(
          <div className="elective-slot-management">
            <div
              className="modal-overlay"
              onClick={() => {
                setShowModal(false);
                setFormSubjects([]);
              }}
            >
          <div
            ref={slotModalRef}
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="elective-slot-modal-title"
            tabIndex="-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="elective-slot-modal-title">{editingItem ? 'Edit' : 'Add'} Elective Slot</h3>
              <button
                type="button"
                className="close-button"
                aria-label="Close elective slot form"
                onClick={() => {
                  setShowModal(false);
                  setFormSubjects([]);
                }}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              {error && <div className="error-message">{error}</div>}

              <div className="form-group">
                <label htmlFor="elective-slot-name">Slot Name <span className="required">*</span></label>
                <input
                  id="elective-slot-name"
                  type="text"
                  value={formData.slot_name || ''}
                  onChange={(e) => setFormData({ ...formData, slot_name: e.target.value })}
                  placeholder="e.g., IT Electives 1"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="esm-slot-program">Program <span className="required">*</span></label>
                <SearchableSelect
                  id="esm-slot-program"
                  value={formData.program_id === '' || formData.program_id == null ? '' : String(formData.program_id)}
                  onChange={(v) => {
                    if (scopedProgramId) return;
                    setFormData({ ...formData, program_id: v });
                  }}
                  options={programSelectOptions}
                  emptyLabel="Select Program"
                  placeholder="Search program…"
                  required
                  disabled={Boolean(scopedProgramId)}
                  aria-label="Program"
                />
              </div>

              <div className="form-group">
                <label htmlFor="elective-slot-year">Year Level <span className="required">*</span></label>
                <select
                  id="elective-slot-year"
                  value={formData.year_level_id || ''}
                  onChange={(e) => setFormData({ ...formData, year_level_id: e.target.value })}
                  required
                >
                  <option value="">Select Year Level</option>
                  {lookupData.yearLevels.map((yl) => (
                    <option key={yl.year_level_id} value={yl.year_level_id}>
                      {yl.year_level}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="elective-slot-semester">Semester <span className="required">*</span></label>
                <select
                  id="elective-slot-semester"
                  value={formData.semester_id || ''}
                  onChange={(e) => setFormData({ ...formData, semester_id: e.target.value })}
                  required
                >
                  <option value="">Select Semester</option>
                  {lookupData.semesters.map((semester) => (
                    <option key={semester.semester_id} value={semester.semester_id}>
                      {semester.semester_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="elective-slot-status">Status</label>
                <select
                  id="elective-slot-status"
                  value={formData.status || 'active'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label>Subjects</label>
                  <button type="button" onClick={addFormSubject} className="add-detail-button" style={{ padding: '6px 12px', fontSize: '12px' }}>
                    + Add Subject
                  </button>
                </div>
                {formSubjects.length === 0 ? (
                  <p style={{ color: '#666', fontStyle: 'italic', fontSize: '14px' }}>No subjects added. Click "Add Subject" to add subjects to this slot.</p>
                ) : (
                  <div className="subjects-list">
                    {formSubjects.map((subject, index) => (
                      <div key={index} className="subject-form-row" style={{ 
                        display: 'flex', 
                        gap: '10px', 
                        marginBottom: '10px',
                        padding: '10px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        backgroundColor: '#f9f9f9'
                      }}>
                        <div style={{ flex: '2', minWidth: 0 }}>
                          <SearchableSelect
                            id={`esm-form-subj-${index}`}
                            value={subject.subject_id === '' || subject.subject_id == null ? '' : String(subject.subject_id)}
                            onChange={(v) => updateFormSubject(index, 'subject_id', v)}
                            options={(lookupData.subjects || [])
                              .filter(
                                (s) =>
                                  !formSubjects.some(
                                    (fs, i) =>
                                      i !== index && String(fs.subject_id) === String(s.subject_id),
                                  ),
                              )
                              .map((s) => ({
                                value: String(s.subject_id),
                                label: `${s.subject_code} - ${s.subject_name}`,
                              }))}
                            emptyLabel="Select Subject"
                            placeholder="Search subject…"
                            required
                            aria-label={`Subject ${index + 1}`}
                          />
                        </div>
                        <div style={{ flex: '1', minWidth: 0 }}>
                          <SearchableSelect
                            id={`esm-form-track-${index}`}
                            value={subject.track_id === '' || subject.track_id == null ? '' : String(subject.track_id)}
                            onChange={(v) => updateFormSubject(index, 'track_id', v)}
                            options={trackSelectOptions}
                            emptyLabel="No Track"
                            placeholder="Search track…"
                            aria-label={`Track ${index + 1}`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFormSubject(index)}
                          className="remove-detail-button"
                          style={{ padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-actions">
                <button type="button" className="cancel-button" onClick={() => {
                  setShowModal(false);
                  setFormSubjects([]);
                }}>
                  Cancel
                </button>
                <button type="submit" className="submit-button">
                  {editingItem ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
          </div>,
          document.body
        )}

      {showSubjectModal &&
        selectedSlot &&
        createPortal(
          <div className="elective-slot-management">
            <div className="modal-overlay" onClick={() => setShowSubjectModal(false)}>
          <div
            ref={subjectModalRef}
            className="modal-content large-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="elective-subject-modal-title"
            tabIndex="-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="elective-subject-modal-title">Manage Subjects - {selectedSlot.slot_name}</h3>
              <button
                type="button"
                className="close-button"
                onClick={() => setShowSubjectModal(false)}
                aria-label="Close subject management dialog"
              >
                ×
              </button>
            </div>
            <div className="modal-form">
              <div className="subject-assignment">
                <div className="form-group">
                  <label>Assign Subject</label>
                  <div className="assign-subject-controls">
                    <SearchableSelect
                      key={assignSubjectPickerKey}
                      id="esm-assign-subject"
                      value=""
                      onChange={(v) => {
                        if (v) {
                          handleAssignSubject(v);
                          setAssignSubjectPickerKey((k) => k + 1);
                        }
                      }}
                      options={assignSubjectModalOptions}
                      emptyLabel="Select Subject to Add"
                      placeholder="Search subject to add…"
                      aria-label="Subject to assign to slot"
                    />
                  </div>
                </div>

                <div className="assigned-subjects">
                  <h4>Assigned Subjects ({selectedSlot.electiveSubjects?.length || 0})</h4>
                  {selectedSlot.electiveSubjects && selectedSlot.electiveSubjects.length > 0 ? (
                    <table className="subjects-table">
                      <thead>
                        <tr>
                          <th>Subject Code</th>
                          <th>Subject Name</th>
                          <th>Track</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSlot.electiveSubjects.map((es) => (
                          <tr key={es.elective_subject_id}>
                            <td>{es.subject?.subject_code || '-'}</td>
                            <td>{es.subject?.subject_name || '-'}</td>
                            <td>{es.track?.track_name || '-'}</td>
                            <td>
                              <button
                                className="remove-button"
                                onClick={() => handleRemoveSubject(es.subject_id)}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="no-subjects-message">No subjects assigned to this slot yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default ElectiveSlotManagement;

