// Decides which notifications are due for one person right now.
//
// Pure TypeScript with no runtime-specific APIs, so the same rules run in the
// Supabase Edge Function (push while the app is closed) and in the web app
// (in-app reminders while it's open).

import { pick } from './messages.ts'

export type NudgeStyle = 'gentle' | 'balanced' | 'coach'

export type NotifyPrefs = {
  style: NudgeStyle
  morning: { on: boolean; time: string }
  blocks: boolean
  habits: boolean
  tasks: boolean
  events: boolean
  not_started: boolean
  streak: { on: boolean; time: string }
  evening: { on: boolean; time: string }
  weekly: { on: boolean; day: number; time: string } // day: 0 = Sunday
  monthly: { on: boolean; time: string } // last day of the month
  quiet: { on: boolean; from: string; to: string }
}

export const DEFAULT_NOTIFY: NotifyPrefs = {
  style: 'balanced',
  morning: { on: true, time: '08:30' },
  blocks: true,
  habits: true,
  tasks: true,
  events: true,
  not_started: true,
  streak: { on: true, time: '20:00' },
  evening: { on: true, time: '21:30' },
  weekly: { on: true, day: 0, time: '18:00' },
  monthly: { on: true, time: '18:00' },
  quiet: { on: true, from: '22:30', to: '07:30' },
}

/** Merge stored prefs (possibly partial or from an older version) with defaults. */
export function resolvePrefs(stored: Partial<NotifyPrefs> | null | undefined): NotifyPrefs {
  const s = stored || {}
  return {
    ...DEFAULT_NOTIFY,
    ...s,
    morning: { ...DEFAULT_NOTIFY.morning, ...s.morning },
    streak: { ...DEFAULT_NOTIFY.streak, ...s.streak },
    evening: { ...DEFAULT_NOTIFY.evening, ...s.evening },
    weekly: { ...DEFAULT_NOTIFY.weekly, ...s.weekly },
    monthly: { ...DEFAULT_NOTIFY.monthly, ...s.monthly },
    quiet: { ...DEFAULT_NOTIFY.quiet, ...s.quiet },
  }
}

/** How pushy each style is. */
export const STYLES: Record<NudgeStyle, { label: string; blurb: string; notStarted: number[]; followUp: boolean; cap: number }> = {
  gentle: { label: 'Gentle', blurb: 'A few calm reminders. One “not started yet” check in the afternoon.', notStarted: [15 * 60], followUp: false, cap: 4 },
  balanced: { label: 'Balanced', blurb: 'Reminders plus friendly nudges at late morning and mid-afternoon.', notStarted: [11 * 60 + 30, 15 * 60 + 30], followUp: true, cap: 8 },
  coach: { label: 'Coach', blurb: 'For tough procrastination days: more check-ins and follow-ups when a block doesn’t start.', notStarted: [10 * 60 + 30, 13 * 60 + 30, 16 * 60 + 30], followUp: true, cap: 14 },
}

/** Everything the planner needs about one person's day, in their local time. */
export type DaySnapshot = {
  date: string // yyyy-MM-dd (local)
  minute: number // minutes since local midnight, now
  weekday: number // 0 = Sunday
  lastDayOfMonth: boolean
  name: string
  prefs: NotifyPrefs
  focus: string
  trackedSeconds: number // today, including a running timer
  timerRunning: boolean
  minSeconds: number // daily minimum for the productivity streak
  streak: number // productivity streak up to yesterday
  habits: Array<{ id: string; name: string; icon: string; reminder_time: string | null; target: number; unit: string; done: boolean }>
  tasks: Array<{ id: string; title: string; reminder_time: string | null; done: boolean }>
  blocks: Array<{ id: string; title: string; start_min: number; end_min: number; started: boolean }> // focus blocks only
  events: Array<{ id: string; title: string; start_min: number | null; reminder: boolean }>
  journalDone: boolean
}

export type NotifyAction = { action: string; title: string; url?: string }

export type Planned = {
  key: string // unique per person per day, used to never send twice
  at: number // local minute it's due
  kind: string
  priority: 1 | 2 | 3 // 1 = reminders you set, 2 = reviews, 3 = nudges (dropped first when capped)
  title: string
  body: string
  url: string
  tag: string
  actions: NotifyAction[]
  ref?: string // habit/task/block id for server-side actions
}

export const clockToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }
export const minToClock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function inQuietHours(p: NotifyPrefs, minute: number) {
  if (!p.quiet.on) return false
  const from = clockToMin(p.quiet.from)
  const to = clockToMin(p.quiet.to)
  return from <= to ? minute >= from && minute < to : minute >= from || minute < to
}

const START5: NotifyAction = { action: 'start5', title: '▶ Start 5 min', url: '/timer?do=start5' }
const SNOOZE: NotifyAction = { action: 'snooze', title: '⏰ In 15 min' }
const DONE: NotifyAction = { action: 'done', title: '✓ Done' }

