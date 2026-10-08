import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, CalendarRange, Columns3, LayoutGrid } from 'lucide-react'
import { routes } from '../lib/routes'

// One "Planner" in the navigation; Day / Week / Month / Calendar are views of it.
// The last view used is remembered so the Planner link returns to it.

type View = 'day' | 'week' | 'month' | 'calendar'
const KEY = 'nudge-planner-view'
const VIEWS: Array<{ value: View; label: string; icon: typeof CalendarDays }> = [
  { value: 'day', label: 'Day', icon: CalendarDays },
  { value: 'week', label: 'Week', icon: Columns3 },
  { value: 'month', label: 'Month', icon: LayoutGrid },
  { value: 'calendar', label: 'Calendar', icon: CalendarRange },
]

const remember = (v: View) => { try { localStorage.setItem(KEY, v) } catch { /* storage unavailable */ } }
const recall = (): View => { try { const v = localStorage.getItem(KEY); return v === 'week' || v === 'month' || v === 'calendar' ? v : 'day' } catch { return 'day' } }

function urlFor(view: View, date?: string) {
  if (view === 'calendar') return routes.calendar('month', date)
  return routes[view](date)
}

/** Switcher shown at the top of each planner view; keeps the selected date. */
export function PlannerTabs() {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const current: View = pathname.startsWith('/calendar') ? 'calendar' : pathname.startsWith('/plan/week') ? 'week' : pathname.startsWith('/plan/month') ? 'month' : 'day'
  const date = params.get('date') || undefined
  return (
    <nav className="segmented planner-tabs" aria-label="Planner view">
      {VIEWS.map(({ value, label, icon: Icon }) => (
        <button
          type="button"
          key={value}
          aria-pressed={value === current}
          onClick={() => { remember(value); navigate(urlFor(value, date)) }}
        >
          <Icon size={14} />{label}
        </button>
      ))}
    </nav>
  )
}

/** /plan → the planner view used last. */
export function PlannerHome() {
  return <Navigate to={urlFor(recall())} replace />
}

/** Call from a planner view so direct visits are remembered too. */
export function rememberPlannerView(pathname: string) {
  remember(pathname.startsWith('/calendar') ? 'calendar' : pathname.startsWith('/plan/week') ? 'week' : pathname.startsWith('/plan/month') ? 'month' : 'day')
}
