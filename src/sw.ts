/// <reference lib="webworker" />
// Nudge service worker: offline app shell + push notifications.
// Built by vite-plugin-pwa (injectManifest), so __WB_MANIFEST is filled in at build time.

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

declare let self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

type PushAction = { action: string; title: string; url?: string; token?: string }
type PushPayload = { title: string; body: string; tag?: string; url?: string; actions?: PushAction[]; api?: string; kind?: string }

const ICON = '/pwa-192.png'
const BADGE = '/badge-96.png'

self.addEventListener('push', event => {
  let data: PushPayload
  try { data = event.data?.json() as PushPayload } catch { data = { title: 'Nudge', body: event.data?.text() || '' } }
  if (!data?.title) return
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: ICON,
    badge: BADGE,
    tag: data.tag,
    // A new nudge with the same tag replaces the old one and alerts again.
    renotify: Boolean(data.tag),
    data,
    actions: (data.actions || []).slice(0, 2).map(a => ({ action: a.action, title: a.title })),
  } as NotificationOptions))
})

async function openUrl(url: string) {
  const target = new URL(url, self.location.origin).href
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const existing = windows.find(w => new URL(w.url).origin === self.location.origin) as WindowClient | undefined
  if (existing) {
    await existing.focus()
    if ('navigate' in existing) return existing.navigate(target)
    return existing
  }
  return self.clients.openWindow(target)
}

self.addEventListener('notificationclick', event => {
  const n = event.notification
  const data = (n.data || {}) as PushPayload
  n.close()
  const chosen = (data.actions || []).find(a => a.action === event.action)

  // "✓ Done" and "⏰ Snooze" run on the server without opening the app.
  if (chosen?.token && data.api) {
    event.waitUntil((async () => {
      try {
        const res = await fetch(data.api!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: chosen.action, token: chosen.token, title: data.title, body: data.body, tag: data.tag, url: data.url }),
        })
        const out = await res.json() as { ok: boolean; title?: string; message?: string }
        if (!out.ok) return void (await openUrl(data.url || '/today'))
        await self.registration.showNotification(out.title || 'Done', { body: out.message, icon: ICON, badge: BADGE, tag: 'nudge-ack', silent: true } as NotificationOptions)
        // Let an open app refresh its data.
        for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'nudge-refresh' })
      } catch {
        await openUrl(data.url || '/today')
      }
    })())
    return
  }

  event.waitUntil(openUrl(chosen?.url || data.url || '/today'))
})
