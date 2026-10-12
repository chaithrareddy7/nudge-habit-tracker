import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { minToClock, nowMin, todayKey, weekday } from '../lib/dates'
import { due, snapshotFromWorkspace } from '../lib/notify'
import { pushOnThisDevice, showLocalNotification } from '../lib/push'
import { routes } from '../lib/routes'
import { activeTimerSeconds, allStreaks, STREAK_MILESTONES } from '../lib/selectors'
import { useStore } from '../lib/store'
import { useToast } from '../ui/kit'

// ---------------------------------------------------------------------------
// In-app reminders: the same planner as the push server (supabase/functions/push),
// checked every 20s while the app is open. If this device has push turned on,
// the server sends them instead, so nothing arrives twice.

const FIRED_KEY = 'nudge-reminders-fired'

function firedMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}') as Record<string, string> } catch { return {} }
}
const firedKeys = (today: string) => Object.entries(firedMap()).filter(([, d]) => d === today).map(([k]) => k)
const firedCount = (today: string) => firedKeys(today).filter(k => !k.includes(':custom:')).length

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
  const { ws, user } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const wsRef = useRef(ws)
  const userRef = useRef(user)
  useEffect(() => { wsRef.current = ws; userRef.current = user }, [ws, user])

  useEffect(() => {
    const check = () => {
      const w = wsRef.current
      if (!w.settings.onboarded) return
      // With push on for this signed-in device, the server sends these — don't double up.
      const serverHandles = Boolean(userRef.current) && pushOnThisDevice()
      const items: Array<{ key: string; title: string; body: string; url: string; label: string }> = []
      if (!serverHandles) {
        const today = todayKey()
        const sentToday = firedCount(today)
        for (const n of due(snapshotFromWorkspace(w), new Set(firedKeys(today)), sentToday, 3)) {
          const open = n.actions.find(a => a.url)
          items.push({ key: n.key, title: n.title, body: n.body, url: open?.url || n.url, label: open ? open.title.replace(/^\W+\s*/u, '') : 'Open' })
        }
      }
      // Custom reminders from Settings always fire in the app.
      const now = minToClock(nowMin())
      const today = todayKey()
      for (const r of w.reminders) {
        if (r.kind !== 'custom' || !r.enabled || r.time !== now || !r.days.includes(weekday(today))) continue
        items.push({ key: `${today}:custom:${r.id}`, title: `🔔 ${r.title}`, body: 'Your reminder', url: routes.today, label: 'Open' })
      }
      for (const it of items) {
        if (alreadyFired(it.key)) continue
        toast(<span><b>{it.title}</b> — {it.body}</span>, { action: { label: it.label, onClick: () => navigate(it.url) }, ms: 9000 })
        if (document.hidden) void showLocalNotification(it.title, it.body, it.url)
      }
    }
    check()
    const id = window.setInterval(check, 20_000)
    return () => window.clearInterval(id)
  }, [toast, navigate])
}

/** Buttons on notifications open links like /timer?do=start5 — run them, then tidy the URL. */
export function useNotificationActions() {
  const { ws, startTimer, refresh } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const handled = useRef('')
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const action = params.get('do')
    if (!action || handled.current === location.search) return
    handled.current = location.search
    params.delete('do'); params.delete('id'); params.delete('mini')
    const clean = location.pathname + (params.toString() ? `?${params}` : '')
    if (ws.settings.active_timer) toast('A timer is already running — keep going!')
    else if (action === 'start5') { startTimer({ label: 'Just 5 minutes', goal_seconds: 300 }); toast('▶ Five minutes. That’s all — then decide.', { tone: 'celebrate' }) }
    else if (action === 'start-block') {
      const blockId = new URLSearchParams(location.search).get('id')
      const mini = new URLSearchParams(location.search).get('mini') === '1'
      if (blockId && ws.blocks.some(b => b.id === blockId)) { startTimer({ block_id: blockId, goal_seconds: mini ? 300 : null }); toast(mini ? '▶ Just 5 minutes on your planned block.' : '▶ Timer started for your planned block.', { tone: 'celebrate' }) }
      else { startTimer({ label: 'Just 5 minutes', goal_seconds: 300 }); toast('▶ Timer started.') }
    }
    navigate(clean, { replace: true })
  }, [location.search, location.pathname, ws.settings.active_timer, ws.blocks, startTimer, toast, navigate])

  // A "✓ Done" pressed on a notification updates the server; pull it in.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => { if (e.data?.type === 'nudge-refresh') void refresh() }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [refresh])
}

// ---------------------------------------------------------------------------
// Clear feedback whenever a timer starts, wherever it was started from.
// "Just 5 min" takes you to the Timer screen (big clock, nothing else to look at);
// other starts away from Today/Timer get a toast with "Open timer". The floating
// dock also pulses so the eye finds it.

export function useTimerStartFeedback() {
  const { ws } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const t = ws.settings.active_timer
  const startedAt = t?.started_at ?? null
  const seen = useRef<string | null>(startedAt)
  useEffect(() => {
    if (!startedAt || startedAt === seen.current) { seen.current = startedAt; return }
    seen.current = startedAt
    // Only react to timers started just now on this device (not ones loaded from sync).
    if (Date.now() - new Date(startedAt).getTime() > 10_000) return
    const dock = document.querySelector<HTMLElement>('.timer-dock')
    if (dock) { dock.classList.remove('is-new'); void dock.offsetWidth; dock.classList.add('is-new') } // restart the pulse
    const onFocusScreen = pathname === routes.timer || pathname === routes.today
    if (onFocusScreen) return
    if (t?.goal_seconds) {
      navigate(routes.timer)
      toast('▶ Five minutes — that’s all. When they’re up, keep going or stop.', { tone: 'celebrate' })
    } else {
      toast(<span>▶ Timer running{t?.label ? <> — <b>{t.label}</b></> : ''}</span>, { action: { label: 'Open timer', onClick: () => navigate(routes.timer) }, ms: 6000 })
    }
  }, [startedAt, pathname, t?.goal_seconds, t?.label, navigate, toast])
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
