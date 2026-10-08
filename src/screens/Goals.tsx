import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Archive, ArchiveRestore, BookOpen, CalendarClock, CalendarPlus, Check, ChevronLeft, Code2, Dumbbell, Flame, ListPlus, Pencil, Play, Plus, Rocket, RotateCcw, Target } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { daysBetween, fmt, formatDuration, minToClock, monthEndKey, rangeKeys, shiftKey, todayKey, toHours, weekStartKey } from '../lib/dates'
import type { Goal, GoalHorizon, GoalStatus, Workspace } from '../lib/model'
import { routes } from '../lib/routes'
import { byCategory, goalProgress, goalSessions, goalStreak, habitCompletionRate, habitStreak, sumSeconds } from '../lib/selectors'
import { useStore } from '../lib/store'
import { useEditors } from '../shell/editors'
import { Button, Card, ChartTooltip, Dot, Empty, Page, Ring, Segmented, Stat, Tick, useSeriesColor } from '../ui/kit'
import { GoalRow } from '../ui/widgets'
import './goals.css'

const HORIZON_LABEL: Record<GoalHorizon, string> = { long_term: 'Long-term', monthly: 'Monthly', weekly: 'Weekly', project: 'Project' }

type HorizonFilter = 'all' | GoalHorizon

// ---------------------------------------------------------------------------
// Local helpers

function deadlineText(goal: Goal, today: string) {
  if (!goal.deadline) return null
  if (goal.status === 'completed') return `Deadline ${fmt(goal.deadline, 'MMM d')}`
  const d = daysBetween(today, goal.deadline)
  if (d > 1) return `${d} days left`
  if (d === 1) return 'Due tomorrow'
  if (d === 0) return 'Due today'
  return `${-d} day${d === -1 ? '' : 's'} overdue`
}

type Pace = { status: 'done' | 'ahead' | 'on_track' | 'behind' | 'overdue'; requiredPerWeek: number; averagePerWeek: number; weeksLeft: number }

/** Required hours per remaining week vs the average of the last four weeks. */
function goalPace(ws: Workspace, goal: Goal, today: string): Pace | null {
  if (!goal.target_hours || !goal.deadline || goal.status !== 'active') return null
  const p = goalProgress(ws, goal, today)
  const remaining = Math.max(0, p.targetSeconds - p.seconds)
  const lookback = Math.max(1, Math.min(28, daysBetween(goal.start_date, today) + 1))
  const recent = sumSeconds(goalSessions(ws, goal).filter(s => s.date > shiftKey(today, -lookback) && s.date <= today))
  const averagePerWeek = (recent / lookback) * 7
  const daysLeft = daysBetween(today, goal.deadline) + 1
  if (remaining <= 0) return { status: 'done', requiredPerWeek: 0, averagePerWeek, weeksLeft: Math.max(0, daysLeft / 7) }
  if (daysLeft <= 0) return { status: 'overdue', requiredPerWeek: remaining, averagePerWeek, weeksLeft: 0 }
  const weeksLeft = daysLeft / 7
  const requiredPerWeek = remaining / Math.max(weeksLeft, 1 / 7)
  const status = averagePerWeek >= requiredPerWeek * 1.15 ? 'ahead' : averagePerWeek >= requiredPerWeek * 0.9 ? 'on_track' : 'behind'
  return { status, requiredPerWeek, averagePerWeek, weeksLeft }
}

const PACE_LABEL: Record<Pace['status'], string> = { done: 'Target reached', ahead: 'Ahead of pace', on_track: 'On track', behind: 'Behind pace', overdue: 'Past deadline' }
const PACE_TONE: Record<Pace['status'], string> = { done: 'good', ahead: 'good', on_track: 'good', behind: 'warn', overdue: 'bad' }