/** Every notification that could fire today, with the condition it needs at send time. */
export function plan(s: DaySnapshot): Array<Planned & { when: () => boolean }> {
  const p = s.prefs
  const style = STYLES[p.style] || STYLES.balanced
  const name = s.name ? `, ${s.name.split(' ')[0]}` : ''
  const seed = (kind: string, ref = '') => `${s.date}|${kind}|${ref}`
  const out: Array<Planned & { when: () => boolean }> = []
  const add = (n: Omit<Planned, 'key' | 'tag'> & { when?: () => boolean }) =>
    out.push({ ...n, key: `${s.date}:${n.kind}:${n.ref ?? ''}${n.kind === 'not_started' ? `:${n.at}` : ''}`, tag: `nudge-${n.kind}-${n.ref ?? n.at}`, when: n.when ?? (() => true) })

  if (p.morning.on) {
    const c = s.focus ? pick('morning', seed('morning'), { name, focus: s.focus }) : pick('morningNoFocus', seed('morning'), { name })
    add({ kind: 'morning', at: clockToMin(p.morning.time), priority: 3, ...c, url: '/today', actions: [START5, { action: 'plan', title: '🗓 Plan my day', url: '/plan/day' }], when: () => !s.timerRunning })
  }

  if (p.blocks) {
    for (const b of s.blocks) {
      add({ kind: 'block', ref: b.id, at: b.start_min, priority: 1, ...pick('block', seed('block', b.id), { block: b.title, time: minToClock(b.start_min) }), url: '/today', actions: [{ action: 'start', title: '▶ Start now', url: `/today?do=start-block&id=${encodeURIComponent(b.id)}` }, SNOOZE], when: () => !s.timerRunning })
      if (style.followUp && b.end_min - b.start_min >= 20) {
        add({ kind: 'block_followup', ref: b.id, at: b.start_min + 10, priority: 3, ...pick('blockFollowUp', seed('fu', b.id), { block: b.title }), url: '/today', actions: [{ action: 'start5', title: '▶ Just 5 min', url: `/today?do=start-block&id=${encodeURIComponent(b.id)}&mini=1` }, SNOOZE], when: () => !b.started && !s.timerRunning })
      }
    }
  }

  if (p.habits) {
    for (const h of s.habits) {
      if (!h.reminder_time) continue
      const amount = h.target > 1 ? ` — ${h.target} ${h.unit}`.trimEnd() : ''
      add({ kind: 'habit', ref: h.id, at: clockToMin(h.reminder_time), priority: 1, ...pick('habit', seed('habit', h.id), { habit: `${h.icon} ${h.name}`.trim(), amount }), url: '/today', actions: [DONE, SNOOZE], when: () => !h.done })
    }
  }

  if (p.tasks) {
    for (const t of s.tasks) {
      if (!t.reminder_time) continue
      add({ kind: 'task', ref: t.id, at: clockToMin(t.reminder_time), priority: 1, ...pick('task', seed('task', t.id), { task: t.title }), url: '/tasks', actions: [DONE, SNOOZE], when: () => !t.done })
    }
  }

  if (p.events) {
    for (const e of s.events) {
      if (!e.reminder || e.start_min === null) continue
      add({ kind: 'event', ref: e.id, at: Math.max(0, e.start_min - 10), priority: 1, ...pick('event', seed('event', e.id), { event: e.title, time: minToClock(e.start_min) }), url: '/plan/day', actions: [] })
    }
  }

  if (p.not_started) {
    for (const at of style.notStarted) {
      add({ kind: 'not_started', at, priority: 3, ...pick('notStarted', seed('ns', String(at)), {}), url: '/timer', actions: [START5, SNOOZE], when: () => s.trackedSeconds < 60 && !s.timerRunning })
    }
  }

  if (p.streak.on && s.streak >= 2) {
    const left = Math.max(0, s.minSeconds - s.trackedSeconds)
    const leftText = left >= 3600 ? `${Math.floor(left / 3600)}h ${Math.round((left % 3600) / 60)}m` : `${Math.max(1, Math.round(left / 60))} min`
    add({ kind: 'streak', at: clockToMin(p.streak.time), priority: 3, ...pick('streak', seed('streak'), { streak: s.streak, left: leftText }), url: '/timer', actions: [START5, SNOOZE], when: () => s.trackedSeconds < s.minSeconds && !s.timerRunning })
  }

  if (p.evening.on) {
    add({ kind: 'evening', at: clockToMin(p.evening.time), priority: 2, ...pick('evening', seed('evening'), {}), url: '/journal', actions: [{ action: 'open', title: '✍️ Reflect', url: '/journal' }], when: () => !s.journalDone })
  }

  if (p.weekly.on && s.weekday === p.weekly.day) {
    add({ kind: 'weekly', at: clockToMin(p.weekly.time), priority: 2, ...pick('weekly', seed('weekly'), {}), url: '/plan/week?review=1', actions: [{ action: 'open', title: '📊 Review my week', url: '/plan/week?review=1' }] })
  }

  if (p.monthly.on && s.lastDayOfMonth) {
    add({ kind: 'monthly', at: clockToMin(p.monthly.time), priority: 2, ...pick('monthly', seed('monthly'), {}), url: '/plan/month?review=1', actions: [{ action: 'open', title: '🗓 Review my month', url: '/plan/month?review=1' }] })
  }

  return out
}

/**
 * Notifications to send now: scheduled within the last `windowMin` minutes,
 * not already sent, condition still true, outside quiet hours, and within the
 * style's daily cap (reminders you set win over nudges).
 */
export function due(s: DaySnapshot, sentKeys: Set<string>, sentToday: number, windowMin = 10): Planned[] {
  if (inQuietHours(s.prefs, s.minute)) return []
  const cap = (STYLES[s.prefs.style] || STYLES.balanced).cap
  const room = Math.max(0, cap - sentToday)
  return plan(s)
    .filter(n => n.at <= s.minute && n.at > s.minute - windowMin && !sentKeys.has(n.key) && n.when())
    .sort((a, b) => a.priority - b.priority || a.at - b.at)
    .slice(0, room)
    .map(({ when: _when, ...n }) => n)
}

/** Productivity streak up to (not including) today from daily totals. */
export function streakBefore(today: string, secondsByDay: Map<string, number>, minSeconds: number, shift: (key: string, days: number) => string) {
  let n = 0
  for (let k = shift(today, -1); (secondsByDay.get(k) || 0) >= minSeconds && n < 400; k = shift(k, -1)) n++
  return n
}
