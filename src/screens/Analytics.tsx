import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BarChart3, CalendarDays, Clock3, Plus, Sparkles, Timer } from 'lucide-react'
import { daysBetween, fmt, formatDuration, monthEndKey, monthKey, monthStartKey, rangeKeys, shiftKey, todayKey, weekStartKey } from '../lib/dates'
import type { DateKey, Goal, ProductiveSession } from '../lib/model'
import { routes } from '../lib/routes'
import {
  averageSessionSeconds, bestDay, bestHour, bestMonth, blocksOn, byCategory, byDay, byGoal, categoryColor, change, dayTargetMinutes, goalById,
  longestSession, monthLabel, monthTargetMinutes, pct, plannedSecondsIn, productiveDays, productivityStreak, secondsIn, sessionsIn, sessionsOn,
  sumSeconds, topSlice, weekTargetMinutes, type Slice,
} from '../lib/selectors'
import { useStore } from '../lib/store'
import { useEditors } from '../shell/editors'
import { Button, Card, DateStepper, Dot, Empty, Page, ProgressBar, Stat, Tabs, useSeriesColor } from '../ui/kit'
import { GoalRow, PlanVsReality } from '../ui/widgets'
import { BarsChart, HBars, TrendChart, WeekHourHeatmap, type ChartRow } from './charts'
import { hourLabel, hourWindow, minuteLabel, monthSeries, trendWord, weekdayHourGrid, weekSeries } from './chartUtils'
import './analytics.css'

type Tab = 'today' | 'week' | 'month' | 'all'
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
]
const isKey = (v: string | null): v is DateKey => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

