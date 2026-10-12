import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, BarChart3, BookHeart, CalendarDays, CheckSquare, Cloud, Command, Flag, Flame, Home, Keyboard, Lightbulb,
  ListTodo, Plus, Repeat, Search, Settings as SettingsIcon, Sparkles, Target, Timer,
} from 'lucide-react'
import { routes } from '../lib/routes'
import { Page } from '../ui/kit'
import './guide.css'

// The in-app user guide: every feature, what it's for, and how to use it.
// Content is static so it works offline and for brand-new accounts.

type Section = {
  id: string
  icon: typeof Home
  title: string
  to?: string
  what: ReactNode
  why: ReactNode
  how: ReactNode[]
  tip?: ReactNode
}

const SECTIONS: Section[] = [
  {
    id: 'loop',
    icon: Repeat,
    title: 'The idea: Plan → Track → Reflect → Improve',
    what: <>Nudge connects planning, doing and reviewing. Everything you record is attached to a date, so one focus session counts toward that day, its week, its month, the goal it belongs to, the planned block it fulfilled, your streaks and every chart, without entering anything twice.</>,
    why: <>Most tools only show what you <em>meant</em> to do. Nudge shows what you planned next to what actually happened, so each week you can plan a little more realistically.</>,
    how: [
      <><b>Plan</b>: set goals, put focus blocks on your days, list tasks.</>,
      <><b>Track</b>: start the timer when you work, tick off habits and tasks.</>,
      <><b>Reflect</b>: write a few lines in the journal, and do the weekly and monthly reviews.</>,
      <><b>Improve</b>: use Analytics and Insights to adjust targets and plans.</>,
    ],
  },
  {
    id: 'today',
    icon: Home,
    title: 'Today',
    to: routes.today,
    what: <>Your home screen: today’s main focus, productive time against your daily target, the focus timer, today’s schedule, tasks, habits, active goals, streaks, upcoming events and a quick mood check-in.</>,
    why: <>It answers “What should I do now?” and “How is today going?” at a glance.</>,
    how: [
      <>Type your <b>main focus</b>, the one thing that would make today a good day.</>,
      <>Press <b>Start focus</b>, or the ▶ next to a planned block, to start tracking.</>,
      <>Tick habits and tasks as you finish them.</>,
      <>In the evening, pick a mood and write one line in <b>Check in</b>.</>,
      <>Press <b>Customize</b> to arrange the cards your way: drag them by the handle (or use the arrow keys), hide the ones you don’t need, and press <b>Reset</b> to go back to the default. Your layout is saved and syncs across devices.</>,
    ],
    tip: <>New here? The <b>Getting started</b> card walks you through the first steps and disappears once you’ve done them.</>,
  },
  {
    id: 'timer',
    icon: Timer,
    title: 'Focus timer (productive hours)',
    to: routes.timer,
    what: <>A timer for focused work. Choose a category (Work, Coding, Learning…), optionally a goal and the part of the goal, then start. You can pause and resume, and stop to rate the session 1–5 and add notes.</>,
    why: <>Tracked time is the fuel for everything else: goal progress, streaks, plan vs reality and analytics.</>,
    how: [
      <>Open <b>Focus timer</b>, or press <kbd>T</kbd>, choose what you’re working on and press <b>Start</b>.</>,
      <>If a focus block is planned right now, the timer links to it automatically, so your plan and reality line up.</>,
      <>The timer keeps running while you use other screens; a small live timer floats at the bottom.</>,
      <>Forgot to start it? Use <b>Log time manually</b> to add a past session. Click any session to edit or delete it.</>,
    ],
    tip: <>Stuck or putting it off? Press <b>Just 5 min</b> (on Today or the timer). You only commit to five minutes; when they’re up, Nudge checks in, and you can keep going or stop. Both count. Sessions shorter than one minute aren’t saved.</>,
  },
  {
    id: 'planner',
    icon: CalendarDays,
    title: 'Planner: Day, Week, Month and Calendar',
    to: routes.planner,
    what: <>One planner with four views. <b>Day</b> is an hour-by-hour timeline. <b>Week</b> shows Monday–Sunday side by side. <b>Month</b> is a calendar with your hours, habits and journal per day. <b>Calendar</b> is a combined view of events, blocks and tasks.</>,
    why: <>Planning time, not just tasks, is what makes a day realistic. The planner shows planned time and tracked time side by side.</>,
    how: [
      <><b>Day</b>: drag on empty space to create a time block, drag a block to move it, drag its bottom edge to resize. Press ▶ on a block to start the timer for it.</>,
      <><b>Week</b>: drag tasks and blocks between days (or use the “Move to…” menu on phones), set daily targets, and use <b>Plan next week</b> to carry over unfinished tasks and copy your focus blocks.</>,
      <><b>Month</b>: see how each day went at a glance, and click any day to open it.</>,
      <>Use the arrows to move between days, weeks or months; <b>Today</b> jumps back.</>,
    ],
    tip: <>Focus blocks count as <em>planned productive time</em>; break blocks don’t.</>,
  },
  {
    id: 'plan-vs-reality',
    icon: Target,
    title: 'Plan vs Reality',
    what: <>A comparison of planned focus time against tracked time, per category, with an <b>efficiency</b> score (actual ÷ planned). It appears on Today, the Day and Week planners, and Analytics.</>,
    why: <>It shows where your plans are too optimistic and which categories steal time, so you can plan better next week.</>,
    how: [
      <>Plan focus blocks with a category (e.g. 2h Coding).</>,
      <>Track time with the timer.</>,
      <>Read the bars: grey is planned, coloured is actual. “+30m” means more than planned; “−30m” means less.</>,
    ],
  },
  {
    id: 'goals',
    icon: Flag,
    title: 'Goals and projects',
    to: routes.goals,
    what: <>Long-term, monthly or weekly goals, and projects. A goal can have a target in hours (e.g. 30 hours of coding), a weekly target, a deadline, a breakdown into parts (Design 5h, Development 15h…), linked tasks and habits, and sub-goals.</>,
    why: <>Every session you link to a goal moves its progress bar automatically, and the pace check tells you if you’re ahead or behind.</>,
    how: [
      <>Press <b>New goal</b>, or start from a suggested template.</>,
      <>Choose the goal when you start the timer or plan a block; its progress updates by itself.</>,
      <>Open a goal to see hours over time, its breakdown, tasks, habits and recent sessions, and to mark it complete.</>,
    ],
    tip: <>Set the target to 0 hours to make a goal task-based; progress is then tasks done ÷ total tasks.</>,
  },
  {
    id: 'habits',
    icon: Flame,
    title: 'Habits and streaks',
    to: routes.habits,
    what: <>Recurring rituals: every day, a number of times per week, or on specific weekdays. Habits can have an amount (8 glasses, 20 pages), a reminder time, start and end dates, and a linked goal.</>,
    why: <>Small, repeated actions compound. Streaks and completion history make consistency visible.</>,
    how: [
      <>Tick the circle to complete a habit. For amount habits, use + / − to log partial progress.</>,
      <>Habits appear automatically in Today, the Day, Week and Month planners.</>,
      <>Open a habit for its calendar history, streaks and completion rates (7/30/90 days). Click any day to fix a missed check-in.</>,
    ],
    tip: <>Archiving a habit hides it from your planners but keeps its history.</>,
  },
  {
    id: 'streaks',
    icon: Sparkles,
    title: 'Streak types',
    what: <>
      <b>Productivity streak</b>: days in a row reaching your minimum productive time (set in Settings).{' '}
      <b>Weekly streak</b>: weeks in a row hitting your weekly target.{' '}
      <b>Habit streaks</b>: per habit.{' '}
      <b>Goal and category streaks</b>: days in a row with time on that goal or category.
    </>,
    why: <>A streak only counts real effort, and today not being finished yet never breaks it.</>,
    how: [<>You’ll see a subtle celebration at milestones (3, 7, 14, 21, 30… days) and when you beat a personal best.</>],
  },
  {
    id: 'tasks',
    icon: ListTodo,
    title: 'Tasks',
    to: routes.tasks,
    what: <>To-dos with a date (or none, for the backlog), priority, estimate, category, goal and an optional reminder. Views: Today, Upcoming, Backlog, Overdue and Completed.</>,
    why: <>Tasks connect to goals and the planner, so they count toward progress and show on the right day.</>,
    how: [
      <>Type in the quick-add box and press Enter, or press <kbd>N</kbd> anywhere.</>,
      <>Use the date button to reschedule (Tomorrow, Next week, pick a date, or back to the backlog).</>,
      <>Press ▶ on a task to start the timer for it.</>,
    ],
  },
  {
    id: 'journal',
    icon: BookHeart,
    title: 'Journal and daily reflection',
    to: routes.journal(),
    what: <>A page for each day: mood, energy, “How was your day?”, what went well, what distracted you, tomorrow’s priority, highlights, challenges, gratitude, notes and photos. It saves automatically.</>,
    why: <>Reflection turns tracked hours into lessons. The journal shows what actually happened that day, so your notes are grounded in facts.</>,
    how: [
      <>Open it from Today’s Check in, the Day planner, or the sidebar.</>,
      <>Write tomorrow’s priority, then press <b>Add to tomorrow’s tasks</b>.</>,
      <>Browse or search past entries; the mood and energy chart shows trends.</>,
    ],
  },
  {
    id: 'reviews',
    icon: CheckSquare,
    title: 'Weekly and monthly reviews',
    to: routes.weekReview(),
    what: <>At the bottom of the Week and Month planners: automatic stats (hours, planned vs actual, habits, goals, best day, streaks) plus guided questions. Answers save automatically.</>,
    why: <>A 10-minute review each week is where improvement happens. You see the numbers and decide what to change.</>,
    how: [
      <>Sunday evening: open the Week planner → <b>Weekly review</b>, answer the questions, then press <b>Plan next week</b>.</>,
      <>At the end of the month: Month planner → <b>Monthly review</b>.</>,
    ],
  },
  {
    id: 'analytics',
    icon: BarChart3,
    title: 'Analytics and Insights',
    to: routes.analytics(),
    what: <><b>Progress</b> (the first Analytics tab) counts every way you showed up (focus time, habits, finished tasks, journal) with a year-long show-up calendar (click any square to open that day), week-over-week momentum, 8-week trends, when you usually start, how often planned blocks actually start, and goal progress. <b>Analytics</b> also has detailed numbers and charts for today, a week, a month and all time: hours by day and category, planned vs actual, best day and time of day, trends. <b>Insights</b> turns them into plain-language observations, comparisons (this week vs last week, and so on) and suggestions for what to focus on next.</>,
    why: <>They answer “Am I staying consistent?”, “What progress am I making?” and “What should I focus on next?”</>,
    how: [
      <>Use the tabs and arrows to move between periods.</>,
      <>Every chart has <b>View as table</b> if you prefer numbers.</>,
      <>Click a day bar to open that day.</>,
    ],
  },
  {
    id: 'search',
    icon: Search,
    title: 'Search',
    to: routes.search(),
    what: <>Searches tasks, goals, habits, journal entries, sessions, events, notes and categories. Also understands dates: “September”, “last week”, “today”, “2026-09-28”, “sep 28”.</>,
    why: <>Find anything quickly, or get a summary of a topic (“coding”) or a period.</>,
    how: [<>Press <kbd>/</kbd> or click the search bar at the top.</>],
  },
  {
    id: 'quick-add',
    icon: Plus,
    title: 'Quick Add',
    what: <>One button (or <kbd>N</kbd>) to add anything from anywhere: task, time block, event, habit, goal, timer, past session, journal entry or note.</>,
    why: <>Capture things the moment you think of them, without leaving what you’re doing.</>,
    how: [<>On a phone, use the round <b>+</b> button above the tab bar.</>],
  },
  {
    id: 'settings',
    icon: SettingsIcon,
    title: 'Settings, reminders and your data',
    to: routes.settings,
    what: <>Daily, weekly and monthly targets, the streak minimum, light/dark theme, timeline hours, categories, <b>Notifications</b> (turn on for this device, nudge style, what to send, quiet hours, preview and a test), your own reminders, and data tools: export a backup, import a backup, load sample data, start fresh.</>,
    why: <>Targets drive every progress bar and streak, so set them to something realistic.</>,
    how: [
      <>Turn on <b>Notifications</b> to get nudges even when Nudge is closed: a morning kickoff, a ping when a planned block starts, a gentle “haven’t started yet” check, habit reminders with <b>✓ Done</b>, streak protection and a reflection prompt. Choose <b>Gentle</b>, <b>Balanced</b> or <b>Coach</b>, set quiet hours, and press <b>Send test</b>.</>,
      <>On iPhone, add Nudge to your Home Screen first (Share → Add to Home Screen), then turn notifications on from there.</>,
      <>Use <b>Export JSON</b> regularly as a backup; <b>Import backup</b> restores it.</>,
    ],
  },
  {
    id: 'sync',
    icon: Cloud,
    title: 'Accounts, sync and offline',
    what: <>Without an account, everything is saved in this browser. Sign in (email link or Google) to sync across devices; the cloud icon at the top shows sync status. Nudge also works offline and can be installed like an app.</>,
    why: <>Your data is private: each account can only read its own data.</>,
    how: [
      <>Install: Chrome/Edge → the install icon in the address bar; iPhone Safari → Share → <b>Add to Home Screen</b>.</>,
      <>Signing in on a new account uploads this device’s data. If the account already has data, that data is loaded instead.</>,
    ],
  },
]

