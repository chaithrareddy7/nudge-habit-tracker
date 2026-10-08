import { createContext, useCallback, useContext, useEffect, useId, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { fmt, formatDuration, fromKey, shiftKey, todayKey, toKey, weekStartKey } from '../lib/dates'
import { addMonths } from 'date-fns'
import type { DateKey } from '../lib/model'

// ---------------------------------------------------------------------------
// Layout

export function Page({ eyebrow, title, subtitle, actions, children, className = '' }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <motion.div className={`page ${className}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
      <header className="page-head">
        <div style={{ minWidth: 0 }}>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
      {children}
    </motion.div>
  )
}

export function Card({ title, sub, action, children, className = '', id }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`card ${className}`} id={id}>
      {(title || action) && (
        <div className="card-head">
          <div style={{ minWidth: 0 }}>
            {title && <h2>{title}</h2>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Controls

type Variant = 'primary' | 'soft' | 'ghost' | 'danger' | 'default'
export function Button({ variant = 'default', size, icon, block, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'lg'; icon?: ReactNode; block?: boolean }) {
  return (
    <button type="button" className={`btn ${variant !== 'default' ? variant : ''} ${size || ''} ${block ? 'block' : ''} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  )
}

export function IconButton({ label, children, size, bordered, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm'; bordered?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} className={`icon-btn ${size || ''} ${bordered ? 'bordered' : ''} ${className}`} {...rest}>
      {children}
    </button>
  )
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: Array<{ value: T; label: ReactNode }>; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(o => (
        <button type="button" key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ value: T; label: ReactNode }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(t => (
        <button type="button" role="tab" key={t.value} aria-selected={t.value === value} onClick={() => onChange(t.value)}>{t.label}</button>
      ))}
    </div>
  )
}

export function Field({ label, hint, children, className = '' }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span>{label} {hint && <span className="hint">{hint}</span>}</span>
      {children}
    </label>
  )
}

/** Round check for habits/tasks. `progress` (0–1) shows a partial ring for amount-based habits. */
export function Tick({ checked, onChange, label, progress, square }: { checked: boolean; onChange: () => void; label: string; progress?: number; square?: boolean }) {
  const partial = !checked && progress !== undefined && progress > 0
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`tick ${square ? 'square' : ''} ${partial ? 'partial' : ''}`}
      style={partial ? ({ '--p': Math.round(progress * 100) } as React.CSSProperties) : undefined}
      onClick={e => { e.stopPropagation(); onChange() }}
    >
      {checked && <Check size={14} strokeWidth={3} />}
    </button>
  )
}

export function Stars({ value, onChange, size = 22 }: { value: number | null; onChange?: (v: number) => void; size?: number }) {
  if (!onChange) {
    // Read-only: plain text so it can sit inside other buttons/links.
    return (
      <span className="stars" role="img" aria-label={value ? `Rated ${value} of 5` : 'Not rated'}>
        {[1, 2, 3, 4, 5].map(n => <span key={n} className={value && value >= n ? 'on' : ''} style={{ fontSize: size }} aria-hidden>★</span>)}
      </span>
    )
  }
  return (
    <div className="stars" role="radiogroup" aria-label="Productivity rating">
      {[1, 2, 3, 4, 5].map(n => (
        <button type="button" key={n} className={value && value >= n ? 'on' : ''} style={{ fontSize: size }} onClick={() => onChange(n)} aria-label={`${n} of 5`} role="radio" aria-checked={value === n}>★</button>
      ))}
    </div>
  )
}

