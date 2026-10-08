import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, Check, ChevronDown, ChevronUp, ImagePlus, Plus, Search, X } from 'lucide-react'
import { fmt, formatDuration, minToClock, rangeKeys, shiftKey, todayKey } from '../lib/dates'
import { MOODS, type DateKey, type JournalEntry } from '../lib/model'
import { routes } from '../lib/routes'
import { categoryColor, daySummary, habitDoneOn, pct, sessionsOn } from '../lib/selectors'
import { useStore } from '../lib/store'
import { Button, Card, ChartTooltip, DateStepper, Dot, IconButton, Page, ProgressBar, ScalePick, useSeriesColor, useToast } from '../ui/kit'
import './journal.css'

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const ENERGY = ['1', '2', '3', '4', '5'] as const
const MAX_PHOTOS = 8
const SAVE_DELAY = 600

type TextField = 'body' | 'went_well' | 'distractions' | 'tomorrow_priority' | 'highlights' | 'challenges' | 'gratitude' | 'notes'
type Draft = Pick<JournalEntry, TextField | 'mood' | 'energy' | 'photos'>

const MAIN_PROMPTS: Array<{ field: TextField; label: string; placeholder: string }> = [
  { field: 'body', label: 'How was your day?', placeholder: 'A few honest lines are plenty…' },
  { field: 'went_well', label: 'What went well?', placeholder: 'Small wins count.' },
  { field: 'distractions', label: 'What distracted you?', placeholder: 'Notice it without judging it.' },
  { field: 'tomorrow_priority', label: 'What is tomorrow’s priority?', placeholder: 'The one thing to protect time for.' },
]
const MORE_PROMPTS: Array<{ field: TextField; label: string; placeholder: string }> = [
  { field: 'highlights', label: 'Highlights', placeholder: 'Moments worth remembering.' },
  { field: 'challenges', label: 'Challenges', placeholder: 'What felt hard, and what might help next time?' },
  { field: 'gratitude', label: 'Gratitude', placeholder: 'Three things you’re thankful for.' },
  { field: 'notes', label: 'Notes', placeholder: 'Anything else.' },
]

const EMPTY_DRAFT: Draft = { mood: null, energy: null, body: '', went_well: '', distractions: '', tomorrow_priority: '', highlights: '', challenges: '', gratitude: '', notes: '', photos: [] }

const draftFrom = (entry?: JournalEntry): Draft => (entry ? {
  mood: entry.mood, energy: entry.energy, body: entry.body, went_well: entry.went_well, distractions: entry.distractions,
  tomorrow_priority: entry.tomorrow_priority, highlights: entry.highlights, challenges: entry.challenges,
  gratitude: entry.gratitude, notes: entry.notes, photos: entry.photos || [],
} : EMPTY_DRAFT)

/** First meaningful line of an entry, for lists. */
const entryPreview = (e: JournalEntry) => {
  const text = [e.body, e.went_well, e.highlights, e.gratitude, e.notes, e.tomorrow_priority].find(t => t.trim()) || ''
  return text.trim().split('\n')[0]
}
const hasContent = (e: JournalEntry) => !!(entryPreview(e) || e.mood || e.energy || e.photos?.length || e.distractions.trim() || e.challenges.trim())

// ---------------------------------------------------------------------------
// Photos: downscale on the device before storing.

function resizeImage(file: File, max = 1024, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Canvas unavailable')); return }
      ctx.fillStyle = '#ffffff' // transparent PNGs would turn black as JPEG
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')) }
    img.src = url
  })
}

// ---------------------------------------------------------------------------
// The reusable reflection form (embedded in the day planner too).

export function JournalForm({ date, compact }: { date: DateKey; compact?: boolean }) {
  // Keyed by date: switching days starts from that day's saved entry, and the
  // previous day's pending edits are flushed on unmount.
  return <JournalFormInner key={date} date={date} compact={compact} />
}

