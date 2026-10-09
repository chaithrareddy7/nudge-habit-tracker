import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { nowMin, todayKey, toKey } from './dates'
import { blockAt } from './selectors'
import {
  emptyWorkspace,
  type ActiveTimer, type CollectionName, type DateKey, type DayPlan, type HabitCompletion, type JournalEntry,
  type ProductiveSession, type Review, type ReviewPeriod, type RowOf, type Settings, type Workspace,
} from './model'
import { buildSampleWorkspace } from './sample'

// ---------------------------------------------------------------------------
// Persistence: the browser copy is always the working copy. When signed in,
// every change is also queued and upserted to Supabase (user-scoped by RLS).

const STORAGE_KEY = 'nudge-os-v1'

/** Supabase table for each collection, in dependency order. Settings live in profiles.settings. */
export const TABLES: Record<CollectionName, string> = {
  categories: 'nudge_categories',
  goals: 'nudge_goals',
  tasks: 'nudge_tasks',
  blocks: 'nudge_time_blocks',
  events: 'nudge_events',
  sessions: 'nudge_sessions',
  habits: 'nudge_habits',
  completions: 'nudge_habit_completions',
  journal: 'nudge_journal_entries',
  notes: 'nudge_notes',
  days: 'nudge_day_plans',
  reviews: 'nudge_reviews',
  reminders: 'nudge_reminders',
}
const COLLECTIONS = Object.keys(TABLES) as CollectionName[]

function loadLocal(): Workspace {
  const base = emptyWorkspace()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw) as Partial<Workspace>
    const settings = { ...base.settings, ...saved.settings }
    if (settings.theme === 'system') settings.theme = 'light'
    return { ...base, ...saved, settings }
  } catch {
    return base
  }
}

/** Validates an exported backup and fills anything missing with defaults. */
function parseBackup(data: unknown): Workspace {
  const base = emptyWorkspace()
  if (!data || typeof data !== 'object' || !('settings' in data)) throw new Error('This file isn’t a Nudge backup.')
  const input = data as Partial<Record<keyof Workspace, unknown>>
  const next: Workspace = { ...base, settings: { ...base.settings, ...(input.settings as Partial<Settings>) } }
  for (const c of COLLECTIONS) {
    const rows = input[c]
    if (rows === undefined) continue
    if (!Array.isArray(rows) || rows.some(r => !r || typeof r !== 'object' || typeof (r as { id?: unknown }).id !== 'string')) throw new Error(`The backup’s “${c}” list is damaged.`)
    ;(next[c] as unknown[]) = rows
  }
  return next
}

type Op = { collection: CollectionName; kind: 'upsert' | 'delete'; id: string }

export type SyncState = 'local' | 'syncing' | 'synced' | 'error'
export type StopDraft = { timer: ActiveTimer; seconds: number }

export type NewRow<C extends CollectionName> = Omit<RowOf<C>, 'id'> & { id?: string }

export type StartTimerInput = Partial<Omit<ActiveTimer, 'started_at' | 'accumulated_seconds' | 'resumed_at' | 'goal_reached'>>

type StoreValue = {
  ws: Workspace
  ready: boolean
  user: { id: string; email: string } | null
  sync: SyncState
  syncError: string

  create: <C extends CollectionName>(collection: C, row: NewRow<C>) => RowOf<C>
  update: <C extends CollectionName>(collection: C, id: string, patch: Partial<RowOf<C>>) => void
  remove: <C extends CollectionName>(collection: C, id: string) => void
  updateSettings: (patch: Partial<Settings>) => void

  setHabitAmount: (habitId: string, date: DateKey, amount: number) => void
  toggleHabit: (habitId: string, date: DateKey) => void
  saveJournal: (date: DateKey, patch: Partial<JournalEntry>) => void
  setDayPlan: (date: DateKey, patch: Partial<Omit<DayPlan, 'id' | 'date'>>) => void
  saveReview: (period: ReviewPeriod, start: DateKey, patch: Partial<Pick<Review, 'answers' | 'target_minutes'>>) => void

  startTimer: (input: StartTimerInput) => void
  pauseTimer: () => void
  resumeTimer: () => void
  /** Pauses and opens the global "how did it go?" dialog. */
  stopTimer: () => void
  stopDraft: StopDraft | null
  finishTimer: (details: { rating: number | null; notes: string; category?: string; goal_id?: string | null }) => ProductiveSession | null
  discardTimer: () => void
  cancelStop: () => void

  loadSample: () => void
  /** Replaces everything with a backup made by Settings → Export. Throws if the file isn't a Nudge backup. */
  importWorkspace: (data: unknown) => Workspace
  resetWorkspace: () => void
  refresh: () => Promise<void>
}

