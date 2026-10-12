import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellOff, BellRing, Check, ChevronRight, MoonStar, Plus, Send, Share, Smartphone, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { COPY, resolvePrefs, STYLES, type NotifyPrefs, type NudgeStyle } from '../lib/notify'
import { disablePush, enablePush, pushOnThisDevice, pushSupport, sendTestPush } from '../lib/push'
import type { Reminder } from '../lib/model'
import { Button, Card, ConfirmButton, useToast } from '../ui/kit'
import './settings-notifications.css'

// Notifications: one place to turn push on for this device, choose how pushy
// Nudge should be, and pick what it sends. Preferences live in
// settings.notify (synced), which the push server reads.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function NotificationsPanel() {
  const { ws, user, updateSettings } = useStore()
  const prefs = resolvePrefs(ws.settings.notify)
  const set = (patch: Partial<NotifyPrefs>) => updateSettings({ notify: { ...prefs, ...patch } })

  return (
    <Card className="span-2 nt" title={<span className="row"><Bell size={16} /> Notifications</span>} sub="Kind, well-timed nudges that help you start — even when Nudge is closed.">
      <DeviceStatus signedIn={Boolean(user)} userId={user?.id} />

      <section className="nt-section" aria-labelledby="nt-style">
        <h3 id="nt-style">Nudge style</h3>
        <div className="nt-styles" role="radiogroup" aria-label="Nudge style">
          {(Object.keys(STYLES) as NudgeStyle[]).map(k => (
            <button key={k} type="button" role="radio" aria-checked={prefs.style === k} className="nt-style" onClick={() => set({ style: k })}>
              <span className="nt-style-head"><b>{STYLES[k].label}</b>{prefs.style === k && <Check size={15} />}</span>
              <span>{STYLES[k].blurb}</span>
              <small>Up to {STYLES[k].cap} a day</small>
            </button>
          ))}
        </div>
      </section>

      <div className="nt-cols">
        <section className="nt-section" aria-labelledby="nt-what">
          <h3 id="nt-what">What to send</h3>
          <div className="nt-list">
            <Row icon="☀️" title="Morning kickoff" hint="Your main focus + a 5-minute start" on={prefs.morning.on} onToggle={on => set({ morning: { ...prefs.morning, on } })}>
              <TimeField value={prefs.morning.time} onChange={time => set({ morning: { ...prefs.morning, time } })} label="Morning kickoff time" />
            </Row>
            <Row icon="⏱" title="Planned blocks" hint={STYLES[prefs.style].followUp ? 'When a block starts, and a gentle follow-up if it doesn’t' : 'When a focus block starts'} on={prefs.blocks} onToggle={blocks => set({ blocks })} />
            <Row icon="🌱" title="“Haven’t started yet” nudges" hint={`If nothing is tracked by ${STYLES[prefs.style].notStarted.map(m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`).join(' and ')}`} on={prefs.not_started} onToggle={not_started => set({ not_started })} />
            <Row icon="📖" title="Habit reminders" hint={<>At each habit’s reminder time · <Link to="/habits">set times</Link></>} on={prefs.habits} onToggle={habits => set({ habits })} />
            <Row icon="✅" title="Task reminders" hint="For tasks with a reminder time" on={prefs.tasks} onToggle={tasks => set({ tasks })} />
            <Row icon="📅" title="Events" hint="10 minutes before" on={prefs.events} onToggle={events => set({ events })} />
            <Row icon="🔥" title="Streak protection" hint="If today is short of your streak minimum" on={prefs.streak.on} onToggle={on => set({ streak: { ...prefs.streak, on } })}>
              <TimeField value={prefs.streak.time} onChange={time => set({ streak: { ...prefs.streak, time } })} label="Streak reminder time" />
            </Row>
            <Row icon="✍️" title="Evening reflection" hint="If you haven’t journaled yet" on={prefs.evening.on} onToggle={on => set({ evening: { ...prefs.evening, on } })}>
              <TimeField value={prefs.evening.time} onChange={time => set({ evening: { ...prefs.evening, time } })} label="Reflection time" />
            </Row>
            <Row icon="📊" title="Weekly review" hint="Look back, then plan next week" on={prefs.weekly.on} onToggle={on => set({ weekly: { ...prefs.weekly, on } })}>
              <select className="select nt-day" value={prefs.weekly.day} aria-label="Weekly review day" onChange={e => set({ weekly: { ...prefs.weekly, day: Number(e.target.value) } })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
              <TimeField value={prefs.weekly.time} onChange={time => set({ weekly: { ...prefs.weekly, time } })} label="Weekly review time" />
            </Row>
            <Row icon="🗓" title="Monthly review" hint="On the last day of the month" on={prefs.monthly.on} onToggle={on => set({ monthly: { ...prefs.monthly, on } })}>
              <TimeField value={prefs.monthly.time} onChange={time => set({ monthly: { ...prefs.monthly, time } })} label="Monthly review time" />
            </Row>
          </div>
        </section>

        <div className="nt-side">
          <section className="nt-section" aria-labelledby="nt-quiet">
            <h3 id="nt-quiet"><MoonStar size={14} /> Quiet hours</h3>
            <div className="nt-quiet">
              <div className="row">
                <Switch on={prefs.quiet.on} onChange={on => set({ quiet: { ...prefs.quiet, on } })} label="Quiet hours" />
                <span className={prefs.quiet.on ? '' : 'muted'}>No notifications between</span>
              </div>
              <div className={`row nt-quiet-times ${prefs.quiet.on ? '' : 'is-off'}`}>
                <TimeField value={prefs.quiet.from} onChange={from => set({ quiet: { ...prefs.quiet, from } })} label="Quiet from" disabled={!prefs.quiet.on} />
                <span>and</span>
                <TimeField value={prefs.quiet.to} onChange={to => set({ quiet: { ...prefs.quiet, to } })} label="Quiet until" disabled={!prefs.quiet.on} />
              </div>
            </div>
          </section>
          <Preview name={ws.settings.display_name} />
        </div>
      </div>

      <CustomReminders />
    </Card>
  )
}

// ---------------------------------------------------------------------------

function DeviceStatus({ signedIn, userId }: { signedIn: boolean; userId?: string }) {
  const toast = useToast()
  const [on, setOn] = useState(pushOnThisDevice)
  const [busy, setBusy] = useState(false)
  const support = pushSupport()

  const turnOn = async () => {
    if (!userId) return
    setBusy(true)
    const r = await enablePush(userId)
    setBusy(false)
    setOn(r.ok)
    toast(r.ok ? '🔔 Notifications are on for this device' : r.message, r.ok ? { tone: 'celebrate' } : undefined)
  }
  const turnOff = async () => { setBusy(true); await disablePush(); setBusy(false); setOn(false); toast('Notifications turned off for this device') }
  const test = async () => { setBusy(true); const r = await sendTestPush(); setBusy(false); toast(r.message) }

  let body: ReactNode
  if (!signedIn) {
    body = <><BellOff size={18} /><div className="grow"><b>Sign in to get notifications when Nudge is closed</b><span>While it’s open you’ll still get gentle reminders inside the app.</span></div><Link className="btn primary" to="/login">Sign in <ChevronRight size={15} /></Link></>
  } else if (support === 'not-configured') {
    body = <><BellOff size={18} /><div className="grow"><b>Push isn’t set up on this deployment yet</b><span>In-app reminders still work. To enable push, follow “Notifications setup” in the README.</span></div></>
  } else if (support === 'ios-install') {
    body = <><Smartphone size={18} /><div className="grow"><b>On iPhone, add Nudge to your Home Screen first</b><span>Tap <Share size={12} style={{ verticalAlign: '-2px' }} /> Share → <b>Add to Home Screen</b>, open Nudge from there, then come back here.</span></div></>
  } else if (support === 'unsupported') {
    body = <><BellOff size={18} /><div className="grow"><b>This browser can’t receive notifications when closed</b><span>Try Chrome, Edge or Firefox on a computer or Android, or Safari after adding to the Home Screen on iPhone.</span></div></>
  } else if (support === 'denied') {
    body = <><BellOff size={18} /><div className="grow"><b>Notifications are blocked for this site</b><span>Allow them in your browser’s site settings (the icon left of the address), then reload.</span></div></>
  } else if (on) {
    body = <><span className="nt-dot" aria-hidden /><div className="grow"><b>On for this device</b><span>Nudges arrive even when the app is closed. Buttons like <b>✓ Done</b> work right from the notification.</span></div>
      <Button size="sm" icon={<Send size={14} />} onClick={() => void test()} disabled={busy}>Send test</Button>
      <Button size="sm" variant="ghost" onClick={() => void turnOff()} disabled={busy}>Turn off</Button></>
  } else {
    body = <><BellRing size={18} /><div className="grow"><b>Get nudges even when Nudge is closed</b><span>Morning kickoff, planned blocks, habit check-ins — with one-tap <b>Start 5 min</b> and <b>✓ Done</b>.</span></div>
      <Button variant="primary" icon={<Bell size={15} />} onClick={() => void turnOn()} disabled={busy}>{busy ? 'Turning on…' : 'Turn on notifications'}</Button></>
  }
  return <div className={`nt-device ${support === 'ok' && on && signedIn ? 'is-on' : ''}`} role="status">{body}</div>
}

function Row({ icon, title, hint, on, onToggle, children }: { icon: string; title: string; hint: ReactNode; on: boolean; onToggle: (on: boolean) => void; children?: ReactNode }) {
  return (
    <div className={`nt-row ${on ? '' : 'is-off'}`}>
      <span className="nt-icon" aria-hidden>{icon}</span>
      <div className="grow nt-row-text"><b>{title}</b><span>{hint}</span></div>
      {children && <div className="nt-row-extra">{children}</div>}
      <Switch on={on} onChange={onToggle} label={title} />
    </div>
  )
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="nt-switch" onClick={() => onChange(!on)}><i /></button>
}

function TimeField({ value, onChange, label, disabled }: { value: string; onChange: (v: string) => void; label: string; disabled?: boolean }) {
  return <input className="input nt-time" type="time" step={300} value={value} aria-label={label} disabled={disabled} onChange={e => e.target.value && onChange(e.target.value)} />
}

// ---------------------------------------------------------------------------
// A realistic preview of how a notification will look.

const SAMPLES: Array<{ kind: keyof typeof COPY; vars: Record<string, string>; actions: string[] }> = [
  { kind: 'morning', vars: { focus: 'Finish the case study' }, actions: ['▶ Start 5 min', '🗓 Plan my day'] },
  { kind: 'block', vars: { block: 'Deep work', time: '09:00' }, actions: ['▶ Start now', '⏰ In 15 min'] },
  { kind: 'notStarted', vars: {}, actions: ['▶ Start 5 min', '⏰ In 15 min'] },
  { kind: 'habit', vars: { habit: '📖 Reading', amount: ' — 20 pages' }, actions: ['✓ Done', '⏰ In 15 min'] },
  { kind: 'streak', vars: { streak: '12', left: '40 min' }, actions: ['▶ Start 5 min', '⏰ In 15 min'] },
  { kind: 'evening', vars: {}, actions: ['✍️ Reflect'] },
]

function Preview({ name }: { name: string }) {
  const [i, setI] = useState(0)
  const s = SAMPLES[i % SAMPLES.length]
  const variant = COPY[s.kind][0]
  const fillIn = (t: string) => t.replace(/\{(\w+)\}/g, (_, k: string) => (k === 'name' ? (name ? `, ${name.split(' ')[0]}` : '') : s.vars[k] ?? ''))
  return (
    <section className="nt-section" aria-labelledby="nt-preview">
      <h3 id="nt-preview">Preview</h3>
      <div className="nt-preview" aria-live="polite">
        <div className="nt-preview-top"><img src="/pwa-192.png" alt="" width={18} height={18} /><span>Nudge</span><span className="muted">· now</span></div>
        <b>{fillIn(variant.title)}</b>
        <p>{fillIn(variant.body)}</p>
        {s.actions.length > 0 && <div className="nt-preview-actions">{s.actions.map(a => <span key={a}>{a}</span>)}</div>}
      </div>
      <button type="button" className="card-link" onClick={() => setI(i + 1)}>Show another example <ChevronRight size={13} /></button>
    </section>
  )
}

// ---------------------------------------------------------------------------

function CustomReminders() {
  const { ws, update, create, remove } = useStore()
  const custom = ws.reminders.filter(r => r.kind === 'custom')
  const setR = (r: Reminder, patch: Partial<Reminder>) => update('reminders', r.id, patch)
  return (
    <section className="nt-section" aria-labelledby="nt-custom">
      <div className="row-between"><h3 id="nt-custom">Your own reminders</h3>
        <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => create('reminders', { kind: 'custom', title: 'Drink water', time: '11:00', days: [1, 2, 3, 4, 5], enabled: true })}>Add</Button>
      </div>
      {custom.length === 0 && <p className="muted nt-empty">Anything else you want a nudge for — “Stretch”, “Call mom”, “Plan tomorrow”. Shown while Nudge is open.</p>}
      <div className="list">
        {custom.map(r => (
          <div className="list-row nt-custom" key={r.id}>
            <Switch on={r.enabled} onChange={enabled => setR(r, { enabled })} label={`Enable ${r.title}`} />
            <input className="input nt-custom-title" value={r.title} onChange={e => setR(r, { title: e.target.value })} aria-label="Reminder title" />
            <TimeField value={r.time} onChange={time => setR(r, { time })} label="Reminder time" />
            <div className="row nt-days">{DAYS.map((d, i) => <button key={d} className="chip chip-choice" aria-pressed={r.days.includes(i)} onClick={() => setR(r, { days: r.days.includes(i) ? r.days.filter(x => x !== i) : [...r.days, i] })}>{d[0]}</button>)}</div>
            <ConfirmButton onConfirm={() => remove('reminders', r.id)} confirmLabel="Delete"><Trash2 size={14} /></ConfirmButton>
          </div>
        ))}
      </div>
    </section>
  )
}
