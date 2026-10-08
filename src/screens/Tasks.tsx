import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, CalendarDays, CheckCheck, Inbox, ListTodo, Play, Plus, Search, SlidersHorizontal, Sun, Target, TriangleAlert, X } from 'lucide-react'
import { daysBetween, fmt, formatDuration, shiftKey, todayKey, toKey, weekday } from '../lib/dates'
import type { DateKey, Task } from '../lib/model'
import { routes } from '../lib/routes'
import { categoryColor } from '../lib/selectors'
import { useStore } from '../lib/store'
import { useEditors } from '../shell/editors'
import { Button, Card, Dot, Empty, IconButton, Page, Segmented, Tick, useSeriesColor, useToast } from '../ui/kit'
import './tasks.css'

type View = 'today' | 'upcoming' | 'backlog' | 'overdue' | 'completed'

const UPCOMING_DAYS = 14
const PRIORITY_LABEL = ['Low', 'Normal', 'High', 'Top'] as const

// ---------------------------------------------------------------------------
// Local helpers

const byPriority = (a: Task, b: Task) => b.priority - a.priority || a.sort - b.sort
const nextMonday = (today: DateKey) => shiftKey(today, ((8 - weekday(today)) % 7) || 7)

function inView(t: Task, view: View, today: DateKey) {
  switch (view) {
    case 'today': return t.date === today
    case 'upcoming': return !t.done && !!t.date && t.date > today && t.date <= shiftKey(today, UPCOMING_DAYS)
    case 'backlog': return !t.done && !t.date
    case 'overdue': return !t.done && !!t.date && t.date < today
    case 'completed': return t.done
  }
}

/** The date a quick-added task lands on in each view. */
function naturalDate(view: View, today: DateKey): DateKey | null {
  if (view === 'upcoming') return shiftKey(today, 1)
  if (view === 'backlog') return null
  return today
}

function relativeDay(key: DateKey, today: DateKey) {
  const d = daysBetween(today, key)
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d === -1) return 'Yesterday'
  if (d > 1 && d < 7) return fmt(key, 'EEEE')
  return fmt(key, key.slice(0, 4) === today.slice(0, 4) ? 'MMM d' : 'MMM d, yyyy')
}

/** relativeDay for use mid-sentence: "today", "yesterday", "Sep 12". */
function softDay(key: DateKey, today: DateKey) {
  const r = relativeDay(key, today)
  return Math.abs(daysBetween(today, key)) <= 1 ? r.toLowerCase() : r
}

// ---------------------------------------------------------------------------

