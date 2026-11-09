import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../api/axios';
import { COLORS, GroupedYearChart, YearPopulationChart } from './DeanAnalyticsCharts';
import './DeanAnalytics.css';

function Section({ icon, title, subtitle, insight, alert = false, wide = false, chips = null, children }) {
  return (
    <section className={`dean-viz-card${wide ? ' dean-viz-card--wide' : ''}`}>
      <header className="dean-viz-card__head dean-viz-card__head--icon">
        <span className="dean-viz-card__icon">
          <i className={`fa-solid ${icon}`} aria-hidden />
        </span>
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </header>
      {chips ? <div className="dean-stat-chips">{chips}</div> : null}
      <div className="dean-viz-card__body">{children}</div>
      {insight ? (
        <div className={`dean-insight dean-insight--inline${alert ? ' dean-insight--alert' : ''}`}>
          <i className={`fa-solid ${alert ? 'fa-bolt' : 'fa-lightbulb'}`} aria-hidden />
          <p>{insight}</p>
        </div>
      ) : null}
    </section>
  );
}

function StatChip({ tone, label, value, sub }) {
  return (
    <div className={`dean-stat-chip dean-stat-chip--${tone}`}>
      <span className="dean-stat-chip__label">{label}</span>
      <strong className="dean-stat-chip__value">{value}</strong>
      {sub ? <span className="dean-stat-chip__sub">{sub}</span> : null}
    </div>
  );
}

