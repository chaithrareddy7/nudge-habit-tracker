import { supabase } from './supabase'

// Browser side of push notifications: permission, device subscription, test.
// The server side lives in supabase/functions/push.

export const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || ''
const DEVICE_FLAG = 'nudge-push-device'

export type PushSupport =
  | 'ok'
  | 'unsupported' // browser has no Push API
  | 'ios-install' // iPhone/iPad Safari: must be added to the Home Screen first
  | 'not-configured' // deployment has no VAPID key / Supabase
  | 'denied' // the user blocked notifications in the browser

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export function pushSupport(): PushSupport {
  if (!VAPID_PUBLIC_KEY || !supabase) return 'not-configured'
  if (isIos() && !isStandalone()) return 'ios-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return 'ok'
}

export const pushOnThisDevice = () => { try { return localStorage.getItem(DEVICE_FLAG) === '1' } catch { return false } }
const setFlag = (on: boolean) => { try { if (on) localStorage.setItem(DEVICE_FLAG, '1'); else localStorage.removeItem(DEVICE_FLAG) } catch { /* storage unavailable */ } }

function keyBytes(base64url: string) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function registration() {
  const timeout = new Promise<null>(r => setTimeout(() => r(null), 8000))
  return Promise.race([navigator.serviceWorker.ready, timeout])
}

async function save(sub: PushSubscription, userId: string) {
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await supabase!.from('nudge_push_subscriptions').upsert({
    user_id: userId,
    id: await sha256(json.endpoint),
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    user_agent: navigator.userAgent.slice(0, 200),
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'user_id,id' })
  if (error) throw new Error(error.message)
}

/** Ask permission, subscribe this device and register it with the server. */
export async function enablePush(userId: string): Promise<{ ok: boolean; message: string }> {
  const support = pushSupport()
  if (support !== 'ok') return { ok: false, message: support }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, message: 'Notifications were not allowed. You can change this in your browser’s site settings.' }
  const reg = await registration()
  if (!reg) return { ok: false, message: 'The app’s background worker isn’t ready yet. Reload the page and try again.' }
  try {
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
    await save(sub, userId)
    setFlag(true)
    return { ok: true, message: 'Notifications are on for this device.' }
  } catch (e) {
    return { ok: false, message: `Couldn’t turn on notifications: ${(e as Error).message}` }
  }
}

/** Unsubscribe this device and remove it from the server. */
export async function disablePush(): Promise<void> {
  setFlag(false)
  const reg = 'serviceWorker' in navigator ? await registration() : null
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  if (supabase) await supabase.from('nudge_push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe().catch(() => {})
}

/** Keep the server's copy fresh (timezone changes, rotated endpoints). Safe to call on every launch. */
export async function refreshPush(userId: string) {
  if (!pushOnThisDevice() || pushSupport() !== 'ok' || Notification.permission !== 'granted') return
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) await save(sub, userId).catch(() => {})
  else setFlag(false)
}

export async function sendTestPush(): Promise<{ ok: boolean; message: string }> {
  if (!supabase) return { ok: false, message: 'Sync isn’t configured.' }
  const { data, error } = await supabase.functions.invoke('push', { body: { action: 'test' } })
  if (error) return { ok: false, message: 'The notification server isn’t reachable yet — check the setup steps in the README.' }
  return data?.ok ? { ok: true, message: 'Sent! It should appear in a few seconds.' } : { ok: false, message: data?.message || 'No device received it.' }
}

/** Show a notification from the page (used for in-app reminders when push is off). */
export async function showLocalNotification(title: string, body: string, url: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false
  const reg = 'serviceWorker' in navigator ? await registration() : null
  if (reg) { await reg.showNotification(title, { body, icon: '/pwa-192.png', badge: '/badge-96.png', tag: `local-${title}`, data: { url } }); return true }
  new Notification(title, { body, icon: '/pwa-192.png' })
  return true
}
