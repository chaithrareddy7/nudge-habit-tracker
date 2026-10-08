import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Leaf, Plus, Sparkles, X } from 'lucide-react'
import { todayKey } from '../lib/dates'
import { CATEGORY_COLORS, type Habit } from '../lib/model'
import { routes } from '../lib/routes'
import { useStore } from '../lib/store'
import { Button, Field, IconButton } from '../ui/kit'
import './onboarding.css'

const HABIT_PRESETS: Array<Pick<Habit, 'name' | 'icon' | 'category' | 'target_amount' | 'unit'> & { days?: number[] }> = [
  { name: 'Morning routine', icon: '☀️', category: 'Personal', target_amount: 1, unit: '' },
  { name: 'Read', icon: '📖', category: 'Learning', target_amount: 20, unit: 'pages' },
  { name: 'Exercise', icon: '🏃', category: 'Exercise', target_amount: 1, unit: '', days: [1, 3, 5] },
  { name: 'Meditate', icon: '🧘', category: 'Personal', target_amount: 1, unit: '' },
  { name: 'Drink water', icon: '💧', category: 'Personal', target_amount: 8, unit: 'glasses' },
  { name: 'Code', icon: '💻', category: 'Coding', target_amount: 1, unit: '' },
  { name: 'Journal', icon: '✍️', category: 'Personal', target_amount: 1, unit: '' },
  { name: 'Sleep before 11 PM', icon: '😴', category: 'Personal', target_amount: 1, unit: '' },
]

type GoalDraft = { title: string; category: string; hours: number }

