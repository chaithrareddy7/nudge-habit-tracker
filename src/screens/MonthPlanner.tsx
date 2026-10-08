import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, CalendarDays, Flag, NotebookPen, PieChart as PieIcon, Plus, Target, Timer } from 'lucide-react'
import { addMonths } from 'date-fns'
import { fmt, formatDuration, formatMinutes, fromKey, monthEndKey, monthKeys, monthStartKey, todayKey, toHours, toKey } from '../lib/dates'
import type { DateKey } from '../lib/model'
import { allStreaks, byDay, change, goalsForMonth, monthLabel, monthTargetMinutes, pct, periodSummary, review } from '../lib/selectors'
import { useStore } from '../lib/store'
import { useEditors } from '../shell/editors'
import { Button, Card, ChartTooltip, Dot, Duration, Empty, ProgressBar, Stat, useSeriesColor } from '../ui/kit'
import { GoalRow } from '../ui/widgets'
import { DayLink, MonthGrid, PlanHeader, PlanPage, ReviewPrompts, StatStrip, StripStat, TargetEditor, type Prompt } from './planner-shared'
import { useDateParam, useScrollTo } from './planner-utils'
import './month.css'

const PROMPTS: Prompt[] = [
  { key: 'reflection', label: 'Monthly reflection', placeholder: 'Looking back on the month, how do you feel about it?' },
  { key: 'highlights', label: 'Highlights', placeholder: 'Moments, wins and progress worth remembering.' },
  { key: 'lessons', label: 'Lessons learned', placeholder: 'What did this month teach you about how you work best?' },
  { key: 'next_priorities', label: 'Next month’s priorities', placeholder: 'The two or three things that matter most next month.' },
]

const prevMonthKey = (key: DateKey) => toKey(addMonths(fromKey(monthStartKey(key)), -1))

