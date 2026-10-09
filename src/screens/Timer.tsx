import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, CalendarClock, History, Pause, Play, Plus, Square, Target } from 'lucide-react'
import { fmt, formatClock, formatDuration, minToClock, nowMin, rangeKeys, shiftKey, todayKey, toHours } from '../lib/dates'
import type { DateKey, ProductiveSession, TimeBlock } from '../lib/model'
import { routes } from '../lib/routes'
import {
  activeTimerSeconds, averageSessionSeconds, blockActualSeconds, blockAt, blocksOn, categoryColor, dayTargetMinutes,
  goalById, pct, secondsOn, sessionsOn, sumSeconds,
} from '../lib/selectors'
import { useStore, useTick } from '../lib/store'
import { GoalSelect, useEditors } from '../shell/editors'
import { Button, Card, ChartTooltip, Dot, Field, IconButton, Page, ProgressBar, Stars, Stat, useSeriesColor } from '../ui/kit'
import './timer.css'

export default function TimerScreen() {
  const { ws } = useStore()
  const { open } = useEditors()
  const timer = ws.settings.active_timer
  const now = useTick(true, timer?.resumed_at ? 1000 : 30000)
  const today = todayKey()

  return (
    <Page
      className="timer"
      eyebrow="Focus timer"
      title="Productive hours"
      subtitle="Track focused time as it happens — it flows into your plans, goals and streaks automatically."
      actions={<Button className="timer-log-btn" icon={<Plus size={15} />} onClick={() => open({ kind: 'session', defaults: { date: today } })}><span className="timer-log-full">Log time manually</span><span className="timer-log-short">Log time</span></Button>}
    >
      <div className="timer-layout">
        <div className="timer-main">
          {timer ? <Running now={now} /> : <Idle today={today} />}
        </div>
        <aside className="timer-side">
          <TodaySummary today={today} now={now} />
          <UpcomingBlocks today={today} now={now} />
        </aside>
      </div>

      {ws.sessions.length || timer ? (
        <div className="timer-lists">
          <Card title="Today’s sessions" sub={fmt(today, 'EEEE, MMM d')} action={<IconButton size="sm" bordered label="Log a session for today" onClick={() => open({ kind: 'session', defaults: { date: today } })}><Plus size={15} /></IconButton>}>
            <TodaySessions today={today} now={now} />
          </Card>
          <HistoryCard today={today} />
        </div>
      ) : (
        // A brand-new account gets one short card instead of two empty ones.
        <Card className="timer-no-sessions" title="Sessions">
          <div className="timer-empty">
            <span><History size={15} aria-hidden /> No sessions yet. Tracked and logged time — today and earlier — collects here.</span>
            <Button size="sm" variant="soft" onClick={() => open({ kind: 'session', defaults: { date: today } })}>Log past time</Button>
          </div>
        </Card>
      )}
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Idle: pick what you're working on.

function Idle({ today }: { today: DateKey }) {
  const { ws, startTimer } = useStore()
  const color = useSeriesColor()
  const planned = blockAt(ws, today, nowMin())
  const lastSession = ws.sessions.reduce<ProductiveSession | null>((a, s) => (!a || s.started_at > a.started_at ? s : a), null)
  const [category, setCategory] = useState(() => planned?.category || lastSession?.category || ws.categories[0]?.name || 'Work')
  const [goalId, setGoalId] = useState<string | null>(() => planned?.goal_id ?? null)
  const [partId, setPartId] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [linkPlanned, setLinkPlanned] = useState(true)
  const goal = goalById(ws, goalId)

  const start = (goalSeconds?: number) => startTimer({
    category,
    goal_id: goalId,
    goal_part_id: partId,
    label: label.trim() || (goalSeconds ? 'Just 5 minutes' : undefined),
    // Explicit link (or explicit opt-out) to the block planned right now.
    block_id: planned && linkPlanned ? planned.id : null,
    goal_seconds: goalSeconds ?? null,
  })

  const applyPlanned = (b: TimeBlock) => { setCategory(b.category); setGoalId(b.goal_id); setPartId(null); setLinkPlanned(true) }

  return (
    <Card className="timer-idle">
      <h2 className="display timer-idle-title">What are you working on?</h2>

      {planned && (
        <div className={`timer-planned ${linkPlanned ? 'is-linked' : ''}`}>
          <div className="grow" style={{ minWidth: 0 }}>
            <span className="eyebrow">Planned now</span>
            <b>{planned.title || planned.category}</b>
            <span className="row muted"><Dot color={color(categoryColor(ws, planned.category))} />{planned.category} · {minToClock(planned.start_min)}–{minToClock(planned.end_min)}</span>
          </div>
          <label className="check timer-planned-link">
            <input type="checkbox" checked={linkPlanned} onChange={e => { setLinkPlanned(e.target.checked); if (e.target.checked) applyPlanned(planned) }} />
            Count toward this block
          </label>
        </div>
      )}

      <div className="stack-lg">
        <Field label="Category">
          <div className="row wrap timer-cats" role="group" aria-label="Category">
            {ws.categories.map(c => (
              <button type="button" key={c.id} className="chip chip-choice" aria-pressed={category === c.name} onClick={() => setCategory(c.name)}>
                <Dot color={color(c.color)} />{c.name}
              </button>
            ))}
          </div>
        </Field>
        <div className="form-row">
          <Field label="Goal / project">
            <GoalSelect value={goalId} onChange={v => { setGoalId(v); setPartId(null); const g = goalById(ws, v); if (g) setCategory(g.category) }} />
          </Field>
          {goal && goal.parts.length > 0 && (
            <Field label="Part">
              <select className="select" value={partId || ''} onChange={e => setPartId(e.target.value || null)}>
                <option value="">Whole project</option>
                {goal.parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        <Field label="Label" hint="(optional)">
          <input className="input" value={label} onChange={e => setLabel(e.target.value)} placeholder={planned && linkPlanned ? planned.title || 'e.g. Case study draft' : 'e.g. Case study draft'} onKeyDown={e => { if (e.key === 'Enter') start() }} />
        </Field>
      </div>

      <button type="button" className="timer-start" onClick={() => start()}>
        <span className="timer-start-icon" aria-hidden><Play size={22} fill="currentColor" /></span>
        <span>Start focus</span>
      </button>
      <button type="button" className="timer-tiny" onClick={() => start(300)}>
        <b>Stuck? Just 5 minutes</b>
        <span>Commit to five minutes only. When they’re up, keep going or stop — both count.</span>
      </button>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Running: the clock is the hero.

const RING_R = 92
const RING_C = 2 * Math.PI * RING_R

function Running({ now }: { now: number }) {
  const { ws, pauseTimer, resumeTimer, stopTimer } = useStore()
  const color = useSeriesColor()
  const t = ws.settings.active_timer!
  const seconds = activeTimerSeconds(ws, now)
  const goal = goalById(ws, t.goal_id)
  const part = goal?.parts.find(p => p.id === t.goal_part_id)
  const task = t.task_id ? ws.tasks.find(x => x.id === t.task_id) : undefined
  const block = t.block_id ? ws.blocks.find(b => b.id === t.block_id) : undefined
  const blockPlanned = block ? (block.end_min - block.start_min) * 60 : 0
  const blockTracked = block ? blockActualSeconds(ws, block.id) + seconds : 0
  const today = todayKey()
  const target = dayTargetMinutes(ws, today) * 60
  const dayTotal = secondsOn(ws, today) + seconds
  // The ring follows the planned block if there is one, otherwise the day's target.
  const ringPct = block ? pct(blockTracked, blockPlanned) : pct(dayTotal, target)
  const paused = !t.resumed_at
  const catColor = color(categoryColor(ws, t.category))

  return (
    <Card className={`timer-running ${paused ? 'is-paused' : ''}`}>
      <div className="timer-status">
        <span className="timer-status-dot" aria-hidden />
        {paused ? 'Paused' : 'In focus'} · started {new Date(t.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>

      <div className="timer-dial">
        <svg viewBox="0 0 200 200" aria-hidden>
          <circle className="timer-dial-glow" cx="100" cy="100" r={RING_R} />
          <circle className="timer-dial-track" cx="100" cy="100" r={RING_R} />
          <circle className="timer-dial-value" cx="100" cy="100" r={RING_R} strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - Math.min(100, ringPct) / 100)} style={{ stroke: catColor }} />
        </svg>
        <div className="timer-dial-center">
          <div className="timer-clock tabular" role="timer" aria-label={`Elapsed ${formatDuration(seconds)}`}>{formatClock(seconds)}</div>
          <span className="timer-dial-caption">{block ? `${ringPct}% of planned block` : target ? `${ringPct}% of today’s target` : 'elapsed'}</span>
        </div>
      </div>

      <div className="timer-what">
        <h2>{t.label}</h2>
        <div className="row wrap timer-what-meta">
          <span className="chip"><Dot color={catColor} />{t.category}</span>
          {goal && <Link className="chip" to={routes.goal(goal.id)}><Target size={12} />{goal.title}{part && ` · ${part.name}`}</Link>}
          {task && <span className="chip">{task.title}</span>}
        </div>
      </div>

      <div className="timer-controls">
        {paused
          ? <Button size="lg" variant="soft" icon={<Play size={17} />} onClick={resumeTimer}>Resume</Button>
          : <Button size="lg" variant="soft" icon={<Pause size={17} />} onClick={pauseTimer}>Pause</Button>}
        <Button size="lg" variant="primary" icon={<Square size={15} />} onClick={stopTimer}>Stop &amp; save</Button>
      </div>

      <div className="timer-progress-grid">
        {block && (
          <div className="timer-progress">
            <div className="row-between">
              <span className="row"><CalendarClock size={14} /> {block.title || block.category} <span className="muted">{minToClock(block.start_min)}–{minToClock(block.end_min)}</span></span>
              <span className="tabular muted">{formatDuration(blockTracked)} / {formatDuration(blockPlanned)}</span>
            </div>
            <ProgressBar value={pct(blockTracked, blockPlanned)} tone={blockTracked >= blockPlanned ? 'good' : undefined} label="Planned block progress" />
          </div>
        )}
        <div className="timer-progress">
          <div className="row-between">
            <span>Today</span>
            <span className="tabular muted">{formatDuration(dayTotal)}{target > 0 && ` / ${formatDuration(target, { short: true })}`}</span>
          </div>
          <ProgressBar value={pct(dayTotal, target)} tone={target > 0 && dayTotal >= target ? 'good' : undefined} label="Today’s productive time" />
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Side: summary + 7-day chart, upcoming focus blocks.

function TodaySummary({ today, now }: { today: DateKey; now: number }) {
  const { ws } = useStore()
  const live = activeTimerSeconds(ws, now)
  const sessions = sessionsOn(ws, today)
  const total = sumSeconds(sessions) + live
  const target = dayTargetMinutes(ws, today) * 60
  const data = rangeKeys(shiftKey(today, -6), today).map(key => ({
    key,
    label: key === today ? 'Today' : fmt(key, 'EEE'),
    seconds: secondsOn(ws, key) + (key === today ? live : 0),
  }))
  const week = data.reduce((n, d) => n + d.seconds, 0)
  const ticks = axisTicks(Math.max(...data.map(d => d.seconds)))
  return (
    <Card title="Today" sub={target ? `${pct(total, target)}% of your ${formatDuration(target, { short: true })} target` : undefined} action={<Link className="card-link" to={routes.analytics('today')}>Analytics <ArrowRight size={13} /></Link>}>
      <div className="timer-stats">
        <Stat label="Tracked" value={formatDuration(total)} />
        <Stat label="Sessions" value={sessions.length + (live > 0 ? 1 : 0)} sub={live > 0 ? '1 in progress' : undefined} />
        <Stat label="Average" value={sessions.length ? formatDuration(averageSessionSeconds(sessions)) : '—'} />
      </div>
      <div className="timer-chart-head row-between">
        <span className="eyebrow">Last 7 days</span>
        {week > 0 && <span className="muted tabular">{formatDuration(week)}</span>}
      </div>
      {week > 0 ? (
        <div className="chart-box sm timer-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -6 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} width={40} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} tickFormatter={axisLabel} />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip />} />
              <Bar dataKey="seconds" name="Tracked" fill="var(--accent)" barSize={14} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="timer-empty">Your daily totals will chart here once you track some time.</p>
      )}
    </Card>
  )
}

// Round-number axis ticks: whole hours, or 15-minute steps for short days.
function axisTicks(max: number) {
  const unit = max < 3600 ? 900 : 3600
  const steps = Math.max(1, Math.ceil(max / unit))
  const every = Math.max(1, Math.ceil(steps / 4))
  const ticks: number[] = []
  for (let v = 0; v <= steps * unit; v += every * unit) ticks.push(v)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + every * unit)
  return ticks
}
const axisLabel = (v: number) => (v === 0 ? '0' : v < 3600 ? `${Math.round(v / 60)}m` : `${toHours(v)}h`)

function UpcomingBlocks({ today, now }: { today: DateKey; now: number }) {
  const { ws, startTimer } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  const timer = ws.settings.active_timer
  const d = new Date(now)
  const minute = d.getHours() * 60 + d.getMinutes()
  const blocks = blocksOn(ws, today).filter(b => b.kind === 'focus' && b.end_min > minute)
  return (
    <Card title="Planned focus today" action={<IconButton size="sm" bordered label="Plan a focus block" onClick={() => open({ kind: 'block', defaults: { date: today } })}><Plus size={15} /></IconButton>}>
      {blocks.length ? (
        <div className="list">
          {blocks.map(b => {
            const planned = (b.end_min - b.start_min) * 60
            const tracked = blockActualSeconds(ws, b.id) + (timer?.block_id === b.id ? activeTimerSeconds(ws, now) : 0)
            const isNow = b.start_min <= minute
            return (
              <div className="list-row timer-block" key={b.id}>
                <span className="timer-block-bar" style={{ background: color(categoryColor(ws, b.category)) }} aria-hidden />
                <button className="grow timer-block-body" onClick={() => open({ kind: 'block', id: b.id })}>
                  <span className="title">{b.title || b.category}</span>
                  <span className="meta tabular">{isNow ? 'Now · ' : ''}{minToClock(b.start_min)}–{minToClock(b.end_min)} · {formatDuration(tracked)} / {formatDuration(planned)}</span>
                </button>
                {timer?.block_id === b.id
                  ? <span className="chip accent">Tracking</span>
                  : <IconButton size="sm" bordered label={`Start ${b.title || b.category}`} disabled={Boolean(timer)} onClick={() => startTimer({ block_id: b.id })}><Play size={13} /></IconButton>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="timer-empty">
          <span>No more focus blocks planned today.</span>
          <Link className="card-link" to={routes.day(today)}>Open planner <ArrowRight size={13} /></Link>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Sessions

function SessionRow({ s }: { s: ProductiveSession }) {
  const { ws } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  const goal = goalById(ws, s.goal_id)
  const part = goal?.parts.find(p => p.id === s.goal_part_id)
  const block = s.block_id ? ws.blocks.find(b => b.id === s.block_id) : undefined
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <button className="list-row timer-session" onClick={() => open({ kind: 'session', id: s.id })} aria-label={`Edit session ${formatDuration(s.duration_seconds)} ${s.category}`}>
      <Dot color={color(categoryColor(ws, s.category))} size={10} />
      <span className="grow timer-session-body">
        <span className="title">{goal ? goal.title : s.category}{part && <span className="muted"> · {part.name}</span>}</span>
        <span className="meta">
          {time(s.started_at)}–{time(s.ended_at)} · {s.category}
          {block && ` · planned: ${block.title || block.category}`}
          {s.source === 'manual' && ' · logged manually'}
        </span>
        {s.notes && <span className="timer-session-notes">{s.notes}</span>}
      </span>
      <span className="timer-session-end">
        <b className="tabular">{formatDuration(s.duration_seconds)}</b>
        {s.rating ? <Stars value={s.rating} size={11} /> : null}
      </span>
    </button>
  )
}

const byStart = (a: ProductiveSession, b: ProductiveSession) => b.started_at.localeCompare(a.started_at)

function TodaySessions({ today, now }: { today: DateKey; now: number }) {
  const { ws } = useStore()
  const timer = ws.settings.active_timer
  const sessions = [...sessionsOn(ws, today)].sort(byStart)
  if (!sessions.length && !timer) return <p className="timer-empty">No sessions yet today — start the timer or log time you’ve put in.</p>
  return (
    <div className="list">
      {timer && (
        <div className="list-row timer-session is-live">
          <span className="timer-status-dot" aria-hidden />
          <span className="grow timer-session-body">
            <span className="title">{timer.label}</span>
            <span className="meta">{timer.resumed_at ? 'In progress' : 'Paused'} · {timer.category}</span>
          </span>
          <b className="tabular">{formatClock(activeTimerSeconds(ws, now))}</b>
        </div>
      )}
      {sessions.map(s => <SessionRow key={s.id} s={s} />)}
    </div>
  )
}

function HistoryCard({ today }: { today: DateKey }) {
  const { ws } = useStore()
  const [days, setDays] = useState(7)
  const from = shiftKey(today, -days)
  const groups = rangeKeys(from, shiftKey(today, -1)).reverse()
    .map(key => ({ key, sessions: [...sessionsOn(ws, key)].sort(byStart) }))
    .filter(g => g.sessions.length)
  const older = ws.sessions.some(s => s.date < from)
  return (
    <Card title="History" sub={`Previous ${days} days`}>
      {groups.length ? (
        <div className="timer-history">
          {groups.map(g => (
            <section key={g.key} className="timer-history-day">
              <Link to={routes.day(g.key)} className="timer-history-head row-between">
                <span><b>{g.key === shiftKey(today, -1) ? 'Yesterday' : fmt(g.key, 'EEEE')}</b> <span className="muted">{fmt(g.key, 'MMM d')}</span></span>
                <span className="tabular muted">{formatDuration(sumSeconds(g.sessions))}</span>
              </Link>
              <div className="list">{g.sessions.map(s => <SessionRow key={s.id} s={s} />)}</div>
            </section>
          ))}
        </div>
      ) : (
        <p className="timer-empty">Time tracked on previous days will collect here.</p>
      )}
      {older && <Button variant="ghost" size="sm" block className="timer-more" onClick={() => setDays(d => d + 7)}>Show more</Button>}
    </Card>
  )
}
