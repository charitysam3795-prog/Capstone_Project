import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import SearchableSelect from './SearchableSelect';
import { swalConfirm, swalError, swalToast } from '../../utils/swal';
import './SubjectEquivalenceQuickModal.css';

/**
 * Map a prior-school (other school) course to a local catalog subject.
 * With rosterStudentId + fixedLocal → student-specific transfer credit.
 * From Subject crediting Map → reusable equivalence tied to that transfer record.
 * Otherwise → catalog equivalence suggestion.
 *
 * Props: open, onClose, fixedLocal (optional), onSaved (optional),
 * rosterStudentId (optional), sourceContext ('student-information' | 'evaluation' | null).
 */
function SubjectEquivalenceQuickModal({
  open,
  onClose,
  fixedLocal,
  onSaved,
  rosterStudentId = null,
  sourceContext = null,
}) {
  const [otherSchoolSubjects, setOtherSchoolSubjects] = useState([]);
  const [localSubjects, setLocalSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ossId, setOssId] = useState('');
  const [localSubjectId, setLocalSubjectId] = useState('');
  const [creditedUnits, setCreditedUnits] = useState('');
  const [creditBasis, setCreditBasis] = useState('');
  const [remarks, setRemarks] = useState('');
  /** OSS id on the student's transfer line when the modal opened (for remove / remap). */
  const [linkedTransferOtherId, setLinkedTransferOtherId] = useState(null);
  const rosterStudentNumeric = useMemo(() => {
    const rs = rosterStudentId != null && rosterStudentId !== '' ? Number(rosterStudentId) : NaN;
    return Number.isInteger(rs) && rs > 0 ? rs : null;
  }, [rosterStudentId]);

  useEffect(() => {
    if (!open) return;
    setCreditedUnits('');
    setCreditBasis('');
    setRemarks('');
    setLocalSubjectId(fixedLocal?.id != null ? String(fixedLocal.id) : '');
    const pre =
      fixedLocal?.transfer_credit_other_subject_id ?? fixedLocal?.transferCreditOtherSubjectId;
    const preNum = pre != null && pre !== '' ? Number(pre) : NaN;
    const linked = Number.isInteger(preNum) && preNum > 0 ? preNum : null;
    setLinkedTransferOtherId(linked);
    setOssId(linked != null ? String(linked) : '');
  }, [open, fixedLocal]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const ossPromise =
          rosterStudentNumeric != null
            ? api.get('/other-school-subjects', { params: { student_id: rosterStudentNumeric } })
            : api.get('/other-school-subjects');
        const subjPromise =
          fixedLocal?.id != null ? Promise.resolve({ data: [] }) : api.get('/lookup/subjects');
        const [ossRes, subjRes] = await Promise.all([ossPromise, subjPromise]);
        if (cancelled) return;
        setOtherSchoolSubjects(ossRes.data || []);
        if (fixedLocal?.id == null) {
          setLocalSubjects(subjRes.data || []);
        } else {
          setLocalSubjects([]);
        }
      } catch (e) {
        if (!cancelled) {
          await swalError('Load failed', e.response?.data?.message || 'Could not load subject lists.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, fixedLocal, rosterStudentNumeric]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, submitting]);

  const ossOptions = useMemo(
    () =>
      (otherSchoolSubjects || []).map((s) => {
        const school =
          s.school?.school_name ||
          s.school_name ||
          (s.school_id != null ? `School #${s.school_id}` : null);
        const course = `${s.subject_code ?? '—'} — ${s.subject_name ?? '—'}`;
        return {
          value: String(s.other_subject_id),
          label: school ? `${course} · ${school}` : course,
        };
      }),
    [otherSchoolSubjects]
  );

  const localOptions = useMemo(
    () =>
      (localSubjects || []).map((s) => ({
        value: String(s.subject_id),
        label: `${s.subject_code ?? '—'} — ${s.subject_name ?? '—'}`,
      })),
    [localSubjects]
  );

  const effectiveLocalId =
    fixedLocal?.id != null ? String(fixedLocal.id) : localSubjectId;
  const isStudentCreditMode =
    rosterStudentNumeric != null &&
    fixedLocal?.id != null &&
    Number.parseInt(effectiveLocalId, 10) > 0;
  const fromStudentInformation = sourceContext === 'student-information';

  const selectedOss = useMemo(() => {
    if (!ossId) return null;
    return (otherSchoolSubjects || []).find((s) => String(s.other_subject_id) === String(ossId)) || null;
  }, [ossId, otherSchoolSubjects]);

  const selectedLocalLabel = useMemo(() => {
    if (fixedLocal?.id != null) {
      const code = fixedLocal.code || '—';
      const name = fixedLocal.name ? ` — ${fixedLocal.name}` : '';
      return `${code}${name}`;
    }
    if (!localSubjectId) return 'Select local subject';
    const row = (localSubjects || []).find((s) => String(s.subject_id) === String(localSubjectId));
    if (!row) return 'Select local subject';
    return `${row.subject_code ?? '—'} — ${row.subject_name ?? '—'}`;
  }, [fixedLocal, localSubjectId, localSubjects]);

  const priorFlowLabel = useMemo(() => {
    if (!selectedOss) return 'Select prior-school course';
    const code = selectedOss.subject_code || '—';
    const name = selectedOss.subject_name || '';
    return name ? `${code} — ${name}` : code;
  }, [selectedOss]);

  const canRemoveStudentTransferLink =
    isStudentCreditMode &&
    linkedTransferOtherId != null &&
    Number.parseInt(effectiveLocalId, 10) > 0;

  const handleRemoveMapping = async () => {
    if (!canRemoveStudentTransferLink) return;
    const ok = await swalConfirm({
      title: 'Remove credit mapping?',
      text: 'This student will no longer receive curriculum credit for this PEN subject from the selected prior-school course. The global equivalence catalog is not deleted.',
      icon: 'warning',
      confirmButtonText: 'Clear credit',
      cancelButtonText: 'Cancel',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      const { data } = await api.post('/credit-evaluations/clear-transfer-credit', {
        student_id: rosterStudentNumeric,
        subject_id: Number.parseInt(effectiveLocalId, 10),
        other_subject_id: linkedTransferOtherId,
      });
      const n = Number(data?.cleared_rows ?? 0);
      swalToast('success', n > 0 ? data.message || 'Link removed.' : data.message || 'No rows updated.');
      onSaved?.();
      onClose();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Remove failed';
      await swalError('Could not remove mapping', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const otherId = ossId ? parseInt(ossId, 10) : NaN;
    const subjId = effectiveLocalId ? parseInt(effectiveLocalId, 10) : NaN;
    if (!Number.isInteger(otherId) || otherId < 1) {
      await swalError('Prior-school subject required', 'Select the external (prior-school) course.');
      return;
    }
    if (!Number.isInteger(subjId) || subjId < 1) {
      await swalError('Local subject required', 'Select the catalog subject this course should count as.');
      return;
    }

    let credited = null;
    if (String(creditedUnits).trim() !== '') {
      const n = parseInt(creditedUnits, 10);
      if (!Number.isInteger(n) || n < 0) {
        await swalError('Invalid units', 'Credited units must be a whole number or left blank.');
        return;
      }
      credited = n;
    }

    setSubmitting(true);
    try {
      if (isStudentCreditMode) {
        await api.post('/credit-evaluations/apply-transfer-credit', {
          student_id: rosterStudentNumeric,
          other_subject_id: otherId,
          subject_id: subjId,
          previous_other_subject_id:
            linkedTransferOtherId != null && linkedTransferOtherId !== otherId
              ? linkedTransferOtherId
              : null,
          credited_units: credited,
          credit_basis: String(creditBasis || '').trim() || null,
          remarks: String(remarks || '').trim() || null,
        });
        swalToast('success', 'Transfer credit approved for this student.');
      } else {
        await api.post('/subject-equivalences', {
          other_school_subject: otherId,
          subject_id: subjId,
          credited_units: credited,
          credit_basis: String(creditBasis || '').trim() || null,
          status: 'active',
          remarks: String(remarks || '').trim() || null,
        });
        swalToast(
          'success',
          fromStudentInformation
            ? 'Mapping saved — linked to Subject crediting transfer courses.'
            : 'Subject equivalence suggestion saved.'
        );
      }
      onSaved?.();
      onClose();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Save failed';
      await swalError(isStudentCreditMode ? 'Could not apply transfer credit' : 'Could not save equivalence', msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const title = isStudentCreditMode
    ? 'Apply transfer credit'
    : fromStudentInformation
      ? 'Map prior-school course'
      : fixedLocal?.id != null
        ? 'Save equivalence for this subject'
        : 'Add subject equivalence';

  const connectCopy = isStudentCreditMode
    ? (
      <>
        Links a <strong>prior-school course</strong> from Subject crediting to this student&apos;s
        local catalog subject so transfer credit appears on their evaluation.
      </>
    )
    : fromStudentInformation
      ? (
        <>
          Connects a course from <strong>Subject crediting → External transfer credits</strong> to
          your local catalog. Use this after recording prior-school subjects.
        </>
      )
      : (
        <>
          Saves how an external course maps to a local subject. The same mapping powers{' '}
          <strong>Subject crediting</strong> transfer evaluation.
        </>
      );

  const saveLabel = submitting
    ? 'Saving…'
    : isStudentCreditMode
      ? 'Apply credit'
      : fromStudentInformation
        ? 'Save mapping'
        : 'Save equivalence';

  return (
    <div
      className="seq-equiv-overlay"
      role="presentation"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="seq-equiv-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seq-equiv-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="seq-equiv-dialog__head">
          <div>
            <p className="seq-equiv-dialog__eyebrow">
              {fromStudentInformation || isStudentCreditMode
                ? 'Subject crediting'
                : 'Subject equivalence'}
            </p>
            <h2 id="seq-equiv-title" className="seq-equiv-dialog__title">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="seq-equiv-dialog__close"
            onClick={() => !submitting && onClose()}
            aria-label="Close subject equivalence dialog"
          >
            ×
          </button>
        </div>

        <div className="seq-equiv-dialog__body">
          <div className="seq-equiv-dialog__connect" role="note">
            <span className="seq-equiv-dialog__connect-icon" aria-hidden="true">
              <i className="fa-solid fa-link" />
            </span>
            <p>{connectCopy}</p>
          </div>

          <div className="seq-equiv-dialog__flow" aria-hidden="true">
            <div className="seq-equiv-dialog__flow-node">
              <span className="seq-equiv-dialog__flow-label">Prior school</span>
              <div className="seq-equiv-dialog__flow-value">{priorFlowLabel}</div>
            </div>
            <span className="seq-equiv-dialog__flow-arrow">→</span>
            <div className="seq-equiv-dialog__flow-node">
              <span className="seq-equiv-dialog__flow-label">Local catalog</span>
              <div className="seq-equiv-dialog__flow-value">{selectedLocalLabel}</div>
            </div>
          </div>

          {loading ? <div className="seq-equiv-dialog__loading">Loading lists…</div> : null}

          <form onSubmit={handleSubmit}>
            <div className="seq-equiv-dialog__section">
              <h3 className="seq-equiv-dialog__section-title">1. Prior-school subject</h3>
              <div className="seq-equiv-dialog__form-group">
                <label htmlFor="seq-equiv-oss">
                  Other school subject <span className="required">*</span>
                </label>
                <SearchableSelect
                  id="seq-equiv-oss"
                  value={ossId}
                  onChange={(v) => setOssId(v || '')}
                  options={ossOptions}
                  emptyLabel="Type to search prior-school course…"
                  placeholder="Type to search prior-school course…"
                  required
                  aria-label="Other school subject"
                  disabled={loading}
                />
                <p className="seq-equiv-dialog__hint">
                  {isStudentCreditMode
                    ? 'Courses from Subject crediting → External transfer credits (linked to this student or not yet linked to a roster ID).'
                    : 'These courses come from the shared external-subject catalog.'}
                </p>
                {isStudentCreditMode && !loading && ossOptions.length === 0 ? (
                  <p className="seq-equiv-dialog__hint seq-equiv-dialog__hint--warn">
                    No transfer courses on file for this student. Add them in Subject crediting first.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="seq-equiv-dialog__section">
              <h3 className="seq-equiv-dialog__section-title">2. Local catalog subject</h3>
              {fixedLocal?.id != null ? (
                <div className="seq-equiv-dialog__form-group">
                  <label>Local subject (this row)</label>
                  <div className="seq-equiv-dialog__local-readonly">
                    <strong>{fixedLocal.code || '—'}</strong>
                    {fixedLocal.name ? ` — ${fixedLocal.name}` : ''}
                  </div>
                </div>
              ) : (
                <div className="seq-equiv-dialog__form-group">
                  <label htmlFor="seq-equiv-local">
                    Local catalog subject <span className="required">*</span>
                  </label>
                  <SearchableSelect
                    id="seq-equiv-local"
                    value={localSubjectId}
                    onChange={(v) => setLocalSubjectId(v || '')}
                    options={localOptions}
                    emptyLabel="Type to search local subject…"
                    placeholder="Type to search local subject…"
                    required
                    aria-label="Local catalog subject"
                    disabled={loading}
                  />
                </div>
              )}
            </div>

            <div className="seq-equiv-dialog__section">
              <h3 className="seq-equiv-dialog__section-title">3. Credit details (optional)</h3>
              <div className="seq-equiv-dialog__meta-row">
                <div className="seq-equiv-dialog__form-group">
                  <label htmlFor="seq-equiv-units">Credited units</label>
                  <input
                    id="seq-equiv-units"
                    type="number"
                    min="0"
                    value={creditedUnits}
                    onChange={(e) => setCreditedUnits(e.target.value)}
                    placeholder="Optional"
                    disabled={loading || submitting}
                  />
                </div>
                <div className="seq-equiv-dialog__form-group">
                  <label htmlFor="seq-equiv-basis">Credit basis</label>
                  <input
                    id="seq-equiv-basis"
                    type="text"
                    value={creditBasis}
                    onChange={(e) => setCreditBasis(e.target.value)}
                    placeholder="e.g. TOR, syllabus"
                    maxLength={50}
                    disabled={loading || submitting}
                  />
                </div>
              </div>

              <div className="seq-equiv-dialog__form-group">
                <label htmlFor="seq-equiv-remarks">Remarks</label>
                <textarea
                  id="seq-equiv-remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional notes for evaluators"
                  disabled={loading || submitting}
                />
              </div>
            </div>

            <div className="seq-equiv-dialog__actions">
              <div className="seq-equiv-dialog__actions-left">
                {canRemoveStudentTransferLink ? (
                  <button
                    type="button"
                    className="seq-equiv-dialog__btn-remove"
                    onClick={handleRemoveMapping}
                    disabled={loading || submitting}
                  >
                    Clear credit
                  </button>
                ) : null}
              </div>
              <div className="seq-equiv-dialog__actions-right">
                <button
                  type="button"
                  className="seq-equiv-dialog__btn-cancel"
                  onClick={() => !submitting && onClose()}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="seq-equiv-dialog__btn-save"
                  disabled={loading || submitting}
                >
                  {saveLabel}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default SubjectEquivalenceQuickModal;
