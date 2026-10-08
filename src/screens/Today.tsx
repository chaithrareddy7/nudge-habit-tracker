import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, Clock, Coffee, MapPin, MoonStar, Pause, Play, Plus, Square, Star } from 'lucide-react'
import { fmt, formatClock, formatDuration, greeting, minToClock, rangeKeys, shiftKey, todayKey } from '../lib/dates'
import { MOODS, type DateKey, type PlannerEvent, type TimeBlock } from '../lib/model'
import { routes } from '../lib/routes'
import {
  activeGoals, activeTimerSeconds, allStreaks, averageSessionSeconds, blockActualSeconds, blockAt, blocksOn, byCategory, categoryColor,
  dayPlan, dayTargetMinutes, eventsOn, goalById, goalProgress, pct, plannedSecondsOn, habitsForDay, productivityStreak, secondsOn, sessionsOn, tasksOn, topSlice,
} from '../lib/selectors'
import { useStore, useTick } from '../lib/store'
import { useEditors } from '../shell/editors'
import { Button, Card, Dot, IconButton, Page, Ring, ScalePick, Stat, useSeriesColor } from '../ui/kit'
import { GettingStarted, GoalRow, HabitChecklist, PlanVsReality, StreakList, TaskChecklist } from '../ui/widgets'
import './today.css'

/** Local text draft that follows the stored value when it changes elsewhere. */
function useDraft(value: string) {
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  if (value !== synced) { setSynced(value); setDraft(value) }
  return [draft, setDraft] as const
}

export default function Today() {
  const { ws } = useStore()
  const { open } = useEditors()
  const today = todayKey()
  const timer = ws.settings.active_timer
  const running = Boolean(timer?.resumed_at)
  // Tick every second while a timer runs, otherwise twice a minute for the "now" line.
  const now = useTick(true, running ? 1000 : 30000)
  const nowDate = new Date(now)
  const minute = nowDate.getHours() * 60 + nowDate.getMinutes()
  const name = ws.settings.display_name.trim().split(' ')[0]
  const focusBlocks = ws.blocks.filter(b => b.date === today && b.kind === 'focus').length
  const hasHabits = habitsForDay(ws, today).length > 0
  const hasTasks = tasksOn(ws, today).length > 0

  return (
    <Page
      className="today"
      eyebrow={fmt(today, 'EEEE · MMMM d')}
      title={<span className="today-title">{greeting(nowDate)}{name ? `, ${name}` : ''}</span>}
      actions={<Link className="btn today-plan-btn" to={routes.day(today)} aria-label="Plan day"><CalendarClock size={15} /><span>Plan day</span></Link>}
    >
      <Hero today={today} now={now} minute={minute} />
      <GettingStarted />

      <div className="today-grid">
        <div className="today-col today-col-main">
          <Card className="today-schedule" title="Today’s schedule" sub={scheduleSub(focusBlocks, plannedSecondsOn(ws, today))}
            action={<IconButton size="sm" bordered label="Add time block" onClick={() => open({ kind: 'block', defaults: { date: today } })}><Plus size={15} /></IconButton>}>
            <Schedule today={today} minute={minute} now={now} />
          </Card>
          <Card className="today-tasks" title="Tasks" action={<IconButton size="sm" bordered label="Add task" onClick={() => open({ kind: 'task', defaults: { date: today } })}><Plus size={15} /></IconButton>}>
            {hasTasks
              ? <TaskChecklist date={today} />
              : <EmptyLine text="Nothing on today’s list yet." action={ws.tasks.some(t => !t.date && !t.done)
                ? <Link className="card-link" to={routes.tasks}>From backlog <ArrowRight size={13} /></Link>
                : <Button size="sm" variant="soft" onClick={() => open({ kind: 'task', defaults: { date: today } })}>Add task</Button>} />}
          </Card>
          <Summary today={today} now={now} />
        </div>

        <div className="today-col today-col-side">
          <Card className="today-habits" title="Habits" action={<Link className="card-link" to={routes.habits}>All habits <ArrowRight size={13} /></Link>}>
            {hasHabits
              ? <HabitChecklist date={today} />
              : <EmptyLine text={ws.habits.length ? 'No habits scheduled for today.' : 'No habits yet.'} action={<Button size="sm" variant="soft" onClick={() => open({ kind: 'habit' })}>New habit</Button>} />}
          </Card>
          <Reflection today={today} evening={nowDate.getHours() >= 18} />
          <GoalsCard />
          <StreaksCard />
          <Upcoming today={today} />
        </div>
      </div>
    </Page>
  )
}

