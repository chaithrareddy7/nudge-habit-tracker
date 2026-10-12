// Planner rules for notifications. Run: npm run test:notify (Node 22.6+ runs TypeScript directly).
import { due, plan, resolvePrefs, inQuietHours, streakBefore, type DaySnapshot } from './planner.ts'
let pass = 0, fail = 0
const t = (name: string, ok: boolean, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${d ? ' — ' + d : ''}`) }
const base = (o: Partial<DaySnapshot> = {}): DaySnapshot => ({
  date: '2026-10-12', minute: 8 * 60 + 30, weekday: 1, lastDayOfMonth: false, name: 'Chaithra Reddy', prefs: resolvePrefs(null),
  focus: 'Finish case study', trackedSeconds: 0, timerRunning: false, minSeconds: 7200, streak: 5,
  habits: [{ id: 'h1', name: 'Reading', icon: '📖', reminder_time: '21:00', target: 20, unit: 'pages', done: false }],
  tasks: [{ id: 't1', title: 'Send invoice', reminder_time: '10:00', done: false }],
  blocks: [{ id: 'b1', title: 'Deep work', start_min: 9 * 60, end_min: 10 * 60 + 30, started: false }],
  events: [{ id: 'e1', title: 'Team sync', start_min: 12 * 60 + 30, reminder: true }],
  journalDone: false, ...o,
})
const keys = (l: { key: string }[]) => l.map(x => x.key.split(':')[1]).join(',')
let d = due(base(), new Set(), 0)
t('morning kickoff at 08:30 with name + focus', d.length === 1 && d[0].kind === 'morning' && d[0].title.includes('Chaithra') && d[0].body.includes('Finish case study'), JSON.stringify(d[0]?.title + ' / ' + d[0]?.body))
t('morning has Start 5 min action', d[0]?.actions[0]?.action === 'start5')
t('nothing due at 08:45 once morning sent', due(base({ minute: 8 * 60 + 45 }), new Set([d[0].key]), 1).length === 0)
d = due(base({ minute: 9 * 60 + 2 }), new Set(), 1)
t('block start at 09:00 (within window)', d.some(x => x.kind === 'block'), keys(d))
t('block follow-up at 09:10 when not started', due(base({ minute: 9 * 60 + 10 }), new Set(), 2).some(x => x.kind === 'block_followup'))
t('no follow-up if block started', !due(base({ minute: 9 * 60 + 10, blocks: [{ id: 'b1', title: 'Deep work', start_min: 540, end_min: 630, started: true }] }), new Set(), 2).some(x => x.kind === 'block_followup'))
t('no block nudge while timer running', !due(base({ minute: 9 * 60, timerRunning: true }), new Set(), 0).some(x => x.kind === 'block'))
t('task reminder at 10:00 with Done', due(base({ minute: 600 }), new Set(), 0).some(x => x.kind === 'task' && x.actions[0].action === 'done'))
t('balanced not-started at 11:30 when nothing tracked', due(base({ minute: 11 * 60 + 30 }), new Set(), 2).some(x => x.kind === 'not_started'))
t('no not-started nudge if time tracked', !due(base({ minute: 11 * 60 + 30, trackedSeconds: 900 }), new Set(), 2).some(x => x.kind === 'not_started'))
t('event reminder 10 min before', due(base({ minute: 12 * 60 + 20 }), new Set(), 0).some(x => x.kind === 'event'))
t('streak at 20:00 when below minimum', due(base({ minute: 20 * 60, trackedSeconds: 1800 }), new Set(), 2).some(x => x.kind === 'streak' && /5-day|5 -day|5-day/.test(x.title + x.body)), JSON.stringify(due(base({ minute: 20 * 60, trackedSeconds: 1800 }), new Set(), 2).map(x => x.title)))
t('no streak nudge when minimum met', !due(base({ minute: 20 * 60, trackedSeconds: 7300 }), new Set(), 2).some(x => x.kind === 'streak'))
t('habit 21:00 skipped once done', !due(base({ minute: 21 * 60, habits: [{ id: 'h1', name: 'Reading', icon: '📖', reminder_time: '21:00', target: 20, unit: 'pages', done: true }] }), new Set(), 2).some(x => x.kind === 'habit'))
t('habit 21:00 sent with amount', due(base({ minute: 21 * 60 }), new Set(), 2).some(x => x.kind === 'habit' && x.body.includes('20 pages')))
const q = base({ minute: 23 * 60, prefs: resolvePrefs({ evening: { on: true, time: '23:00' } }) })
t('quiet hours (22:30–07:30) suppress everything', due(q, new Set(), 0).length === 0 && inQuietHours(q.prefs, 23 * 60) && inQuietHours(q.prefs, 6 * 60) && !inQuietHours(q.prefs, 8 * 60))
t('weekly review only on chosen day', due(base({ minute: 18 * 60, weekday: 0 }), new Set(), 0).some(x => x.kind === 'weekly') && !due(base({ minute: 18 * 60, weekday: 1 }), new Set(), 0).some(x => x.kind === 'weekly'))
t('monthly only on last day', due(base({ minute: 18 * 60, lastDayOfMonth: true }), new Set(), 0).some(x => x.kind === 'monthly'))
const g = base({ minute: 15 * 60, prefs: resolvePrefs({ style: 'gentle' }) })
t('gentle cap: none when 4 already sent', due(g, new Set(), 4).length === 0)
t('gentle: single afternoon nudge at 15:00', due(g, new Set(), 1).some(x => x.kind === 'not_started') && !due(base({ minute: 11 * 60 + 30, prefs: resolvePrefs({ style: 'gentle' }) }), new Set(), 1).some(x => x.kind === 'not_started'))
const cap = due(base({ minute: 9 * 60 + 10, tasks: [{ id: 't1', title: 'Send invoice', reminder_time: '09:10', done: false }] }), new Set(), 7) // task + follow-up both due; cap 8 → room 1
t('cap prefers reminders over nudges', cap.length === 1 && cap[0].priority === 1, keys(cap))
t('keys unique per day', new Set(plan(base()).map(x => x.key)).size === plan(base()).length)
t('copy stable within a day', due(base(), new Set(), 0)[0].body === due(base(), new Set(), 0)[0].body)
t('copy varies across days', new Set(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map(date => due(base({ date }), new Set(), 0)[0].title)).size > 1)
const shift = (k: string, n: number) => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
t('streakBefore counts consecutive days', streakBefore('2026-10-12', new Map([['2026-10-11', 8000], ['2026-10-10', 7200], ['2026-10-09', 100]]), 7200, shift) === 2)
t('resolvePrefs merges partial', resolvePrefs({ morning: { on: false } as never }).morning.time === '08:30')
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