function progressText(p: ReturnType<typeof goalProgress>, goal: Goal) {
  if (p.targetSeconds) return `${formatDuration(p.seconds)} / ${goal.target_hours}h — ${p.percent}%`
  if (p.tasksTotal) return `${p.tasksDone}/${p.tasksTotal} tasks — ${p.percent}%`
  return p.seconds ? `${formatDuration(p.seconds)} tracked` : 'No target set'
}

// ---------------------------------------------------------------------------

export default function Goals() {
  const { id } = useParams()
  return id ? <GoalDetail id={id} /> : <GoalList />
}

// ---------------------------------------------------------------------------
// List

function GoalList() {
  const { ws } = useStore()
  const { open } = useEditors()
  const [horizon, setHorizon] = useState<HorizonFilter>('all')
  const [status, setStatus] = useState<GoalStatus>('active')

  const filtered = ws.goals.filter(g => g.status === status && (horizon === 'all' || g.horizon === horizon))
  const ids = new Set(filtered.map(g => g.id))
  const roots = filtered.filter(g => !g.parent_id || !ids.has(g.parent_id))
  const childrenOf = (id: string) => filtered.filter(g => g.parent_id === id)
  const count = (s: GoalStatus) => ws.goals.filter(g => g.status === s && (horizon === 'all' || g.horizon === horizon)).length
  const newGoal = () => open({ kind: 'goal', defaults: horizon !== 'all' ? { horizon } : undefined })

  return (
    <Page
      eyebrow="Goals & projects"
      title="What you’re building toward"
      subtitle="Progress comes straight from the time you track and the tasks you finish."
      actions={<Button variant="primary" icon={<Plus size={15} />} onClick={newGoal}>New goal</Button>}
    >
      {ws.goals.length === 0 ? <GoalTemplates /> : (
        <>
          <div className="goals-filters">
            <Segmented
              label="Horizon"
              value={horizon}
              onChange={setHorizon}
              options={[{ value: 'all', label: 'All' }, { value: 'long_term', label: 'Long-term' }, { value: 'monthly', label: 'Monthly' }, { value: 'weekly', label: 'Weekly' }, { value: 'project', label: 'Projects' }]}
            />
            <Segmented
              label="Status"
              value={status}
              onChange={setStatus}
              options={(['active', 'completed', 'archived'] as const).map(s => ({ value: s, label: <>{s[0].toUpperCase() + s.slice(1)} <span className="goals-count">{count(s)}</span></> }))}
            />
          </div>

          {roots.length ? (
            <div className="goals-grid">
              {roots.map(g => <GoalCard key={g.id} goal={g} subgoals={childrenOf(g.id)} />)}
            </div>
          ) : (
            <Card>
              <Empty
                icon={<Target size={18} />}
                title={status === 'active' ? 'No active goals in this view' : `No ${status} goals`}
                body={status === 'active' ? 'Try another horizon, or add a goal here.' : undefined}
                action={status === 'active' ? <Button size="sm" variant="soft" onClick={newGoal}>New goal</Button> : undefined}
              />
            </Card>
          )}
        </>
      )}
    </Page>
  )
}

// ---------------------------------------------------------------------------
// First goal: one-click templates that open the editor prefilled.

type GoalTemplate = { icon: ReactNode; title: string; meta: string; defaults: Partial<Goal> }

function goalTemplates(today: string): GoalTemplate[] {
  const monthEnd = monthEndKey(today)
  return [
    {
      icon: <Code2 size={18} />, title: '30 hours of coding', meta: 'Monthly · 30h · Coding',
      defaults: { title: '30 hours of coding', category: 'Coding', horizon: 'monthly', target_hours: 30, weekly_target_hours: 7.5, deadline: monthEnd },
    },
    {
      icon: <BookOpen size={18} />, title: 'Read 2 books', meta: 'Monthly · task-based · Personal',
      defaults: { title: 'Read 2 books', category: 'Personal', horizon: 'monthly', target_hours: 0, weekly_target_hours: 0, deadline: monthEnd, description: 'Add a task per book and tick them off as you finish.' },
    },
    {
      icon: <Dumbbell size={18} />, title: 'Exercise 15 hours', meta: 'Monthly · 15h · Exercise',
      defaults: { title: 'Exercise 15 hours', category: 'Exercise', horizon: 'monthly', target_hours: 15, weekly_target_hours: 3.5, deadline: monthEnd },
    },
    {
      icon: <Rocket size={18} />, title: 'Ship a side project', meta: 'Project · 40h · Coding',
      defaults: { title: 'Ship a side project', category: 'Coding', horizon: 'project', target_hours: 40, weekly_target_hours: 5, deadline: shiftKey(today, 56) },
    },
  ]
}

