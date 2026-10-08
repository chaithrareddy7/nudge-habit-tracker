// Pure aggregation over the workspace. Every total (day → week → month → year),
// goal progress, streak and comparison is derived here from dated rows, so a
// session logged once shows up everywhere it is relevant.

import { fromKey, inRange, toKey, monthEndKey, monthKey, monthStartKey, rangeKeys, shiftKey, todayKey, weekStartKey, weekday } from './dates'
import type { Category, DateKey, Goal, Habit, ProductiveSession, Workspace } from './model'

// ---------------------------------------------------------------------------
// Indexes (memoised per workspace snapshot)

type Index = {
  secondsByDay: Map<DateKey, number>
  sessionsByDay: Map<DateKey, ProductiveSession[]>
  completionsByHabitDay: Map<string, number> // `${habit_id}|${date}` -> amount
  firstActivity: DateKey | null
}
const cache = new WeakMap<Workspace, Index>()

function index(ws: Workspace): Index {
  const hit = cache.get(ws)
  if (hit) return hit
  const secondsByDay = new Map<DateKey, number>()
  const sessionsByDay = new Map<DateKey, ProductiveSession[]>()
  let firstActivity: DateKey | null = null
  for (const s of ws.sessions) {
    secondsByDay.set(s.date, (secondsByDay.get(s.date) || 0) + s.duration_seconds)
    const list = sessionsByDay.get(s.date)
    if (list) list.push(s)
    else sessionsByDay.set(s.date, [s])
    if (!firstActivity || s.date < firstActivity) firstActivity = s.date
  }
  const completionsByHabitDay = new Map<string, number>()
  for (const c of ws.completions) {
    const k = `${c.habit_id}|${c.date}`
    completionsByHabitDay.set(k, (completionsByHabitDay.get(k) || 0) + c.amount)
    if (!firstActivity || c.date < firstActivity) firstActivity = c.date
  }
  const built = { secondsByDay, sessionsByDay, completionsByHabitDay, firstActivity }
  cache.set(ws, built)
  return built
}

// ---------------------------------------------------------------------------
// Categories & lookups

export const categoryColor = (ws: Workspace, name: string) => ws.categories.find(c => c.name === name)?.color || '#8b7f86'
export const goalById = (ws: Workspace, id: string | null | undefined) => (id ? ws.goals.find(g => g.id === id) : undefined)
export const habitById = (ws: Workspace, id: string) => ws.habits.find(h => h.id === id)

// ---------------------------------------------------------------------------
// Productive time

export const sessionsOn = (ws: Workspace, key: DateKey) => index(ws).sessionsByDay.get(key) || []
export const sessionsIn = (ws: Workspace, from: DateKey, to: DateKey) => ws.sessions.filter(s => inRange(s.date, from, to))
export const secondsOn = (ws: Workspace, key: DateKey) => index(ws).secondsByDay.get(key) || 0
export const secondsIn = (ws: Workspace, from: DateKey, to: DateKey) => rangeKeys(from, to).reduce((sum, k) => sum + secondsOn(ws, k), 0)
export const sumSeconds = (sessions: ProductiveSession[]) => sessions.reduce((sum, s) => sum + s.duration_seconds, 0)

/** Live seconds of the running timer (0 if none). */
export function activeTimerSeconds(ws: Workspace, now = Date.now()) {
  const t = ws.settings.active_timer
  if (!t) return 0
  return t.accumulated_seconds + (t.resumed_at ? Math.max(0, (now - new Date(t.resumed_at).getTime()) / 1000) : 0)
}

// ---------------------------------------------------------------------------
// Targets

export const dayPlan = (ws: Workspace, key: DateKey) => ws.days.find(d => d.date === key)
export const dayTargetMinutes = (ws: Workspace, key: DateKey) => dayPlan(ws, key)?.target_minutes ?? ws.settings.target_minutes_day
export const review = (ws: Workspace, period: 'week' | 'month', start: DateKey) => ws.reviews.find(r => r.period === period && r.start === start)
export const weekTargetMinutes = (ws: Workspace, key: DateKey) => review(ws, 'week', weekStartKey(key))?.target_minutes ?? ws.settings.target_minutes_week
export const monthTargetMinutes = (ws: Workspace, key: DateKey) => review(ws, 'month', monthStartKey(key))?.target_minutes ?? ws.settings.target_minutes_month