const ROUTINE = [
  { when: 'Morning (5 min)', what: 'Open Today → set your main focus → check the day’s blocks in the Day planner.' },
  { when: 'During the day', what: 'Start the timer when you begin focused work; tick habits and tasks as you go.' },
  { when: 'Evening (2 min)', what: 'Check in: mood and one line. Write tomorrow’s priority in the journal.' },
  { when: 'Sunday (10 min)', what: 'Weekly review → Plan next week (carry over tasks, copy blocks, set the target).' },
  { when: 'Month end (15 min)', what: 'Monthly review → adjust goals and targets based on Analytics.' },
]

const SHORTCUTS = [
  { keys: ['N'], what: 'Quick Add' },
  { keys: ['T'], what: 'Open the focus timer' },
  { keys: ['/'], what: 'Search' },
  { keys: ['Esc'], what: 'Close a dialog' },
  { keys: ['Enter'], what: 'Open a selected timeline block' },
  { keys: ['↑', '↓'], what: 'Move a selected timeline block by 15 minutes (Shift to resize)' },
]

const FAQ = [
  { q: 'Where is my data stored?', a: 'In this browser, always. If you’re signed in, it’s also synced to your private account so other devices see it.' },
  { q: 'Why didn’t my reminder fire?', a: 'Check Settings → Notifications: notifications must be on for this device (and you need to be signed in), the reminder type must be switched on, and it may fall inside your quiet hours or past the daily cap for your nudge style. Notifications can arrive up to 5 minutes after their time.' },
  { q: 'Can I act on a notification without opening the app?', a: 'Yes — “✓ Done” marks a habit or task done and “⏰ In 15 min” snoozes it, right from the notification. “▶ Start 5 min” opens Nudge with a five-minute timer running.' },
  { q: 'I forgot to start the timer.', a: 'Use Log time manually on the Focus timer, or Quick Add → Log time. Any session can be edited later.' },
  { q: 'My streak shows 0 but I worked today.', a: 'The productivity streak needs your minimum daily time (Settings → Streak minimum). Today not reaching it yet doesn’t break the streak.' },
  { q: 'How do I start over?', a: 'Settings → Data → Start fresh (export a backup first if you might want it back).' },
]

