import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import '../dean/DeanAnalytics.css';
import './evaluatorModules.css';

function BarChart({ items, valueKey = 'count', labelKey = 'label', colorClass = '' }) {
  const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0));
  if (!items.length) {
    return <p className="dean-analytics__empty">No data for this chart yet.</p>;
  }
  return (
    <div
      className="dean-vbar-chart"
      role="group"
      aria-label={`Bar chart showing ${items
        .map((item) => `${item[labelKey]}: ${Number(item[valueKey]) || 0}`)
        .join(', ')}`}
    >
      {items.map((item) => {
        const value = Number(item[valueKey]) || 0;
        const height = Math.max(value > 0 ? 8 : 2, (value / max) * 100);
        return (
          <div key={item.key || item[labelKey]} className="dean-vbar">
            <span className="dean-vbar__value">{value}</span>
            <div className="dean-vbar__track">
              <div
                className={`dean-vbar__fill ${colorClass}`.trim()}
                style={{ height: `${height}%` }}
                title={`${item[labelKey]}: ${value}`}
              />
            </div>
            <span className="dean-vbar__label">{item[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

function DualBarChart({
  items,
  leftKey = 'needs_evaluation',
  rightKey = 'auto_evaluated',
  leftLabel = 'Needs evaluation',
  rightLabel = 'Auto-evaluated',
  leftClass = 'dean-dual-pair__fill--uneval',
  rightClass = 'dean-dual-pair__fill--auto',
  emptyText = 'No students in your scope yet.',
}) {
  const max = Math.max(
    1,
    ...items.flatMap((i) => [Number(i[leftKey]) || 0, Number(i[rightKey]) || 0])
  );
  if (!items.length) {
    return <p className="dean-analytics__empty">{emptyText}</p>;
  }
  return (
    <div className="dean-dual-chart">
      <div className="dean-dual-chart__legend">
        <span className="dean-dual-chart__key">
          <span className={`dean-dual-chart__swatch ${leftClass}`} aria-hidden />
          {leftLabel}
        </span>
        <span className="dean-dual-chart__key">
          <span className={`dean-dual-chart__swatch ${rightClass}`} aria-hidden />
          {rightLabel}
        </span>
      </div>
      <div className="dean-dual-chart__bars">
        {items.map((item) => {
          const left = Number(item[leftKey]) || 0;
          const right = Number(item[rightKey]) || 0;
          return (
            <div key={item.year_level_id || item.label} className="dean-dual-row">
              <span className="dean-dual-row__label">{item.label}</span>
              <div className="dean-dual-row__pairs">
                <div className="dean-dual-pair">
                  <span className="dean-dual-pair__n">{left}</span>
                  <div className="dean-dual-pair__track">
                    <div
                      className={`dean-dual-pair__fill ${leftClass}`}
                      style={{ width: `${Math.max(left > 0 ? 6 : 0, (left / max) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="dean-dual-pair">
                  <span className="dean-dual-pair__n">{right}</span>
                  <div className="dean-dual-pair__track">
                    <div
                      className={`dean-dual-pair__fill ${rightClass}`}
                      style={{ width: `${Math.max(right > 0 ? 6 : 0, (right / max) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * @param {{ showEvalModules: boolean }} props
 */
const EvaluatorAnalytics = ({ showEvalModules }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!showEvalModules) {
      setData(null);
      setLoading(false);
      return undefined;
    }
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get('/evaluation/reports/adviser-analytics', { skipLoading: true });
        if (!cancelled) setData(res.data);
      } catch (e) {
        if (!cancelled) {
          setError(e?.response?.data?.message || 'Could not load adviser analytics.');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showEvalModules]);

  if (!showEvalModules) {
    return (
      <div className="evaluator-dash" data-tour="page-evaluator-analytics">
        <h1 className="evaluator-dash__title">Analytics</h1>
        <p className="evaluator-dash__lead">You do not have access to evaluation analytics.</p>
      </div>
    );
  }

  const totals = data?.totals || {};
  const programLabel = data?.program?.program_code || 'Program';
  const yearScope =
    (data?.year_scope || []).map((y) => y.label).join(', ') || 'Not assigned';
  const series = data?.by_year?.series || [];

  return (
    <div className="evaluator-dash dean-analytics" data-tour="page-evaluator-analytics">
      <div className="dean-analytics__head">
        <div>
          <h1 className="dean-analytics__title">Evaluation analytics</h1>
          <p className="evaluator-dash__lead" style={{ marginBottom: 0 }}>
            Scoped to <strong>{programLabel}</strong> · {yearScope}. Regular students with a complete
            passed load are auto-evaluated; irregulars and incomplete loads need manual evaluation.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="evaluator-curr-intro">Loading analytics…</p>
      ) : error ? (
        <p className="evaluator-curr-empty">{error}</p>
      ) : (
        <>
          <div className="dean-analytics__metrics">
            <div className="dean-metric-card">
              <div className="dean-metric-card__icon">
                <i className="fa-solid fa-users" aria-hidden />
              </div>
              <div className="dean-metric-card__body">
                <div className="dean-metric-card__label">In scope</div>
                <div className="dean-metric-card__value">{totals.in_scope ?? 0}</div>
              </div>
            </div>
            <div className="dean-metric-card">
              <div className="dean-metric-card__icon">
                <i className="fa-solid fa-robot" aria-hidden />
              </div>
              <div className="dean-metric-card__body">
                <div className="dean-metric-card__label">Auto-evaluated</div>
                <div className="dean-metric-card__value">{totals.auto_evaluated ?? 0}</div>
              </div>
            </div>
            <div className="dean-metric-card">
              <div className="dean-metric-card__icon">
                <i className="fa-solid fa-clipboard-check" aria-hidden />
              </div>
              <div className="dean-metric-card__body">
                <div className="dean-metric-card__label">Manual evaluated</div>
                <div className="dean-metric-card__value">{totals.manual_evaluated ?? 0}</div>
              </div>
            </div>
            <div className="dean-metric-card">
              <div className="dean-metric-card__icon">
                <i className="fa-solid fa-clipboard-question" aria-hidden />
              </div>
              <div className="dean-metric-card__body">
                <div className="dean-metric-card__label">Needs evaluation</div>
                <div className="dean-metric-card__value">{totals.needs_evaluation ?? 0}</div>
              </div>
            </div>
          </div>

          <div className="dean-analytics__metrics" style={{ marginTop: '0.75rem' }}>
            <div className="dean-metric-card">
              <div className="dean-metric-card__body">
                <div className="dean-metric-card__label">Regular</div>
                <div className="dean-metric-card__value">{totals.regular ?? 0}</div>
              </div>
            </div>
            <div className="dean-metric-card">
              <div className="dean-metric-card__body">
                <div className="dean-metric-card__label">Irregular</div>
                <div className="dean-metric-card__value">{totals.irregular ?? 0}</div>
              </div>
            </div>
          </div>

          {data?.by_year?.insight ? (
            <p className="dean-analytics__insight">{data.by_year.insight}</p>
          ) : null}

          <div className="dean-chart-card" style={{ marginTop: '1.25rem' }}>
            <h3 className="dean-chart-card__title">Needs evaluation by year level</h3>
            <p className="dean-chart-card__sub">
              Students still requiring manual evaluation (mostly irregular or incomplete load).
            </p>
            <BarChart
              items={series.map((r) => ({
                key: r.year_level_id,
                label: r.label,
                count: r.unevaluated,
              }))}
              colorClass="dean-vbar__fill--warn"
            />
          </div>

          <div className="dean-chart-card" style={{ marginTop: '1.25rem' }}>
            <h3 className="dean-chart-card__title">Auto-evaluated vs needs evaluation</h3>
            <DualBarChart items={series} />
          </div>

          <div className="dean-mini-table-wrap" style={{ marginTop: '1.25rem' }}>
            <table className="dean-mini-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Needs evaluation</th>
                  <th>Auto-evaluated</th>
                  <th>Manual evaluated</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {series.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No students in your assigned scope.</td>
                  </tr>
                ) : (
                  series.map((r) => (
                    <tr key={r.year_level_id}>
                      <td>{r.label}</td>
                      <td>
                        <strong>{r.unevaluated}</strong>
                      </td>
                      <td>{r.auto_evaluated ?? 0}</td>
                      <td>{r.manual_evaluated ?? 0}</td>
                      <td>{r.total_students}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default EvaluatorAnalytics;
