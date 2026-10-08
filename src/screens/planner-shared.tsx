import { useState, type MouseEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { addMonths } from 'date-fns'
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Pencil, Trophy } from 'lucide-react'
import { fmt, formatMinutes, fromKey, monthKey, monthGridKeys, shiftKey, todayKey, toKey, weekStartKey } from '../lib/dates'
import type { DateKey, ReviewPeriod } from '../lib/model'
import { routes } from '../lib/routes'
import { categoryColor, daySummary } from '../lib/selectors'
import { useStore } from '../lib/store'
import { useEditors } from '../shell/editors'
import { Button, Dot, Duration, Field, IconButton, useSeriesColor } from '../ui/kit'
import { minutesToHours, timeRange, useReviewAnswers } from './planner-utils'
import './planner.css'

// ---------------------------------------------------------------------------
// Page frame for the planner views. The shell already shows the Day / Week /
// Month / Calendar switcher above, so each view gets one slim toolbar instead
// of a big page header: arrows, the period as the title, and its actions.

type Mode = 'day' | 'week' | 'month'

function stepKey(value: DateKey, mode: Mode, dir: number) {
  if (mode === 'day') return shiftKey(value, dir)
  if (mode === 'week') return shiftKey(weekStartKey(value), dir * 7)
  return toKey(addMonths(fromKey(value), dir))
}

function isCurrentPeriod(value: DateKey, mode: Mode) {
  const today = todayKey()
  if (mode === 'day') return value === today
  if (mode === 'week') return weekStartKey(value) === weekStartKey(today)
  return monthKey(value) === monthKey(today)
}

