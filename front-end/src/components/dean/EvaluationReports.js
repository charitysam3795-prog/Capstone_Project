import React, { useState, useEffect } from 'react';
import { swalInfo } from '../../utils/swal';
import './EvaluationReports.css';

const EvaluationReports = () => {
    const [reportsData, setReportsData] = useState({
        departmentAnalytics: null,
        evaluationSummary: null,
        selectedReport: 'department'
    });
    const [students, setStudents] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [academicYears, setAcademicYears] = useState([]);
    const [semesters, setSemesters] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState({
        academic_year_id: '',
        semester_id: '',
        program_id: ''
    });

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (reportsData.selectedReport) {
            fetchReportData();
        }
    }, [filters, reportsData.selectedReport]);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [
                studentsRes,
                subjectsRes,
                academicYearsRes,
                semestersRes
            ] = await Promise.all([
                fetch('/api/evaluation/students'),
                fetch('/api/subjects'),
                fetch('/api/academic-years'),
                fetch('/api/semesters')
            ]);

            const studentsData = await studentsRes.json();
            const subjectsData = await subjectsRes.json();
            const academicYearsData = await academicYearsRes.json();
            const semestersData = await semestersRes.json();

            setStudents(studentsData.students || []);
            setSubjects(subjectsData || []);
            setAcademicYears(academicYearsData || []);
            setSemesters(semestersData || []);
        } catch (err) {
            setError('Failed to fetch initial data');
        } finally {
            setLoading(false);
        }
    };

    const fetchReportData = async () => {
        setLoading(true);
        setError('');

        try {
            let url = '';
            const queryParams = new URLSearchParams();
            
            Object.entries(filters).forEach(([key, value]) => {
                if (value) queryParams.append(key, value);
            });

            switch (reportsData.selectedReport) {
                case 'department':
                    url = `/api/evaluation/reports/department?${queryParams}`;
                    break;
                case 'summary':
                    url = `/api/evaluation/reports/summary?${queryParams}`;
                    break;
                default:
                    url = `/api/evaluation/reports/department?${queryParams}`;
            }

            const response = await fetch(url);
            const data = await response.json();

            if (response.ok) {
                setReportsData(prev => ({
                    ...prev,
                    [reportsData.selectedReport === 'department' ? 'departmentAnalytics' : 'evaluationSummary']: data
                }));
            } else {
                setError(data.message || 'Failed to fetch report data');
            }
        } catch (err) {
            setError('Failed to fetch report data');
        } finally {
            setLoading(false);
        }
    };

    const handleStudentReport = async (studentId) => {
        setLoading(true);
        setError('');

        try {
            const queryParams = new URLSearchParams();
            Object.entries(filters).forEach(([key, value]) => {
                if (value) queryParams.append(key, value);
            });

            const response = await fetch(`/api/evaluation/reports/student/${studentId}?${queryParams}`);
            const data = await response.json();

            if (response.ok) {
                await swalInfo(
                    'Student report',
                    'Student report data loaded successfully.'
                );
            } else {
                setError(data.message || 'Failed to fetch student report');
            }
        } catch (err) {
            setError('Failed to fetch student report');
        } finally {
            setLoading(false);
        }
    };

    const handleSubjectReport = async (subjectId) => {
        setLoading(true);
        setError('');

        try {
            const queryParams = new URLSearchParams();
            Object.entries(filters).forEach(([key, value]) => {
                if (value) queryParams.append(key, value);
            });

            const response = await fetch(`/api/evaluation/reports/subject/${subjectId}?${queryParams}`);
            const data = await response.json();

            if (response.ok) {
                await swalInfo(
                    'Subject report',
                    'Subject report data loaded successfully.'
                );
            } else {
                setError(data.message || 'Failed to fetch subject report');
            }
        } catch (err) {
            setError('Failed to fetch subject report');
        } finally {
            setLoading(false);
        }
    };

    const renderDepartmentAnalytics = () => {
        const data = reportsData.departmentAnalytics;
        if (!data) return null;

        return (
            <div className="report-content">
                <div className="analytics-overview">
                    <div className="stat-cards">
                        <div className="stat-card">
                            <h3>Total Evaluations</h3>
                            <p className="stat-value">{data.overall_analytics?.total_evaluations || 0}</p>
                        </div>
                        <div className="stat-card">
                            <h3>Passed</h3>
                            <p className="stat-value passed">{data.overall_analytics?.passed_evaluations || 0}</p>
                        </div>
                        <div className="stat-card">
                            <h3>Failed</h3>
                            <p className="stat-value failed">{data.overall_analytics?.failed_evaluations || 0}</p>
                        </div>
                        <div className="stat-card">
                            <h3>Average Grade</h3>
                            <p className="stat-value">{data.overall_analytics?.average_grade ? data.overall_analytics.average_grade.toFixed(2) : 'N/A'}</p>
                        </div>
                    </div>
                </div>

                <div className="report-sections">
                    <div className="report-section">
                        <h3>Program Performance</h3>
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Program</th>
                                        <th>Total Evaluations</th>
                                        <th>Passed</th>
                                        <th>Failed</th>
                                        <th>Average Grade</th>
                                        <th>Pass Rate</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.program_breakdown?.map((program, index) => (
                                        <tr key={index}>
                                            <td>{program.program_name}</td>
                                            <td>{program.total_evaluations}</td>
                                            <td>{program.passed_evaluations}</td>
                                            <td>{program.failed_evaluations}</td>
                                            <td>{program.average_grade ? program.average_grade.toFixed(2) : 'N/A'}</td>
                                            <td>
                                                {program.total_evaluations > 0 ? 
                                                    `${((program.passed_evaluations / program.total_evaluations) * 100).toFixed(1)}%` 
                                                    : 'N/A'
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="report-section">
                        <h3>Subject Performance</h3>
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Subject</th>
                                        <th>Code</th>
                                        <th>Total Evaluations</th>
                                        <th>Passed</th>
                                        <th>Failed</th>
                                        <th>Average Grade</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.subject_performance?.map((subject, index) => (
                                        <tr key={index}>
                                            <td>{subject.subject_name}</td>
                                            <td>{subject.subject_code}</td>
                                            <td>{subject.total_evaluations}</td>
                                            <td>{subject.passed_evaluations}</td>
                                            <td>{subject.failed_evaluations}</td>
                                            <td>{subject.average_grade ? subject.average_grade.toFixed(2) : 'N/A'}</td>
                                            <td>
                                                <button 
                                                    className="btn btn-sm btn-primary"
                                                    onClick={() => handleSubjectReport(subject.subject_id)}
                                                >
                                                    View Report
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderEvaluationSummary = () => {
        const data = reportsData.evaluationSummary;
        if (!data) return null;

        return (
            <div className="report-content">
                <div className="summary-overview">
                    <div className="stat-cards">
                        <div className="stat-card">
                            <h3>Total Evaluations</h3>
                            <p className="stat-value">{data.summary?.total_evaluations || 0}</p>
                        </div>
                        <div className="stat-card">
                            <h3>Unique Students</h3>
                            <p className="stat-value">{data.summary?.total_students || 0}</p>
                        </div>
                        <div className="stat-card">
                            <h3>Unique Subjects</h3>
                            <p className="stat-value">{data.summary?.total_subjects || 0}</p>
                        </div>
                        <div className="stat-card">
                            <h3>Overall Pass Rate</h3>
                            <p className="stat-value">
                                {data.summary?.total_evaluations > 0 ? 
                                    `${((data.summary.passed_evaluations / data.summary.total_evaluations) * 100).toFixed(1)}%` 
                                    : 'N/A'
                                }
                            </p>
                        </div>
                    </div>
                </div>

                <div className="report-sections">
                    <div className="report-section">
                        <h3>Evaluation Types</h3>
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Evaluation Type</th>
                                        <th>Total Count</th>
                                        <th>Passed Count</th>
                                        <th>Pass Rate</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.evaluation_types?.map((type, index) => (
                                        <tr key={index}>
                                            <td>{type.evaluation_type}</td>
                                            <td>{type.count}</td>
                                            <td>{type.passed_count}</td>
                                            <td>
                                                {type.count > 0 ? 
                                                    `${((type.passed_count / type.count) * 100).toFixed(1)}%` 
                                                    : 'N/A'
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="report-section">
                        <h3>Recent Evaluations</h3>
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        <th>Subject</th>
                                        <th>Grade</th>
                                        <th>Status</th>
                                        <th>Type</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.recent_evaluations?.map((evaluation, index) => (
                                        <tr key={index}>
                                            <td>{evaluation.student?.full_name || 'N/A'}</td>
                                            <td>{evaluation.subject?.subject_name || 'N/A'}</td>
                                            <td>{evaluation.final_grade || evaluation.grade || '-'}</td>
                                            <td>
                                                <span className={`status-badge status-${evaluation.evaluation_status}`}>
                                                    {evaluation.evaluation_status}
                                                </span>
                                            </td>
                                            <td>{evaluation.evaluation_type}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="evaluation-reports">
            <div className="reports-header">
                <h2>Evaluation Reports & Analytics</h2>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="reports-filters">
                <h3>Filters</h3>
                <div className="filters-grid">
                    <select 
                        value={filters.academic_year_id}
                        onChange={(e) => setFilters(prev => ({ ...prev, academic_year_id: e.target.value }))}
                        className="form-control"
                    >
                        <option value="">All Academic Years</option>
                        {academicYears.map(year => (
                            <option key={year.academic_year_id} value={year.academic_year_id}>
                                {year.year_description}
                            </option>
                        ))}
                    </select>

                    <select 
                        value={filters.semester_id}
                        onChange={(e) => setFilters(prev => ({ ...prev, semester_id: e.target.value }))}
                        className="form-control"
                    >
                        <option value="">All Semesters</option>
                        {semesters.map(semester => (
                            <option key={semester.semester_id} value={semester.semester_id}>
                                {semester.semester_name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="report-tabs">
                <button 
                    className={`tab-btn ${reportsData.selectedReport === 'department' ? 'active' : ''}`}
                    onClick={() => setReportsData(prev => ({ ...prev, selectedReport: 'department' }))}
                >
                    Department Analytics
                </button>
                <button 
                    className={`tab-btn ${reportsData.selectedReport === 'summary' ? 'active' : ''}`}
                    onClick={() => setReportsData(prev => ({ ...prev, selectedReport: 'summary' }))}
                >
                    Evaluation Summary
                </button>
            </div>

            {loading ? (
                <div className="loading">Loading report data...</div>
            ) : (
                <div className="report-container">
                    {reportsData.selectedReport === 'department' && renderDepartmentAnalytics()}
                    {reportsData.selectedReport === 'summary' && renderEvaluationSummary()}
                </div>
            )}
        </div>
    );
};

export default EvaluationReports;