export const pct = (value: number, target: number) => (target > 0 ? Math.round((value / target) * 100) : 0)
export const pctCapped = (value: number, target: number) => Math.min(100, pct(value, target))

// ---------------------------------------------------------------------------
// Planning

export const blocksOn = (ws: Workspace, key: DateKey) => ws.blocks.filter(b => b.date === key).sort((a, b) => a.start_min - b.start_min)
export const eventsOn = (ws: Workspace, key: DateKey) => ws.events.filter(e => e.date === key).sort((a, b) => (a.start_min ?? -1) - (b.start_min ?? -1))
export const tasksOn = (ws: Workspace, key: DateKey) => ws.tasks.filter(t => t.date === key).sort((a, b) => Number(a.done) - Number(b.done) || b.priority - a.priority || a.sort - b.sort)
export const plannedSecondsOn = (ws: Workspace, key: DateKey) => ws.blocks.filter(b => b.date === key && b.kind === 'focus').reduce((sum, b) => sum + (b.end_min - b.start_min) * 60, 0)
export const plannedSecondsIn = (ws: Workspace, from: DateKey, to: DateKey) => ws.blocks.filter(b => b.kind === 'focus' && inRange(b.date, from, to)).reduce((sum, b) => sum + (b.end_min - b.start_min) * 60, 0)

export type PlanVsActualRow = { category: string; color: string; planned: number; actual: number; diff: number }
export type PlanVsActual = { rows: PlanVsActualRow[]; planned: number; actual: number; efficiency: number; plannedHit: number }

/**
 * Compares planned focus blocks with tracked sessions, per category.
 * `efficiency` = actual / planned. `plannedHit` = share of planned blocks that
 * received at least half their length in linked or same-category sessions.
 */
export function planVsActual(ws: Workspace, from: DateKey, to: DateKey): PlanVsActual {
  const map = new Map<string, PlanVsActualRow>()
  const row = (category: string) => {
    let r = map.get(category)
    if (!r) { r = { category, color: categoryColor(ws, category), planned: 0, actual: 0, diff: 0 }; map.set(category, r) }
    return r
  }
  const blocks = ws.blocks.filter(b => b.kind === 'focus' && inRange(b.date, from, to))
  for (const b of blocks) row(b.category).planned += (b.end_min - b.start_min) * 60
  const sessions = sessionsIn(ws, from, to)
  for (const s of sessions) row(s.category).actual += s.duration_seconds
  const rows = [...map.values()].map(r => ({ ...r, diff: r.actual - r.planned })).sort((a, b) => b.planned + b.actual - (a.planned + a.actual))
  const planned = rows.reduce((n, r) => n + r.planned, 0)
  const actual = rows.reduce((n, r) => n + r.actual, 0)
  let hit = 0
  for (const b of blocks) {
    const linked = sessions.filter(s => s.block_id === b.id).reduce((n, s) => n + s.duration_seconds, 0)
    if (linked >= (b.end_min - b.start_min) * 30) hit++
  }
  return { rows, planned, actual, efficiency: pct(actual, planned), plannedHit: pct(hit, blocks.length) }
}

/** Seconds tracked against a specific planned block. */
export const blockActualSeconds = (ws: Workspace, blockId: string) => ws.sessions.filter(s => s.block_id === blockId).reduce((n, s) => n + s.duration_seconds, 0)

/** The focus block covering `minute` on `key`, used to auto-link a timer to the plan. */
export const blockAt = (ws: Workspace, key: DateKey, minute: number) =>
  ws.blocks.find(b => b.date === key && b.kind === 'focus' && b.start_min <= minute && b.end_min > minute)

// ---------------------------------------------------------------------------
// Breakdowns

export type Slice = { name: string; color: string; seconds: number; id?: string }

export function byCategory(ws: Workspace, sessions: ProductiveSession[]): Slice[] {
  const map = new Map<string, number>()
  for (const s of sessions) map.set(s.category, (map.get(s.category) || 0) + s.duration_seconds)
  // Keep category order stable (colour follows the entity, not its rank).
  const order = new Map(ws.categories.map((c, i) => [c.name, i]))
  return [...map.entries()]
    .map(([name, seconds]) => ({ name, seconds, color: categoryColor(ws, name) }))
    .sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99))
}

