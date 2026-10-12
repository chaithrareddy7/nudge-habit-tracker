// Nudge push notifications — Supabase Edge Function (Deno).
//
// POST { action: 'tick' }    every 5 minutes from pg_cron (header x-push-secret)
// POST { action: 'test' }    from the app, with the user's access token
// POST { action: 'done' | 'snooze', token, ... }  from a notification button (signed token)
//
// Secrets (Dashboard → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SECRET, optional VAPID_SUBJECT (mailto:you@example.com)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
// Deploy with JWT verification OFF (this function checks auth itself).

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { pick } from './messages.ts'
import { due, resolvePrefs, streakBefore, type DaySnapshot, type Planned } from './planner.ts'

const env = (k: string) => Deno.env.get(k) ?? ''
const SUPABASE_URL = env('SUPABASE_URL')
const db = createClient(SUPABASE_URL, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
const PUSH_SECRET = env('PUSH_SECRET')
const API = `${SUPABASE_URL}/functions/v1/push`
webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:hello@nudge.app', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ---------------------------------------------------------------------------
// Signed action tokens (so "✓ Done" works without opening the app)

const enc = new TextEncoder()
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
async function hmac(data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(PUSH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}
type Claims = { u: string; a: string; k: string; r: string; d: string; x: number } // user, action, kind, ref, local date, expiry
async function signToken(c: Claims) { const body = btoa(JSON.stringify(c)); return `${body}.${await hmac(body)}` }
async function verifyToken(token: string): Promise<Claims | null> {
  const [body, sig] = String(token || '').split('.')
  if (!body || !sig || (await hmac(body)) !== sig) return null
  const c = JSON.parse(atob(body)) as Claims
  return c.x > Date.now() ? c : null
}

// ---------------------------------------------------------------------------
// Local time per user

function localParts(tz: string, now: Date) {
  let parts: Record<string, string>
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now).map(p => [p.type, p.value]))
  } catch { return localParts('UTC', now) }
  const y = Number(parts.year), m = Number(parts.month), d = Number(parts.day)
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
    lastDayOfMonth: d === new Date(Date.UTC(y, m, 0)).getUTCDate(),
  }
}
const shiftKey = (key: string, days: number) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10) }
const weekStart = (key: string, weekday: number) => shiftKey(key, -((weekday + 6) % 7))

// ---------------------------------------------------------------------------
// Sending

type Sub = { user_id: string; id: string; endpoint: string; p256dh: string; auth: string; timezone: string }

async function sendTo(subs: Sub[], payload: Record<string, unknown>) {
  let delivered = 0
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60, urgency: 'normal' })
      delivered++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await db.from('nudge_push_subscriptions').delete().eq('user_id', s.user_id).eq('id', s.id) // device unsubscribed
      else console.error('push failed', code, (e as Error).message)
    }
  }))
  return delivered
}

async function payloadFor(n: Planned, userId: string, date: string) {
  const exp = Date.now() + 18 * 3600 * 1000
  const actions = await Promise.all(n.actions.map(async a => ({
    action: a.action,
    title: a.title,
    url: a.url,
    token: a.url ? undefined : await signToken({ u: userId, a: a.action, k: n.kind, r: n.ref ?? '', d: date, x: exp }),
  })))
  return { title: n.title, body: n.body, tag: n.tag, url: n.url, actions, api: API, kind: n.kind }
}

// ---------------------------------------------------------------------------
// tick: what's due for everyone right now

