import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BarChart3, CalendarCheck, Clock3, Compass, Flame, Gauge, Lightbulb, ListChecks, Plus, Repeat, Target, Timer, TrendingUp } from 'lucide-react'
import { daysBetween, fmt, formatDuration, monthEndKey, monthStartKey, shiftKey, todayKey, weekStartKey, yearKey } from '../lib/dates'
import type { Goal, Workspace } from '../lib/model'
import { routes } from '../lib/routes'
import {
  activeGoals, allStreaks, averageSessionSeconds, byCategory, byHour, byWeekday, change, goalProgress, habitCompletionRate, habitsCompletion,
  nextMilestone, pct, planVsActual, productiveDays, productivityStreak, secondsIn, sessionsIn, sumSeconds, weeklyStreak, weekTargetMinutes, type StreakItem,
} from '../lib/selectors'
import { useStore } from '../lib/store'
import { useEditors } from '../shell/editors'
import { Button, Card, Empty, Page, ProgressBar, Stat } from '../ui/kit'
import { StreakList } from '../ui/widgets'
import { BarsChart, TrendChart, type ChartRow } from './charts'
import { bestWindow, hourLabel, hourWindow, partOfDay, trendWord, WEEKDAYS, weekdayCounts, weekdayHourGrid } from './chartUtils'
import './insights.css'

const TITLE = 'What your data is telling you'
const SUBTITLE = 'Patterns across your time, habits, goals and plans — refreshed every time you track.'

export default function Insights() {
  const { ws } = useStore()
  const today = todayKey()
  if (!ws.sessions.length && !ws.completions.length) {
    return (
      <Page className="ins-page" eyebrow="Insights" title={TITLE} subtitle={SUBTITLE}>
        <div className="ins-top fresh">
          <Card className="ins-story" title={<span className="row"><Lightbulb size={16} /> What you’ll learn here</span>} sub="Insights appear after about a week of tracking">
            <StarterSentences />
          </Card>
          <FocusNext ws={ws} today={today} />
        </div>
        <FirstData />
      </Page>
    )
  }

  const monthStart = monthStartKey(today)
  const monthDays = daysBetween(monthStart, today) + 1
  const last30 = shiftKey(today, -29)
  const recentSessions = sessionsIn(ws, last30, today)
  const rated = recentSessions.filter(s => s.rating)
  const ratingAvg = rated.length ? rated.reduce((n, s) => n + (s.rating || 0), 0) / rated.length : null
  const prodDays = productiveDays(ws, monthStart, today)
  const total = sumSeconds(ws.sessions)
  const monthTotal = secondsIn(ws, monthStart, today)

  const goalsDone = ws.goals.filter(g => g.status === 'completed').length
  const goalsActive = activeGoals(ws)
  const goalRate = pct(goalsDone, goalsDone + goalsActive.length)
  const goalAvg = goalsActive.length ? Math.round(goalsActive.reduce((n, g) => n + goalProgress(ws, g, today).percent, 0) / goalsActive.length) : 0
  const habits30 = habitsCompletion(ws, last30, today)

  const weekStart = weekStartKey(today)
  const plan = planVsActual(ws, weekStart, shiftKey(weekStart, 6))

  return (
    <Page className="ins-page" eyebrow="Insights" title={TITLE} subtitle={SUBTITLE}>
      <section aria-label="Key numbers" className="ins-pillars">
        <Pillar icon={<Clock3 size={14} />} name="Productivity" value={formatDuration(total)} sub={`${formatDuration(monthTotal)} this month`} />
        <Pillar icon={<CalendarCheck size={14} />} name="Consistency" value={`${pct(prodDays, monthDays)}%`} sub={`${prodDays} of ${monthDays} days this month`} bar={pct(prodDays, monthDays)} />
        <Pillar icon={<Compass size={14} />} name="Focus" value={recentSessions.length ? formatDuration(averageSessionSeconds(recentSessions)) : '—'} sub={ratingAvg ? `avg session · rated ${ratingAvg.toFixed(1)}★` : 'avg session, last 30 days'} />
        <Pillar icon={<Target size={14} />} name="Goals" value={goalsDone + goalsActive.length ? `${goalRate}%` : '—'} sub={goalsDone + goalsActive.length ? `${goalsDone} done · active avg ${goalAvg}%` : 'No goals yet'} bar={goalsActive.length ? goalAvg : undefined} />
        <Pillar icon={<Repeat size={14} />} name="Habits" value={habits30.due ? `${habits30.percent}%` : '—'} sub={habits30.due ? `${habits30.done} of ${habits30.due} check-ins, 30 days` : 'No habits due yet'} bar={habits30.due ? habits30.percent : undefined} />
        <Pillar icon={<Gauge size={14} />} name="Planning" value={plan.planned ? `${plan.efficiency}%` : '—'} sub={plan.planned ? 'of planned focus delivered this week' : 'No focus blocks this week'} />
      </section>

      <div className="ins-top">
        <Card className="ins-story" title={<span className="row"><Lightbulb size={16} /> Worth knowing</span>} sub="Generated from your last few weeks">
          <InsightSentences ws={ws} today={today} />
        </Card>
        <FocusNext ws={ws} today={today} />
      </div>

      <Trends ws={ws} today={today} />

      <div className="grid-2">
        <StreaksCard ws={ws} today={today} />
        <PlanningCard ws={ws} today={today} />
      </div>

      <Rhythm ws={ws} today={today} />
    </Page>
  )
}