export function byGoal(ws: Workspace, sessions: ProductiveSession[]): Slice[] {
  const map = new Map<string, number>()
  for (const s of sessions) if (s.goal_id) map.set(s.goal_id, (map.get(s.goal_id) || 0) + s.duration_seconds)
  return [...map.entries()].map(([id, seconds]) => { const g = goalById(ws, id); return { id, name: g?.title || 'Deleted goal', color: g?.color || '#8b7f86', seconds } }).sort((a, b) => b.seconds - a.seconds)
}

export type DayPoint = { key: DateKey; seconds: number; planned: number; targetSeconds: number }
export const byDay = (ws: Workspace, keys: DateKey[]): DayPoint[] =>
  keys.map(key => ({ key, seconds: secondsOn(ws, key), planned: plannedSecondsOn(ws, key), targetSeconds: dayTargetMinutes(ws, key) * 60 }))

/** Seconds per hour of day (0–23), splitting sessions across hour boundaries. */
export function byHour(sessions: ProductiveSession[]): number[] {
  const hours = Array<number>(24).fill(0)
  for (const s of sessions) {
    const start = new Date(s.started_at).getTime()
    const wall = new Date(s.ended_at).getTime() - start
    if (wall <= 0) continue
    const scale = s.duration_seconds / (wall / 1000) // remove paused time proportionally
    let t = start
    const end = start + wall
    while (t < end) {
      const d = new Date(t)
      const nextHour = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime()
      const slice = Math.min(end, nextHour) - t
      hours[d.getHours()] += (slice / 1000) * scale
      t += slice
    }
  }
  return hours
}

/** Seconds per weekday, Monday first. */
export function byWeekday(sessions: ProductiveSession[]): number[] {
  const out = Array<number>(7).fill(0)
  for (const s of sessions) out[(weekday(s.date) + 6) % 7] += s.duration_seconds
  return out
}

export function bestDay(ws: Workspace, from: DateKey, to: DateKey) {
  let best: { key: DateKey; seconds: number } | null = null
  for (const key of rangeKeys(from, to)) { const seconds = secondsOn(ws, key); if (seconds > 0 && (!best || seconds > best.seconds)) best = { key, seconds } }
  return best
}

export function bestHour(sessions: ProductiveSession[]) {
  const hours = byHour(sessions)
  const max = Math.max(...hours)
  return max > 0 ? hours.indexOf(max) : null
}

export const topSlice = (slices: Slice[]) => slices.reduce<Slice | null>((best, s) => (!best || s.seconds > best.seconds ? s : best), null)

export const productiveDays = (ws: Workspace, from: DateKey, to: DateKey) => rangeKeys(from, to).filter(k => secondsOn(ws, k) > 0).length

export const longestSession = (sessions: ProductiveSession[]) => sessions.reduce<ProductiveSession | null>((best, s) => (!best || s.duration_seconds > best.duration_seconds ? s : best), null)

export function bestMonth(ws: Workspace) {
  const map = new Map<string, number>()
  for (const s of ws.sessions) map.set(monthKey(s.date), (map.get(monthKey(s.date)) || 0) + s.duration_seconds)
  let best: { month: string; seconds: number } | null = null
  for (const [month, seconds] of map) if (!best || seconds > best.seconds) best = { month, seconds }
  return best
}

export const averageSessionSeconds = (sessions: ProductiveSession[]) => (sessions.length ? sumSeconds(sessions) / sessions.length : 0)

// ---------------------------------------------------------------------------
// Goals

export type GoalProgress = {
  seconds: number
  targetSeconds: number
  percent: number // 0–100
  tasksDone: number
  tasksTotal: number
  habits: Habit[]
  parts: Array<{ id: string; name: string; seconds: number; targetSeconds: number }>
  weekSeconds: number
  weekTargetSeconds: number
}

/** Sessions that count toward a goal (from its start date), including those of its child goals. */
export function goalSessions(ws: Workspace, goal: Goal) {
  const ids = new Set([goal.id, ...ws.goals.filter(g => g.parent_id === goal.id).map(g => g.id)])
  return ws.sessions.filter(s => s.goal_id && ids.has(s.goal_id) && s.date >= goal.start_date)
}

