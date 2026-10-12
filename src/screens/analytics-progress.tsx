import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarCheck2, CheckSquare, Flame, Play, Sparkles, Target, Timer, TrendingUp } from 'lucide-react'
import { fmt, formatDuration, minToClock, rangeKeys, shiftKey, todayKey, toKey, weekStartKey } from '../lib/dates'
import type { DateKey, Workspace } from '../lib/model'
import { routes } from '../lib/routes'
import { activeGoals, change, habitDoneOn } from '../lib/selectors'
import { useStore } from '../lib/store'
import { useEditors } from '../shell/editors'
import { Button, Card, ChartTooltip } from '../ui/kit'
import { GoalRow } from '../ui/widgets'
import { BarsChart, ChartFrame } from './charts'
import './analytics-progress.css'

// "Progress" — the procrastinator-friendly view. It counts every way of showing
// up (focus time, habits, finished tasks, a journal entry), compares you only
// with your own recent past, and looks closely at *starting*, which is where
// procrastination lives.

type DayActivity = { key: DateKey; seconds: number; habits: number; tasks: number; journal: boolean }

/** One pass over the workspace → activity per day for a range. */
function activityByDay(ws: Workspace, from: DateKey, to: DateKey): Map<DateKey, DayActivity> {
  const map = new Map<DateKey, DayActivity>()
  for (const key of rangeKeys(from, to)) map.set(key, { key, seconds: 0, habits: 0, tasks: 0, journal: false })
  for (const s of ws.sessions) { const d = map.get(s.date); if (d) d.seconds += s.duration_seconds }
  const habits = new Map(ws.habits.map(h => [h.id, h]))
  const counted = new Set<string>()
  for (const c of ws.completions) {
    const d = map.get(c.date)
    const h = habits.get(c.habit_id)
    if (!d || !h || counted.has(`${h.id}|${c.date}`) || !habitDoneOn(ws, h, c.date)) continue
    counted.add(`${h.id}|${c.date}`)
    d.habits += 1
  }
  for (const t of ws.tasks) { if (t.done && t.done_at) { const d = map.get(toKey(new Date(t.done_at))); if (d) d.tasks += 1 } }
  for (const j of ws.journal) { const d = map.get(j.date); if (d && (j.body || j.went_well || j.mood)) d.journal = true }
  return map
}

const showedUp = (d: DayActivity) => d.seconds > 0 || d.habits > 0 || d.tasks > 0 || d.journal
/** 0–4 intensity: 30 min of focus ≈ one habit ≈ one task. */
function level(d: DayActivity) {
  const score = d.seconds / 1800 + d.habits + d.tasks + (d.journal ? 1 : 0)
  return score <= 0 ? 0 : score <= 1.5 ? 1 : score <= 3.5 ? 2 : score <= 6 ? 3 : 4
}

function sum(days: DayActivity[]) {
  return days.reduce((a, d) => ({ days: a.days + (showedUp(d) ? 1 : 0), seconds: a.seconds + d.seconds, habits: a.habits + d.habits, tasks: a.tasks + d.tasks }), { days: 0, seconds: 0, habits: 0, tasks: 0 })
}

export function ProgressView() {
  const { ws } = useStore()
  const today = todayKey()
  const weekStart = weekStartKey(today)
  const elapsed = rangeKeys(weekStart, today).length
  const heatFrom = shiftKey(weekStart, -52 * 7) // 53 weeks, like GitHub
  const acts = activityByDay(ws, heatFrom, today)
  const list = [...acts.values()]

  const thisWeek = sum(list.filter(d => d.key >= weekStart))
  const lastWeekFrom = shiftKey(weekStart, -7)
  const lastWeek = sum(list.filter(d => d.key >= lastWeekFrom && d.key <= shiftKey(lastWeekFrom, elapsed - 1)))

  // Show-up streak: consecutive days with any activity; today not done yet doesn't break it.
  let current = 0
  for (let i = list.length - 1; i >= 0; i--) {
    if (showedUp(list[i])) current++
    else if (i === list.length - 1) continue
    else break
  }
  let best = 0, run = 0
  for (const d of list) { run = showedUp(d) ? run + 1 : 0; best = Math.max(best, run) }
  const anything = list.some(showedUp)

  return (
    <div className="pg">
      <Momentum thisWeek={thisWeek} lastWeek={lastWeek} elapsed={elapsed} />
      <ShowUpCalendar acts={list} from={heatFrom} current={current} best={best} anything={anything} />
      <div className="pg-grid">
        <Trends ws={ws} />
        <Starting ws={ws} />
      </div>
      <GoalsProgress />
    </div>
  )
}