export function Onboarding() {
  const { ws, user, updateSettings, create, loadSample } = useStore()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(ws.settings.display_name || user?.email?.split('@')[0] || '')
  const [day, setDay] = useState(ws.settings.target_minutes_day / 60)
  const [week, setWeek] = useState(ws.settings.target_minutes_week / 60)
  const [month, setMonth] = useState(ws.settings.target_minutes_month / 60)
  const [minimum, setMinimum] = useState(ws.settings.min_minutes_day / 60)
  const [goals, setGoals] = useState<GoalDraft[]>([{ title: '', category: 'Coding', hours: 30 }])
  const [habits, setHabits] = useState<string[]>(['Read', 'Exercise', 'Journal'])

  const finish = (to: string) => {
    const now = new Date().toISOString()
    goals.filter(g => g.title.trim()).forEach((g, i) => create('goals', {
      title: g.title.trim(), description: '', category: g.category, horizon: 'monthly', parent_id: null, start_date: todayKey(), deadline: null,
      target_hours: g.hours, weekly_target_hours: Math.round((g.hours / 4.3) * 2) / 2, parts: [], color: CATEGORY_COLORS[i % CATEGORY_COLORS.length], status: 'active', completed_at: null, created_at: now,
    }))
    HABIT_PRESETS.filter(h => habits.includes(h.name)).forEach((h, i) => create('habits', {
      name: h.name, icon: h.icon, color: CATEGORY_COLORS[(i + 2) % CATEGORY_COLORS.length], category: h.category,
      frequency: h.days ? { type: 'custom', days: h.days } : { type: 'daily' }, target_amount: h.target_amount, unit: h.unit,
      reminder_time: null, start_date: todayKey(), end_date: null, goal_id: null, archived: false, sort: i, created_at: now,
    }))
    updateSettings({ display_name: name.trim(), onboarded: true, target_minutes_day: Math.round(day * 60), target_minutes_week: Math.round(week * 60), target_minutes_month: Math.round(month * 60), min_minutes_day: Math.round(minimum * 60) })
    navigate(to)
  }

  const steps = ['Welcome', 'Targets', 'Goals', 'Habits', 'Ready']
  return (
    <div className="onb">
      <div className="onb-card">
        <div className="onb-top">
          <span className="brand"><span className="brand-mark"><Leaf size={16} fill="currentColor" /></span>nudge<span className="brand-dot">.</span></span>
          <ol className="onb-steps" aria-label="Setup progress">{steps.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}><span className="sr-only">{s}</span></li>)}</ol>
        </div>

        {step === 0 && (
          <div className="onb-body">
            <span className="eyebrow">Your productivity operating system</span>
            <h1 className="display">Plan. Track. Reflect. <em>Improve.</em></h1>
            <p className="ink-2">Goals, planners, a focus timer, habits, streaks and a journal — all connected, so every hour you track shows up in your day, week, month and goals.</p>
            <Field label="What should we call you?"><input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Your name" onKeyDown={e => e.key === 'Enter' && setStep(1)} /></Field>
            {!user && <p className="muted" style={{ fontSize: 12.5 }}>Working on this device only. <Link to="/login" className="card-link">Create an account</Link> to sync across devices — you can do it any time.</p>}
          </div>
        )}

        {step === 1 && (
          <div className="onb-body">
            <span className="eyebrow">Step 2 · Productive-hours target</span>
            <h2>How much focused time do you want?</h2>
            <p className="ink-2">Targets drive progress bars, streaks and reviews. You can change them per day, week or month later.</p>
            <div className="form-row">
              <Field label="Daily target" hint="(hours)"><input className="input" type="number" min={0.5} step={0.5} value={day} onChange={e => { const v = Number(e.target.value); setDay(v); setWeek(Math.round(v * 6)); setMonth(Math.round(v * 24)) }} /></Field>
              <Field label="Weekly" hint="(hours)"><input className="input" type="number" min={1} value={week} onChange={e => setWeek(Number(e.target.value))} /></Field>
              <Field label="Monthly" hint="(hours)"><input className="input" type="number" min={1} value={month} onChange={e => setMonth(Number(e.target.value))} /></Field>
            </div>
            <Field label="Minimum to keep your streak" hint="(hours per day)"><input className="input" type="number" min={0.25} step={0.25} value={minimum} onChange={e => setMinimum(Number(e.target.value))} /></Field>
            <p className="muted" style={{ fontSize: 12.5 }}>A day counts toward your 🔥 productivity streak when you track at least {minimum}h.</p>
          </div>
        )}

        {step === 2 && (
          <div className="onb-body">
            <span className="eyebrow">Step 3 · First goals</span>
            <h2>What are you working toward this month?</h2>
            <p className="ink-2">Sessions you track against a goal fill its progress automatically.</p>
            <div className="stack">
              {goals.map((g, i) => (
                <div className="row onb-goal" key={i}>
                  <input className="input grow" value={g.title} placeholder={['Build portfolio', 'Complete React course', 'Read 2 books'][i] || 'Goal'} onChange={e => setGoals(goals.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <select className="select" style={{ width: 120 }} value={g.category} aria-label="Category" onChange={e => setGoals(goals.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))}>{ws.categories.map(c => <option key={c.id}>{c.name}</option>)}</select>
                  <input className="input" style={{ width: 76 }} type="number" min={0} aria-label="Target hours" value={g.hours} onChange={e => setGoals(goals.map((x, j) => (j === i ? { ...x, hours: Number(e.target.value) } : x)))} />
                  <span className="muted">h</span>
                  {goals.length > 1 && <IconButton size="sm" label="Remove goal" onClick={() => setGoals(goals.filter((_, j) => j !== i))}><X size={14} /></IconButton>}
                </div>
              ))}
              {goals.length < 5 && <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setGoals([...goals, { title: '', category: 'Learning', hours: 10 }])}>Another goal</Button>}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onb-body">
            <span className="eyebrow">Step 4 · Habits</span>
            <h2>Pick a few habits to start with.</h2>
            <p className="ink-2">They appear in your daily, weekly and monthly planners, with streaks.</p>
            <div className="onb-habits">
              {HABIT_PRESETS.map(h => (
                <button key={h.name} className="onb-habit" aria-pressed={habits.includes(h.name)} onClick={() => setHabits(habits.includes(h.name) ? habits.filter(x => x !== h.name) : [...habits, h.name])}>
                  <span aria-hidden>{h.icon}</span>{h.name}{habits.includes(h.name) && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="onb-body">
            <span className="eyebrow">All set{name ? `, ${name}` : ''}</span>
            <h2>Next: plan your week.</h2>
            <p className="ink-2">Drop time blocks onto your days, then start the timer when you begin — Nudge compares what you planned with what you actually did.</p>
            <ul className="onb-list">
              <li><Check size={15} /> Plan your week and schedule time blocks</li>
              <li><Check size={15} /> Track productive hours with the timer</li>
              <li><Check size={15} /> Check off habits, reflect in the journal</li>
              <li><Check size={15} /> Review your week and month, see trends</li>
            </ul>
          </div>
        )}

        <div className="onb-foot">
          {step > 0 ? <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={() => setStep(step - 1)}>Back</Button> : <Button variant="ghost" icon={<Sparkles size={15} />} onClick={() => { updateSettings({ display_name: name.trim() }); loadSample(); navigate(routes.today) }}>Explore with sample data</Button>}
          <span className="spacer" />
          {step < 4 && <Button variant="primary" onClick={() => setStep(step + 1)}>Continue <ArrowRight size={15} /></Button>}
          {step === 4 && <>
            <Button onClick={() => finish(routes.today)}>Go to Today</Button>
            <Button variant="primary" onClick={() => finish(routes.week())}>Plan my week <ArrowRight size={15} /></Button>
          </>}
        </div>
      </div>
    </div>
  )
}
