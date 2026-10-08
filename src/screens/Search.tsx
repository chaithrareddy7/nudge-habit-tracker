import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, BookHeart, CalendarDays, CalendarRange, CheckSquare, Flag, History, Repeat, Search as SearchIcon, Shapes, StickyNote, Timer, X } from 'lucide-react'
import { fmt, formatDuration, fromKey, minToClock, monthEndKey, monthStartKey, rangeKeys, shiftKey, toKey, todayKey, weekStartKey, weekday } from '../lib/dates'
import type { DateKey, Goal, JournalEntry, Workspace } from '../lib/model'
import { routes } from '../lib/routes'
import {
  averageSessionSeconds, categoryColor, change, eventsOn, goalById, goalProgress, goalSessions, monthLabel, periodSummary, secondsIn, secondsOn,
  sessionsOn, sumSeconds, tasksOn,
} from '../lib/selectors'
import { useStore } from '../lib/store'
import { useEditors, type EditorRequest } from '../shell/editors'
import { Button, Card, Dot, Empty, Page, ProgressBar, Stat, useSeriesColor } from '../ui/kit'
import './search.css'

// ---------------------------------------------------------------------------
// Index

type Kind = 'task' | 'goal' | 'habit' | 'journal' | 'session' | 'event' | 'note' | 'category'
type Go = { editor: EditorRequest } | { to: string } | { query: string }
type Doc = { kind: Kind; id: string; title: string; fields: Array<{ label: string; text: string }>; date: DateKey | null; meta: string; color?: string; emoji?: string; go: Go }

const KINDS: Array<{ kind: Kind; label: string; icon: ReactNode }> = [
  { kind: 'task', label: 'Tasks', icon: <CheckSquare size={15} /> },
  { kind: 'goal', label: 'Goals', icon: <Flag size={15} /> },
  { kind: 'habit', label: 'Habits', icon: <Repeat size={15} /> },
  { kind: 'journal', label: 'Journal', icon: <BookHeart size={15} /> },
  { kind: 'session', label: 'Sessions', icon: <Timer size={15} /> },
  { kind: 'event', label: 'Events', icon: <CalendarDays size={15} /> },
  { kind: 'note', label: 'Notes', icon: <StickyNote size={15} /> },
  { kind: 'category', label: 'Categories', icon: <Shapes size={15} /> },
]

const JOURNAL_FIELDS: Array<[keyof JournalEntry, string]> = [
  ['body', 'How was your day'], ['went_well', 'What went well'], ['distractions', 'Distractions'], ['tomorrow_priority', 'Tomorrow'],
  ['highlights', 'Highlights'], ['challenges', 'Challenges'], ['gratitude', 'Gratitude'], ['notes', 'Notes'],
]
const journalText = (j: JournalEntry) => JOURNAL_FIELDS.map(([k]) => String(j[k] || '')).join(' ')
const dayLabel = (k: DateKey) => fmt(k, 'EEE, MMM d, yyyy')

