import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, BookOpen, CalendarClock, CalendarDays, Check, Clock, Flag, GripVertical, Inbox, ListChecks, MapPin, NotebookPen, Play, Plus, Sparkles, Star, Target, Timer, Trash2 } from 'lucide-react'
import { fmt, formatDuration, formatMinutes, minToClock, nowMin, shiftKey, todayKey, toKey } from '../lib/dates'
import type { DateKey, PlannerEvent, ProductiveSession, TimeBlock } from '../lib/model'
import { routes } from '../lib/routes'
import { activeTimerSeconds, blockActualSeconds, blocksOn, categoryColor, daySummary, dayPlan, dayTargetMinutes, eventsOn, goalById, habitDoneOn, habitsForDay, pct, sessionsOn, tasksOn } from '../lib/selectors'
import { useStore, useTick } from '../lib/store'
import { useEditors } from '../shell/editors'
import { Button, Dot, IconButton, ProgressBar, useSeriesColor } from '../ui/kit'
import { GoalRow, HabitChecklist, PlanVsReality, TaskChecklist } from '../ui/widgets'
import { JournalForm } from './Journal'
import { PlanHeader, PlanPage, Section, StatStrip, StripStat, TargetEditor } from './planner-shared'
import './dayplanner.css'

// ---------------------------------------------------------------------------
// Timeline geometry

const PX_PER_HOUR = 64
const PX_PER_MIN = PX_PER_HOUR / 60
const SNAP = 15
const DRAG_THRESHOLD = 4 // px before a press becomes a drag

const snap = (m: number) => Math.round(m / SNAP) * SNAP
const snapDown = (m: number) => Math.floor(m / SNAP) * SNAP
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Local minutes since midnight for an ISO timestamp, relative to `date`. */
function minuteOf(iso: string, date: DateKey) {
  const d = new Date(iso)
  const m = d.getHours() * 60 + d.getMinutes()
  // A session that runs past midnight keeps going on the same column.
  const sameDay = toKey(d) === date
  return sameDay ? m : m + 24 * 60
}

type Placed = { col: number; cols: number }

/** Side-by-side columns for overlapping items (like a calendar day view). */
function layoutColumns(items: Array<{ id: string; start: number; end: number }>) {
  const out = new Map<string, Placed>()
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  let cluster: Array<{ id: string; col: number }> = []
  let colEnds: number[] = []
  let clusterEnd = -1
  const close = () => {
    for (const c of cluster) out.set(c.id, { col: c.col, cols: colEnds.length })
    cluster = []
    colEnds = []
  }
  for (const item of sorted) {
    if (item.start >= clusterEnd) close()
    let col = colEnds.findIndex(end => end <= item.start)
    if (col === -1) { col = colEnds.length; colEnds.push(item.end) } else colEnds[col] = item.end
    cluster.push({ id: item.id, col })
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  close()
  return out
}

type Drag =
  | { mode: 'move' | 'resize'; id: string; pointerId: number; y0: number; start0: number; end0: number; moved: boolean; tapOnly: boolean }
  | { mode: 'create'; pointerId: number; y0: number; anchor: number; moved: boolean; tapOnly: boolean }

type Preview = { id: string | null; start: number; end: number }

// ---------------------------------------------------------------------------

function useDateParam() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('date')
  const date = raw && KEY_RE.test(raw) ? raw : todayKey()
  const setDate = (key: DateKey) => setParams(prev => { const next = new URLSearchParams(prev); next.set('date', key); return next }, { replace: true })
  return [date, setDate] as const
}

function relativeNote(date: DateKey) {
  const today = todayKey()
  if (date === shiftKey(today, 1)) return 'Tomorrow'
  if (date === shiftKey(today, -1)) return 'Yesterday'
  return null
}

