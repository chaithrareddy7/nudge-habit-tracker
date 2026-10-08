import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDuration } from '../lib/dates'
import { ChartTooltip, Dot } from '../ui/kit'
import { hourLabel, hourTick, hourTicks, shortHour, WEEKDAYS } from './chartUtils'
import './charts.css'

// Shared chart building blocks for Analytics and Insights. Values are seconds.

export type Series = { key: string; name: string; color: string; kind?: 'line' | 'area' | 'dashed' }
export type ChartRow = { label: string; full?: string } & Record<string, string | number | undefined>

const axis = { axisLine: false, tickLine: false, tick: { fill: 'var(--ink-3)', fontSize: 11 } } as const

export function ChartLegend({ series }: { series: Series[] }) {
  return (
    <div className="legend an-legend" aria-hidden>
      {series.map(s => (
        <span key={s.key}><i className={`an-key ${s.kind === 'dashed' ? 'dashed' : s.kind ? 'line' : ''}`} style={{ ['--c' as string]: s.color }} />{s.name}</span>
      ))}
    </div>
  )
}

/** Chart wrapper: legend, sized box with a text summary for screen readers, and a "View as table" fallback. */
export function ChartFrame({ summary, head, rows, size, legend, children }: { summary: string; head: string[]; rows: ReactNode[][]; size?: 'sm' | 'lg'; legend?: Series[]; children: ReactNode }) {
  return (
    <figure className="an-figure">
      {legend && legend.length > 1 && <ChartLegend series={legend} />}
      <div className={`chart-box ${size || ''}`} role="img" aria-label={summary}>{children}</div>
      <details className="an-table">
        <summary>View as table</summary>
        <div className="an-table-scroll">
          <table>
            <thead><tr>{head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j} className="tabular">{c}</td>))}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

const rowsFor = (data: ChartRow[], series: Series[]) => data.map(d => [d.full ?? d.label, ...series.map(s => formatDuration(Number(d[s.key]) || 0))])
const maxOf = (data: ChartRow[], series: Series[], extra = 0) => Math.max(extra, ...data.flatMap(d => series.map(s => Number(d[s.key]) || 0)))

/** Vertical bars (one or two series, grouped) with an optional dashed target line. */
export function BarsChart({ data, series, target, targetLabel, summary, xLabel = 'Period', size, onSelect }: { data: ChartRow[]; series: Series[]; target?: number; targetLabel?: string; summary: string; xLabel?: string; size?: 'sm' | 'lg'; onSelect?: (row: ChartRow) => void }) {
  const ticks = hourTicks(maxOf(data, series, target))
  const fullOf = (l: string | number) => String(data.find(d => d.label === l)?.full ?? l)
  return (
    <ChartFrame summary={summary} legend={series} head={[xLabel, ...series.map(s => s.name)]} rows={rowsFor(data, series)} size={size}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} barCategoryGap="24%" margin={{ top: 10, right: 6, left: -14, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={4} />
          <YAxis {...axis} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} tickFormatter={hourTick} width={44} />
          <Tooltip content={<ChartTooltip labelFormat={fullOf} />} cursor={{ fill: 'var(--surface-2)' }} />
          {target ? <ReferenceLine y={target} stroke="var(--ink-3)" strokeDasharray="4 4" label={{ value: targetLabel, position: 'insideTopRight', fill: 'var(--ink-3)', fontSize: 11 }} /> : null}
          {series.map(s => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={18} style={onSelect ? { cursor: 'pointer' } : undefined} onClick={onSelect ? (_, i) => onSelect(data[i]) : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/** Lines / areas over time with an optional dashed reference line. */
export function TrendChart({ data, series, target, targetLabel, summary, xLabel = 'Period', size }: { data: ChartRow[]; series: Series[]; target?: number; targetLabel?: string; summary: string; xLabel?: string; size?: 'sm' | 'lg' }) {
  const ticks = hourTicks(maxOf(data, series, target))
  const fullOf = (l: string | number) => String(data.find(d => d.label === l)?.full ?? l)
  return (
    <ChartFrame summary={summary} legend={series} head={[xLabel, ...series.map(s => s.name)]} rows={rowsFor(data, series)} size={size}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={10} />
          <YAxis {...axis} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} tickFormatter={hourTick} width={44} />
          <Tooltip content={<ChartTooltip labelFormat={fullOf} />} cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }} />
          {target ? <ReferenceLine y={target} stroke="var(--ink-3)" strokeDasharray="4 4" label={{ value: targetLabel, position: 'insideTopRight', fill: 'var(--ink-3)', fontSize: 11 }} /> : null}
          {series.map(s => s.kind === 'area'
            ? <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} fill={s.color} fillOpacity={0.14} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: s.color }} />
            : <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} strokeDasharray={s.kind === 'dashed' ? '5 4' : undefined} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: s.color }} />)}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

