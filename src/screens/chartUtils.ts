// Small, pure helpers shared by Analytics, Insights and Search.
// Aggregation itself lives in src/lib/selectors.ts — these only shape it for display.

import { addMonths } from 'date-fns'
import { fmt, fromKey, monthEndKey, monthStartKey, rangeKeys, shiftKey, toKey, todayKey, weekStartKey } from '../lib/dates'
import type { DateKey, Workspace } from '../lib/model'
import { byHour, secondsIn, sessionsIn, weekTargetMinutes, monthTargetMinutes } from '../lib/selectors'

/** "9 AM", "12 PM". */
export const hourLabel = (h: number) => `${h % 12 || 12} ${h % 24 < 12 ? 'AM' : 'PM'}`
/** "9:05 AM" for minutes since midnight. */
export const minuteLabel = (min: number) => { const h = Math.floor(min / 60) % 24; return `${h % 12 || 12}:${String(min % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }
/** "9a", "3p" for dense axes. */
export const shortHour = (h: number) => `${h % 12 || 12}${h % 24 < 12 ? 'a' : 'p'}`
/** "9–11 AM" or "11 AM–1 PM". */
export function hourWindow(from: number, to: number) {
  const a = hourLabel(from)
  const b = hourLabel(to)
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const partOfDay = (h: number) => (h < 12 ? 'mornings' : h < 17 ? 'afternoons' : 'evenings')

/** Axis ticks (in seconds) on round hour steps, at most ~5 of them. */
export function hourTicks(maxSeconds: number) {
  const maxH = Math.max(maxSeconds / 3600, 1)
  const steps = [0.5, 1, 2, 3, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
  const step = steps.find(s => maxH / s <= 4) ?? Math.ceil(maxH / 4)
  const n = Math.max(1, Math.ceil(maxH / step))
  return Array.from({ length: n + 1 }, (_, i) => i * step * 3600)
}
export const hourTick = (v: number) => `${Math.round((v / 3600) * 10) / 10}h`

/** Signed percentage phrase: "up 23%", "down 8%", "level". */
export function trendWord(c: number | null) {
  if (c === null) return null
  if (c === 0) return 'level'
  return c > 0 ? `up ${c}%` : `down ${Math.abs(c)}%`
}

/** Last `count` weeks ending with the week of `end`, oldest first. */
export function weekSeries(ws: Workspace, count: number, end = todayKey()) {
  const last = weekStartKey(end)
  return Array.from({ length: count }, (_, i) => {
    const start = shiftKey(last, (i - count + 1) * 7)
    const to = shiftKey(start, 6)
    return { key: start, label: fmt(start, 'MMM d'), full: `Week of ${fmt(start, 'MMM d, yyyy')}`, seconds: secondsIn(ws, start, to), target: weekTargetMinutes(ws, start) * 60 }
  })
}

/** Last `count` months ending with the month of `end`, oldest first. */
export function monthSeries(ws: Workspace, count: number, end = todayKey()) {
  const last = fromKey(monthStartKey(end))
  return Array.from({ length: count }, (_, i) => {
    const start = toKey(addMonths(last, i - count + 1))
    return { key: start, label: fmt(start, 'MMM'), full: fmt(start, 'MMMM yyyy'), seconds: secondsIn(ws, start, monthEndKey(start)), target: monthTargetMinutes(ws, start) * 60 }
  })
}

/** Seconds per weekday (Mon first) × hour (0–23) for the heatmap. */
export function weekdayHourGrid(ws: Workspace, from: DateKey, to: DateKey) {
  const sessions = sessionsIn(ws, from, to)
  return Array.from({ length: 7 }, (_, d) => byHour(sessions.filter(s => (fromKey(s.date).getDay() + 6) % 7 === d)))
}

/** Best consecutive two-hour window from a 24-slot byHour array. */
export function bestWindow(hours: number[]) {
  let best = -1
  let at = 0
  for (let h = 0; h < 23; h++) { const v = hours[h] + hours[h + 1]; if (v > best) { best = v; at = h } }
  const total = hours.reduce((a, b) => a + b, 0)
  return best > 0 ? { from: at, to: at + 2, share: Math.round((best / total) * 100) } : null
}

/** Number of each weekday (Mon first) in a range, for per-weekday averages. */
export function weekdayCounts(from: DateKey, to: DateKey) {
  const out = Array<number>(7).fill(0)
  for (const k of rangeKeys(from, to)) out[(fromKey(k).getDay() + 6) % 7]++
  return out
}