async function tick() {
  const now = new Date()
  const { data: subs } = await db.from('nudge_push_subscriptions').select('user_id,id,endpoint,p256dh,auth,timezone')
  const byUser = new Map<string, Sub[]>()
  for (const s of (subs || []) as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s])
  const users = [...byUser.keys()]
  let sent = 0

  // 1) Snoozed notifications that are due.
  const { data: queued } = await db.from('nudge_push_queue').select('id,user_id,payload').is('sent_at', null).lte('due_at', now.toISOString()).limit(500)
  for (const q of queued || []) {
    const s = byUser.get(q.user_id)
    if (s) sent += await sendTo(s, q.payload)
    await db.from('nudge_push_queue').update({ sent_at: now.toISOString() }).eq('id', q.id)
  }
  if (!users.length) return { users: 0, sent }

  // 2) Everyone's day, in their own timezone.
  const local = new Map(users.map(u => [u, localParts(byUser.get(u)![0].timezone, now)]))
  const dates = [...new Set([...local.values()].map(l => l.date))]
  const minDate = shiftKey(dates.sort()[0], -60)
  const maxDate = dates.sort()[dates.length - 1]
  const weekFrom = shiftKey(dates.sort()[0], -7)
  const q = <T>(p: PromiseLike<{ data: T[] | null }>) => p.then(r => r.data || [])
  const [profiles, habits, completions, tasks, blocks, events, sessions, journal, days, log] = await Promise.all([
    q(db.from('profiles').select('id,settings').in('id', users)),
    q(db.from('nudge_habits').select('user_id,id,name,icon,frequency,target_amount,unit,reminder_time,start_date,end_date,archived').in('user_id', users).eq('archived', false)),
    q(db.from('nudge_habit_completions').select('user_id,habit_id,date,amount').in('user_id', users).gte('date', weekFrom).lte('date', maxDate)),
    q(db.from('nudge_tasks').select('user_id,id,title,date,reminder_time,done').in('user_id', users).in('date', dates)),
    q(db.from('nudge_time_blocks').select('user_id,id,title,date,start_min,end_min,kind,category').in('user_id', users).in('date', dates).eq('kind', 'focus')),
    q(db.from('nudge_events').select('user_id,id,title,date,start_min,reminder').in('user_id', users).in('date', dates)),
    q(db.from('nudge_sessions').select('user_id,date,duration_seconds,started_at,block_id,category').in('user_id', users).gte('date', minDate).lte('date', maxDate)),
    q(db.from('nudge_journal_entries').select('user_id,date,body,went_well,mood').in('user_id', users).in('date', dates)),
    q(db.from('nudge_day_plans').select('user_id,date,focus').in('user_id', users).in('date', dates)),
    q(db.from('nudge_push_log').select('user_id,key,sent_on').in('user_id', users).in('sent_on', dates)),
  ])

  for (const u of users) {
    const L = local.get(u)!
    const settings = ((profiles as Array<{ id: string; settings: Record<string, unknown> }>).find(p => p.id === u)?.settings || {}) as Record<string, any>
    const mine = <T extends { user_id: string }>(rows: T[]) => rows.filter(r => r.user_id === u)
    const today = L.date
    const daySessions = mine(sessions as any[]).filter(s => s.date === today)
    const timer = settings.active_timer as { resumed_at: string | null; accumulated_seconds: number } | null
    const live = timer ? timer.accumulated_seconds + (timer.resumed_at ? Math.max(0, (now.getTime() - new Date(timer.resumed_at).getTime()) / 1000) : 0) : 0
    const totals = new Map<string, number>()
    for (const s of mine(sessions as any[])) totals.set(s.date, (totals.get(s.date) || 0) + s.duration_seconds)
    const minSeconds = (Number(settings.min_minutes_day) || 120) * 60
    const ws = weekStart(today, L.weekday)
    const comps = mine(completions as any[])

    const snap: DaySnapshot = {
      ...L,
      name: String(settings.display_name || ''),
      prefs: resolvePrefs(settings.notify),
      focus: String((mine(days as any[]).find(d => d.date === today)?.focus) || ''),
      trackedSeconds: (totals.get(today) || 0) + live,
      timerRunning: Boolean(timer?.resumed_at),
      minSeconds,
      streak: streakBefore(today, totals, minSeconds, shiftKey),
      habits: mine(habits as any[])
        .filter(h => today >= h.start_date && (!h.end_date || today <= h.end_date))
        .filter(h => h.frequency?.type !== 'custom' || (h.frequency.days || []).includes(L.weekday))
        .filter(h => h.frequency?.type !== 'weekly' || new Set(comps.filter(c => c.habit_id === h.id && c.date >= ws && c.amount >= Math.max(1, h.target_amount)).map(c => c.date)).size < h.frequency.times)
        .map(h => ({ id: h.id, name: h.name, icon: h.icon, reminder_time: h.reminder_time, target: h.target_amount, unit: h.unit, done: comps.filter(c => c.habit_id === h.id && c.date === today).reduce((n, c) => n + c.amount, 0) >= Math.max(1, h.target_amount) })),
      tasks: mine(tasks as any[]).filter(t => t.date === today).map(t => ({ id: t.id, title: t.title, reminder_time: t.reminder_time, done: t.done })),
      blocks: mine(blocks as any[]).filter(b => b.date === today).map(b => ({
        id: b.id, title: b.title || b.category, start_min: b.start_min, end_min: b.end_min,
        started: daySessions.some(s => s.block_id === b.id || (s.category === b.category && (() => { const d = new Date(s.started_at); const m = localParts(byUser.get(u)![0].timezone, d).minute; return m >= b.start_min - 15 && m < b.end_min })())),
      })),
      events: mine(events as any[]).filter(e => e.date === today).map(e => ({ id: e.id, title: e.title, start_min: e.start_min, reminder: e.reminder })),
      journalDone: mine(journal as any[]).some(j => j.date === today && (j.body || j.went_well || j.mood)),
    }

    const sentRows = mine(log as any[]).filter(l => l.sent_on === today)
    const list = due(snap, new Set(sentRows.map(l => l.key)), sentRows.length)
    for (const n of list) {
      // Log first so a slow send can never cause a duplicate on the next tick.
      const { error } = await db.from('nudge_push_log').insert({ user_id: u, key: n.key, sent_on: today })
      if (error) continue
      sent += await sendTo(byUser.get(u)!, await payloadFor(n, u, today))
    }
  }
  return { users: users.length, sent }
}