export type HBarItem = { key: string; name: ReactNode; color: string; seconds: number; to?: string; note?: ReactNode }

/** Part-to-whole as horizontal bars, largest first, each in its entity colour with a direct label. */
export function HBars({ items, label, total }: { items: HBarItem[]; label: string; total?: number }) {
  const sorted = [...items].sort((a, b) => b.seconds - a.seconds)
  const max = Math.max(1, ...sorted.map(i => i.seconds))
  const sum = total ?? sorted.reduce((n, i) => n + i.seconds, 0)
  return (
    <ul className="an-hbars" aria-label={label}>
      {sorted.map(i => {
        const share = sum ? Math.round((i.seconds / sum) * 100) : 0
        const body = (
          <>
            <span className="an-hbar-head">
              <span className="row an-hbar-name"><Dot color={i.color} />{i.name}</span>
              <span className="an-hbar-val tabular">{formatDuration(i.seconds)}<span className="muted"> · {share}%</span>{i.note}</span>
            </span>
            <span className="an-hbar-track"><i style={{ width: `${(i.seconds / max) * 100}%`, background: i.color }} /></span>
          </>
        )
        return <li key={i.key}>{i.to ? <Link to={i.to} className="an-hbar">{body}</Link> : <div className="an-hbar">{body}</div>}</li>
      })}
    </ul>
  )
}

/** Weekday × hour-of-day heatmap on a single-hue ramp of the accent. `grid` is 7 rows (Mon first) × 24 hours of seconds. */
export function WeekHourHeatmap({ grid, fromHour = 6, toHour = 23 }: { grid: number[][]; fromHour?: number; toHour?: number }) {
  // Widen the window to include any hour with activity.
  let lo = fromHour
  let hi = toHour
  grid.forEach(row => row.forEach((v, h) => { if (v > 0) { lo = Math.min(lo, h); hi = Math.max(hi, h + 1) } }))
  const hours = Array.from({ length: Math.max(1, hi - lo) }, (_, i) => lo + i)
  const max = Math.max(0, ...grid.flat())
  let peak = { d: 0, h: 0, v: 0 }
  grid.forEach((row, d) => row.forEach((v, h) => { if (v > peak.v) peak = { d, h, v } }))
  const summary = max ? `Heatmap of productive time by weekday and hour. Peak: ${WEEKDAYS[peak.d]} at ${hourLabel(peak.h)} with ${formatDuration(peak.v)}.` : 'No tracked time in this period.'
  const shade = (v: number) => (v > 0 ? `color-mix(in srgb, var(--accent) ${Math.round(18 + 82 * (v / max))}%, var(--surface-3))` : 'var(--surface-3)')
  return (
    <figure className="an-figure">
      <div className="an-heat-scroll">
        <div className="an-heat" role="img" aria-label={summary} style={{ gridTemplateColumns: `28px repeat(${hours.length}, minmax(0, 1fr))` }}>
          <span />
          {hours.map(h => <span key={h} className="an-heat-hour">{(h - lo) % 3 === 0 ? shortHour(h) : ''}</span>)}
          {grid.map((row, d) => (
            <div className="an-heat-row" key={d} style={{ display: 'contents' }}>
              <span className="an-heat-day">{WEEKDAYS[d].slice(0, 3)}</span>
              {hours.map(h => <span key={h} className="an-heat-cell" style={{ background: shade(row[h]) }} title={`${WEEKDAYS[d]} ${hourLabel(h)} · ${formatDuration(row[h])}`} />)}
            </div>
          ))}
        </div>
      </div>
      <div className="an-heat-legend" aria-hidden>
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map(f => <i key={f} style={{ background: f ? `color-mix(in srgb, var(--accent) ${Math.round(18 + 82 * f)}%, var(--surface-3))` : 'var(--surface-3)' }} />)}
        <span>More</span>
      </div>
    </figure>
  )
}
