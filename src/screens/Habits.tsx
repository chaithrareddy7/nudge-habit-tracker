import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Archive, ArchiveRestore, Bell, CalendarDays, ChevronLeft, Flame, Minus, Pencil, Plus, Target, Trophy } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { addMonths } from 'date-fns'
import { fmt, fromKey, monthEndKey, monthGridKeys, monthStartKey, rangeKeys, shiftKey, todayKey, toKey, weekStartKey } from '../lib/dates'
import type { DateKey, Habit, Workspace } from '../lib/model'
import { routes } from '../lib/routes'
import { habitAmount, habitCompletionRate, habitDoneOn, habitScheduledOn, habitStreak, habitWeekCount } from '../lib/selectors'
import { useStore } from '../lib/store'
import { useEditors } from '../shell/editors'
import { Button, Card, ChartTooltip, DateStepper, Empty, IconButton, Page, Stat, Tabs, useSeriesColor } from '../ui/kit'
import { HabitChecklist } from '../ui/widgets'
import './habits.css'

// ---------------------------------------------------------------------------
// Local helpers

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0]

function frequencyText(h: Habit) {
  const f = h.frequency
  if (f.type === 'daily') return 'Daily'
  if (f.type === 'weekly') return `${f.times}× / week`
  if (f.days.length === 7) return 'Daily'
  if (f.days.length === 5 && [1, 2, 3, 4, 5].every(d => f.days.includes(d))) return 'Weekdays'
  return MON_FIRST.filter(d => f.days.includes(d)).map(d => WEEKDAYS[d]).join(' · ')
}

function targetText(h: Habit) {
  if (h.target_amount > 1) return `${h.target_amount} ${h.unit || 'times'} ${h.frequency.type === 'weekly' ? 'per session' : 'a day'}`
  return 'Check off'
}

/** Stats for archived habits still read their history (selectors skip archived habits). */
const live = (h: Habit): Habit => (h.archived ? { ...h, archived: false } : h)

type CellState = 'future' | 'before' | 'off' | 'done' | 'partial' | 'missed' | 'open'

function cellState(ws: Workspace, h: Habit, key: DateKey, today: DateKey): CellState {
  if (key > today) return 'future'
  const done = habitDoneOn(ws, h, key)
  if (key < h.start_date && !done) return 'before'
  if (!habitScheduledOn(h, key)) return 'off'
  if (done) return 'done'
  if (habitAmount(ws, h.id, key) > 0) return 'partial'
  return key === today ? 'open' : 'missed'
}

const STATE_LABEL: Record<CellState, string> = { future: 'upcoming', before: 'before the habit started', off: 'not scheduled', done: 'done', partial: 'partly done', missed: 'not done', open: 'not done yet' }

const unitOf = (h: Habit) => (h.frequency.type === 'weekly' ? 'week' : 'day')
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// ---------------------------------------------------------------------------

export default function Habits() {
  const { id } = useParams()
  return id ? <HabitDetail id={id} /> : <HabitList />
}

// ---------------------------------------------------------------------------
// List

function HabitList() {
  const { ws } = useStore()
  const { open } = useEditors()
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const today = todayKey()
  const habits = ws.habits.filter(h => h.archived === (tab === 'archived')).sort((a, b) => a.sort - b.sort)
  const archivedCount = ws.habits.filter(h => h.archived).length
  const activeCount = ws.habits.length - archivedCount

  return (
    <Page
      eyebrow="Habits"
      title="Small things, done often"
      subtitle="Every habit shows up automatically in your daily, weekly and monthly planners."
      actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => open({ kind: 'habit' })}>New habit</Button>}
    >
      {activeCount === 0 && tab === 'active' && <HabitTemplates first />}

      {tab === 'active' && activeCount > 0 && (
        <Card title="Today’s check-in" sub={fmt(today, 'EEEE, MMMM d')} action={<Link className="card-link" to={routes.day(today)}>Open day</Link>}>
          <HabitChecklist date={today} />
        </Card>
      )}

      {(ws.habits.length > 0) && (
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'active', label: `Active · ${activeCount}` }, { value: 'archived', label: `Archived · ${archivedCount}` }]} />
      )}

      {habits.length > 0 && (
        <div className="habits-grid">
          {habits.map(h => <HabitCard key={h.id} habit={h} />)}
        </div>
      )}
      {tab === 'archived' && !habits.length && (
        <Card><Empty icon={<Archive size={18} />} title="No archived habits" body="Archive a habit to pause it without losing its history." /></Card>
      )}

      {tab === 'active' && activeCount > 0 && activeCount < 4 && <HabitTemplates />}
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Suggested habits: one click opens the editor prefilled.

