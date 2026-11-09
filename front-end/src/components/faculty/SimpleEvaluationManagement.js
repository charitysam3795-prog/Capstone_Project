import React, { useState, useEffect } from 'react';
import '../dean/EvaluationManagement.css';

const SimpleEvaluationManagement = () => {
    const [evaluations, setEvaluations] = useState([]);
    const [students, setStudents] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [academicYears, setAcademicYears] = useState([]);
    const [semesters, setSemesters] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingEvaluation, setEditingEvaluation] = useState(null);
    const [activeTab, setActiveTab] = useState('my-evaluations');
    const [filters, setFilters] = useState({
        subject_id: '',
        academic_year_id: '',
        semester_id: '',
        evaluation_status: ''
    });

    const [formData, setFormData] = useState({
        student_id: '',
        subject_id: '',
        academic_year_id: '',
        semester_id: '',
        grade: '',
        final_grade: '',
        gpa_equivalent: '',
        evaluation_status: 'ongoing',
        faculty_remarks: '',
        evaluation_type: 'final',
        section_id: ''
    });

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (filters.subject_id || filters.academic_year_id || filters.semester_id || filters.evaluation_status) {
            fetchEvaluations();
        }
    }, [filters]);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [
                evaluationsRes,
                studentsRes,
                subjectsRes,
                academicYearsRes,
                semestersRes
            ] = await Promise.all([
                fetch('/api/evaluation'),
                fetch('/api/evaluation/students'),
                fetch('/api/subjects'),
                fetch('/api/academic-years'),
                fetch('/api/semesters')
            ]);

            const evaluationsData = await evaluationsRes.json();
            const studentsData = await studentsRes.json();
            const subjectsData = await subjectsRes.json();
            const academicYearsData = await academicYearsRes.json();
            const semestersData = await semestersRes.json();

            setEvaluations(evaluationsData.data || []);
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

    const fetchEvaluations = async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams();
            Object.entries(filters).forEach(([key, value]) => {
                if (value) queryParams.append(key, value);
            });

            const response = await fetch(`/api/evaluation?${queryParams}`);
            const data = await response.json();
            setEvaluations(data.data || []);
        } catch (err) {
            setError('Failed to fetch evaluations');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const url = editingEvaluation 
                ? `/api/evaluation/${editingEvaluation.evaluation_id}`
                : '/api/evaluation';
            
            const method = editingEvaluation ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                setSuccess(editingEvaluation ? 'Evaluation updated successfully' : 'Evaluation created successfully');
                setShowModal(false);
                setEditingEvaluation(null);
                resetForm();
                fetchEvaluations();
            } else {
                const errorData = await response.json();
                setError(errorData.message || 'Failed to save evaluation');
            }
        } catch (err) {
            setError('Failed to save evaluation');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (evaluation) => {
        setEditingEvaluation(evaluation);
        setFormData({
            student_id: evaluation.student_id,
            subject_id: evaluation.subject_id,
            academic_year_id: evaluation.academic_year_id,
            semester_id: evaluation.semester_id,
            grade: evaluation.grade || '',
            final_grade: evaluation.final_grade || '',
            gpa_equivalent: evaluation.gpa_equivalent || '',
            evaluation_status: evaluation.evaluation_status || 'ongoing',
            faculty_remarks: evaluation.faculty_remarks || '',
            evaluation_type: evaluation.evaluation_type || 'final',
            section_id: evaluation.section_id || ''
        });
        setShowModal(true);
    };

    const resetForm = () => {
        setFormData({
            student_id: '',
            subject_id: '',
            academic_year_id: '',
            semester_id: '',
            grade: '',
            final_grade: '',
            gpa_equivalent: '',
            evaluation_status: 'ongoing',
            faculty_remarks: '',
            evaluation_type: 'final',
            section_id: ''
        });
    };

    const getStudentName = (studentId) => {
        const student = students.find(s => s.student_id === studentId);
        return student ? student.full_name : 'Unknown Student';
    };

    const getSubjectName = (subjectId) => {
        const subject = subjects.find(s => s.subject_id === subjectId);
        return subject ? subject.subject_name : 'Unknown Subject';
    };

    const getAcademicYearName = (yearId) => {
        const year = academicYears.find(y => y.academic_year_id === yearId);
        return year ? year.year_description : 'Unknown Year';
    };

    const getSemesterName = (semesterId) => {
        const semester = semesters.find(s => s.semester_id === semesterId);
        return semester ? semester.semester_name : 'Unknown Semester';
    };

    const getStatusBadge = (status) => {
        const statusClasses = {
            passed: 'status-passed',
            failed: 'status-failed',
            ongoing: 'status-ongoing',
            dropped: 'status-dropped',
            incomplete: 'status-incomplete'
        };
        return <span className={`status-badge ${statusClasses[status] || ''}`}>{status}</span>;
    };

    return (
        <div className="evaluation-management">
            <div className="evaluation-header">
                <h2>Student Evaluation Management</h2>
                <div className="header-actions">
                    <button 
                        className="btn btn-primary"
                        onClick={() => {
                            setEditingEvaluation(null);
                            resetForm();
                            setShowModal(true);
                        }}
                    >
                        Add Evaluation
                    </button>
                </div>
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <div className="evaluation-tabs">
                <button 
                    className={`tab-btn ${activeTab === 'my-evaluations' ? 'active' : ''}`}
                    onClick={() => setActiveTab('my-evaluations')}
                >
                    My Evaluations
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'students' ? 'active' : ''}`}
                    onClick={() => setActiveTab('students')}
                >
                    Students
                </button>
            </div>

            {activeTab === 'my-evaluations' && (
                <div className="evaluations-list">
                    <div className="filters-section">
                        <h3>Filters</h3>
                        <div className="filters-grid">
                            <select 
                                value={filters.subject_id}
                                onChange={(e) => setFilters(prev => ({ ...prev, subject_id: e.target.value }))}
                                className="form-control"
                            >
                                <option value="">All Subjects</option>
                                {subjects.map(subject => (
                                    <option key={subject.subject_id} value={subject.subject_id}>
                                        {subject.subject_name}
                                    </option>
                                ))}
                            </select>

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

                            <select 
                                value={filters.evaluation_status}
                                onChange={(e) => setFilters(prev => ({ ...prev, evaluation_status: e.target.value }))}
                                className="form-control"
                            >
                                <option value="">All Statuses</option>
                                <option value="passed">Passed</option>
                                <option value="failed">Failed</option>
                                <option value="ongoing">Ongoing</option>
                                <option value="dropped">Dropped</option>
                                <option value="incomplete">Incomplete</option>
                            </select>
                        </div>
                    </div>

                    {loading ? (
                        <div className="loading">Loading evaluations...</div>
                    ) : (
                        <div className="evaluations-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        <th>Subject</th>
                                        <th>Academic Year</th>
                                        <th>Semester</th>
                                        <th>Grade</th>
                                        <th>Status</th>
                                        <th>Evaluation Type</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {evaluations.map(evaluation => (
                                        <tr key={evaluation.evaluation_id}>
                                            <td>{getStudentName(evaluation.student_id)}</td>
                                            <td>{getSubjectName(evaluation.subject_id)}</td>
                                            <td>{getAcademicYearName(evaluation.academic_year_id)}</td>
                                            <td>{getSemesterName(evaluation.semester_id)}</td>
                                            <td>{evaluation.final_grade || evaluation.grade || '-'}</td>
                                            <td>{getStatusBadge(evaluation.evaluation_status)}</td>
                                            <td>{evaluation.evaluation_type}</td>
                                            <td>
                                                <button 
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={() => handleEdit(evaluation)}
                                                >
                                                    Edit
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {evaluations.length === 0 && (
                                <div className="no-data">No evaluations found</div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'students' && (
                <div className="students-section">
                    <h3>Students Evaluation Overview</h3>
                    <div className="students-grid">
                        {students.map(student => (
                            <div key={student.student_id} className="student-card">
                                <div className="student-info">
                                    <h4>{student.full_name}</h4>
                                    <p>ID: {student.student_id_number}</p>
                                    <p>Program: {student.program_name}</p>
                                    <p>Status: {student.academic_status}</p>
                                </div>
                                <div className="student-actions">
                                    <button 
                                        className="btn btn-primary"
                                        onClick={() => {
                                            setFilters(prev => ({ ...prev, student_id: student.student_id }));
                                            setActiveTab('my-evaluations');
                                        }}
                                    >
                                        View Evaluations
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {showModal && (
                <div className="modal-overlay">
                    <div className="app-dialog">
                        <div className="modal-header">
                            <h3>{editingEvaluation ? 'Edit Evaluation' : 'Add Evaluation'}</h3>
                            <button
                                type="button"
                                className="close-btn"
                                onClick={() => setShowModal(false)}
                                aria-label="Close evaluation form"
                            >
                                ×
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="evaluation-form">
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Student</label>
                                    <select 
                                        value={formData.student_id}
                                        onChange={(e) => setFormData(prev => ({ ...prev, student_id: e.target.value }))}
                                        className="form-control"
                                        required
                                    >
                                        <option value="">Select Student</option>
                                        {students.map(student => (
                                            <option key={student.student_id} value={student.student_id}>
                                                {student.full_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Subject</label>
                                    <select 
                                        value={formData.subject_id}
                                        onChange={(e) => setFormData(prev => ({ ...prev, subject_id: e.target.value }))}
                                        className="form-control"
                                        required
                                    >
                                        <option value="">Select Subject</option>
                                        {subjects.map(subject => (
                                            <option key={subject.subject_id} value={subject.subject_id}>
                                                {subject.subject_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Academic Year</label>
                                    <select 
                                        value={formData.academic_year_id}
                                        onChange={(e) => setFormData(prev => ({ ...prev, academic_year_id: e.target.value }))}
                                        className="form-control"
                                        required
                                    >
                                        <option value="">Select Academic Year</option>
                                        {academicYears.map(year => (
                                            <option key={year.academic_year_id} value={year.academic_year_id}>
                                                {year.year_description}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Semester</label>
                                    <select 
                                        value={formData.semester_id}
                                        onChange={(e) => setFormData(prev => ({ ...prev, semester_id: e.target.value }))}
                                        className="form-control"
                                        required
                                    >
                                        <option value="">Select Semester</option>
                                        {semesters.map(semester => (
                                            <option key={semester.semester_id} value={semester.semester_id}>
                                                {semester.semester_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Grade</label>
                                    <input 
                                        type="text"
                                        value={formData.grade}
                                        onChange={(e) => setFormData(prev => ({ ...prev, grade: e.target.value }))}
                                        className="form-control"
                                        placeholder="e.g., A, B+, 85"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Final Grade</label>
                                    <input 
                                        type="number"
                                        value={formData.final_grade}
                                        onChange={(e) => setFormData(prev => ({ ...prev, final_grade: e.target.value }))}
                                        className="form-control"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>GPA Equivalent</label>
                                    <input 
                                        type="number"
                                        value={formData.gpa_equivalent}
                                        onChange={(e) => setFormData(prev => ({ ...prev, gpa_equivalent: e.target.value }))}
                                        className="form-control"
                                        min="0"
                                        max="5"
                                        step="0.01"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Evaluation Status</label>
                                    <select 
                                        value={formData.evaluation_status}
                                        onChange={(e) => setFormData(prev => ({ ...prev, evaluation_status: e.target.value }))}
                                        className="form-control"
                                    >
                                        <option value="ongoing">Ongoing</option>
                                        <option value="passed">Passed</option>
                                        <option value="failed">Failed</option>
                                        <option value="dropped">Dropped</option>
                                        <option value="incomplete">Incomplete</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Evaluation Type</label>
                                    <select 
                                        value={formData.evaluation_type}
                                        onChange={(e) => setFormData(prev => ({ ...prev, evaluation_type: e.target.value }))}
                                        className="form-control"
                                    >
                                        <option value="prelim">Preliminary</option>
                                        <option value="midterm">Midterm</option>
                                        <option value="final">Final</option>
                                        <option value="comprehensive">Comprehensive</option>
                                    </select>
                                </div>

                                <div className="form-group full-width">
                                    <label>Faculty Remarks</label>
                                    <textarea 
                                        value={formData.faculty_remarks}
                                        onChange={(e) => setFormData(prev => ({ ...prev, faculty_remarks: e.target.value }))}
                                        className="form-control"
                                        rows="3"
                                        placeholder="Add any remarks about the student's performance..."
                                    />
                                </div>
                            </div>

                            <div className="form-actions">
                                <button 
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowModal(false)}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={loading}
                                >
                                    {loading ? 'Saving...' : (editingEvaluation ? 'Update' : 'Create')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SimpleEvaluationManagement;