export default function DayPlanner() {
  const [date, setDate] = useDateParam()
  return (
    <PlanPage className="day-page">
      <PlanHeader
        mode="day"
        value={date}
        onChange={setDate}
        title={fmt(date, 'EEEE, MMMM d')}
        short={fmt(date, 'EEE, MMM d')}
        note={relativeNote(date)}
        actions={<AddMenu date={date} />}
      />
      <DayHeader date={date} />
      <div className="day-layout">
        <Timeline date={date} />
        <aside className="day-side" aria-label="Day details">
          <TasksCard date={date} />
          <HabitsSection date={date} />
          <ReflectionSection date={date} />
          <EventsCard date={date} />
          <NotesCard date={date} />
          <GoalsCard date={date} />
          <Section id="day-pvr" icon={<Target size={15} />} title="Plan vs reality" defaultOpen={false}>
            <PlanVsReality from={date} to={date} />
          </Section>
        </aside>
      </div>
    </PlanPage>
  )
}

// ---------------------------------------------------------------------------
// Quick add

function AddMenu({ date }: { date: DateKey }) {
  const { open } = useEditors()
  const [shown, setShown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!shown) return
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setShown(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShown(false) }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey) }
  }, [shown])
  const blockStart = date === todayKey() ? clamp(snap(nowMin() + 15), 0, 23 * 60) : 9 * 60
  const items = [
    { label: 'Time block', icon: <CalendarClock size={16} />, run: () => open({ kind: 'block', defaults: { date, start_min: blockStart, end_min: blockStart + 60 } }) },
    { label: 'Task', icon: <ListChecks size={16} />, run: () => open({ kind: 'task', defaults: { date } }) },
    { label: 'Event', icon: <CalendarDays size={16} />, run: () => open({ kind: 'event', defaults: { date } }) },
    { label: 'Habit', icon: <Sparkles size={16} />, run: () => open({ kind: 'habit' }) },
    { label: 'Note', icon: <NotebookPen size={16} />, run: () => open({ kind: 'note', defaults: { date } }) },
    { label: 'Log a session', icon: <Timer size={16} />, run: () => open({ kind: 'session', defaults: { date } }) },
  ]
  return (
    <div className="day-add" ref={ref}>
      <Button variant="primary" icon={<Plus size={16} />} aria-haspopup="menu" aria-expanded={shown} onClick={() => setShown(s => !s)}>Add</Button>
      {shown && (
        <div className="day-add-menu" role="menu" aria-label="Add to this day">
          {items.map(item => (
            <button type="button" role="menuitem" key={item.label} onClick={() => { setShown(false); item.run() }}>
              {item.icon}{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header strip: productive time, planned time, checklist, main focus

function DayHeader({ date }: { date: DateKey }) {
  const { ws, setDayPlan } = useStore()
  const isToday = date === todayKey()
  const now = useTick(isToday && !!ws.settings.active_timer?.resumed_at, 60_000)
  const summary = daySummary(ws, date)
  const plan = dayPlan(ws, date)
  const targetMin = dayTargetMinutes(ws, date)
  const timer = ws.settings.active_timer
  const live = isToday && timer && timer.started_at && toKey(new Date(timer.started_at)) === date ? activeTimerSeconds(ws, now) : 0
  const seconds = summary.seconds + live
  const reached = targetMin > 0 && seconds >= targetMin * 60
  const focusBlocks = summary.blocks.filter(b => b.kind === 'focus').length
  const custom = plan?.target_minutes != null

  return (
    <StatStrip label="Day overview">
      <StripStat
        className="is-lead"
        label={<>Productive<span className="plan-strip-aside">{reached ? 'Target reached' : targetMin > 0 ? `${formatDuration(targetMin * 60 - seconds)} to go` : 'No target'}{live > 0 && ' · live'}</span></>}
        icon={<Timer size={12} />}
        value={<>{formatDuration(seconds)}<TargetEditor compact label="Day target" minutes={targetMin} step={0.25} onSave={m => setDayPlan(date, { target_minutes: m })} />{custom && <button type="button" className="day-reset" onClick={() => setDayPlan(date, { target_minutes: null })}>reset</button>}</>}
      >
        <ProgressBar value={pct(seconds, targetMin * 60)} size="thin" tone={reached ? 'good' : undefined} label="Progress toward the day’s target" />
      </StripStat>
      <StripStat
        label="Planned"
        icon={<CalendarClock size={12} />}
        value={formatDuration(summary.plannedSeconds)}
        sub={`${focusBlocks} focus block${focusBlocks === 1 ? '' : 's'}${targetMin > 0 ? ` · ${pct(summary.plannedSeconds, targetMin * 60)}% of target` : ''}`}
      />
      <StripStat
        label="Checklist"
        icon={<ListChecks size={12} />}
        value={`${summary.completion}%`}
        sub={`${summary.tasksDone}/${summary.tasks.length} tasks · ${summary.habitsDone}/${summary.habits.length} habits`}
      />
      <FocusTile key={date} date={date} initial={plan?.focus || ''} />
    </StatStrip>
  )
}

/** Main focus — local draft, saved on a short debounce and on blur. Keyed by date so it resets per day. */
function FocusTile({ date, initial }: { date: DateKey; initial: string }) {
  const { setDayPlan } = useStore()
  const [text, setText] = useState(initial)
  const saved = useRef(initial)
  const timer = useRef<number | undefined>(undefined)
  const commit = (value: string) => {
    window.clearTimeout(timer.current)
    if (value.trim() === saved.current.trim()) return
    saved.current = value
    setDayPlan(date, { focus: value.trim() })
  }
  const latest = useRef(text)
  const commitRef = useRef(commit)
  useEffect(() => { commitRef.current = commit })
  useEffect(() => () => commitRef.current(latest.current), [])
  return (
    <div className="plan-strip-stat is-wide day-focus">
      <label className="plan-strip-label" htmlFor={`focus-${date}`}><Flag size={12} /> Main focus</label>
      <input
        id={`focus-${date}`}
        className="day-focus-input"
        value={text}
        placeholder="The one thing that would make this day a win…"
        onChange={e => { const v = e.target.value; setText(v); latest.current = v; window.clearTimeout(timer.current); timer.current = window.setTimeout(() => commit(v), 700) }}
        onBlur={() => commit(text)}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// The timeline

function Timeline({ date }: { date: DateKey }) {
  const { ws, update, startTimer } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  const isToday = date === todayKey()
  const now = useTick(isToday, 60_000)
  const scrollRef = useRef<HTMLDivElement>(null)
  const laneRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)

  const blocks = blocksOn(ws, date)
  const events = eventsOn(ws, date)
  const allDay = events.filter(e => e.start_min === null)
  const timed = events.filter(e => e.start_min !== null)
  const sessions = sessionsOn(ws, date)
  const timer = ws.settings.active_timer
  const timerToday = !!timer && toKey(new Date(timer.started_at)) === date

  // Range: settings, stretched to include anything scheduled outside it.
  const range = (() => {
    let lo = ws.settings.day_start_hour * 60
    let hi = Math.max(lo + 60, ws.settings.day_end_hour * 60)
    for (const b of blocks) { lo = Math.min(lo, b.start_min); hi = Math.max(hi, b.end_min) }
    for (const e of timed) { lo = Math.min(lo, e.start_min!); hi = Math.max(hi, e.end_min ?? e.start_min! + 30) }
    for (const s of sessions) { lo = Math.min(lo, minuteOf(s.started_at, date)); hi = Math.max(hi, minuteOf(s.ended_at, date)) }
    lo = Math.max(0, Math.floor(lo / 60) * 60)
    hi = Math.min(26 * 60, Math.ceil(hi / 60) * 60)
    return { lo, hi }
  })()

  const y = (minute: number) => (minute - range.lo) * PX_PER_MIN
  const height = (range.hi - range.lo) * PX_PER_MIN
  const hours = Array.from({ length: (range.hi - range.lo) / 60 + 1 }, (_, i) => range.lo + i * 60)
  const nowMinute = new Date(now).getHours() * 60 + new Date(now).getMinutes()
  const showNow = isToday && nowMinute >= range.lo && nowMinute <= range.hi

  // Auto-scroll: to "now" on today, otherwise to the first planned thing.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const first = [...blocks.map(b => b.start_min), ...timed.map(e => e.start_min!)].sort((a, b) => a - b)[0]
    const target = isToday ? nowMin() : first ?? range.lo + 120
    el.scrollTop = Math.max(0, (target - range.lo) * PX_PER_MIN - el.clientHeight / 3)
    // Only when the day changes — not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  // Items shown in the planned lane, with the drag preview applied.
  const shownBlocks = blocks.map(b => (preview?.id === b.id ? { ...b, start_min: preview.start, end_min: preview.end } : b))
  const placed = layoutColumns([
    ...shownBlocks.map(b => ({ id: b.id, start: b.start_min, end: b.end_min })),
    ...timed.map(e => ({ id: e.id, start: e.start_min!, end: Math.max(e.start_min! + 15, e.end_min ?? e.start_min! + 30) })),
  ])

  const minuteAt = (clientY: number) => {
    const rect = laneRef.current!.getBoundingClientRect()
    return range.lo + (clientY - rect.top) / PX_PER_MIN
  }

  // ---- pointer handling -------------------------------------------------

  const beginBlock = (e: ReactPointerEvent, b: TimeBlock, mode: 'move' | 'resize', viaHandle = false) => {
    if (e.button !== 0) return
    e.stopPropagation()
    // On touch, only the grip and resize handles drag; the block body stays scrollable and tappable.
    const tapOnly = e.pointerType === 'touch' && !viaHandle
    dragRef.current = { mode, id: b.id, pointerId: e.pointerId, y0: e.clientY, start0: b.start_min, end0: b.end_min, moved: false, tapOnly }
    if (!tapOnly) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const beginCreate = (e: ReactPointerEvent) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return
    const tapOnly = e.pointerType === 'touch'
    dragRef.current = { mode: 'create', pointerId: e.pointerId, y0: e.clientY, anchor: clamp(snapDown(minuteAt(e.clientY)), range.lo, range.hi - SNAP), moved: false, tapOnly }
    if (!tapOnly) e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId || d.tapOnly) return
    if (!d.moved && Math.abs(e.clientY - d.y0) < DRAG_THRESHOLD) return
    d.moved = true
    if (d.mode === 'create') {
      const cur = clamp(snap(minuteAt(e.clientY)), range.lo, range.hi)
      const start = Math.min(d.anchor, cur)
      const end = Math.max(d.anchor + SNAP, cur)
      setPreview({ id: null, start, end: Math.min(end, range.hi) })
      return
    }
    const delta = snap((e.clientY - d.y0) / PX_PER_MIN)
    if (d.mode === 'move') {
      const len = d.end0 - d.start0
      const start = clamp(d.start0 + delta, range.lo, range.hi - len)
      setPreview({ id: d.id, start, end: start + len })
    } else {
      setPreview({ id: d.id, start: d.start0, end: clamp(d.end0 + delta, d.start0 + SNAP, range.hi) })
    }
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    dragRef.current = null
    const p = preview
    setPreview(null)
    if (d.mode === 'create') {
      if (d.moved && p && p.end - p.start >= SNAP) open({ kind: 'block', defaults: { date, start_min: p.start, end_min: p.end } })
      else if (!d.moved) {
        const start = clamp(d.anchor, range.lo, range.hi - 60)
        open({ kind: 'block', defaults: { date, start_min: start, end_min: start + 60 } })
      }
      return
    }
    if (d.moved && p && (p.start !== d.start0 || p.end !== d.end0)) update('blocks', d.id, { start_min: p.start, end_min: p.end })
    else if (!d.moved && d.mode === 'move') open({ kind: 'block', id: d.id })
  }

  const onPointerCancel = () => { dragRef.current = null; setPreview(null) }

  const onBlockKey = (e: ReactKeyboardEvent, b: TimeBlock) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open({ kind: 'block', id: b.id }); return }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const dir = e.key === 'ArrowUp' ? -SNAP : SNAP
    if (e.shiftKey) update('blocks', b.id, { end_min: clamp(b.end_min + dir, b.start_min + SNAP, range.hi) })
    else {
      const len = b.end_min - b.start_min
      const start = clamp(b.start_min + dir, range.lo, range.hi - len)
      update('blocks', b.id, { start_min: start, end_min: start + len })
    }
  }

  const liveBlockId = timer?.block_id ?? null
  const canStart = isToday && !timer

  return (
    <section className="card day-timeline-card" aria-label="Timeline">
      <div className="day-timeline-head">
        <h2 className="row"><Clock size={15} /> Timeline</h2>
        <span className="day-timeline-hint-inline">Drag to plan or move · pull the bottom edge to resize</span>
        <div className="legend day-legend" aria-hidden>
          <span><i className="day-key planned" />Planned</span>
          <span><i className="day-key actual" />Tracked</span>
        </div>
      </div>
      {allDay.length > 0 && (
        <div className="day-allday" aria-label="All-day events">
          <span className="eyebrow">All day</span>
          {allDay.map(ev => (
            <button type="button" key={ev.id} className={`day-allday-item ${ev.important ? 'important' : ''}`} onClick={() => open({ kind: 'event', id: ev.id })}>
              {ev.important && <Star size={12} aria-label="Important" />}{ev.title}
            </button>
          ))}
        </div>
      )}

      <div className="day-scroll" ref={scrollRef}>
        <div className="day-grid" style={{ height }}>
          <div className="day-hours" aria-hidden>
            {hours.map(h => <span key={h} style={{ top: y(h) }}>{minToClock(h)}</span>)}
          </div>

          <div
            className="day-lane"
            ref={laneRef}
            onPointerDown={beginCreate}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            aria-label="Planned lane. Click an empty slot to plan a one-hour block."
          >
            {hours.map(h => <i key={h} className="day-hourline" style={{ top: y(h) }} aria-hidden />)}
            {hours.slice(0, -1).map(h => <i key={`h${h}`} className="day-halfline" style={{ top: y(h + 30) }} aria-hidden />)}

            {preview?.id === null && (
              <div className="day-ghost" style={{ top: y(preview.start), height: (preview.end - preview.start) * PX_PER_MIN }} aria-hidden>
                <span>{minToClock(preview.start)} – {minToClock(preview.end)}</span>
                <b>{formatMinutes(preview.end - preview.start)}</b>
              </div>
            )}

            {timed.map(ev => <EventItem key={ev.id} ev={ev} top={y(ev.start_min!)} place={placed.get(ev.id)} onOpen={() => open({ kind: 'event', id: ev.id })} />)}

            {shownBlocks.map(b => {
              const place = placed.get(b.id) || { col: 0, cols: 1 }
              const h = Math.max(SNAP * PX_PER_MIN, (b.end_min - b.start_min) * PX_PER_MIN)
              const focus = b.kind === 'focus'
              const actual = focus ? blockActualSeconds(ws, b.id) + (liveBlockId === b.id ? activeTimerSeconds(ws, now) : 0) : 0
              const planned = (b.end_min - b.start_min) * 60
              const goal = goalById(ws, b.goal_id)
              const live = liveBlockId === b.id
              const dragging = preview?.id === b.id
              const size = h < 34 ? 'xs' : h < 60 ? 'sm' : ''
              const style = {
                top: y(b.start_min),
                height: h,
                left: `calc(${(place.col / place.cols) * 100}% + 2px)`,
                width: `calc(${100 / place.cols}% - 4px)`,
                '--c': color(categoryColor(ws, b.category)),
              } as CSSProperties
              return (
                <div
                  key={b.id}
                  className={`day-block ${b.kind} ${size} ${live ? 'live' : ''} ${dragging ? 'dragging' : ''}`}
                  style={style}
                  role="button"
                  tabIndex={0}
                  aria-label={`${b.title}, ${minToClock(b.start_min)} to ${minToClock(b.end_min)}${focus ? `, ${b.category}` : ', break'}${live ? ', timer running' : ''}. Enter to edit, arrow keys to move, Shift plus arrows to resize.`}
                  onPointerDown={e => beginBlock(e, b, 'move')}
                  onKeyDown={e => onBlockKey(e, b)}
                >
                  <div className="day-block-head">
                    <span className="day-block-title">{live && <span className="day-live-dot" aria-hidden />}{b.title}</span>
                    {focus && canStart && size !== 'xs' && (
                      <button type="button" className="day-block-play" aria-label={`Start timer for ${b.title}`} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); startTimer({ block_id: b.id }) }}>
                        <Play size={12} />
                      </button>
                    )}
                  </div>
                  {size !== 'xs' && (
                    <div className="day-block-meta">
                      <span className="tabular">{minToClock(b.start_min)}–{minToClock(b.end_min)}</span>
                      {focus && <span>· {b.category}</span>}
                      {goal && <span className="day-block-goal"><Target size={10} /> {goal.title}</span>}
                    </div>
                  )}
                  {focus && !size && (
                    <div className="day-block-progress" title={`Tracked ${formatDuration(actual)} of ${formatDuration(planned)}`}>
                      <div className="day-block-bar"><i style={{ width: `${Math.min(100, pct(actual, planned))}%` }} /></div>
                      <span className="tabular">{formatDuration(actual)} / {formatDuration(planned, { short: true })}</span>
                    </div>
                  )}
                  <span className="day-block-grip" aria-hidden onPointerDown={e => beginBlock(e, b, 'move', true)}><GripVertical size={12} /></span>
                  <span className="day-block-resize" aria-hidden onPointerDown={e => beginBlock(e, b, 'resize', true)} />
                </div>
              )
            })}

            {showNow && <div className="day-now" style={{ top: y(nowMinute) }} aria-label={`Now, ${minToClock(nowMinute)}`}><span>{minToClock(nowMinute)}</span></div>}
          </div>

          <div className="day-actual" aria-label="Tracked sessions">
            {hours.map(h => <i key={h} className="day-hourline" style={{ top: y(h) }} aria-hidden />)}
            {sessions.map(s => <SessionBar key={s.id} s={s} date={date} top={y} color={color(categoryColor(ws, s.category))} onOpen={() => open({ kind: 'session', id: s.id })} />)}
            {timerToday && timer && (
              <div
                className="day-session live"
                style={{ top: y(minuteOf(timer.started_at, date)), height: Math.max(4, (nowMinute - minuteOf(timer.started_at, date)) * PX_PER_MIN), '--c': color(categoryColor(ws, timer.category)) } as CSSProperties}
                title={`Running: ${timer.label} · ${formatDuration(activeTimerSeconds(ws, now))}`}
              />
            )}
          </div>
        </div>
      </div>

      {!blocks.length && !timed.length && !sessions.length && (
        <p className="day-timeline-hint muted">Nothing on the timeline yet. Drag across an empty stretch (or tap a slot) to plan a focus block.</p>
      )}
    </section>
  )
}

function EventItem({ ev, top, place, onOpen }: { ev: PlannerEvent; top: number; place?: Placed; onOpen: () => void }) {
  const p = place || { col: 0, cols: 1 }
  const end = Math.max(ev.start_min! + 15, ev.end_min ?? ev.start_min! + 30)
  const h = (end - ev.start_min!) * PX_PER_MIN
  return (
    <button
      type="button"
      className={`day-event ${ev.important ? 'important' : ''} ${h < 34 ? 'xs' : ''}`}
      style={{ top, height: h, left: `calc(${(p.col / p.cols) * 100}% + 2px)`, width: `calc(${100 / p.cols}% - 4px)` }}
      onPointerDown={e => e.stopPropagation()}
      onClick={onOpen}
      aria-label={`Event: ${ev.title}, ${minToClock(ev.start_min!)}${ev.end_min !== null ? ` to ${minToClock(ev.end_min)}` : ''}`}
    >
      <span className="day-event-title"><CalendarDays size={11} />{ev.title}</span>
      {h >= 34 && <span className="day-event-meta tabular">{minToClock(ev.start_min!)}{ev.end_min !== null && `–${minToClock(ev.end_min)}`}{ev.location && <> · <MapPin size={10} /> {ev.location}</>}</span>}
    </button>
  )
}

function SessionBar({ s, date, top, color, onOpen }: { s: ProductiveSession; date: DateKey; top: (m: number) => number; color: string; onOpen: () => void }) {
  const start = minuteOf(s.started_at, date)
  const end = Math.max(start + 1, minuteOf(s.ended_at, date))
  const label = `${s.category} · ${formatDuration(s.duration_seconds)} tracked · ${minToClock(start)}–${minToClock(end)}`
  return (
    <button
      type="button"
      className="day-session"
      style={{ top: top(start), height: Math.max(4, (end - start) * PX_PER_MIN), '--c': color } as CSSProperties}
      title={label}
      aria-label={`Session: ${label}`}
      onClick={onOpen}
    />
  )
}

// ---------------------------------------------------------------------------
// Side column cards

function TasksCard({ date }: { date: DateKey }) {
  const { ws, update } = useStore()
  const { open } = useEditors()
  const [all, setAll] = useState(false)
  const tasks = tasksOn(ws, date)
  const backlog = ws.tasks.filter(t => t.date === null && !t.done).sort((a, b) => b.priority - a.priority || a.sort - b.sort)
  const shown = all ? backlog : backlog.slice(0, 3)
  return (
    <Section
      id="day-tasks"
      icon={<ListChecks size={15} />}
      title="Tasks"
      meta={tasks.length ? `${tasks.filter(t => t.done).length}/${tasks.length}` : null}
      action={<IconButton label="Add task" onClick={() => open({ kind: 'task', defaults: { date } })}><Plus size={16} /></IconButton>}
    >
      {tasks.length ? <TaskChecklist date={date} /> : <p className="day-empty-line">No tasks planned. Add one or pull from the backlog below.</p>}
      {backlog.length > 0 && (
        <div className="day-backlog">
          <div className="row-between">
            <span className="eyebrow row"><Inbox size={12} /> Backlog</span>
            <span className="muted tabular day-count">{backlog.length}</span>
          </div>
          <div className="list">
            {shown.map(t => (
              <div className="list-row day-backlog-row" key={t.id}>
                <Dot color={categoryColor(ws, t.category)} size={7} />
                <button type="button" className="grow day-backlog-title" onClick={() => open({ kind: 'task', id: t.id })}>
                  <span className="title">{t.title}</span>
                  <span className="meta">{t.category}{t.estimate_minutes > 0 && ` · ${formatMinutes(t.estimate_minutes)}`}</span>
                </button>
                <Button size="sm" variant="ghost" icon={<ArrowRight size={13} />} onClick={() => update('tasks', t.id, { date })} aria-label={`Move ${t.title} to ${fmt(date, 'MMM d')}`}>
                  {date === todayKey() ? 'Today' : fmt(date, 'MMM d')}
                </Button>
              </div>
            ))}
          </div>
          {backlog.length > 3 && <button type="button" className="card-link" onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${backlog.length}`}</button>}
        </div>
      )}
    </Section>
  )
}

function HabitsSection({ date }: { date: DateKey }) {
  const { ws } = useStore()
  const habits = habitsForDay(ws, date)
  const done = habits.filter(h => habitDoneOn(ws, h, date)).length
  return (
    <Section id="day-habits" icon={<Sparkles size={15} />} title="Habits" meta={habits.length ? `${done}/${habits.length}` : null}>
      <HabitChecklist date={date} />
    </Section>
  )
}

function ReflectionSection({ date }: { date: DateKey }) {
  const { ws } = useStore()
  const entry = ws.journal.find(j => j.date === date)
  const written = !!entry && !!(entry.body || entry.went_well || entry.mood)
  return (
    <Section
      id="day-reflection"
      icon={<NotebookPen size={15} />}
      title="Reflection"
      meta={written ? 'Written' : null}
      defaultOpen={false}
      action={<Link className="card-link day-section-link" to={routes.journal(date)}>Journal <ArrowRight size={13} /></Link>}
    >
      <JournalForm date={date} compact />
    </Section>
  )
}

function EventsCard({ date }: { date: DateKey }) {
  const { ws } = useStore()
  const { open } = useEditors()
  const events = eventsOn(ws, date)
  return (
    <Section
      id="day-events"
      icon={<CalendarDays size={15} />}
      title="Events"
      meta={events.length || null}
      action={<IconButton label="Add event" onClick={() => open({ kind: 'event', defaults: { date } })}><Plus size={16} /></IconButton>}
    >
      {events.length ? (
        <div className="list">
          {events.map(ev => (
            <button type="button" className="list-row day-event-row" key={ev.id} onClick={() => open({ kind: 'event', id: ev.id })}>
              <span className="day-event-time tabular">{ev.start_min === null ? 'All day' : minToClock(ev.start_min)}</span>
              <span className="grow">
                <span className="title">{ev.title}</span>
                {(ev.location || ev.end_min !== null) && <span className="meta">{ev.end_min !== null && ev.start_min !== null && `until ${minToClock(ev.end_min)}`}{ev.location && ` · ${ev.location}`}</span>}
              </span>
              {ev.important && <Star size={14} className="day-star" aria-label="Important" />}
            </button>
          ))}
        </div>
      ) : <p className="day-empty-line">No events. Appointments you add also show on the timeline.</p>}
    </Section>
  )
}

function NotesCard({ date }: { date: DateKey }) {
  const { ws, remove } = useStore()
  const { open } = useEditors()
  const notes = ws.notes.filter(n => n.date === date).sort((a, b) => b.created_at.localeCompare(a.created_at))
  return (
    <Section
      id="day-notes"
      icon={<BookOpen size={15} />}
      title="Notes"
      meta={notes.length || null}
      defaultOpen={false}
      action={<IconButton label="Add note" onClick={() => open({ kind: 'note', defaults: { date } })}><Plus size={16} /></IconButton>}
    >
      {notes.length ? (
        <div className="list">
          {notes.map(n => (
            <div className="list-row day-note" key={n.id}>
              <p className="grow">{n.text}</p>
              <IconButton size="sm" label="Delete note" onClick={() => remove('notes', n.id)}><Trash2 size={14} /></IconButton>
            </div>
          ))}
        </div>
      ) : <p className="day-empty-line">Capture ideas, links or anything worth remembering about this day.</p>}
    </Section>
  )
}

function GoalsCard({ date }: { date: DateKey }) {
  const { ws } = useStore()
  const sessions = sessionsOn(ws, date)
  const seconds = new Map<string, number>()
  for (const s of sessions) if (s.goal_id) seconds.set(s.goal_id, (seconds.get(s.goal_id) || 0) + s.duration_seconds)
  const ids = new Set<string>([...seconds.keys()])
  for (const b of blocksOn(ws, date)) if (b.goal_id) ids.add(b.goal_id)
  for (const t of ws.tasks) if (t.date === date && t.goal_id) ids.add(t.goal_id)
  const goals = [...ids].map(id => goalById(ws, id)).filter(g => g && g.status !== 'archived').sort((a, b) => (seconds.get(b!.id) || 0) - (seconds.get(a!.id) || 0))
  return (
    <Section id="day-goals" icon={<Target size={15} />} title="Goals touched" meta={goals.length || null} defaultOpen={false}>
      {goals.length ? (
        <div className="stack-lg">
          {goals.map(g => (
            <div key={g!.id} className="day-goal">
              <GoalRow goal={g!} />
              {seconds.get(g!.id) ? <span className="chip good day-goal-chip"><Check size={11} /> {formatDuration(seconds.get(g!.id)!)} on this day</span> : <span className="chip day-goal-chip">Planned</span>}
            </div>
          ))}
        </div>
      ) : <p className="day-empty-line">Link a focus block, task or session to a goal to see it here.</p>}
    </Section>
  )
}
