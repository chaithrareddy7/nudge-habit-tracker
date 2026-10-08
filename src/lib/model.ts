// Core entities for Nudge. Field names match the Supabase columns (snake_case)
// so rows can be synced without a mapping layer.
//
// Everything that happens on a day carries a local `date` key (yyyy-MM-dd).
// Week, month and year totals are always derived from those rows — nothing is
// stored twice.

export type DateKey = string // yyyy-MM-dd in the user's local time

export type Category = {
  id: string
  name: string
  color: string
  builtin: boolean
}

export type GoalHorizon = 'long_term' | 'monthly' | 'weekly' | 'project'
export type GoalStatus = 'active' | 'completed' | 'archived'
export type GoalPart = { id: string; name: string; target_hours: number }

export type Goal = {
  id: string
  title: string
  description: string
  category: string // category name
  horizon: GoalHorizon
  parent_id: string | null // e.g. a weekly goal that feeds a monthly goal
  start_date: DateKey
  deadline: DateKey | null
  target_hours: number // 0 = not time based
  weekly_target_hours: number // 0 = none
  parts: GoalPart[] // optional breakdown, e.g. Design / Development
  color: string
  status: GoalStatus
  completed_at: string | null
  created_at: string
}

export type Task = {
  id: string
  title: string
  notes: string
  date: DateKey | null // null = unscheduled backlog
  done: boolean
  done_at: string | null
  goal_id: string | null
  category: string
  estimate_minutes: number
  priority: 0 | 1 | 2 | 3 // 3 = highest
  reminder_time: string | null // HH:mm on `date`
  sort: number
  created_at: string
}

export type BlockKind = 'focus' | 'break'

/** A planned slot on the daily timeline. Focus blocks count as planned productive time. */
export type TimeBlock = {
  id: string
  title: string
  date: DateKey
  start_min: number // minutes since local midnight
  end_min: number
  kind: BlockKind
  category: string
  goal_id: string | null
  task_id: string | null
  reminder: boolean
  created_at: string
}

export type PlannerEvent = {
  id: string
  title: string
  date: DateKey
  start_min: number | null // null = all day
  end_min: number | null
  location: string
  notes: string
  important: boolean
  reminder: boolean
  created_at: string
}

export type ProductiveSession = {
  id: string
  date: DateKey // local date the session started
  started_at: string // ISO
  ended_at: string // ISO
  duration_seconds: number // excludes paused time
  category: string
  goal_id: string | null
  goal_part_id: string | null
  task_id: string | null
  block_id: string | null // planned block this session fulfilled
  rating: number | null // 1–5
  notes: string
  source: 'timer' | 'manual'
  label: string // what the user called it, e.g. "Case study draft"
  created_at: string
}

/** The one running (or paused) timer. Becomes a ProductiveSession when stopped. */
export type ActiveTimer = {
  label: string
  category: string
  goal_id: string | null
  goal_part_id: string | null
  task_id: string | null
  block_id: string | null
  started_at: string // ISO, first start
  accumulated_seconds: number // time banked before the latest resume
  resumed_at: string | null // ISO; null while paused
}

export type HabitFrequency =
  | { type: 'daily' }
  | { type: 'weekly'; times: number } // n times per week, any days
  | { type: 'custom'; days: number[] } // specific weekdays, 0 = Sunday

export type Habit = {
  id: string
  name: string
  icon: string
  color: string
  category: string
  frequency: HabitFrequency
  target_amount: number // e.g. 8 (glasses), 1 for simple check-offs
  unit: string // e.g. "glasses", "pages"; empty for simple check-offs
  reminder_time: string | null // HH:mm
  start_date: DateKey
  end_date: DateKey | null
  goal_id: string | null
  archived: boolean
  sort: number
  created_at: string
}

export type HabitCompletion = {
  id: string
  habit_id: string
  date: DateKey
  amount: number // complete when amount >= habit.target_amount
}

export type JournalEntry = {
  id: string
  date: DateKey
  mood: number | null // 1–5
  energy: number | null // 1–5
  body: string // "How was your day?"
  went_well: string
  distractions: string
  tomorrow_priority: string
  highlights: string
  challenges: string
  gratitude: string
  notes: string
  photos: string[] // compressed data URLs
  updated_at: string
}

export type Note = {
  id: string
  text: string
  date: DateKey | null // null = inbox note
  created_at: string
}

/** Per-day planning metadata. Days themselves are implicit. */
export type DayPlan = {
  id: string
  date: DateKey
  target_minutes: number | null // null = use the default daily target
  focus: string // main focus for the day
}