export default function Tasks() {
  const { ws, create, update } = useStore()
  const { open } = useEditors()
  const toast = useToast()
  const today = todayKey()
  const [view, setView] = useState<View>('today')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [goalId, setGoalId] = useState('') // '' = any, 'none' = no goal
  const [draft, setDraft] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const q = query.trim().toLowerCase()
  const matches = (t: Task) =>
    (!q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q)) &&
    (!category || t.category === category) &&
    (!goalId || (goalId === 'none' ? !t.goal_id : t.goal_id === goalId))

  const filtered = ws.tasks.filter(matches)
  const inViewList = (v: View) => filtered.filter(t => inView(t, v, today))
  const counts: Record<View, number> = {
    today: inViewList('today').filter(t => !t.done).length,
    upcoming: inViewList('upcoming').length,
    backlog: inViewList('backlog').length,
    overdue: inViewList('overdue').length,
    completed: inViewList('completed').length,
  }
  const overdueAll = ws.tasks.filter(t => inView(t, 'overdue', today))
  const list = inViewList(view)
  const goalsForFilter = ws.goals.filter(g => g.status === 'active' || ws.tasks.some(t => t.goal_id === g.id))

  const defaultCategory = category || (goalId && goalId !== 'none' ? ws.goals.find(g => g.id === goalId)?.category : undefined) || ws.categories[0]?.name || 'Work'
  const quickAdd = () => {
    const title = draft.trim()
    if (!title) return
    const date = naturalDate(view, today)
    create('tasks', {
      title, notes: '', date, done: false, done_at: null, goal_id: goalId && goalId !== 'none' ? goalId : null, category: defaultCategory,
      estimate_minutes: 30, priority: 1, reminder_time: null, sort: ws.tasks.length, created_at: new Date().toISOString(),
    })
    setDraft('')
    toast(date ? `Added for ${softDay(date, today)}` : 'Added to backlog')
  }

  const moveOverdue = () => {
    for (const t of overdueAll) update('tasks', t.id, { date: today })
    toast(`${overdueAll.length} task${overdueAll.length === 1 ? '' : 's'} moved to today`)
  }

  const clearFilters = () => { setQuery(''); setCategory(''); setGoalId('') }
  const filtering = Boolean(q || category || goalId)

  return (
    <Page
      eyebrow="Tasks"
      title="Everything on your plate"
      subtitle="Plan tasks onto days, keep a backlog for later, and start a timer straight from any task."
      actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => open({ kind: 'task', defaults: { date: naturalDate(view, today), ...(category ? { category } : {}), ...(goalId && goalId !== 'none' ? { goal_id: goalId } : {}) } })}>New task</Button>}
    >
      <div className="tasks-toolbar">
        <Segmented
          label="Task view"
          value={view}
          onChange={setView}
          options={([
            ['today', 'Today', <Sun size={13} key="i" />],
            ['upcoming', 'Upcoming', <CalendarDays size={13} key="i" />],
            ['backlog', 'Backlog', <Inbox size={13} key="i" />],
            ['overdue', 'Overdue', <TriangleAlert size={13} key="i" />],
            ['completed', 'Done', <CheckCheck size={13} key="i" />],
          ] as Array<[View, string, ReactNode]>).map(([value, label, icon]) => ({
            value,
            label: <span className={`tasks-seg ${value === 'overdue' && counts.overdue ? 'is-warn' : ''}`}>{icon}{label}<span className="tasks-count">{counts[value]}</span></span>,
          }))}
        />
        <div className={`tasks-filters ${showFilters || category || goalId ? 'open' : ''}`}>
          <label className="tasks-search">
            <Search size={14} aria-hidden />
            <input className="input" type="search" placeholder="Search tasks" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search tasks" />
          </label>
          <button
            type="button"
            className={`icon-btn bordered tasks-filter-toggle ${category || goalId ? 'is-active' : ''}`}
            aria-expanded={showFilters || Boolean(category || goalId)}
            aria-label="Filter by category or goal"
            title="Filters"
            onClick={() => setShowFilters(x => !x)}
          >
            <SlidersHorizontal size={15} />
          </button>
          <select className="select" value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {ws.categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <select className="select" value={goalId} onChange={e => setGoalId(e.target.value)} aria-label="Filter by goal">
            <option value="">All goals</option>
            <option value="none">No goal</option>
            {goalsForFilter.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
          {filtering && <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={clearFilters}>Clear</Button>}
        </div>
      </div>

      {overdueAll.length > 0 && view !== 'completed' && (
        <div className="tasks-banner" role="status">
          <TriangleAlert size={16} aria-hidden />
          <span className="grow">{overdueAll.length} overdue task{overdueAll.length === 1 ? '' : 's'}{view !== 'overdue' && <> — <button className="tasks-link" onClick={() => setView('overdue')}>review</button></>}</span>
          <Button size="sm" onClick={moveOverdue}>Move all to today</Button>
        </div>
      )}

      <Card className="tasks-card">
        {view !== 'completed' && (
          <form className="tasks-quick" onSubmit={e => { e.preventDefault(); quickAdd() }}>
            <Plus size={16} aria-hidden />
            <input
              className="tasks-quick-input"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={view === 'backlog' ? 'Add to backlog… (Enter)' : view === 'upcoming' ? 'Add a task for tomorrow… (Enter)' : 'Add a task for today… (Enter)'}
              aria-label="Quick add task"
            />
            {draft.trim() && <Button size="sm" variant="primary" type="submit">Add</Button>}
          </form>
        )}
        <TaskList view={view} tasks={list} today={today} filtering={filtering} />
      </Card>
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Lists

function TaskList({ view, tasks, today, filtering }: { view: View; tasks: Task[]; today: DateKey; filtering: boolean }) {
  if (!tasks.length) {
    const empty: Record<View, { title: string; body: string }> = {
      today: { title: 'Nothing on today', body: 'Add a task above or pull one in from your backlog.' },
      upcoming: { title: 'Nothing scheduled in the next two weeks', body: 'Give backlog tasks a date to see them here.' },
      backlog: { title: 'Backlog is empty', body: 'Tasks without a date wait here until you schedule them.' },
      overdue: { title: 'Nothing overdue', body: 'You’re all caught up.' },
      completed: { title: 'No completed tasks yet', body: 'Finished tasks collect here.' },
    }
    return <Empty icon={<ListTodo size={18} />} title={filtering ? 'No tasks match these filters' : empty[view].title} body={filtering ? 'Try a different search or clear the filters.' : empty[view].body} />
  }

  if (view === 'upcoming' || view === 'overdue') {
    const groups = new Map<DateKey, Task[]>()
    for (const t of [...tasks].sort((a, b) => (view === 'overdue' ? b.date!.localeCompare(a.date!) : a.date!.localeCompare(b.date!)) || byPriority(a, b))) {
      const list = groups.get(t.date!)
      if (list) list.push(t)
      else groups.set(t.date!, [t])
    }
    return (
      <div className="tasks-groups">
        {[...groups].map(([date, items]) => (
          <section key={date} className="tasks-group">
            <h3 className="tasks-group-head">
              <Link to={routes.day(date)}>{relativeDay(date, today)}</Link>
              <span className="muted">{fmt(date, 'EEE, MMM d')} · {items.length}</span>
            </h3>
            <div className="list">{items.map(t => <TaskRow key={t.id} task={t} today={today} hideDate />)}</div>
          </section>
        ))}
      </div>
    )
  }

  if (view === 'completed') {
    const sorted = [...tasks].sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''))
    const shown = sorted.slice(0, 150)
    return (
      <div className="list">
        {shown.map(t => <TaskRow key={t.id} task={t} today={today} />)}
        {sorted.length > shown.length && <p className="muted tasks-more">Showing the latest {shown.length} of {sorted.length}. Search to find older tasks.</p>}
      </div>
    )
  }

  const sorted = [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || byPriority(a, b))
  return <div className="list">{sorted.map(t => <TaskRow key={t.id} task={t} today={today} hideDate={view === 'today'} />)}</div>
}