/** What a new account will see once it has data — written as the sentences it will become. */
function StarterSentences() {
  const lines = [
    { icon: <Clock3 size={15} />, text: <>Your <b>best focus window</b> — the two hours where most of your deep work lands.</> },
    { icon: <TrendingUp size={15} />, text: <>Which <b>days and times</b> you’re most productive, and how this week compares with last.</> },
    { icon: <Flame size={15} />, text: <>Habit and productivity <b>streaks</b>, and when one is close to a personal best.</> },
    { icon: <Gauge size={15} />, text: <>How much of your <b>plan</b> you actually follow through on.</> },
  ]
  return (
    <ul className="ins-lines">
      {lines.map((l, i) => <li key={i}><span className="ins-line-icon" aria-hidden>{l.icon}</span><span>{l.text}</span></li>)}
    </ul>
  )
}

/** Single empty state for the numbers, trends and charts a new account doesn't have yet. */
function FirstData() {
  const { open } = useEditors()
  return (
    <Card className="ins-first">
      <Empty
        icon={<BarChart3 size={16} />}
        title="Numbers, trends and charts fill in as you track"
        body="Track focus sessions and check off habits. Key numbers show up right away; patterns need about a week."
        action={(
          <div className="ins-actions">
            <Button variant="primary" size="sm" icon={<Timer size={14} />} onClick={() => open({ kind: 'timer' })}>Start timer</Button>
            <Button size="sm" icon={<Plus size={14} />} onClick={() => open({ kind: 'session' })}>Log time</Button>
          </div>
        )}
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------

function Pillar({ icon, name, value, sub, bar }: { icon: ReactNode; name: string; value: ReactNode; sub: ReactNode; bar?: number }) {
  return (
    <div className="card stat-card ins-pillar">
      <Stat label={name} icon={icon} value={value} sub={sub} />
      {bar !== undefined && <ProgressBar value={bar} size="thin" label={`${name} ${bar}%`} />}
    </div>
  )
}

type Props = { ws: Workspace; today: string }

/** 3–6 plain-language observations, strongest first. */
function InsightSentences({ ws, today }: Props) {
  const lines: Array<{ icon: ReactNode; text: ReactNode }> = []
  const from = shiftKey(today, -59)
  const sessions = sessionsIn(ws, from, today)

  // Best weekday × part of day
  const grid = weekdayHourGrid(ws, from, today)
  const parts = grid.map(row => [row.slice(0, 12), row.slice(12, 17), row.slice(17)].map(p => p.reduce((a, b) => a + b, 0)))
  let peak = { d: -1, p: 0, v: 0 }
  parts.forEach((row, d) => row.forEach((v, p) => { if (v > peak.v) peak = { d, p, v } }))
  if (peak.d >= 0) lines.push({ icon: <TrendingUp size={15} />, text: <>You're most productive on <b>{WEEKDAYS[peak.d]} {partOfDay(peak.p === 0 ? 9 : peak.p === 1 ? 14 : 19)}</b>.</> })

  const win = bestWindow(byHour(sessions))
  if (win) lines.push({ icon: <Clock3 size={15} />, text: <>Your best focus window is <b>{hourWindow(win.from, win.to)}</b> — {win.share}% of your tracked time lands there.</> })

  const plan = planVsActual(ws, shiftKey(today, -27), today)
  if (plan.planned > 0) lines.push({ icon: <Gauge size={15} />, text: <>You followed through on <b>{plan.plannedHit}%</b> of planned blocks over the last 4 weeks.</> })

  // Category move week over week (pace-matched)
  const weekStart = weekStartKey(today)
  const elapsed = daysBetween(weekStart, today) + 1
  const lastWeekStart = shiftKey(weekStart, -7)
  const prev = new Map(byCategory(ws, sessionsIn(ws, lastWeekStart, shiftKey(lastWeekStart, elapsed - 1))).map(s => [s.name, s.seconds]))
  let move: { name: string; c: number; delta: number } | null = null
  for (const s of byCategory(ws, sessionsIn(ws, weekStart, today))) {
    const c = change(s.seconds, prev.get(s.name) || 0)
    const delta = Math.abs(s.seconds - (prev.get(s.name) || 0))
    if (c !== null && c !== 0 && delta >= 1800 && (!move || delta > move.delta)) move = { name: s.name, c, delta }
  }
  if (move) lines.push({ icon: <TrendingUp size={15} />, text: <><b>{move.name}</b> is {trendWord(move.c)} vs the same point last week.</> })

  // Streak close to (or at) a personal best
  const streaks = allStreaks(ws, today).filter(s => s.kind === 'habit' || s.kind === 'productivity')
  const near = streaks.filter(s => s.current > 0 && s.longest > s.current && s.longest - s.current <= 5).sort((a, b) => a.longest - a.current - (b.longest - b.current))[0]
  const best = streaks.filter(s => s.current >= 3 && s.current >= s.longest).sort((a, b) => b.current - a.current)[0]
  if (near) lines.push({ icon: <Flame size={15} />, text: <><b>{near.label}</b> streak is {near.longest - near.current} {near.unit}{near.longest - near.current === 1 ? '' : 's'} from a personal best.</> })
  else if (best) lines.push({ icon: <Flame size={15} />, text: <>Your <b>{best.label}</b> streak is a personal best — {best.current} {best.unit}s and counting.</> })

  // Consistency this month
  const monthStart = monthStartKey(today)
  const days = daysBetween(monthStart, today) + 1
  const prod = productiveDays(ws, monthStart, today)
  if (lines.length < 6 && days >= 3) lines.push({ icon: <CalendarCheck size={15} />, text: <>You've been productive on <b>{prod} of {days}</b> days this month.</> })

  if (!lines.length) return <Empty title="Not enough data yet" body="Keep tracking — observations appear after a few sessions." />
  return (
    <ul className="ins-lines">
      {lines.slice(0, 6).map((l, i) => <li key={i}><span className="ins-line-icon" aria-hidden>{l.icon}</span><span>{l.text}</span></li>)}
    </ul>
  )
}

/** Expected share of a goal's target by today, from its start to its deadline (or month end for monthly goals). */
function goalPace(ws: Workspace, g: Goal, today: string) {
  const p = goalProgress(ws, g, today)
  if (!p.targetSeconds) return null
  const end = g.deadline || (g.horizon === 'monthly' ? monthEndKey(today) : null)
  if (!end || end < today || g.start_date > today) return null
  const span = daysBetween(g.start_date, end) + 1
  const done = daysBetween(g.start_date, today) + 1
  const expected = (p.targetSeconds * done) / span
  const left = Math.max(1, daysBetween(today, end) + 1)
  return { goal: g, behind: expected - p.seconds, perDay: Math.max(0, p.targetSeconds - p.seconds) / left, left }
}

function FocusNext({ ws, today }: Props) {
  const { open } = useEditors()
  const items: Array<{ key: string; icon: ReactNode; title: ReactNode; body: ReactNode; to?: string; onClick?: () => void; cta: string }> = []

  const behind = activeGoals(ws).map(g => goalPace(ws, g, today)).filter((x): x is NonNullable<typeof x> => !!x && x.behind > 1800).sort((a, b) => b.behind - a.behind)[0]
  if (behind) items.push({ key: 'goal', icon: <Target size={16} />, title: <>{behind.goal.title} is {formatDuration(behind.behind)} behind pace</>, body: `About ${formatDuration(behind.perDay)} a day over the next ${behind.left} days gets it back on track.`, to: routes.goal(behind.goal.id), cta: 'Open goal' })

  const habits = ws.habits.filter(h => !h.archived && h.start_date <= shiftKey(today, -7)).map(h => ({ h, rate: habitCompletionRate(ws, h, shiftKey(today, -29), shiftKey(today, -1)) })).sort((a, b) => a.rate - b.rate)
  if (habits.length && habits[0].rate < 80) items.push({ key: 'habit', icon: <Repeat size={16} />, title: <>{habits[0].h.icon} {habits[0].h.name} is your least consistent habit</>, body: `${habits[0].rate}% completion over the last 30 days. Try a reminder or a smaller target.`, to: routes.habit(habits[0].h.id), cta: 'Open habit' })

  const overdue = ws.tasks.filter(t => !t.done && t.date && t.date < today).sort((a, b) => b.priority - a.priority)
  if (overdue.length) items.push({ key: 'tasks', icon: <ListChecks size={16} />, title: <>{overdue.length} overdue task{overdue.length === 1 ? '' : 's'}</>, body: `Start with “${overdue[0].title}” — reschedule or finish it today.`, onClick: () => open({ kind: 'task', id: overdue[0].id }), cta: 'Open task' })

  // Setup steps for accounts that are just getting started.
  if (!ws.sessions.length) items.push({ key: 'first', icon: <Timer size={16} />, title: 'Track your first focus session', body: 'Start a timer when you sit down to work — or log time you already spent today.', onClick: () => open({ kind: 'timer' }), cta: 'Start timer' })
  if (!activeGoals(ws).length) items.push({ key: 'new-goal', icon: <Target size={16} />, title: 'Set a goal worth working toward', body: 'Give it a target in hours and link sessions to it; Nudge tracks the pace for you.', onClick: () => open({ kind: 'goal' }), cta: 'Create goal' })
  if (!ws.habits.some(h => !h.archived)) items.push({ key: 'new-habit', icon: <Repeat size={16} />, title: 'Add one small daily habit', body: 'Something you can do in two minutes. Streaks and consistency show up here.', onClick: () => open({ kind: 'habit' }), cta: 'Add habit' })

  const weekStart = weekStartKey(today)
  const weekDone = secondsIn(ws, weekStart, today)
  const weekTarget = weekTargetMinutes(ws, weekStart) * 60
  const daysLeft = daysBetween(today, shiftKey(weekStart, 6)) + 1
  if (ws.sessions.length && weekDone < weekTarget) items.push({ key: 'week', icon: <Gauge size={16} />, title: <>{formatDuration(weekTarget - weekDone)} left for this week's target</>, body: `That's about ${formatDuration((weekTarget - weekDone) / daysLeft)} a day for the next ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`, to: routes.week(today), cta: 'Plan the week' })

  const tomorrow = shiftKey(today, 1)
  if (!ws.blocks.some(b => b.date === tomorrow && b.kind === 'focus')) items.push({ key: 'plan', icon: <CalendarCheck size={16} />, title: 'Tomorrow has no focus blocks yet', body: 'Five minutes of planning tonight makes the morning easier.', to: routes.day(tomorrow), cta: 'Plan tomorrow' })

  return (
    <Card className="ins-next" title={<span className="row"><Compass size={16} /> What to focus on next</span>}>
      {items.length ? (
        <ul className="ins-next-list">
          {items.slice(0, 4).map(i => (
            <li key={i.key}>
              <span className="ins-next-icon" aria-hidden>{i.icon}</span>
              <div className="grow">
                <b>{i.title}</b>
                <p>{i.body}</p>
                {i.to ? <Link className="card-link" to={i.to}>{i.cta} <ArrowRight size={13} /></Link> : <button type="button" className="card-link" onClick={i.onClick}>{i.cta} <ArrowRight size={13} /></button>}
              </div>
            </li>
          ))}
        </ul>
      ) : <Empty title="You're on track" body="No goals behind pace, no overdue tasks. Keep the rhythm." />}
    </Card>
  )
}

function Trends({ ws, today }: Props) {
  const weekStart = weekStartKey(today)
  const wDays = daysBetween(weekStart, today)
  const monthStart = monthStartKey(today)
  const mDays = daysBetween(monthStart, today)
  const prevMonth = monthStartKey(shiftKey(monthStart, -1))
  const yearStart = `${yearKey(today)}-01-01`
  const yDays = daysBetween(yearStart, today)
  const prevYear = `${Number(yearKey(today)) - 1}-01-01`
  // Compare like with like: the same number of elapsed days in the previous period.
  const rows = [
    { label: 'This week', now: secondsIn(ws, weekStart, today), before: secondsIn(ws, shiftKey(weekStart, -7), shiftKey(weekStart, wDays - 7)), vs: 'last week' },
    { label: 'This month', now: secondsIn(ws, monthStart, today), before: secondsIn(ws, prevMonth, shiftKey(prevMonth, Math.min(mDays, daysBetween(prevMonth, shiftKey(monthStart, -1))))), vs: 'last month' },
    { label: 'This year', now: secondsIn(ws, yearStart, today), before: secondsIn(ws, prevYear, shiftKey(prevYear, yDays)), vs: 'last year' },
  ]
  return (
    <Card title={<span className="row"><TrendingUp size={16} /> Trends</span>} sub="Compared with the same point in the previous period">
      <div className="grid-3 ins-trends">
        {rows.map(r => {
          const c = change(r.now, r.before)
          return (
            <div key={r.label} className="ins-trend">
              <Stat label={r.label} value={formatDuration(r.now)} trend={c} sub={c === null ? `nothing to compare with ${r.vs}` : `vs ${formatDuration(r.before)} ${r.vs}`} />
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function StreaksCard({ ws, today }: Props) {
  const p = productivityStreak(ws, today)
  const w = weeklyStreak(ws, today)
  const habitTop = allStreaks(ws, today).filter(s => s.kind === 'habit').sort((a, b) => b.current - a.current)[0] as StreakItem | undefined
  const highlights = [
    { key: 'p', label: 'Productivity', unit: 'day', ...p },
    { key: 'w', label: 'Weekly target', unit: 'week', ...w },
    ...(habitTop ? [{ key: habitTop.key, label: habitTop.label, unit: habitTop.unit, current: habitTop.current, longest: habitTop.longest }] : []),
  ]
  return (
    <Card title={<span className="row"><Flame size={16} /> Streaks</span>} sub={`A productive day means at least ${formatDuration(ws.settings.min_minutes_day * 60, { short: true })} tracked`}>
      <div className="ins-streak-tops">
        {highlights.map(s => {
          const next = nextMilestone(s.current)
          return (
            <div className="ins-streak-top" key={s.key}>
              <span className="eyebrow">{s.label}</span>
              <b className="tabular">{s.current}<small> {s.unit}{s.current === 1 ? '' : 's'}</small></b>
              <ProgressBar value={pct(s.current, next)} size="thin" label={`${s.label}: ${s.current} of ${next} to next milestone`} />
              <span className="muted">{next - s.current} to {next} · best {s.longest}</span>
            </div>
          )
        })}
      </div>
      <StreakList kinds={['productivity', 'weekly', 'habit']} limit={7} />
    </Card>
  )
}

function PlanningCard({ ws, today }: Props) {
  const weekStart = weekStartKey(today)
  const weeks = [-4, -3, -2, -1, 0].map(i => {
    const from = shiftKey(weekStart, i * 7)
    const p = planVsActual(ws, from, shiftKey(from, 6))
    return { label: i === 0 ? 'This wk' : fmt(from, 'MMM d'), full: i === 0 ? 'This week' : `Week of ${fmt(from, 'MMM d')}`, planned: p.planned, actual: p.actual, efficiency: p.efficiency, hit: p.plannedHit }
  })
  const now = weeks[weeks.length - 1]
  const past = weeks.slice(0, 4).filter(w => w.planned > 0)
  const avgEff = past.length ? Math.round(past.reduce((n, w) => n + w.efficiency, 0) / past.length) : null
  return (
    <Card title={<span className="row"><Gauge size={16} /> Planning accuracy</span>} sub="Planned focus blocks vs time actually tracked" action={<Link className="card-link" to={routes.week(today)}>Plan week</Link>}>
      <div className="ins-plan-stats">
        <Stat label="This week" value={now.planned ? `${now.efficiency}%` : '—'} sub={now.planned ? `${formatDuration(now.actual)} of ${formatDuration(now.planned)}` : 'Nothing planned yet'} />
        <Stat label="4-week average" value={avgEff !== null ? `${avgEff}%` : '—'} sub="efficiency" />
        <Stat label="Blocks followed" value={now.planned ? `${now.hit}%` : '—'} sub="this week" />
      </div>
      <BarsChart
        data={weeks as ChartRow[]}
        xLabel="Week"
        size="sm"
        series={[{ key: 'planned', name: 'Planned', color: 'var(--planned)' }, { key: 'actual', name: 'Actual', color: 'var(--accent)' }]}
        summary={`Planned vs actual focus for the last five weeks. ${weeks.map(w => `${w.full}: ${w.efficiency}%`).join('; ')}.`}
      />
    </Card>
  )
}

function Rhythm({ ws, today }: Props) {
  const from = shiftKey(today, -89)
  const sessions = sessionsIn(ws, from, today)
  const counts = weekdayCounts(from, today)
  const wd = byWeekday(sessions)
  const weekdays: ChartRow[] = wd.map((s, i) => ({ label: WEEKDAYS[i].slice(0, 3), full: `${WEEKDAYS[i]} (average)`, avg: counts[i] ? s / counts[i] : 0 }))
  const activeDays = productiveDays(ws, from, today) || 1
  const hours = byHour(sessions)
  const hourRows: ChartRow[] = hours.map((s, h) => ({ label: hourLabel(h), full: `${hourLabel(h)}–${hourLabel(h + 1)}`, avg: s / activeDays }))
  const lo = Math.min(ws.settings.day_start_hour, ...hours.map((v, h) => (v > 0 ? h : 24)))
  const hi = Math.max(ws.settings.day_end_hour, ...hours.map((v, h) => (v > 0 ? h + 1 : 0)))
  const bestD = wd.indexOf(Math.max(...wd))
  const win = bestWindow(hours)
  if (!sessions.length) return null
  return (
    <div className="grid-2">
      <Card title="Most productive days" sub={`Average per weekday, last 90 days · strongest: ${WEEKDAYS[bestD]}`}>
        <BarsChart data={weekdays} xLabel="Weekday" series={[{ key: 'avg', name: 'Average', color: 'var(--accent)' }]} summary={`Average productive time by weekday; ${WEEKDAYS[bestD]} is strongest.`} />
      </Card>
      <Card title="Most productive hours" sub={`Average per productive day${win ? ` · peak ${hourWindow(win.from, win.to)}` : ''}`}>
        <TrendChart data={hourRows.slice(lo, hi)} xLabel="Hour" series={[{ key: 'avg', name: 'Average', color: 'var(--accent)', kind: 'area' }]} summary={`Average productive time per hour of day; peak window ${win ? hourWindow(win.from, win.to) : 'none'}.`} />
      </Card>
    </div>
  )
}
