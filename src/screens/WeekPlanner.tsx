import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRightLeft, CalendarClock, CalendarPlus, CheckSquare, ClipboardList, Flag, Inbox, NotebookPen, Plus, Sparkles, Target, TimerReset } from 'lucide-react'
import { fmt, formatDuration, formatMinutes, inRange, minToClock, shiftKey, todayKey, toHours, weekKeys, weekStartKey } from '../lib/dates'
import type { DateKey, Task, TimeBlock } from '../lib/model'
import { routes } from '../lib/routes'
import {
  allStreaks, blocksOn, byDay, categoryColor, change, dayPlan, dayTargetMinutes, eventsOn, goalProgress, habitDoneOn, habitsCompletion,
  habitsForDay, pct, periodSummary, plannedSecondsIn, review, secondsIn, secondsOn, tasksOn, weekTargetMinutes,
} from '../lib/selectors'
import { useStore } from '../lib/store'
import { useEditors } from '../shell/editors'
import { Button, Card, ChartTooltip, Dot, Duration, Empty, Modal, ProgressBar, Segmented, Stat, Tick, useSeriesColor, useToast } from '../ui/kit'
import { PlanVsReality } from '../ui/widgets'
import { DayLink, PlanHeader, PlanPage, ReviewPrompts, StatStrip, StripStat, TargetEditor, type Prompt } from './planner-shared'
import { dragId, dragKind, minutesToHours, startDrag, timeRange, useDateParam, useScrollTo, type DragKind } from './planner-utils'
import './week.css'

const PROMPTS: Prompt[] = [
  { key: 'reflection', label: 'Weekly reflection', placeholder: 'How did this week feel overall? What stood out?' },
  { key: 'went_well', label: 'What went well?', placeholder: 'Wins, habits that stuck, moments you’re proud of…' },
  { key: 'improve', label: 'What could improve?', placeholder: 'What got in the way, and what would you change?' },
  { key: 'next_focus', label: 'Main focus for next week?', placeholder: 'One thing that would make next week a success.' },
]

const BACKLOG = 'backlog'

