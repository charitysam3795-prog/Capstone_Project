import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import './DeanPanel.css';
import '../admin/CurriculumManagement.css';

const DeanCurriculumReview = ({ deanProfile }) => {
  const [curricula, setCurricula] = useState([]);
  const [lookupData, setLookupData] = useState({
    programs: [],
    subjects: [],
    yearLevels: [],
    semesters: [],
    requisites: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Get dean's program ID
  const deanProgramId = deanProfile?.program_id;

  useEffect(() => {
    fetchCurricula();
    fetchLookupData();
  }, []);

  useEffect(() => {
    filterCurricula();
  }, [searchTerm, curricula]);

  const fetchCurricula = async () => {
    try {
      setLoading(true);
      const response = await api.get('/curriculum');
      let curriculaData = Array.isArray(response.data) ? response.data : [];
      
      // Filter by dean's program if assigned
      if (deanProgramId) {
        curriculaData = curriculaData.filter(
          (curr) => curr.program_id?.toString() === deanProgramId.toString()
        );
      }
      
      setCurricula(curriculaData);
    } catch (error) {
      console.error('Error fetching curricula:', error);
      setError('Failed to fetch curriculum data');
    } finally {
      setLoading(false);
    }
  };

  const fetchLookupData = async () => {
    try {
      const response = await api.get('/curriculum/lookup/data');
      setLookupData(response.data || {});
    } catch (error) {
      console.error('Error fetching lookup data:', error);
    }
  };

  const filterCurricula = () => {
    if (!searchTerm) {
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = curricula.filter((curr) => {
      const subjectCode = curr.subject?.subject_code?.toLowerCase() || '';
      const subjectName = curr.subject?.subject_name?.toLowerCase() || '';
      return subjectCode.includes(term) || subjectName.includes(term);
    });
    // Note: We're not using filtered state here since searchTerm is optional
  };

  // Helper to resolve requisite label
  const resolveRequisiteLabel = (curriculum) => {
    if (!curriculum.requisite) {
      return '-';
    }

    // Handle both array and single object
    const requisites = Array.isArray(curriculum.requisite) 
      ? curriculum.requisite 
      : [curriculum.requisite];

    if (requisites.length === 0) {
      return '-';
    }

    const requisiteLabels = requisites.map((req) => {
      if (!req) return '';
      const type = (req.requisite_type || req.type || '').toLowerCase();
      const prefix = type === 'prerequisite' ? 'P:' : type === 'corequisite' ? 'Co:' : '';
      const subjectCode = req.requiredSubject?.subject_code || 
                        req.required_subject?.subject_code || 
                        req.subject?.subject_code || '';
      return subjectCode ? `${prefix}${subjectCode}` : '';
    }).filter(label => label !== '');

    return requisiteLabels.length > 0 ? requisiteLabels.join(', ') : '-';
  };

  // Group curricula by program, year level, and semester
  const groupCurriculaByProgramYear = () => {
    if (!Array.isArray(curricula) || curricula.length === 0) {
      return [];
    }

    let filtered = [...curricula];

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((curr) => {
        const subjectCode = curr.subject?.subject_code?.toLowerCase() || '';
        const subjectName = curr.subject?.subject_name?.toLowerCase() || '';
        return subjectCode.includes(term) || subjectName.includes(term);
      });
    }

    const grouped = {};

    filtered.forEach((curriculum) => {
      if (!curriculum) return;

      const programId = curriculum.program_id;
      const programName = curriculum.program?.program_name || 'Unknown Program';
      const yearLevelId = curriculum.year_level?.year_level_id || curriculum.year_level;
      let yearLevelName = curriculum.year_level?.year_level;
      if (!yearLevelName && yearLevelId && lookupData.yearLevels) {
        const yearLevel = lookupData.yearLevels.find(
          (yl) => yl.year_level_id === parseInt(yearLevelId)
        );
        yearLevelName = yearLevel?.year_level;
      }
      yearLevelName = yearLevelName || `Year ${yearLevelId}`;

      const semesterId = curriculum.semester_id;
      let semesterName = curriculum.semester?.semester_name;
      if (!semesterName && semesterId && lookupData.semesters) {
        const semester = lookupData.semesters.find(
          (s) => s.semester_id === parseInt(semesterId)
        );
        semesterName = semester?.semester_name;
      }
      semesterName = semesterName || `Semester ${semesterId}`;

      const key = `${programId}-${yearLevelId}`;

      if (!grouped[key]) {
        grouped[key] = {
          programId,
          programName,
          yearLevelId,
          yearLevelName,
          semesters: {},
        };
      }

      if (!grouped[key].semesters[semesterId]) {
        grouped[key].semesters[semesterId] = {
          semesterId,
          semesterName,
          curricula: [],
        };
      }

      grouped[key].semesters[semesterId].curricula.push(curriculum);
    });

    // Convert to array and sort
    return Object.values(grouped).sort((a, b) => {
      if (a.programName !== b.programName) {
        return a.programName.localeCompare(b.programName);
      }
      return a.yearLevelName.localeCompare(b.yearLevelName);
    });
  };

  const groupedCurricula = groupCurriculaByProgramYear();

  if (loading) {
    return (
      <div className="dean-section">
        <div className="loading-message">Loading curriculum data...</div>
      </div>
    );
  }

  return (
    <div className="dean-section">
      <div className="section-header">
        <h2>Curriculum Review</h2>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Info Banner */}
      {deanProfile && deanProfile.program && (
        <div
          style={{
            padding: '1rem',
            background: '#e8f4f8',
            border: '1px solid #b8daff',
            borderRadius: '5px',
            marginBottom: '1.5rem',
            color: '#004085',
          }}
        >
          <strong>Assigned Program:</strong> {deanProfile.program.program_name}{' '}
          {deanProfile.program.program_code ? `(${deanProfile.program.program_code})` : ''}
          {deanProgramId && (
            <span style={{ marginLeft: '1rem', fontSize: '0.9rem' }}>
              Showing curriculum for your assigned program only.
            </span>
          )}
        </div>
      )}

      {/* Search */}
      <div className="filters-section" style={{ marginBottom: '2rem' }}>
        <div className="form-group" style={{ flex: '1', minWidth: '250px' }}>
          <label>Search</label>
          <input
            type="text"
            placeholder="Search by subject code or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {searchTerm && (
          <button
            className="button button-secondary"
            onClick={() => setSearchTerm('')}
            style={{ alignSelf: 'flex-end', marginBottom: '0' }}
          >
            Clear Search
          </button>
        )}
      </div>

      {/* Display grouped tables */}
      {groupedCurricula.length === 0 ? (
        <div className="empty-state">No curriculum data found</div>
      ) : (
        groupedCurricula.map((yearGroup) => {
          if (!yearGroup || !yearGroup.semesters) return null;

          const semesterIds = Object.keys(yearGroup.semesters || {}).sort((a, b) => {
            const semA = yearGroup.semesters[a];
            const semB = yearGroup.semesters[b];
            if (!semA || !semB) return 0;
            return (semA.semesterName || '').localeCompare(semB.semesterName || '');
          });

          return (
            <div
              key={`${yearGroup.programId}-${yearGroup.yearLevelId}`}
              className="year-group"
              style={{
                marginBottom: '3rem',
                background: 'white',
                borderRadius: '8px',
                padding: '1.5rem',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              }}
            >
              {semesterIds.map((semesterId) => {
                const semester = yearGroup.semesters[semesterId];
                if (!semester || !semester.curricula || semester.curricula.length === 0) {
                  return null;
                }

                return (
                  <div key={semesterId} style={{ marginBottom: '2rem' }}>
                    <div
                      className="year-group-header"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '1rem',
                        paddingBottom: '0.75rem',
                        borderBottom: '2px solid #e0e0e0',
                      }}
                    >
                      <h3
                        style={{
                          margin: 0,
                          fontSize: '1.1rem',
                          fontWeight: '600',
                          color: '#333',
                          textTransform: 'uppercase',
                        }}
                      >
                        {yearGroup.programName.toUpperCase()} {yearGroup.yearLevelName.toUpperCase()} CURRICULUM - {yearGroup.yearLevelName.toUpperCase()} - {semester.semesterName.toUpperCase()}
                      </h3>
                    </div>

                    <div className="table-container">
                      <div
                        className="curriculum-data-grid dean-curriculum-review-grid"
                        style={{ '--curriculum-data-cols': 7 }}
                        role="table"
                        aria-label="Curriculum subjects"
                      >
                        <div className="curriculum-data-grid__head" role="row">
                          {['Subject Code', 'Pre/Co-requisite', 'Description', 'Units', 'Hours', 'Passing Grade', 'Type'].map((label) => (
                            <div key={label} className="curriculum-data-grid__th" role="columnheader">
                              {label}
                            </div>
                          ))}
                        </div>
                        <div className="curriculum-data-grid__body" role="rowgroup">
                          {semester.curricula.map((curr) => (
                            <div key={curr.curriculum_id} className="curriculum-data-grid__row" role="row">
                              <div className="curriculum-data-grid__cell" role="cell">
                                <span className="curriculum-data-grid__mobile-label">Subject Code</span>
                                <span className="curriculum-data-grid__cell-value" style={{ fontWeight: 500 }}>
                                  {curr.subject?.subject_code || 'N/A'}
                                </span>
                              </div>
                              <div className="curriculum-data-grid__cell" role="cell">
                                <span className="curriculum-data-grid__mobile-label">Pre/Co-requisite</span>
                                <span className="curriculum-data-grid__cell-value">{resolveRequisiteLabel(curr)}</span>
                              </div>
                              <div className="curriculum-data-grid__cell" role="cell">
                                <span className="curriculum-data-grid__mobile-label">Description</span>
                                <span className="curriculum-data-grid__cell-value">{curr.subject?.subject_name || 'N/A'}</span>
                              </div>
                              <div className="curriculum-data-grid__cell" role="cell">
                                <span className="curriculum-data-grid__mobile-label">Units</span>
                                <span className="curriculum-data-grid__cell-value">{curr.number_of_units || '-'}</span>
                              </div>
                              <div className="curriculum-data-grid__cell" role="cell">
                                <span className="curriculum-data-grid__mobile-label">Hours</span>
                                <span className="curriculum-data-grid__cell-value">{curr.number_of_hrs || '-'}</span>
                              </div>
                              <div className="curriculum-data-grid__cell" role="cell">
                                <span className="curriculum-data-grid__mobile-label">Passing Grade</span>
                                <span className="curriculum-data-grid__cell-value">{curr.passing_grade || '-'}</span>
                              </div>
                              <div className="curriculum-data-grid__cell" role="cell">
                                <span className="curriculum-data-grid__mobile-label">Type</span>
                                <span className="curriculum-data-grid__cell-value">{curr.subject_type || '-'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
};

export default DeanCurriculumReview;
