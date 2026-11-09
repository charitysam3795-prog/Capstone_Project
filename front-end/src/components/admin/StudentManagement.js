import React from 'react';
import UserManagement from './UserManagement';
import './StudentManagement.css';

/**
 * Student accounts only (Student role). SIS import/export lives under Import / Export.
 */
const StudentManagement = () => {
  return (
    <div className="student-management" data-tour="page-student-management">
      <div className="student-management__header">
        <h2>Student Management</h2>
        <p className="student-management__subtitle">
          Manage student profiles (including imported students without email) and login accounts. Use{' '}
          <strong>Import / Export</strong> for SIS file import and CSV downloads.
        </p>
      </div>

      <div className="student-management__panel">
        <UserManagement userScope="students" />
      </div>
    </div>
  );
};

export default StudentManagement;
