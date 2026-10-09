import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BarChart3, BookHeart, BookOpen, CalendarDays, CalendarRange, CheckSquare, Cloud, CloudOff, Flag, Flame, Home,
  Leaf, ListTodo, Menu, NotebookPen, Pause, Play, Plus, Search, Settings as SettingsIcon, Sparkles, Square, StickyNote, Timer, X,
} from 'lucide-react'
import { formatClock, formatDuration, todayKey } from '../lib/dates'
import { routes } from '../lib/routes'
import { activeTimerSeconds, goalById } from '../lib/selectors'
import { useStore, useTick } from '../lib/store'
import { Button, Field, IconButton, Modal, Stars, useToast } from '../ui/kit'
import { CategorySelect, GoalSelect, useEditors } from './editors'
import { useCelebrations, useReminders, useTimerGoal } from './background'
import { ErrorBoundary } from './ErrorBoundary'
import { PlannerTabs, rememberPlannerView } from './PlannerTabs'
import './shell.css'

type NavItem = { to: string; label: string; icon: typeof Home; match?: string }
const PLAN_NAV: NavItem[] = [
  { to: routes.today, label: 'Today', icon: Home },
  { to: routes.timer, label: 'Focus timer', icon: Timer },
  { to: routes.planner, label: 'Planner', icon: CalendarDays, match: '/plan|/calendar' },
]
const TRACK_NAV: NavItem[] = [
  { to: routes.goals, label: 'Goals', icon: Flag },
  { to: routes.habits, label: 'Habits', icon: Flame },
  { to: routes.tasks, label: 'Tasks', icon: ListTodo },
  { to: routes.journal(), label: 'Journal', icon: BookHeart, match: '/journal' },
]
const REFLECT_NAV: NavItem[] = [
  { to: routes.analytics(), label: 'Analytics', icon: BarChart3, match: '/analytics' },
  { to: routes.insights, label: 'Insights', icon: Sparkles },
  { to: routes.guide, label: 'Guide', icon: BookOpen },
]
// Mobile priority: Today → Timer → Planner → Habits
const TAB_NAV: NavItem[] = [
  { to: routes.today, label: 'Today', icon: Home },
  { to: routes.timer, label: 'Timer', icon: Timer },
  { to: routes.planner, label: 'Planner', icon: CalendarDays, match: '/plan|/calendar' },
  { to: routes.habits, label: 'Habits', icon: Flame },
]