function buildIndex(ws: Workspace): Doc[] {
  const docs: Doc[] = []
  const f = (label: string, text: string | null | undefined) => ({ label, text: text || '' })
  for (const t of ws.tasks) {
    const g = goalById(ws, t.goal_id)
    docs.push({ kind: 'task', id: t.id, title: t.title, fields: [f('Notes', t.notes), f('Category', t.category), f('Goal', g?.title)], date: t.date, meta: `${t.done ? 'Done' : t.date ? dayLabel(t.date) : 'Backlog'} · ${t.category}`, color: categoryColor(ws, t.category), go: { editor: { kind: 'task', id: t.id } } })
  }
  for (const g of ws.goals) {
    docs.push({ kind: 'goal', id: g.id, title: g.title, fields: [f('Description', g.description), f('Category', g.category), f('Parts', g.parts.map(p => p.name).join(', '))], date: g.deadline, meta: `${g.status === 'active' ? 'Active' : g.status === 'completed' ? 'Completed' : 'Archived'} · ${g.category}${g.deadline ? ` · due ${fmt(g.deadline, 'MMM d')}` : ''}`, color: g.color, go: { to: routes.goal(g.id) } })
  }
  for (const h of ws.habits) {
    const freq = h.frequency.type === 'daily' ? 'Daily' : h.frequency.type === 'weekly' ? `${h.frequency.times}× a week` : 'Specific days'
    docs.push({ kind: 'habit', id: h.id, title: h.name, fields: [f('Category', h.category), f('Unit', h.unit)], date: null, meta: `${freq}${h.target_amount > 1 ? ` · ${h.target_amount} ${h.unit}` : ''}${h.archived ? ' · archived' : ''}`, emoji: h.icon, color: h.color, go: { to: routes.habit(h.id) } })
  }
  for (const j of ws.journal) {
    docs.push({ kind: 'journal', id: j.id, title: fmt(j.date, 'EEEE, MMMM d'), fields: JOURNAL_FIELDS.map(([k, label]) => f(label, String(j[k] || ''))), date: j.date, meta: `Journal · ${fmt(j.date, 'yyyy')}`, go: { to: routes.journal(j.date) } })
  }
  for (const s of ws.sessions) {
    const g = goalById(ws, s.goal_id)
    const part = g?.parts.find(p => p.id === s.goal_part_id)
    const task = s.task_id ? ws.tasks.find(t => t.id === s.task_id) : undefined
    const block = s.block_id ? ws.blocks.find(b => b.id === s.block_id) : undefined
    docs.push({ kind: 'session', id: s.id, title: `${s.category}${g ? ` · ${g.title}` : ''}`, fields: [f('Notes', s.notes), f('Part', part?.name), f('Task', task?.title), f('Planned as', block?.title)], date: s.date, meta: `${dayLabel(s.date)} · ${formatDuration(s.duration_seconds)}`, color: categoryColor(ws, s.category), go: { editor: { kind: 'session', id: s.id } } })
  }
  for (const e of ws.events) {
    docs.push({ kind: 'event', id: e.id, title: e.title, fields: [f('Location', e.location), f('Notes', e.notes)], date: e.date, meta: `${dayLabel(e.date)}${e.start_min !== null ? ` · ${minToClock(e.start_min)}` : ' · all day'}${e.location ? ` · ${e.location}` : ''}`, go: { editor: { kind: 'event', id: e.id } } })
  }
  for (const n of ws.notes) {
    docs.push({ kind: 'note', id: n.id, title: n.text.length > 90 ? `${n.text.slice(0, 90)}…` : n.text, fields: [f('Note', n.text)], date: n.date, meta: n.date ? dayLabel(n.date) : 'Inbox', go: { to: n.date ? routes.day(n.date) : routes.today } })
  }
  for (const c of ws.categories) {
    const seconds = sumSeconds(ws.sessions.filter(s => s.category === c.name))
    docs.push({ kind: 'category', id: c.id, title: c.name, fields: [], date: null, meta: seconds ? `${formatDuration(seconds)} tracked` : 'No time tracked yet', color: c.color, go: { query: c.name } })
  }
  return docs
}

type Hit = { doc: Doc; score: number; snippet: { label: string; text: string } | null }

function search(docs: Doc[], q: string, matchDates: boolean): Hit[] {
  const low = q.toLowerCase()
  const tokens = low.split(/\s+/).filter(Boolean)
  if (!tokens.length) return []
  const hits: Hit[] = []
  for (const doc of docs) {
    const title = doc.title.toLowerCase()
    const hay = `${title} ${doc.fields.map(x => x.text.toLowerCase()).join(' ')} ${matchDates ? doc.date || '' : ''}`
    if (!tokens.every(t => hay.includes(t))) continue
    const score = title === low ? 4 : title.includes(low) ? 3 : tokens.every(t => title.includes(t)) ? 2 : 1
    const field = tokens.every(t => title.includes(t)) ? null : doc.fields.find(x => tokens.some(t => x.text.toLowerCase().includes(t)))
    hits.push({ doc, score, snippet: field ? { label: field.label, text: excerpt(field.text, tokens) } : null })
  }
  return hits.sort((a, b) => b.score - a.score || (b.doc.date || '').localeCompare(a.doc.date || ''))
}