export default function MonthPlanner() {
  const { ws, saveReview } = useStore()
  const [date, setDate] = useDateParam()
  const [params] = useSearchParams()
  const start = monthStartKey(date)
  const end = monthEndKey(date)
  const today = todayKey()
  const reviewRef = useScrollTo<HTMLDivElement>(params.get('review') === '1', start)

  const sum = periodSummary(ws, start, end)
  const targetMin = monthTargetMinutes(ws, start)
  const percent = pct(sum.seconds, targetMin * 60)
  const isCurrent = start <= today && today <= end
  const days = monthKeys(start).length
  const pace = isCurrent ? Math.round((Number(today.slice(8)) / days) * 100) : null
  const monthReview = review(ws, 'month', start)
  const focus = monthReview?.answers.focus || review(ws, 'month', prevMonthKey(start))?.answers.next_priorities || ''

  const reached = percent >= 100
  const left = days - Number(today.slice(8))
  const paceNote = reached ? 'target reached'
    : pace !== null ? (percent >= pace ? 'on pace' : `${left} day${left === 1 ? '' : 's'} left`)
      : start > today ? 'not started' : sum.seconds > 0 ? `${formatDuration(Math.max(0, targetMin * 60 - sum.seconds), { short: true })} short` : ''

  return (
    <PlanPage className="month-page">
      <PlanHeader
        mode="month"
        value={start}
        onChange={k => setDate(monthStartKey(k))}
        title={monthLabel(start)}
        short={fmt(start, 'MMM yyyy')}
        note={focus ? <>Priorities: <b>{focus}</b></> : null}
        actions={<Button variant="ghost" icon={<NotebookPen size={15} />} onClick={() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Review</Button>}
      />

      <StatStrip label="Month overview">
        <StripStat
          className="is-wide"
          label={<>Productive<span className="plan-strip-aside">{percent}%{paceNote && ` · ${paceNote}`}</span></>}
          icon={<Timer size={12} />}
          value={<>{formatDuration(sum.seconds)}<TargetEditor compact label="Monthly target" step={5} minutes={targetMin} onSave={m => saveReview('month', start, { target_minutes: m })} />{monthReview?.target_minutes != null && <button type="button" className="month-reset" onClick={() => saveReview('month', start, { target_minutes: null })}>reset</button>}</>}
        >
          <ProgressBar value={percent} size="thin" tone={reached ? 'good' : undefined} marker={pace ?? undefined} label="Monthly productivity progress" />
        </StripStat>
        <StripStat label="Active days" icon={<CalendarDays size={12} />} value={`${sum.productiveDays}`} sub={`of ${days} days`} />
        <StripStat label="Daily avg" icon={<BarChart3 size={12} />} value={<Duration seconds={sum.averageDaySeconds} />} sub={isCurrent ? 'so far' : 'per day'} />
        <StripStat label="Habits" icon={<Flag size={12} />} value={sum.habits.due ? `${sum.habits.percent}%` : '—'} sub={sum.habits.due ? `${sum.habits.done}/${sum.habits.due} check-ins` : 'Nothing due yet'} />
        <StripStat label="Journal" icon={<NotebookPen size={12} />} value={sum.journalDays} sub={`day${sum.journalDays === 1 ? '' : 's'} reflected`} />
      </StatStrip>

      <section className="card month-grid-card" aria-label={`${fmt(start, 'MMMM')} at a glance`}>
        <MonthGrid month={start} variant="planner" />
      </section>

      <div className="grid-2">
        <MonthlyGoals start={start} />
        <CategoryBreakdown start={start} end={end} />
      </div>

      <DailyHours start={start} />

      <div ref={reviewRef} className="plan-review-anchor">
        <MonthlyReview start={start} end={end} />
      </div>
    </PlanPage>
  )
}

// ---------------------------------------------------------------------------

function MonthlyGoals({ start }: { start: DateKey }) {
  const { ws } = useStore()
  const { open } = useEditors()
  const goals = goalsForMonth(ws, start).sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'))
  return (
    <Card
      title={<span className="row"><Target size={16} /> Monthly goals</span>}
      sub={`${goals.filter(g => g.status === 'completed').length} of ${goals.length} completed`}
      action={<Button size="sm" variant="soft" icon={<Plus size={14} />} onClick={() => open({ kind: 'goal', defaults: { horizon: 'monthly', start_date: start } })}>New monthly goal</Button>}
    >
      {goals.length
        ? <div className="list">{goals.map(g => <GoalRow key={g.id} goal={g} />)}</div>
        : <Empty icon={<Target size={18} />} title="No goals for this month" body="Pick one or two outcomes that would make this month feel worthwhile." />}
    </Card>
  )
}

function CategoryBreakdown({ start, end }: { start: DateKey; end: DateKey }) {
  const { ws } = useStore()
  const color = useSeriesColor()
  const slices = periodSummary(ws, start, end).categories.filter(s => s.seconds > 0)
  const total = slices.reduce((n, s) => n + s.seconds, 0)
  return (
    <Card title={<span className="row"><PieIcon size={16} /> Where the time went</span>} sub="Tracked time by category this month.">
      {slices.length ? (
        <div className="month-cats">
          <div className="month-donut" role="img" aria-label={`Category breakdown: ${slices.map(s => `${s.name} ${formatDuration(s.seconds)}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="seconds" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={slices.length > 1 ? 2 : 0} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
                  {slices.map(s => <Cell key={s.name} fill={color(s.color)} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="month-donut-center"><b className="tabular">{formatDuration(total, { short: true })}</b><span>total</span></div>
          </div>
          <ul className="month-cat-legend">
            {slices.slice().sort((a, b) => b.seconds - a.seconds).map(s => (
              <li key={s.name}>
                <span className="row" style={{ minWidth: 0 }}><Dot color={color(s.color)} /><span className="month-cat-name">{s.name}</span></span>
                <span className="tabular"><b>{formatDuration(s.seconds)}</b> <span className="muted">{pct(s.seconds, total)}%</span></span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="month-chart-empty"><PieIcon size={15} aria-hidden /> No tracked time yet — start a timer or log a session.</p>
      )}
    </Card>
  )
}

function DailyHours({ start }: { start: DateKey }) {
  const { ws } = useStore()
  const data = byDay(ws, monthKeys(start)).map(d => ({ key: d.key, Productive: d.seconds }))
  const target = ws.settings.target_minutes_day * 60
  const max = Math.max(target, ...data.map(d => d.Productive))
  const any = data.some(d => d.Productive > 0)
  return (
    <Card title={<span className="row"><BarChart3 size={16} /> Daily hours</span>} sub={`Dashed line: ${formatMinutes(ws.settings.target_minutes_day, { short: true })} daily target.`}>
      {any ? (
        <div className="chart-box" role="img" aria-label="Productive hours for each day of the month compared with the daily target">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -18 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} />
              <XAxis dataKey="key" tickLine={false} axisLine={false} tickFormatter={k => fmt(String(k), 'd')} interval="preserveStartEnd" minTickGap={10} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={v => `${toHours(Number(v))}h`} width={48} domain={[0, Math.ceil(max / 3600) * 3600]} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip labelFormat={l => fmt(String(l), 'EEE, MMM d')} />} />
              <ReferenceLine y={target} stroke="var(--ink-3)" strokeDasharray="4 4" ifOverflow="extendDomain" />
              <Bar dataKey="Productive" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="month-chart-empty"><BarChart3 size={15} aria-hidden /> Nothing tracked this month yet.</p>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------

function MonthlyReview({ start, end }: { start: DateKey; end: DateKey }) {
  const { ws } = useStore()
  const color = useSeriesColor()
  const prevStart = prevMonthKey(start)
  const sum = periodSummary(ws, start, end)
  const prev = periodSummary(ws, prevStart, monthEndKey(prevStart))
  const streak = useMemo(() => allStreaks(ws).reduce<{ label: string; longest: number; current: number; unit: string } | null>((best, s) => (!best || s.longest > best.longest ? s : best), null), [ws])
  const prevName = fmt(prevStart, 'MMMM')
  const diff = sum.seconds - prev.seconds

  const lede = !sum.seconds && !prev.seconds ? 'Once you track some time, this review fills itself in.'
    : !prev.seconds ? `${formatDuration(sum.seconds)} of focused work this month.`
      : Math.abs(diff) < 1800 ? `Nearly identical to ${prevName} — consistency is its own kind of progress.`
        : diff > 0 ? `${formatDuration(diff)} more than ${prevName}. That’s real growth.`
          : `${formatDuration(-diff)} less than ${prevName}. Worth noticing what changed — without judgement.`

  return (
    <Card title={<span className="row"><NotebookPen size={16} /> Monthly review</span>} sub={`${monthLabel(start)} · compared with ${prevName}`}>
      <p className="plan-review-lede">{lede}</p>
      <div className="plan-stats">
        <Stat label="Total productive" value={<Duration seconds={sum.seconds} />} trend={change(sum.seconds, prev.seconds)} sub={`vs ${formatDuration(prev.seconds)}`} />
        <Stat label="Daily average" value={<Duration seconds={sum.averageDaySeconds} />} trend={change(sum.averageDaySeconds, prev.averageDaySeconds)} sub={`vs ${formatDuration(prev.averageDaySeconds)}`} />
        <Stat label="Best day" value={sum.bestDay ? <DayLink date={sum.bestDay.key}>{fmt(sum.bestDay.key, 'EEE d')}</DayLink> : '—'} sub={sum.bestDay ? formatDuration(sum.bestDay.seconds) : 'No tracked days yet'} />
        <Stat label="Top category" value={sum.topCategory ? <span className="row"><Dot color={color(sum.topCategory.color)} />{sum.topCategory.name}</span> : '—'} sub={sum.topCategory ? `${formatDuration(sum.topCategory.seconds)} · ${pct(sum.topCategory.seconds, sum.seconds)}%` : 'No sessions yet'} />
        <Stat label="Habits completed" value={sum.habits.due ? `${sum.habits.percent}%` : '—'} sub={sum.habits.due ? `${sum.habits.done}/${sum.habits.due}${prev.habits.due ? ` · ${prevName} ${prev.habits.percent}%` : ''}` : 'No check-ins due'} />
        <Stat label="Goals completed" value={sum.goalsCompleted.length} sub={sum.goalsCompleted.map(g => g.title).slice(0, 2).join(', ') || 'None yet this month'} />
        <Stat label="Longest streak" value={streak && streak.longest ? `${streak.longest} ${streak.unit}${streak.longest === 1 ? '' : 's'}` : '—'} sub={streak && streak.longest ? `${streak.label}${streak.current ? ` · ${streak.current} now` : ''}` : 'Start one today'} />
        <Stat label="Journal days" value={sum.journalDays} trend={change(sum.journalDays, prev.journalDays)} sub={`vs ${prev.journalDays} in ${prevName}`} />
      </div>
      <div className="plan-review-divider" />
      <ReviewPrompts key={start} period="month" start={start} prompts={PROMPTS} />
    </Card>
  )
}
