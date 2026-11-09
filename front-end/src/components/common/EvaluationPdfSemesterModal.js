import React, { useEffect, useRef, useState } from 'react';
import useDialogFocus from '../../hooks/useDialogFocus';
import {
  defaultEvalPdfSelectionKeys,
  firstYearFirstSemKeys,
  firstYearFirstTwoSemKeys,
} from '../../utils/studentAcademicEvaluationPdf';
import './EvaluationPdfSemesterModal.css';

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   options: { key: string, label: string, rowCount: number }[],
 *   loading: boolean,
 *   onConfirm: (semesterKeys: string[]) => void | Promise<void>,
 * }} props
 */
const EvaluationPdfSemesterModal = ({ open, onClose, options, loading, onConfirm }) => {
  const [selectedKeys, setSelectedKeys] = useState([]);
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  useDialogFocus(open, dialogRef, cancelButtonRef, loading ? undefined : onClose);

  useEffect(() => {
    if (!open) return;
    if (options?.length) {
      setSelectedKeys(defaultEvalPdfSelectionKeys(options));
    } else {
      setSelectedKeys([]);
    }
  }, [open, options]);

  if (!open) return null;

  const toggle = (key) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleConfirm = async () => {
    await onConfirm(selectedKeys);
  };

  return (
    <div
      className="eval-pdf-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="eval-pdf-modal-title"
    >
      <div ref={dialogRef} className="eval-pdf-modal" tabIndex="-1">
        <h3 id="eval-pdf-modal-title">Choose semesters for the PDF</h3>
        <p className="eval-pdf-modal-hint">
          Only terms with graded courses are listed. The PDF is black and white to keep the file small.
          For one or two semesters, it uses a compact layout when possible.
        </p>
        {!options?.length ? (
          <p className="eval-pdf-modal-empty">
            No graded terms found yet. Grades must be recorded before they appear here.
          </p>
        ) : (
          <>
            <div className="eval-pdf-presets" role="group" aria-label="Quick selection">
              <button
                type="button"
                className="eval-pdf-preset"
                onClick={() => setSelectedKeys(firstYearFirstSemKeys(options))}
              >
                1st year — 1st sem only
              </button>
              <button
                type="button"
                className="eval-pdf-preset"
                onClick={() => setSelectedKeys(firstYearFirstTwoSemKeys(options))}
              >
                1st year — 1st & 2nd sem
              </button>
              <button
                type="button"
                className="eval-pdf-preset"
                onClick={() => setSelectedKeys(options.map((o) => o.key))}
              >
                All graded terms
              </button>
              <button
                type="button"
                className="eval-pdf-preset eval-pdf-preset-muted"
                onClick={() => setSelectedKeys([])}
              >
                Clear semester selection
              </button>
            </div>
            <ul className="eval-pdf-semester-list">
              {options.map((o) => (
                <li key={o.key}>
                  <label className="eval-pdf-semester-row">
                    <input
                      type="checkbox"
                      checked={selectedKeys.includes(o.key)}
                      onChange={() => toggle(o.key)}
                    />
                    <span className="eval-pdf-semester-label">{o.label}</span>
                    <span className="eval-pdf-semester-count">{o.rowCount} course(s)</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="eval-pdf-modal-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="eval-pdf-btn-cancel"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="eval-pdf-btn-download"
            onClick={handleConfirm}
            disabled={loading || !options?.length || selectedKeys.length === 0}
          >
            {loading ? 'Generating PDF…' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EvaluationPdfSemesterModal;
