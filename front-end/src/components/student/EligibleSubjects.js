import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import './EligibleSubjects.css';

const EligibleSubjects = () => {
  const { user } = useAuth();
  const [eligibleSubjects, setEligibleSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [yearLevels, setYearLevels] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [filters, setFilters] = useState({
    year_level_id: '',
    semester_id: '',
    academic_year_id: '',
  });

  useEffect(() => {
    fetchLookupData();
  }, []);

  const fetchLookupData = async () => {
    try {
      const [yearLevelsResp, semestersResp, academicYearsResp] = await Promise.allSettled([
        api.get('/lookup/year-levels'),
        api.get('/lookup/semesters'),
        api.get('/lookup/academic-years'),
      ]);

      if (yearLevelsResp.status === 'fulfilled') {
        setYearLevels(yearLevelsResp.value.data || []);
      }
      if (semestersResp.status === 'fulfilled') {
        setSemesters(semestersResp.value.data || []);
      }
      if (academicYearsResp.status === 'fulfilled') {
        setAcademicYears(academicYearsResp.value.data || []);
      }
    } catch (err) {
      console.error('Error fetching lookup data:', err);
    }
  };

  const fetchEligibleSubjects = async () => {
    if (!filters.year_level_id || !filters.semester_id) {
      setError('Please select both Year Level and Semester');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const params = {
        year_level_id: filters.year_level_id,
        semester_id: filters.semester_id,
      };
      if (filters.academic_year_id) {
        params.academic_year_id = filters.academic_year_id;
      }

      const response = await api.get('/students/eligible-subjects', { params });
      setEligibleSubjects(response.data.eligible_subjects || []);
    } catch (err) {
      console.error('Error fetching eligible subjects:', err);
      setError(err.response?.data?.message || 'Failed to load eligible subjects');
      setEligibleSubjects([]);
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

  const handleSearch = () => {
    fetchEligibleSubjects();
  };

  return (
    <div className="eligible-subjects-container">
      <h2>Eligible Subjects for Enrollment</h2>
      <p className="description">
        This page shows subjects you can enroll in based on:
        <br />
        1. Subjects from your curriculum (by year level and semester)
        <br />
        2. Whether each subject is offered
        <br />
        3. Prerequisite validation (recursive checking)
        <br />
        4. Your completed subjects
      </p>

      <div className="filters-section">
        <div className="filter-group">
          <label>Year Level <span className="required">*</span></label>
          <select
            name="year_level_id"
            value={filters.year_level_id}
            onChange={handleFilterChange}
            required
          >
            <option value="">Select Year Level</option>
            {yearLevels.map((yl) => (
              <option key={yl.year_level_id} value={yl.year_level_id}>
                {yl.year_level}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Semester <span className="required">*</span></label>
          <select
            name="semester_id"
            value={filters.semester_id}
            onChange={handleFilterChange}
            required
          >
            <option value="">Select Semester</option>
            {semesters.map((sem) => (
              <option key={sem.semester_id} value={sem.semester_id}>
                {sem.semester_name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Academic Year (Optional)</label>
          <select
            name="academic_year_id"
            value={filters.academic_year_id}
            onChange={handleFilterChange}
          >
            <option value="">All Academic Years</option>
            {academicYears.map((ay) => (
              <option key={ay.academic_year_id || ay.id} value={ay.academic_year_id || ay.id}>
                {ay.name || ay.academic_year_name}
              </option>
            ))}
          </select>
        </div>

        <button className="search-button" onClick={handleSearch} disabled={loading}>
          {loading ? 'Loading...' : 'Search Eligible Subjects'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading && <div className="loading-message">Loading eligible subjects...</div>}

      {!loading && eligibleSubjects.length > 0 && (
        <div className="subjects-grid">
          {eligibleSubjects.map((subject) => (
            <div
              key={subject.curriculum_id || subject.subject_id}
              className={`subject-card ${subject.can_take ? 'eligible' : 'not-eligible'} ${
                !subject.is_offered ? 'not-offered' : ''
              }`}
            >
              <div className="subject-header">
                <span className="subject-code">{subject.subject_code}</span>
                <span className="subject-units">{subject.number_of_units || 0} units</span>
              </div>
              <div className="subject-name">{subject.subject_name}</div>

              <div className="subject-status">
                {subject.is_offered ? (
                  <span className="status-badge offered">✓ Offered</span>
                ) : (
                  <span className="status-badge not-offered-badge">✗ Not Offered</span>
                )}
                {subject.can_take ? (
                  <span className="status-badge eligible-badge">✓ Can Enroll</span>
                ) : (
                  <span className="status-badge not-eligible-badge">✗ Cannot Enroll</span>
                )}
              </div>

              <div className="subject-details">
                {subject.all_prerequisites && subject.all_prerequisites.length > 0 && (
                  <div className="detail-row">
                    <span className="detail-label">Prerequisites:</span>
                    <span className="prerequisites-list">
                      {subject.all_prerequisites.join(', ')}
                    </span>
                  </div>
                )}

                {subject.missing_prerequisites && subject.missing_prerequisites.length > 0 && (
                  <div className="detail-row missing-prereq">
                    <span className="detail-label">Missing Prerequisites:</span>
                    <span className="missing-prerequisites-list">
                      {subject.missing_prerequisites.join(', ')}
                    </span>
                  </div>
                )}

                {(!subject.all_prerequisites || subject.all_prerequisites.length === 0) && (
                  <div className="detail-row">
                    <span className="detail-label">Prerequisites:</span>
                    <span>None</span>
                  </div>
                )}

                {subject.subject_type && (
                  <div className="detail-row">
                    <span className="detail-label">Type:</span>
                    <span>{subject.subject_type}</span>
                  </div>
                )}

                {subject.passing_grade && (
                  <div className="detail-row">
                    <span className="detail-label">Passing Grade:</span>
                    <span>{subject.passing_grade}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && eligibleSubjects.length === 0 && filters.year_level_id && filters.semester_id && (
        <div className="no-results">
          <p>No eligible subjects found for the selected criteria.</p>
          <p>This could mean:</p>
          <ul>
            <li>No subjects are offered for this year level and semester</li>
            <li>All subjects require prerequisites that you haven't completed</li>
            <li>No subjects are in the curriculum for this combination</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default EligibleSubjects;