export default function Analytics() {
  const { ws } = useStore()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = TABS.some(t => t.value === raw) ? (raw as Tab) : 'week'
  const dateParam = params.get('date')
  const date = isKey(dateParam) ? dateParam : todayKey()
  const fresh = !ws.sessions.length

  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true })
  const setDate = (k: DateKey) => setParams(k === todayKey() ? { tab } : { tab, date: k }, { replace: true })
  const stepMode = tab === 'today' ? 'day' : tab === 'week' ? 'week' : tab === 'month' ? 'month' : null

  return (
    <Page
      className="an-page"
      eyebrow="Analytics"
      title="Where your time goes"
      subtitle="Every number here is built from the sessions you track — day, week, month and all time."
    >
      <div className="an-bar">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        {stepMode && !fresh && <DateStepper value={date} onChange={setDate} mode={stepMode} />}
      </div>
      {fresh && <FirstRun tab={tab} />}
      {!fresh && tab === 'today' && <DayView date={date} />}
      {!fresh && tab === 'week' && <WeekView date={date} />}
      {!fresh && tab === 'month' && <MonthView date={date} />}
      {!fresh && tab === 'all' && <AllTimeView />}
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Empty states

const FIRST_RUN: Record<Tab, { title: string; body: string; points: string[] }> = {
  today: {
    title: 'Your day, once you track it',
    body: 'Start a timer when you begin a focus block, or log time you already spent. Today’s view then fills in automatically.',
    points: ['Time tracked vs your daily target', 'A timeline of sessions against planned blocks', 'Categories and goals you moved forward'],
  },
  week: {
    title: 'Your week, once you track it',
    body: 'Every session you track adds to this week’s picture. One session is enough to get started.',
    points: ['Hours per day, planned vs actual', 'Where the time went by category', 'How this week compares with last week'],
  },
  month: {
    title: 'Your month, once you track it',
    body: 'Track sessions through the month and the patterns build up on their own.',
    points: ['Daily totals against your target', 'Best day and best time of day', 'A weekday × hour heatmap of your focus'],
  },
  all: {
    title: 'Your long-term story starts here',
    body: 'All-time numbers grow with every session you track — nothing to set up.',
    points: ['Total time, streaks and best month', 'Monthly and weekly trends', 'Which categories and goals get your effort'],
  },
}

function TrackActions({ date }: { date?: DateKey }) {
  const { open } = useEditors()
  return (
    <div className="an-actions">
      <Button variant="primary" size="sm" icon={<Timer size={14} />} onClick={() => open({ kind: 'timer' })}>Start timer</Button>
      <Button size="sm" icon={<Plus size={14} />} onClick={() => open({ kind: 'session', defaults: date ? { date } : undefined })}>Log time</Button>
    </div>
  )
}

/** Brand-new account: one explanation of what this tab will show, and how to get data into it. */
function FirstRun({ tab }: { tab: Tab }) {
  const c = FIRST_RUN[tab]
  return (
    <section className="card an-first">
      <span className="an-first-icon" aria-hidden><BarChart3 size={18} /></span>
      <div className="an-first-body">
        <h2>{c.title}</h2>
        <p>{c.body}</p>
        <ul className="an-first-points">{c.points.map(p => <li key={p}>{p}</li>)}</ul>
        <TrackActions />
      </div>
    </section>
  )
}

/** A period with no tracked time (the account has data elsewhere). */
function PeriodEmpty({ title, from, day }: { title: string; from: DateKey; day?: boolean }) {
  const future = from > todayKey()
  return (
    <Card className="an-period-empty">
      <Empty
        icon={<CalendarDays size={16} />}
        title={future ? 'This hasn’t happened yet' : title}
        body={future ? 'Use the arrows to go back, or plan focus blocks for it in the planner.' : 'Start a timer, or log time you’ve already spent, and this view fills in.'}
        action={future ? <Link className="btn sm" to={routes.day(from)}>Open planner</Link> : <TrackActions date={day ? from : undefined} />}
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Shared bits

function StatTile(props: Parameters<typeof Stat>[0] & { children?: ReactNode }) {
  const { children, ...stat } = props
  return <div className="card stat-card an-tile"><Stat {...stat} />{children}</div>
}

function Insight({ lines }: { lines: Array<string | null | false> }) {
  const shown = lines.filter(Boolean) as string[]
  if (!shown.length) return null
  return (
    <div className="an-insight">
      <Sparkles size={16} aria-hidden />
      <p>{shown.map((l, i) => <span key={i}>{l} </span>)}</p>
    </div>
  )
}

function CategoryCard({ slices, title = 'By category', sub }: { slices: Slice[]; title?: string; sub?: ReactNode }) {
  const color = useSeriesColor()
  return (
    <Card title={title} sub={sub}>
      {slices.length
        ? <HBars label={title} items={slices.map(s => ({ key: s.name, name: s.name, color: color(s.color), seconds: s.seconds, to: routes.search(s.name) }))} />
        : <Empty title="No tracked time" body="Categories appear once you log a session." />}
    </Card>
  )
}

/** Biggest category move between two sets of sessions, as a sentence. */
function categoryMove(ws: ReturnType<typeof useStore>['ws'], now: ProductiveSession[], before: ProductiveSession[], period: string) {
  const prev = new Map(byCategory(ws, before).map(s => [s.name, s.seconds]))
  let best: { name: string; c: number; delta: number } | null = null
  for (const s of byCategory(ws, now)) {
    const c = change(s.seconds, prev.get(s.name) || 0)
    if (c === null) continue
    const delta = Math.abs(s.seconds - (prev.get(s.name) || 0))
    if (delta >= 1800 && (!best || delta > best.delta)) best = { name: s.name, c, delta }
  }
  return best ? `${best.name} is ${trendWord(best.c)} vs ${period}.` : null
}

// ---------------------------------------------------------------------------
// Day

function DayView({ date }: { date: DateKey }) {
  const { ws } = useStore()
  const { open } = useEditors()
  const isToday = date === todayKey()
  const sessions = [...sessionsOn(ws, date)].sort((a, b) => a.started_at.localeCompare(b.started_at))
  const seconds = sumSeconds(sessions)
  const target = dayTargetMinutes(ws, date) * 60
  const planned = plannedSecondsIn(ws, date, date)
  const avg = averageSessionSeconds(sessions)
  const longest = longestSession(sessions)
  const cats = byCategory(ws, sessions)
  const top = topSlice(cats)
  const weekAvg = secondsIn(ws, shiftKey(date, -7), shiftKey(date, -1)) / 7
  const vsAvg = change(seconds, weekAvg)
  const goals = [...new Set(sessions.map(s => s.goal_id).filter(Boolean) as string[])].map(id => goalById(ws, id)).filter((g): g is Goal => !!g)
  const color = useSeriesColor()
  const dayWord = isToday ? 'today' : 'that day'

  if (!sessions.length) {
    const hasPlan = blocksOn(ws, date).some(b => b.kind === 'focus')
    return (
      <div className="an-view">
        <PeriodEmpty title={isToday ? 'Nothing tracked today yet' : `Nothing tracked on ${fmt(date, 'EEE, MMM d')}`} from={date} day />
        {hasPlan && (
          <Card title="Planned vs actual" sub={fmt(date, 'EEEE, MMM d')} action={<Link className="card-link" to={routes.day(date)}>Open day</Link>}>
            <PlanVsReality from={date} to={date} />
          </Card>
        )}
      </div>
    )
  }

  return (
    <div className="an-view">
      <div className="grid-4">
        <StatTile label="Productive time" icon={<Clock3 size={14} />} value={formatDuration(seconds)} sub={`of ${formatDuration(target)} target`}>
          <ProgressBar value={pct(seconds, target)} tone={seconds >= target ? 'good' : undefined} size="thin" label="Daily target progress" />
        </StatTile>
        <StatTile label="Sessions" icon={<Timer size={14} />} value={sessions.length} sub={longest ? `Longest ${formatDuration(longest.duration_seconds)}` : 'None yet'} />
        <StatTile label="Average session" value={sessions.length ? formatDuration(avg) : '—'} sub={top ? `Mostly ${top.name}` : undefined} />
        <StatTile label="7-day average" value={formatDuration(weekAvg)} sub="per day, the week before" />
      </div>

      <Insight lines={[
        `${formatDuration(seconds)} across ${sessions.length} session${sessions.length === 1 ? '' : 's'} ${dayWord}${top ? `, mostly ${top.name}` : ''}.`,
        seconds >= target ? 'Daily target reached — nicely done.' : `${formatDuration(target - seconds)} to go for your ${formatDuration(target, { short: true })} target.`,
        planned > 0 && `You planned ${formatDuration(planned)} of focus and delivered ${pct(seconds, planned)}% of it.`,
        !isToday && vsAvg !== null && `That's ${trendWord(vsAvg)} on the previous 7-day average.`,
      ]} />

      <Card title="Timeline" sub="Planned focus blocks above, tracked sessions below" action={<Link className="card-link" to={routes.day(date)}>Open day</Link>}>
        <DayTimeline date={date} sessions={sessions} />
        {sessions.length > 0 && (
          <div className="list an-sessions">
            {sessions.map(s => {
              const g = goalById(ws, s.goal_id)
              return (
                <button type="button" className="list-row an-session" key={s.id} onClick={() => open({ kind: 'session', id: s.id })}>
                  <Dot color={color(categoryColor(ws, s.category))} size={10} />
                  <span className="grow an-session-body">
                    <span className="title">{s.category}{g ? ` · ${g.title}` : ''}</span>
                    <span className="meta">{clock(s.started_at)}–{clock(s.ended_at)}{s.rating ? ` · ${'★'.repeat(s.rating)}` : ''}{s.notes ? ` · ${s.notes}` : ''}</span>
                  </span>
                  <b className="tabular">{formatDuration(s.duration_seconds)}</b>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      <div className="grid-2">
        <CategoryCard slices={cats} />
        <Card title="Goals moved forward" sub={goals.length ? `${goals.length} goal${goals.length === 1 ? '' : 's'} touched ${dayWord}` : undefined}>
          {goals.length
            ? <div>{goals.map(g => <GoalRow key={g.id} goal={g} />)}</div>
            : <Empty title="No goal time yet" body="Link a session to a goal and its progress shows up here." />}
        </Card>
      </div>

      <Card title="Planned vs actual" sub={fmt(date, 'EEEE, MMM d')}>
        <PlanVsReality from={date} to={date} />
      </Card>
    </div>
  )
}

const clock = (iso: string) => { const d = new Date(iso); return minuteLabel(d.getHours() * 60 + d.getMinutes()) }

function DayTimeline({ date, sessions }: { date: DateKey; sessions: ProductiveSession[] }) {
  const { ws } = useStore()
  const color = useSeriesColor()
  const blocks = blocksOn(ws, date).filter(b => b.kind === 'focus')
  const mins = sessions.map(s => { const a = new Date(s.started_at); const b = new Date(s.ended_at); const start = a.getHours() * 60 + a.getMinutes(); return { s, start, end: Math.max(start + 5, start + Math.round((b.getTime() - a.getTime()) / 60000)) } })
  let lo = ws.settings.day_start_hour * 60
  let hi = ws.settings.day_end_hour * 60
  for (const m of [...mins, ...blocks.map(b => ({ start: b.start_min, end: b.end_min }))]) { lo = Math.min(lo, Math.floor(m.start / 60) * 60); hi = Math.max(hi, Math.ceil(m.end / 60) * 60) }
  hi = Math.min(hi, 24 * 60)
  const span = Math.max(60, hi - lo)
  const x = (m: number) => `${((Math.max(lo, Math.min(hi, m)) - lo) / span) * 100}%`
  const w = (a: number, b: number) => `${Math.max(0.6, ((Math.min(hi, b) - Math.max(lo, a)) / span) * 100)}%`
  const ticks = Array.from({ length: span / 60 + 1 }, (_, i) => lo / 60 + i).filter(h => (h - lo / 60) % 3 === 0)
  if (!blocks.length && !sessions.length) return <Empty title="An open day" body="Plan focus blocks or track a session to see them on the timeline." />
  return (
    <div className="an-timeline" role="img" aria-label={`Timeline: ${blocks.length} planned blocks and ${sessions.length} tracked sessions.`}>
      <div className="an-tl-lane planned">
        {blocks.map(b => <span key={b.id} className="an-tl-block" style={{ left: x(b.start_min), width: w(b.start_min, b.end_min) }} title={`${b.title} · ${minuteLabel(b.start_min)}–${minuteLabel(b.end_min)}`} />)}
      </div>
      <div className="an-tl-lane">
        {mins.map(({ s, start, end }) => <span key={s.id} className="an-tl-session" style={{ left: x(start), width: w(start, end), background: color(categoryColor(ws, s.category)) }} title={`${s.category} · ${formatDuration(s.duration_seconds)}`} />)}
      </div>
      <div className="an-tl-axis">
        {ticks.map(h => <span key={h} style={{ left: x(h * 60) }}>{hourLabel(h)}</span>)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Week

function WeekView({ date }: { date: DateKey }) {
  const { ws } = useStore()
  const navigate = useNavigate()
  const color = useSeriesColor()
  const today = todayKey()
  const start = weekStartKey(date)
  const end = shiftKey(start, 6)
  const prevStart = shiftKey(start, -7)
  const keys = rangeKeys(start, end)
  const sessions = sessionsIn(ws, start, end)
  const prev = sessionsIn(ws, prevStart, shiftKey(start, -1))
  const total = sumSeconds(sessions)
  const target = weekTargetMinutes(ws, start) * 60
  const current = today >= start && today <= end
  const elapsed = current ? daysBetween(start, today) + 1 : 7
  const prevSame = secondsIn(ws, prevStart, shiftKey(prevStart, elapsed - 1))
  const trend = change(total, prevSame)
  const avg = total / elapsed
  const best = bestDay(ws, start, end)
  const cats = byCategory(ws, sessions)
  const top = topSlice(cats)
  const days = byDay(ws, keys)
  const data: ChartRow[] = days.map(d => ({ label: fmt(d.key, 'EEE'), full: fmt(d.key, 'EEEE, MMM d'), key: d.key, actual: d.seconds, planned: d.planned }))
  const plannedTotal = days.reduce((n, d) => n + d.planned, 0)

  // Cumulative comparison with last week.
  const cumulative: ChartRow[] = keys.map((k, i) => ({
    label: fmt(k, 'EEE'),
    full: fmt(k, 'EEEE'),
    thisWeek: k <= today ? secondsIn(ws, start, k) : undefined,
    lastWeek: secondsIn(ws, prevStart, shiftKey(prevStart, i)),
  }))
  const lastTotal = sumSeconds(prev)

  if (!sessions.length) {
    return (
      <div className="an-view">
        <PeriodEmpty title={current ? 'Nothing tracked this week yet' : `Nothing tracked the week of ${fmt(start, 'MMM d')}`} from={start} />
        {plannedTotal > 0 && <Card title="Planned vs actual" sub="By category"><PlanVsReality from={start} to={end} /></Card>}
      </div>
    )
  }

  return (
    <div className="an-view">
      <div className="grid-4">
        <StatTile label="Productive time" icon={<Clock3 size={14} />} value={formatDuration(total)} trend={trend} sub={current ? 'vs same point last week' : 'vs last week'}>
          <ProgressBar value={pct(total, target)} tone={total >= target ? 'good' : undefined} size="thin" label="Weekly target progress" />
          <span className="an-tile-foot">{pct(total, target)}% of {formatDuration(target, { short: true })} target</span>
        </StatTile>
        <StatTile label="Daily average" value={formatDuration(avg)} sub={`over ${elapsed} day${elapsed === 1 ? '' : 's'}`} />
        <StatTile label="Best day" value={best ? fmt(best.key, 'EEEE') : '—'} sub={best ? formatDuration(best.seconds) : 'No tracked time'} />
        <StatTile label="Top category" value={top ? <span className="row"><Dot color={color(top.color)} size={10} />{top.name}</span> : '—'} sub={top ? `${formatDuration(top.seconds)} · ${pct(top.seconds, total)}% of the week` : undefined} />
      </div>

      <Insight lines={[
        `${formatDuration(total)}${current ? ' so far this week' : ' this week'}, ${total >= target ? 'weekly target reached' : `${formatDuration(target - total)} ${current ? 'to go' : 'short of your target'}`}.`,
        best && elapsed >= 3 && `${fmt(best.key, 'EEEE')} was your strongest day.`,
        categoryMove(ws, sessions, current ? sessionsIn(ws, prevStart, shiftKey(prevStart, elapsed - 1)) : prev, current ? 'the same point last week' : 'last week'),
      ]} />

      <Card title="Productive hours by day" sub="Planned focus vs tracked time · tap a day to open it">
        <BarsChart
          data={data}
          xLabel="Day"
          series={[{ key: 'planned', name: 'Planned', color: 'var(--planned)' }, { key: 'actual', name: 'Actual', color: 'var(--accent)' }]}
          target={ws.settings.target_minutes_day * 60}
          targetLabel="Daily target"
          summary={`Productive time per day, ${fmt(start, 'MMM d')} to ${fmt(end, 'MMM d')}. Total ${formatDuration(total)} tracked against ${formatDuration(plannedTotal)} planned.`}
          onSelect={row => navigate(routes.day(String(row.key)))}
        />
      </Card>

      <div className="grid-2">
        <Card title="Planned vs actual" sub="By category">
          <PlanVsReality from={start} to={end} />
        </Card>
        <CategoryCard slices={cats} />
      </div>

      <Card title="Compared with last week" sub={`Last week: ${formatDuration(lastTotal)} in ${prev.length} sessions`}>
        <div className="an-compare">
          <div className="an-compare-stats">
            <Stat label="Total" value={formatDuration(total)} trend={change(total, current ? prevSame : lastTotal)} />
            <Stat label="Sessions" value={sessions.length} sub={`${prev.length} last week`} />
            <Stat label="Avg session" value={formatDuration(averageSessionSeconds(sessions))} sub={`${formatDuration(averageSessionSeconds(prev))} last week`} />
            <Stat label="Productive days" value={productiveDays(ws, start, end)} sub={`${productiveDays(ws, prevStart, shiftKey(start, -1))} last week`} />
          </div>
          <TrendChart
            data={cumulative}
            xLabel="Day"
            size="sm"
            series={[{ key: 'thisWeek', name: 'This week', color: 'var(--accent)' }, { key: 'lastWeek', name: 'Last week', color: 'var(--ink-3)', kind: 'dashed' }]}
            summary={`Running total this week ${formatDuration(total)} against last week's ${formatDuration(lastTotal)}.`}
          />
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Month

function MonthView({ date }: { date: DateKey }) {
  const { ws } = useStore()
  const navigate = useNavigate()
  const color = useSeriesColor()
  const today = todayKey()
  const start = monthStartKey(date)
  const end = monthEndKey(date)
  const keys = rangeKeys(start, end)
  const sessions = sessionsIn(ws, start, end)
  const total = sumSeconds(sessions)
  const target = monthTargetMinutes(ws, start) * 60
  const current = monthKey(today) === monthKey(start)
  const elapsed = current ? daysBetween(start, today) + 1 : keys.length
  const prevStart = monthStartKey(shiftKey(start, -1))
  const prevSame = secondsIn(ws, prevStart, shiftKey(prevStart, elapsed - 1))
  const best = bestDay(ws, start, end)
  const hour = bestHour(sessions)
  const cats = byCategory(ws, sessions)
  const top = topSlice(cats)
  const prodDays = productiveDays(ws, start, end)
  const dailyTarget = ws.settings.target_minutes_day * 60
  const data: ChartRow[] = byDay(ws, keys).map(d => ({ label: fmt(d.key, 'd'), full: fmt(d.key, 'EEE, MMM d'), key: d.key, actual: d.seconds }))
  const weeks = [...new Set(keys.map(weekStartKey))].map(w => {
    const from = w < start ? start : w
    const to = shiftKey(w, 6) > end ? end : shiftKey(w, 6)
    return { label: fmt(from, 'MMM d'), full: `${fmt(from, 'MMM d')} – ${fmt(to, 'MMM d')}`, actual: secondsIn(ws, from, to) }
  })
  const pace = current ? (total / elapsed) * keys.length : total

  if (!sessions.length) return <div className="an-view"><PeriodEmpty title={current ? 'Nothing tracked this month yet' : `Nothing tracked in ${monthLabel(start)}`} from={start} /></div>

  return (
    <div className="an-view">
      <div className="grid-4">
        <StatTile label="Productive time" icon={<Clock3 size={14} />} value={formatDuration(total)} trend={change(total, prevSame)} sub={current ? 'vs same point last month' : 'vs last month'} />
        <StatTile label="Monthly target" value={`${pct(total, target)}%`} sub={`of ${formatDuration(target, { short: true })}`}>
          <ProgressBar value={pct(total, target)} tone={total >= target ? 'good' : undefined} marker={current ? Math.round((elapsed / keys.length) * 100) : undefined} size="thin" label="Monthly target progress" />
        </StatTile>
        <StatTile label="Daily average" value={formatDuration(total / elapsed)} sub={`${prodDays} productive day${prodDays === 1 ? '' : 's'} of ${elapsed}`} />
        <StatTile label="Best day" value={best ? fmt(best.key, 'MMM d') : '—'} sub={best ? `${fmt(best.key, 'EEEE')} · ${formatDuration(best.seconds)}` : 'No tracked time'} />
        <StatTile label="Best time of day" value={hour !== null ? hourLabel(hour) : '—'} sub={hour !== null ? `Peak hour, ${hourWindow(hour, hour + 1)}` : undefined} />
        <StatTile label="Top category" value={top ? <span className="row"><Dot color={color(top.color)} size={10} />{top.name}</span> : '—'} sub={top ? `${pct(top.seconds, total)}% of the month` : undefined} />
        <StatTile label="Productive days" value={prodDays} sub={`${pct(prodDays, elapsed)}% of days so far`} />
        <StatTile label="Sessions" value={sessions.length} sub={sessions.length ? `avg ${formatDuration(averageSessionSeconds(sessions))}` : undefined} />
      </div>

      <Insight lines={[
        `${monthLabel(start)}: ${formatDuration(total)} tracked on ${prodDays} day${prodDays === 1 ? '' : 's'}.`,
        current && total > 0 && (pace >= target ? `At this pace you'll finish around ${formatDuration(pace, { short: true })} — above target.` : `At this pace you'll land near ${formatDuration(pace, { short: true })}, ${formatDuration(target - pace)} under target.`),
        hour !== null && `Your peak hour is ${hourLabel(hour)}.`,
      ]} />

      <Card title="Daily productive time" sub="Dashed line is your daily target · tap a day to open it" action={<Link className="card-link" to={routes.month(start)}>Month planner</Link>}>
        <BarsChart
          data={data}
          xLabel="Day"
          series={[{ key: 'actual', name: 'Productive time', color: 'var(--accent)' }]}
          target={dailyTarget}
          targetLabel="Daily target"
          summary={`Daily productive time in ${monthLabel(start)}; ${formatDuration(total)} total, best day ${best ? fmt(best.key, 'MMM d') : 'none'}.`}
          onSelect={row => navigate(routes.day(String(row.key)))}
        />
      </Card>

      <div className="grid-2">
        <CategoryCard slices={cats} sub={`${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}`} />
        <Card title="Weekly trend" sub="Hours per week within the month">
          <BarsChart data={weeks} xLabel="Week" size="sm" series={[{ key: 'actual', name: 'Productive time', color: 'var(--accent)' }]} summary={`Weekly totals in ${monthLabel(start)}: ${weeks.map(w => `${w.label} ${formatDuration(w.actual)}`).join(', ')}.`} />
        </Card>
      </div>

      <Card title="When you focus" sub="Weekday × hour of day, this month">
        <WeekHourHeatmap grid={weekdayHourGrid(ws, start, end)} fromHour={ws.settings.day_start_hour} toHour={ws.settings.day_end_hour} />
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// All time

function AllTimeView() {
  const { ws } = useStore()
  const color = useSeriesColor()
  const sessions = ws.sessions
  const total = sumSeconds(sessions)
  const longest = longestSession(sessions)
  const streak = productivityStreak(ws)
  const bm = bestMonth(ws)
  const cats = byCategory(ws, sessions)
  const top = topSlice(cats)
  const goals = byGoal(ws, sessions)
  const first = sessions.reduce((m, s) => (s.date < m ? s.date : m), sessions[0].date)
  const months = monthSeries(ws, 12)
  const weeks = weekSeries(ws, 16)
  const weeklyTarget = ws.settings.target_minutes_week * 60
  const recent = weeks.slice(-4).reduce((n, w) => n + w.seconds, 0) / 4
  const earlier = weeks.slice(-8, -4).reduce((n, w) => n + w.seconds, 0) / 4

  return (
    <div className="an-view">
      <div className="grid-4">
        <StatTile label="Total productive time" icon={<Clock3 size={14} />} value={formatDuration(total)} sub={`since ${fmt(first, 'MMM d, yyyy')}`} />
        <StatTile label="Longest session" value={longest ? formatDuration(longest.duration_seconds) : '—'} sub={longest ? `${longest.category} · ${fmt(longest.date, 'MMM d')}` : undefined} />
        <StatTile label="Longest streak" value={`${streak.longest} day${streak.longest === 1 ? '' : 's'}`} sub={`Current: ${streak.current}`} />
        <StatTile label="Best month" value={bm ? fmt(`${bm.month}-01`, 'MMMM') : '—'} sub={bm ? `${formatDuration(bm.seconds)} · ${bm.month.slice(0, 4)}` : undefined} />
        <StatTile label="Top category" value={top ? <span className="row"><Dot color={color(top.color)} size={10} />{top.name}</span> : '—'} sub={top ? `${pct(top.seconds, total)}% of all time` : undefined} />
        <StatTile label="Sessions" value={sessions.length} sub={`avg ${formatDuration(averageSessionSeconds(sessions))}`} />
        <StatTile label="Productive days" value={productiveDays(ws, first, todayKey())} sub={`of ${daysBetween(first, todayKey()) + 1} since you started`} />
        <StatTile label="Last 4 weeks" value={formatDuration(recent)} sub="average per week" trend={change(recent, earlier)} />
      </div>

      <Insight lines={[
        `You've invested ${formatDuration(total)} across ${sessions.length} sessions.`,
        top && `${top.name} leads with ${pct(top.seconds, total)}% of your time.`,
        change(recent, earlier) !== null && `Your weekly average is ${trendWord(change(recent, earlier))} over the last month compared with the month before.`,
      ]} />

      <div className="grid-2">
        <Card title="Monthly trend" sub="Last 12 months">
          <BarsChart data={months} xLabel="Month" series={[{ key: 'seconds', name: 'Productive time', color: 'var(--accent)' }]} summary={`Productive time per month for the last 12 months; best ${bm ? fmt(`${bm.month}-01`, 'MMMM yyyy') : 'none'}.`} />
        </Card>
        <Card title="Weekly trend" sub="Last 16 weeks · dashed line is your weekly target">
          <TrendChart data={weeks} xLabel="Week" series={[{ key: 'seconds', name: 'Productive time', color: 'var(--accent)', kind: 'area' }]} target={weeklyTarget} targetLabel="Weekly target" summary={`Weekly productive time over 16 weeks; recent average ${formatDuration(recent)} per week against a ${formatDuration(weeklyTarget)} target.`} />
        </Card>
      </div>

      <div className="grid-2">
        <CategoryCard slices={cats} title="Category share" />
        <Card title="Goal share" sub="Time linked to goals">
          {goals.length
            ? <HBars label="Goal share" total={total} items={goals.map(g => ({ key: g.id || g.name, name: g.name, color: color(g.color), seconds: g.seconds, to: g.id && ws.goals.some(x => x.id === g.id) ? routes.goal(g.id) : undefined }))} />
            : <Empty title="No goal time yet" body="Link sessions to goals to see where your effort compounds." />}
          {goals.length > 0 && <p className="muted an-note">{pct(goals.reduce((n, g) => n + g.seconds, 0), total)}% of your time is linked to a goal; bars show share of all time.</p>}
        </Card>
      </div>
    </div>
  )
}