export function goalProgress(ws: Workspace, goal: Goal, today = todayKey()): GoalProgress {
  const sessions = goalSessions(ws, goal)
  const seconds = sumSeconds(sessions)
  const tasks = ws.tasks.filter(t => t.goal_id === goal.id)
  const tasksDone = tasks.filter(t => t.done).length
  const targetSeconds = goal.target_hours * 3600
  let percent: number
  if (goal.status === 'completed') percent = 100
  else if (targetSeconds > 0) percent = pctCapped(seconds, targetSeconds)
  else percent = pctCapped(tasksDone, tasks.length)
  const weekStart = weekStartKey(today)
  const weekSeconds = sumSeconds(sessions.filter(s => inRange(s.date, weekStart, shiftKey(weekStart, 6))))
  const parts = goal.parts.map(p => ({ id: p.id, name: p.name, targetSeconds: p.target_hours * 3600, seconds: sumSeconds(sessions.filter(s => s.goal_part_id === p.id)) }))
  return { seconds, targetSeconds, percent, tasksDone, tasksTotal: tasks.length, habits: ws.habits.filter(h => h.goal_id === goal.id && !h.archived), parts, weekSeconds, weekTargetSeconds: goal.weekly_target_hours * 3600 }
}

export const activeGoals = (ws: Workspace) => ws.goals.filter(g => g.status === 'active')

/** Goals whose window includes the given month. */
export const goalsForMonth = (ws: Workspace, key: DateKey) => {
  const from = monthStartKey(key)
  const to = monthEndKey(key)
  return ws.goals.filter(g => g.status !== 'archived' && g.start_date <= to && (!g.deadline || g.deadline >= from) && (g.horizon === 'monthly' || g.horizon === 'long_term' || g.horizon === 'project'))
}

// ---------------------------------------------------------------------------
// Habits

/** Whether the habit was running on a day. Archiving hides a habit from planners but keeps its history. */
export function habitActiveOn(h: Habit, key: DateKey) {
  return key >= h.start_date && (!h.end_date || key <= h.end_date)
}

/** Whether a habit is expected on a given day. Weekly-count habits can be done any day. */
export function habitScheduledOn(h: Habit, key: DateKey) {
  if (!habitActiveOn(h, key)) return false
  if (h.frequency.type === 'custom') return h.frequency.days.includes(weekday(key))
  return true
}

export const habitAmount = (ws: Workspace, habitId: string, key: DateKey) => index(ws).completionsByHabitDay.get(`${habitId}|${key}`) || 0
export const habitDoneOn = (ws: Workspace, h: Habit, key: DateKey) => habitAmount(ws, h.id, key) >= Math.max(1, h.target_amount)

/** Habits to show on a day: scheduled ones, plus weekly-count habits not yet met this week or done today. */
export function habitsForDay(ws: Workspace, key: DateKey) {
  return ws.habits
    .filter(h => !h.archived && habitScheduledOn(h, key))
    .filter(h => {
      if (h.frequency.type !== 'weekly') return true
      return habitDoneOn(ws, h, key) || habitWeekCount(ws, h, key) < h.frequency.times
    })
    .sort((a, b) => a.sort - b.sort)
}

export const habitWeekCount = (ws: Workspace, h: Habit, key: DateKey) => {
  const start = weekStartKey(key)
  return rangeKeys(start, shiftKey(start, 6)).filter(k => habitDoneOn(ws, h, k)).length
}

export type StreakResult = { current: number; longest: number }

/**
 * Walks back from today. For daily/custom habits the unit is a scheduled day;
 * for weekly-count habits the unit is a week that met its count. The
 * in-progress unit (today / this week) extends a streak but never breaks it.
 */
export function habitStreak(ws: Workspace, h: Habit, today = todayKey()): StreakResult {
  if (h.frequency.type === 'weekly') {
    const times = h.frequency.times
    const met = (weekStart: DateKey) => habitWeekCount(ws, h, weekStart) >= times
    return runStreak(weekStartKey(h.start_date), weekStartKey(today), k => shiftKey(k, 7), met)
  }
  const scheduled = rangeKeys(h.start_date > today ? today : h.start_date, today).filter(k => habitScheduledOn(h, k))
  return streakOverUnits(scheduled, k => habitDoneOn(ws, h, k))
}

export function habitCompletionRate(ws: Workspace, h: Habit, from: DateKey, to: DateKey) {
  const start = from < h.start_date ? h.start_date : from
  if (start > to) return 0
  if (h.frequency.type === 'weekly') {
    const weeks = rangeKeys(weekStartKey(start), weekStartKey(to)).filter((_, i) => i % 7 === 0)
    return pct(weeks.filter(w => habitWeekCount(ws, h, w) >= (h.frequency as { times: number }).times).length, weeks.length)
  }
  const days = rangeKeys(start, to).filter(k => habitScheduledOn(h, k))
  return pct(days.filter(k => habitDoneOn(ws, h, k)).length, days.length)
}

