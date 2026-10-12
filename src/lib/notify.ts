import { endOfMonth } from 'date-fns'
import { nowMin, shiftKey, todayKey, toKey, weekday } from './dates'
import type { Workspace } from './model'
import { activeTimerSeconds, blocksOn, dayPlan, eventsOn, habitDoneOn, habitsForDay, productivityStreak, secondsOn, sessionsOn, tasksOn } from './selectors'
import { resolvePrefs, type DaySnapshot } from '../../supabase/functions/push/planner.ts'

export { DEFAULT_NOTIFY, STYLES, due, plan, resolvePrefs, type NotifyPrefs, type NudgeStyle, type Planned } from '../../supabase/functions/push/planner.ts'
export { COPY } from '../../supabase/functions/push/messages.ts'

/** The planner's view of today, built from the local workspace (same rules as the push server). */
export function snapshotFromWorkspace(ws: Workspace, now = Date.now()): DaySnapshot {
  const date = todayKey()
  const minute = nowMin()
  const todays = sessionsOn(ws, date)
  const yesterday = productivityStreak(ws, shiftKey(date, -1)).current
  return {
    date,
    minute,
    weekday: weekday(date),
    lastDayOfMonth: date === toKey(endOfMonth(new Date(now))),
    name: ws.settings.display_name,
    prefs: resolvePrefs(ws.settings.notify),
    focus: dayPlan(ws, date)?.focus || '',
    trackedSeconds: secondsOn(ws, date) + activeTimerSeconds(ws, now),
    timerRunning: Boolean(ws.settings.active_timer?.resumed_at),
    minSeconds: ws.settings.min_minutes_day * 60,
    streak: yesterday,
    habits: habitsForDay(ws, date).map(h => ({ id: h.id, name: h.name, icon: h.icon, reminder_time: h.reminder_time, target: h.target_amount, unit: h.unit, done: habitDoneOn(ws, h, date) })),
    tasks: tasksOn(ws, date).map(t => ({ id: t.id, title: t.title, reminder_time: t.reminder_time, done: t.done })),
    blocks: blocksOn(ws, date).filter(b => b.kind === 'focus').map(b => ({
      id: b.id, title: b.title || b.category, start_min: b.start_min, end_min: b.end_min,
      started: todays.some(s => s.block_id === b.id || (s.category === b.category && (() => { const d = new Date(s.started_at); const m = d.getHours() * 60 + d.getMinutes(); return m >= b.start_min - 15 && m < b.end_min })())),
    })),
    events: eventsOn(ws, date).map(e => ({ id: e.id, title: e.title, start_min: e.start_min, reminder: e.reminder })),
    journalDone: ws.journal.some(j => j.date === date && Boolean(j.body || j.went_well || j.mood)),
  }
}