function GoalTemplates() {
  const { open } = useEditors()
  const templates = goalTemplates(todayKey())
  return (
    <section className="card goals-start" aria-labelledby="goals-start-title">
      <div className="goals-start-head">
        <span className="goals-start-icon" aria-hidden><Target size={18} /></span>
        <div>
          <h2 id="goals-start-title">Set your first goal</h2>
          <p>Pick a starting point — you can change every detail before saving. Tracked time and finished tasks then move it forward.</p>
        </div>
      </div>
      <div className="goals-templates">
        {templates.map(t => (
          <button type="button" key={t.title} className="goals-template" onClick={() => open({ kind: 'goal', defaults: t.defaults })}>
            <span className="goals-template-icon" aria-hidden>{t.icon}</span>
            <span className="goals-template-text">
              <b>{t.title}</b>
              <small>{t.meta}</small>
            </span>
          </button>
        ))}
        <button type="button" className="goals-template blank" onClick={() => open({ kind: 'goal' })}>
          <span className="goals-template-icon" aria-hidden><Plus size={18} /></span>
          <span className="goals-template-text">
            <b>Blank goal</b>
            <small>Start from scratch</small>
          </span>
        </button>
      </div>
    </section>
  )
}

function GoalCard({ goal, subgoals }: { goal: Goal; subgoals: Goal[] }) {
  const { ws } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  const today = todayKey()
  const p = goalProgress(ws, goal, today)
  const streak = goalStreak(ws, goal, today)
  const deadline = deadlineText(goal, today)
  const pace = goalPace(ws, goal, today)
  const parent = goal.parent_id ? ws.goals.find(g => g.id === goal.parent_id) : undefined
  const c = color(goal.color)

  return (
    <article className="card goals-card" style={{ '--goal': c } as React.CSSProperties}>
      <div className="goals-card-head">
        <div className="goals-card-titles">
          <Link to={routes.goal(goal.id)} className="goals-card-title">{goal.title}</Link>
          <div className="goals-meta">
            <span>{HORIZON_LABEL[goal.horizon]}</span>
            <span aria-hidden>·</span>
            <span>{goal.category}</span>
            {parent && <><span aria-hidden>·</span><Link to={routes.goal(parent.id)} className="goals-parent-link">Part of {parent.title}</Link></>}
          </div>
        </div>
        {goal.status === 'active' && (
          <Button size="sm" variant="soft" icon={<Play size={13} />} onClick={() => open({ kind: 'timer', defaults: { goal_id: goal.id, category: goal.category, label: goal.title } })} aria-label={`Start timer for ${goal.title}`}>Start</Button>
        )}
      </div>

      <div className="goals-progress">
        <div className="row-between">
          <span className="tabular goals-progress-text">{progressText(p, goal)}</span>
          {pace && <span className={`chip ${PACE_TONE[pace.status]}`}>{PACE_LABEL[pace.status]}</span>}
        </div>
        <div className="goals-bar" role="progressbar" aria-label={`${goal.title} progress`} aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${p.percent}%` }} /></div>
      </div>

      {p.weekTargetSeconds > 0 && goal.status === 'active' && (
        <div className="goals-week">
          <div className="row-between">
            <span className="muted">This week</span>
            <span className="tabular">{formatDuration(p.weekSeconds)} / {goal.weekly_target_hours}h</span>
          </div>
          <div className="goals-bar thin" aria-hidden><i style={{ width: `${Math.min(100, (p.weekSeconds / p.weekTargetSeconds) * 100)}%` }} /></div>
        </div>
      )}

      <div className="goals-card-foot">
        {deadline && <span className={`row goals-foot-item ${goal.deadline && goal.deadline < today && goal.status === 'active' ? 'is-late' : ''}`}><CalendarClock size={13} />{deadline}</span>}
        {streak.current > 0 && <span className="row goals-foot-item goals-streak" title={`Best: ${streak.longest} days`}><Flame size={13} />{streak.current}-day streak</span>}
        {p.tasksTotal > 0 && p.targetSeconds > 0 && <span className="row goals-foot-item"><Check size={13} />{p.tasksDone}/{p.tasksTotal} tasks</span>}
      </div>

      {subgoals.length > 0 && (
        <div className="goals-children">
          <div className="eyebrow">Feeds into this goal</div>
          {subgoals.map(ch => <GoalChild key={ch.id} goal={ch} />)}
        </div>
      )}
    </article>
  )
}

function GoalChild({ goal }: { goal: Goal }) {
  const { ws } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  const p = goalProgress(ws, goal)
  return (
    <div className="goals-child" style={{ '--goal': color(goal.color) } as React.CSSProperties}>
      <Link to={routes.goal(goal.id)} className="goals-child-body">
        <span className="row-between">
          <span className="goals-child-title">{goal.title}</span>
          <b className="tabular">{p.percent}%</b>
        </span>
        <span className="goals-bar thin" aria-hidden><i style={{ width: `${p.percent}%` }} /></span>
        <span className="muted goals-child-meta">{HORIZON_LABEL[goal.horizon]} · {progressText(p, goal)}</span>
      </Link>
      {goal.status === 'active' && (
        <button className="icon-btn sm" aria-label={`Start timer for ${goal.title}`} title="Start timer" onClick={() => open({ kind: 'timer', defaults: { goal_id: goal.id, category: goal.category, label: goal.title } })}><Play size={13} /></button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail

function GoalDetail({ id }: { id: string }) {
  const { ws, update } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  const today = todayKey()
  const goal = ws.goals.find(g => g.id === id)

  if (!goal) {
    return (
      <Page title="Goal not found">
        <Card><Empty icon={<Target size={18} />} title="This goal no longer exists" body="It may have been deleted on another device." action={<Link className="btn soft sm" to={routes.goals}>Back to goals</Link>} /></Card>
      </Page>
    )
  }

  const c = color(goal.color)
  const p = goalProgress(ws, goal, today)
  const streak = goalStreak(ws, goal, today)
  const pace = goalPace(ws, goal, today)
  const deadline = deadlineText(goal, today)
  const parent = goal.parent_id ? ws.goals.find(g => g.id === goal.parent_id) : undefined
  const children = ws.goals.filter(g => g.parent_id === goal.id)
  const active = goal.status === 'active'

  const startTimer = () => open({ kind: 'timer', defaults: { goal_id: goal.id, category: goal.category, label: goal.title } })

  return (
    <Page
      className="goals-detail"
      eyebrow={<Link to={routes.goals} className="goals-back"><ChevronLeft size={13} />Goals</Link>}
      title={goal.title}
      subtitle={goal.description || undefined}
      actions={<>
        {active && <Button variant="primary" icon={<Play size={15} />} onClick={startTimer}>Start timer</Button>}
        {active && <Button icon={<CalendarPlus size={15} />} onClick={() => open({ kind: 'block', defaults: { goal_id: goal.id, category: goal.category, title: goal.title } })}>Plan time</Button>}
        <Button icon={<Pencil size={15} />} onClick={() => open({ kind: 'goal', id: goal.id })}>Edit</Button>
      </>}
    >
      <section className="card goals-hero" style={{ '--goal': c } as React.CSSProperties}>
        <Ring value={p.percent} size={132} stroke={11} color={c}>
          <div>
            <div className="goals-ring-value tabular">{p.percent}%</div>
            <div className="muted goals-ring-sub">{p.targetSeconds ? `of ${goal.target_hours}h` : p.tasksTotal ? 'of tasks' : 'complete'}</div>
          </div>
        </Ring>
        <div className="goals-hero-body">
          <div className="row wrap">
            <span className="chip"><Dot color={c} />{HORIZON_LABEL[goal.horizon]}</span>
            <span className="chip">{goal.category}</span>
            {goal.status !== 'active' && <span className={`chip ${goal.status === 'completed' ? 'good' : ''}`}>{goal.status === 'completed' ? `Completed${goal.completed_at ? ` ${fmt(goal.completed_at.slice(0, 10), 'MMM d')}` : ''}` : 'Archived'}</span>}
            {parent && <Link to={routes.goal(parent.id)} className="chip goals-chip-link">Part of {parent.title}</Link>}
          </div>
          <div className="goals-hero-stats">
            <Stat label="Tracked" value={formatDuration(p.seconds)} sub={p.targetSeconds ? `target ${goal.target_hours}h · ${formatDuration(Math.max(0, p.targetSeconds - p.seconds))} to go` : 'no hour target'} />
            <Stat label="This week" value={formatDuration(p.weekSeconds)} sub={p.weekTargetSeconds ? `of ${goal.weekly_target_hours}h weekly target` : 'no weekly target'} />
            <Stat label="Deadline" value={goal.deadline ? fmt(goal.deadline, 'MMM d') : '—'} sub={deadline || 'open-ended'} />
            <Stat label="Goal streak" icon={<Flame size={13} />} value={<>{streak.current} <small className="goals-unit">day{streak.current === 1 ? '' : 's'}</small></>} sub={`best ${streak.longest}`} />
          </div>
          {pace && (
            <div className={`goals-pace ${PACE_TONE[pace.status]}`}>
              <b>{PACE_LABEL[pace.status]}</b>
              <span>
                {pace.status === 'overdue'
                  ? `${formatDuration(pace.requiredPerWeek)} still to go after the deadline.`
                  : pace.status === 'done'
                    ? 'You’ve hit the hour target — mark it complete when it’s truly done.'
                    : `Needs ${formatDuration(pace.requiredPerWeek)} / week for the remaining ${pace.weeksLeft < 1 ? `${Math.round(pace.weeksLeft * 7)} days` : `${pace.weeksLeft.toFixed(1)} weeks`}; you’re averaging ${formatDuration(pace.averagePerWeek)} / week.`}
              </span>
            </div>
          )}
          <div className="row wrap">
            <Button size="sm" icon={<ListPlus size={14} />} onClick={() => open({ kind: 'task', defaults: { goal_id: goal.id, category: goal.category } })}>Add task</Button>
            {goal.status === 'completed'
              ? <Button size="sm" icon={<RotateCcw size={14} />} onClick={() => update('goals', goal.id, { status: 'active', completed_at: null })}>Reopen</Button>
              : <Button size="sm" variant="soft" icon={<Check size={14} />} onClick={() => update('goals', goal.id, { status: 'completed', completed_at: new Date().toISOString() })}>Mark complete</Button>}
            {goal.status === 'archived'
              ? <Button size="sm" variant="ghost" icon={<ArchiveRestore size={14} />} onClick={() => update('goals', goal.id, { status: 'active' })}>Unarchive</Button>
              : <Button size="sm" variant="ghost" icon={<Archive size={14} />} onClick={() => update('goals', goal.id, { status: 'archived' })}>Archive</Button>}
          </div>
        </div>
      </section>

      <div className="goals-detail-grid">
        <Card title="Hours over time" sub={goal.target_hours && goal.deadline ? 'Cumulative tracked time vs. the pace needed to hit the target' : 'Tracked time per week, last 12 weeks'} className="goals-span-2">
          <GoalChart goal={goal} />
        </Card>
        <GoalBreakdown goal={goal} />
        <GoalTasks goal={goal} />
        <GoalHabits goal={goal} />
        {children.length > 0 && (
          <Card title="Child goals" sub="Their tracked time rolls up into this goal">
            <div className="list">{children.map(ch => <GoalRow key={ch.id} goal={ch} />)}</div>
          </Card>
        )}
        <GoalBlocks goal={goal} />
        <GoalSessionsCard goal={goal} />
      </div>
    </Page>
  )
}

function GoalChart({ goal }: { goal: Goal }) {
  const { ws } = useStore()
  const color = useSeriesColor()
  const today = todayKey()
  const c = color(goal.color)
  const sessions = goalSessions(ws, goal)

  const cumulative = Boolean(goal.target_hours && goal.deadline)
  const data: Array<{ key: string; actual?: number | null; ideal?: number; seconds?: number }> = (() => {
    const perDay = new Map<string, number>()
    for (const s of sessions) perDay.set(s.date, (perDay.get(s.date) || 0) + s.duration_seconds)
    if (cumulative && goal.deadline) {
      const first = sessions.reduce((min, s) => (s.date < min ? s.date : min), goal.start_date)
      const end = goal.deadline > today ? goal.deadline : today
      const idealFrom = goal.start_date
      const idealDays = Math.max(1, daysBetween(idealFrom, goal.deadline))
      const target = goal.target_hours * 3600
      let sum = 0
      return rangeKeys(first, end).map(key => {
        sum += perDay.get(key) || 0
        const t = daysBetween(idealFrom, key)
        const ideal = t < 0 ? 0 : Math.min(target, (t / idealDays) * target)
        return { key, actual: key <= today ? sum : null, ideal }
      })
    }
    const thisWeek = weekStartKey(today)
    return Array.from({ length: 12 }, (_, i) => {
      const start = shiftKey(thisWeek, (i - 11) * 7)
      const keys = rangeKeys(start, shiftKey(start, 6))
      return { key: start, seconds: keys.reduce((n, k) => n + (perDay.get(k) || 0), 0) }
    })
  })()

  const hoursTick = (v: number) => `${toHours(v)}h`

  if (!sessions.length && !cumulative) return <Empty icon={<Play size={18} />} title="No time tracked yet" body="Start a timer for this goal and your hours will chart here." />

  if (cumulative) {
    return (
      <>
        <div className="legend goals-legend" aria-hidden>
          <span><i className="goals-key" style={{ background: c }} />Tracked</span>
          <span><i className="goals-key dashed" />Ideal pace</span>
        </div>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="key" tickFormatter={k => fmt(String(k), 'MMM d')} tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis tickFormatter={hoursTick} tickLine={false} axisLine={false} width={44} />
              <Tooltip content={<ChartTooltip labelFormat={l => fmt(String(l), 'EEE, MMM d')} />} />
              <ReferenceLine x={today} stroke="var(--line-strong)" strokeDasharray="2 3" />
              <Line type="linear" dataKey="ideal" name="Ideal pace" stroke="var(--planned)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="actual" name="Tracked" stroke={c} strokeWidth={2.5} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>
    )
  }

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="key" tickFormatter={k => fmt(String(k), 'MMM d')} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tickFormatter={hoursTick} tickLine={false} axisLine={false} width={44} />
          <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip labelFormat={l => `Week of ${fmt(String(l), 'MMM d')}`} />} />
          {goal.weekly_target_hours > 0 && <ReferenceLine y={goal.weekly_target_hours * 3600} stroke="var(--ink-3)" strokeDasharray="4 4" label={{ value: 'weekly target', position: 'insideTopRight', fill: 'var(--ink-3)', fontSize: 11 }} />}
          <Bar dataKey="seconds" name="Tracked" fill={c} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function GoalBreakdown({ goal }: { goal: Goal }) {
  const { ws } = useStore()
  const color = useSeriesColor()
  const p = goalProgress(ws, goal)
  const c = color(goal.color)

  if (p.parts.length) {
    const assigned = p.parts.reduce((n, x) => n + x.seconds, 0)
    const unassigned = Math.max(0, p.seconds - assigned)
    return (
      <Card title="Breakdown" sub="Progress on each part of the goal">
        <div className="goals-parts">
          {p.parts.map(part => {
            const percent = part.targetSeconds ? Math.min(100, Math.round((part.seconds / part.targetSeconds) * 100)) : 0
            return (
              <div className="goals-part" key={part.id} style={{ '--goal': c } as React.CSSProperties}>
                <div className="row-between">
                  <span className="goals-part-name">{part.name}</span>
                  <span className="tabular muted">{formatDuration(part.seconds)} / {toHours(part.targetSeconds)}h</span>
                </div>
                <div className="goals-bar" role="progressbar" aria-label={`${part.name} progress`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${percent}%` }} /></div>
              </div>
            )
          })}
          {unassigned > 0 && <p className="muted goals-note">{formatDuration(unassigned)} tracked without a specific part.</p>}
        </div>
      </Card>
    )
  }

  const slices = byCategory(ws, goalSessions(ws, goal))
  const max = Math.max(1, ...slices.map(s => s.seconds))
  return (
    <Card title="Breakdown" sub="Tracked time by category — add parts to the goal for a finer split">
      {slices.length ? (
        <div className="goals-parts">
          {slices.map(s => (
            <div className="goals-part" key={s.name} style={{ '--goal': color(s.color) } as React.CSSProperties}>
              <div className="row-between">
                <span className="row goals-part-name"><Dot color={color(s.color)} />{s.name}</span>
                <span className="tabular muted">{formatDuration(s.seconds)}</span>
              </div>
              <div className="goals-bar" aria-hidden><i style={{ width: `${(s.seconds / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      ) : <Empty title="Nothing tracked yet" body="Sessions linked to this goal will be split out here." />}
    </Card>
  )
}

function GoalTasks({ goal }: { goal: Goal }) {
  const { ws, update } = useStore()
  const { open } = useEditors()
  const tasks = ws.tasks.filter(t => t.goal_id === goal.id).sort((a, b) => Number(a.done) - Number(b.done) || (a.date || '9999').localeCompare(b.date || '9999') || b.priority - a.priority)
  const done = tasks.filter(t => t.done).length
  return (
    <Card title="Tasks" sub={tasks.length ? `${done} of ${tasks.length} done` : undefined} action={<Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => open({ kind: 'task', defaults: { goal_id: goal.id, category: goal.category } })}>Add</Button>}>
      {tasks.length ? (
        <div className="list">
          {tasks.map(t => (
            <div className={`list-row ${t.done ? 'is-done' : ''}`} key={t.id}>
              <Tick square checked={t.done} label={`Complete ${t.title}`} onChange={() => update('tasks', t.id, { done: !t.done, done_at: t.done ? null : new Date().toISOString() })} />
              <button className="goals-row-btn grow" onClick={() => open({ kind: 'task', id: t.id })}>
                <span className="title">{t.title}</span>
                <span className="meta">{t.date ? fmt(t.date, 'EEE, MMM d') : 'Backlog'}{t.estimate_minutes > 0 && ` · ${formatDuration(t.estimate_minutes * 60)}`}</span>
              </button>
            </div>
          ))}
        </div>
      ) : <Empty title="No tasks linked" body="Break the goal into concrete steps." />}
    </Card>
  )
}

function GoalHabits({ goal }: { goal: Goal }) {
  const { ws } = useStore()
  const { open } = useEditors()
  const habits = goalProgress(ws, goal).habits
  const today = todayKey()
  return (
    <Card title="Habits" sub="Routines that support this goal" action={<Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => open({ kind: 'habit', defaults: { goal_id: goal.id, category: goal.category } })}>Add</Button>}>
      {habits.length ? (
        <div className="list">
          {habits.map(h => {
            const s = habitStreak(ws, h, today)
            const rate = habitCompletionRate(ws, h, shiftKey(today, -29), today)
            const unit = h.frequency.type === 'weekly' ? 'wk' : 'd'
            return (
              <Link to={routes.habit(h.id)} className="list-row goals-link-row" key={h.id}>
                <span className="goals-habit-icon" aria-hidden>{h.icon}</span>
                <span className="grow goals-row-text">
                  <span className="title">{h.name}</span>
                  <span className="meta">{rate}% over 30 days · best {s.longest}{unit}</span>
                </span>
                <span className={`goals-streak-count ${s.current ? '' : 'zero'}`}><Flame size={13} />{s.current}{unit}</span>
              </Link>
            )
          })}
        </div>
      ) : <Empty title="No linked habits" body="Link a habit to this goal from the habit editor." />}
    </Card>
  )
}

function GoalBlocks({ goal }: { goal: Goal }) {
  const { ws } = useStore()
  const { open } = useEditors()
  const today = todayKey()
  const blocks = ws.blocks.filter(b => b.goal_id === goal.id && b.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.start_min - b.start_min).slice(0, 6)
  const planned = blocks.reduce((n, b) => n + (b.end_min - b.start_min) * 60, 0)
  return (
    <Card title="Planned time" sub={blocks.length ? `${formatDuration(planned)} scheduled ahead` : undefined} action={goal.status === 'active' ? <Button size="sm" variant="ghost" icon={<CalendarPlus size={14} />} onClick={() => open({ kind: 'block', defaults: { goal_id: goal.id, category: goal.category, title: goal.title } })}>Plan</Button> : undefined}>
      {blocks.length ? (
        <div className="list">
          {blocks.map(b => (
            <button className="list-row goals-row-btn-row" key={b.id} onClick={() => open({ kind: 'block', id: b.id })}>
              <span className="goals-date-badge"><b>{fmt(b.date, 'd')}</b><small>{fmt(b.date, 'MMM')}</small></span>
              <span className="grow goals-row-text">
                <span className="title">{b.title || goal.title}</span>
                <span className="meta tabular">{b.date === today ? 'Today' : fmt(b.date, 'EEEE')} · {minToClock(b.start_min)}–{minToClock(b.end_min)}</span>
              </span>
              <span className="tabular muted">{formatDuration((b.end_min - b.start_min) * 60)}</span>
            </button>
          ))}
        </div>
      ) : <Empty icon={<CalendarPlus size={18} />} title="Nothing planned" body="Block out focus time so the goal gets a place in your week." />}
    </Card>
  )
}

function GoalSessionsCard({ goal }: { goal: Goal }) {
  const { ws } = useStore()
  const { open } = useEditors()
  const sessions = goalSessions(ws, goal).sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 8)
  const partName = (id: string | null) => (id ? goal.parts.find(p => p.id === id)?.name : undefined)
  return (
    <Card title="Recent sessions">
      {sessions.length ? (
        <div className="list">
          {sessions.map(s => {
            const part = partName(s.goal_part_id)
            const child = s.goal_id !== goal.id ? ws.goals.find(g => g.id === s.goal_id)?.title : undefined
            const started = new Date(s.started_at)
            return (
              <button className="list-row goals-row-btn-row" key={s.id} onClick={() => open({ kind: 'session', id: s.id })}>
                <span className="grow goals-row-text">
                  <span className="title">{part || child || s.category}{s.notes ? ` — ${s.notes}` : ''}</span>
                  <span className="meta tabular">{fmt(s.date, 'EEE, MMM d')} · {minToClock(started.getHours() * 60 + started.getMinutes())}{s.rating ? ` · ${'★'.repeat(s.rating)}` : ''}</span>
                </span>
                <b className="tabular">{formatDuration(s.duration_seconds)}</b>
              </button>
            )
          })}
        </div>
      ) : <Empty icon={<Play size={18} />} title="No sessions yet" body="Tracked time for this goal shows up here." />}
    </Card>
  )
}