/**
 * Share of all scheduled habit check-ins completed across a range. Weekly-count
 * habits contribute `times` check-ins per week they were active in the range.
 */
export function habitsCompletion(ws: Workspace, from: DateKey, to: DateKey) {
  let due = 0
  let done = 0
  const keys = rangeKeys(from, to)
  for (const h of ws.habits) {
    if (h.archived) continue
    if (h.frequency.type === 'weekly') {
      const times = h.frequency.times
      const weeks = new Map<DateKey, number>()
      for (const key of keys) {
        if (!habitActiveOn(h, key)) continue
        const w = weekStartKey(key)
        weeks.set(w, (weeks.get(w) || 0) + (habitDoneOn(ws, h, key) ? 1 : 0))
      }
      for (const count of weeks.values()) { due += times; done += Math.min(count, times) }
      continue
    }
    for (const key of keys) {
      if (!habitScheduledOn(h, key)) continue
      due++
      if (habitDoneOn(ws, h, key)) done++
    }
  }
  return { due, done, percent: pct(done, due) }
}

// ---------------------------------------------------------------------------
// Streaks

function streakOverUnits(units: DateKey[], ok: (k: DateKey) => boolean): StreakResult {
  let longest = 0
  let run = 0
  for (const u of units) { run = ok(u) ? run + 1 : 0; longest = Math.max(longest, run) }
  // Current: trailing run, but an unfinished last unit (today) doesn't break it.
  let current = 0
  for (let i = units.length - 1; i >= 0; i--) {
    if (ok(units[i])) current++
    else if (i === units.length - 1) continue
    else break
  }
  return { current, longest: Math.max(longest, current) }
}

function runStreak(first: DateKey, last: DateKey, next: (k: DateKey) => DateKey, ok: (k: DateKey) => boolean): StreakResult {
  const units: DateKey[] = []
  for (let k = first; k <= last; k = next(k)) units.push(k)
  return streakOverUnits(units, ok)
}

const streakStart = (ws: Workspace, today: DateKey) => {
  const first = index(ws).firstActivity
  return first && first < today ? first : today
}

/** Consecutive days reaching the minimum productive time. */
export const productivityStreak = (ws: Workspace, today = todayKey()) =>
  runStreak(streakStart(ws, today), today, k => shiftKey(k, 1), k => secondsOn(ws, k) >= ws.settings.min_minutes_day * 60)

/** Consecutive weeks reaching the weekly target. */
export const weeklyStreak = (ws: Workspace, today = todayKey()) =>
  runStreak(weekStartKey(streakStart(ws, today)), weekStartKey(today), k => shiftKey(k, 7), k => secondsIn(ws, k, shiftKey(k, 6)) >= weekTargetMinutes(ws, k) * 60)

/** Consecutive days with any tracked time for a goal. */
export function goalStreak(ws: Workspace, goal: Goal, today = todayKey()) {
  const days = new Set(goalSessions(ws, goal).map(s => s.date))
  return runStreak(streakStart(ws, today), today, k => shiftKey(k, 1), k => days.has(k))
}

/** Consecutive days with any tracked time in a category. */
export function categoryStreak(ws: Workspace, category: string, today = todayKey()) {
  const days = new Set(ws.sessions.filter(s => s.category === category).map(s => s.date))
  return runStreak(streakStart(ws, today), today, k => shiftKey(k, 1), k => days.has(k))
}

const CATEGORY_ICONS: Record<string, string> = { Work: '💼', Coding: '💻', Learning: '🧠', Study: '📚', Creative: '🎨', Exercise: '🏃', Personal: '🌿' }

export type StreakItem = { key: string; kind: 'productivity' | 'weekly' | 'habit' | 'goal' | 'category'; label: string; icon: string; unit: 'day' | 'week'; current: number; longest: number; color: string }