function excerpt(text: string, tokens: string[], room = 60) {
  const low = text.toLowerCase()
  const at = Math.max(0, Math.min(...tokens.map(t => { const i = low.indexOf(t); return i < 0 ? Infinity : i })))
  if (!Number.isFinite(at) || text.length <= room * 2) return text
  const start = Math.max(0, at - room)
  const end = Math.min(text.length, at + room)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function Hl({ text, tokens }: { text: string; tokens: string[] }) {
  if (!tokens.length) return <>{text}</>
  const parts = text.split(new RegExp(`(${tokens.map(escapeRe).join('|')})`, 'gi'))
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="search-mark">{p}</mark> : p))}</>
}

// ---------------------------------------------------------------------------
// Dates and periods

type Period = { from: DateKey; to: DateKey; label: string; unit: 'day' | 'week' | 'month' | 'year' }
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const dayP = (key: DateKey): Period => ({ from: key, to: key, label: fmt(key, 'EEEE, MMMM d, yyyy'), unit: 'day' })
const weekP = (key: DateKey, label?: string): Period => { const s = weekStartKey(key); return { from: s, to: shiftKey(s, 6), label: label || `Week of ${fmt(s, 'MMM d, yyyy')}`, unit: 'week' } }
const monthP = (key: DateKey): Period => ({ from: monthStartKey(key), to: monthEndKey(key), label: monthLabel(key), unit: 'month' })
const yearP = (y: number): Period => ({ from: `${y}-01-01`, to: `${y}-12-31`, label: String(y), unit: 'year' })
const monthOf = (w: string) => (w.length >= 3 ? MONTHS.findIndex(m => m.startsWith(w)) : -1)

function validDay(y: number, m: number, d: number) {
  const date = new Date(y, m, d)
  return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d ? dayP(toKey(date)) : null
}

/** Recognises "today", "last month", "September", "sep 2026", "2026-09-28", "Sep 28", "28 sep", "monday", "2025". */
function parsePeriod(input: string, today: DateKey): Period | null {
  const q = input.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  if (!q) return null
  const Y = Number(today.slice(0, 4))
  const M = Number(today.slice(5, 7)) - 1
  const lastMonth = monthStartKey(shiftKey(monthStartKey(today), -1))
  const fixed: Record<string, () => Period> = {
    today: () => dayP(today),
    yesterday: () => dayP(shiftKey(today, -1)),
    tomorrow: () => dayP(shiftKey(today, 1)),
    'this week': () => weekP(today, 'This week'),
    'last week': () => weekP(shiftKey(today, -7), 'Last week'),
    'next week': () => weekP(shiftKey(today, 7), 'Next week'),
    'this month': () => monthP(today),
    'last month': () => monthP(lastMonth),
    'this year': () => yearP(Y),
    'last year': () => yearP(Y - 1),
  }
  if (fixed[q]) return fixed[q]()
  let m = q.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return validDay(+m[1], +m[2] - 1, +m[3])
  m = q.match(/^(\d{4})-(\d{1,2})$/)
  if (m && +m[2] >= 1 && +m[2] <= 12) return monthP(`${m[1]}-${m[2].padStart(2, '0')}-01`)
  m = q.match(/^(\d{4})$/)
  if (m && +m[1] >= 1990 && +m[1] <= 2100) return yearP(+m[1])
  m = q.match(/^([a-z]+)(?: (\d{4}))?$/)
  if (m) {
    const dayIdx = DAYS.findIndex(d => d === m![1] || (m![1].length === 3 && d.startsWith(m![1])))
    if (dayIdx >= 0 && !m[2] && monthOf(m[1]) < 0) return dayP(shiftKey(today, -((weekday(today) - dayIdx + 7) % 7)))
    const mo = monthOf(m[1])
    if (mo >= 0) { const y = m[2] ? +m[2] : mo <= M ? Y : Y - 1; return monthP(`${y}-${String(mo + 1).padStart(2, '0')}-01`) }
    return null
  }
  m = q.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/)
  if (m && monthOf(m[1]) >= 0) return validDay(m[3] ? +m[3] : Y, monthOf(m[1]), +m[2])
  m = q.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)(?: (\d{4}))?$/)
  if (m && monthOf(m[2]) >= 0) return validDay(m[3] ? +m[3] : Y, monthOf(m[2]), +m[1])
  return null
}