function pct(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

/**
 * The program is always the signed-in user's assigned program (resolved by the API).
 * @param {{ showEvalModules: boolean }} props
 */
const DeanAnalytics = ({ showEvalModules }) => {
  const [filters, setFilters] = useState(() => ({
    ayId: '',
    semId: '',
    yearId: '',
  }));
  const [reloadNonce, setReloadNonce] = useState(0);
  const forceRefresh = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!showEvalModules) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const params = {};
        if (filters.ayId) params.academic_year_id = filters.ayId;
        if (filters.semId !== '') params.semester_id = filters.semId;
        if (filters.yearId) params.year_level_id = filters.yearId;
        if (forceRefresh.current) params.refresh = 1;
        forceRefresh.current = false;
        const res = await api.get('/evaluation/reports/dean-program-analytics', {
          params,
          skipLoading: true,
          signal: controller.signal,
          timeout: 180000,
        });
        if (cancelled) return;
        setData(res.data);
      } catch (e) {
        if (cancelled || e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return;
        setError(e?.response?.data?.message || 'Could not load analytics.');
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [showEvalModules, filters, reloadNonce]);

  const f = data?.filters;
  const selected = f?.selected || {};
  const yearLevels = useMemo(() => f?.year_levels || [], [f?.year_levels]);

  const evaluationRows = useMemo(
    () =>
      (data?.evaluation_by_year || []).map((y) => ({
        ...y,
        evaluated: (y.evaluated_manual || 0) + (y.evaluated_auto || 0),
      })),
    [data?.evaluation_by_year]
  );

  if (!showEvalModules) {
    return (
      <div className="dean-analytics" data-tour="page-dean-analytics">
        <h1 className="dean-analytics__title">Analytics</h1>
        <p className="dean-analytics__empty">You do not have access to evaluation analytics.</p>
      </div>
    );
  }

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const k = data?.kpis || {};
  const ins = data?.insights || {};
  const population = data?.population_by_year || [];
  const status = data?.status_by_year || [];

  return (
    <div className="dean-analytics dean-analytics--viz" data-tour="page-dean-analytics">
      <div className="dean-hero">
        <div>
          <span className="dean-hero__eyebrow">
            <i className="fa-solid fa-chart-simple" aria-hidden /> Student academic analytics
          </span>
          <h1 className="dean-hero__title">
            {data?.selected_program?.program_code || 'Program'}
            {data?.selected_program?.program_name ? <small> {data.selected_program.program_name}</small> : null}
          </h1>
          <p className="dean-hero__lead">
            {f?.term_label || 'Loading…'}
            {f?.is_current_term ? <span className="dean-hero__badge">Current term</span> : null}
          </p>
        </div>
        <div className="dean-hero__controls dean-hero__controls--labeled">
          <label>
            <span>Academic year</span>
            <select
              value={filters.ayId || (selected.academic_year_id ? String(selected.academic_year_id) : '')}
              onChange={(e) => setFilters((prevF) => ({ ...prevF, ayId: e.target.value, semId: '' }))}
            >
              {(f?.academic_years || []).map((y) => (
                <option key={y.academic_year_id} value={y.academic_year_id}>
                  {y.academic_year_name}
                  {y.is_active ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Semester</span>
            <select
              value={filters.semId !== '' ? filters.semId : String(selected.semester_id ?? '')}
              onChange={(e) => setFilter('semId', e.target.value)}
            >
              <option value="0">All semesters</option>
              {(f?.semesters || []).map((s) => (
                <option key={s.semester_id} value={s.semester_id}>
                  {s.semester_name}
                  {s.is_active ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Year level</span>
            <select value={filters.yearId} onChange={(e) => setFilter('yearId', e.target.value)}>
              <option value="">All year levels</option>
              {yearLevels.map((y) => (
                <option key={y.year_level_id} value={y.year_level_id}>
                  {y.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              forceRefresh.current = true;
              setReloadNonce((n) => n + 1);
            }}
            disabled={loading}
            title="Recalculate now"
          >
            <i className={`fa-solid fa-rotate${loading ? ' fa-spin' : ''}`} aria-hidden />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="dean-viz-loading">
          <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
          Crunching this program’s records…
        </div>
      ) : error ? (
        <p className="dean-analytics__empty">{error}</p>
      ) : !f ? (
        <p className="dean-analytics__hint">No program available for analytics.</p>
      ) : (
        <div className={loading ? 'dean-analytics__body is-loading' : 'dean-analytics__body'}>
          <div className="dean-viz-grid">
            <Section
              icon="fa-people-group"
              title="Student Population by Year Level"
              subtitle={`Number of students per year level · ${f.term_label}`}
              insight={ins.population}
              wide
            >
              <YearPopulationChart data={population} />
            </Section>

            <Section
              icon="fa-clipboard-list"
              title="Evaluation Progress by Year Level"
              subtitle="Evaluated and unevaluated students per year level. Shows which year level needs attention."
              insight={ins.evaluation}
              alert={(k.unevaluated ?? 0) > 0}
              chips={
                <>
                  <StatChip
                    tone="green"
                    label="Evaluated"
                    value={k.evaluated ?? 0}
                    sub={`${k.evaluated_manual ?? 0} by staff · ${k.evaluated_auto ?? 0} auto-promoted`}
                  />
                  <StatChip
                    tone="red"
                    label="Unevaluated"
                    value={k.unevaluated ?? 0}
                    sub={`${pct(k.unevaluated ?? 0, k.students ?? 0)}% of students`}
                  />
                </>
              }
            >
              <GroupedYearChart
                data={evaluationRows}
                series={[
                  { key: 'evaluated', label: 'Evaluated', color: COLORS.good, labelColor: '#166534' },
                  { key: 'unevaluated', label: 'Unevaluated', color: '#f87171', labelColor: '#b91c1c' },
                ]}
              />
            </Section>

            <Section
              icon="fa-graduation-cap"
              title="Academic Status Distribution"
              subtitle="Regular and irregular students per year level. Shows groups that may need academic guidance."
              insight={ins.status}
              alert={(k.irregular_pct ?? 0) >= 30}
              chips={
                <>
                  <StatChip tone="blue" label="Regular" value={k.regular ?? 0} sub={`${pct(k.regular ?? 0, k.students ?? 0)}%`} />
                  <StatChip tone="amber" label="Irregular" value={k.irregular ?? 0} sub={`${k.irregular_pct ?? 0}%`} />
                </>
              }
            >
              <GroupedYearChart
                data={status}
                series={[
                  { key: 'regular', label: 'Regular', color: COLORS.info, labelColor: '#1e3a8a' },
                  { key: 'irregular', label: 'Irregular', color: '#fbbf24', labelColor: '#92400e' },
                ]}
              />
            </Section>
          </div>
          <p className="dean-analytics__note">
            Current term: the same students, year levels, Regular / Irregular standing and Evaluated status shown in
            Evaluation → Student (practice students are not counted). Past terms: students with grades recorded in that
            term, with standing rebuilt from their records up to the end of that term.
          </p>
        </div>
      )}
    </div>
  );
};

export default DeanAnalytics;