// ---------------------------------------------------------------------------
// Notification buttons

async function act(body: { token: string; title?: string; body?: string; tag?: string; url?: string }) {
  const c = await verifyToken(body.token)
  if (!c) return json({ ok: false, message: 'This button has expired — open Nudge instead.' }, 401)

  if (c.a === 'done' && c.k === 'habit') {
    const { data: h } = await db.from('nudge_habits').select('id,name,icon,target_amount').eq('user_id', c.u).eq('id', c.r).maybeSingle()
    if (!h) return json({ ok: false, message: 'Habit not found.' }, 404)
    const { data: rows } = await db.from('nudge_habit_completions').select('amount').eq('user_id', c.u).eq('habit_id', c.r).eq('date', c.d)
    const have = (rows || []).reduce((n, r) => n + r.amount, 0)
    const need = Math.max(1, h.target_amount)
    if (have < need) await db.from('nudge_habit_completions').insert({ user_id: c.u, id: crypto.randomUUID(), habit_id: c.r, date: c.d, amount: need - have })
    return json({ ok: true, title: `✓ ${h.icon} ${h.name} done`, message: 'Nice — that counts. Streak protected.' })
  }

  if (c.a === 'done' && c.k === 'task') {
    const { data: t } = await db.from('nudge_tasks').update({ done: true, done_at: new Date().toISOString() }).eq('user_id', c.u).eq('id', c.r).select('title').maybeSingle()
    return json({ ok: Boolean(t), title: '✓ Task done', message: t ? `“${t.title}” is off your list.` : 'Task not found.' })
  }

  if (c.a === 'snooze') {
    const payload = { title: `⏰ ${String(body.title || 'Reminder').replace(/^⏰ /, '').slice(0, 120)}`, body: String(body.body || '').slice(0, 300), tag: String(body.tag || 'nudge-snooze').slice(0, 80), url: String(body.url || '/today').slice(0, 200), actions: [{ action: 'start5', title: '▶ Start 5 min', url: '/timer?do=start5' }], api: API, kind: 'snooze' }
    await db.from('nudge_push_queue').insert({ user_id: c.u, due_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), payload })
    return json({ ok: true, title: '⏰ Snoozed for 15 minutes', message: 'We’ll check in again soon.' })
  }

  return json({ ok: false, message: 'Unknown action.' }, 400)
}

async function test(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer /, '')
  const { data } = await db.auth.getUser(token)
  if (!data.user) return json({ ok: false, message: 'Sign in first.' }, 401)
  const { data: subs } = await db.from('nudge_push_subscriptions').select('user_id,id,endpoint,p256dh,auth,timezone').eq('user_id', data.user.id)
  if (!subs?.length) return json({ ok: false, message: 'No devices are subscribed yet.' }, 404)
  const c = pick('test', String(Date.now()), {})
  const delivered = await sendTo(subs as Sub[], { ...c, tag: 'nudge-test', url: '/settings', actions: [{ action: 'start5', title: '▶ Try 5 min', url: '/timer?do=start5' }], api: API, kind: 'test' })
  return json({ ok: delivered > 0, delivered })
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false }, 405)
  let body: Record<string, any> = {}
  try { body = await req.json() } catch { /* empty body */ }
  try {
    if (body.action === 'tick') {
      if (!PUSH_SECRET || req.headers.get('x-push-secret') !== PUSH_SECRET) return json({ ok: false }, 401)
      return json({ ok: true, ...(await tick()) })
    }
    if (body.action === 'test') return await test(req)
    if (body.action === 'done' || body.action === 'snooze') return await act(body as never)
    return json({ ok: false, message: 'Unknown request.' }, 400)
  } catch (e) {
    console.error(e)
    return json({ ok: false, message: 'Something went wrong.' }, 500)
  }
})
