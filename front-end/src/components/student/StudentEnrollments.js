import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';

const StudentEnrollments = () => {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    academic_year: '',
    semester: '',
    status: '',
  });

  useEffect(() => {
    fetchEnrollments();
  }, []);

  const fetchEnrollments = async () => {
    try {
      setLoading(true);
      const response = await api.get('/students/enrollments', { params: filters });
      setEnrollments(response.data.enrollments || response.data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching enrollments:', err);
      setError(err.response?.data?.message || 'Failed to load enrollments');
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
      status: '',
    });
    setTimeout(() => fetchEnrollments(), 100);
  };

  const getGradeColor = (grade) => {
    if (!grade) return '#666';
    const numGrade = parseFloat(grade);
    if (numGrade >= 90) return '#28a745'; // Green
    if (numGrade >= 80) return '#17a2b8'; // Blue
    if (numGrade >= 70) return '#ffc107'; // Yellow
    return '#dc3545'; // Red
  };

  if (loading) {
    return <div className="loading-message">Loading enrollments...</div>;
  }

  return (
    <div className="student-enrollments">
      <div className="enrollments-header">
        <h2>My Enrollments</h2>
      </div>

      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="academic_year">Academic Year:</label>
          <input
            type="text"
            id="academic_year"
            name="academic_year"
            value={filters.academic_year}
            onChange={handleFilterChange}
            placeholder="e.g., 2024-2025"
          />
        </div>
        <div className="filter-group">
          <label htmlFor="semester">Semester:</label>
          <input
            type="text"
            id="semester"
            name="semester"
            value={filters.semester}
            onChange={handleFilterChange}
            placeholder="e.g., 1st Semester"
          />
        </div>
        <div className="filter-group">
          <label htmlFor="status">Status:</label>
          <select
            id="status"
            name="status"
            value={filters.status}
            onChange={handleFilterChange}
          >
            <option value="">All</option>
            <option value="enrolled">Enrolled</option>
            <option value="completed">Completed</option>
            <option value="dropped">Dropped</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div className="filter-actions">
          <button onClick={applyFilters} className="apply-button">
            Apply Filters
          </button>
          <button type="button" onClick={clearFilters} className="clear-button">
            Clear filters
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      {enrollments.length === 0 && !loading && (
        <div className="empty-state">
          <p>No enrollments found.</p>
        </div>
      )}

      {enrollments.length > 0 && (
        <div className="enrollments-table-container">
          <table className="enrollments-table">
            <thead>
              <tr>
                <th>Subject Code</th>
                <th>Subject Name</th>
                <th>Units</th>
                <th>Academic Year</th>
                <th>Semester</th>
                <th>Section</th>
                <th>Grade</th>
                <th>Status</th>
                <th>Enrolled Date</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((enrollment) => (
                <tr key={enrollment.enrollment_id}>
                  <td>{enrollment.subject_code || enrollment.subject?.subject_code || '-'}</td>
                  <td>{enrollment.subject_name || enrollment.subject?.subject_name || '-'}</td>
                  <td>{enrollment.units || enrollment.subject?.number_of_units || '-'}</td>
                  <td>{enrollment.academic_year_name || enrollment.academic_year?.academic_year_name || '-'}</td>
                  <td>{enrollment.semester_name || enrollment.semester?.semester_name || '-'}</td>
                  <td>{enrollment.section_name || enrollment.section?.section_name || '-'}</td>
                  <td style={{ color: getGradeColor(enrollment.grade), fontWeight: 'bold' }}>
                    {enrollment.grade || '-'}
                  </td>
                  <td>
                    <span className={`status-badge status-${enrollment.status?.toLowerCase() || 'enrolled'}`}>
                      {enrollment.status || 'Enrolled'}
                    </span>
                  </td>
                  <td>
                    {enrollment.enrolled_date
                      ? new Date(enrollment.enrolled_date).toLocaleDateString()
                      : '-'}
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

export default StudentEnrollments;