/** 1–5 picker rendered with emoji or numbers. */
export function ScalePick({ value, onChange, labels, name }: { value: number | null; onChange: (v: number | null) => void; labels: readonly string[]; name: string }) {
  return (
    <div className="scale-pick" role="group" aria-label={name}>
      {labels.map((l, i) => (
        <button type="button" key={i} aria-pressed={value === i + 1} aria-label={`${name} ${i + 1} of ${labels.length}`} onClick={() => onChange(value === i + 1 ? null : i + 1)}>{l}</button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Progress

export function ProgressBar({ value, tone, size, marker, label }: { value: number; tone?: 'good'; size?: 'thin' | 'thick'; marker?: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className={`progress ${tone || ''} ${size || ''}`} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <i style={{ width: `${v}%` }} />
      {marker !== undefined && marker > 0 && marker < 100 && <span className="marker" style={{ left: `${marker}%` }} />}
    </div>
  )
}

export function Ring({ value, size = 120, stroke = 10, color, children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="ring-value" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={color ? { stroke: color } : undefined} />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  )
}

export function Stat({ label, value, sub, icon, trend }: { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: ReactNode; trend?: number | null }) {
  return (
    <div className="stat">
      <div className="stat-label">{icon}{label}</div>
      <div className="stat-value">{value}</div>
      {(sub || trend !== undefined) && (
        <div className="stat-sub">
          {trend !== undefined && trend !== null && <span className={trend >= 0 ? 'trend-up' : 'trend-down'}>{trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}% </span>}
          {sub}
        </div>
      )}
    </div>
  )
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <span className="empty-icon">{icon}</span>}
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  )
}

export const Dot = ({ color, size = 8 }: { color: string; size?: number }) => <span className="dot" style={{ background: color, width: size, height: size }} />

export const Duration = ({ seconds, short }: { seconds: number; short?: boolean }) => <span className="tabular">{formatDuration(seconds, { short })}</span>

// ---------------------------------------------------------------------------
// Modal

export function Modal({ open, onClose, title, subtitle, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`modal ${wide ? 'wide' : ''}`} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.18 }}>
            <div className="modal-head">
              <div>
                <h2 id={titleId}>{title}</h2>
                {subtitle && <p>{subtitle}</p>}
              </div>
              <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Inline two-step confirm (window.confirm is unfriendly on mobile). */
export function ConfirmButton({ onConfirm, children, confirmLabel = 'Confirm', size = 'sm' }: { onConfirm: () => void; children: ReactNode; confirmLabel?: string; size?: 'sm' | 'lg' }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => { if (!armed) return; const t = window.setTimeout(() => setArmed(false), 3000); return () => window.clearTimeout(t) }, [armed])
  return armed
    ? <Button variant="danger" size={size} onClick={() => { setArmed(false); onConfirm() }}>{confirmLabel}</Button>
    : <Button variant="ghost" size={size} onClick={() => setArmed(true)}>{children}</Button>
}

// ---------------------------------------------------------------------------
// Date navigation

export function DateStepper({ value, onChange, mode }: { value: DateKey; onChange: (k: DateKey) => void; mode: 'day' | 'week' | 'month' }) {
  const step = (dir: number) => {
    if (mode === 'day') onChange(shiftKey(value, dir))
    else if (mode === 'week') onChange(shiftKey(weekStartKey(value), dir * 7))
    else onChange(toKey(addMonths(fromKey(value), dir)))
  }
  const label = mode === 'day' ? fmt(value, 'EEE, MMM d') : mode === 'week' ? `${fmt(weekStartKey(value), 'MMM d')} – ${fmt(shiftKey(weekStartKey(value), 6), 'MMM d')}` : fmt(value, 'MMMM yyyy')
  const isCurrent = mode === 'day' ? value === todayKey() : mode === 'week' ? weekStartKey(value) === weekStartKey(todayKey()) : value.slice(0, 7) === todayKey().slice(0, 7)
  return (
    <div className="row wrap stepper-wrap">
      <div className="stepper">
        <IconButton size="sm" label={`Previous ${mode}`} onClick={() => step(-1)}><ChevronLeft size={16} /></IconButton>
        <span className="stepper-label">{label}</span>
        <IconButton size="sm" label={`Next ${mode}`} onClick={() => step(1)}><ChevronRight size={16} /></IconButton>
      </div>
      {!isCurrent && <Button size="sm" variant="ghost" onClick={() => onChange(todayKey())}>{mode === 'day' ? 'Today' : mode === 'week' ? 'This week' : 'This month'}</Button>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Charts

/** Recharts tooltip in the app's style. Values are seconds unless `format` is given. */
export function ChartTooltip({ active, payload, label, format = v => formatDuration(v), labelFormat }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string; payload?: Record<string, unknown> }>; label?: string | number; format?: (v: number) => string; labelFormat?: (l: string | number) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      {label !== undefined && <div className="tt-title">{labelFormat ? labelFormat(label) : label}</div>}
      {payload.map((p, i) => (
        <div className="tt-row" key={i}>
          <span className="row"><Dot color={p.color || 'var(--accent)'} />{p.name}</span>
          <b>{format(Number(p.value || 0))}</b>
        </div>
      ))}
    </div>
  )
}

// Categorical palette: light hex -> dark-surface step of the same hue.
const DARK_STEPS: Record<string, string> = { '#2a78d6': '#3987e5', '#eb6834': '#d95926', '#1baf7a': '#199e70', '#eda100': '#c98500', '#e87ba4': '#d55181', '#008300': '#008300', '#4a3aa7': '#9085e9', '#e34948': '#e66767', '#c45d82': '#e27aa0' }

function subscribeTheme(cb: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const obs = new MutationObserver(cb)
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  mq.addEventListener('change', cb)
  return () => { obs.disconnect(); mq.removeEventListener('change', cb) }
}
const readDark = () => {
  const t = document.documentElement.dataset.theme
  return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
}
export const useIsDark = () => useSyncExternalStore(subscribeTheme, readDark, () => false)

/** Returns a function mapping a category/goal hex to the right step for the current theme. */
export function useSeriesColor() {
  const dark = useIsDark()
  return useCallback((hex: string) => (dark ? DARK_STEPS[hex.toLowerCase()] || hex : hex), [dark])
}

// ---------------------------------------------------------------------------
// Toasts

type Toast = { id: number; text: ReactNode; tone?: 'celebrate'; action?: { label: string; onClick: () => void } }
const ToastContext = createContext<(text: ReactNode, opts?: { tone?: 'celebrate'; action?: Toast['action']; ms?: number }) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: ReactNode, opts: { tone?: 'celebrate'; action?: Toast['action']; ms?: number } = {}) => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t.slice(-2), { id, text, tone: opts.tone, action: opts.action }])
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), opts.ms || 3200)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div key={t.id} className={`toast ${t.tone || ''}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
              {t.text}
              {t.action && <button onClick={() => { t.action!.onClick(); setToasts(x => x.filter(y => y.id !== t.id)) }}>{t.action.label}</button>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
export const useToast = () => useContext(ToastContext)
