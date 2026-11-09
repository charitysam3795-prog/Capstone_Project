import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import './FacultyPanel.css';

const FacultyClasses = ({ facultyProfile }) => {
  const { user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    academic_year: '',
    semester: '',
    subject: '',
  });
  const [academicYears, setAcademicYears] = useState([]);
  const [semesters, setSemesters] = useState([]);

  useEffect(() => {
    fetchLookupData();
    fetchClasses();
  }, []);

  const fetchLookupData = async () => {
    try {
      const [yearsRes, semestersRes] = await Promise.all([
        api.get('/academic-years'),
        api.get('/semesters'),
      ]);
      setAcademicYears(yearsRes.data.academic_years || yearsRes.data || []);
      setSemesters(semestersRes.data.semesters || semestersRes.data || []);
    } catch (error) {
      console.error('Error fetching lookup data:', error);
    }
  };

  const fetchClasses = async () => {
    try {
      setLoading(true);
      const response = await api.get('/faculty/classes', { params: filters });
      setClasses(response.data.classes || response.data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching classes:', err);
      setError(err.response?.data?.message || 'Failed to load classes. Classes will appear once you are assigned to subjects.');
      setClasses([]);
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
    fetchClasses();
  };

  const clearFilters = () => {
    setFilters({
      academic_year: '',
      semester: '',
      subject: '',
    });
    setTimeout(() => fetchClasses(), 100);
  };

  if (loading) {
    return <div className="loading-message">Loading classes...</div>;
  }

  return (
    <div className="faculty-section">
      <div className="section-header">
        <h2>My Classes</h2>
      </div>

      {facultyProfile && facultyProfile.department && (
        <div className="info-banner">
          <p>
            <strong>Department:</strong> {facultyProfile.department.department_name || 'Not assigned'}
          </p>
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
          <label htmlFor="subject">Subject:</label>
          <input
            type="text"
            id="subject"
            name="subject"
            value={filters.subject}
            onChange={handleFilterChange}
            placeholder="Search by subject code or name"
          />
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

      {classes.length === 0 && !loading && (
        <div className="empty-state">
          <p>No classes found. You will see your assigned classes here once they are assigned to you.</p>
        </div>
      )}

      {classes.length > 0 && (
        <div className="classes-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Subject Code</th>
                <th>Subject Name</th>
                <th>Section</th>
                <th>Academic Year</th>
                <th>Semester</th>
                <th>Students Enrolled</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((classItem) => (
                <tr key={classItem.id || `${classItem.subject_id}-${classItem.section_id}`}>
                  <td>{classItem.subject?.subject_code || classItem.subject_code || 'N/A'}</td>
                  <td>{classItem.subject?.subject_name || classItem.subject_name || 'N/A'}</td>
                  <td>{classItem.section?.section_name || classItem.section_name || 'N/A'}</td>
                  <td>{classItem.academic_year?.academic_year_name || classItem.academic_year_name || 'N/A'}</td>
                  <td>{classItem.semester?.semester_name || classItem.semester_name || 'N/A'}</td>
                  <td>{classItem.student_count || 0}</td>
                  <td>
                    <button
                      className="button button-small"
                      onClick={() => {
                        // Navigate to view students or grades for this class
                        window.location.href = `#grades?class=${classItem.id}`;
                      }}
                    >
                      View Students
                    </button>
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

export default FacultyClasses;

