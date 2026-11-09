import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import './DeanPanel.css';

const DeanReports = ({ deanProfile }) => {
  const [curricula, setCurricula] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [reportType, setReportType] = useState('overview');

  // Get dean's program ID
  const deanProgramId = deanProfile?.program_id;

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    // Auto-select dean's program if available
    if (deanProgramId && !selectedProgram) {
      setSelectedProgram(deanProgramId.toString());
    }
  }, [deanProgramId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [curriculaRes, programsRes, departmentsRes] = await Promise.all([
        api.get('/curriculum'),
        api.get('/lookup/programs'),
        api.get('/lookup/departments'),
      ]);

      let curriculaData = Array.isArray(curriculaRes.data) ? curriculaRes.data : [];
      
      // Filter by dean's program if assigned
      if (deanProgramId) {
        curriculaData = curriculaData.filter(
          (curr) => curr.program_id?.toString() === deanProgramId.toString()
        );
      }
      
      setCurricula(curriculaData);
      
      const programsData = Array.isArray(programsRes.data) ? programsRes.data : (programsRes.data?.data || []);
      setPrograms(programsData);

      const departmentsData = Array.isArray(departmentsRes.data) ? departmentsRes.data : (departmentsRes.data?.data || []);
      setDepartments(departmentsData);
    } catch (error) {
      console.error('Error fetching report data:', error);
      setError('Failed to fetch report data');
    } finally {
      setLoading(false);
    }
  };

  const getStatistics = () => {
    const stats = {
      totalPrograms: programs.length,
      totalDepartments: departments.length,
      totalSubjects: new Set(curricula.map((c) => c.subject_id)).size,
      totalCurriculumEntries: curricula.length,
    };

    // Group by program
    const byProgram = {};
    curricula.forEach((curr) => {
      const programId = curr.program_id;
      if (!byProgram[programId]) {
        byProgram[programId] = {
          programId,
          count: 0,
          subjects: new Set(),
          totalUnits: 0,
        };
      }
      byProgram[programId].count++;
      if (curr.subject_id) {
        byProgram[programId].subjects.add(curr.subject_id);
      }
      byProgram[programId].totalUnits += curr.number_of_units || 0;
    });

    // Group by year level
    const byYearLevel = {};
    curricula.forEach((curr) => {
      const yearLevel = curr.year_level || 'Unknown';
      if (!byYearLevel[yearLevel]) {
        byYearLevel[yearLevel] = 0;
      }
      byYearLevel[yearLevel]++;
    });

    return { stats, byProgram, byYearLevel };
  };

  const { stats, byProgram, byYearLevel } = getStatistics();

  const getProgramName = (programId) => {
    const program = programs.find((p) => p.program_id === programId);
    return program?.program_name || 'Unknown Program';
  };

  // If dean has assigned program, only show that program's data
  let filteredByProgram = curricula;
  if (deanProgramId) {
    filteredByProgram = curricula.filter(
      (c) => c.program_id?.toString() === deanProgramId.toString()
    );
  } else if (selectedProgram) {
    filteredByProgram = curricula.filter(
      (c) => c.program_id?.toString() === selectedProgram
    );
  }

  if (loading) {
    return (
      <div className="dean-section">
        <div className="loading-message">Loading report data...</div>
      </div>
    );
  }

  return (
    <div className="dean-section">
      <div className="section-header">
        <h2>Academic Reports</h2>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Info Banner */}
      {deanProfile && deanProfile.program && (
        <div style={{ 
          padding: '1rem', 
          background: '#e8f4f8', 
          border: '1px solid #b8daff', 
          borderRadius: '5px', 
          marginBottom: '1.5rem',
          color: '#004085'
        }}>
          <strong>Assigned Program:</strong> {deanProfile.program.program_name} {deanProfile.program.program_code ? `(${deanProfile.program.program_code})` : ''}
          {deanProgramId && (
            <span style={{ marginLeft: '1rem', fontSize: '0.9rem' }}>
              Reports are filtered for your assigned program only.
            </span>
          )}
        </div>
      )}

      {/* Report Type Selection */}
      <div className="form-group" style={{ maxWidth: '300px', marginBottom: '2rem' }}>
        <label>Report Type</label>
        <select
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
        >
          <option value="overview">Overview Statistics</option>
          <option value="program">Program Analysis</option>
          <option value="yearLevel">Year Level Distribution</option>
        </select>
      </div>

      {reportType === 'overview' && (
        <div>
          <h3 style={{ marginBottom: '1.5rem', color: '#333' }}>System Overview</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f5576c', marginBottom: '0.5rem' }}>
                {stats.totalPrograms}
              </div>
              <div style={{ color: '#666' }}>Total Programs</div>
            </div>
            <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f5576c', marginBottom: '0.5rem' }}>
                {stats.totalDepartments}
              </div>
              <div style={{ color: '#666' }}>Total Departments</div>
            </div>
            <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f5576c', marginBottom: '0.5rem' }}>
                {stats.totalSubjects}
              </div>
              <div style={{ color: '#666' }}>Unique Subjects</div>
            </div>
            <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f5576c', marginBottom: '0.5rem' }}>
                {stats.totalCurriculumEntries}
              </div>
              <div style={{ color: '#666' }}>Curriculum Entries</div>
            </div>
          </div>

          <h4 style={{ marginBottom: '1rem', color: '#333' }}>Year Level Distribution</h4>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Year Level</th>
                  <th>Number of Subjects</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byYearLevel)
                  .sort(([a], [b]) => {
                    const yearA = a === 'Unknown' ? 999 : parseInt(a);
                    const yearB = b === 'Unknown' ? 999 : parseInt(b);
                    return yearA - yearB;
                  })
                  .map(([yearLevel, count]) => (
                    <tr key={yearLevel}>
                      <td>
                        {yearLevel === 'Unknown' ? 'Unknown' : `${yearLevel}${yearLevel === '1' ? 'st' : yearLevel === '2' ? 'nd' : yearLevel === '3' ? 'rd' : 'th'} Year`}
                      </td>
                      <td>{count}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reportType === 'program' && (
        <div>
          {!deanProgramId && (
            <div className="form-group" style={{ maxWidth: '300px', marginBottom: '2rem' }}>
              <label>Filter by Program</label>
              <select
                value={selectedProgram}
                onChange={(e) => setSelectedProgram(e.target.value)}
              >
                <option value="">All Programs</option>
                {programs.map((program) => (
                  <option key={program.program_id} value={program.program_id}>
                    {program.program_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <h3 style={{ marginBottom: '1.5rem', color: '#333' }}>
            {deanProgramId 
              ? `${getProgramName(parseInt(deanProgramId))} Analysis` 
              : selectedProgram 
                ? `${getProgramName(parseInt(selectedProgram))} Analysis` 
                : 'Program Analysis'}
          </h3>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Program</th>
                  <th>Total Subjects</th>
                  <th>Curriculum Entries</th>
                  <th>Total Units</th>
                </tr>
              </thead>
              <tbody>
                {(deanProgramId || selectedProgram) ? (
                  <tr>
                    <td>{getProgramName(parseInt(deanProgramId || selectedProgram))}</td>
                    <td>{byProgram[deanProgramId || selectedProgram]?.subjects.size || 0}</td>
                    <td>{byProgram[deanProgramId || selectedProgram]?.count || 0}</td>
                    <td>{byProgram[deanProgramId || selectedProgram]?.totalUnits || 0}</td>
                  </tr>
                ) : (
                  Object.entries(byProgram).map(([programId, data]) => (
                    <tr key={programId}>
                      <td>{getProgramName(parseInt(programId))}</td>
                      <td>{data.subjects.size}</td>
                      <td>{data.count}</td>
                      <td>{data.totalUnits}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reportType === 'yearLevel' && (
        <div>
          <h3 style={{ marginBottom: '1.5rem', color: '#333' }}>Year Level Distribution</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Year Level</th>
                  <th>Number of Subjects</th>
                  <th>Percentage</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byYearLevel)
                  .sort(([a], [b]) => {
                    const yearA = a === 'Unknown' ? 999 : parseInt(a);
                    const yearB = b === 'Unknown' ? 999 : parseInt(b);
                    return yearA - yearB;
                  })
                  .map(([yearLevel, count]) => {
                    const percentage = ((count / stats.totalCurriculumEntries) * 100).toFixed(1);
                    return (
                      <tr key={yearLevel}>
                        <td>
                          {yearLevel === 'Unknown' ? 'Unknown' : `${yearLevel}${yearLevel === '1' ? 'st' : yearLevel === '2' ? 'nd' : yearLevel === '3' ? 'rd' : 'th'} Year`}
                        </td>
                        <td>{count}</td>
                        <td>{percentage}%</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeanReports;