export default function WeekPlanner() {
  const { ws, update, saveReview } = useStore()
  const { open } = useEditors()
  const toast = useToast()
  const [date, setDate] = useDateParam()
  const [params] = useSearchParams()
  const today = todayKey()
  const start = weekStartKey(date)
  const end = shiftKey(start, 6)
  const keys = weekKeys(date)
  const reviewRef = useScrollTo<HTMLDivElement>(params.get('review') === '1', start)
  const [planning, setPlanning] = useState(false)
  const [over, setOver] = useState<string | null>(null)

  // ---- headline numbers
  const seconds = secondsIn(ws, start, end)
  const targetMin = weekTargetMinutes(ws, start)
  const weekReview = review(ws, 'week', start)
  const planned = plannedSecondsIn(ws, start, end)
  const habits = habitsCompletion(ws, start, end > today ? today : end)
  const weekTasks = ws.tasks.filter(t => t.date && inRange(t.date, start, end))
  const tasksDone = weekTasks.filter(t => t.done).length
  const percent = pct(seconds, targetMin * 60)
  const isCurrent = inRange(today, start, end)
  const pace = isCurrent ? Math.round(((keys.indexOf(today) + 1) / 7) * 100) : undefined
  const focus = weekReview?.answers.focus || review(ws, 'week', shiftKey(start, -7))?.answers.next_focus || ''

  // ---- drag and drop
  const moveTask = (task: Task, to: DateKey | null) => {
    if (task.date === to) return
    const from = task.date
    update('tasks', task.id, { date: to })
    toast(to ? `“${task.title}” moved to ${fmt(to, 'EEEE')}` : `“${task.title}” moved to your backlog`, { action: { label: 'Undo', onClick: () => update('tasks', task.id, { date: from }) } })
  }
  const moveBlock = (block: TimeBlock, to: DateKey) => {
    if (block.date === to) return
    const from = block.date
    update('blocks', block.id, { date: to })
    toast(`${block.title || block.category} moved to ${fmt(to, 'EEEE')} · ${timeRange(block.start_min, block.end_min)}`, { action: { label: 'Undo', onClick: () => update('blocks', block.id, { date: from }) } })
  }
  const accepts = (zone: string, kind: DragKind | null) => kind === 'task' || (kind === 'block' && zone !== BACKLOG)
  const dropZone = (zone: string, to: DateKey | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!accepts(zone, dragKind(e))) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (over !== zone) setOver(zone)
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(o => (o === zone ? null : o))
    },
    onDrop: (e: DragEvent) => {
      const kind = dragKind(e)
      setOver(null)
      if (!kind || !accepts(zone, kind)) return
      e.preventDefault()
      const id = dragId(e, kind)
      if (kind === 'task') { const t = ws.tasks.find(x => x.id === id); if (t) moveTask(t, to) }
      else if (to) { const b = ws.blocks.find(x => x.id === id); if (b) moveBlock(b, to) }
    },
  })
  useEffect(() => {
    const clear = () => setOver(null)
    window.addEventListener('dragend', clear)
    return () => window.removeEventListener('dragend', clear)
  }, [])

  const moveTargets = keys.map(k => ({ key: k, label: fmt(k, 'EEEE') }))

  const reached = percent >= 100
  const paceNote = reached ? 'target reached' : pace !== undefined ? (percent >= pace ? 'on pace' : 'behind pace') : seconds > 0 ? `${formatDuration(Math.max(0, targetMin * 60 - seconds))} short` : ''
  const productiveDays = keys.filter(k => secondsOn(ws, k) > 0).length

  return (
    <PlanPage className="week-page">
      <PlanHeader
        mode="week"
        value={date}
        onChange={setDate}
        title={`${fmt(start, 'MMM d')} – ${fmt(end, 'MMM d, yyyy')}`}
        short={`${fmt(start, 'MMM d')} – ${fmt(end, 'MMM d')}`}
        note={focus ? <>Focus: <b>{focus}</b></> : null}
        actions={
          <>
            <Button variant="ghost" icon={<NotebookPen size={15} />} onClick={() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Review</Button>
            <Button variant="primary" icon={<Sparkles size={15} />} onClick={() => setPlanning(true)}>Plan next week</Button>
          </>
        }
      />

      <StatStrip label="Week overview">
        <StripStat
          className="is-wide"
          label={<>Productive<span className="plan-strip-aside">{percent}%{paceNote && ` · ${paceNote}`}</span></>}
          icon={<TimerReset size={12} />}
          value={<>{formatDuration(seconds)}<TargetEditor compact label="Weekly target" step={1} minutes={targetMin} onSave={m => saveReview('week', start, { target_minutes: m })} />{weekReview?.target_minutes != null && <button type="button" className="week-reset" onClick={() => saveReview('week', start, { target_minutes: null })}>reset</button>}</>}
        >
          <ProgressBar value={percent} size="thin" tone={reached ? 'good' : undefined} marker={pace} label="Weekly productivity progress" />
        </StripStat>
        <StripStat label="Planned" icon={<CalendarClock size={12} />} value={<Duration seconds={planned} />} sub={planned ? `${pct(seconds, planned)}% tracked` : 'No focus blocks'} />
        <StripStat label="Habits" icon={<Flag size={12} />} value={habits.due ? `${habits.percent}%` : '—'} sub={habits.due ? `${habits.done}/${habits.due} check-ins` : 'Nothing due yet'} />
        <StripStat label="Tasks" icon={<CheckSquare size={12} />} value={`${tasksDone}/${weekTasks.length}`} sub={weekTasks.length ? `${pct(tasksDone, weekTasks.length)}% done` : 'None scheduled'} />
        <StripStat label="Active days" icon={<Target size={12} />} value={`${productiveDays}/7`} sub="with tracked time" />
      </StatStrip>

      {/* ---------------- board */}
      <section className="card week-board-card" aria-label="Week board">
        <div className="week-board-head">
          <h2>Board</h2>
          <span className="week-board-hint">Drag tasks and blocks between days, or use <ArrowRightLeft size={11} aria-label="move" /> on an item.</span>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => open({ kind: 'task', defaults: { date: null } })}>Backlog task</Button>
        </div>
        <Backlog zone={dropZone(BACKLOG, null)} isOver={over === BACKLOG} targets={moveTargets} onMove={moveTask} />
        <div className="week-board-scroll">
          <div className="week-board">
            {keys.map(k => (
              <DayColumn key={k} date={k} today={today} isOver={over === k} zone={dropZone(k, k)} targets={moveTargets} onMoveTask={moveTask} onMoveBlock={moveBlock} />
            ))}
          </div>
        </div>
      </section>

      <div className="grid-2">
        <WeeklyGoals start={start} end={end} />
        <Card title="Plan vs reality" sub="Planned focus blocks against tracked time.">
          <PlanVsReality from={start} to={end} compact />
        </Card>
      </div>

      <DailyChart keys={keys} />

      <div ref={reviewRef} className="plan-review-anchor">
        <WeeklyReview start={start} end={end} />
      </div>

      {planning && <PlanNextWeek start={start} onClose={() => setPlanning(false)} />}
    </PlanPage>
  )
}

