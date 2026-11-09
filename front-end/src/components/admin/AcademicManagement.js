import React, { useEffect } from 'react';
import CreditEvaluationManagement from './CreditEvaluationManagement';
import './AcademicManagement.css';

/**
 * Dean / Admin: external transfer intake (transcript / prior institution).
 * Shown under Subject crediting in the admin sidebar.
 */
const AcademicManagement = ({ remountKey = 0 }) => {
  useEffect(() => {
    const openCredit = sessionStorage.getItem('creditEvalOpenCreditTab');
    const focusTab = sessionStorage.getItem('academicMgmtFocusTab');

    if (openCredit === '1') {
      sessionStorage.removeItem('creditEvalOpenCreditTab');
      sessionStorage.removeItem('academicMgmtEquivPrefillSubjectId');
      if (focusTab) sessionStorage.removeItem('academicMgmtFocusTab');
    } else if (focusTab) {
      sessionStorage.removeItem('academicMgmtFocusTab');
      sessionStorage.removeItem('academicMgmtEquivPrefillSubjectId');
    }

    sessionStorage.removeItem('creditEvalPrefillStudentId');
  }, [remountKey]);

  return (
    <div className="academic-management academic-management--student-information" data-tour="page-student-information">
      <CreditEvaluationManagement studentInformationMode />
    </div>
  );
};

export default AcademicManagement;