// ---------------------------------------------------------------------------
// Recent searches (per device)

const RECENT_KEY = 'nudge-recent-searches'
function loadRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 8) : []
  } catch {
    return []
  }
}
function storeRecent(list: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)) } catch { /* storage unavailable — recent searches just won't persist */ }
}

// ---------------------------------------------------------------------------
// Screen

export default function SearchScreen() {
  const { ws } = useStore()
  const { open } = useEditors()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') || '').trim()

  // Local input, debounced into ?q. External changes (the top-bar search) flow back in.
  const [text, setText] = useState(q)
  const [seenQ, setSeenQ] = useState(q)
  const [filter, setFilter] = useState<Kind | 'all'>('all')
  const [expanded, setExpanded] = useState<Kind[]>([])
  if (q !== seenQ) {
    setSeenQ(q)
    setFilter('all')
    setExpanded([])
    if (q !== text.trim()) setText(q)
  }
  useEffect(() => {
    const v = text.trim()
    if (v === q) return
    const t = window.setTimeout(() => setParams(prev => { const n = new URLSearchParams(prev); if (v) n.set('q', v); else n.delete('q'); return n }, { replace: true }), 250)
    return () => window.clearTimeout(t)
  }, [text, q, setParams])

  const [recent, setRecent] = useState(loadRecent)
  useEffect(() => {
    if (q.length < 2) return
    const t = window.setTimeout(() => setRecent(r => { const next = [q, ...r.filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 8); storeRecent(next); return next }), 1200)
    return () => window.clearTimeout(t)
  }, [q])

  const docs = useMemo(() => buildIndex(ws), [ws])
  const today = todayKey()
  const period = parsePeriod(q, today)
  // A recognised period gets its own summary, so ISO dates don't flood the text results.
  const isPeriod = period !== null
  const hits = useMemo(() => search(docs, q, !isPeriod), [docs, q, isPeriod])
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean)
  const low = q.toLowerCase()
  const category = low.length >= 3 ? ws.categories.find(c => c.name.toLowerCase() === low) || ws.categories.find(c => c.name.toLowerCase().startsWith(low)) : undefined
  const goal = !category && low.length >= 3 ? ws.goals.find(g => g.title.toLowerCase() === low) || ws.goals.find(g => g.title.toLowerCase().includes(low)) : undefined

  const groups = KINDS.map(k => ({ ...k, hits: hits.filter(h => h.doc.kind === k.kind) })).filter(g => g.hits.length)
  const active = filter !== 'all' && groups.some(g => g.kind === filter) ? filter : 'all'
  const shown = active === 'all' ? groups : groups.filter(g => g.kind === active)

  const runQuery = (v: string) => { setText(v); setParams({ q: v }, { replace: true }) }
  const go = (g: Go) => {
    if ('editor' in g) open(g.editor)
    else if ('to' in g) navigate(g.to)
    else runQuery(g.query)
  }

  const suggestions = [
    'today', 'this week', 'last week', fmt(today, 'MMMM'),
    ...ws.categories.filter(c => ws.sessions.some(s => s.category === c.name)).map(c => c.name).slice(0, 5),
    ...ws.goals.filter(g => g.status === 'active').map(g => g.title).slice(0, 4),
  ]

  return (
    <Page className="search-page" eyebrow="Search" title={q ? <>Results for <span className="search-q">“{q}”</span></> : 'Find anything'} subtitle={q ? (hits.length ? `${hits.length} match${hits.length === 1 ? '' : 'es'}${period ? ` · plus a summary of ${period.label}` : ''}` : period ? `Everything from ${period.label}` : 'No matches') : 'Tasks, goals, habits, journal entries, sessions, events, notes — or a date like “September” or “last week”.'}>
      <form className="search-box" role="search" onSubmit={e => { e.preventDefault(); runQuery(text.trim()) }}>
        <SearchIcon size={20} aria-hidden />
        <input type="search" className="search-input" value={text} onChange={e => setText(e.target.value)} placeholder="Search everything…" aria-label="Search" enterKeyHint="search" autoComplete="off" />
        {text && <button type="button" className="icon-btn sm" aria-label="Clear search" onClick={() => runQuery('')}><X size={16} /></button>}
      </form>

      {!q ? (
        <Card className="search-start">
          {recent.length > 0 && (
            <div className="search-section">
              <div className="row-between">
                <span className="eyebrow row"><History size={13} /> Recent</span>
                <Button size="sm" variant="ghost" onClick={() => { setRecent([]); storeRecent([]) }}>Clear</Button>
              </div>
              <div className="row wrap search-chips">{recent.map(r => <button type="button" key={r} className="chip chip-choice" onClick={() => runQuery(r)}>{r}</button>)}</div>
            </div>
          )}
          <div className="search-section">
            <span className="eyebrow">Try searching for</span>
            <div className="row wrap search-chips">{[...new Set(suggestions)].map(s => <button type="button" key={s} className="chip chip-choice" onClick={() => runQuery(s)}>{s}</button>)}</div>
          </div>
          <p className="muted search-tip">
            Searches tasks, goals, habits, journal entries, sessions, events, notes and categories. Dates work too: “Sep 28”, “last month”, “monday”.
            <span className="search-kbd-tip"> Press <kbd>/</kbd> anywhere to search.</span>
          </p>
        </Card>
      ) : (
        <>
          {period && <PeriodCard period={period} />}
          {category && <CategoryCard name={category.name} />}
          {goal && <GoalCard goal={goal} />}

          {groups.length > 0 && (
            <div className="row wrap search-filter" role="group" aria-label="Filter results by type">
              <button type="button" className="chip chip-choice" aria-pressed={active === 'all'} onClick={() => setFilter('all')}>All <span className="search-count">{hits.length}</span></button>
              {groups.map(g => <button type="button" key={g.kind} className="chip chip-choice" aria-pressed={active === g.kind} onClick={() => setFilter(g.kind)}>{g.label} <span className="search-count">{g.hits.length}</span></button>)}
            </div>
          )}

          {shown.map(g => {
            const all = active !== 'all' || expanded.includes(g.kind)
            const list = all ? g.hits : g.hits.slice(0, 6)
            return (
              <Card key={g.kind} className="search-group" title={<span className="row">{g.icon} {g.label}</span>} sub={`${g.hits.length} result${g.hits.length === 1 ? '' : 's'}`}>
                <div className="list">
                  {list.map(h => <ResultRow key={h.doc.id} hit={h} tokens={tokens} onGo={() => go(h.doc.go)} />)}
                </div>
                {!all && g.hits.length > 6 && <button type="button" className="card-link search-more" onClick={() => setExpanded(e => [...e, g.kind])}>Show all {g.hits.length}</button>}
              </Card>
            )
          })}

          {!hits.length && !period && !category && !goal && (
            <Empty icon={<SearchIcon size={18} />} title={`Nothing matches “${q}”`} body="Try a shorter word, a category name, or a date such as “last week”." />
          )}
        </>
      )}
    </Page>
  )
}