export function allStreaks(ws: Workspace, today = todayKey()): StreakItem[] {
  const items: StreakItem[] = []
  const p = productivityStreak(ws, today)
  items.push({ key: 'productivity', kind: 'productivity', label: 'Productivity', icon: '🔥', unit: 'day', ...p, color: '#c45d82' })
  const w = weeklyStreak(ws, today)
  items.push({ key: 'weekly', kind: 'weekly', label: 'Weekly target', icon: '🎯', unit: 'week', ...w, color: '#c45d82' })
  for (const h of ws.habits.filter(h => !h.archived)) {
    const s = habitStreak(ws, h, today)
    items.push({ key: `habit:${h.id}`, kind: 'habit', label: h.name, icon: h.icon, unit: h.frequency.type === 'weekly' ? 'week' : 'day', ...s, color: h.color })
  }
  for (const g of activeGoals(ws)) {
    const s = goalStreak(ws, g, today)
    if (s.longest > 0) items.push({ key: `goal:${g.id}`, kind: 'goal', label: g.title, icon: '🎯', unit: 'day', ...s, color: g.color })
  }
  for (const c of ws.categories as Category[]) {
    const s = categoryStreak(ws, c.name, today)
    if (s.longest > 1) items.push({ key: `category:${c.name}`, kind: 'category', label: c.name, icon: CATEGORY_ICONS[c.name] || '⏱️', unit: 'day', ...s, color: c.color })
  }
  return items
}

export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365]
export const nextMilestone = (n: number) => STREAK_MILESTONES.find(m => m > n) ?? n + 100

// ---------------------------------------------------------------------------
// Day summary (for calendars, week columns and dashboards)

export type DayStatus = 'empty' | 'started' | 'minimum' | 'target'

export function dayStatus(ws: Workspace, key: DateKey): DayStatus {
  const s = secondsOn(ws, key)
  if (s <= 0) return 'empty'
  if (s >= dayTargetMinutes(ws, key) * 60) return 'target'
  if (s >= ws.settings.min_minutes_day * 60) return 'minimum'
  return 'started'
}

export function daySummary(ws: Workspace, key: DateKey) {
  const tasks = tasksOn(ws, key)
  const habits = habitsForDay(ws, key)
  const habitsDone = habits.filter(h => habitDoneOn(ws, h, key)).length
  const tasksDone = tasks.filter(t => t.done).length
  const seconds = secondsOn(ws, key)
  const targetSeconds = dayTargetMinutes(ws, key) * 60
  const items = tasks.length + habits.length
  return {
    key,
    seconds,
    targetSeconds,
    plannedSeconds: plannedSecondsOn(ws, key),
    progress: pctCapped(seconds, targetSeconds),
    tasks,
    tasksDone,
    habits,
    habitsDone,
    completion: items ? pct(tasksDone + habitsDone, items) : 0, // checklist completion
    events: eventsOn(ws, key),
    blocks: blocksOn(ws, key),
    journal: ws.journal.find(j => j.date === key),
    goalsCompleted: ws.goals.filter(g => g.completed_at && toKey(new Date(g.completed_at)) === key),
    status: dayStatus(ws, key),
  }
}

// ---------------------------------------------------------------------------
// Period summaries (weekly / monthly reviews, comparisons)

export function periodSummary(ws: Workspace, from: DateKey, to: DateKey) {
  const sessions = sessionsIn(ws, from, to)
  const seconds = sumSeconds(sessions)
  const days = rangeKeys(from, to)
  const elapsed = days.filter(k => k <= todayKey()).length || 1
  const cats = byCategory(ws, sessions)
  const tasks = ws.tasks.filter(t => t.date && inRange(t.date, from, to))
  return {
    seconds,
    sessions: sessions.length,
    averageDaySeconds: seconds / elapsed,
    averageSessionSeconds: averageSessionSeconds(sessions),
    productiveDays: productiveDays(ws, from, to),
    bestDay: bestDay(ws, from, to),
    bestHour: bestHour(sessions),
    topCategory: topSlice(cats),
    categories: cats,
    plan: planVsActual(ws, from, to),
    habits: habitsCompletion(ws, from, to > todayKey() ? todayKey() : to),
    tasksDone: tasks.filter(t => t.done).length,
    tasksTotal: tasks.length,
    goalsCompleted: ws.goals.filter(g => g.completed_at && inRange(toKey(new Date(g.completed_at)), from, to)),
    journalDays: ws.journal.filter(j => inRange(j.date, from, to)).length,
  }
}

/** Percentage change, or null when there is no baseline. */
export const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null)

export const monthLabel = (key: DateKey) => fromKey(monthStartKey(key)).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
