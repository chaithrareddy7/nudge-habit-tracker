// Notification copy. Warm, specific, never shaming. Each kind has several
// variants; one is picked deterministically per day so wording stays fresh but
// doesn't flicker between ticks. Placeholders: {name} {focus} {streak} {habit}
// {amount} {block} {time} {task} {event} {left}.
//
// Pure module: shared by the Supabase Edge Function and the web app.

export const COPY = {
  morning: [
    { title: '☀️ Good morning{name}', body: 'Today’s one thing: {focus}. Want to start with just 5 minutes?' },
    { title: '🌱 A fresh day{name}', body: 'Pick one small step for {focus} — starting is the hardest part.' },
    { title: '☕ Ready when you are{name}', body: '{focus}. Five minutes now makes the rest of the day easier.' },
  ],
  morningNoFocus: [
    { title: '☀️ Good morning{name}', body: 'What would make today a good day? Set one focus and start tiny.' },
    { title: '🌱 New day, clean slate{name}', body: 'Choose one thing that matters today. That’s the whole plan.' },
  ],
  block: [
    { title: '⏱ {block} starts now', body: 'No need to feel ready — just open it and begin. 5 minutes counts.' },
    { title: '🎯 Time for {block}', body: 'You planned this for {time}. Start the timer and see where it goes.' },
    { title: '🚀 {block} — it’s go time', body: 'Future you planned this. Give it the first five minutes.' },
  ],
  blockFollowUp: [
    { title: '👀 {block} hasn’t started yet', body: 'Totally normal. Try the tiny version: 5 minutes, then decide.' },
    { title: '🌤 Still thinking about {block}?', body: 'Start messy. Five minutes is a win — you can stop after that.' },
  ],
  notStarted: [
    { title: '🌱 Nothing tracked yet today', body: 'No guilt — just one tiny start. Five minutes on anything counts.' },
    { title: '⏳ The day’s still yours', body: 'Pick the smallest next step and give it 5 minutes. That’s enough.' },
    { title: '🧩 Stuck? Make it smaller', body: 'Open the thing you’re avoiding and do 5 minutes. Then decide.' },
  ],
  habit: [
    { title: '{habit}', body: 'Time for your habit{amount}. Tiny version counts too.' },
    { title: '{habit} — quick check-in', body: 'A small rep today keeps the streak alive{amount}.' },
  ],
  task: [
    { title: '✅ {task}', body: 'Reminder for today. What’s the smallest first step?' },
    { title: '📌 {task}', body: 'This one’s on your list for now. Two minutes to get it moving?' },
  ],
  event: [
    { title: '📅 {event} at {time}', body: 'Starts in 10 minutes.' },
  ],
  streak: [
    { title: '🔥 {streak}-day streak on the line', body: '{left} more keeps it going. A short session is enough.' },
    { title: '🔥 Don’t break the chain', body: 'You’re on a {streak}-day run — {left} gets you there today.' },
  ],
  evening: [
    { title: '✍️ How did today go?', body: 'Two lines in your journal: one win, and tomorrow’s priority.' },
    { title: '🌙 Wind down with a quick reflection', body: 'What went well? What’s first tomorrow? Two minutes.' },
  ],
  weekly: [
    { title: '📊 Your weekly review is ready', body: 'See your week in numbers, then plan the next one — about 10 minutes.' },
  ],
  monthly: [
    { title: '🗓 Month wrap-up', body: 'Look back at the month and set next month’s priorities.' },
  ],
  test: [
    { title: '🎉 Notifications are on', body: 'This is how Nudge will check in — kind, short, and only when it helps.' },
  ],
} as const

export type CopyKind = keyof typeof COPY

/** Small stable hash for deterministic variant picking. */
export function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export function fill(template: string, vars: Record<string, string | number | undefined>) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? '' : String(vars[k])))
}

export function pick(kind: CopyKind, seed: string, vars: Record<string, string | number | undefined>) {
  const variants = COPY[kind]
  const v = variants[hash(seed) % variants.length]
  return { title: fill(v.title, vars).trim(), body: fill(v.body, vars).trim() }
}