type HabitTemplate = { meta: string; defaults: Partial<Habit> & { name: string; icon: string } }

const HABIT_TEMPLATES: HabitTemplate[] = [
  { meta: '8 glasses a day', defaults: { name: 'Drink water', icon: '💧', category: 'Personal', frequency: { type: 'daily' }, target_amount: 8, unit: 'glasses' } },
  { meta: '10 pages a day', defaults: { name: 'Read', icon: '📖', category: 'Learning', frequency: { type: 'daily' }, target_amount: 10, unit: 'pages' } },
  { meta: '3× a week', defaults: { name: 'Work out', icon: '🏃', category: 'Exercise', frequency: { type: 'weekly', times: 3 }, target_amount: 1, unit: '' } },
  { meta: '10 minutes a day', defaults: { name: 'Meditate', icon: '🧘', category: 'Personal', frequency: { type: 'daily' }, target_amount: 10, unit: 'minutes' } },
  { meta: 'Every night', defaults: { name: 'Sleep before 11 PM', icon: '😴', category: 'Personal', frequency: { type: 'daily' }, target_amount: 1, unit: '', reminder_time: '22:30' } },
  { meta: 'Weekdays', defaults: { name: 'Plan tomorrow', icon: '✍️', category: 'Work', frequency: { type: 'custom', days: [1, 2, 3, 4, 5] }, target_amount: 1, unit: '', reminder_time: '20:30' } },
]

function HabitTemplates({ first }: { first?: boolean }) {
  const { ws } = useStore()
  const { open } = useEditors()
  const taken = new Set(ws.habits.map(h => h.name.trim().toLowerCase()))
  const icons = new Set(ws.habits.filter(h => !h.archived).map(h => h.icon))
  const options = HABIT_TEMPLATES.filter(t => !taken.has(t.defaults.name.toLowerCase()) && !icons.has(t.defaults.icon)).slice(0, first ? 6 : 4)
  if (!options.length && !first) return null
  return (
    <section className={`card habits-start ${first ? '' : 'flat'}`} aria-labelledby="habits-start-title">
      <div className="habits-start-head">
        <h2 id="habits-start-title">{first ? 'Start with one small habit' : 'Add another habit'}</h2>
        <p>{first ? 'Pick a suggestion — you can tweak the target, days and reminder before saving.' : 'A few easy wins that pair well with what you have.'}</p>
      </div>
      <div className="habits-templates">
        {options.map(t => (
          <button type="button" key={t.defaults.name} className="habits-template" onClick={() => open({ kind: 'habit', defaults: t.defaults })}>
            <span className="habits-template-icon" aria-hidden>{t.defaults.icon}</span>
            <span className="habits-template-text"><b>{t.defaults.name}</b><small>{t.meta}</small></span>
          </button>
        ))}
        <button type="button" className="habits-template blank" onClick={() => open({ kind: 'habit' })}>
          <span className="habits-template-icon" aria-hidden><Plus size={16} /></span>
          <span className="habits-template-text"><b>Custom habit</b><small>Start from scratch</small></span>
        </button>
      </div>
    </section>
  )
}

