import React, { useRef } from 'react';
import useDialogFocus from '../../hooks/useDialogFocus';
import './PromoteSemesterModal.css';

function electiveChoiceLabel(c) {
  const tn = [c.track_name, c.track_code].filter(Boolean).join(' ').trim();
  const sn = (c.subject_name || '').trim();
  const sc = (c.subject_code || '').trim();
  if (tn && sn) return `${tn} — ${sn}${sc ? ` (${sc})` : ''}`;
  if (sn) return `${sn}${sc ? ` (${sc})` : ''}`;
  return sc || 'Elective option';
}

/**
 * Promote-to-next-semester review dialog.
 * Evaluated by is locked to the signed-in staff name (first + last).
 */
const PromoteSemesterModal = ({
  open,
  onClose,
  onSave,
  saving,
  studentName,
  curriculumLabel,
  programLabel,
  yearLabel,
  semesterLabel,
  rows,
  totalUnits,
  evaluatedBy,
  trackPickerVisible = false,
  trackPickerRequired = false,
  trackPickerOptions = [],
  trackPickerValue = '',
  onTrackPickerChange,
  elective4SubjectValue = '',
  onElective4SubjectChange,
}) => {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  useDialogFocus(open, dialogRef, closeButtonRef, onClose);

  if (!open) return null;

  const hasInlineTrackRow = rows.some((r) => {
    const isElectiveFourPick =
      r.isElectiveFour && (r.electiveSubjectChoices?.length ?? 0) > 0;
    return (
      !isElectiveFourPick &&
      r.electivePending &&
      (r.electiveChoices?.length ?? 0) > 0
    );
  });
  const showBottomTrackPanel = trackPickerVisible && !hasInlineTrackRow;

  return (
    <div
      className="promote-modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="promote-modal"
        data-tour="promote-review"
        role="dialog"
        aria-modal="true"
        aria-labelledby="promote-modal-title"
        tabIndex="-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="promote-modal__head">
          <div className="promote-modal__head-text">
            <p className="promote-modal__eyebrow">Promote to next semester</p>
            <h2 id="promote-modal-title" className="promote-modal__title">
              {studentName}
            </h2>
            <p className="promote-modal__subtitle">
              Review the load for{' '}
              <strong>
                {[yearLabel, semesterLabel].filter((v) => v && v !== '—').join(' · ') || 'the next term'}
              </strong>
              , then save to update standing.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="promote-modal__close"
            onClick={onClose}
            aria-label="Close promotion review"
          >
            ×
          </button>
        </div>

        <div className="promote-modal__meta-bar">
          <div className="promote-modal__meta-item">
            <span className="promote-modal__meta-label">Curriculum</span>
            <span className="promote-modal__meta-value">{curriculumLabel || '—'}</span>
          </div>
          <div className="promote-modal__meta-item">
            <span className="promote-modal__meta-label">Program</span>
            <span className="promote-modal__meta-value">{programLabel || '—'}</span>
          </div>
          <div className="promote-modal__meta-item">
            <span className="promote-modal__meta-label">Year</span>
            <span className="promote-modal__meta-value">{yearLabel || '—'}</span>
          </div>
          <div className="promote-modal__meta-item">
            <span className="promote-modal__meta-label">Semester</span>
            <span className="promote-modal__meta-value">{semesterLabel || '—'}</span>
          </div>
        </div>

        <div className="promote-modal__body">
          <div className="promote-modal__table-wrap">
            <table className="promote-modal__table">
              <thead>
                <tr>
                  <th>Pen Code</th>
                  <th>Descriptive Title</th>
                  <th>Units</th>
                  <th>Prerequisite</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="promote-modal__empty">
                      No courses for this term in the curriculum.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, idx) => {
                    const isElectiveFourPick =
                      r.isElectiveFour && (r.electiveSubjectChoices?.length ?? 0) > 0;
                    const isTrackPick =
                      !isElectiveFourPick &&
                      r.electivePending &&
                      (r.electiveChoices?.length ?? 0) > 0;
                    const pickerDisabled =
                      saving ||
                      (isElectiveFourPick
                        ? typeof onElective4SubjectChange !== 'function'
                        : typeof onTrackPickerChange !== 'function');
                    return (
                      <tr
                        key={`${r.penCode}-${idx}`}
                        className={r.eligible === false ? 'promote-modal__row--blocked' : undefined}
                      >
                        <td>
                          <span
                            className={
                              isElectiveFourPick || isTrackPick
                                ? 'promote-modal__pill promote-modal__pill--elective'
                                : 'promote-modal__pill'
                            }
                          >
                            {r.penCode || '—'}
                          </span>
                        </td>
                        <td>
                          {isElectiveFourPick || isTrackPick ? (
                            <div className="promote-modal__title-picker">
                              <label
                                className="promote-modal__title-picker-label"
                                htmlFor={`promote-elective-pick-${idx}`}
                              >
                                {isElectiveFourPick
                                  ? 'Select Elective 4 subject'
                                  : 'Select track'}
                              </label>
                              <select
                                id={`promote-elective-pick-${idx}`}
                                className="promote-modal__title-picker-select"
                                value={
                                  isElectiveFourPick
                                    ? elective4SubjectValue
                                    : trackPickerValue
                                }
                                onChange={
                                  isElectiveFourPick
                                    ? onElective4SubjectChange
                                    : onTrackPickerChange
                                }
                                disabled={pickerDisabled}
                                autoComplete="off"
                              >
                                <option value="">
                                  {isElectiveFourPick
                                    ? 'Select subject…'
                                    : 'Select track…'}
                                </option>
                                {isElectiveFourPick
                                  ? (r.electiveSubjectChoices || []).map((c) => (
                                      <option
                                        key={`${c.subject_id}-${c.elective_subject_id}`}
                                        value={String(c.subject_id)}
                                      >
                                        {`${c.subject_code || ''} — ${c.subject_name || 'Subject'}`.trim()}
                                      </option>
                                    ))
                                  : (r.electiveChoices || []).map((c) => (
                                      <option
                                        key={c.elective_subject_id}
                                        value={String(c.track_id)}
                                      >
                                        {electiveChoiceLabel(c)}
                                      </option>
                                    ))}
                              </select>
                              {r.title &&
                              r.title !== 'Pending track selection' &&
                              !(isElectiveFourPick && !elective4SubjectValue) ? (
                                <span className="promote-modal__title-picker-current">
                                  {r.title}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="promote-modal__title-cell">{r.title || '—'}</span>
                          )}
                        </td>
                        <td>
                          <span className="promote-modal__pill">{r.units ?? '—'}</span>
                        </td>
                        <td>
                          {r.eligible === false ? (
                            <div className="promote-modal__prereq-stack">
                              <span className="promote-modal__blocked-badge">Not eligible</span>
                              {r.prerequisite && r.prerequisite !== 'NONE' ? (
                                <span className="promote-modal__prereq-below">{r.prerequisite}</span>
                              ) : null}
                            </div>
                          ) : (
                            r.prerequisite || 'NONE'
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {showBottomTrackPanel ? (
            <div className="promote-modal__track-panel">
              <label className="promote-modal__track-label" htmlFor="promote-modal-track">
                Track (elective slot)
                {trackPickerRequired ? <span className="promote-modal__req"> *</span> : null}
              </label>
              <select
                id="promote-modal-track"
                className="promote-modal__track-select"
                value={trackPickerValue}
                onChange={onTrackPickerChange}
                disabled={saving || typeof onTrackPickerChange !== 'function'}
              >
                <option value="">{trackPickerRequired ? 'Select track…' : '— Optional —'}</option>
                {trackPickerOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="promote-modal__track-help">
                {trackPickerRequired
                  ? 'This term includes a track-based elective. The table above updates when you choose a track.'
                  : 'Confirms the student’s track (e.g. SysDev). Elective 4 stays blank for 3-subject tracks until you pick a subject in the table.'}
              </p>
            </div>
          ) : null}
        </div>

        <div className="promote-modal__foot">
          <div className="promote-modal__eval-row">
            <label htmlFor="promote-evaluated-by">Evaluated by</label>
            <input
              id="promote-evaluated-by"
              type="text"
              className="promote-modal__eval-input promote-modal__eval-input--locked"
              value={evaluatedBy || '—'}
              readOnly
              disabled
              tabIndex={-1}
              aria-readonly="true"
              title="Filled automatically from your account name"
            />
          </div>
          <div className="promote-modal__foot-actions">
            <div className="promote-modal__total">
              Total units
              <span className="promote-modal__total-badge">{totalUnits}</span>
            </div>
            <button
              type="button"
              className="promote-modal__save"
              onClick={() => void onSave()}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save promotion'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromoteSemesterModal;
