import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export const COLORS = {
  good: '#22a35a',
  warn: '#f59e0b',
  bad: '#ef4444',
  info: '#3b82f6',
  violet: '#8b5cf6',
  muted: '#94a3b8',
  ink: '#0f172a',
  grid: '#e2e8f0',
};

/** One colour per year level (1st–5th), matching across every chart on the page. */
export const YEAR_COLORS = ['#2e9e5b', '#f6c344', '#f87171', '#9b87f5', '#38bdf8'];

export function yearColor(yearLevelId) {
  return YEAR_COLORS[(Number(yearLevelId) - 1) % YEAR_COLORS.length] || COLORS.muted;
}

const AXIS_TICK = { fill: '#64748b', fontSize: 12 };
const AXIS_TITLE = { fill: '#475569', fontSize: 12, fontWeight: 600 };
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
  fontSize: 13,
};
const CURSOR = { fill: 'rgba(148,163,184,0.12)' };

export function toneColor(rate, low = 75, critical = 60) {
  if (rate < critical) return COLORS.bad;
  if (rate < low) return COLORS.warn;
  return COLORS.good;
}

export function EmptyChart({ text = 'No data for this term yet.' }) {
  return <div className="dean-viz-empty">{text}</div>;
}

/** Students per year level, one coloured bar per year. */
export function YearPopulationChart({ data, height = 320 }) {
  if (!data.length || data.every((d) => !d.count)) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 24, right: 16, left: 8, bottom: 24 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="label" tick={AXIS_TICK}>
          <Label value="Year Level" position="insideBottom" offset={-14} style={AXIS_TITLE} />
        </XAxis>
        <YAxis tick={AXIS_TICK} allowDecimals={false}>
          <Label value="Number of Students" angle={-90} position="insideLeft" style={{ ...AXIS_TITLE, textAnchor: 'middle' }} />
        </YAxis>
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} formatter={(v) => [`${v} students`, 'Students']} />
        <Bar dataKey="count" radius={[8, 8, 0, 0]} animationDuration={900}>
          {data.map((d) => (
            <Cell key={d.year_level_id} fill={yearColor(d.year_level_id)} />
          ))}
          <LabelList dataKey="count" position="top" className="dean-viz-label" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Two or more side-by-side bars per year level. */
export function GroupedYearChart({ data, series, height = 320 }) {
  if (!data.length || data.every((d) => series.every((s) => !d[s.key]))) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 24, right: 8, left: 8, bottom: 8 }} barCategoryGap="24%" barGap={4}>
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="label" tick={AXIS_TICK} />
        <YAxis tick={AXIS_TICK} allowDecimals={false}>
          <Label value="Number of Students" angle={-90} position="insideLeft" style={{ ...AXIS_TITLE, textAnchor: 'middle' }} />
        </YAxis>
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} />
        <Legend itemSorter={null} iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[6, 6, 0, 0]} animationDuration={900}>
            <LabelList dataKey={s.key} position="top" className="dean-viz-label" fill={s.labelColor || '#334155'} />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Stacked bars by year level. */
export function StackedYearChart({ data, series, height = 280 }) {
  if (!data.length || data.every((d) => series.every((s) => !d[s.key]))) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 8 }} barCategoryGap="26%">
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="label" tick={AXIS_TICK} />
        <YAxis tick={AXIS_TICK} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} />
        <Legend itemSorter={null} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId="y"
            fill={s.color}
            radius={i === series.length - 1 ? [8, 8, 0, 0] : [0, 0, 0, 0]}
            animationDuration={900}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, centerValue, centerLabel, height = 280 }) {
  const items = data.filter((d) => d.value > 0);
  if (!items.length) return <EmptyChart />;
  const legendHeight = 36;
  return (
    <div className="dean-pie" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={items}
            dataKey="value"
            nameKey="name"
            cy={(height - legendHeight) / 2}
            innerRadius="60%"
            outerRadius="86%"
            paddingAngle={items.length > 1 ? 2 : 0}
            stroke="none"
            animationDuration={900}
          >
            {items.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`${v} students`, n]} />
          <Legend itemSorter={null} iconType="circle" verticalAlign="bottom" height={legendHeight} wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      {centerValue != null ? (
        <div className="dean-pie__center" style={{ height: height - legendHeight }}>
          <strong>{centerValue}</strong>
          <span>{centerLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Horizontal bars of pass rate with the intervention line. */
export function PassRateBarChart({ subjects, threshold = 75 }) {
  if (!subjects.length) return <EmptyChart text="No subject has enough graded students for this term." />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, subjects.length * 32 + 40)}>
      <BarChart data={subjects} layout="vertical" margin={{ top: 16, right: 48, left: 8, bottom: 8 }}>
        <CartesianGrid horizontal={false} stroke={COLORS.grid} />
        <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="code" width={90} tick={AXIS_TICK} interval={0} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={CURSOR}
          formatter={(v) => [`${v}%`, 'Pass rate']}
          labelFormatter={(_, p) => {
            const s = p?.[0]?.payload;
            return s ? `${s.code} – ${s.name} (${s.passed}/${s.enrolled} passed)` : '';
          }}
        />
        <ReferenceLine
          x={threshold}
          stroke={COLORS.bad}
          strokeDasharray="5 4"
          label={{ value: `${threshold}%`, position: 'top', fill: COLORS.bad, fontSize: 11 }}
        />
        <Bar dataKey="pass_rate" radius={[0, 8, 8, 0]} animationDuration={900}>
          {subjects.map((s) => (
            <Cell key={s.subject_id} fill={toneColor(s.pass_rate, threshold)} />
          ))}
          <LabelList dataKey="pass_rate" position="right" formatter={(v) => `${v}%`} className="dean-viz-label" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GradeDistributionChart({ data, height = 300 }) {
  if (!data.length || data.every((d) => !d.count)) return <EmptyChart text="No grades recorded for this term yet." />;
  const colorFor = (label) => {
    if (label === 'INC') return COLORS.warn;
    if (label === 'DRP') return COLORS.muted;
    if (label === '5.00') return COLORS.bad;
    const g = Number(label);
    if (g <= 1.5) return '#15803d';
    if (g <= 2.25) return COLORS.good;
    return '#86efac';
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 8 }} barCategoryGap="14%">
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="label" tick={{ ...AXIS_TICK, fontSize: 11 }} interval={0} />
        <YAxis tick={AXIS_TICK} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} formatter={(v) => [`${v} results`, 'Count']} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} animationDuration={900}>
          {data.map((d) => (
            <Cell key={d.label} fill={colorFor(d.label)} />
          ))}
          <LabelList dataKey="count" position="top" className="dean-viz-label dean-viz-label--sm" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}