export type ReviewPeriod = 'week' | 'month'
export type Review = {
  id: string
  period: ReviewPeriod
  start: DateKey // Monday of the week, or the 1st of the month
  answers: Record<string, string>
  target_minutes: number | null // override for that week/month's target
  updated_at: string
}

export type ReminderKind = 'journal' | 'weekly_review' | 'monthly_review' | 'planning' | 'custom'
/** Standalone reminders. Habit/task/block/event reminders come from those entities. */
export type Reminder = {
  id: string
  kind: ReminderKind
  title: string
  time: string // HH:mm
  days: number[] // weekdays (0 = Sunday); for monthly_review this is ignored and it fires on the last day
  enabled: boolean
}

export type Settings = {
  display_name: string
  onboarded: boolean
  theme: 'light' | 'dark' | 'system'
  target_minutes_day: number
  target_minutes_week: number
  target_minutes_month: number
  min_minutes_day: number // threshold for the productivity streak
  day_start_hour: number // timeline start
  day_end_hour: number // timeline end
  notifications: boolean // browser notifications allowed/wanted
  active_timer: ActiveTimer | null
  milestones_seen: Record<string, number> // streak key -> best value celebrated
  checklist_dismissed: boolean // hides the Getting started card on Today
}

export type Workspace = {
  settings: Settings
  categories: Category[]
  goals: Goal[]
  tasks: Task[]
  blocks: TimeBlock[]
  events: PlannerEvent[]
  sessions: ProductiveSession[]
  habits: Habit[]
  completions: HabitCompletion[]
  journal: JournalEntry[]
  notes: Note[]
  days: DayPlan[]
  reviews: Review[]
  reminders: Reminder[]
}

/** Collections that are arrays of rows with an `id`. */
export type CollectionName = Exclude<keyof Workspace, 'settings'>
export type RowOf<C extends CollectionName> = Workspace[C][number]

// Fixed-order categorical palette (validated for colour-vision deficiency on
// light and dark surfaces). Categories take slots in order; never cycle.
export const CATEGORY_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-work', name: 'Work', color: CATEGORY_COLORS[0], builtin: true },
  { id: 'cat-coding', name: 'Coding', color: CATEGORY_COLORS[1], builtin: true },
  { id: 'cat-learning', name: 'Learning', color: CATEGORY_COLORS[2], builtin: true },
  { id: 'cat-study', name: 'Study', color: CATEGORY_COLORS[3], builtin: true },
  { id: 'cat-creative', name: 'Creative', color: CATEGORY_COLORS[4], builtin: true },
  { id: 'cat-exercise', name: 'Exercise', color: CATEGORY_COLORS[5], builtin: true },
  { id: 'cat-personal', name: 'Personal', color: CATEGORY_COLORS[6], builtin: true },
]

export const DEFAULT_SETTINGS: Settings = {
  display_name: '',
  onboarded: false,
  theme: 'light',
  target_minutes_day: 5 * 60,
  target_minutes_week: 30 * 60,
  target_minutes_month: 120 * 60,
  min_minutes_day: 2 * 60,
  day_start_hour: 6,
  day_end_hour: 23,
  notifications: false,
  active_timer: null,
  milestones_seen: {},
  checklist_dismissed: false,
}

export const DEFAULT_REMINDERS: Reminder[] = [
  { id: 'rem-journal', kind: 'journal', title: 'Write your daily reflection', time: '21:30', days: [0, 1, 2, 3, 4, 5, 6], enabled: true },
  { id: 'rem-planning', kind: 'planning', title: 'Plan tomorrow', time: '20:30', days: [0, 1, 2, 3, 4], enabled: false },
  { id: 'rem-weekly', kind: 'weekly_review', title: 'Weekly review', time: '18:00', days: [0], enabled: true },
  { id: 'rem-monthly', kind: 'monthly_review', title: 'Monthly review', time: '18:00', days: [], enabled: true },
]

export const emptyWorkspace = (): Workspace => ({
  settings: { ...DEFAULT_SETTINGS },
  categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
  goals: [],
  tasks: [],
  blocks: [],
  events: [],
  sessions: [],
  habits: [],
  completions: [],
  journal: [],
  notes: [],
  days: [],
  reviews: [],
  reminders: DEFAULT_REMINDERS.map(r => ({ ...r })),
})

export const MOODS = ['😞', '😕', '😐', '🙂', '😄'] as const
export const HABIT_ICONS = ['📖', '🏃', '🧘', '💧', '💻', '✍️', '😴', '🥗', '🎸', '🧠', '🌱', '☀️']