export default function Guide() {
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SECTIONS
    return SECTIONS.filter(s => `${s.title} ${s.id}`.toLowerCase().includes(q) || toText(s.what).includes(q) || s.how.some(h => toText(h).includes(q)))
  }, [query])

  return (
    <Page eyebrow="Guide" title="How Nudge works" subtitle="Every feature, what it’s for, and how to use it.">
      <div className="guide">
        <aside className="guide-toc" aria-label="Guide contents">
          <input className="input" type="search" placeholder="Search the guide…" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search the guide" />
          <nav>
            {shown.map(s => <a key={s.id} href={`#${s.id}`}><s.icon size={14} />{s.title.replace(/:.*/, '')}</a>)}
            <a href="#routine"><Lightbulb size={14} />Suggested routine</a>
            <a href="#shortcuts"><Keyboard size={14} />Keyboard shortcuts</a>
            <a href="#faq"><Command size={14} />FAQ</a>
          </nav>
        </aside>

        <div className="guide-body">
          {shown.map(s => (
            <section key={s.id} id={s.id} className="card guide-section">
              <header className="guide-head">
                <span className="guide-icon"><s.icon size={18} /></span>
                <h2>{s.title}</h2>
                {s.to && <Link className="card-link" to={s.to}>Open <ArrowRight size={13} /></Link>}
              </header>
              <p>{s.what}</p>
              <div className="guide-why"><b>Why use it:</b> {s.why}</div>
              <ul>{s.how.map((h, i) => <li key={i}>{h}</li>)}</ul>
              {s.tip && <p className="guide-tip"><Lightbulb size={14} /> {s.tip}</p>}
            </section>
          ))}
          {!shown.length && <div className="card"><p className="muted">Nothing in the guide matches “{query}”.</p></div>}

          <section id="routine" className="card guide-section">
            <header className="guide-head"><span className="guide-icon"><Lightbulb size={18} /></span><h2>A suggested routine</h2></header>
            <dl className="guide-routine">
              {ROUTINE.map(r => <div key={r.when}><dt>{r.when}</dt><dd>{r.what}</dd></div>)}
            </dl>
          </section>

          <section id="shortcuts" className="card guide-section">
            <header className="guide-head"><span className="guide-icon"><Keyboard size={18} /></span><h2>Keyboard shortcuts</h2></header>
            <dl className="guide-keys">
              {SHORTCUTS.map(k => <div key={k.what}><dt>{k.keys.map(x => <kbd key={x}>{x}</kbd>)}</dt><dd>{k.what}</dd></div>)}
            </dl>
          </section>

          <section id="faq" className="card guide-section">
            <header className="guide-head"><span className="guide-icon"><Command size={18} /></span><h2>FAQ</h2></header>
            {FAQ.map(f => <details key={f.q} className="guide-faq"><summary>{f.q}</summary><p>{f.a}</p></details>)}
          </section>
        </div>
      </div>
    </Page>
  )
}

/** Plain text of a ReactNode, for guide search. */
function toText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node).toLowerCase()
  if (Array.isArray(node)) return node.map(toText).join(' ')
  if (typeof node === 'object' && 'props' in node) return toText((node as { props: { children?: ReactNode } }).props.children)
  return ''
}
