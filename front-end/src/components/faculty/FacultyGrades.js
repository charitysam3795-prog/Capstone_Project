import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import './FacultyPanel.css';

const FacultyGrades = ({ facultyProfile }) => {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    academic_year: '',
    semester: '',
    subject_id: '',
    section_id: '',
  });
  const [academicYears, setAcademicYears] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [editingGrade, setEditingGrade] = useState(null);
  const [gradeForm, setGradeForm] = useState({ grade: '', status: '' });

  useEffect(() => {
    fetchLookupData();
    fetchEnrollments();
  }, []);

  const fetchLookupData = async () => {
    try {
      const [yearsRes, semestersRes, subjectsRes, sectionsRes] = await Promise.all([
        api.get('/academic-years'),
        api.get('/semesters'),
        api.get('/subjects'),
        api.get('/sections'),
      ]);
      setAcademicYears(yearsRes.data.academic_years || yearsRes.data || []);
      setSemesters(semestersRes.data.semesters || semestersRes.data || []);
      setSubjects(subjectsRes.data.subjects || subjectsRes.data || []);
      setSections(sectionsRes.data.sections || sectionsRes.data || []);
    } catch (error) {
      console.error('Error fetching lookup data:', error);
    }
  };

  const fetchEnrollments = async () => {
    try {
      setLoading(true);
      const response = await api.get('/faculty/enrollments', { params: filters });
      setEnrollments(response.data.enrollments || response.data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching enrollments:', err);
      setError(err.response?.data?.message || 'Failed to load student enrollments.');
      setEnrollments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const applyFilters = () => {
    fetchEnrollments();
  };

  const clearFilters = () => {
    setFilters({
      academic_year: '',
      semester: '',
      subject_id: '',
      section_id: '',
    });
    setTimeout(() => fetchEnrollments(), 100);
  };

  const handleEditGrade = (enrollment) => {
    setEditingGrade(enrollment.enrollment_id);
    setGradeForm({
      grade: enrollment.grade || '',
      status: enrollment.status || 'Enrolled',
    });
  };

  const handleCancelEdit = () => {
    setEditingGrade(null);
    setGradeForm({ grade: '', status: '' });
  };

  const handleSaveGrade = async (enrollmentId) => {
    try {
      await api.put(`/faculty/enrollments/${enrollmentId}/grade`, gradeForm);
      setMessage({ type: 'success', text: 'Grade updated successfully!' });
      setEditingGrade(null);
      fetchEnrollments();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Failed to update grade.',
      });
    }
  };

  const getGradeColor = (grade) => {
    if (!grade) return '#666';
    const numGrade = parseFloat(grade);
    if (numGrade >= 90) return '#28a745';
    if (numGrade >= 80) return '#17a2b8';
    if (numGrade >= 70) return '#ffc107';
    return '#dc3545';
  };

  const [message, setMessage] = useState({ type: '', text: '' });

  if (loading) {
    return <div className="loading-message">Loading enrollments...</div>;
  }

  return (
    <div className="faculty-section">
      <div className="section-header">
        <h2>Grade Management</h2>
      </div>

      {message.text && (
        <div className={message.type === 'error' ? 'error-message' : 'success-message'}>
          {message.text}
        </div>
      )}

      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="academic_year">Academic Year:</label>
          <select
            id="academic_year"
            name="academic_year"
            value={filters.academic_year}
            onChange={handleFilterChange}
          >
            <option value="">All Academic Years</option>
            {academicYears.map((year) => (
              <option key={year.academic_year_id} value={year.academic_year_id}>
                {year.academic_year_name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="semester">Semester:</label>
          <select
            id="semester"
            name="semester"
            value={filters.semester}
            onChange={handleFilterChange}
          >
            <option value="">All Semesters</option>
            {semesters.map((sem) => (
              <option key={sem.semester_id} value={sem.semester_id}>
                {sem.semester_name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="subject_id">Subject:</label>
          <select
            id="subject_id"
            name="subject_id"
            value={filters.subject_id}
            onChange={handleFilterChange}
          >
            <option value="">All Subjects</option>
            {subjects.map((subject) => (
              <option key={subject.subject_id} value={subject.subject_id}>
                {subject.subject_code} - {subject.subject_name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="section_id">Section:</label>
          <select
            id="section_id"
            name="section_id"
            value={filters.section_id}
            onChange={handleFilterChange}
          >
            <option value="">All Sections</option>
            {sections.map((section) => (
              <option key={section.section_id} value={section.section_id}>
                {section.section_name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-actions">
          <button onClick={applyFilters} className="button button-primary">
            Apply Filters
          </button>
          <button type="button" onClick={clearFilters} className="button button-secondary">
            Clear filters
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {enrollments.length === 0 && !loading && (
        <div className="empty-state">
          <p>No student enrollments found. You will see enrollments for your assigned classes here.</p>
        </div>
      )}

      {enrollments.length > 0 && (
        <div className="grades-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Student Name</th>
                <th>Subject Code</th>
                <th>Subject Name</th>
                <th>Section</th>
                <th>Academic Year</th>
                <th>Semester</th>
                <th>Grade</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((enrollment) => (
                <tr key={enrollment.enrollment_id}>
                  <td>
                    {enrollment.student?.student_id_number || enrollment.student_id_number || 'N/A'}
                  </td>
                  <td>
                    {enrollment.student
                      ? `${enrollment.student.first_name || ''} ${enrollment.student.middle_name || ''} ${enrollment.student.last_name || ''}`.trim() || enrollment.student.full_name
                      : 'N/A'}
                  </td>
                  <td>{enrollment.subject?.subject_code || enrollment.subject_code || 'N/A'}</td>
                  <td>{enrollment.subject?.subject_name || enrollment.subject_name || 'N/A'}</td>
                  <td>{enrollment.section?.section_name || enrollment.section_name || 'N/A'}</td>
                  <td>{enrollment.academic_year?.academic_year_name || enrollment.academic_year_name || 'N/A'}</td>
                  <td>{enrollment.semester?.semester_name || enrollment.semester_name || 'N/A'}</td>
                  <td>
                    {editingGrade === enrollment.enrollment_id ? (
                      <input
                        type="text"
                        value={gradeForm.grade}
                        onChange={(e) => setGradeForm({ ...gradeForm, grade: e.target.value })}
                        placeholder="Enter grade"
                        style={{ width: '80px' }}
                      />
                    ) : (
                      <span style={{ color: getGradeColor(enrollment.grade), fontWeight: 'bold' }}>
                        {enrollment.grade || 'N/A'}
                      </span>
                    )}
                  </td>
                  <td>
                    {editingGrade === enrollment.enrollment_id ? (
                      <select
                        value={gradeForm.status}
                        onChange={(e) => setGradeForm({ ...gradeForm, status: e.target.value })}
                      >
                        <option value="Enrolled">Enrolled</option>
                        <option value="Completed">Completed</option>
                        <option value="Dropped">Dropped</option>
                        <option value="Failed">Failed</option>
                      </select>
                    ) : (
                      enrollment.status || 'Enrolled'
                    )}
                  </td>
                  <td>
                    {editingGrade === enrollment.enrollment_id ? (
                      <>
                        <button
                          className="button button-small button-primary"
                          onClick={() => handleSaveGrade(enrollment.enrollment_id)}
                        >
                          Save
                        </button>
                        <button
                          className="button button-small button-secondary"
                          onClick={handleCancelEdit}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="button button-small"
                        onClick={() => handleEditGrade(enrollment)}
                      >
                        Edit Grade
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default FacultyGrades;