export function PlanPage({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <motion.div className={`page plan-page ${className}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      {children}
    </motion.div>
  )
}

/**
 * Slim toolbar: ‹ › Title  [Today]            actions
 * `title` / `short` are the long and phone-width labels of the period.
 */
export function PlanHeader({ mode, value, onChange, title, short, note, actions }: {
  mode: Mode
  value: DateKey
  onChange: (k: DateKey) => void
  title: string
  short?: string
  note?: ReactNode
  actions?: ReactNode
}) {
  const current = isCurrentPeriod(value, mode)
  const now = mode === 'day' ? 'Today' : mode === 'week' ? 'This week' : 'This month'
  return (
    <header className="plan-head">
      <div className="plan-head-nav">
        <span className="plan-head-arrows">
          <IconButton bordered label={`Previous ${mode}`} onClick={() => onChange(stepKey(value, mode, -1))}><ChevronLeft size={17} /></IconButton>
          <IconButton bordered label={`Next ${mode}`} onClick={() => onChange(stepKey(value, mode, 1))}><ChevronRight size={17} /></IconButton>
        </span>
        <h1 className="plan-head-title">
          <span className={short ? 'plan-head-long' : ''}>{title}</span>
          {short && <span className="plan-head-short" aria-hidden>{short}</span>}
        </h1>
        {current
          ? <span className="chip accent plan-head-now">{now}</span>
          : <Button size="sm" className="plan-head-today" onClick={() => onChange(todayKey())}>{now}</Button>}
        {note && <span className="plan-head-note">{note}</span>}
      </div>
      {actions && <div className="plan-head-actions">{actions}</div>}
    </header>
  )
}

// ---------------------------------------------------------------------------
// Compact one-row stat strip (2 columns on phones).

export function StatStrip({ children, label }: { children: ReactNode; label: string }) {
  return <section className="plan-strip" aria-label={label}>{children}</section>
}

export function StripStat({ label, icon, value, sub, children, className = '' }: { label: ReactNode; icon?: ReactNode; value: ReactNode; sub?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`plan-strip-stat ${className}`}>
      <span className="plan-strip-label">{icon}{label}</span>
      <span className="plan-strip-value tabular">{value}</span>
      {sub && <span className="plan-strip-sub">{sub}</span>}
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Collapsible card section; open state remembered per id on this device.

const SECTIONS_KEY = 'nudge-planner-sections'
const readSections = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(SECTIONS_KEY) || '{}') } catch { return {} } }

export function Section({ id, icon, title, meta, action, defaultOpen = true, children, className = '' }: {
  id: string
  icon?: ReactNode
  title: ReactNode
  meta?: ReactNode
  action?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(() => readSections()[id] ?? defaultOpen)
  const toggle = () => {
    const next = !open
    setOpen(next)
    try { localStorage.setItem(SECTIONS_KEY, JSON.stringify({ ...readSections(), [id]: next })) } catch { /* storage unavailable */ }
  }
  const bodyId = `section-${id}`
  return (
    <section className={`card plan-section ${open ? 'is-open' : ''} ${className}`}>
      <div className="plan-section-head">
        <button type="button" className="plan-section-toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          <ChevronDown size={15} className="plan-section-chev" aria-hidden />
          {icon}
          <h2>{title}</h2>
          {meta !== undefined && meta !== null && meta !== '' && <span className="plan-section-meta tabular">{meta}</span>}
        </button>
        {action}
      </div>
      {open && <div className="plan-section-body" id={bodyId}>{children}</div>}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Inline target editor (hours), used for day / week / month overrides.

export function TargetEditor({ minutes, onSave, label, step = 0.5, overridden, onReset, compact }: {
  minutes: number
  onSave: (minutes: number) => void
  label: string
  step?: number
  overridden?: boolean
  onReset?: () => void
  compact?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const start = () => { setValue(String(minutesToHours(minutes))); setEditing(true) }
  const commit = () => {
    const hours = Number(value)
    if (value.trim() !== '' && Number.isFinite(hours) && hours >= 0) onSave(Math.round(hours * 60))
    setEditing(false)
  }
  if (editing) {
    return (
      <form className={`plan-target editing ${compact ? 'compact' : ''}`} onSubmit={e => { e.preventDefault(); commit() }}>
        <input
          className="input"
          type="number"
          min={0}
          step={step}
          value={value}
          autoFocus
          aria-label={`${label} in hours`}
          onChange={e => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
        />
        <span className="muted">h</span>
        <IconButton size="sm" label="Save target" type="submit" onMouseDown={e => e.preventDefault()}><Check size={14} /></IconButton>
      </form>
    )
  }
  return (
    <span className={`plan-target ${compact ? 'compact' : ''}`}>
      <button type="button" className="plan-target-btn" onClick={start} aria-label={`Edit ${label.toLowerCase()} (currently ${formatMinutes(minutes, { short: true })})`}>
        {!compact && <span className="muted">Target</span>}
        <b className="tabular">{formatMinutes(minutes, { short: true })}</b>
        <Pencil size={11} aria-hidden />
      </button>
      {overridden && onReset && !compact && <button type="button" className="plan-target-reset" onClick={onReset}>Use default</button>}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Reflection prompts with debounced autosave. Render with `key={start}`.

export type Prompt = { key: string; label: string; placeholder: string }

export function ReviewPrompts({ period, start, prompts }: { period: ReviewPeriod; start: DateKey; prompts: Prompt[] }) {
  const { draft, setAnswer, status, flush } = useReviewAnswers(period, start)
  return (
    <div className="plan-prompts">
      {prompts.map(p => (
        <Field key={p.key} label={p.label}>
          <textarea className="textarea" value={draft[p.key] || ''} placeholder={p.placeholder} onChange={e => setAnswer(p.key, e.target.value)} onBlur={flush} rows={3} />
        </Field>
      ))}
      <p className="plan-save-status muted" aria-live="polite">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? <><Check size={12} /> Saved</> : 'Your answers save automatically.'}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small pieces

export function DayLink({ date, children, className = '' }: { date: DateKey; children: ReactNode; className?: string }) {
  return <Link to={routes.day(date)} className={`plan-daylink ${className}`} aria-label={`Open ${fmt(date, 'EEEE, MMMM d')}`}>{children}</Link>
}

export function HabitDots({ done, due, max = 6 }: { done: number; due: number; max?: number }) {
  if (!due) return null
  const label = `${done} of ${due} habits done`
  if (due > max) return <span className="cal-dots-count tabular" title={label} aria-label={label}>{done}/{due}</span>
  return (
    <span className="cal-dots" title={label} aria-label={label} role="img">
      {Array.from({ length: due }, (_, i) => <i key={i} className={i < done ? 'on' : ''} />)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Month grid — shared by the month planner (productivity focus) and the
// calendar month view (agenda focus).

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type GridItem = { id: string; kind: 'event' | 'block' | 'task'; label: string; color?: string; important?: boolean; done?: boolean }

export function MonthGrid({ month, variant }: { month: DateKey; variant: 'planner' | 'calendar' }) {
  const { ws } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  const navigate = useNavigate()
  const today = todayKey()
  const current = monthKey(month)
  const keys = monthGridKeys(month)
  // Trim a trailing week that belongs entirely to the next month.
  const visible = keys.slice(35).every(k => monthKey(k) !== current) ? keys.slice(0, 35) : keys

  const onCell = (e: MouseEvent, key: DateKey) => {
    if ((e.target as HTMLElement).closest('button, a')) return
    navigate(routes.day(key))
  }

  return (
    <div className={`cal-grid-wrap cal-${variant}`}>
      <div className="cal-grid" role="grid" aria-label={`${fmt(month, 'MMMM yyyy')} calendar`}>
        <div className="cal-row cal-head" role="row">
          {WEEKDAYS.map(d => <div key={d} role="columnheader" className="cal-weekday"><span className="cal-wd-long">{d}</span><span className="cal-wd-short" aria-hidden>{d[0]}</span></div>)}
        </div>
        {Array.from({ length: visible.length / 7 }, (_, w) => (
          <div className="cal-row" role="row" key={w}>
            {visible.slice(w * 7, w * 7 + 7).map(key => {
              const s = daySummary(ws, key)
              const outside = monthKey(key) !== current
              const items: GridItem[] = variant === 'calendar'
                ? [
                  ...s.events.map(e => ({ id: e.id, kind: 'event' as const, label: `${e.start_min !== null ? `${timeRange(e.start_min, null)} ` : ''}${e.title}`, important: e.important })),
                  ...s.blocks.map(b => ({ id: b.id, kind: 'block' as const, label: `${timeRange(b.start_min, null)} ${b.title || b.category}`, color: categoryColor(ws, b.category) })),
                  ...s.tasks.map(t => ({ id: t.id, kind: 'task' as const, label: t.title, done: t.done, color: categoryColor(ws, t.category) })),
                ]
                : s.events.filter(e => e.important).map(e => ({ id: e.id, kind: 'event' as const, label: e.title, important: true }))
              const shown = items.slice(0, 3)
              return (
                <div
                  key={key}
                  role="gridcell"
                  className={`cal-cell ${outside ? 'is-outside' : ''} ${key === today ? 'is-today' : ''}`}
                  data-status={variant === 'planner' ? s.status : undefined}
                  onClick={e => onCell(e, key)}
                >
                  <div className="cal-cell-top">
                    <DayLink date={key} className="cal-num">{fmt(key, 'd')}</DayLink>
                    <span className="cal-flags">
                      {s.journal && <BookOpen size={11} aria-label="Journal written" />}
                      {s.goalsCompleted.length > 0 && <Trophy size={11} className="cal-trophy" aria-label={`${s.goalsCompleted.length} goal${s.goalsCompleted.length > 1 ? 's' : ''} completed`} />}
                    </span>
                  </div>
                  {variant === 'planner' ? (
                    <>
                      <span className={`cal-hours tabular ${s.seconds ? '' : 'is-zero'}`}>{s.seconds ? <Duration seconds={s.seconds} /> : outside || key > today ? '' : '—'}</span>
                      <HabitDots done={s.habitsDone} due={key > today ? 0 : s.habits.length} />
                      {shown.length > 0 && <div className="cal-chips">{shown.map(i => <span key={i.id} className="cal-chip important" title={i.label}>{i.label}</span>)}</div>}
                    </>
                  ) : (
                    <>
                      <div className="cal-items">
                        {shown.map(i => (
                          <button
                            type="button"
                            key={i.id}
                            className={`cal-item kind-${i.kind} ${i.important ? 'important' : ''} ${i.done ? 'is-done' : ''}`}
                            title={i.label}
                            onClick={() => open({ kind: i.kind, id: i.id })}
                          >
                            {i.color && <Dot color={color(i.color)} size={6} />}
                            <span>{i.label}</span>
                          </button>
                        ))}
                        {items.length > 3 && <DayLink date={key} className="cal-more">+{items.length - 3} more</DayLink>}
                      </div>
                      {items.length > 0 && <span className="cal-count" aria-hidden>{items.length}</span>}
                      {s.seconds > 0 && <span className="cal-hours tabular small"><Duration seconds={s.seconds} /></span>}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {variant === 'planner' && (
        <div className="legend cal-legend" aria-label="Legend">
          <span><i className="cal-key" data-status="started" />Started</span>
          <span><i className="cal-key" data-status="minimum" />Minimum met</span>
          <span><i className="cal-key" data-status="target" />Target reached</span>
          <span><span className="cal-dots"><i className="on" /><i /></span>Habits done / due</span>
          <span><BookOpen size={11} />Journal</span>
          <span><Trophy size={11} className="cal-trophy" />Goal completed</span>
        </div>
      )}
    </div>
  )
}
