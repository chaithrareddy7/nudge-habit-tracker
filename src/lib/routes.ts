import type { DateKey } from './model'

// Deep links used across the app. Any date anywhere opens its full day view.
export const routes = {
  today: '/today',
  timer: '/timer',
  planner: '/plan',
  guide: '/guide',
  day: (date?: DateKey) => (date ? `/plan/day?date=${date}` : '/plan/day'),
  week: (date?: DateKey) => (date ? `/plan/week?date=${date}` : '/plan/week'),
  month: (date?: DateKey) => (date ? `/plan/month?date=${date}` : '/plan/month'),
  calendar: (view: 'day' | 'week' | 'month' = 'month', date?: DateKey) => `/calendar?view=${view}${date ? `&date=${date}` : ''}`,
  goals: '/goals',
  goal: (id: string) => `/goals/${id}`,
  habits: '/habits',
  habit: (id: string) => `/habits/${id}`,
  tasks: '/tasks',
  journal: (date?: DateKey) => (date ? `/journal?date=${date}` : '/journal'),
  analytics: (tab?: 'progress' | 'today' | 'week' | 'month' | 'all', date?: DateKey) => (tab ? `/analytics?tab=${tab}${date ? `&date=${date}` : ''}` : '/analytics'),
  insights: '/insights',
  search: (q?: string) => (q ? `/search?q=${encodeURIComponent(q)}` : '/search'),
  settings: '/settings',
  weekReview: (date?: DateKey) => `/plan/week?${date ? `date=${date}&` : ''}review=1`,
  monthReview: (date?: DateKey) => `/plan/month?${date ? `date=${date}&` : ''}review=1`,
}
