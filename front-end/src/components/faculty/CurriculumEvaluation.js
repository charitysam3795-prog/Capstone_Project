import React, { useState, useEffect } from 'react';
import '../dean/CurriculumEvaluation.css';
import '../admin/CurriculumManagement.css';

const CurriculumEvaluation = () => {
    const [students, setStudents] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [curriculumData, setCurriculumData] = useState([]);
    const [academicYears, setAcademicYears] = useState([]);
    const [semesters, setSemesters] = useState([]);
    const [programs, setPrograms] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [editMode, setEditMode] = useState(false);

    // Filters
    const [filters, setFilters] = useState({
        program_id: '',
        academic_year_id: '',
        search: ''
    });

    // Evaluation data structure matching the Google Sheet
    const [evaluationData, setEvaluationData] = useState({
        studentName: '',
        programName: '',
        unitsEarned: 0,
        lackingUnits: 0,
        remarks: '',
        evaluations: {} // subject_id -> { status: 'passed'/'failed'/'INC', grade: null }
    });

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [
                studentsRes,
                academicYearsRes,
                semestersRes,
                programsRes
            ] = await Promise.all([
                fetch('/api/evaluation/students'),
                fetch('/api/academic-years'),
                fetch('/api/semesters'),
                fetch('/api/programs')
            ]);

            const studentsData = await studentsRes.json();
            const academicYearsData = await academicYearsRes.json();
            const semestersData = await semestersRes.json();
            const programsData = await programsRes.json();

            setStudents(studentsData.students || []);
            setAcademicYears(academicYearsData || []);
            setSemesters(semestersData || []);
            setPrograms(programsData || []);
        } catch (err) {
            setError('Failed to fetch initial data');
        } finally {
            setLoading(false);
        }
    };

    const fetchStudentCurriculum = async (studentId) => {
        setLoading(true);
        setError('');
        
        try {
            const response = await fetch(`/api/evaluation/student/${studentId}`);
            const data = await response.json();

            if (response.ok) {
                setCurriculumData(data.rows || []);
                setEvaluationData(prev => ({
                    ...prev,
                    studentName: data.student?.full_name || '',
                    programName: data.student?.program?.program_name || '',
                    unitsEarned: data.summary?.total_units_earned || 0,
                    lackingUnits: data.summary?.lacking_units || 0,
                    evaluations: {}
                }));

                // Initialize evaluation statuses from existing data
                const initialEvaluations = {};
                data.rows?.forEach(row => {
                    if (row.status) {
                        initialEvaluations[row.subject_id] = {
                            status: row.status.toLowerCase(),
                            grade: row.grade || null
                        };
                    }
                });
                setEvaluationData(prev => ({ ...prev, evaluations: initialEvaluations }));
            } else {
                setError(data.message || 'Failed to fetch student curriculum');
            }
        } catch (err) {
            setError('Failed to fetch student curriculum');
        } finally {
            setLoading(false);
        }
    };

    const handleStudentSelect = (student) => {
        setSelectedStudent(student);
        fetchStudentCurriculum(student.student_id_number || student.student_id);
        setEditMode(false);
    };

    const handleStatusChange = (subjectId, status) => {
        setEvaluationData(prev => ({
            ...prev,
            evaluations: {
                ...prev.evaluations,
                [subjectId]: {
                    ...prev.evaluations[subjectId],
                    status
                }
            }
        }));
    };

    const handleGradeChange = (subjectId, grade) => {
        setEvaluationData(prev => ({
            ...prev,
            evaluations: {
                ...prev.evaluations,
                [subjectId]: {
                    ...prev.evaluations[subjectId],
                    grade
                }
            }
        }));
    };

    const calculateTotals = () => {
        let totalUnits = 0;
        let earnedUnits = 0;

        curriculumData.forEach(subject => {
            totalUnits += subject.units || 0;
            const evaluation = evaluationData.evaluations[subject.subject_id];
            if (evaluation && evaluation.status === 'passed') {
                earnedUnits += subject.units || 0;
            }
        });

        return {
            totalUnits,
            earnedUnits,
            lackingUnits: totalUnits - earnedUnits
        };
    };

    const saveEvaluations = async () => {
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const evaluationsToSave = [];
            
            Object.entries(evaluationData.evaluations).forEach(([subjectId, evaluation]) => {
                const subject = curriculumData.find(s => s.subject_id == subjectId);
                if (subject && evaluation.status) {
                    evaluationsToSave.push({
                        student_id: selectedStudent.student_id,
                        subject_id: parseInt(subjectId),
                        academic_year_id: subject.academic_year_id || 1,
                        semester_id: subject.semester_id || 1,
                        grade: evaluation.grade || null,
                        final_grade: evaluation.status === 'passed' ? 75 : null,
                        evaluation_status: evaluation.status,
                        faculty_remarks: '',
                        evaluation_type: 'final'
                    });
                }
            });

            // Save each evaluation
            for (const evaluation of evaluationsToSave) {
                const response = await fetch('/api/evaluation', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify(evaluation)
                });

                if (!response.ok) {
                    throw new Error('Failed to save evaluation');
                }
            }

            setSuccess('Evaluations saved successfully!');
            setEditMode(false);
            fetchStudentCurriculum(selectedStudent.student_id_number || selectedStudent.student_id);
        } catch (err) {
            setError('Failed to save evaluations');
        } finally {
            setLoading(false);
        }
    };

    const groupCurriculumByYearAndSemester = () => {
        const grouped = {};
        
        curriculumData.forEach(subject => {
            const yearKey = subject.year_level_name || `Year ${subject.year_level_id}`;
            const semesterKey = subject.semester_name || `Semester ${subject.semester_id}`;
            
            if (!grouped[yearKey]) {
                grouped[yearKey] = {};
            }
            if (!grouped[yearKey][semesterKey]) {
                grouped[yearKey][semesterKey] = [];
            }
            
            grouped[yearKey][semesterKey].push(subject);
        });

        return grouped;
    };

    const getStatusBadge = (status) => {
        const statusClasses = {
            passed: 'status-passed',
            failed: 'status-failed',
            inc: 'status-incomplete',
            ongoing: 'status-ongoing'
        };
        return <span className={`status-badge ${statusClasses[status] || ''}`}>{status?.toUpperCase()}</span>;
    };

    const totals = calculateTotals();
    const groupedCurriculum = groupCurriculumByYearAndSemester();

    return (
        <div className="curriculum-evaluation">
            <div className="evaluation-header">
                <h2>Curriculum Evaluation</h2>
                <div className="header-actions">
                    {selectedStudent && (
                        <>
                            <button 
                                className={`btn ${editMode ? 'btn-success' : 'btn-primary'}`}
                                onClick={() => setEditMode(!editMode)}
                            >
                                {editMode ? 'Save' : 'Edit Evaluation'}
                            </button>
                            {editMode && (
                                <button 
                                    className="btn btn-secondary"
                                    onClick={() => setEditMode(false)}
                                >
                                    Cancel
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            {/* Student Selection */}
            <div className="student-selection">
                <h3>Select Student</h3>
                <div className="filters-row">
                    <input 
                        type="text"
                        placeholder="Search students..."
                        value={filters.search}
                        onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                        className="form-control search-input"
                    />
                    <select 
                        value={filters.program_id}
                        onChange={(e) => setFilters(prev => ({ ...prev, program_id: e.target.value }))}
                        className="form-control"
                    >
                        <option value="">All Programs</option>
                        {programs.map(program => (
                            <option key={program.program_id} value={program.program_id}>
                                {program.program_name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="students-grid">
                    {students
                        .filter(student => {
                            const matchesSearch = !filters.search || 
                                student.full_name.toLowerCase().includes(filters.search.toLowerCase()) ||
                                student.student_id_number.toLowerCase().includes(filters.search.toLowerCase());
                            const matchesProgram = !filters.program_id || student.program_id == filters.program_id;
                            return matchesSearch && matchesProgram;
                        })
                        .map(student => (
                        <div 
                            key={student.student_id} 
                            className={`student-card ${selectedStudent?.student_id === student.student_id ? 'selected' : ''}`}
                            onClick={() => handleStudentSelect(student)}
                        >
                            <div className="student-info">
                                <h4>{student.full_name}</h4>
                                <p>ID: {student.student_id_number}</p>
                                <p>Program: {student.program_name}</p>
                                <p>Status: {student.academic_status}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Curriculum Evaluation Sheet */}
            {selectedStudent && (
                <div className="curriculum-sheet">
                    <div className="sheet-header">
                        <div className="student-info-header">
                            <h3>{evaluationData.studentName}</h3>
                            <p>Credited Subjects: {evaluationData.programName} Curriculum</p>
                        </div>
                        <div className="units-summary">
                            <div className="units-box">
                                <label>Units Earned:</label>
                                <span className="units-value">{totals.earnedUnits}</span>
                            </div>
                            <div className="units-box">
                                <label>Lacking Units:</label>
                                <span className="units-value lacking">{totals.lackingUnits}</span>
                            </div>
                        </div>
                    </div>

                    <div className="curriculum-table">
                        {Object.entries(groupedCurriculum).map(([year, semesters]) => (
                            <div key={year} className="year-section">
                                <h4>{year}</h4>
                                {Object.entries(semesters).map(([semester, subjects]) => (
                                    <div key={semester} className="semester-section">
                                        <h5>{semester}</h5>
                                        <div
                                            className="curriculum-data-grid eval-curriculum-grid"
                                            style={{ '--curriculum-data-cols': 7 }}
                                            role="table"
                                            aria-label="Curriculum evaluation subjects"
                                        >
                                            <div className="curriculum-data-grid__head" role="row">
                                                {['PEN CODE', 'Courses/Subjects', 'No. of Units', 'PRE REQ', 'Co-req', 'Status', 'Grade'].map((label) => (
                                                    <div key={label} className="curriculum-data-grid__th" role="columnheader">
                                                        {label}
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="curriculum-data-grid__body" role="rowgroup">
                                                {subjects.map((subject) => {
                                                    const evaluation = evaluationData.evaluations[subject.subject_id] || {};
                                                    return (
                                                        <div key={subject.subject_id} className="curriculum-data-grid__row" role="row">
                                                            <div className="curriculum-data-grid__cell" role="cell">
                                                                <span className="curriculum-data-grid__mobile-label">PEN CODE</span>
                                                                <span className="curriculum-data-grid__cell-value">{subject.subject_code}</span>
                                                            </div>
                                                            <div className="curriculum-data-grid__cell" role="cell">
                                                                <span className="curriculum-data-grid__mobile-label">Courses/Subjects</span>
                                                                <span className="curriculum-data-grid__cell-value">{subject.subject_name}</span>
                                                            </div>
                                                            <div className="curriculum-data-grid__cell" role="cell">
                                                                <span className="curriculum-data-grid__mobile-label">No. of Units</span>
                                                                <span className="curriculum-data-grid__cell-value">{subject.units}</span>
                                                            </div>
                                                            <div className="curriculum-data-grid__cell" role="cell">
                                                                <span className="curriculum-data-grid__mobile-label">PRE REQ</span>
                                                                <span className="curriculum-data-grid__cell-value">{subject.prerequisite || 'None'}</span>
                                                            </div>
                                                            <div className="curriculum-data-grid__cell" role="cell">
                                                                <span className="curriculum-data-grid__mobile-label">Co-req</span>
                                                                <span className="curriculum-data-grid__cell-value">{subject.corequisite || 'None'}</span>
                                                            </div>
                                                            <div className="curriculum-data-grid__cell" role="cell">
                                                                <span className="curriculum-data-grid__mobile-label">Status</span>
                                                                <span className="curriculum-data-grid__cell-value">
                                                                    {editMode ? (
                                                                        <select
                                                                            value={evaluation.status || ''}
                                                                            onChange={(e) => handleStatusChange(subject.subject_id, e.target.value)}
                                                                            className="status-select"
                                                                        >
                                                                            <option value="">Select Status</option>
                                                                            <option value="passed">Passed</option>
                                                                            <option value="failed">Failed</option>
                                                                            <option value="ongoing">Ongoing</option>
                                                                        </select>
                                                                    ) : (
                                                                        getStatusBadge(evaluation.status)
                                                                    )}
                                                                </span>
                                                            </div>
                                                            <div className="curriculum-data-grid__cell" role="cell">
                                                                <span className="curriculum-data-grid__mobile-label">Grade</span>
                                                                <span className="curriculum-data-grid__cell-value">
                                                                    {editMode ? (
                                                                        <input
                                                                            type="text"
                                                                            value={evaluation.grade || ''}
                                                                            onChange={(e) => handleGradeChange(subject.subject_id, e.target.value)}
                                                                            placeholder="Grade"
                                                                            className="grade-input"
                                                                        />
                                                                    ) : (
                                                                        evaluation.grade || '-'
                                                                    )}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    {editMode && (
                        <div className="save-section">
                            <button 
                                className="btn btn-success"
                                onClick={saveEvaluations}
                                disabled={loading}
                            >
                                {loading ? 'Saving...' : 'Save All Evaluations'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {loading && (
                <div className="loading-overlay">
                    <div className="loading-spinner">Loading...</div>
                </div>
            )}
        </div>
    );
};

export default CurriculumEvaluation;