// ---------------------------------------------------------------------------

function Momentum({ thisWeek, lastWeek, elapsed }: { thisWeek: ReturnType<typeof sum>; lastWeek: ReturnType<typeof sum>; elapsed: number }) {
  const { ws, startTimer } = useStore()
  const running = ws.settings.active_timer
  const tiles = [
    { icon: CalendarCheck2, label: 'Days you showed up', value: `${thisWeek.days} of ${elapsed}`, now: thisWeek.days, before: lastWeek.days },
    { icon: Timer, label: 'Focus time', value: formatDuration(thisWeek.seconds), now: thisWeek.seconds, before: lastWeek.seconds },
    { icon: Flame, label: 'Habit check-ins', value: String(thisWeek.habits), now: thisWeek.habits, before: lastWeek.habits },
    { icon: CheckSquare, label: 'Tasks finished', value: String(thisWeek.tasks), now: thisWeek.tasks, before: lastWeek.tasks },
  ]
  const zero = !thisWeek.days
  return (
    <Card className="pg-momentum" title="This week so far" sub="Compared with the same days last week — you only race your past self.">
      <div className="pg-tiles">
        {tiles.map(t => {
          const c = change(t.now, t.before)
          return (
            <div className="pg-tile" key={t.label}>
              <span className="pg-tile-label"><t.icon size={14} />{t.label}</span>
              <b className="tabular">{t.value}</b>
              <span className="pg-tile-sub">
                {c === null
                  ? (t.now > 0 ? 'Fresh progress' : 'Nothing yet this week')
                  : c > 0 ? <span className="pg-up">▲ {c}% vs last week</span> : c === 0 ? 'Same as last week' : <span className="muted">▼ {Math.abs(c)}% — still counts</span>}
              </span>
            </div>
          )
        })}
      </div>
      {zero && running && (
        <div className="pg-nudge is-running">
          <span className="pg-live" aria-hidden />
          <span><b>You started — that’s the hardest part.</b> {running.label} is running. Today’s square fills when you stop and save.</span>
          <Link className="btn sm primary" to={routes.timer}>Open timer</Link>
        </div>
      )}
      {zero && !running && (
        <div className="pg-nudge">
          <Sparkles size={16} />
          <span><b>No pressure — start tiny.</b> Five minutes of anything, one habit, or one small task fills today’s square.</span>
          <Button size="sm" variant="primary" icon={<Play size={13} />} onClick={() => startTimer({ label: 'Just 5 minutes', goal_seconds: 300 })}>Just 5 min</Button>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------

const LEVEL_LABEL = ['Nothing logged', 'A little', 'Some', 'A good day', 'A big day']

function ShowUpCalendar({ acts, from, current, best, anything }: { acts: DayActivity[]; from: DateKey; current: number; best: number; anything: boolean }) {
  const today = todayKey()
  const weeks: DayActivity[][] = []
  for (let i = 0; i < acts.length; i += 7) weeks.push(acts.slice(i, i + 7))
  // Label a column when a month begins inside it (GitHub-style); drop the first label if the next one would crowd it.
  const months = weeks.map((w, i) => { const first = w.find(d => d.key.endsWith('-01')); return first ? fmt(first.key, 'MMM') : i === 0 ? fmt(w[0].key, 'MMM') : '' })
  const next = months.findIndex((m, i) => i > 0 && m)
  if (next > 0 && next < 3) months[0] = ''
  const active = acts.filter(showedUp).length
  const byWeekday = Array<number>(7).fill(0)
  acts.forEach((d, i) => { if (showedUp(d)) byWeekday[i % 7]++ })
  const bestDow = byWeekday.indexOf(Math.max(...byWeekday))
  const DOW = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
  const past = acts.filter(d => d.key <= today).length
  return (
    <Card
      className="pg-cal"
      title="Show-up calendar"
      sub={anything ? `${active} of the last ${acts.length} days had some progress` : 'Every square you fill is a day you showed up — any amount counts.'}
      action={<span className="pg-streak"><Flame size={14} /><b className="tabular">{current}</b> day{current === 1 ? '' : 's'} in a row · best {best}</span>}
    >
      <div className="pg-cal-body">
      <div className="pg-cal-left">
      <div className="pg-cal-scroll" ref={el => { if (el) el.scrollLeft = el.scrollWidth }}>
        <div className="pg-cal-grid" style={{ gridTemplateColumns: `28px repeat(${weeks.length}, var(--cell))` }}>
          <span />
          {months.map((m, i) => <span key={i} className="pg-cal-month">{m}</span>)}
          {['Mon', '', 'Wed', '', 'Fri', '', ''].map((d, r) => (
            <div key={r} className="pg-cal-row" style={{ display: 'contents' }}>
              <span className="pg-cal-day">{d}</span>
              {weeks.map((w, c) => {
                const day = w[r]
                if (!day) return <span key={c} />
                if (day.key > today) return <span key={c} />
                const lv = level(day)
                const parts = [day.seconds ? `${formatDuration(day.seconds)} focus` : '', day.habits ? `${day.habits} habit${day.habits === 1 ? '' : 's'}` : '', day.tasks ? `${day.tasks} task${day.tasks === 1 ? '' : 's'}` : '', day.journal ? 'journal' : ''].filter(Boolean)
                const title = `${fmt(day.key, 'EEE, MMM d')} — ${parts.length ? parts.join(' · ') : 'nothing logged'}`
                return <Link key={c} to={routes.day(day.key)} className={`pg-cell l${lv} ${day.key === today ? 'today' : ''}`} title={title} aria-label={title} />
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="pg-cal-legend">
        <span>Since {fmt(from, 'MMM d, yyyy')}</span>
        <span className="pg-cal-scale">
          Less
          {[0, 1, 2, 3, 4].map(l => <i key={l} className={`pg-cell l${l}`} title={LEVEL_LABEL[l]} />)}
          More
        </span>
      </div>
      </div>
      <dl className="pg-cal-stats">
        <div><dt>Active days</dt><dd className="tabular">{active}<small> / {past}</small></dd></div>
        <div><dt>Current run</dt><dd className="tabular">{current}<small> day{current === 1 ? '' : 's'}</small></dd></div>
        <div><dt>Best run</dt><dd className="tabular">{best}<small> day{best === 1 ? '' : 's'}</small></dd></div>
        <div><dt>You show up most on</dt><dd>{anything ? DOW[bestDow] : '—'}</dd></div>
      </dl>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------

/** Small bar chart for counts (habit check-ins, tasks). Values are plain numbers. */
function CountBars({ data, label, color, summary }: { data: Array<{ label: string; full: string; value: number }>; label: string; color: string; summary: string }) {
  const max = Math.max(1, ...data.map(d => d.value))
  const step = max <= 5 ? 1 : max <= 12 ? 2 : Math.ceil(max / 5)
  const ticks = Array.from({ length: Math.floor(max / step) + 2 }, (_, i) => i * step)
  const fullOf = (l: string | number) => data.find(d => d.label === l)?.full ?? String(l)
  return (
    <ChartFrame summary={summary} head={['Week', label]} rows={data.map(d => [d.full, String(d.value)])} size="sm">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 6, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} allowDecimals={false} width={34} />
          <Tooltip content={<ChartTooltip format={v => String(v)} labelFormat={fullOf} />} cursor={{ fill: 'var(--surface-2)' }} />
          <Bar dataKey="value" name={label} fill={color} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

function Trends({ ws }: { ws: Workspace }) {
  const weeks = Array.from({ length: 8 }, (_, i) => shiftKey(weekStartKey(todayKey()), -7 * (7 - i)))
  const acts = activityByDay(ws, weeks[0], todayKey())
  const rows = weeks.map(start => {
    const days = rangeKeys(start, shiftKey(start, 6)).map(k => acts.get(k)).filter((d): d is DayActivity => Boolean(d))
    const s = sum(days)
    return { start, label: fmt(start, 'MMM d'), full: `Week of ${fmt(start, 'MMM d')}`, ...s }
  })
  const any = rows.some(r => r.seconds || r.habits || r.tasks)
  if (!any) {
    return (
      <Card className="pg-trends" title="Your last 8 weeks" sub="Focus time, habits and tasks, week by week.">
        <p className="pg-empty"><TrendingUp size={16} /> Your first bars appear as soon as you track a few minutes, tick a habit or finish a task. Small weeks count — the point is to see the trend.</p>
      </Card>
    )
  }
  const last = rows[rows.length - 1], prev = rows[rows.length - 2]
  const best = rows.reduce((b, r) => (r.seconds > b.seconds ? r : b), rows[0])
  return (
    <Card className="pg-trends" title="Your last 8 weeks" sub={best.seconds ? `Best focus week: ${best.full.replace('Week of ', '')} (${formatDuration(best.seconds)})` : 'Week by week'}>
      <div className="pg-trend-grid">
        <div>
          <h3 className="pg-mini-title"><Timer size={13} /> Focus time</h3>
          <BarsChart size="sm" xLabel="Week" summary={`Focus time per week; this week ${formatDuration(last.seconds)}, last week ${formatDuration(prev.seconds)}`} series={[{ key: 'seconds', name: 'Focus time', color: 'var(--accent)' }]} data={rows.map(r => ({ label: r.label, full: r.full, seconds: r.seconds }))} />
        </div>
        <div>
          <h3 className="pg-mini-title"><Flame size={13} /> Habit check-ins</h3>
          <CountBars label="Habit check-ins" color="var(--good)" summary={`Habit check-ins per week; this week ${last.habits}`} data={rows.map(r => ({ label: r.label, full: r.full, value: r.habits }))} />
        </div>
        <div>
          <h3 className="pg-mini-title"><CheckSquare size={13} /> Tasks finished</h3>
          <CountBars label="Tasks finished" color="var(--ink-2)" summary={`Tasks finished per week; this week ${last.tasks}`} data={rows.map(r => ({ label: r.label, full: r.full, value: r.tasks }))} />
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Starting: the part procrastination is really about.

function Starting({ ws }: { ws: Workspace }) {
  const { open } = useEditors()
  const today = todayKey()
  const from = shiftKey(today, -13)
  const keys = rangeKeys(from, today)

  // First start time per day (minutes after midnight).
  const firstStart = new Map<DateKey, number>()
  for (const s of ws.sessions) {
    if (s.date < from || s.date > today) continue
    const d = new Date(s.started_at)
    const m = d.getHours() * 60 + d.getMinutes()
    if (!firstStart.has(s.date) || m < firstStart.get(s.date)!) firstStart.set(s.date, m)
  }
  const starts = [...firstStart.values()].sort((a, b) => a - b)
  const median = starts.length ? starts[Math.floor(starts.length / 2)] : null
  const data = keys.map(k => ({ label: fmt(k, 'EEE d'), full: fmt(k, 'EEEE, MMM d'), start: firstStart.get(k) ?? null }))

  // Planned focus blocks in the past two weeks: started on time, late, or not started.
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const blocks = ws.blocks.filter(b => b.kind === 'focus' && b.date >= from && (b.date < today || (b.date === today && b.end_min <= nowMin)))
  let onTime = 0, late = 0, missed = 0, delaySum = 0
  for (const b of blocks) {
    const related = ws.sessions.filter(s => s.block_id === b.id || (s.date === b.date && s.category === b.category && (() => { const d = new Date(s.started_at); const m = d.getHours() * 60 + d.getMinutes(); return m >= b.start_min - 15 && m < b.end_min })()))
    if (!related.length) { missed++; continue }
    const first = Math.min(...related.map(s => { const d = new Date(s.started_at); return d.getHours() * 60 + d.getMinutes() }))
    const delay = first - b.start_min
    if (delay <= 10) onTime++
    else { late++; delaySum += delay }
  }
  const total = blocks.length
  const avgDelay = late ? Math.round(delaySum / late) : 0

  const lo = starts.length ? Math.max(0, Math.floor((starts[0] - 30) / 60) * 60) : 6 * 60
  const hi = starts.length ? Math.min(24 * 60, Math.ceil((starts[starts.length - 1] + 30) / 60) * 60) : 12 * 60
  const ticks: number[] = []
  for (let t = lo; t <= hi; t += hi - lo > 6 * 60 ? 120 : 60) ticks.push(t)

  let tip: string
  if (!total && !starts.length) tip = 'Plan one small focus block for tomorrow morning — a time on the calendar makes starting easier.'
  else if (total && missed / total > 0.5) tip = 'Many planned blocks didn’t start. Try shorter blocks (25–30 min) or open with “Just 5 minutes”.'
  else if (late > onTime) tip = `You tend to start about ${avgDelay} min after the plan. Put the block ${Math.min(30, avgDelay)} min later, or begin with 5 minutes.`
  else if (median !== null && median > 13 * 60) tip = 'Your first session usually starts after lunch. A 5-minute warm-up in the morning can shift the whole day.'
  else tip = 'Nice — you usually start when you planned. Keep blocks realistic so it stays that way.'

  return (
    <Card className="pg-start" title="Getting started" sub="When you begin, and how often planned time actually starts — last 14 days.">
      <div className="pg-start-stats">
        <div><span className="pg-tile-label">Typical first start</span><b className="tabular">{median === null ? '—' : minToClock(median)}</b></div>
        <div><span className="pg-tile-label">Blocks started on time</span><b className="tabular">{total ? `${onTime}/${total}` : '—'}</b></div>
        <div><span className="pg-tile-label">Avg. late start</span><b className="tabular">{late ? `${avgDelay} min` : '—'}</b></div>
      </div>

      {starts.length > 0 ? (
        <ChartFrame summary={`First start time per day over the last 14 days; typical start ${median !== null ? minToClock(median) : 'unknown'}`} head={['Day', 'First start']} rows={data.map(d => [d.full, d.start === null ? '—' : minToClock(d.start)])} size="sm">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 8, left: -6, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} interval="preserveStartEnd" minTickGap={14} />
              <YAxis reversed axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} ticks={ticks} domain={[lo, hi]} tickFormatter={v => minToClock(Number(v))} width={48} />
              <Tooltip content={<ChartTooltip format={v => minToClock(v)} labelFormat={l => data.find(d => d.label === l)?.full ?? String(l)} />} cursor={{ stroke: 'var(--line-strong)' }} />
              <Line type="monotone" dataKey="start" name="First start" stroke="var(--accent)" strokeWidth={2} connectNulls dot={{ r: 3, strokeWidth: 0, fill: 'var(--accent)' }} activeDot={{ r: 5, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      ) : (
        <p className="pg-empty"><Timer size={16} /> Start the timer once and this chart shows when your days usually get going.</p>
      )}

      {total > 0 && (
        <div className="pg-split" aria-label={`${onTime} on time, ${late} late, ${missed} not started`}>
          <div className="pg-split-bar">
            {onTime > 0 && <i className="on" style={{ flex: onTime }} />}
            {late > 0 && <i className="late" style={{ flex: late }} />}
            {missed > 0 && <i className="missed" style={{ flex: missed }} />}
          </div>
          <div className="legend">
            <span><i className="pg-key on" />On time {onTime}</span>
            <span><i className="pg-key late" />Late {late}</span>
            <span><i className="pg-key missed" />Not started {missed}</span>
          </div>
        </div>
      )}

      <p className="pg-tip"><Sparkles size={14} /> {tip}</p>
      {!total && <Button size="sm" variant="soft" onClick={() => open({ kind: 'block', defaults: { date: shiftKey(today, 1), start_min: 9 * 60, end_min: 9 * 60 + 30 } })}>Plan a 30-min block for tomorrow</Button>}
    </Card>
  )
}

// ---------------------------------------------------------------------------

function GoalsProgress() {
  const { ws } = useStore()
  const { open } = useEditors()
  const goals = activeGoals(ws)
  return (
    <Card className="pg-goals" title="Goal progress" sub="Every session linked to a goal moves its bar." action={<Link className="card-link" to={routes.goals}>All goals</Link>}>
      {goals.length
        ? <div className="pg-goal-list">{goals.slice(0, 6).map(g => <GoalRow key={g.id} goal={g} />)}</div>
        : <p className="pg-empty"><Target size={16} /> No goals yet. One goal — like “10 hours of study this month” — turns scattered effort into visible progress. <Button size="sm" variant="soft" onClick={() => open({ kind: 'goal' })}>Set a goal</Button></p>}
    </Card>
  )
}
