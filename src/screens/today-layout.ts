import type { DashboardLayout } from '../lib/model'

// Arrangement rules for the customisable Today board. Pure functions so they're
// easy to reason about; the board component owns drag state and rendering.

export const WIDGET_IDS = ['schedule', 'tasks', 'habits', 'checkin', 'goals', 'streaks', 'upcoming', 'numbers'] as const
export type WidgetId = (typeof WIDGET_IDS)[number]
export type ColumnCount = 1 | 2 | 3
export type Columns = WidgetId[][]

/** Balanced defaults per column count (by typical card heights). */
export const DEFAULT_LAYOUTS: Record<ColumnCount, Columns> = {
  3: [['schedule', 'numbers'], ['habits', 'tasks'], ['checkin', 'goals', 'streaks', 'upcoming']],
  2: [['schedule', 'tasks', 'streaks', 'upcoming'], ['habits', 'checkin', 'goals', 'numbers']],
  1: [['schedule', 'habits', 'tasks', 'checkin', 'goals', 'streaks', 'upcoming', 'numbers']],
}

/** Content-width breakpoints for the board (not the viewport). */
export const columnsForWidth = (width: number): ColumnCount => (width >= 1020 ? 3 : width >= 660 ? 2 : 1)

const isWidget = (id: string): id is WidgetId => (WIDGET_IDS as readonly string[]).includes(id)

/**
 * The saved arrangement for `count` columns, repaired: unknown ids dropped,
 * duplicates removed, hidden cards removed, and any card missing from the
 * saved layout (e.g. newly added in an update) placed where the default puts it.
 */
export function resolveColumns(saved: DashboardLayout | null, count: ColumnCount): Columns {
  const hidden = new Set(saved?.hidden ?? [])
  const raw = saved?.layouts[String(count) as '1' | '2' | '3']
  const base: Columns = raw && raw.length === count ? raw.map(col => col.filter(isWidget)) : DEFAULT_LAYOUTS[count].map(col => [...col])
  const seen = new Set<WidgetId>()
  const cols = base.map(col => col.filter(id => !seen.has(id) && (seen.add(id), true)).filter(id => !hidden.has(id)))
  for (const id of WIDGET_IDS) {
    if (seen.has(id) || hidden.has(id)) continue
    const home = DEFAULT_LAYOUTS[count].findIndex(col => col.includes(id))
    cols[Math.max(0, home)].push(id)
  }
  return cols
}

export const hiddenWidgets = (saved: DashboardLayout | null): WidgetId[] => (saved?.hidden ?? []).filter(isWidget)

/** New saved state with `cols` stored for `count` columns. */
export function withColumns(saved: DashboardLayout | null, count: ColumnCount, cols: Columns): DashboardLayout {
  return { hidden: saved?.hidden ?? [], layouts: { ...(saved?.layouts ?? {}), [String(count)]: cols } }
}

/** Hide a card everywhere. */
export function withHidden(saved: DashboardLayout | null, id: WidgetId): DashboardLayout {
  return { layouts: saved?.layouts ?? {}, hidden: [...new Set([...(saved?.hidden ?? []), id])] }
}

/** Show a hidden card again; it returns to the top of the shortest column in the current layout. */
export function withShown(saved: DashboardLayout | null, id: WidgetId, count: ColumnCount, current: Columns): DashboardLayout {
  const cols = current.map(col => [...col])
  const shortest = cols.reduce((best, col, i) => (col.length < cols[best].length ? i : best), 0)
  cols[shortest].unshift(id)
  return { hidden: (saved?.hidden ?? []).filter(h => h !== id), layouts: { ...(saved?.layouts ?? {}), [String(count)]: cols } }
}

/** Which column holds `id` (or the column whose drop zone id is `col-N`). */
export function findColumn(cols: Columns, id: string): number {
  const m = /^col-(\d)$/.exec(id)
  if (m) return Number(m[1])
  return cols.findIndex(col => col.includes(id as WidgetId))
}