function JournalFormInner({ date, compact }: { date: DateKey; compact?: boolean }) {
  const { ws, saveJournal, create } = useStore()
  const toast = useToast()
  const entry = ws.journal.find(j => j.date === date)
  const [draft, setDraft] = useState<Draft>(() => draftFrom(entry))
  const [status, setStatus] = useState<'idle' | 'pending' | 'saved'>('idle')
  // Phones and the day planner start with the four main prompts; the rest is one tap away.
  const [collapsible] = useState(() => compact || window.matchMedia('(max-width: 640px)').matches)
  const [expanded, setExpanded] = useState(() => !collapsible)
  const [busy, setBusy] = useState(false)
  const pending = useRef<Partial<Draft>>({})
  const timer = useRef<number | undefined>(undefined)
  const savedTimer = useRef<number | undefined>(undefined)
  const fileRef = useRef<HTMLInputElement>(null)

  const flush = () => {
    window.clearTimeout(timer.current)
    const patch = pending.current
    if (!Object.keys(patch).length) return
    pending.current = {}
    saveJournal(date, patch)
    setStatus('saved')
    window.clearTimeout(savedTimer.current)
    savedTimer.current = window.setTimeout(() => setStatus('idle'), 2200)
  }
  const flushRef = useRef(flush)
  useEffect(() => { flushRef.current = flush })
  useEffect(() => () => { flushRef.current(); window.clearTimeout(savedTimer.current) }, [])

  const change = (patch: Partial<Draft>, immediate = false) => {
    setDraft(d => ({ ...d, ...patch }))
    pending.current = { ...pending.current, ...patch }
    setStatus('pending')
    window.clearTimeout(timer.current)
    if (immediate) flush()
    else timer.current = window.setTimeout(() => flushRef.current(), SAVE_DELAY)
  }

  const addPhotos = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files || [])].filter(f => f.type.startsWith('image/'))
    e.target.value = ''
    if (!files.length) return
    const room = MAX_PHOTOS - draft.photos.length
    if (room <= 0) { toast(`You can keep up to ${MAX_PHOTOS} photos per day.`); return }
    setBusy(true)
    try {
      const urls: string[] = []
      for (const f of files.slice(0, room)) urls.push(await resizeImage(f))
      change({ photos: [...draft.photos, ...urls] }, true)
      if (files.length > room) toast(`Added ${room} — there’s a limit of ${MAX_PHOTOS} photos per day.`)
    } catch {
      toast('That image couldn’t be read. Try a JPEG or PNG.')
    } finally {
      setBusy(false)
    }
  }

  const today = todayKey()
  const tomorrow = shiftKey(today, 1)
  const priority = draft.tomorrow_priority.trim()
  const alreadyAdded = !!priority && ws.tasks.some(t => t.date === tomorrow && t.title.trim().toLowerCase() === priority.toLowerCase())
  const addPriorityTask = () => {
    create('tasks', {
      title: priority, notes: 'From your evening reflection.', date: tomorrow, done: false, done_at: null, goal_id: null,
      category: 'Work', estimate_minutes: 60, priority: 3, reminder_time: null, sort: ws.tasks.length, created_at: new Date().toISOString(),
    })
    toast('Added to tomorrow’s tasks')
  }

  const extraFilled = MORE_PROMPTS.filter(p => draft[p.field].trim()).length + (draft.photos.length ? 1 : 0)

  const prompt = (p: { field: TextField; label: string; placeholder: string }) => (
    <label className="field journal-prompt" key={p.field}>
      <span>{p.label}</span>
      <textarea
        className="textarea journal-textarea"
        rows={p.field === 'body' && !compact ? 3 : 2}
        value={draft[p.field]}
        placeholder={p.placeholder}
        onChange={e => change({ [p.field]: e.target.value } as Partial<Draft>)}
        onBlur={flush}
      />
      {p.field === 'tomorrow_priority' && date === today && priority && (
        alreadyAdded
          ? <span className="journal-added"><Check size={13} /> On tomorrow’s list</span>
          : <Button size="sm" variant="soft" icon={<Plus size={13} />} className="journal-add-task" onClick={addPriorityTask}>Add to tomorrow’s tasks</Button>
      )}
    </label>
  )

  return (
    <div className={`journal-form ${compact ? 'compact' : ''}`}>
      <div className="journal-scales">
        <div className="journal-scale">
          <span className="field-label">Mood</span>
          <ScalePick name="Mood" labels={MOODS} value={draft.mood} onChange={mood => change({ mood }, true)} />
        </div>
        <div className="journal-scale">
          <span className="field-label">Energy <span aria-hidden>⚡</span></span>
          <ScalePick name="Energy" labels={ENERGY} value={draft.energy} onChange={energy => change({ energy }, true)} />
        </div>
        <span className={`journal-status ${status}`} aria-live="polite">
          {status === 'pending' ? 'Saving…' : status === 'saved' ? <><Check size={12} /> Saved</> : entry ? `Saved ${new Date(entry.updated_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : 'Saves as you type'}
        </span>
      </div>

      <div className="journal-prompts">{MAIN_PROMPTS.map(prompt)}</div>

      {collapsible && (
        <button type="button" className="card-link journal-more" aria-expanded={expanded} onClick={() => setExpanded(x => !x)}>
          {expanded ? <><ChevronUp size={14} /> Fewer prompts</> : <><ChevronDown size={14} /> More prompts{extraFilled ? ` (${extraFilled} filled)` : ''}</>}
        </button>
      )}

      {expanded && (
        <>
          <div className="journal-prompts">{MORE_PROMPTS.map(prompt)}</div>
          <div className="journal-photos">
            <div className="row-between wrap">
              <span className="field-label">Photos</span>
              <Button size="sm" variant="ghost" icon={<ImagePlus size={14} />} disabled={busy || draft.photos.length >= MAX_PHOTOS} onClick={() => fileRef.current?.click()}>{busy ? 'Adding…' : 'Add photos'}</Button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => void addPhotos(e)} aria-label="Add photos" />
            </div>
            {draft.photos.length > 0 && (
              <div className="journal-thumbs">
                {draft.photos.map((src, i) => (
                  <figure className="journal-thumb" key={i}>
                    <img src={src} alt={`Journal photo ${i + 1} for ${fmt(date, 'MMM d')}`} loading="lazy" />
                    <IconButton size="sm" label={`Remove photo ${i + 1}`} className="journal-thumb-remove" onClick={() => change({ photos: draft.photos.filter((_, j) => j !== i) }, true)}><X size={13} /></IconButton>
                  </figure>
                ))}
              </div>
            )}
            <p className="journal-note">Photos are resized on your device and stored with your journal data{draft.photos.length ? '' : ' — a few per day keeps things light'}.</p>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Journal page

function useDateParam() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('date')
  const date = raw && KEY_RE.test(raw) ? raw : todayKey()
  const setDate = (key: DateKey) => setParams(prev => { const next = new URLSearchParams(prev); next.set('date', key); return next }, { replace: true })
  return [date, setDate] as const
}

export default function Journal() {
  const [date, setDate] = useDateParam()
  const today = todayKey()
  const relative = date === today ? 'Today' : date === shiftKey(today, -1) ? 'Yesterday' : date > today ? 'Ahead' : 'Looking back'
  return (
    <Page
      eyebrow="Journal"
      title={<>{relative === 'Today' ? 'Tonight’s reflection' : fmt(date, 'EEEE, MMMM d')}</>}
      subtitle={date === today ? 'A quiet moment to notice how the day went — and set up tomorrow.' : `${relative} · ${fmt(date, 'MMMM d, yyyy')}`}
      actions={<DateStepper mode="day" value={date} onChange={setDate} />}
    >
      <div className="journal-layout">
        <Card className="journal-main">
          <JournalForm date={date} />
        </Card>
        <div className="journal-side">
          <DayContext date={date} />
          <MoodTrend />
          <History date={date} onPick={setDate} />
        </div>
      </div>
    </Page>
  )
}

function DayContext({ date }: { date: DateKey }) {
  const { ws } = useStore()
  const color = useSeriesColor()
  const s = daySummary(ws, date)
  const sessions = sessionsOn(ws, date)
  const future = date > todayKey()
  return (
    <Card title="What actually happened" sub={future ? 'This day hasn’t happened yet.' : 'Let the facts inform the reflection.'} action={<Link className="card-link" to={routes.day(date)}>Day plan <ArrowRight size={13} /></Link>}>
      <div className="journal-facts">
        <div>
          <span className="eyebrow">Productive</span>
          <b className="tabular">{formatDuration(s.seconds)}</b>
          <ProgressBar size="thin" value={s.progress} tone={s.progress >= 100 ? 'good' : undefined} label="Progress toward the day’s target" />
          <span className="muted">of {formatDuration(s.targetSeconds, { short: true })}</span>
        </div>
        <div>
          <span className="eyebrow">Sessions</span>
          <b className="tabular">{sessions.length}</b>
          <span className="muted">{s.plannedSeconds ? `${pct(s.seconds, s.plannedSeconds)}% of plan` : 'nothing planned'}</span>
        </div>
        <div>
          <span className="eyebrow">Habits</span>
          <b className="tabular">{s.habitsDone}/{s.habits.length}</b>
          <span className="muted">done</span>
        </div>
        <div>
          <span className="eyebrow">Tasks</span>
          <b className="tabular">{s.tasksDone}/{s.tasks.length}</b>
          <span className="muted">done</span>
        </div>
      </div>
      {sessions.length > 0 && (
        <div className="list journal-sessions">
          {[...sessions].sort((a, b) => a.started_at.localeCompare(b.started_at)).slice(0, 5).map(x => {
            const d = new Date(x.started_at)
            return (
              <div className="list-row" key={x.id}>
                <Dot color={color(categoryColor(ws, x.category))} />
                <span className="grow"><span className="title">{x.category}</span>{x.notes && <span className="meta"> · {x.notes}</span>}</span>
                <span className="muted tabular">{minToClock(d.getHours() * 60 + d.getMinutes())}</span>
                <b className="tabular">{formatDuration(x.duration_seconds)}</b>
              </div>
            )
          })}
          {sessions.length > 5 && <span className="muted journal-more-line">+{sessions.length - 5} more sessions</span>}
        </div>
      )}
      {s.habits.length > 0 && (
        <div className="journal-habits" aria-label="Habits">
          {s.habits.map(h => {
            const done = habitDoneOn(ws, h, date)
            return <span key={h.id} className={`chip ${done ? 'good' : ''}`} title={done ? 'Done' : 'Not done'}>{h.icon} {h.name}</span>
          })}
        </div>
      )}
    </Card>
  )
}

const MOOD_BLUE = '#2a78d6'

function MoodTrend() {
  const { ws } = useStore()
  const color = useSeriesColor()
  const energyColor = color(MOOD_BLUE)
  const today = todayKey()
  const data = useMemo(() => {
    const byDate = new Map(ws.journal.map(j => [j.date, j]))
    return rangeKeys(shiftKey(today, -29), today).map(key => ({ key, mood: byDate.get(key)?.mood ?? null, energy: byDate.get(key)?.energy ?? null }))
  }, [ws.journal, today])
  const logged = data.filter(d => d.mood !== null || d.energy !== null)
  const avg = (k: 'mood' | 'energy') => { const v = logged.map(d => d[k]).filter((n): n is number => n !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
  const moodAvg = avg('mood')
  const energyAvg = avg('energy')
  return (
    <Card title="Mood & energy" sub="Last 30 days">
      {logged.length < 2 ? (
        <p className="muted journal-empty-line">Rate your mood and energy on a couple of days and the trend appears here.</p>
      ) : (
        <>
          <div className="legend journal-legend">
            <span><Dot color="var(--accent)" />Mood{moodAvg !== null && <b className="tabular">avg {MOODS[Math.round(moodAvg) - 1]} {moodAvg.toFixed(1)}</b>}</span>
            <span><Dot color={energyColor} />Energy{energyAvg !== null && <b className="tabular">avg {energyAvg.toFixed(1)}</b>}</span>
          </div>
          <div className="chart-box sm" role="img" aria-label={`Mood and energy over the last 30 days. ${logged.length} days logged.`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="key" tickFormatter={k => fmt(String(k), 'MMM d')} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tickLine={false} axisLine={false} width={40} />
                <Tooltip content={<ChartTooltip format={v => `${v} / 5`} labelFormat={l => fmt(String(l), 'EEE, MMM d')} />} cursor={{ stroke: 'var(--line-strong)' }} />
                <Line type="monotone" dataKey="mood" name="Mood" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="energy" name="Energy" stroke={energyColor} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3, fill: energyColor, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  )
}

function History({ date, onPick }: { date: DateKey; onPick: (k: DateKey) => void }) {
  const { ws } = useStore()
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(12)
  const entries = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ws.journal
      .filter(hasContent)
      .filter(e => !q || [e.body, e.went_well, e.distractions, e.tomorrow_priority, e.highlights, e.challenges, e.gratitude, e.notes].some(t => t.toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [ws.journal, query])
  return (
    <Card title="Past entries" sub={`${ws.journal.filter(hasContent).length} days written`}>
      <label className="journal-search">
        <Search size={15} aria-hidden />
        <input className="input" type="search" placeholder="Search your journal" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search journal entries" />
      </label>
      {entries.length ? (
        <div className="list journal-history">
          {entries.slice(0, limit).map(e => (
            <button type="button" key={e.id} className={`list-row journal-entry ${e.date === date ? 'current' : ''}`} onClick={() => onPick(e.date)} aria-current={e.date === date ? 'date' : undefined}>
              <span className="journal-entry-mood" aria-label={e.mood ? `Mood ${e.mood} of 5` : 'No mood'}>{e.mood ? MOODS[e.mood - 1] : '·'}</span>
              <span className="grow">
                <span className="title">{fmt(e.date, 'EEE, MMM d')}{e.date.slice(0, 4) !== todayKey().slice(0, 4) && fmt(e.date, ', yyyy')}</span>
                <span className="meta journal-entry-line">{entryPreview(e) || 'Mood and energy only'}</span>
              </span>
              {e.photos?.length > 0 && <span className="chip">{e.photos.length} 📷</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted journal-empty-line">{query ? 'No entries match that search.' : 'Entries you write will collect here.'}</p>
      )}
      {entries.length > limit && <button type="button" className="card-link" onClick={() => setLimit(l => l + 20)}>Show more</button>}
    </Card>
  )
}