function NavGroup({ label, items, onNavigate }: { label: string; items: NavItem[]; onNavigate: () => void }) {
  const { pathname } = useLocation()
  return (
    <div className="nav-group">
      <div className="nav-label">{label}</div>
      {items.map(({ to, label: text, icon: Icon, match }) => {
        const active = (match || to.split('?')[0]).split('|').some(m => pathname.startsWith(m))
        return (
          <NavLink key={text} to={to} onClick={onNavigate} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
            <Icon size={17} /><span>{text}</span>
          </NavLink>
        )
      })}
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { ws, user, sync, syncError } = useStore()
  const [drawer, setDrawer] = useState(false)
  const [quick, setQuick] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { open } = useEditors()
  useReminders()
  useCelebrations()
  useTimerGoal()

  // Keyboard shortcuts: N quick add, T timer, / search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('.modal-backdrop')) return
      if (e.key === 'n') { e.preventDefault(); setQuick(true) }
      if (e.key === 't') { e.preventDefault(); navigate(routes.timer) }
      if (e.key === '/') { e.preventDefault(); document.getElementById('global-search')?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  // Tab title per screen, e.g. "Week · Nudge".
  useEffect(() => {
    const p = location.pathname
    const name = p.startsWith('/plan/day') ? 'Day' : p.startsWith('/plan/week') ? 'Week' : p.startsWith('/plan/month') ? 'Month' : p.startsWith('/calendar') ? 'Calendar'
      : [...PLAN_NAV, ...TRACK_NAV, ...REFLECT_NAV].find(n => p.startsWith(n.to.split('?')[0]))?.label || (p.startsWith('/search') ? 'Search' : p.startsWith('/settings') ? 'Settings' : '')
    document.title = name ? `${name} · Nudge` : 'Nudge — plan, track, reflect, improve'
  }, [location.pathname])

  const isPlanner = location.pathname.startsWith('/plan/') || location.pathname.startsWith('/calendar')
  useEffect(() => { if (isPlanner) rememberPlannerView(location.pathname) }, [isPlanner, location.pathname])

  const name = ws.settings.display_name || user?.email?.split('@')[0] || 'You'
  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <aside className={`sidebar ${drawer ? 'open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-top">
          <Link to={routes.today} className="brand"><span className="brand-mark"><Leaf size={16} fill="currentColor" /></span>nudge<span className="brand-dot">.</span></Link>
          <IconButton className="drawer-close" label="Close menu" onClick={() => setDrawer(false)}><X size={18} /></IconButton>
        </div>
        <nav className="sidebar-nav">
          <NavGroup label="Plan" items={PLAN_NAV} onNavigate={() => setDrawer(false)} />
          <NavGroup label="Track" items={TRACK_NAV} onNavigate={() => setDrawer(false)} />
          <NavGroup label="Reflect" items={REFLECT_NAV} onNavigate={() => setDrawer(false)} />
        </nav>
        <div className="sidebar-foot">
          <Link to={routes.settings} onClick={() => setDrawer(false)} className={`profile ${location.pathname === routes.settings ? 'active' : ''}`}>
            <span className="avatar">{name[0]?.toUpperCase()}</span>
            <span className="grow" style={{ minWidth: 0 }}>
              <b>{name}</b>
              <small>{user ? (sync === 'error' ? 'Sync paused' : 'Synced') : 'On this device'}</small>
            </span>
            <SettingsIcon size={16} />
          </Link>
        </div>
      </aside>
      {drawer && <button className="scrim" aria-label="Close menu" onClick={() => setDrawer(false)} />}

      <div className="main">
        <header className="topbar">
          <IconButton className="menu-btn" label="Open menu" onClick={() => setDrawer(true)}><Menu size={20} /></IconButton>
          <form className="search" role="search" onSubmit={e => { e.preventDefault(); const q = new FormData(e.currentTarget).get('q'); navigate(routes.search(String(q || ''))) }}>
            <Search size={15} />
            <input id="global-search" name="q" placeholder="Search tasks, goals, journal…" aria-label="Search" key={location.pathname === '/search' ? 'search' : 'other'} defaultValue={location.pathname === '/search' ? new URLSearchParams(location.search).get('q') || '' : ''} />
            <kbd>/</kbd>
          </form>
          <div className="topbar-actions">
            {user && <span className={`sync-dot ${sync}`} title={sync === 'error' ? syncError : sync === 'syncing' ? 'Syncing…' : 'All changes synced'}>{sync === 'error' ? <CloudOff size={16} /> : <Cloud size={16} />}</span>}
            <Button variant="primary" className="quick-btn" icon={<Plus size={16} />} onClick={() => setQuick(true)}>Quick add</Button>
          </div>
        </header>
        {syncError && sync === 'error' && <div className="banner" role="status">{syncError}</div>}
        <main className="content" id="main" tabIndex={-1}>
          {isPlanner && <div className="planner-bar"><PlannerTabs /></div>}
          <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>
        </main>
      </div>

      <TimerDock />
      <StopDialog />
      <button className="fab" aria-label="Quick add" onClick={() => setQuick(true)}><Plus size={24} /></button>
      <QuickAddMenu open={quick} close={() => setQuick(false)} onPick={kind => { setQuick(false); if (kind === 'journal') navigate(routes.journal()); else open({ kind } as Parameters<typeof open>[0]) }} />

      <nav className="tabbar" aria-label="Primary">
        {TAB_NAV.map(({ to, label, icon: Icon, match }) => {
          const active = (match || to).split('|').some(m => location.pathname.startsWith(m))
          return <NavLink key={label} to={to} className={`tab ${active ? 'active' : ''}`}><Icon size={20} /><span>{label}</span></NavLink>
        })}
        <button className="tab" onClick={() => setDrawer(true)}><Menu size={20} /><span>More</span></button>
      </nav>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quick add

const QUICK = [
  { kind: 'timer', label: 'Start timer', icon: Play, hint: 'Track productive time' },
  { kind: 'task', label: 'Task', icon: CheckSquare, hint: 'Something to do' },
  { kind: 'block', label: 'Time block', icon: CalendarDays, hint: 'Plan focus time' },
  { kind: 'event', label: 'Event', icon: CalendarRange, hint: 'Meeting, appointment' },
  { kind: 'habit', label: 'Habit', icon: Flame, hint: 'A recurring ritual' },
  { kind: 'goal', label: 'Goal', icon: Flag, hint: 'Hours or milestones' },
  { kind: 'session', label: 'Log time', icon: Timer, hint: 'Add a past session' },
  { kind: 'journal', label: 'Journal entry', icon: NotebookPen, hint: 'Reflect on today' },
  { kind: 'note', label: 'Note', icon: StickyNote, hint: 'Capture a thought' },
] as const

function QuickAddMenu({ open, close, onPick }: { open: boolean; close: () => void; onPick: (kind: (typeof QUICK)[number]['kind']) => void }) {
  const { ws } = useStore()
  return (
    <Modal open={open} onClose={close} title="Quick add" subtitle="Anything, from anywhere. Press N to open this.">
      <div className="quick-grid">
        {QUICK.filter(q => !(q.kind === 'timer' && ws.settings.active_timer)).map(({ kind, label, icon: Icon, hint }) => (
          <button key={kind} className="quick-item" onClick={() => onPick(kind)}>
            <span className="quick-icon"><Icon size={18} /></span>
            <b>{label}</b>
            <small>{hint}</small>
          </button>
        ))}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Floating live timer (hidden on the timer page itself)

function TimerDock() {
  const { ws, pauseTimer, resumeTimer, stopTimer } = useStore()
  const t = ws.settings.active_timer
  const now = useTick(Boolean(t?.resumed_at))
  const { pathname } = useLocation()
  const show = t && pathname !== routes.timer && pathname !== routes.today
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="timer-dock" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
          <Link to={routes.timer} className="timer-dock-info">
            <span className={`live-dot ${t.resumed_at ? '' : 'paused'}`} />
            <span style={{ minWidth: 0 }}>
              <b className="tabular">{formatClock(activeTimerSeconds(ws, now))}</b>
              <small>{t.label}{goalById(ws, t.goal_id) ? ` · ${goalById(ws, t.goal_id)!.title}` : ''}</small>
            </span>
          </Link>
          {t.resumed_at
            ? <IconButton label="Pause" onClick={pauseTimer}><Pause size={16} /></IconButton>
            : <IconButton label="Resume" onClick={resumeTimer}><Play size={16} /></IconButton>}
          <IconButton label="Stop" onClick={stopTimer}><Square size={15} /></IconButton>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// "How did it go?" — shown whenever any screen stops the timer.

function StopDialog() {
  const { ws, stopDraft, finishTimer, discardTimer, cancelStop } = useStore()
  const toast = useToast()
  const [rating, setRating] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [category, setCategory] = useState('')
  const [goalId, setGoalId] = useState<string | null>(null)
  const draftRef = useRef(stopDraft)
  useEffect(() => {
    if (stopDraft && stopDraft !== draftRef.current) { setRating(null); setNotes(''); setCategory(stopDraft.timer.category); setGoalId(stopDraft.timer.goal_id) }
    draftRef.current = stopDraft
  }, [stopDraft])
  if (!stopDraft) return null
  const tooShort = stopDraft.seconds < 60
  const save = () => {
    const firstToday = !ws.sessions.some(x => x.date === todayKey())
    const s = finishTimer({ rating, notes: notes.trim(), category, goal_id: goalId })
    if (s && firstToday) toast(<>You started today — the hardest part is done. Saved {formatDuration(s.duration_seconds)}.</>, { tone: 'celebrate', ms: 5000 })
    else if (s) toast(<>Saved {formatDuration(s.duration_seconds)} of {s.category}{s.goal_id ? ` toward ${goalById(ws, s.goal_id)?.title}` : ''}</>)
    else toast('Session under a minute — not saved')
  }
  return (
    <Modal open onClose={cancelStop} title="Session complete" subtitle={`${formatDuration(stopDraft.seconds)} · ${stopDraft.timer.label}`} footer={<>
      <Button variant="ghost" onClick={discardTimer}>Discard</Button>
      <span className="spacer" />
      <Button onClick={cancelStop}>Keep going</Button>
      <Button variant="primary" onClick={save}>{tooShort ? 'Close' : 'Save session'}</Button>
    </>}>
      {tooShort && <p className="muted">Sessions shorter than a minute aren’t saved.</p>}
      <Field label="How productive was it?" hint="(optional)"><Stars value={rating} onChange={v => setRating(v === rating ? null : v)} size={28} /></Field>
      <div className="form-row">
        <Field label="Category"><CategorySelect value={category} onChange={setCategory} /></Field>
        <Field label="Goal"><GoalSelect value={goalId} onChange={setGoalId} /></Field>
      </div>
      <Field label="Notes" hint="(optional)"><textarea className="textarea" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What did you get done? What got in the way?" /></Field>
    </Modal>
  )
}
