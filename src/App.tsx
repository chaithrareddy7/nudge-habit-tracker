import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import LoginPage from './LoginPage'
import { StoreProvider, useStore } from './lib/store'
import { AppShell } from './shell/AppShell'
import { EditorHost } from './shell/editors'
import { Onboarding } from './shell/Onboarding'
import { PlannerHome } from './shell/PlannerTabs'
import { ToastProvider } from './ui/kit'
const Today = lazy(() => import('./screens/Today'))
const Settings = lazy(() => import('./screens/Settings'))
const SearchScreen = lazy(() => import('./screens/Search'))
const Insights = lazy(() => import('./screens/Insights'))
const Analytics = lazy(() => import('./screens/Analytics'))
const Journal = lazy(() => import('./screens/Journal'))
const Tasks = lazy(() => import('./screens/Tasks'))
const Habits = lazy(() => import('./screens/Habits'))
const Goals = lazy(() => import('./screens/Goals'))
const CalendarScreen = lazy(() => import('./screens/Calendar'))
const MonthPlanner = lazy(() => import('./screens/MonthPlanner'))
const WeekPlanner = lazy(() => import('./screens/WeekPlanner'))
const DayPlanner = lazy(() => import('./screens/DayPlanner'))
const TimerScreen = lazy(() => import('./screens/Timer'))
const Guide = lazy(() => import('./screens/Guide'))

/** Applies the theme preference to <html data-theme>; "system" leaves it to the OS. */
function ThemeSync() {
  const { ws } = useStore()
  useEffect(() => {
    const root = document.documentElement
    if (ws.settings.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = ws.settings.theme
    const dark = ws.settings.theme === 'dark' || (ws.settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121011' : '#f7f5f4')
  }, [ws.settings.theme])
  return null
}

function Gate({ children }: { children: ReactNode }) {
  const { ws, ready } = useStore()
  const { pathname } = useLocation()
  if (pathname === '/login') return <LoginPage />
  if (!ready) return <div className="boot" aria-busy="true" />
  if (!ws.settings.onboarded) return <Onboarding />
  return <AppShell><Suspense fallback={<div className="page-loading" aria-busy="true" />}>{children}</Suspense></AppShell>
}

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <ToastProvider>
          <EditorHost>
            <ThemeSync />
            <Gate>
              <Routes>
                <Route path="/" element={<Navigate to="/today" replace />} />
                <Route path="/today" element={<Today />} />
                <Route path="/timer" element={<TimerScreen />} />
                <Route path="/plan" element={<PlannerHome />} />
                <Route path="/plan/day" element={<DayPlanner />} />
                <Route path="/plan/week" element={<WeekPlanner />} />
                <Route path="/plan/month" element={<MonthPlanner />} />
                <Route path="/calendar" element={<CalendarScreen />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/goals/:id" element={<Goals />} />
                <Route path="/habits" element={<Habits />} />
                <Route path="/habits/:id" element={<Habits />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/journal" element={<Journal />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/search" element={<SearchScreen />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/guide" element={<Guide />} />
                <Route path="/login" element={null} />
                <Route path="*" element={<Navigate to="/today" replace />} />
              </Routes>
            </Gate>
          </EditorHost>
        </ToastProvider>
      </StoreProvider>
    </BrowserRouter>
  )
}
