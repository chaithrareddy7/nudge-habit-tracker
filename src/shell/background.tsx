import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { monthEndKey, minToClock, nowMin, todayKey, weekday } from '../lib/dates'
import { routes } from '../lib/routes'
import { activeTimerSeconds, allStreaks, habitDoneOn, habitsForDay, STREAK_MILESTONES } from '../lib/selectors'
import { useStore } from '../lib/store'
import { useToast } from '../ui/kit'

// ---------------------------------------------------------------------------
// Reminders: checked every 20s while the app is open. Fires an in-app toast
// and, if allowed, a browser notification. (Background push while the app is
// closed needs a push service — see README.)

const FIRED_KEY = 'nudge-reminders-fired'

function alreadyFired(id: string) {
  try {
    const fired = JSON.parse(localStorage.getItem(FIRED_KEY) || '{}') as Record<string, string>
    const today = todayKey()
    if (fired[id] === today) return true
    // Keep only today's entries.
    const next = Object.fromEntries(Object.entries(fired).filter(([, d]) => d === today))
    next[id] = today
    localStorage.setItem(FIRED_KEY, JSON.stringify(next))
    return false
  } catch { return false }
}

export function useReminders() {
  const { ws } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const wsRef = useRef(ws)
  useEffect(() => { wsRef.current = ws }, [ws])

  useEffect(() => {
    const check = () => {
      const w = wsRef.current
      const today = todayKey()
      const now = minToClock(nowMin())
      const due: Array<{ id: string; title: string; body: string; to: string }> = []
      for (const h of habitsForDay(w, today)) if (h.reminder_time === now && !habitDoneOn(w, h, today)) due.push({ id: `habit:${h.id}`, title: `${h.icon} ${h.name}`, body: 'Time for your habit.', to: routes.today })
      for (const t of w.tasks) if (t.date === today && !t.done && t.reminder_time === now) due.push({ id: `task:${t.id}`, title: t.title, body: 'Task reminder', to: routes.day(today) })
      for (const b of w.blocks) if (b.date === today && b.reminder && minToClock(b.start_min) === now) due.push({ id: `block:${b.id}`, title: `Planned: ${b.title}`, body: `${minToClock(b.start_min)}–${minToClock(b.end_min)} · start the timer when you begin`, to: routes.timer })
      for (const e of w.events) if (e.date === today && e.reminder && e.start_min !== null && minToClock(Math.max(0, e.start_min - 10)) === now) due.push({ id: `event:${e.id}`, title: e.title, body: `Starts at ${minToClock(e.start_min)}`, to: routes.day(today) })
      for (const r of w.reminders) {
        if (!r.enabled || r.time !== now) continue
        if (r.kind === 'monthly_review' ? today !== monthEndKey(today) : !r.days.includes(weekday(today))) continue
        if (r.kind === 'journal' && w.journal.some(j => j.date === today && (j.body || j.went_well))) continue
        const to = r.kind === 'journal' ? routes.journal(today) : r.kind === 'weekly_review' ? routes.weekReview() : r.kind === 'monthly_review' ? routes.monthReview() : r.kind === 'planning' ? routes.week() : routes.today
        due.push({ id: `rem:${r.id}`, title: r.title, body: 'Reminder', to })
      }
      for (const d of due) {
        if (alreadyFired(d.id)) continue
        toast(<span><b>{d.title}</b> — {d.body}</span>, { action: { label: 'Open', onClick: () => navigate(d.to) }, ms: 8000 })
        if (w.settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const n = new Notification(d.title, { body: d.body, icon: '/favicon.svg', tag: d.id })
            n.onclick = () => { window.focus(); navigate(d.to) }
          } catch { /* some browsers only allow notifications from a service worker */ }
        }
      }
    }
    check()
    const id = window.setInterval(check, 20_000)
    return () => window.clearInterval(id)
  }, [toast, navigate])
}

// ---------------------------------------------------------------------------
// "Just 5 minutes": once the mini-goal is reached, a kind nudge — keep going or stop.

export function useTimerGoal() {
  const { ws, updateSettings, stopTimer } = useStore()
  const toast = useToast()
  const t = ws.settings.active_timer
  const goal = t?.goal_seconds && !t.goal_reached ? t.goal_seconds : 0
  useEffect(() => {
    if (!goal || !t) return
    const check = () => {
      if (activeTimerSeconds(ws, Date.now()) < goal) return
      updateSettings({ active_timer: { ...t, goal_reached: true } })
      toast(`${Math.round(goal / 60)} minutes done — that’s a real start. Keep going, or stop here: both count.`, { tone: 'celebrate', ms: 9000, action: { label: 'Stop here', onClick: stopTimer } })
    }
    check()
    const id = window.setInterval(check, 3000)
    return () => window.clearInterval(id)
  }, [goal, t, ws, updateSettings, stopTimer, toast])
}

// ---------------------------------------------------------------------------
// Subtle streak celebrations: milestones (3, 7, 14, 21, 30…) and new records.

export function useCelebrations() {
  const { ws, updateSettings } = useStore()
  const toast = useToast()
  const signature = `${ws.sessions.length}|${ws.completions.length}|${ws.completions.reduce((n, c) => n + c.amount, 0)}|${ws.sessions.reduce((n, s) => n + s.duration_seconds, 0)}`
  useEffect(() => {
    if (!ws.settings.onboarded) return
    const seen = ws.settings.milestones_seen
    const streaks = allStreaks(ws)
    const first = !seen._init
    const next: Record<string, number> = { ...seen, _init: 1 }
    let message: string | null = null
    for (const s of streaks) {
      const prev = seen[s.key] ?? 0
      const bestKey = `best:${s.key}`
      const prevBest = seen[bestKey] ?? 0
      if (!first && s.current > prev) {
        const unit = `${s.unit}${s.current === 1 ? '' : 's'}`
        if (s.current === prevBest + 1 && prevBest >= 3) message = `${s.icon} New personal best — ${s.label}, ${s.current} ${unit}`
        else if (STREAK_MILESTONES.includes(s.current)) message = `${s.icon} ${s.label}: ${s.current} ${unit} in a row`
      }
      next[s.key] = s.current
      // The record to beat only moves once a run ends, so "new best" fires once per run.
      if (first || s.current < s.longest || !s.current) next[bestKey] = s.longest
    }
    const changed = Object.keys(next).some(k => next[k] !== seen[k])
    if (changed) updateSettings({ milestones_seen: next })
    if (message) toast(message, { tone: 'celebrate', ms: 4500 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ws.settings.onboarded])
}
