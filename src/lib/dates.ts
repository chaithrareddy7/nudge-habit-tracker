import { addDays, differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import type { DateKey } from './model'

// All date keys are local calendar dates. Never derive them with toISOString(),
// which would shift late-evening activity into the next (UTC) day.

export const toKey = (date: Date): DateKey => format(date, 'yyyy-MM-dd')
export const fromKey = (key: DateKey): Date => parseISO(key)
export const todayKey = (): DateKey => toKey(new Date())
export const shiftKey = (key: DateKey, days: number): DateKey => toKey(addDays(fromKey(key), days))
export const daysBetween = (from: DateKey, to: DateKey) => differenceInCalendarDays(fromKey(to), fromKey(from))

export const weekStartKey = (key: DateKey): DateKey => toKey(startOfWeek(fromKey(key), { weekStartsOn: 1 }))
export const monthStartKey = (key: DateKey): DateKey => toKey(startOfMonth(fromKey(key)))
export const monthEndKey = (key: DateKey): DateKey => toKey(endOfMonth(fromKey(key)))
export const monthKey = (key: DateKey) => key.slice(0, 7) // yyyy-MM
export const yearKey = (key: DateKey) => key.slice(0, 4)

/** Inclusive list of date keys. */
export function rangeKeys(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = []
  for (let k = from; k <= to; k = shiftKey(k, 1)) out.push(k)
  return out
}
export const weekKeys = (key: DateKey) => { const start = weekStartKey(key); return rangeKeys(start, shiftKey(start, 6)) }
export const monthKeys = (key: DateKey) => rangeKeys(monthStartKey(key), monthEndKey(key))
/** 6×7 grid of keys for a Monday-first month calendar. */
export const monthGridKeys = (key: DateKey) => { const start = weekStartKey(monthStartKey(key)); return rangeKeys(start, shiftKey(start, 41)) }

export const inRange = (key: DateKey, from: DateKey, to: DateKey) => key >= from && key <= to

/** 0 = Sunday … 6 = Saturday, like Date#getDay. */
export const weekday = (key: DateKey) => fromKey(key).getDay()

export const fmt = (key: DateKey, pattern: string) => format(fromKey(key), pattern)

/** "3h 42m", "45m", "0m". */
export function formatDuration(seconds: number, opts: { short?: boolean } = {}) {
  const total = Math.max(0, Math.round(seconds / 60))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (opts.short && h && !m) return `${h}h`
  if (!h) return `${m}m`
  return `${h}h ${String(m).padStart(2, '0')}m`
}
export const formatMinutes = (minutes: number, opts?: { short?: boolean }) => formatDuration(minutes * 60, opts)
/** Decimal hours for axis labels, e.g. 3.5 */
export const toHours = (seconds: number) => Math.round((seconds / 3600) * 10) / 10

/** "09:30" for 570. */
export const minToClock = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
export const clockToMin = (clock: string) => { const [h, m] = clock.split(':').map(Number); return (h || 0) * 60 + (m || 0) }
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }

/** 00:12:07 for a live timer. */
export function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':')
}

export function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
