import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, BookOpen, CalendarPlus, Clock, Flame, ListChecks, Target, Timer } from 'lucide-react'
import { fmt, formatDuration, minToClock, nowMin, shiftKey, todayKey, weekKeys, weekStartKey } from '../lib/dates'
import { MOODS, type DateKey } from '../lib/model'
import { routes } from '../lib/routes'
import { blockActualSeconds, blocksOn, categoryColor, dayTargetMinutes, eventsOn, goalById, monthLabel, pct, secondsOn, sessionsOn } from '../lib/selectors'
import { useStore } from '../lib/store'
import { useEditors } from '../shell/editors'
import { Button, Card, Dot, Duration, Empty, ProgressBar, useSeriesColor } from '../ui/kit'
import { GoalRow, HabitChecklist, StreakList, TaskChecklist } from '../ui/widgets'
import { DayLink, MonthGrid, PlanHeader, PlanPage } from './planner-shared'
import { isoToMin, timeRange, useDateParam } from './planner-utils'
import './calendar.css'

type View = 'day' | 'week' | 'month'
const VIEWS: View[] = ['day', 'week', 'month']
const LAYOUTS: Array<{ value: View; label: string }> = [{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'day', label: 'Agenda' }]

export default function CalendarScreen() {
  const [params, setParams] = useSearchParams()
  const [date, setDate] = useDateParam()
  const { open } = useEditors()
  const raw = params.get('view') as View | null
  const view: View = raw && VIEWS.includes(raw) ? raw : 'month'
  const setView = (v: View) => setParams(prev => { const p = new URLSearchParams(prev); p.set('view', v); return p }, { replace: true })

  const ws0 = weekStartKey(date)
  const title = view === 'month' ? monthLabel(date)
    : view === 'week' ? `${fmt(ws0, 'MMM d')} – ${fmt(shiftKey(ws0, 6), 'MMM d, yyyy')}`
      : fmt(date, 'EEEE, MMMM d')
  const short = view === 'month' ? fmt(date, 'MMM yyyy')
    : view === 'week' ? `${fmt(ws0, 'MMM d')} – ${fmt(shiftKey(ws0, 6), 'MMM d')}`
      : fmt(date, 'EEE, MMM d')

  return (
    <PlanPage className="cal-page">
      <PlanHeader
        mode={view}
        value={date}
        onChange={setDate}
        title={title}
        short={short}
        actions={
          <>
            <div className="cal-layout" role="group" aria-label="Calendar layout">
              <span className="cal-layout-label" aria-hidden>Layout</span>
              {LAYOUTS.map(l => (
                <button type="button" key={l.value} aria-pressed={view === l.value} onClick={() => setView(l.value)}>{l.label}</button>
              ))}
            </div>
            <Button variant="primary" icon={<CalendarPlus size={15} />} onClick={() => open({ kind: 'event', defaults: { date } })}>Event</Button>
          </>
        }
      />
      {view === 'month' && (
        <Card className="cal-month-card">
          <MonthGrid month={date} variant="calendar" />
        </Card>
      )}
      {view === 'week' && <WeekGrid date={date} />}
      {view === 'day' && <DayAgenda date={date} />}
    </PlanPage>
  )
}

// ---------------------------------------------------------------------------
// Week view — compact hour grid

const HOUR_PX = 44

type Placed = { id: string; kind: 'block' | 'event'; start: number; end: number; title: string; sub: string; color: string; isBreak?: boolean; important?: boolean; lane: number; lanes: number }

/** Greedy lane assignment so overlapping items sit side by side. */
function layout(items: Array<Omit<Placed, 'lane' | 'lanes'>>): Placed[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const out: Placed[] = []
  let cluster: Placed[] = []
  let laneEnds: number[] = []
  let clusterEnd = -1
  const flush = () => { for (const c of cluster) c.lanes = laneEnds.length; cluster = []; laneEnds = []; clusterEnd = -1 }
  for (const it of sorted) {
    if (cluster.length && it.start >= clusterEnd) flush()
    let lane = laneEnds.findIndex(e => e <= it.start)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.end) } else laneEnds[lane] = it.end
    const placed: Placed = { ...it, lane, lanes: 1 }
    cluster.push(placed)
    out.push(placed)
    clusterEnd = Math.max(clusterEnd, it.end)
  }
  flush()
  return out
}

function useNowMin() {
  const [now, setNow] = useState(nowMin)
  useEffect(() => { const t = window.setInterval(() => setNow(nowMin()), 60_000); return () => window.clearInterval(t) }, [])
  return now
}