function TaskRow({ task: t, today, hideDate }: { task: Task; today: DateKey; hideDate?: boolean }) {
  const { ws, update } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  const goal = t.goal_id ? ws.goals.find(g => g.id === t.goal_id) : undefined
  const overdue = !t.done && !!t.date && t.date < today

  return (
    <div className={`list-row tasks-row ${t.done ? 'is-done' : ''}`}>
      <Tick square checked={t.done} label={`${t.done ? 'Mark not done' : 'Complete'}: ${t.title}`} onChange={() => update('tasks', t.id, { done: !t.done, done_at: t.done ? null : new Date().toISOString() })} />
      <div className="tasks-row-body">
        <button className="tasks-title" onClick={() => open({ kind: 'task', id: t.id })}>
          {t.priority !== 1 && <span className={`tasks-prio p${t.priority}`} title={`${PRIORITY_LABEL[t.priority]} priority`} aria-label={`${PRIORITY_LABEL[t.priority]} priority`}>{t.priority === 3 ? '!!' : t.priority === 2 ? '!' : '↓'}</span>}
          <span className="title">{t.title}</span>
        </button>
        <div className="tasks-meta">
          <span className="row tasks-meta-item"><Dot color={color(categoryColor(ws, t.category))} size={7} />{t.category}</span>
          {goal && <Link className="row tasks-meta-item tasks-goal" to={routes.goal(goal.id)}><Target size={11} />{goal.title}</Link>}
          {t.estimate_minutes > 0 && <span className="tasks-meta-item tabular">{formatDuration(t.estimate_minutes * 60)}</span>}
          {t.done && t.done_at && <span className="tasks-meta-item">done {softDay(toKey(new Date(t.done_at)), today)}</span>}
        </div>
      </div>
      {!t.done && <Reschedule task={t} today={today} overdue={overdue} hideLabel={hideDate} />}
      {t.done && !hideDate && t.date && <span className="tasks-date-static muted">{relativeDay(t.date, today)}</span>}
      {!t.done && (
        <IconButton size="sm" label={`Start timer for ${t.title}`} className="tasks-play" onClick={() => open({ kind: 'timer', defaults: { task_id: t.id, category: t.category, goal_id: t.goal_id, label: t.title } })}>
          <Play size={14} />
        </IconButton>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quick reschedule popover

function Reschedule({ task: t, today, overdue, hideLabel }: { task: Task; today: DateKey; overdue: boolean; hideLabel?: boolean }) {
  const { update } = useStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const move = (date: DateKey | null) => { update('tasks', t.id, { date }); setOpen(false) }
  const label = t.date ? relativeDay(t.date, today) : 'No date'

  return (
    <div className="tasks-resched" ref={ref}>
      <button
        type="button"
        className={`tasks-date ${overdue ? 'is-overdue' : ''} ${hideLabel ? 'icon-only' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Reschedule ${t.title} (currently ${label})`}
        title="Reschedule"
        onClick={() => setOpen(o => !o)}
      >
        <CalendarClock size={13} />
        {!hideLabel && <span>{label}</span>}
      </button>
      {open && (
        <div className="tasks-menu" role="menu">
          <button role="menuitem" onClick={() => move(today)} disabled={t.date === today}><Sun size={14} />Today</button>
          <button role="menuitem" onClick={() => move(shiftKey(today, 1))}><CalendarDays size={14} />Tomorrow <span className="muted">{fmt(shiftKey(today, 1), 'EEE')}</span></button>
          <button role="menuitem" onClick={() => move(nextMonday(today))}><CalendarDays size={14} />Next week <span className="muted">{fmt(nextMonday(today), 'EEE, MMM d')}</span></button>
          <label className="tasks-menu-pick">
            <span>Pick a date</span>
            <input className="input" type="date" value={t.date || ''} onChange={e => e.target.value && move(e.target.value)} />
          </label>
          {t.date && <button role="menuitem" onClick={() => move(null)}><Inbox size={14} />Unschedule</button>}
        </div>
      )}
    </div>
  )
}
