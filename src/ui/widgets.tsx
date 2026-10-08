import { Link, useNavigate } from 'react-router-dom'
import { Flame, Minus, Plus, Target } from 'lucide-react'
import { formatDuration, todayKey } from '../lib/dates'
import type { DateKey, Goal } from '../lib/model'
import { routes } from '../lib/routes'
import { allStreaks, categoryColor, goalProgress, habitAmount, habitDoneOn, habitStreak, habitsForDay, habitWeekCount, nextMilestone, planVsActual, tasksOn, type StreakItem } from '../lib/selectors'
import { useStore } from '../lib/store'
import { useEditors } from '../shell/editors'
import { Button, Dot, Empty, ProgressBar, Tick, useSeriesColor } from './kit'
import './widgets.css'

// ---------------------------------------------------------------------------
// Habits for a day — check off, or step an amount for measurable habits.

export function HabitChecklist({ date, limit, showStreak = true }: { date: DateKey; limit?: number; showStreak?: boolean }) {
  const { ws, toggleHabit, setHabitAmount } = useStore()
  const { open } = useEditors()
  const habits = habitsForDay(ws, date)
  if (!habits.length) return <Empty icon={<Flame size={18} />} title="No habits for this day" body="Habits you create appear automatically in every planner." action={<Button size="sm" variant="soft" onClick={() => open({ kind: 'habit' })}>New habit</Button>} />
  const shown = limit ? habits.slice(0, limit) : habits
  return (
    <div className="list">
      {shown.map(h => {
        const amount = habitAmount(ws, h.id, date)
        const done = habitDoneOn(ws, h, date)
        const measurable = h.target_amount > 1
        const streak = showStreak ? habitStreak(ws, h, todayKey()).current : 0
        return (
          <div className={`list-row habit-line ${done ? 'is-done' : ''}`} key={h.id}>
            <Tick checked={done} progress={measurable ? amount / h.target_amount : undefined} label={`${h.name} ${done ? 'done' : 'not done'}`} onChange={() => toggleHabit(h.id, date)} />
            <span className="habit-line-icon" aria-hidden>{h.icon}</span>
            <Link to={routes.habit(h.id)} className="grow habit-line-name">
              <span className="title">{h.name}</span>
              <span className="meta">
                {measurable ? `${amount}/${h.target_amount} ${h.unit}` : h.frequency.type === 'weekly' ? `${habitWeekCount(ws, h, date)}/${h.frequency.times} this week` : h.reminder_time ? `⏰ ${h.reminder_time}` : ''}
              </span>
            </Link>
            {measurable && !done && (
              <span className="row" style={{ gap: 2 }}>
                <button className="icon-btn sm" aria-label={`Less ${h.name}`} onClick={() => setHabitAmount(h.id, date, amount - 1)} disabled={amount <= 0}><Minus size={13} /></button>
                <button className="icon-btn sm" aria-label={`More ${h.name}`} onClick={() => setHabitAmount(h.id, date, amount + 1)}><Plus size={13} /></button>
              </span>
            )}
            {showStreak && streak > 0 && <span className="streak-pill" title={`${streak} ${h.frequency.type === 'weekly' ? 'week' : 'day'} streak`}><Flame size={12} />{streak}</span>}
          </div>
        )
      })}
      {limit && habits.length > limit && <Link className="card-link" to={routes.day(date)} style={{ paddingTop: 10 }}>+{habits.length - limit} more</Link>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tasks for a day

export function TaskChecklist({ date, limit, emptyHint = true }: { date: DateKey; limit?: number; emptyHint?: boolean }) {
  const { ws, update } = useStore()
  const { open } = useEditors()
  const tasks = tasksOn(ws, date)
  if (!tasks.length) return emptyHint ? <Empty title="No tasks planned" body="Add a task or pull one from your backlog." action={<Button size="sm" variant="soft" onClick={() => open({ kind: 'task', defaults: { date } })}>Add task</Button>} /> : null
  const shown = limit ? tasks.slice(0, limit) : tasks
  return (
    <div className="list">
      {shown.map(t => {
        const goal = ws.goals.find(g => g.id === t.goal_id)
        return (
          <div className={`list-row task-line ${t.done ? 'is-done' : ''}`} key={t.id}>
            <Tick square checked={t.done} label={`Complete ${t.title}`} onChange={() => update('tasks', t.id, { done: !t.done, done_at: t.done ? null : new Date().toISOString() })} />
            <button className="task-line-body grow" onClick={() => open({ kind: 'task', id: t.id })}>
              <span className="title">{t.priority >= 3 && <span className="prio" aria-label="Top priority">!</span>}{t.title}</span>
              <span className="meta row" style={{ gap: 6 }}>
                <Dot color={categoryColor(ws, t.category)} size={6} />{t.category}
                {goal && <> · <Target size={11} /> {goal.title}</>}
                {t.estimate_minutes > 0 && <> · {formatDuration(t.estimate_minutes * 60)}</>}
              </span>
            </button>
          </div>
        )
      })}
      {limit && tasks.length > limit && <Link className="card-link" to={routes.day(date)} style={{ paddingTop: 10 }}>+{tasks.length - limit} more</Link>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Plan vs Reality — the signature comparison, for any range.

export function PlanVsReality({ from, to, compact }: { from: DateKey; to: DateKey; compact?: boolean }) {
  const { ws } = useStore()
  const color = useSeriesColor()
  const p = planVsActual(ws, from, to)
  if (!p.planned && !p.actual) return <Empty icon={<Target size={18} />} title="Nothing planned or tracked yet" body="Plan focus blocks, then track time — this compares the two." />
  const max = Math.max(1, ...p.rows.map(r => Math.max(r.planned, r.actual)))
  const tone = p.efficiency >= 90 && p.efficiency <= 115 ? 'good' : p.efficiency > 115 ? 'accent' : 'warn'
  return (
    <div className="pvr">
      <div className="pvr-totals">
        <div><span className="eyebrow">Planned</span><b className="tabular">{formatDuration(p.planned)}</b></div>
        <div><span className="eyebrow">Actual</span><b className="tabular">{formatDuration(p.actual)}</b></div>
        <div><span className="eyebrow">Efficiency</span><b className={`tabular pvr-eff ${tone}`}>{p.planned ? `${p.efficiency}%` : '—'}</b></div>
      </div>
      <div className="legend" aria-hidden>
        <span><i className="pvr-key planned" />Planned</span>
        <span><i className="pvr-key actual" />Actual</span>
      </div>
      <div className="pvr-rows">
        {(compact ? p.rows.slice(0, 5) : p.rows).map(r => (
          <div className="pvr-row" key={r.category}>
            <div className="row-between pvr-label">
              <span className="row"><Dot color={color(r.color)} />{r.category}</span>
              <span className="tabular muted">
                {formatDuration(r.actual)} / {formatDuration(r.planned)}
                {r.planned > 0 && Math.abs(r.diff) >= 300 && <em className={r.diff > 0 ? 'over' : 'under'}>{r.diff > 0 ? '+' : '−'}{formatDuration(Math.abs(r.diff))}</em>}
                {r.planned === 0 && <em className="over">unplanned</em>}
              </span>
            </div>
            <div className="pvr-bar planned" style={{ width: `${(r.planned / max) * 100}%` }} title={`Planned ${formatDuration(r.planned)}`} />
            <div className="pvr-bar actual" style={{ width: `${(r.actual / max) * 100}%`, background: color(r.color) }} title={`Actual ${formatDuration(r.actual)}`} />
          </div>
        ))}
      </div>
      {!compact && p.planned > 0 && <p className="muted pvr-note">{p.plannedHit}% of planned blocks were followed through.</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Streaks

export function StreakRow({ s }: { s: StreakItem }) {
  const next = nextMilestone(s.current)
  const record = s.current > 0 && s.current >= s.longest
  const to = s.kind === 'habit' ? routes.habit(s.key.slice(6)) : s.kind === 'goal' ? routes.goal(s.key.slice(5)) : routes.insights
  return (
    <Link to={to} className="list-row streak-row">
      <span className="streak-icon" aria-hidden>{s.icon}</span>
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="title">{s.label}</span>
        <span className="meta">{record ? 'Personal best' : `Best: ${s.longest} ${s.unit}${s.longest === 1 ? '' : 's'}`} · next milestone {next}</span>
      </span>
      <span className={`streak-count ${s.current ? '' : 'zero'}`}><Flame size={14} />{s.current} <small>{s.unit}{s.current === 1 ? '' : 's'}</small></span>
    </Link>
  )
}

export function StreakList({ limit, kinds }: { limit?: number; kinds?: StreakItem['kind'][] }) {
  const { ws } = useStore()
  const items = allStreaks(ws).filter(s => !kinds || kinds.includes(s.kind)).sort((a, b) => b.current - a.current || b.longest - a.longest)
  return <div className="list">{(limit ? items.slice(0, limit) : items).map(s => <StreakRow key={s.key} s={s} />)}</div>
}

// ---------------------------------------------------------------------------
// Goal progress line

export function GoalRow({ goal }: { goal: Goal }) {
  const { ws } = useStore()
  const color = useSeriesColor()
  const g = goalProgress(ws, goal)
  return (
    <Link to={routes.goal(goal.id)} className="goal-row">
      <div className="row-between">
        <span className="row" style={{ minWidth: 0 }}><Dot color={color(goal.color)} /><span className="title">{goal.title}</span></span>
        <b className="tabular">{g.percent}%</b>
      </div>
      <div className="goal-row-bar"><i style={{ width: `${g.percent}%`, background: color(goal.color) }} /></div>
      <span className="meta">
        {g.targetSeconds ? `${formatDuration(g.seconds)} / ${goal.target_hours}h` : g.tasksTotal ? `${g.tasksDone}/${g.tasksTotal} tasks` : 'No target set'}
        {g.weekTargetSeconds > 0 && ` · this week ${formatDuration(g.weekSeconds)} / ${goal.weekly_target_hours}h`}
      </span>
    </Link>
  )
}

export { ProgressBar }

// ---------------------------------------------------------------------------
// Getting started — the first-week path through Plan → Track → Reflect.

export function GettingStarted() {
  const { ws, updateSettings } = useStore()
  const { open } = useEditors()
  const navigate = useNavigate()
  if (ws.settings.checklist_dismissed) return null
  const steps: Array<{ done: boolean; title: string; hint: string; action: () => void; cta: string }> = [
    { done: ws.goals.length > 0, title: 'Set a goal', hint: 'Give your hours somewhere to go, e.g. “30 hours of coding”.', cta: 'New goal', action: () => open({ kind: 'goal' }) },
    { done: ws.habits.length > 0, title: 'Add a habit', hint: 'Small daily rituals with streaks.', cta: 'New habit', action: () => open({ kind: 'habit' }) },
    { done: ws.blocks.length > 0, title: 'Plan a focus block', hint: 'Put time for what matters on your timeline.', cta: 'Plan time', action: () => open({ kind: 'block' }) },
    { done: ws.sessions.length > 0, title: 'Track focused time', hint: 'Start the timer, or log time you already put in.', cta: 'Start timer', action: () => open({ kind: 'timer' }) },
    { done: ws.completions.length > 0, title: 'Check off a habit', hint: 'Tap the circle next to a habit when it’s done.', cta: 'Add habit', action: () => open({ kind: 'habit' }) },
    { done: ws.journal.some(j => j.body || j.went_well || j.mood), title: 'Reflect on your day', hint: 'A mood and one line is enough.', cta: 'Open journal', action: () => navigate(routes.journal()) },
  ]
  const done = steps.filter(s => s.done).length
  if (done === steps.length) return null
  const next = steps.findIndex(s => !s.done)
  return (
    <section className="card gs" aria-label="Getting started">
      <div className="card-head">
        <div>
          <h2>Getting started</h2>
          <div className="sub">{done} of {steps.length} done · Plan → Track → Reflect</div>
        </div>
        <div className="row">
          <Link to={routes.guide} className="card-link">How it works</Link>
          <button className="icon-btn sm" aria-label="Hide getting started" title="Hide" onClick={() => updateSettings({ checklist_dismissed: true })}>×</button>
        </div>
      </div>
      <ProgressBar value={(done / steps.length) * 100} size="thin" label="Getting started progress" />
      <ol className="gs-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={`${s.done ? 'done' : ''} ${i === next ? 'next' : ''}`}>
            <span className="gs-mark" aria-hidden>{s.done ? '✓' : i + 1}</span>
            <span className="grow" style={{ minWidth: 0 }}>
              <b>{s.title}</b>
              <small>{s.hint}</small>
            </span>
            {!s.done && <Button size="sm" variant={i === next ? 'primary' : 'ghost'} onClick={s.action}>{s.cta}</Button>}
          </li>
        ))}
      </ol>
    </section>
  )
}
