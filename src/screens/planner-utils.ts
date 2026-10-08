import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { minToClock, todayKey } from '../lib/dates'
import type { DateKey, ReviewPeriod } from '../lib/model'
import { review } from '../lib/selectors'
import { useStore } from '../lib/store'

// Non-component helpers shared by the week planner, month planner and calendar.

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/** The `?date=` search param as a date key (today when missing or malformed), plus a setter that keeps other params. */
export function useDateParam(): [DateKey, (key: DateKey) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('date')
  const key = raw && KEY_RE.test(raw) ? raw : todayKey()
  const setKey = useCallback((next: DateKey) => {
    setParams(prev => {
      const p = new URLSearchParams(prev)
      p.set('date', next)
      p.delete('review')
      return p
    }, { replace: true })
  }, [setParams])
  return [key, setKey]
}

/** Scrolls the element into view once when `when` is true (e.g. `?review=1`). */
export function useScrollTo<T extends HTMLElement>(when: boolean, dep: string) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!when || !ref.current) return
    const t = window.setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
    return () => window.clearTimeout(t)
  }, [when, dep])
  return ref
}

/**
 * Review answers with a local draft and debounced autosave. Remount (via `key`)
 * when the period changes. Pending edits are flushed on unmount.
 */
export function useReviewAnswers(period: ReviewPeriod, start: DateKey, delay = 700) {
  const { ws, saveReview } = useStore()
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...review(ws, period, start)?.answers }))
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const pending = useRef<Record<string, string> | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const saveRef = useRef(saveReview)
  useEffect(() => { saveRef.current = saveReview }, [saveReview])

  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    if (!pending.current) return
    saveRef.current(period, start, { answers: pending.current })
    pending.current = null
    setStatus('saved')
  }, [period, start])

  const setAnswer = useCallback((key: string, value: string) => {
    setDraft(d => ({ ...d, [key]: value }))
    pending.current = { ...pending.current, [key]: value }
    setStatus('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, delay)
  }, [flush, delay])

  useEffect(() => () => {
    window.clearTimeout(timer.current)
    if (pending.current) saveRef.current(period, start, { answers: pending.current })
  }, [period, start])

  return { draft, setAnswer, status, flush }
}

export const timeRange = (start: number | null, end: number | null) => (start === null ? 'All day' : `${minToClock(start)}${end !== null ? `–${minToClock(end)}` : ''}`)

/** Hours with up to two decimals, for number inputs. */
export const minutesToHours = (min: number) => Math.round((min / 60) * 100) / 100

/** Minutes since local midnight for an ISO timestamp. */
export const isoToMin = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes() }

// Native HTML5 drag and drop. Each kind has its own MIME type so drop zones can
// accept or refuse during dragover (the payload itself is only readable on drop).
export type DragKind = 'task' | 'block'
const DRAG_MIME: Record<DragKind, string> = { task: 'application/x-nudge-task', block: 'application/x-nudge-block' }

export function startDrag(e: DragEvent, kind: DragKind, id: string) {
  e.dataTransfer.setData(DRAG_MIME[kind], id)
  e.dataTransfer.setData('text/plain', id)
  e.dataTransfer.effectAllowed = 'move'
}

/** Which kind is being dragged (readable during dragover). */
export function dragKind(e: DragEvent): DragKind | null {
  const types = Array.from(e.dataTransfer.types)
  if (types.includes(DRAG_MIME.task)) return 'task'
  if (types.includes(DRAG_MIME.block)) return 'block'
  return null
}

export const dragId = (e: DragEvent, kind: DragKind) => e.dataTransfer.getData(DRAG_MIME[kind]) || null
