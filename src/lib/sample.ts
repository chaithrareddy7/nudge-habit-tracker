import { rangeKeys, shiftKey, todayKey, weekday, weekStartKey, monthStartKey, fromKey } from './dates'
import { emptyWorkspace, type Goal, type Habit, type Settings, type Workspace } from './model'

// Realistic, deterministic sample data covering the last ~6 weeks so every
// view (streaks, trends, reviews, calendars) has something to show.

function seeded(seed: number) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
}

const id = (prefix: string, n: number | string) => `sample-${prefix}-${n}`

export function buildSampleWorkspace(settings: Settings): Workspace {
  const ws = emptyWorkspace()
  const rand = seeded(42)
  const today = todayKey()
  const now = new Date().toISOString()
  ws.settings = { ...ws.settings, ...settings, onboarded: true, active_timer: null, milestones_seen: {} }
  const start = shiftKey(today, -45)

  const goal = (n: string, g: Partial<Goal> & Pick<Goal, 'title' | 'category' | 'horizon'>): Goal => ({
    id: id('goal', n), description: '', parent_id: null, start_date: start, deadline: null, target_hours: 0,
    weekly_target_hours: 0, parts: [], color: '#c45d82', status: 'active', completed_at: null, created_at: now, ...g,
  })
  const portfolio = goal('portfolio', {
    title: 'Build portfolio', category: 'Coding', horizon: 'project', description: 'Ship a personal site with three case studies.',
    target_hours: 50, weekly_target_hours: 6, deadline: shiftKey(today, 24), color: '#eb6834',
    parts: [
      { id: id('part', 'design'), name: 'Design', target_hours: 8 },
      { id: id('part', 'dev'), name: 'Development', target_hours: 25 },
      { id: id('part', 'content'), name: 'Content', target_hours: 9 },
      { id: id('part', 'testing'), name: 'Testing', target_hours: 8 },
    ],
  })
  const coding = goal('coding', { title: '30 hours of coding', category: 'Coding', horizon: 'monthly', target_hours: 30, weekly_target_hours: 7.5, start_date: monthStartKey(today), color: '#eb6834' })
  const react = goal('react', { title: 'Complete React course', category: 'Learning', horizon: 'monthly', target_hours: 25, weekly_target_hours: 6, start_date: monthStartKey(today), color: '#1baf7a' })
  const books = goal('books', { title: 'Read 2 books', category: 'Personal', horizon: 'monthly', description: 'Tracked through the Reading habit.', start_date: monthStartKey(today), color: '#4a3aa7' })
  const fitness = goal('fitness', { title: 'Exercise 15 hours', category: 'Exercise', horizon: 'monthly', target_hours: 15, weekly_target_hours: 3.5, start_date: monthStartKey(today), color: '#008300' })
  const spanish = goal('spanish', { title: 'Conversational Spanish', category: 'Learning', horizon: 'long_term', target_hours: 150, deadline: shiftKey(today, 200), color: '#1baf7a' })
  ws.goals = [portfolio, coding, react, books, fitness, spanish]

  const habit = (n: string, h: Partial<Habit> & Pick<Habit, 'name' | 'icon'>): Habit => ({
    id: id('habit', n), color: '#c45d82', category: 'Personal', frequency: { type: 'daily' }, target_amount: 1, unit: '',
    reminder_time: null, start_date: start, end_date: null, goal_id: null, archived: false, sort: 0, created_at: now, ...h,
  })
  ws.habits = [
    habit('morning', { name: 'Morning routine', icon: '☀️', color: '#eda100', sort: 0, reminder_time: '07:00' }),
    habit('reading', { name: 'Reading', icon: '📖', color: '#4a3aa7', target_amount: 20, unit: 'pages', goal_id: books.id, sort: 1, reminder_time: '21:00' }),
    habit('workout', { name: 'Workout', icon: '🏃', color: '#008300', category: 'Exercise', frequency: { type: 'custom', days: [1, 3, 5, 6] }, goal_id: fitness.id, sort: 2, reminder_time: '18:00' }),
    habit('journal', { name: 'Journal', icon: '✍️', color: '#e87ba4', sort: 3 }),
    habit('sleep', { name: 'Sleep before 11 PM', icon: '😴', color: '#2a78d6', sort: 4, reminder_time: '22:30' }),
    habit('water', { name: 'Drink water', icon: '💧', color: '#2a78d6', target_amount: 8, unit: 'glasses', sort: 5 }),
    habit('meditate', { name: 'Meditate', icon: '🧘', color: '#1baf7a', frequency: { type: 'weekly', times: 3 }, sort: 6 }),
  ]

  // Completion probability per habit; the most recent days are kept strong so streaks look lived-in.
  const odds: Record<string, number> = { morning: 0.85, reading: 0.9, workout: 0.8, journal: 0.7, sleep: 0.65, water: 0.75, meditate: 0.5 }
  const streakDays: Record<string, number> = { morning: 9, reading: 21, workout: 6, journal: 4, sleep: 3, water: 5, meditate: 0 }
  let cid = 0
  for (const key of rangeKeys(start, shiftKey(today, -1))) {
    const daysAgo = rangeKeys(key, today).length - 1
    for (const h of ws.habits) {
      const name = h.id.replace('sample-habit-', '')
      if (h.frequency.type === 'custom' && !h.frequency.days.includes(weekday(key))) continue
      const keep = daysAgo <= streakDays[name] || rand() < odds[name]
      if (!keep) continue
      ws.completions.push({ id: id('c', cid++), habit_id: h.id, date: key, amount: h.target_amount })
    }
  }
  // Today: a couple already done.
  ws.completions.push({ id: id('c', cid++), habit_id: id('habit', 'morning'), date: today, amount: 1 })
  ws.completions.push({ id: id('c', cid++), habit_id: id('habit', 'reading'), date: today, amount: 20 })
  ws.completions.push({ id: id('c', cid++), habit_id: id('habit', 'water'), date: today, amount: 3 })

  // Sessions: weekdays heavier, a lighter weekend, a productive streak for the last 12 days.
  const plan = [
    { cat: 'Coding', goal: portfolio.id, part: ['design', 'dev', 'dev', 'content', 'testing'], at: 9 * 60, len: [60, 120] },
    { cat: 'Learning', goal: react.id, part: [], at: 14 * 60, len: [45, 75] },
    { cat: 'Work', goal: null, part: [], at: 11 * 60, len: [45, 90] },
    { cat: 'Coding', goal: coding.id, part: [], at: 16 * 60 + 30, len: [30, 90] },
    { cat: 'Exercise', goal: fitness.id, part: [], at: 18 * 60, len: [30, 60] },
    { cat: 'Study', goal: spanish.id, part: [], at: 20 * 60, len: [20, 40] },
  ]
  let sid = 0
  let bid = 0
  for (const key of rangeKeys(start, shiftKey(today, -1))) {
    const daysAgo = rangeKeys(key, today).length - 1
    const wd = weekday(key)
    const weekend = wd === 0 || wd === 6
    const skip = daysAgo > 12 && rand() < (weekend ? 0.45 : 0.12)
    if (skip) continue
    for (const p of plan) {
      if (weekend && p.cat === 'Work') continue
      if (p.cat === 'Exercise' && ![1, 3, 5, 6].includes(wd)) continue
      if (rand() < (daysAgo <= 12 ? 0.12 : 0.3)) continue
      const plannedLen = Math.round((p.len[0] + rand() * (p.len[1] - p.len[0])) / 15) * 15
      const actualLen = Math.max(15, Math.round(plannedLen * (0.65 + rand() * 0.55)))
      const startMin = p.at + Math.round((rand() - 0.5) * 30)
      const blockId = id('block', bid++)
      const planned = rand() < 0.8
      if (planned) ws.blocks.push({ id: blockId, title: p.cat === 'Coding' ? 'Deep work: code' : p.cat, date: key, start_min: p.at, end_min: p.at + plannedLen, kind: 'focus', category: p.cat, goal_id: p.goal, task_id: null, reminder: false, created_at: now })
      const startDate = fromKey(key)
      startDate.setHours(0, startMin, 0, 0)
      const end = new Date(startDate.getTime() + actualLen * 60000)
      const part = p.part.length ? id('part', p.part[Math.floor(rand() * p.part.length)]) : null
      ws.sessions.push({
        id: id('s', sid++), date: key, started_at: startDate.toISOString(), ended_at: end.toISOString(), duration_seconds: actualLen * 60,
        category: p.cat, goal_id: p.goal, goal_part_id: part, task_id: null, block_id: planned ? blockId : null,
        rating: 3 + Math.floor(rand() * 3), notes: '', source: 'timer', label: p.cat === 'Coding' ? 'Deep work' : '', created_at: now,
      })
    }
  }

  // Today's plan, as in the product brief.
  const block = (title: string, s: number, e: number, cat: string, goalId: string | null, kind: 'focus' | 'break' = 'focus') =>
    ws.blocks.push({ id: id('block', bid++), title, date: today, start_min: s, end_min: e, kind, category: cat, goal_id: goalId, task_id: null, reminder: true, created_at: now })
  block('Deep Work — portfolio', 9 * 60, 10 * 60 + 30, 'Coding', portfolio.id)
  block('Break', 10 * 60 + 30, 11 * 60, 'Personal', null, 'break')
  block('Development', 11 * 60, 12 * 60, 'Coding', coding.id)
  block('Learning — React course', 14 * 60, 15 * 60, 'Learning', react.id)
  block('Workout', 18 * 60, 19 * 60, 'Exercise', fitness.id)
  // Something already tracked today.
  const morning = fromKey(today)
  morning.setHours(9, 5, 0, 0)
  const todays = ws.blocks.filter(b => b.date === today)
  ws.sessions.push({ id: id('s', sid++), date: today, started_at: morning.toISOString(), ended_at: new Date(morning.getTime() + 95 * 60000).toISOString(), duration_seconds: 95 * 60, category: 'Coding', goal_id: portfolio.id, goal_part_id: id('part', 'dev'), task_id: null, block_id: todays[0].id, rating: 4, notes: 'Finished the project grid layout.', source: 'timer', label: 'Portfolio grid layout', created_at: now })

  const task = (n: number, title: string, date: string | null, extra: Partial<Workspace['tasks'][number]> = {}) =>
    ws.tasks.push({ id: id('task', n), title, notes: '', date, done: false, done_at: null, goal_id: null, category: 'Work', estimate_minutes: 30, priority: 1, reminder_time: null, sort: n, created_at: now, ...extra })
  task(1, 'Write case study: habit app', today, { goal_id: portfolio.id, category: 'Coding', priority: 3, estimate_minutes: 60 })
  task(2, 'Reply to design feedback', today, { priority: 2, estimate_minutes: 15, done: true, done_at: now })
  task(3, 'Finish React hooks module', today, { goal_id: react.id, category: 'Learning', priority: 2, estimate_minutes: 45 })
  task(4, 'Book dentist appointment', today, { category: 'Personal', priority: 0, estimate_minutes: 5 })
  task(5, 'Deploy portfolio preview', shiftKey(today, 1), { goal_id: portfolio.id, category: 'Coding', priority: 3 })
  task(6, 'Weekly grocery run', shiftKey(today, 2), { category: 'Personal', priority: 0 })
  task(7, 'Record Spanish speaking practice', shiftKey(today, 3), { goal_id: spanish.id, category: 'Study' })
  task(8, 'Plan next sprint', shiftKey(today, -1), { done: true, done_at: now, priority: 2 })
  task(9, 'Collect testimonials', null, { goal_id: portfolio.id, category: 'Coding' })
  task(10, 'Research standing desks', null, { category: 'Personal', priority: 0 })
  task(11, 'Finish “Atomic Habits”', shiftKey(today, -12), { goal_id: books.id, category: 'Personal', done: true, done_at: now })
  task(12, 'Read “Deep Work”', null, { goal_id: books.id, category: 'Personal' })

  ws.events = [
    { id: id('event', 1), title: 'Team sync', date: today, start_min: 12 * 60 + 30, end_min: 13 * 60, location: 'Zoom', notes: '', important: false, reminder: true, created_at: now },
    { id: id('event', 2), title: 'Dinner with Priya', date: shiftKey(today, 2), start_min: 19 * 60 + 30, end_min: 21 * 60, location: '', notes: '', important: true, reminder: true, created_at: now },
    { id: id('event', 3), title: 'Portfolio launch', date: portfolio.deadline!, start_min: null, end_min: null, location: '', notes: '', important: true, reminder: false, created_at: now },
  ]

  const moods = [4, 3, 4, 5, 3, 4, 2, 4]
  rangeKeys(shiftKey(today, -9), shiftKey(today, -1)).forEach((key, i) => {
    if (i % 3 === 2) return
    ws.journal.push({
      id: id('journal', i), date: key, mood: moods[i % moods.length], energy: 2 + (i % 4), body: 'Steady day. Got the important block done before lunch.',
      went_well: i % 2 ? 'Protected my morning deep work.' : 'Kept the phone in another room.', distractions: i % 2 ? 'Slack pings after 3pm.' : 'Too many tabs open.',
      tomorrow_priority: 'Start with the hardest task.', highlights: '', challenges: '', gratitude: 'A long walk in good weather.', notes: '', photos: [], updated_at: now,
    })
  })

  const lastWeek = shiftKey(weekStartKey(today), -7)
  ws.reviews.push({ id: id('review', 1), period: 'week', start: lastWeek, answers: { reflection: 'Solid week, energy dipped on Thursday.', went_well: 'Morning deep work blocks.', improve: 'Stop checking messages before 10.', next_focus: 'Ship the portfolio case studies.' }, target_minutes: null, updated_at: now })
  ws.days.push({ id: id('day', 1), date: today, target_minutes: null, focus: 'Finish the portfolio case study draft' })
  ws.notes.push({ id: id('note', 1), text: 'Idea: add a dark-mode toggle to the portfolio.', date: today, created_at: now })
  return ws
}