function ResultRow({ hit, tokens, onGo }: { hit: Hit; tokens: string[]; onGo: () => void }) {
  const color = useSeriesColor()
  const d = hit.doc
  return (
    <button type="button" className="list-row search-row" onClick={onGo}>
      <span className="search-row-mark" aria-hidden>{d.emoji ? d.emoji : d.color ? <Dot color={color(d.color)} size={10} /> : KINDS.find(k => k.kind === d.kind)?.icon}</span>
      <span className="grow search-row-body">
        <span className="title"><Hl text={d.title} tokens={tokens} /></span>
        {hit.snippet && <span className="search-snippet"><em>{hit.snippet.label}:</em> <Hl text={hit.snippet.text} tokens={tokens} /></span>}
        <span className="meta">{d.meta}</span>
      </span>
      <ArrowRight size={15} className="search-row-go" aria-hidden />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Summary cards

function PeriodCard({ period }: { period: Period }) {
  const { ws } = useStore()
  const color = useSeriesColor()
  const s = periodSummary(ws, period.from, period.to)
  const analyticsTab = period.unit === 'day' ? 'today' : period.unit === 'year' ? 'all' : period.unit
  const links: Array<{ to: string; label: string }> =
    period.unit === 'day' ? [{ to: routes.day(period.from), label: 'Open day' }, { to: routes.journal(period.from), label: 'Journal' }]
      : period.unit === 'week' ? [{ to: routes.week(period.from), label: 'Week planner' }, { to: routes.analytics('week', period.from), label: 'Week analytics' }]
        : period.unit === 'month' ? [{ to: routes.month(period.from), label: 'Month planner' }, { to: routes.analytics('month', period.from), label: 'Month analytics' }]
          : [{ to: routes.analytics(analyticsTab), label: 'All-time analytics' }]
  return (
    <Card className="search-summary" title={<span className="row"><CalendarRange size={16} /> {period.label}</span>} sub={period.unit === 'day' ? 'Day summary' : `${fmt(period.from, 'MMM d')} – ${fmt(period.to, 'MMM d, yyyy')}`} action={<div className="row wrap">{links.map(l => <Link key={l.to} className="card-link" to={l.to}>{l.label}</Link>)}</div>}>
      <div className="search-stats">
        <Stat label="Productive time" value={formatDuration(s.seconds)} sub={`${s.productiveDays} productive day${s.productiveDays === 1 ? '' : 's'}`} />
        <Stat label="Sessions" value={s.sessions} sub={s.sessions ? `avg ${formatDuration(s.averageSessionSeconds)}` : undefined} />
        {period.unit !== 'day' && <Stat label="Best day" value={s.bestDay ? fmt(s.bestDay.key, 'MMM d') : '—'} sub={s.bestDay ? formatDuration(s.bestDay.seconds) : undefined} />}
        <Stat label="Top category" value={s.topCategory ? <span className="row"><Dot color={color(s.topCategory.color)} size={10} />{s.topCategory.name}</span> : '—'} sub={s.topCategory ? formatDuration(s.topCategory.seconds) : undefined} />
        <Stat label="Habits" value={s.habits.due ? `${s.habits.percent}%` : '—'} sub={s.habits.due ? `${s.habits.done}/${s.habits.due} check-ins` : 'none scheduled'} />
      </div>
      <PeriodActivity period={period} />
    </Card>
  )
}

function PeriodActivity({ period }: { period: Period }) {
  const { ws } = useStore()
  const { open } = useEditors()
  const color = useSeriesColor()
  if (period.unit === 'day') {
    const key = period.from
    const sessions = sessionsOn(ws, key)
    const tasks = tasksOn(ws, key)
    const events = eventsOn(ws, key)
    const journal = ws.journal.find(j => j.date === key)
    if (!sessions.length && !tasks.length && !events.length && !journal) return <p className="muted search-note">Nothing recorded on this day.</p>
    return (
      <div className="list search-activity">
        {events.map(e => <button type="button" key={e.id} className="list-row search-row" onClick={() => open({ kind: 'event', id: e.id })}><CalendarDays size={15} /><span className="grow title">{e.title}</span><span className="meta">{e.start_min !== null ? minToClock(e.start_min) : 'All day'}</span></button>)}
        {sessions.map(s => <button type="button" key={s.id} className="list-row search-row" onClick={() => open({ kind: 'session', id: s.id })}><Dot color={color(categoryColor(ws, s.category))} size={10} /><span className="grow title">{s.category}{s.goal_id ? ` · ${goalById(ws, s.goal_id)?.title || ''}` : ''}</span><span className="meta tabular">{formatDuration(s.duration_seconds)}</span></button>)}
        {tasks.map(t => <button type="button" key={t.id} className={`list-row search-row ${t.done ? 'is-done' : ''}`} onClick={() => open({ kind: 'task', id: t.id })}><CheckSquare size={15} /><span className="grow title">{t.title}</span><span className="meta">{t.done ? 'Done' : 'Open'}</span></button>)}
        {journal && <Link className="list-row search-row" to={routes.journal(key)}><BookHeart size={15} /><span className="grow title">Journal entry</span><span className="meta">{journal.body.slice(0, 40)}</span></Link>}
      </div>
    )
  }
  if (period.unit === 'year') {
    const months = Array.from({ length: 12 }, (_, i) => `${period.from.slice(0, 4)}-${String(i + 1).padStart(2, '0')}-01`).map(k => ({ key: k, seconds: secondsIn(ws, k, monthEndKey(k)) })).filter(m => m.seconds > 0)
    const max = Math.max(1, ...months.map(m => m.seconds))
    if (!months.length) return <p className="muted search-note">Nothing tracked in {period.label}.</p>
    return <div className="list search-activity">{months.map(m => <ActivityRow key={m.key} to={routes.month(m.key)} label={fmt(m.key, 'MMMM')} seconds={m.seconds} max={max} />)}</div>
  }
  const today = todayKey()
  const days = rangeKeys(period.from, period.to).filter(k => k <= today || ws.events.some(e => e.date === k)).map(k => ({ key: k, seconds: secondsOn(ws, k), journal: ws.journal.some(j => j.date === k), events: eventsOn(ws, k).length })).filter(d => d.seconds > 0 || d.journal || d.events).reverse()
  const max = Math.max(1, ...days.map(d => d.seconds))
  if (!days.length) return <p className="muted search-note">Nothing recorded in this period.</p>
  return (
    <div className="list search-activity">
      {days.map(d => <ActivityRow key={d.key} to={routes.day(d.key)} label={fmt(d.key, 'EEE, MMM d')} seconds={d.seconds} max={max} extra={[d.journal && 'journal', d.events && `${d.events} event${d.events === 1 ? '' : 's'}`].filter(Boolean).join(' · ')} />)}
    </div>
  )
}

function ActivityRow({ to, label, seconds, max, extra }: { to: string; label: string; seconds: number; max: number; extra?: string }) {
  return (
    <Link to={to} className="list-row search-act">
      <span className="search-act-label">{label}</span>
      <span className="search-act-bar grow" aria-hidden><i style={{ width: `${(seconds / max) * 100}%` }} /></span>
      <span className="meta tabular search-act-val">{seconds ? formatDuration(seconds) : '—'}{extra ? ` · ${extra}` : ''}</span>
    </Link>
  )
}

function mentions(ws: Workspace, word: string) {
  const w = word.toLowerCase()
  return ws.journal.filter(j => journalText(j).toLowerCase().includes(w)).sort((a, b) => b.date.localeCompare(a.date))
}

function EntityStats({ sessions }: { sessions: Workspace['sessions'] }) {
  const today = todayKey()
  const monthStart = monthStartKey(today)
  const elapsed = Number(today.slice(8, 10))
  const prevStart = monthStartKey(shiftKey(monthStart, -1))
  const month = sumSeconds(sessions.filter(s => s.date >= monthStart && s.date <= today))
  const prevSame = sumSeconds(sessions.filter(s => s.date >= prevStart && s.date <= shiftKey(prevStart, elapsed - 1)))
  const last = sessions.reduce<string | null>((m, s) => (!m || s.date > m ? s.date : m), null)
  return (
    <div className="search-stats">
      <Stat label="Total time" value={formatDuration(sumSeconds(sessions))} sub={sessions.length ? `avg ${formatDuration(averageSessionSeconds(sessions))} per session` : undefined} />
      <Stat label="Sessions" value={sessions.length} />
      <Stat label="This month" value={formatDuration(month)} trend={change(month, prevSame)} sub="vs same point last month" />
      <Stat label="Last session" value={last ? <Link to={routes.day(last)} className="search-link">{fmt(last, 'MMM d')}</Link> : '—'} sub={last ? relative(last, today) : undefined} />
    </div>
  )
}

function relative(key: DateKey, today: DateKey) {
  const d = Math.round((fromKey(today).getTime() - fromKey(key).getTime()) / 86400000)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`
}

function Related({ goals, tasks, journal }: { goals?: Goal[]; tasks: Workspace['tasks']; journal: JournalEntry[] }) {
  const { open } = useEditors()
  const color = useSeriesColor()
  if (!goals?.length && !tasks.length && !journal.length) return null
  return (
    <div className="search-related">
      {goals && goals.length > 0 && (
        <div>
          <span className="eyebrow">Goals</span>
          <div className="row wrap search-chips">{goals.map(g => <Link key={g.id} className="chip" to={routes.goal(g.id)}><Dot color={color(g.color)} size={7} />{g.title}</Link>)}</div>
        </div>
      )}
      {tasks.length > 0 && (
        <div>
          <span className="eyebrow">Open tasks</span>
          <div className="row wrap search-chips">{tasks.slice(0, 5).map(t => <button type="button" key={t.id} className="chip chip-choice" onClick={() => open({ kind: 'task', id: t.id })}>{t.title}</button>)}{tasks.length > 5 && <span className="muted">+{tasks.length - 5}</span>}</div>
        </div>
      )}
      {journal.length > 0 && (
        <div>
          <span className="eyebrow">Journal mentions · {journal.length}</span>
          <div className="row wrap search-chips">{journal.slice(0, 5).map(j => <Link key={j.id} className="chip" to={routes.journal(j.date)}>{fmt(j.date, 'MMM d')}</Link>)}</div>
        </div>
      )}
    </div>
  )
}

function CategoryCard({ name }: { name: string }) {
  const { ws } = useStore()
  const color = useSeriesColor()
  const sessions = ws.sessions.filter(s => s.category === name)
  return (
    <Card className="search-summary" title={<span className="row"><Dot color={color(categoryColor(ws, name))} size={12} /> {name}</span>} sub="Category summary" action={<Link className="card-link" to={routes.analytics('all')}>Analytics</Link>}>
      <EntityStats sessions={sessions} />
      <Related goals={ws.goals.filter(g => g.category === name && g.status !== 'archived')} tasks={ws.tasks.filter(t => t.category === name && !t.done)} journal={mentions(ws, name)} />
    </Card>
  )
}

function GoalCard({ goal }: { goal: Goal }) {
  const { ws } = useStore()
  const color = useSeriesColor()
  const p = goalProgress(ws, goal)
  return (
    <Card className="search-summary" title={<span className="row"><Dot color={color(goal.color)} size={12} /> {goal.title}</span>} sub={`Goal · ${goal.category}${goal.deadline ? ` · due ${fmt(goal.deadline, 'MMM d')}` : ''}`} action={<Link className="card-link" to={routes.goal(goal.id)}>Open goal</Link>}>
      <div className="search-goal-progress">
        <div className="row-between"><span className="muted">{p.targetSeconds ? `${formatDuration(p.seconds)} of ${goal.target_hours}h` : p.tasksTotal ? `${p.tasksDone}/${p.tasksTotal} tasks` : 'No target set'}</span><b className="tabular">{p.percent}%</b></div>
        <ProgressBar value={p.percent} label={`${goal.title} progress`} />
      </div>
      <EntityStats sessions={goalSessions(ws, goal)} />
      <Related tasks={ws.tasks.filter(t => t.goal_id === goal.id && !t.done)} journal={mentions(ws, goal.title)} />
    </Card>
  )
}