const StoreContext = createContext<StoreValue | null>(null)

export const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ws, setWs] = useState<Workspace>(loadLocal)
  const [ready, setReady] = useState(!supabase)
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [sync, setSync] = useState<SyncState>('local')
  const [syncError, setSyncError] = useState('')
  const [stopDraft, setStopDraft] = useState<StopDraft | null>(null)

  // Latest values for callbacks. Actions also write wsRef/userRef directly when
  // they need the new value before React re-renders.
  const wsRef = useRef(ws)
  const userRef = useRef(user)
  useLayoutEffect(() => { wsRef.current = ws }, [ws])
  useLayoutEffect(() => { userRef.current = user }, [user])
  const queue = useRef<Op[]>([])
  const settingsDirty = useRef(false)
  const flushTimer = useRef<number | undefined>(undefined)

  // Save locally (debounced so a running timer or typing doesn't thrash storage).
  useEffect(() => {
    const t = window.setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ws)) }
      catch { setSyncError('This device is out of storage space. Try removing some journal photos.') }
    }, 250)
    return () => window.clearTimeout(t)
  }, [ws])

  // ---- remote sync --------------------------------------------------------

  const flush = useCallback(async () => {
    const client = supabase
    const u = userRef.current
    if (!client || !u) { queue.current = []; settingsDirty.current = false; return }
    const ops = queue.current
    queue.current = []
    const pushSettings = settingsDirty.current
    settingsDirty.current = false
    if (!ops.length && !pushSettings) return
    setSync('syncing')
    const current = wsRef.current
    const errors: string[] = []
    // Collapse to the last op per row, then batch by table.
    const last = new Map<string, Op>()
    for (const op of ops) last.set(`${op.collection}|${op.id}`, op)
    const byTable = new Map<CollectionName, { upserts: Record<string, unknown>[]; deletes: string[] }>()
    for (const op of last.values()) {
      const bucket = byTable.get(op.collection) || { upserts: [], deletes: [] }
      byTable.set(op.collection, bucket)
      if (op.kind === 'delete') { bucket.deletes.push(op.id); continue }
      const row = (current[op.collection] as Array<{ id: string }>).find(r => r.id === op.id)
      if (row) bucket.upserts.push({ ...row, user_id: u.id })
    }
    // Parents before children for upserts, children before parents for deletes,
    // so the same-user foreign keys in the database are always satisfied.
    for (const collection of COLLECTIONS) {
      const bucket = byTable.get(collection)
      if (!bucket?.upserts.length) continue
      const { error } = await client.from(TABLES[collection]).upsert(bucket.upserts, { onConflict: 'user_id,id' })
      if (error) errors.push(`${TABLES[collection]}: ${error.message}`)
    }
    for (const collection of [...COLLECTIONS].reverse()) {
      const bucket = byTable.get(collection)
      if (!bucket?.deletes.length) continue
      const { error } = await client.from(TABLES[collection]).delete().eq('user_id', u.id).in('id', bucket.deletes)
      if (error) errors.push(`${TABLES[collection]}: ${error.message}`)
    }
    if (pushSettings) {
      const { error } = await client.from('profiles').upsert({ id: u.id, settings: current.settings, display_name: current.settings.display_name || null })
      if (error) errors.push(`profiles: ${error.message}`)
    }
    if (errors.length) {
      setSync('error')
      setSyncError(`Couldn’t sync (${errors[0]}). Your changes are safe on this device. If this persists, apply the latest Supabase migration.`)
    } else {
      setSync('synced')
      setSyncError('')
    }
  }, [])

  const enqueue = useCallback((ops: Op[], settings = false) => {
    if (!supabase || !userRef.current) return
    queue.current.push(...ops)
    if (settings) settingsDirty.current = true
    window.clearTimeout(flushTimer.current)
    flushTimer.current = window.setTimeout(() => { void flush() }, 500)
  }, [flush])

  const pushEverything = useCallback((data: Workspace) => {
    const ops: Op[] = []
    for (const c of COLLECTIONS) for (const row of data[c] as Array<{ id: string }>) ops.push({ collection: c, kind: 'upsert', id: row.id })
    enqueue(ops, true)
  }, [enqueue])

  /** Pull the signed-in user's workspace. Remote wins, except a fresh account adopts this device's data. */
  const pull = useCallback(async (u: { id: string }) => {
    const client = supabase
    if (!client) return
    setSync('syncing')
    const results = await Promise.all(COLLECTIONS.map(c => client.from(TABLES[c]).select('*').eq('user_id', u.id)))
    const profile = await client.from('profiles').select('settings').eq('id', u.id).maybeSingle()
    const failed = results.find(r => r.error) || (profile.error ? profile : null)
    if (failed?.error) {
      setSync('error')
      setSyncError(`Cloud sync is not set up yet (${failed.error.message}). Everything still works on this device — apply supabase/migrations to enable sync.`)
      return
    }
    const remoteEmpty = results.every(r => !r.data?.length) && !(profile.data?.settings as Settings | null)?.onboarded
    const local = wsRef.current
    if (remoteEmpty) {
      if (local.settings.onboarded) pushEverything(local)
      setSync('synced')
      return
    }
    const next = emptyWorkspace()
    COLLECTIONS.forEach((c, i) => {
      const rows = (results[i].data || []).map(({ user_id: _u, ...row }) => row)
      // Built-in rows (categories, reminders) fall back to defaults if never synced.
      ;(next[c] as unknown[]) = rows.length || (c !== 'categories' && c !== 'reminders') ? rows : next[c]
    })
    const remoteSettings = (profile.data?.settings || {}) as Partial<Settings>
    next.settings = { ...next.settings, ...remoteSettings, active_timer: remoteSettings.active_timer ?? local.settings.active_timer }
    if (next.settings.theme === 'system') next.settings.theme = 'light'
    setWs(next)
    setSync('synced')
    setSyncError('')
  }, [pushEverything])

  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    const apply = async (session: { user: { id: string; email?: string } } | null) => {
      const u = session?.user ? { id: session.user.id, email: session.user.email || '' } : null
      const changed = u?.id !== userRef.current?.id
      userRef.current = u
      setUser(u)
      if (u && changed) await pull(u)
      if (!u) setSync('local')
      if (active) setReady(true)
    }
    void client.auth.getSession().then(({ data }) => apply(data.session))
    const { data: { subscription } } = client.auth.onAuthStateChange((_e, session) => { void apply(session) })
    // Pick up changes from other devices when coming back to the tab.
    const onFocus = () => { if (userRef.current && !queue.current.length) void pull(userRef.current) }
    window.addEventListener('focus', onFocus)
    return () => { active = false; subscription.unsubscribe(); window.removeEventListener('focus', onFocus) }
  }, [pull])

  // ---- generic CRUD -------------------------------------------------------

  const create = useCallback(<C extends CollectionName>(collection: C, input: NewRow<C>) => {
    const row = { ...input, id: input.id || newId() } as RowOf<C>
    setWs(prev => ({ ...prev, [collection]: [...(prev[collection] as RowOf<C>[]), row] }))
    enqueue([{ collection, kind: 'upsert', id: row.id }])
    return row
  }, [enqueue])

  const update = useCallback(<C extends CollectionName>(collection: C, id: string, patch: Partial<RowOf<C>>) => {
    setWs(prev => ({ ...prev, [collection]: (prev[collection] as RowOf<C>[]).map(r => (r.id === id ? { ...r, ...patch } : r)) }))
    enqueue([{ collection, kind: 'upsert', id }])
  }, [enqueue])

  const remove = useCallback(<C extends CollectionName>(collection: C, id: string) => {
    // Rows that reference the removed one are unlinked (or removed) so data stays consistent.
    const snapshot = wsRef.current
    const ops: Op[] = [{ collection, kind: 'delete', id }]
    const unlink = (c: CollectionName, rows: Array<{ id: string }>) => rows.forEach(r => ops.push({ collection: c, kind: 'upsert', id: r.id }))
    if (collection === 'goals') {
      unlink('tasks', snapshot.tasks.filter(t => t.goal_id === id))
      unlink('blocks', snapshot.blocks.filter(b => b.goal_id === id))
      unlink('sessions', snapshot.sessions.filter(s => s.goal_id === id))
      unlink('habits', snapshot.habits.filter(h => h.goal_id === id))
      unlink('goals', snapshot.goals.filter(g => g.parent_id === id))
    }
    if (collection === 'habits') snapshot.completions.filter(c => c.habit_id === id).forEach(c => ops.push({ collection: 'completions', kind: 'delete', id: c.id }))
    if (collection === 'blocks') unlink('sessions', snapshot.sessions.filter(s => s.block_id === id))
    if (collection === 'tasks') {
      unlink('blocks', snapshot.blocks.filter(b => b.task_id === id))
      unlink('sessions', snapshot.sessions.filter(s => s.task_id === id))
    }
    setWs(prev => {
      const next = { ...prev, [collection]: (prev[collection] as Array<{ id: string }>).filter(r => r.id !== id) } as Workspace
      if (collection === 'goals') {
        next.tasks = prev.tasks.map(t => (t.goal_id === id ? { ...t, goal_id: null } : t))
        next.blocks = prev.blocks.map(b => (b.goal_id === id ? { ...b, goal_id: null } : b))
        next.sessions = prev.sessions.map(s => (s.goal_id === id ? { ...s, goal_id: null, goal_part_id: null } : s))
        next.habits = prev.habits.map(h => (h.goal_id === id ? { ...h, goal_id: null } : h))
        next.goals = next.goals.map(g => (g.parent_id === id ? { ...g, parent_id: null } : g))
      }
      if (collection === 'habits') next.completions = prev.completions.filter(c => c.habit_id !== id)
      if (collection === 'blocks') next.sessions = prev.sessions.map(s => (s.block_id === id ? { ...s, block_id: null } : s))
      if (collection === 'tasks') {
        next.blocks = prev.blocks.map(b => (b.task_id === id ? { ...b, task_id: null } : b))
        next.sessions = prev.sessions.map(s => (s.task_id === id ? { ...s, task_id: null } : s))
      }
      return next
    })
    enqueue(ops)
  }, [enqueue])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setWs(prev => ({ ...prev, settings: { ...prev.settings, ...patch } }))
    enqueue([], true)
  }, [enqueue])

  // ---- domain actions -----------------------------------------------------

  const setHabitAmount = useCallback((habitId: string, date: DateKey, amount: number) => {
    const existing = wsRef.current.completions.find(c => c.habit_id === habitId && c.date === date)
    if (amount <= 0) { if (existing) remove('completions', existing.id); return }
    if (existing) update('completions', existing.id, { amount })
    else create('completions', { habit_id: habitId, date, amount } as NewRow<'completions'>)
  }, [create, update, remove])

  const toggleHabit = useCallback((habitId: string, date: DateKey) => {
    const habit = wsRef.current.habits.find(h => h.id === habitId)
    if (!habit) return
    const current = wsRef.current.completions.filter((c: HabitCompletion) => c.habit_id === habitId && c.date === date).reduce((n, c) => n + c.amount, 0)
    const target = Math.max(1, habit.target_amount)
    setHabitAmount(habitId, date, current >= target ? 0 : target)
  }, [setHabitAmount])

  const saveJournal = useCallback((date: DateKey, patch: Partial<JournalEntry>) => {
    const existing = wsRef.current.journal.find(j => j.date === date)
    if (existing) update('journal', existing.id, { ...patch, updated_at: nowIso() })
    else create('journal', { date, mood: null, energy: null, body: '', went_well: '', distractions: '', tomorrow_priority: '', highlights: '', challenges: '', gratitude: '', notes: '', photos: [], ...patch, updated_at: nowIso() } as NewRow<'journal'>)
  }, [create, update])

  const setDayPlan = useCallback((date: DateKey, patch: Partial<Omit<DayPlan, 'id' | 'date'>>) => {
    const existing = wsRef.current.days.find(d => d.date === date)
    if (existing) update('days', existing.id, patch)
    else create('days', { date, target_minutes: null, focus: '', ...patch } as NewRow<'days'>)
  }, [create, update])

  const saveReview = useCallback((period: ReviewPeriod, start: DateKey, patch: Partial<Pick<Review, 'answers' | 'target_minutes'>>) => {
    const existing = wsRef.current.reviews.find(r => r.period === period && r.start === start)
    if (existing) update('reviews', existing.id, { ...patch, answers: { ...existing.answers, ...patch.answers }, updated_at: nowIso() })
    else create('reviews', { period, start, answers: patch.answers || {}, target_minutes: patch.target_minutes ?? null, updated_at: nowIso() } as NewRow<'reviews'>)
  }, [create, update])

  const startTimer = useCallback((input: StartTimerInput) => {
    const current = wsRef.current
    let blockId = input.block_id ?? null
    let { category, goal_id: goalId = null, task_id: taskId = null, label } = input
    // Auto-link to the planned focus block happening right now.
    const planned = input.block_id === undefined ? blockAt(current, todayKey(), nowMin()) : current.blocks.find(b => b.id === input.block_id)
    if (planned && (input.block_id !== undefined || !category || planned.category === category || (goalId && planned.goal_id === goalId))) {
      blockId = planned.id
      category = category || planned.category
      goalId = goalId ?? planned.goal_id
      taskId = taskId ?? planned.task_id
      label = label || planned.title
    }
    const now = nowIso()
    updateSettings({
      active_timer: {
        label: label || category || 'Focus',
        category: category || 'Work',
        goal_id: goalId,
        goal_part_id: input.goal_part_id ?? null,
        task_id: taskId,
        block_id: blockId,
        started_at: now,
        accumulated_seconds: 0,
        resumed_at: now,
        goal_seconds: input.goal_seconds ?? null,
        goal_reached: false,
      },
    })
  }, [updateSettings])

  const liveSeconds = (t: ActiveTimer) => t.accumulated_seconds + (t.resumed_at ? (Date.now() - new Date(t.resumed_at).getTime()) / 1000 : 0)

  const pauseTimer = useCallback(() => {
    const t = wsRef.current.settings.active_timer
    if (!t || !t.resumed_at) return
    updateSettings({ active_timer: { ...t, accumulated_seconds: liveSeconds(t), resumed_at: null } })
  }, [updateSettings])

  const resumeTimer = useCallback(() => {
    const t = wsRef.current.settings.active_timer
    if (!t || t.resumed_at) return
    updateSettings({ active_timer: { ...t, resumed_at: nowIso() } })
  }, [updateSettings])

  const stopTimer = useCallback(() => {
    const t = wsRef.current.settings.active_timer
    if (!t) return
    const paused = { ...t, accumulated_seconds: liveSeconds(t), resumed_at: null }
    updateSettings({ active_timer: paused })
    setStopDraft({ timer: paused, seconds: Math.round(paused.accumulated_seconds) })
  }, [updateSettings])

  const finishTimer = useCallback((details: { rating: number | null; notes: string; category?: string; goal_id?: string | null }) => {
    const t = wsRef.current.settings.active_timer
    setStopDraft(null)
    if (!t) return null
    const seconds = Math.round(liveSeconds(t))
    updateSettings({ active_timer: null })
    if (seconds < 60) return null
    const started = new Date(t.started_at)
    return create('sessions', {
      date: toKey(started),
      started_at: t.started_at,
      ended_at: nowIso(),
      duration_seconds: seconds,
      category: details.category || t.category,
      goal_id: details.goal_id !== undefined ? details.goal_id : t.goal_id,
      goal_part_id: t.goal_part_id,
      task_id: t.task_id,
      block_id: t.block_id,
      rating: details.rating,
      notes: details.notes,
      source: 'timer',
      label: t.label,
      created_at: nowIso(),
    } as NewRow<'sessions'>)
  }, [create, updateSettings])

  const discardTimer = useCallback(() => { setStopDraft(null); updateSettings({ active_timer: null }) }, [updateSettings])
  const cancelStop = useCallback(() => { setStopDraft(null); resumeTimer() }, [resumeTimer])

  /** Swap in a whole workspace (samples, a backup) and mirror it exactly in the cloud. */
  const replaceWorkspace = useCallback((next: Workspace) => {
    const prev = wsRef.current
    const ops: Op[] = []
    for (const c of COLLECTIONS) {
      const keep = new Set((next[c] as Array<{ id: string }>).map(r => r.id))
      for (const r of prev[c] as Array<{ id: string }>) if (!keep.has(r.id)) ops.push({ collection: c, kind: 'delete', id: r.id })
      for (const r of next[c] as Array<{ id: string }>) ops.push({ collection: c, kind: 'upsert', id: r.id })
    }
    setWs(next)
    wsRef.current = next
    enqueue(ops, true)
  }, [enqueue])

  const loadSample = useCallback(() => {
    replaceWorkspace(buildSampleWorkspace(wsRef.current.settings))
  }, [replaceWorkspace])

  const importWorkspace = useCallback((data: unknown) => {
    const next = parseBackup(data)
    next.settings = { ...next.settings, active_timer: null, onboarded: true }
    replaceWorkspace(next)
    return next
  }, [replaceWorkspace])

  const resetWorkspace = useCallback(() => {
    const prev = wsRef.current
    const fresh = emptyWorkspace()
    fresh.settings = { ...fresh.settings, display_name: prev.settings.display_name, theme: prev.settings.theme }
    const ops: Op[] = []
    for (const c of COLLECTIONS) for (const r of prev[c] as Array<{ id: string }>) ops.push({ collection: c, kind: 'delete', id: r.id })
    for (const c of ['categories', 'reminders'] as const) for (const r of fresh[c]) ops.push({ collection: c, kind: 'upsert', id: r.id })
    setWs(fresh)
    wsRef.current = fresh
    enqueue(ops, true)
  }, [enqueue])

  const refresh = useCallback(async () => { if (userRef.current) await pull(userRef.current) }, [pull])

  const value = useMemo<StoreValue>(() => ({
    ws, ready, user, sync, syncError,
    create, update, remove, updateSettings,
    setHabitAmount, toggleHabit, saveJournal, setDayPlan, saveReview,
    startTimer, pauseTimer, resumeTimer, stopTimer, stopDraft, finishTimer, discardTimer, cancelStop,
    loadSample, importWorkspace, resetWorkspace, refresh,
  }), [ws, ready, user, sync, syncError, create, update, remove, updateSettings, setHabitAmount, toggleHabit, saveJournal, setDayPlan, saveReview, startTimer, pauseTimer, resumeTimer, stopTimer, stopDraft, finishTimer, discardTimer, cancelStop, loadSample, importWorkspace, resetWorkspace, refresh])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside StoreProvider')
  return value
}

/** Re-renders every `ms` while `active` — for live timers and "now" lines. */
export function useTick(active: boolean, ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [active, ms])
  return now
}