const scheduleSub = (blocks: number, seconds: number) => (blocks ? `${blocks} focus block${blocks === 1 ? '' : 's'} · ${formatDuration(seconds)} planned` : undefined)

/** Compact one-line empty state — keeps a fresh dashboard short. */
function EmptyLine({ text, action }: { text: ReactNode; action?: ReactNode }) {
  return (
    <div className="today-empty">
      <span>{text}</span>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hero: progress ring, main focus, productive time vs target, and the timer.

function Hero({ today, now, minute }: { today: DateKey; now: number; minute: number }) {
  const { ws, setDayPlan } = useStore()
  const live = activeTimerSeconds(ws, now)
  const seconds = secondsOn(ws, today) + live
  const target = dayTargetMinutes(ws, today) * 60
  const percent = pct(seconds, target)
  const remaining = Math.max(0, target - seconds)
  const planned = plannedSecondsOn(ws, today)
  const streak = productivityStreak(ws, today).current
  const [focus, setFocus] = useDraft(dayPlan(ws, today)?.focus || '')
  const saveFocus = () => { const v = focus.trim(); if (v !== (dayPlan(ws, today)?.focus || '')) setDayPlan(today, { focus: v }) }

  let message: string
  if (!target) message = 'No daily target — every minute counts.'
  else if (seconds <= 0) message = 'One focused session is a good start.'
  else if (remaining > 0) message = `${formatDuration(remaining)} to go`
  else message = 'Target reached — rest counts too.'

  return (
    <section className="today-hero" aria-label="Today at a glance">
      <div className="today-hero-main">
        <Ring value={percent} size={92} stroke={8} color={percent >= 100 ? 'var(--good)' : undefined}>
          <div className="today-ring-label">
            <b className="display tabular">{percent}<small>%</small></b>
            <span>of target</span>
          </div>
        </Ring>
        <div className="today-hero-text">
          <label className="today-focus">
            <span className="eyebrow">Main focus</span>
            <input
              value={focus}
              onChange={e => setFocus(e.target.value)}
              onBlur={saveFocus}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              placeholder="What would make today a good day?"
              aria-label="Main focus for today"
            />
          </label>
          <div className="today-progress">
            <span className="today-big tabular">
              {formatDuration(seconds)}
              {target > 0 && <small> / {formatDuration(target, { short: true })}</small>}
            </span>
            <span className="today-progress-msg">{message}</span>
            {planned > 0 && <span className="chip"><Clock size={12} />{formatDuration(planned)} planned</span>}
            {streak > 0 && <span className="chip accent">🔥 {streak}-day streak</span>}
          </div>
        </div>
      </div>
      <TimerPanel today={today} now={now} minute={minute} />
    </section>
  )
}

function TimerPanel({ today, now, minute }: { today: DateKey; now: number; minute: number }) {
  const { ws, startTimer, pauseTimer, resumeTimer, stopTimer } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  const t = ws.settings.active_timer

  if (t) {
    const goal = goalById(ws, t.goal_id)
    return (
      <div className={`today-timer is-live ${t.resumed_at ? '' : 'is-paused'}`}>
        <div className="today-timer-head">
          <span className="eyebrow row"><span className="today-live-dot" aria-hidden />{t.resumed_at ? 'Focusing now' : 'Paused'}</span>
          <Link className="card-link" to={routes.timer}>Open timer <ArrowRight size={13} /></Link>
        </div>
        <div className="today-timer-now">
          <span className="today-timer-clock tabular" aria-live="off">{formatClock(activeTimerSeconds(ws, now))}</span>
          <span className="today-timer-what">
            <b>{t.label}</b>
            <span className="row"><Dot color={color(categoryColor(ws, t.category))} />{t.category}{goal && <> · {goal.title}</>}</span>
          </span>
        </div>
        <div className="row today-timer-actions">
          {t.resumed_at
            ? <Button variant="soft" icon={<Pause size={15} />} onClick={pauseTimer}>Pause</Button>
            : <Button variant="soft" icon={<Play size={15} />} onClick={resumeTimer}>Resume</Button>}
          <Button variant="primary" icon={<Square size={14} />} onClick={stopTimer}>Stop</Button>
        </div>
      </div>
    )
  }

  const current = blockAt(ws, today, minute)
  const next = blocksOn(ws, today).find(b => b.kind === 'focus' && b.start_min > minute)
  return (
    <div className="today-timer">
      <div className="today-timer-head">
        <span className="eyebrow">Focus timer</span>
        {current && <button type="button" className="card-link" onClick={() => open({ kind: 'timer' })}>Something else</button>}
      </div>
      {current ? (
        <div className="today-planned-now">
          <Dot color={color(categoryColor(ws, current.category))} />
          <b>{current.title || current.category}</b>
          <span className="muted tabular">{minToClock(current.start_min)}–{minToClock(current.end_min)}</span>
        </div>
      ) : (
        <p className="today-timer-idle">{next ? <>Next up: <b>{next.title || next.category}</b> at {minToClock(next.start_min)}</> : 'Ready when you are.'}</p>
      )}
      {current
        ? <Button variant="primary" block icon={<Play size={15} />} onClick={() => startTimer({ block_id: current.id })}>Start “{current.title || current.category}”</Button>
        : <Button variant="primary" block icon={<Play size={15} />} onClick={() => open({ kind: 'timer' })}>Start focus</Button>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Schedule: blocks + events in time order with a "now" line.

type Item =
  | { type: 'block'; start: number; end: number; block: TimeBlock }
  | { type: 'event'; start: number; end: number; event: PlannerEvent }
  | { type: 'allday'; event: PlannerEvent }

function Schedule({ today, minute, now }: { today: DateKey; minute: number; now: number }) {
  const { ws, startTimer } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  const timer = ws.settings.active_timer
  const allDay: Item[] = eventsOn(ws, today).filter(e => e.start_min === null).map(event => ({ type: 'allday', event }))
  const timed = [
    ...blocksOn(ws, today).map(block => ({ type: 'block' as const, start: block.start_min, end: block.end_min, block })),
    ...eventsOn(ws, today).filter(e => e.start_min !== null).map(event => ({ type: 'event' as const, start: event.start_min!, end: event.end_min ?? event.start_min! + 30, event })),
  ].sort((a, b) => a.start - b.start || a.end - b.end)

  if (!allDay.length && !timed.length) {
    return <EmptyLine text="An open day — nothing blocked out yet." action={<Link className="btn soft sm" to={routes.day(today)}>Plan today</Link>} />
  }

  const nowIndex = timed.findIndex(i => i.start > minute)
  const nowLine = (
    <div className="today-now" key="now" aria-label={`Now, ${minToClock(minute)}`}>
      <span className="tabular">{minToClock(minute)}</span><i />
    </div>
  )
  const rows: ReactNode[] = []
  allDay.forEach(i => {
    if (i.type !== 'allday') return
    rows.push(
      <button key={i.event.id} className="today-slot is-event" onClick={() => open({ kind: 'event', id: i.event.id })}>
        <span className="today-slot-time muted">All day</span>
        <span className="today-slot-body"><span className="title">{i.event.important && <Star size={12} className="today-star" aria-label="Important" />}{i.event.title}</span></span>
      </button>,
    )
  })
  timed.forEach((i, idx) => {
    if (idx === nowIndex) rows.push(nowLine)
    const state = i.end <= minute ? 'is-past' : i.start <= minute ? 'is-now' : ''
    if (i.type === 'event') {
      const e = i.event
      rows.push(
        <button key={e.id} className={`today-slot is-event ${state}`} onClick={() => open({ kind: 'event', id: e.id })}>
          <span className="today-slot-time tabular">{minToClock(i.start)}<small>{minToClock(i.end)}</small></span>
          <span className="today-slot-body">
            <span className="title">{e.important && <Star size={12} className="today-star" aria-label="Important" />}{e.title}</span>
            {e.location && <span className="meta row"><MapPin size={11} />{e.location}</span>}
          </span>
        </button>,
      )
      return
    }
    const b = i.block
    const isBreak = b.kind === 'break'
    const liveHere = timer?.block_id === b.id ? activeTimerSeconds(ws, now) : 0
    const tracked = blockActualSeconds(ws, b.id) + liveHere
    const plannedSec = (b.end_min - b.start_min) * 60
    const c = color(categoryColor(ws, b.category))
    rows.push(
      <div key={b.id} className={`today-slot ${isBreak ? 'is-break' : 'is-focus'} ${state}`} style={isBreak ? undefined : { '--slot-color': c } as CSSProperties}>
        <span className="today-slot-time tabular">{minToClock(b.start_min)}<small>{minToClock(b.end_min)}</small></span>
        <button className="today-slot-body" onClick={() => open({ kind: 'block', id: b.id })}>
          <span className="title">{isBreak && <Coffee size={12} aria-hidden />} {b.title || (isBreak ? 'Break' : b.category)}</span>
          {!isBreak && (
            <>
              <span className="meta row"><Dot color={c} size={6} />{b.category}{b.goal_id && goalById(ws, b.goal_id) && <> · {goalById(ws, b.goal_id)!.title}</>}</span>
              <span className="today-slot-track">
                <span className="today-slot-bar"><i style={{ width: `${Math.min(100, pct(tracked, plannedSec))}%`, background: c }} /></span>
                <span className="tabular">{formatDuration(tracked)} / {formatDuration(plannedSec)}</span>
              </span>
            </>
          )}
        </button>
        {!isBreak && (
          timer?.block_id === b.id
            ? <span className="chip accent today-slot-live">{timer.resumed_at ? 'Tracking' : 'Paused'}</span>
            : <IconButton size="sm" bordered label={`Start timer for ${b.title || b.category}`} disabled={Boolean(timer)} title={timer ? 'Stop the current timer first' : undefined} onClick={() => startTimer({ block_id: b.id })}><Play size={13} /></IconButton>
        )}
      </div>,
    )
  })
  if (nowIndex === -1 && timed.length) rows.push(nowLine)
  return <div className="today-schedule-list">{rows}</div>
}

// ---------------------------------------------------------------------------
// Check-in — becomes the evening nudge after 18:00 until today has an entry.

function Reflection({ today, evening }: { today: DateKey; evening: boolean }) {
  const { ws, saveJournal } = useStore()
  const entry = ws.journal.find(j => j.date === today)
  const body = entry?.body || ''
  const long = body.includes('\n') || body.length > 140
  const [draft, setDraft] = useDraft(body)
  const [saved, setSaved] = useState(false)
  const reflected = Boolean(entry && (entry.body.trim() || entry.mood))
  const nudge = evening && !reflected
  const save = () => {
    if (draft.trim() === body.trim()) return
    saveJournal(today, { body: draft.trim() })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }
  return (
    <Card
      className={`today-reflect ${nudge ? 'is-nudge' : ''}`}
      title={nudge ? <span className="row today-reflect-title"><MoonStar size={15} aria-hidden />Evening check-in</span> : 'Check in'}
      sub={nudge ? 'Two minutes on how today went — one line helps tomorrow-you.' : 'How are you feeling today?'}
      action={<Link className="card-link" to={routes.journal(today)}>Journal <ArrowRight size={13} /></Link>}
    >
      <div className="stack">
        <ScalePick name="Mood" labels={MOODS} value={entry?.mood ?? null} onChange={mood => saveJournal(today, { mood })} />
        {long ? (
          <Link to={routes.journal(today)} className="today-reflect-excerpt">“{body.split('\n')[0].slice(0, 140)}{body.length > 140 || body.includes('\n') ? '…' : ''}” <span className="card-link">Continue</span></Link>
        ) : (
          <form className="today-reflect-line" onSubmit={e => { e.preventDefault(); save() }}>
            <input className="input" value={draft} onChange={e => setDraft(e.target.value)} onBlur={save} placeholder="How was your day, in a line?" aria-label="How was your day?" />
            <Button type="submit" variant="soft" disabled={draft.trim() === body.trim()}>Save</Button>
          </form>
        )}
        {saved && <span className="today-saved" role="status">Saved to your journal</span>}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Daily summary

function Summary({ today, now }: { today: DateKey; now: number }) {
  const { ws } = useStore()
  const color = useSeriesColor()
  const sessions = sessionsOn(ws, today)
  const best = topSlice(byCategory(ws, sessions))
  const live = activeTimerSeconds(ws, now)
  const link = <Link className="card-link" to={routes.analytics('today')}>Analytics <ArrowRight size={13} /></Link>
  if (!sessions.length && live <= 0) {
    return (
      <Card className="today-summary" title="Today in numbers" action={link}>
        <EmptyLine text="No focus sessions yet — stats appear after your first one." />
      </Card>
    )
  }
  return (
    <Card className="today-summary" title="Today in numbers" action={link}>
      <div className="today-stats">
        <Stat label="Sessions" value={sessions.length} sub={live > 0 ? '+1 in progress' : 'completed'} />
        <Stat label="Avg length" value={sessions.length ? formatDuration(averageSessionSeconds(sessions)) : '—'} />
        <Stat label="Top category" value={best ? <span className="row today-best"><Dot color={color(best.color)} size={9} />{best.name}</span> : '—'} sub={best ? formatDuration(best.seconds) : undefined} />
      </div>
      <div className="today-pvr">
        <span className="eyebrow">Plan vs reality</span>
        <PlanVsReality from={today} to={today} compact />
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Goals, streaks & upcoming

function GoalsCard() {
  const { ws } = useStore()
  const { open } = useEditors()
  const goals = activeGoals(ws)
    .map(g => ({ g, p: goalProgress(ws, g) }))
    // Nearest deadlines first, then weekly momentum.
    .sort((a, b) => (a.g.deadline || '9999').localeCompare(b.g.deadline || '9999') || b.p.weekSeconds - a.p.weekSeconds)
    .slice(0, 4)
  return (
    <Card className="today-goals" title="Active goals" action={<Link className="card-link" to={routes.goals}>All goals <ArrowRight size={13} /></Link>}>
      {goals.length
        ? <div className="today-goal-list">{goals.map(({ g }) => <GoalRow key={g.id} goal={g} />)}</div>
        : <EmptyLine text="No active goals." action={<Button size="sm" variant="soft" onClick={() => open({ kind: 'goal' })}>New goal</Button>} />}
    </Card>
  )
}

function StreaksCard() {
  const { ws } = useStore()
  // Only streaks that are alive — a list of zeros is noise.
  const live = allStreaks(ws).filter(s => s.current > 0).length
  return (
    <Card className="today-streaks" title="Streaks" action={<Link className="card-link" to={routes.insights}>Insights <ArrowRight size={13} /></Link>}>
      {live
        ? <StreakList limit={Math.min(4, live)} />
        : <EmptyLine text="Check off a habit or track focus on consecutive days to start a streak." />}
    </Card>
  )
}

function Upcoming({ today }: { today: DateKey }) {
  const { ws } = useStore()
  const { open } = useEditors()
  const days = rangeKeys(shiftKey(today, 1), shiftKey(today, 7))
    .map(key => ({ key, events: eventsOn(ws, key) }))
    .filter(d => d.events.length)
  const tomorrow = shiftKey(today, 1)
  return (
    <Card className="today-upcoming" title="Coming up" sub={days.length ? 'Next 7 days' : undefined} action={<IconButton size="sm" bordered label="Add event" onClick={() => open({ kind: 'event', defaults: { date: tomorrow } })}><Plus size={15} /></IconButton>}>
      {days.length ? (
        <div className="today-upcoming-list">
          {days.map(d => (
            <div key={d.key} className="today-upcoming-day">
              <Link to={routes.day(d.key)} className="today-upcoming-date">
                <b className="display">{fmt(d.key, 'd')}</b>
                <span>{d.key === tomorrow ? 'Tmrw' : fmt(d.key, 'EEE')}</span>
              </Link>
              <div className="grow list">
                {d.events.map(e => (
                  <button key={e.id} className="list-row today-upcoming-row" onClick={() => open({ kind: 'event', id: e.id })}>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="title">{e.important && <Star size={12} className="today-star" aria-label="Important" />}{e.title}</span>
                      <span className="meta">{e.start_min === null ? 'All day' : minToClock(e.start_min)}{e.location && ` · ${e.location}`}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyLine text="A quiet week — nothing on the calendar." />
      )}
    </Card>
  )
}