function HabitCard({ habit }: { habit: Habit }) {
  const { ws } = useStore()
  const color = useSeriesColor()
  const today = todayKey()
  const h = live(habit)
  const streak = habitStreak(ws, h, today)
  const rate = habitCompletionRate(ws, h, shiftKey(today, -29), today)
  const c = color(habit.color)
  return (
    <article className="card habits-card" style={{ '--habit': c } as React.CSSProperties}>
      <div className="habits-card-head">
        <span className="habits-icon" aria-hidden>{habit.icon}</span>
        <div className="habits-card-titles">
          <Link to={routes.habit(habit.id)} className="habits-card-title">{habit.name}</Link>
          <span className="habits-card-meta">{frequencyText(habit)} · {targetText(habit)}</span>
        </div>
      </div>
      <div className="habits-card-stats">
        <div><span className={`habits-streak ${streak.current ? '' : 'zero'}`}><Flame size={13} />{streak.current}</span><small>streak</small></div>
        <div><b className="tabular">{streak.longest}</b><small>longest</small></div>
        <div><b className="tabular">{rate}%</b><small>30 days</small></div>
      </div>
      <Heatmap habit={habit} />
    </article>
  )
}

/** 12 weeks × 7 days, Monday on top. Click a cell to toggle that day. */
function Heatmap({ habit }: { habit: Habit }) {
  const { ws, toggleHabit } = useStore()
  const today = todayKey()
  const h = live(habit)
  const keys = rangeKeys(shiftKey(weekStartKey(today), -77), shiftKey(weekStartKey(today), 6))
  return (
    <div className="habits-heatmap" role="group" aria-label={`${habit.name}, last 12 weeks`}>
      {keys.map(key => {
        const state = cellState(ws, h, key, today)
        const label = `${fmt(key, 'EEE, MMM d')}: ${STATE_LABEL[state]}`
        if (state === 'future' || state === 'before' || state === 'off') return <span key={key} className={`habits-cell ${state}`} title={label} aria-hidden />
        return <button key={key} type="button" className={`habits-cell ${state}`} title={label} aria-label={`${label}. Toggle`} aria-pressed={state === 'done'} onClick={() => toggleHabit(habit.id, key)} />
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail

function HabitDetail({ id }: { id: string }) {
  const { ws, update } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  const today = todayKey()
  const habit = ws.habits.find(x => x.id === id)

  if (!habit) {
    return (
      <Page title="Habit not found">
        <Card><Empty icon={<Flame size={18} />} title="This habit no longer exists" body="It may have been deleted on another device." action={<Link className="btn soft sm" to={routes.habits}>Back to habits</Link>} /></Card>
      </Page>
    )
  }

  const h = live(habit)
  const c = color(habit.color)
  const streak = habitStreak(ws, h, today)
  const rate = (days: number) => habitCompletionRate(ws, h, shiftKey(today, -(days - 1)), today)
  const goal = habit.goal_id ? ws.goals.find(g => g.id === habit.goal_id) : undefined
  const unit = unitOf(habit)

  return (
    <Page
      className="habits-detail"
      eyebrow={<Link to={routes.habits} className="habits-back"><ChevronLeft size={13} />Habits</Link>}
      title={<span className="habits-title"><span className="habits-icon lg" aria-hidden style={{ '--habit': c } as React.CSSProperties}>{habit.icon}</span>{habit.name}</span>}
      subtitle={`${frequencyText(habit)} · ${targetText(habit)}${habit.archived ? ' · archived' : ''}`}
      actions={<>
        <Button icon={<Pencil size={15} />} onClick={() => open({ kind: 'habit', id: habit.id })}>Edit</Button>
        {habit.archived
          ? <Button variant="ghost" icon={<ArchiveRestore size={15} />} onClick={() => update('habits', habit.id, { archived: false })}>Restore</Button>
          : <Button variant="ghost" icon={<Archive size={15} />} onClick={() => update('habits', habit.id, { archived: true })}>Archive</Button>}
      </>}
    >
      <div className="card habits-stats" style={{ '--habit': c } as React.CSSProperties}>
        <Stat label="Current streak" icon={<Flame size={13} />} value={plural(streak.current, unit)} sub={streak.current > 0 && streak.current >= streak.longest ? 'personal best' : undefined} />
        <Stat label="Longest streak" icon={<Trophy size={13} />} value={plural(streak.longest, unit)} />
        <Stat label="Last 7 days" value={`${rate(7)}%`} />
        <Stat label="Last 30 days" value={`${rate(30)}%`} />
        <Stat label="Last 90 days" value={`${rate(90)}%`} />
      </div>

      <div className="habits-detail-grid">
        <HabitCalendar habit={habit} />
        <div className="stack-lg">
          <Card title="Details">
            <dl className="habits-details">
              <div><dt><Bell size={13} />Reminder</dt><dd>{habit.reminder_time || 'None'}</dd></div>
              <div><dt><CalendarDays size={13} />Started</dt><dd>{fmt(habit.start_date, 'MMM d, yyyy')}</dd></div>
              <div><dt><CalendarDays size={13} />Ends</dt><dd>{habit.end_date ? fmt(habit.end_date, 'MMM d, yyyy') : 'Ongoing'}</dd></div>
              <div><dt><Target size={13} />Goal</dt><dd>{goal ? <Link to={routes.goal(goal.id)}>{goal.title}</Link> : 'Not linked'}</dd></div>
              <div><dt>Category</dt><dd>{habit.category}</dd></div>
            </dl>
            <p className="muted habits-note">
              Appears automatically in your <Link to={routes.day()}>daily</Link>, <Link to={routes.week()}>weekly</Link> and <Link to={routes.month()}>monthly</Link> planners{habit.frequency.type === 'weekly' ? ' until this week’s count is met' : ''}.
            </p>
          </Card>
        </div>
        <WeeklyPerformance habit={habit} />
        <MonthlyPerformance habit={habit} />
      </div>
    </Page>
  )
}

function HabitCalendar({ habit }: { habit: Habit }) {
  const { ws, toggleHabit, setHabitAmount } = useStore()
  const color = useSeriesColor()
  const today = todayKey()
  const [month, setMonth] = useState(today)
  const measurable = habit.target_amount > 1
  const [selected, setSelected] = useState<DateKey | null>(measurable ? today : null)
  const h = live(habit)
  const inMonth = (k: DateKey) => k.slice(0, 7) === month.slice(0, 7)
  // Drop the trailing week when it falls entirely in the next month.
  const grid = monthGridKeys(month)
  const keys = grid.slice(35).some(inMonth) ? grid : grid.slice(0, 35)

  const onDay = (key: DateKey) => {
    if (measurable) setSelected(key)
    else toggleHabit(habit.id, key)
  }
  const amount = selected ? habitAmount(ws, habit.id, selected) : 0

  return (
    <Card
      title="History"
      sub={measurable ? 'Pick a day to adjust the amount' : 'Tap a day to mark it done or undo'}
      action={<DateStepper mode="month" value={month} onChange={k => setMonth(k)} />}
      className="habits-calendar-card"
    >
      <div className="habits-cal-wrap" style={{ '--habit': color(habit.color) } as React.CSSProperties}>
        <div className="habits-calendar">
          {MON_FIRST.map(d => <span key={d} className="habits-cal-head" aria-hidden>{WEEKDAYS[d].slice(0, 2)}</span>)}
          {keys.map(key => {
            if (!inMonth(key)) return <span key={key} className="habits-cal-day outside" aria-hidden />
            const state = cellState(ws, h, key, today)
            const amt = habitAmount(ws, habit.id, key)
            const label = `${fmt(key, 'EEEE, MMM d')}: ${STATE_LABEL[state]}${measurable && amt ? ` (${amt}/${habit.target_amount} ${habit.unit})` : ''}`
            const disabled = state === 'future' || state === 'before'
            return (
              <button
                key={key}
                type="button"
                className={`habits-cal-day ${state} ${key === today ? 'today' : ''} ${selected === key ? 'selected' : ''}`}
                title={label}
                aria-label={label}
                aria-pressed={measurable ? selected === key : state === 'done'}
                disabled={disabled}
                onClick={() => onDay(key)}
              >
                <span>{fmt(key, 'd')}</span>
                {measurable && amt > 0 && state !== 'done' && <small className="tabular">{amt}</small>}
              </button>
            )
          })}
        </div>
        {measurable && selected && (
          <div className="habits-amount">
            <div className="grow">
              <b>{fmt(selected, 'EEE, MMM d')}</b>
              <div className="muted tabular">{amount} / {habit.target_amount} {habit.unit}</div>
            </div>
            <IconButton bordered label={`Less ${habit.unit || ''}`.trim()} onClick={() => setHabitAmount(habit.id, selected, Math.max(0, amount - 1))} disabled={amount <= 0}><Minus size={15} /></IconButton>
            <input
              className="input habits-amount-input tabular"
              type="number"
              min={0}
              value={amount}
              aria-label={`Amount for ${fmt(selected, 'MMM d')}`}
              onChange={e => setHabitAmount(habit.id, selected, Math.max(0, Number(e.target.value) || 0))}
            />
            <IconButton bordered label={`More ${habit.unit || ''}`.trim()} onClick={() => setHabitAmount(habit.id, selected, amount + 1)}><Plus size={15} /></IconButton>
            <Button size="sm" variant={amount >= habit.target_amount ? 'ghost' : 'soft'} onClick={() => toggleHabit(habit.id, selected)}>{amount >= habit.target_amount ? 'Clear' : 'Complete'}</Button>
          </div>
        )}
        <div className="legend habits-legend" aria-hidden>
          <span><i className="habits-key done" />Done</span>
          {measurable && <span><i className="habits-key partial" />Partial</span>}
          <span><i className="habits-key missed" />Missed</span>
          {habit.frequency.type === 'custom' && <span><i className="habits-key off" />Not scheduled</span>}
        </div>
      </div>
    </Card>
  )
}

function WeeklyPerformance({ habit }: { habit: Habit }) {
  const { ws } = useStore()
  const color = useSeriesColor()
  const today = todayKey()
  const h = live(habit)
  const thisWeek = weekStartKey(today)
  const weekly = habit.frequency.type === 'weekly' ? habit.frequency.times : 0
  const data = Array.from({ length: 12 }, (_, i) => {
    const start = shiftKey(thisWeek, (i - 11) * 7)
    const end = shiftKey(start, 6)
    if (weekly) return { key: start, value: habitWeekCount(ws, h, start) }
    return { key: start, value: habitCompletionRate(ws, h, start, end > today ? today : end) }
  })
  return (
    <Card title="Weekly performance" sub={weekly ? `Check-ins per week vs. your ${weekly}× target` : 'Share of scheduled days completed, last 12 weeks'}>
      <div className="chart-box sm">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="key" tickFormatter={k => fmt(String(k), 'MMM d')} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} domain={weekly ? [0, Math.max(7, weekly)] : [0, 100]} tickFormatter={v => (weekly ? String(v) : `${v}%`)} />
            <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={v => (weekly ? `${v} of ${weekly}` : `${v}%`)} labelFormat={l => `Week of ${fmt(String(l), 'MMM d')}`} />} />
            {weekly > 0 && <ReferenceLine y={weekly} stroke="var(--ink-3)" strokeDasharray="4 4" />}
            <Bar dataKey="value" name={weekly ? 'Check-ins' : 'Completed'} fill={color(habit.color)} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function MonthlyPerformance({ habit }: { habit: Habit }) {
  const { ws } = useStore()
  const color = useSeriesColor()
  const today = todayKey()
  const h = live(habit)
  const data = Array.from({ length: 6 }, (_, i) => {
    const start = monthStartKey(toKey(addMonths(fromKey(monthStartKey(today)), i - 5)))
    const end = monthEndKey(start)
    return { key: start, value: end < h.start_date ? 0 : habitCompletionRate(ws, h, start, end > today ? today : end) }
  })
  return (
    <Card title="Monthly performance" sub="Completion rate, last 6 months">
      <div className="chart-box sm">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="key" tickFormatter={k => fmt(String(k), 'MMM')} tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={44} domain={[0, 100]} tickFormatter={v => `${v}%`} />
            <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={v => `${v}%`} labelFormat={l => fmt(String(l), 'MMMM yyyy')} />} />
            <Bar dataKey="value" name="Completed" fill={color(habit.color)} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