// ---------------------------------------------------------------------------
// Board pieces

type Zone = { onDragOver: (e: DragEvent) => void; onDragLeave: (e: DragEvent) => void; onDrop: (e: DragEvent) => void }
type Target = { key: DateKey; label: string }

function MoveSelect({ label, current, targets, backlog, onPick }: { label: string; current: DateKey | null; targets: Target[]; backlog?: boolean; onPick: (to: DateKey | null) => void }) {
  return (
    <span className="week-move" title="Move to…">
      <ArrowRightLeft size={12} aria-hidden />
      <select
        aria-label={`Move ${label} to another day`}
        value=""
        onChange={e => { const v = e.target.value; if (v) onPick(v === BACKLOG ? null : v) }}
      >
        <option value="" disabled>Move to…</option>
        {targets.filter(t => t.key !== current).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        {current && <option value={shiftKey(current, 7)}>Same day next week</option>}
        {backlog && current && <option value={BACKLOG}>Backlog (unschedule)</option>}
      </select>
    </span>
  )
}

function TaskChip({ task, targets, onMove }: { task: Task; targets: Target[]; onMove: (t: Task, to: DateKey | null) => void }) {
  const { ws, update } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  return (
    <div className={`week-task ${task.done ? 'is-done' : ''}`} draggable onDragStart={e => startDrag(e, 'task', task.id)}>
      <Tick square checked={task.done} label={`Complete ${task.title}`} onChange={() => update('tasks', task.id, { done: !task.done, done_at: task.done ? null : new Date().toISOString() })} />
      <button type="button" className="week-task-title" onClick={() => open({ kind: 'task', id: task.id })} title={task.title}>
        {task.priority >= 3 && <span className="prio" aria-label="Top priority">!</span>}
        <span>{task.title}</span>
      </button>
      <Dot color={color(categoryColor(ws, task.category))} size={6} />
      <MoveSelect label={task.title} current={task.date} targets={targets} backlog onPick={to => onMove(task, to)} />
    </div>
  )
}

function Backlog({ zone, isOver, targets, onMove }: { zone: Zone; isOver: boolean; targets: Target[]; onMove: (t: Task, to: DateKey | null) => void }) {
  const { ws } = useStore()
  const tasks = ws.tasks.filter(t => !t.date && !t.done).sort((a, b) => b.priority - a.priority || a.sort - b.sort)
  const shown = tasks.slice(0, 12)
  return (
    <div className={`week-backlog ${isOver ? 'is-over' : ''}`} {...zone} aria-label="Unscheduled tasks">
      <span className="week-backlog-label"><Inbox size={13} /> Unscheduled <b className="tabular">{tasks.length}</b></span>
      {shown.length ? (
        <div className="week-backlog-list">
          {shown.map(t => <TaskChip key={t.id} task={t} targets={targets} onMove={onMove} />)}
          {tasks.length > shown.length && <Link to={routes.tasks} className="card-link">View all {tasks.length}</Link>}
        </div>
      ) : (
        <p className="week-backlog-empty">Clear. Drop a task here to unschedule it.</p>
      )}
    </div>
  )
}

function AddMenu({ date }: { date: DateKey }) {
  const { open } = useEditors()
  const [shown, setShown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!shown) return
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setShown(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setShown(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [shown])
  const pick = (kind: 'task' | 'block' | 'event') => {
    setShown(false)
    if (kind === 'task') open({ kind: 'task', defaults: { date } })
    else if (kind === 'block') open({ kind: 'block', defaults: { date } })
    else open({ kind: 'event', defaults: { date } })
  }
  return (
    <div className="week-add" ref={ref}>
      <button type="button" className="icon-btn sm" aria-label={`Add to ${fmt(date, 'EEEE')}`} aria-expanded={shown} aria-haspopup="menu" onClick={() => setShown(s => !s)}><Plus size={15} /></button>
      {shown && (
        <div className="week-add-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => pick('task')}><CheckSquare size={14} /> Task</button>
          <button type="button" role="menuitem" onClick={() => pick('block')}><TimerReset size={14} /> Time block</button>
          <button type="button" role="menuitem" onClick={() => pick('event')}><CalendarPlus size={14} /> Event</button>
        </div>
      )}
    </div>
  )
}

function DayColumn({ date, today, isOver, zone, targets, onMoveTask, onMoveBlock }: {
  date: DateKey
  today: DateKey
  isOver: boolean
  zone: Zone
  targets: Target[]
  onMoveTask: (t: Task, to: DateKey | null) => void
  onMoveBlock: (b: TimeBlock, to: DateKey) => void
}) {
  const { ws, setDayPlan, toggleHabit } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  const seconds = secondsOn(ws, date)
  const targetMin = dayTargetMinutes(ws, date)
  const blocks = blocksOn(ws, date)
  const events = eventsOn(ws, date)
  const tasks = tasksOn(ws, date)
  const habits = habitsForDay(ws, date)
  const habitsDone = habits.filter(h => habitDoneOn(ws, h, date)).length
  const items = tasks.length + habits.length
  const checklist = items ? pct(tasks.filter(t => t.done).length + habitsDone, items) : null
  const progress = pct(seconds, targetMin * 60)
  const isToday = date === today
  const future = date > today
  const empty = !blocks.length && !events.length && !tasks.length

  return (
    <section className={`week-day ${isToday ? 'is-today' : ''} ${isOver ? 'is-over' : ''} ${date < today ? 'is-past' : ''}`} {...zone} aria-label={fmt(date, 'EEEE, MMMM d')}>
      <header className="week-day-head">
        <DayLink date={date} className="week-day-title">
          <span className="week-day-name">{fmt(date, 'EEE')}</span>
          <span className="week-day-num">{fmt(date, 'd')}</span>
          {isToday && <span className="sr-only">(today)</span>}
        </DayLink>
        <span className="grow" />
        <AddMenu date={date} />
      </header>

      <div className="week-day-progress">
        <div className="row-between">
          <span className="tabular week-day-hours"><b>{formatDuration(seconds)}</b></span>
          <TargetEditor compact label={`${fmt(date, 'EEEE')} target`} minutes={targetMin} onSave={m => setDayPlan(date, { target_minutes: m })} />
        </div>
        <ProgressBar value={progress} size="thin" tone={progress >= 100 ? 'good' : undefined} label={`${fmt(date, 'EEEE')} productivity`} />
        <div className="row-between week-day-meta">
          <span>{checklist === null ? 'No checklist' : `Checklist ${checklist}%`}</span>
          {dayPlan(ws, date)?.target_minutes != null && <span title="Custom target for this day">custom</span>}
        </div>
      </div>

      {events.length > 0 && (
        <div className="week-group">
          {events.map(e => (
            <button type="button" key={e.id} className={`week-event ${e.important ? 'important' : ''}`} onClick={() => open({ kind: 'event', id: e.id })}>
              <span className="week-time tabular">{e.start_min === null ? 'All day' : minToClock(e.start_min)}</span>
              <span className="week-item-title">{e.title}</span>
            </button>
          ))}
        </div>
      )}

      {blocks.length > 0 && (
        <div className="week-group">
          {blocks.map(b => (
            <div key={b.id} className={`week-block ${b.kind === 'break' ? 'is-break' : ''}`} draggable onDragStart={e => startDrag(e, 'block', b.id)} style={{ '--cat': color(categoryColor(ws, b.category)) } as CSSProperties}>
              <button type="button" className="week-block-body" onClick={() => open({ kind: 'block', id: b.id })}>
                <span className="week-time tabular">{timeRange(b.start_min, b.end_min)}</span>
                <span className="week-item-title">{b.title || b.category}</span>
              </button>
              <MoveSelect label={b.title || 'time block'} current={b.date} targets={targets} onPick={to => to && onMoveBlock(b, to)} />
            </div>
          ))}
        </div>
      )}

      {tasks.length > 0 && (
        <div className="week-group">
          {tasks.map(t => <TaskChip key={t.id} task={t} targets={targets} onMove={onMoveTask} />)}
        </div>
      )}

      {empty && <p className="week-day-empty">{future || date === today ? 'Open day' : 'Nothing planned'}</p>}

      {habits.length > 0 && (
        <div className="week-habits" aria-label={`Habits: ${habitsDone} of ${habits.length} done`}>
          {habits.map(h => {
            const done = habitDoneOn(ws, h, date)
            return (
              <button
                type="button"
                key={h.id}
                className={`week-habit ${done ? 'is-done' : ''}`}
                style={{ '--hc': color(h.color) } as CSSProperties}
                aria-pressed={done}
                aria-label={`${h.name} — ${done ? 'done' : 'not done'}`}
                title={h.name}
                disabled={future}
                onClick={() => toggleHabit(h.id, date)}
              >
                <span aria-hidden>{h.icon}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Weekly goals

function WeeklyGoals({ start, end }: { start: DateKey; end: DateKey }) {
  const { ws } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  const goals = ws.goals.filter(g => g.status !== 'archived' && (
    (g.status === 'active' && g.weekly_target_hours > 0 && g.start_date <= end && (!g.deadline || g.deadline >= start))
    || (g.horizon === 'weekly' && g.start_date <= end && (!g.deadline || g.deadline >= start))
  ))
  return (
    <Card
      title="Weekly goals"
      sub="Progress this week toward each goal’s weekly target."
      action={<Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => open({ kind: 'goal', defaults: { horizon: 'weekly', start_date: start, deadline: end, target_hours: 0, weekly_target_hours: 0 } })}>Weekly goal</Button>}
    >
      {goals.length ? (
        <div className="list">
          {goals.map(g => {
            const p = goalProgress(ws, g, start)
            const hasWeekly = p.weekTargetSeconds > 0
            const value = hasWeekly ? pct(p.weekSeconds, p.weekTargetSeconds) : p.percent
            return (
              <Link key={g.id} to={routes.goal(g.id)} className="week-goal">
                <div className="row-between">
                  <span className="row" style={{ minWidth: 0 }}>
                    <Dot color={color(g.color)} />
                    <span className="week-goal-title">{g.title}</span>
                    {g.horizon === 'weekly' && <span className="chip">This week</span>}
                    {g.status === 'completed' && <span className="chip good">Done</span>}
                  </span>
                  <b className="tabular">{value}%</b>
                </div>
                <div className="goal-row-bar"><i style={{ width: `${Math.min(100, value)}%`, background: color(g.color) }} /></div>
                <span className="meta">
                  {hasWeekly ? `${formatDuration(p.weekSeconds)} of ${g.weekly_target_hours}h this week` : p.tasksTotal ? `${p.tasksDone}/${p.tasksTotal} tasks` : 'No time target'}
                </span>
              </Link>
            )
          })}
        </div>
      ) : (
        <Empty icon={<Target size={18} />} title="No weekly goals yet" body="Give a goal a weekly target, or set a goal just for this week." />
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Planned vs actual per day

function DailyChart({ keys }: { keys: DateKey[] }) {
  const { ws } = useStore()
  const data = byDay(ws, keys).map(d => ({ key: d.key, label: fmt(d.key, 'EEE'), Planned: d.planned, Actual: d.seconds }))
  const any = data.some(d => d.Planned || d.Actual)
  return (
    <Card title="Day by day" sub="Planned focus against tracked time.">
      {any ? (
        <>
          <div className="legend" aria-hidden style={{ marginBottom: 8 }}>
            <span><i className="pvr-key planned" />Planned</span>
            <span><i className="pvr-key actual" />Actual</span>
          </div>
          <div className="chart-box sm" role="img" aria-label="Planned versus actual hours for each day of the week">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barGap={3} barCategoryGap="28%" margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={v => `${toHours(Number(v))}h`} width={48} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip />} />
                <Bar dataKey="Planned" fill="var(--planned)" radius={[4, 4, 0, 0]} maxBarSize={12} />
                <Bar dataKey="Actual" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <p className="week-chart-empty"><ClipboardList size={15} aria-hidden /> Nothing planned or tracked this week yet.</p>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Weekly review

function WeeklyReview({ start, end }: { start: DateKey; end: DateKey }) {
  const { ws } = useStore()
  const prevStart = shiftKey(start, -7)
  const sum = periodSummary(ws, start, end)
  const prev = periodSummary(ws, prevStart, shiftKey(start, -1))
  const target = weekTargetMinutes(ws, start) * 60
  const streak = useMemo(() => allStreaks(ws).reduce<{ label: string; current: number; unit: string } | null>((best, s) => (!best || s.current > best.current ? s : best), null), [ws])
  const diff = sum.seconds - prev.seconds
  const past = end < todayKey()

  const summary = !sum.seconds && !prev.seconds
    ? 'Once you track some time, this review fills itself in.'
    : !prev.seconds ? `You tracked ${formatDuration(sum.seconds)} this week.`
      : Math.abs(diff) < 600 ? `About the same as last week — steady is good.`
        : diff > 0 ? `${formatDuration(diff)} more than last week. Momentum is building.`
          : `${formatDuration(-diff)} less than last week. Rest weeks count too — what would help next week?`

  return (
    <Card
      title={<span className="row"><NotebookPen size={16} /> Weekly review</span>}
      sub={`${fmt(start, 'MMM d')} – ${fmt(end, 'MMM d')}${past ? '' : ' · in progress'}`}
    >
      <p className="plan-review-lede">{summary}</p>
      <div className="plan-stats">
        <Stat label="Productive time" value={<Duration seconds={sum.seconds} />} trend={change(sum.seconds, prev.seconds)} sub={`${pct(sum.seconds, target)}% of ${formatDuration(target, { short: true })}`} />
        <Stat label="Planned vs actual" value={sum.plan.planned ? `${sum.plan.efficiency}%` : '—'} sub={sum.plan.planned ? `${formatDuration(sum.plan.actual)} of ${formatDuration(sum.plan.planned)} planned` : 'No focus blocks planned'} />
        <Stat label="Habits completed" value={sum.habits.due ? `${sum.habits.done}/${sum.habits.due}` : '—'} sub={sum.habits.due ? `${sum.habits.percent}%${prev.habits.due ? ` · last week ${prev.habits.percent}%` : ''}` : 'No check-ins due'} />
        <Stat label="Goals completed" value={sum.goalsCompleted.length} sub={sum.goalsCompleted[0]?.title || 'None this week'} />
        <Stat label="Best day" value={sum.bestDay ? <DayLink date={sum.bestDay.key}>{fmt(sum.bestDay.key, 'EEEE')}</DayLink> : '—'} sub={sum.bestDay ? formatDuration(sum.bestDay.seconds) : 'No tracked days yet'} />
        <Stat label="Current streak" value={streak && streak.current ? `${streak.current} ${streak.unit}${streak.current === 1 ? '' : 's'}` : '—'} sub={streak && streak.current ? streak.label : 'Start one today'} />
        <Stat label="Productive days" value={`${sum.productiveDays}/7`} trend={change(sum.productiveDays, prev.productiveDays)} sub="vs last week" />
        <Stat label="Tasks done" value={`${sum.tasksDone}/${sum.tasksTotal}`} sub={sum.tasksTotal ? `${pct(sum.tasksDone, sum.tasksTotal)}% complete` : 'No tasks scheduled'} />
      </div>
      <div className="plan-review-divider" />
      <ReviewPrompts key={start} period="week" start={start} prompts={PROMPTS} />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Plan next week

function PlanNextWeek({ start, onClose }: { start: DateKey; onClose: () => void }) {
  const { ws, update, create, saveReview } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const color = useSeriesColor()
  const end = shiftKey(start, 6)
  const next = shiftKey(start, 7)

  const unfinished = ws.tasks.filter(t => t.date && inRange(t.date, start, end) && !t.done).sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : b.priority - a.priority))
  const copied = (b: TimeBlock) => ws.blocks.some(x => x.date === shiftKey(b.date, 7) && x.start_min === b.start_min && x.end_min === b.end_min && x.title === b.title && x.category === b.category)
  const focusBlocks = ws.blocks.filter(b => b.kind === 'focus' && inRange(b.date, start, end)).sort((a, b) => (a.date === b.date ? a.start_min - b.start_min : a.date < b.date ? -1 : 1))

  const [target, setTarget] = useState(() => String(minutesToHours(weekTargetMinutes(ws, review(ws, 'week', next)?.target_minutes != null ? next : start))))
  const [taskIds, setTaskIds] = useState(() => new Set(unfinished.map(t => t.id)))
  const [placement, setPlacement] = useState<'same' | 'monday'>('same')
  const [blockIds, setBlockIds] = useState(() => new Set(focusBlocks.filter(b => !copied(b)).map(b => b.id)))
  const [focus, setFocus] = useState(() => review(ws, 'week', next)?.answers.focus || review(ws, 'week', start)?.answers.next_focus || '')

  const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void) => { const s = new Set(set); if (s.has(id)) s.delete(id); else s.add(id); apply(s) }

  const apply = () => {
    const hours = Number(target)
    const patch: { answers: Record<string, string>; target_minutes?: number } = { answers: { focus: focus.trim() } }
    if (target.trim() !== '' && Number.isFinite(hours) && hours >= 0) patch.target_minutes = Math.round(hours * 60)
    saveReview('week', next, patch)
    if (focus.trim() && !review(ws, 'week', start)?.answers.next_focus) saveReview('week', start, { answers: { next_focus: focus.trim() } })
    const moving = unfinished.filter(t => taskIds.has(t.id))
    for (const t of moving) update('tasks', t.id, { date: placement === 'same' ? shiftKey(t.date!, 7) : next })
    const blocks = focusBlocks.filter(b => blockIds.has(b.id))
    const now = new Date().toISOString()
    for (const b of blocks) {
      create('blocks', {
        title: b.title, date: shiftKey(b.date, 7), start_min: b.start_min, end_min: b.end_min, kind: b.kind, category: b.category,
        goal_id: b.goal_id, task_id: b.task_id && taskIds.has(b.task_id) ? b.task_id : null, reminder: b.reminder, created_at: now,
      })
    }
    const bits = [moving.length && `${moving.length} task${moving.length > 1 ? 's' : ''} carried over`, blocks.length && `${blocks.length} focus block${blocks.length > 1 ? 's' : ''} copied`].filter(Boolean)
    toast(`Next week is set${bits.length ? ` — ${bits.join(', ')}` : ''}.`, { tone: 'celebrate' })
    onClose()
    navigate(routes.week(next))
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Plan next week"
      subtitle={`${fmt(next, 'MMM d')} – ${fmt(shiftKey(next, 6), 'MMM d')}. Bring forward what matters, leave the rest.`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Sparkles size={15} />} onClick={apply}>Plan next week</Button></>}
    >
      <div className="form-row">
        <label className="field">
          <span>Weekly target <span className="hint">(hours · this week was {formatMinutes(weekTargetMinutes(ws, start), { short: true })})</span></span>
          <input className="input" type="number" min={0} step={1} value={target} onChange={e => setTarget(e.target.value)} />
        </label>
      </div>

      <label className="field">
        <span>Main focus for next week</span>
        <textarea className="textarea" rows={2} value={focus} onChange={e => setFocus(e.target.value)} placeholder="e.g. Ship the portfolio case studies" />
      </label>

      <fieldset className="week-plan-set">
        <legend className="row-between">
          <span>Carry over unfinished tasks <span className="muted">· {taskIds.size} of {unfinished.length}</span></span>
          {unfinished.length > 0 && <Segmented label="Where to place them" value={placement} onChange={setPlacement} options={[{ value: 'same', label: 'Same weekday' }, { value: 'monday', label: 'All on Monday' }]} />}
        </legend>
        {unfinished.length ? (
          <div className="week-plan-list">
            {unfinished.map(t => (
              <label key={t.id} className="check week-plan-item">
                <input type="checkbox" checked={taskIds.has(t.id)} onChange={() => toggle(taskIds, t.id, setTaskIds)} />
                <span className="grow week-plan-name">{t.title}</span>
                <span className="muted tabular">{fmt(t.date!, 'EEE')} → {fmt(placement === 'same' ? shiftKey(t.date!, 7) : next, 'EEE d')}</span>
              </label>
            ))}
          </div>
        ) : <p className="muted">Every task this week is done. Nicely closed out.</p>}
      </fieldset>

      <fieldset className="week-plan-set">
        <legend className="row-between">
          <span>Repeat focus blocks <span className="muted">· {blockIds.size} of {focusBlocks.length}</span></span>
          {focusBlocks.length > 0 && (
            <span className="row">
              <button type="button" className="card-link" onClick={() => setBlockIds(new Set(focusBlocks.filter(b => !copied(b)).map(b => b.id)))}>All</button>
              <button type="button" className="card-link" onClick={() => setBlockIds(new Set())}>None</button>
            </span>
          )}
        </legend>
        {focusBlocks.length ? (
          <div className="week-plan-list">
            {focusBlocks.map(b => {
              const done = copied(b)
              return (
                <label key={b.id} className="check week-plan-item">
                  <input type="checkbox" checked={blockIds.has(b.id)} disabled={done} onChange={() => toggle(blockIds, b.id, setBlockIds)} />
                  <Dot color={color(categoryColor(ws, b.category))} />
                  <span className="grow week-plan-name">{b.title || b.category}</span>
                  <span className="muted tabular">{done ? 'Already on next week' : `${fmt(b.date, 'EEE')} ${timeRange(b.start_min, b.end_min)}`}</span>
                </label>
              )
            })}
          </div>
        ) : <p className="muted">No focus blocks this week to repeat.</p>}
      </fieldset>
    </Modal>
  )
}