function WeekGrid({ date }: { date: DateKey }) {
  const { ws } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  const keys = weekKeys(date)
  const today = todayKey()
  const now = useNowMin()

  // Grid range: settings, stretched to fit anything scheduled outside it.
  const timed = keys.flatMap(k => [
    ...blocksOn(ws, k).map(b => [b.start_min, b.end_min]),
    ...eventsOn(ws, k).filter(e => e.start_min !== null).map(e => [e.start_min!, e.end_min ?? e.start_min! + 30]),
  ])
  const startHour = Math.min(ws.settings.day_start_hour, ...timed.map(([s]) => Math.floor(s / 60)))
  const endHour = Math.min(24, Math.max(ws.settings.day_end_hour, ...timed.map(([, e]) => Math.ceil(e / 60))))
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const top = (min: number) => ((min - startHour * 60) / 60) * HOUR_PX
  const height = hours.length * HOUR_PX

  const onSlot = (e: MouseEvent<HTMLDivElement>, key: DateKey) => {
    if (e.target !== e.currentTarget) return
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    const start = Math.max(0, Math.min(23 * 60 + 30, startHour * 60 + Math.floor((y / HOUR_PX) * 2) * 30))
    open({ kind: 'block', defaults: { date: key, start_min: start, end_min: Math.min(24 * 60, start + 60) } })
  }

  return (
    <Card className="cal-week-card pad-0">
      <div className="cal-week-scroll">
        <div className="cal-week" style={{ '--hour': `${HOUR_PX}px` } as CSSProperties}>
          {/* header */}
          <div className="cal-week-row cal-week-headrow">
            <div className="cal-gutter" />
            {keys.map(k => {
              const s = secondsOn(ws, k)
              return (
                <div key={k} className={`cal-week-dayhead ${k === today ? 'is-today' : ''}`}>
                  <DayLink date={k} className="cal-week-daylink">
                    <span className="cal-week-dayname">{fmt(k, 'EEE')}</span>
                    <span className="cal-week-daynum">{fmt(k, 'd')}</span>
                  </DayLink>
                  <span className="cal-week-dayhours tabular">{s ? formatDuration(s) : ''}</span>
                </div>
              )
            })}
          </div>
          {/* all-day */}
          <div className="cal-week-row cal-week-allday">
            <div className="cal-gutter"><span>All day</span></div>
            {keys.map(k => (
              <div key={k} className="cal-allday-cell">
                {eventsOn(ws, k).filter(e => e.start_min === null).map(e => (
                  <button type="button" key={e.id} className={`cal-allday-item ${e.important ? 'important' : ''}`} onClick={() => open({ kind: 'event', id: e.id })} title={e.title}>{e.title}</button>
                ))}
              </div>
            ))}
          </div>
          {/* hours */}
          <div className="cal-week-row cal-week-body" style={{ height }}>
            <div className="cal-gutter cal-hours-gutter">
              {hours.map(h => <span key={h} style={{ top: (h - startHour) * HOUR_PX }}>{String(h).padStart(2, '0')}:00</span>)}
            </div>
            {keys.map(k => {
              const items = layout([
                ...blocksOn(ws, k).map(b => ({ id: b.id, kind: 'block' as const, start: b.start_min, end: Math.max(b.end_min, b.start_min + 20), title: b.title || b.category, sub: timeRange(b.start_min, b.end_min), color: color(categoryColor(ws, b.category)), isBreak: b.kind === 'break' })),
                ...eventsOn(ws, k).filter(e => e.start_min !== null).map(e => ({ id: e.id, kind: 'event' as const, start: e.start_min!, end: Math.max(e.end_min ?? e.start_min! + 30, e.start_min! + 20), title: e.title, sub: timeRange(e.start_min, e.end_min), color: 'var(--accent)', important: e.important })),
              ])
              const sessions = sessionsOn(ws, k)
              return (
                <div key={k} className={`cal-week-col ${k === today ? 'is-today' : ''}`} onClick={e => onSlot(e, k)} role="group" aria-label={`${fmt(k, 'EEEE')} — click an empty slot to plan a block`}>
                  {items.map(it => (
                    <button
                      type="button"
                      key={it.id}
                      className={`cal-slot-item kind-${it.kind} ${it.isBreak ? 'is-break' : ''} ${it.important ? 'important' : ''}`}
                      style={{ top: top(it.start), height: Math.max(18, top(it.end) - top(it.start) - 2), left: `calc(${(it.lane / it.lanes) * 100}% + 2px)`, width: `calc(${100 / it.lanes}% - 12px)`, '--c': it.color } as CSSProperties}
                      onClick={() => (it.kind === 'block' ? open({ kind: 'block', id: it.id }) : open({ kind: 'event', id: it.id }))}
                      title={`${it.title} · ${it.sub}`}
                    >
                      <span className="cal-slot-title">{it.title}</span>
                      <span className="cal-slot-time tabular">{it.sub}</span>
                    </button>
                  ))}
                  {sessions.map(s => {
                    const start = isoToMin(s.started_at)
                    const wall = Math.max(5, (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
                    const end = Math.min(endHour * 60, start + wall)
                    if (end <= startHour * 60) return null
                    const from = Math.max(start, startHour * 60)
                    return (
                      <button
                        type="button"
                        key={s.id}
                        className="cal-session"
                        style={{ top: top(from), height: Math.max(4, top(end) - top(from)), '--c': color(categoryColor(ws, s.category)) } as CSSProperties}
                        onClick={() => open({ kind: 'session', id: s.id })}
                        aria-label={`Tracked ${formatDuration(s.duration_seconds)} of ${s.category} from ${minToClock(start)}`}
                        title={`Tracked · ${s.label || s.category} · ${formatDuration(s.duration_seconds)}`}
                      />
                    )
                  })}
                  {k === today && now >= startHour * 60 && now <= endHour * 60 && <span className="cal-now" style={{ top: top(now) }} aria-hidden />}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="legend cal-week-legend">
        <span><i className="cal-key-sw block" />Time block</span>
        <span><i className="cal-key-sw event" />Event</span>
        <span><i className="cal-key-sw session" />Tracked session</span>
        <span className="muted">Click an empty slot to plan a block.</span>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Day view — agenda

function DayAgenda({ date }: { date: DateKey }) {
  const { ws } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  const seconds = secondsOn(ws, date)
  const target = dayTargetMinutes(ws, date) * 60
  const events = eventsOn(ws, date)
  const blocks = blocksOn(ws, date)
  const sessions = [...sessionsOn(ws, date)].sort((a, b) => a.started_at.localeCompare(b.started_at))
  const journal = ws.journal.find(j => j.date === date)
  const excerpt = journal ? [journal.body, journal.went_well, journal.highlights, journal.notes].find(t => t.trim()) || '' : ''
  const goalIds = new Set([...sessions.map(s => s.goal_id), ...ws.tasks.filter(t => t.date === date).map(t => t.goal_id), ...blocks.map(b => b.goal_id)].filter((x): x is string => !!x))
  const goals = [...goalIds].map(id => goalById(ws, id)).filter(g => g !== undefined)
  const agenda = [
    ...events.map(e => ({ kind: 'event' as const, start: e.start_min ?? -1, e })),
    ...blocks.map(b => ({ kind: 'block' as const, start: b.start_min, b })),
  ].sort((a, b) => a.start - b.start)
  const isToday = date === todayKey()

  return (
    <div className="cal-day">
      <Card className="cal-day-hero">
        <div className="cal-day-hero-main">
          <div className="cal-day-figure"><span className="eyebrow">{isToday ? 'Productive today' : 'Productive'}</span><b className="tabular">{formatDuration(seconds)}</b><span className="muted tabular">/ {formatDuration(target, { short: true })}</span></div>
          <ProgressBar value={pct(seconds, target)} tone={seconds >= target ? 'good' : undefined} label="Productive time against today's target" />
        </div>
        <Link to={routes.day(date)} className="btn cal-day-open">Open in day planner <ArrowRight size={15} /></Link>
      </Card>

      <div className="cal-day-grid">
        <div className="stack-lg">
          <Card
            title={<span className="row"><Clock size={16} /> Agenda</span>}
            sub="Events and planned time blocks"
            action={<span className="row"><Button size="sm" variant="ghost" onClick={() => open({ kind: 'block', defaults: { date } })}>+ Block</Button><Button size="sm" variant="ghost" onClick={() => open({ kind: 'event', defaults: { date } })}>+ Event</Button></span>}
          >
            {agenda.length ? (
              <div className="list">
                {agenda.map(item => {
                  if (item.kind === 'event') {
                    const e = item.e
                    return (
                      <button type="button" key={e.id} className="list-row cal-agenda-row" onClick={() => open({ kind: 'event', id: e.id })}>
                        <span className="cal-agenda-time tabular">{timeRange(e.start_min, e.end_min)}</span>
                        <span className="cal-agenda-bar event" />
                        <span className="grow cal-agenda-body">
                          <span className="title">{e.title}{e.important && <span className="chip accent cal-agenda-chip">Important</span>}</span>
                          <span className="meta">{e.location || 'Event'}</span>
                        </span>
                      </button>
                    )
                  }
                  const b = item.b
                  const plannedSec = (b.end_min - b.start_min) * 60
                  const tracked = blockActualSeconds(ws, b.id)
                  return (
                    <button type="button" key={b.id} className="list-row cal-agenda-row" onClick={() => open({ kind: 'block', id: b.id })}>
                      <span className="cal-agenda-time tabular">{timeRange(b.start_min, b.end_min)}</span>
                      <span className="cal-agenda-bar" style={{ background: b.kind === 'break' ? 'var(--line-strong)' : color(categoryColor(ws, b.category)) }} />
                      <span className="grow cal-agenda-body">
                        <span className="title">{b.title || b.category}</span>
                        <span className="meta">
                          {b.kind === 'break' ? 'Break' : <>{b.category} · planned {formatDuration(plannedSec)}{tracked > 0 ? ` · tracked ${formatDuration(tracked)}` : ''}</>}
                        </span>
                        {b.kind === 'focus' && tracked > 0 && <span className="cal-agenda-progress"><i style={{ width: `${Math.min(100, pct(tracked, plannedSec))}%` }} /></span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <Empty icon={<Clock size={18} />} title="An open day" body="No events or time blocks yet. Plan a focus block to protect time for what matters." />
            )}
          </Card>
          <Card title={<span className="row"><ListChecks size={16} /> Tasks</span>} action={<Button size="sm" variant="ghost" onClick={() => open({ kind: 'task', defaults: { date } })}>+ Task</Button>}>
            <TaskChecklist date={date} />
          </Card>
          <Card title={<span className="row"><Flame size={16} /> Habits</span>}>
            <HabitChecklist date={date} showStreak={false} />
          </Card>
        </div>

        <div className="stack-lg">
          <Card title={<span className="row"><Timer size={16} /> Tracked sessions</span>} sub={sessions.length ? `${sessions.length} session${sessions.length > 1 ? 's' : ''} · ${formatDuration(seconds)}` : undefined}>
            {sessions.length ? (
              <div className="list">
                {sessions.map(s => (
                  <button type="button" key={s.id} className="list-row cal-agenda-row" onClick={() => open({ kind: 'session', id: s.id })}>
                    <span className="cal-agenda-time tabular">{minToClock(isoToMin(s.started_at))}–{minToClock(isoToMin(s.ended_at))}</span>
                    <Dot color={color(categoryColor(ws, s.category))} />
                    <span className="grow cal-agenda-body">
                      <span className="title">{s.label || s.category}</span>
                      <span className="meta">{s.category}{s.goal_id && goalById(ws, s.goal_id) ? ` · ${goalById(ws, s.goal_id)!.title}` : ''}</span>
                    </span>
                    <b className="tabular"><Duration seconds={s.duration_seconds} /></b>
                  </button>
                ))}
              </div>
            ) : (
              <Empty icon={<Timer size={18} />} title="No time tracked" body={isToday ? 'Start a timer when you begin focused work.' : 'Nothing was tracked on this day.'} action={<Button size="sm" variant="soft" onClick={() => open({ kind: 'session', defaults: { date } })}>Log a session</Button>} />
            )}
          </Card>

          <Card title={<span className="row"><BookOpen size={16} /> Journal</span>} action={<Link to={routes.journal(date)} className="card-link">{journal ? 'Open' : 'Write'} <ArrowRight size={13} /></Link>}>
            {journal ? (
              <div className="cal-journal">
                {journal.mood && <span className="cal-journal-mood" aria-label={`Mood ${journal.mood} of 5`}>{MOODS[journal.mood - 1]}</span>}
                <p>{excerpt ? (excerpt.length > 240 ? `${excerpt.slice(0, 240).trimEnd()}…` : excerpt) : <span className="muted">A reflection was started for this day.</span>}</p>
              </div>
            ) : <p className="muted">No reflection yet. A few lines at the end of the day go a long way.</p>}
          </Card>

          <Card title={<span className="row"><Target size={16} /> Goals touched</span>}>
            {goals.length ? <div className="list">{goals.map(g => <GoalRow key={g.id} goal={g} />)}</div> : <p className="muted">No goal-linked work on this day.</p>}
          </Card>

          <Card title={<span className="row"><Flame size={16} /> Current streaks</span>}>
            <StreakList limit={4} />
          </Card>
        </div>
      </div>
    </div>
  )
}
