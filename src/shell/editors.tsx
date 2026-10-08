import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Play, Plus, Trash2, X } from 'lucide-react'
import { clockToMin, formatDuration, minToClock, nowMin, todayKey } from '../lib/dates'
import { activeGoals, blockAt } from '../lib/selectors'
import { newId, useStore, type NewRow } from '../lib/store'
import { CATEGORY_COLORS, HABIT_ICONS, type DateKey, type Goal, type GoalHorizon, type Habit, type HabitFrequency, type PlannerEvent, type ProductiveSession, type Task, type TimeBlock } from '../lib/model'
import { Button, ConfirmButton, Field, IconButton, Modal, Segmented, Stars, useToast } from '../ui/kit'

// One host renders every create/edit dialog, so Quick Add and all screens open
// the same forms: `const { open } = useEditors(); open({ kind: 'task', defaults: { date } })`.

export type EditorRequest =
  | { kind: 'task'; id?: string; defaults?: Partial<Task> }
  | { kind: 'habit'; id?: string; defaults?: Partial<Habit> }
  | { kind: 'goal'; id?: string; defaults?: Partial<Goal> }
  | { kind: 'event'; id?: string; defaults?: Partial<PlannerEvent> }
  | { kind: 'block'; id?: string; defaults?: Partial<TimeBlock> }
  | { kind: 'session'; id?: string; defaults?: Partial<ProductiveSession> }
  | { kind: 'note'; defaults?: { date?: DateKey | null } }
  | { kind: 'timer'; defaults?: { category?: string; goal_id?: string | null; goal_part_id?: string | null; task_id?: string | null; block_id?: string | null; label?: string } }
  | { kind: 'category' }

const EditorContext = createContext<{ open: (r: EditorRequest) => void }>({ open: () => {} })
export const useEditors = () => useContext(EditorContext)

export function EditorHost({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<EditorRequest | null>(null)
  const close = useCallback(() => setReq(null), [])
  const open = useCallback((r: EditorRequest) => setReq(r), [])
  return (
    <EditorContext.Provider value={{ open }}>
      {children}
      {/* key forces fresh form state for every request */}
      {req?.kind === 'task' && <TaskEditor key={JSON.stringify(req)} req={req} close={close} />}
      {req?.kind === 'habit' && <HabitEditor key={JSON.stringify(req)} req={req} close={close} />}
      {req?.kind === 'goal' && <GoalEditor key={JSON.stringify(req)} req={req} close={close} />}
      {req?.kind === 'event' && <EventEditor key={JSON.stringify(req)} req={req} close={close} />}
      {req?.kind === 'block' && <BlockEditor key={JSON.stringify(req)} req={req} close={close} />}
      {req?.kind === 'session' && <SessionEditor key={JSON.stringify(req)} req={req} close={close} />}
      {req?.kind === 'note' && <NoteEditor key={JSON.stringify(req)} req={req} close={close} />}
      {req?.kind === 'timer' && <StartTimerDialog key={JSON.stringify(req)} req={req} close={close} />}
      {req?.kind === 'category' && <CategoryEditor close={close} />}
    </EditorContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Shared pickers

export function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { ws } = useStore()
  return (
    <select className="select" value={value} onChange={e => onChange(e.target.value)}>
      {ws.categories.map(c => <option key={c.id}>{c.name}</option>)}
      {!ws.categories.some(c => c.name === value) && value && <option>{value}</option>}
    </select>
  )
}

export function GoalSelect({ value, onChange, empty = 'No goal' }: { value: string | null; onChange: (v: string | null) => void; empty?: string }) {
  const { ws } = useStore()
  return (
    <select className="select" value={value || ''} onChange={e => onChange(e.target.value || null)}>
      <option value="">{empty}</option>
      {activeGoals(ws).map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
    </select>
  )
}

function TimeInput({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  return <input className="input" type="time" step={300} value={minToClock(value)} onChange={e => e.target.value && onChange(clockToMin(e.target.value))} />
}

const roundTo = (m: number, step = 15) => Math.round(m / step) * step

// ---------------------------------------------------------------------------
// Task

function TaskEditor({ req, close }: { req: Extract<EditorRequest, { kind: 'task' }>; close: () => void }) {
  const { ws, create, update, remove } = useStore()
  const toast = useToast()
  const existing = req.id ? ws.tasks.find(t => t.id === req.id) : undefined
  const [t, setT] = useState<Omit<Task, 'id'>>(() => existing || {
    title: '', notes: '', date: todayKey(), done: false, done_at: null, goal_id: null, category: 'Work', estimate_minutes: 30, priority: 1,
    reminder_time: null, sort: ws.tasks.length, created_at: new Date().toISOString(), ...req.defaults,
  })
  const set = (patch: Partial<Task>) => setT(prev => ({ ...prev, ...patch }))
  const save = () => {
    if (!t.title.trim()) return
    if (existing) update('tasks', existing.id, { ...t, title: t.title.trim() })
    else { create('tasks', { ...t, title: t.title.trim() }); toast('Task added') }
    close()
  }
  return (
    <Modal open onClose={close} title={existing ? 'Edit task' : 'New task'} footer={<>
      {existing && <ConfirmButton onConfirm={() => { remove('tasks', existing.id); close() }} confirmLabel="Delete task"><Trash2 size={14} /> Delete</ConfirmButton>}
      <span className="spacer" />
      <Button onClick={close}>Cancel</Button>
      <Button variant="primary" onClick={save} disabled={!t.title.trim()}>{existing ? 'Save' : 'Add task'}</Button>
    </>}>
      <form onSubmit={e => { e.preventDefault(); save() }} className="stack-lg">
        <Field label="Task"><input className="input" autoFocus value={t.title} onChange={e => set({ title: e.target.value })} placeholder="What needs doing?" /></Field>
        <div className="form-row">
          <Field label="Date" hint="(blank = backlog)"><input className="input" type="date" value={t.date || ''} onChange={e => set({ date: e.target.value || null })} /></Field>
          <Field label="Estimate"><select className="select" value={t.estimate_minutes} onChange={e => set({ estimate_minutes: Number(e.target.value) })}>{[5, 15, 30, 45, 60, 90, 120, 180].map(m => <option key={m} value={m}>{formatDuration(m * 60)}</option>)}</select></Field>
        </div>
        <div className="form-row">
          <Field label="Category"><CategorySelect value={t.category} onChange={category => set({ category })} /></Field>
          <Field label="Goal"><GoalSelect value={t.goal_id} onChange={goal_id => set({ goal_id })} /></Field>
        </div>
        <div className="form-row">
          <Field label="Priority"><Segmented value={String(t.priority) as '0' | '1' | '2' | '3'} onChange={v => set({ priority: Number(v) as Task['priority'] })} options={[{ value: '0', label: 'Low' }, { value: '1', label: 'Normal' }, { value: '2', label: 'High' }, { value: '3', label: 'Top' }]} /></Field>
          <Field label="Reminder" hint="(optional)"><input className="input" type="time" value={t.reminder_time || ''} onChange={e => set({ reminder_time: e.target.value || null })} /></Field>
        </div>
        <Field label="Notes"><textarea className="textarea" rows={3} value={t.notes} onChange={e => set({ notes: e.target.value })} /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Habit

function HabitEditor({ req, close }: { req: Extract<EditorRequest, { kind: 'habit' }>; close: () => void }) {
  const { ws, create, update, remove } = useStore()
  const toast = useToast()
  const existing = req.id ? ws.habits.find(h => h.id === req.id) : undefined
  const [h, setH] = useState<Omit<Habit, 'id'>>(() => existing || {
    name: '', icon: '🌱', color: CATEGORY_COLORS[ws.habits.length % CATEGORY_COLORS.length], category: 'Personal', frequency: { type: 'daily' }, target_amount: 1, unit: '',
    reminder_time: null, start_date: todayKey(), end_date: null, goal_id: null, archived: false, sort: ws.habits.length, created_at: new Date().toISOString(), ...req.defaults,
  })
  const set = (patch: Partial<Habit>) => setH(prev => ({ ...prev, ...patch }))
  const freq = h.frequency
  const setFreq = (f: HabitFrequency) => set({ frequency: f })
  const save = () => {
    if (!h.name.trim()) return
    if (freq.type === 'custom' && !freq.days.length) return
    if (existing) update('habits', existing.id, { ...h, name: h.name.trim() })
    else { create('habits', { ...h, name: h.name.trim() }); toast('Habit created — it now shows up in your planners') }
    close()
  }
  const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  return (
    <Modal open onClose={close} title={existing ? 'Edit habit' : 'New habit'} footer={<>
      {existing && <ConfirmButton onConfirm={() => { update('habits', existing.id, { archived: !existing.archived }); close() }} confirmLabel={existing.archived ? 'Restore' : 'Archive habit'}>{existing.archived ? 'Restore' : 'Archive'}</ConfirmButton>}
      {existing && <ConfirmButton onConfirm={() => { remove('habits', existing.id); close() }} confirmLabel="Delete forever"><Trash2 size={14} /> Delete</ConfirmButton>}
      <span className="spacer" />
      <Button onClick={close}>Cancel</Button>
      <Button variant="primary" onClick={save} disabled={!h.name.trim()}>{existing ? 'Save' : 'Create habit'}</Button>
    </>}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="Icon"><select className="select" style={{ width: 72, fontSize: 18 }} value={h.icon} onChange={e => set({ icon: e.target.value })}>{HABIT_ICONS.map(i => <option key={i}>{i}</option>)}</select></Field>
        <Field label="Habit" className="grow"><input className="input" autoFocus value={h.name} onChange={e => set({ name: e.target.value })} placeholder="Read, meditate, drink water…" /></Field>
      </div>
      <Field label="Frequency">
        <Segmented value={freq.type} onChange={type => setFreq(type === 'daily' ? { type } : type === 'weekly' ? { type, times: 3 } : { type, days: [1, 3, 5] })} options={[{ value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'X times / week' }, { value: 'custom', label: 'Specific days' }]} />
      </Field>
      {freq.type === 'weekly' && <Field label="Times per week"><input className="input" type="number" min={1} max={7} value={freq.times} onChange={e => setFreq({ type: 'weekly', times: Math.min(7, Math.max(1, Number(e.target.value))) })} /></Field>}
      {freq.type === 'custom' && (
        <div className="row wrap">
          {WEEKDAYS.map((d, i) => (
            <button type="button" key={i} className="chip chip-choice" aria-pressed={freq.days.includes(i)} onClick={() => setFreq({ type: 'custom', days: freq.days.includes(i) ? freq.days.filter(x => x !== i) : [...freq.days, i].sort() })}>{d}</button>
          ))}
        </div>
      )}
      <div className="form-row">
        <Field label="Daily target" hint="(amount)"><input className="input" type="number" min={1} value={h.target_amount} onChange={e => set({ target_amount: Math.max(1, Number(e.target.value)) })} /></Field>
        <Field label="Unit" hint="(optional)"><input className="input" value={h.unit} onChange={e => set({ unit: e.target.value })} placeholder="pages, glasses…" /></Field>
      </div>
      <div className="form-row">
        <Field label="Category"><CategorySelect value={h.category} onChange={category => set({ category })} /></Field>
        <Field label="Supports goal"><GoalSelect value={h.goal_id} onChange={goal_id => set({ goal_id })} /></Field>
      </div>
      <div className="form-row">
        <Field label="Start date"><input className="input" type="date" value={h.start_date} onChange={e => e.target.value && set({ start_date: e.target.value })} /></Field>
        <Field label="End date" hint="(optional)"><input className="input" type="date" value={h.end_date || ''} onChange={e => set({ end_date: e.target.value || null })} /></Field>
        <Field label="Reminder"><input className="input" type="time" value={h.reminder_time || ''} onChange={e => set({ reminder_time: e.target.value || null })} /></Field>
      </div>
      <Field label="Colour">
        <div className="row wrap">{CATEGORY_COLORS.map(c => <button type="button" key={c} aria-label={`Colour ${c}`} aria-pressed={h.color === c} onClick={() => set({ color: c })} style={{ width: 26, height: 26, borderRadius: 8, border: h.color === c ? '2px solid var(--ink)' : '2px solid transparent', background: c }} />)}</div>
      </Field>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Goal

function GoalEditor({ req, close }: { req: Extract<EditorRequest, { kind: 'goal' }>; close: () => void }) {
  const { ws, create, update, remove } = useStore()
  const toast = useToast()
  const existing = req.id ? ws.goals.find(g => g.id === req.id) : undefined
  const [g, setG] = useState<Omit<Goal, 'id'>>(() => existing || {
    title: '', description: '', category: 'Coding', horizon: 'monthly', parent_id: null, start_date: todayKey(), deadline: null, target_hours: 20,
    weekly_target_hours: 5, parts: [], color: CATEGORY_COLORS[ws.goals.length % CATEGORY_COLORS.length], status: 'active', completed_at: null, created_at: new Date().toISOString(), ...req.defaults,
  })
  const set = (patch: Partial<Goal>) => setG(prev => ({ ...prev, ...patch }))
  const save = () => {
    if (!g.title.trim()) return
    const row = { ...g, title: g.title.trim(), parts: g.parts.filter(p => p.name.trim()) }
    if (existing) update('goals', existing.id, row)
    else { create('goals', row); toast('Goal created — sessions linked to it now count toward progress') }
    close()
  }
  const parents = ws.goals.filter(x => x.id !== req.id && x.status === 'active' && x.horizon !== 'weekly')
  return (
    <Modal open wide onClose={close} title={existing ? 'Edit goal' : 'New goal'} subtitle="Track it by hours, by tasks, or both." footer={<>
      {existing && <ConfirmButton onConfirm={() => { remove('goals', existing.id); close() }} confirmLabel="Delete goal"><Trash2 size={14} /> Delete</ConfirmButton>}
      <span className="spacer" />
      <Button onClick={close}>Cancel</Button>
      <Button variant="primary" onClick={save} disabled={!g.title.trim()}>{existing ? 'Save' : 'Create goal'}</Button>
    </>}>
      <Field label="Goal"><input className="input" autoFocus value={g.title} onChange={e => set({ title: e.target.value })} placeholder="Build portfolio, 30 hours of coding…" /></Field>
      <Field label="Description"><textarea className="textarea" rows={2} value={g.description} onChange={e => set({ description: e.target.value })} placeholder="Why does it matter? What does done look like?" /></Field>
      <Field label="Type">
        <Segmented<GoalHorizon> value={g.horizon} onChange={horizon => set({ horizon })} options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'long_term', label: 'Long-term' }, { value: 'project', label: 'Project' }]} />
      </Field>
      <div className="form-row">
        <Field label="Category"><CategorySelect value={g.category} onChange={category => set({ category })} /></Field>
        <Field label="Part of" hint="(optional)">
          <select className="select" value={g.parent_id || ''} onChange={e => set({ parent_id: e.target.value || null })}>
            <option value="">—</option>
            {parents.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Target hours" hint="(0 = task-based)"><input className="input" type="number" min={0} step={0.5} value={g.target_hours} onChange={e => set({ target_hours: Math.max(0, Number(e.target.value)) })} /></Field>
        <Field label="Weekly target" hint="(hours)"><input className="input" type="number" min={0} step={0.5} value={g.weekly_target_hours} onChange={e => set({ weekly_target_hours: Math.max(0, Number(e.target.value)) })} /></Field>
        <Field label="Start"><input className="input" type="date" value={g.start_date} onChange={e => e.target.value && set({ start_date: e.target.value })} /></Field>
        <Field label="Deadline"><input className="input" type="date" value={g.deadline || ''} onChange={e => set({ deadline: e.target.value || null })} /></Field>
      </div>
      <Field label="Breakdown" hint="(optional — e.g. Design 5h, Development 15h)">
        <div className="stack">
          {g.parts.map((p, i) => (
            <div className="row" key={p.id}>
              <input className="input grow" value={p.name} placeholder="Part name" onChange={e => set({ parts: g.parts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input className="input" style={{ width: 90 }} type="number" min={0} step={0.5} value={p.target_hours} aria-label="Hours" onChange={e => set({ parts: g.parts.map((x, j) => (j === i ? { ...x, target_hours: Number(e.target.value) } : x)) })} />
              <IconButton label="Remove part" onClick={() => set({ parts: g.parts.filter((_, j) => j !== i) })}><X size={15} /></IconButton>
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => set({ parts: [...g.parts, { id: newId(), name: '', target_hours: 5 }] })}>Add part</Button>
        </div>
      </Field>
      <Field label="Colour">
        <div className="row wrap">{CATEGORY_COLORS.map(c => <button type="button" key={c} aria-label={`Colour ${c}`} aria-pressed={g.color === c} onClick={() => set({ color: c })} style={{ width: 26, height: 26, borderRadius: 8, border: g.color === c ? '2px solid var(--ink)' : '2px solid transparent', background: c }} />)}</div>
      </Field>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Event

function EventEditor({ req, close }: { req: Extract<EditorRequest, { kind: 'event' }>; close: () => void }) {
  const { ws, create, update, remove } = useStore()
  const existing = req.id ? ws.events.find(e => e.id === req.id) : undefined
  const start = roundTo(nowMin() + 30, 30)
  const [ev, setEv] = useState<Omit<PlannerEvent, 'id'>>(() => existing || {
    title: '', date: todayKey(), start_min: start, end_min: start + 60, location: '', notes: '', important: false, reminder: true, created_at: new Date().toISOString(), ...req.defaults,
  })
  const set = (patch: Partial<PlannerEvent>) => setEv(prev => ({ ...prev, ...patch }))
  const allDay = ev.start_min === null
  const valid = ev.title.trim() && (allDay || (ev.end_min ?? 0) > (ev.start_min ?? 0))
  const save = () => {
    if (!valid) return
    if (existing) update('events', existing.id, ev)
    else create('events', ev)
    close()
  }
  return (
    <Modal open onClose={close} title={existing ? 'Edit event' : 'New event'} footer={<>
      {existing && <ConfirmButton onConfirm={() => { remove('events', existing.id); close() }} confirmLabel="Delete event"><Trash2 size={14} /> Delete</ConfirmButton>}
      <span className="spacer" />
      <Button onClick={close}>Cancel</Button>
      <Button variant="primary" onClick={save} disabled={!valid}>{existing ? 'Save' : 'Add event'}</Button>
    </>}>
      <Field label="Event"><input className="input" autoFocus value={ev.title} onChange={e => set({ title: e.target.value })} placeholder="Meeting, appointment, dinner…" /></Field>
      <div className="form-row">
        <Field label="Date"><input className="input" type="date" value={ev.date} onChange={e => e.target.value && set({ date: e.target.value })} /></Field>
        {!allDay && <Field label="Starts"><TimeInput value={ev.start_min!} onChange={m => set({ start_min: m, end_min: Math.max(m + 15, ev.end_min ?? m + 60) })} /></Field>}
        {!allDay && <Field label="Ends"><TimeInput value={ev.end_min!} onChange={m => set({ end_min: m })} /></Field>}
      </div>
      <div className="row wrap" style={{ gap: 16 }}>
        <label className="check"><input type="checkbox" checked={allDay} onChange={e => set(e.target.checked ? { start_min: null, end_min: null } : { start_min: start, end_min: start + 60 })} /> All day</label>
        <label className="check"><input type="checkbox" checked={ev.important} onChange={e => set({ important: e.target.checked })} /> Important</label>
        <label className="check"><input type="checkbox" checked={ev.reminder} onChange={e => set({ reminder: e.target.checked })} /> Remind me</label>
      </div>
      <Field label="Location"><input className="input" value={ev.location} onChange={e => set({ location: e.target.value })} /></Field>
      <Field label="Notes"><textarea className="textarea" rows={2} value={ev.notes} onChange={e => set({ notes: e.target.value })} /></Field>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Time block

function BlockEditor({ req, close }: { req: Extract<EditorRequest, { kind: 'block' }>; close: () => void }) {
  const { ws, create, update, remove, startTimer } = useStore()
  const existing = req.id ? ws.blocks.find(b => b.id === req.id) : undefined
  const start = roundTo(nowMin() + 15, 30)
  const [b, setB] = useState<Omit<TimeBlock, 'id'>>(() => existing || {
    title: '', date: todayKey(), start_min: start, end_min: start + 60, kind: 'focus', category: 'Coding', goal_id: null, task_id: null, reminder: false, created_at: new Date().toISOString(), ...req.defaults,
  })
  const set = (patch: Partial<TimeBlock>) => setB(prev => ({ ...prev, ...patch }))
  const valid = b.end_min > b.start_min
  const title = b.title.trim() || (b.kind === 'break' ? 'Break' : b.category)
  const save = () => {
    if (!valid) return
    if (existing) update('blocks', existing.id, { ...b, title })
    else create('blocks', { ...b, title })
    close()
  }
  const tasks = ws.tasks.filter(t => !t.done && (!t.date || t.date === b.date))
  return (
    <Modal open onClose={close} title={existing ? 'Edit time block' : 'Plan a time block'} subtitle="Focus blocks count as planned productive time." footer={<>
      {existing && <ConfirmButton onConfirm={() => { remove('blocks', existing.id); close() }} confirmLabel="Delete block"><Trash2 size={14} /> Delete</ConfirmButton>}
      {existing && existing.kind === 'focus' && existing.date === todayKey() && !ws.settings.active_timer && <Button variant="soft" icon={<Play size={14} />} onClick={() => { startTimer({ block_id: existing.id }); close() }}>Start now</Button>}
      <span className="spacer" />
      <Button onClick={close}>Cancel</Button>
      <Button variant="primary" onClick={save} disabled={!valid}>{existing ? 'Save' : 'Add block'}</Button>
    </>}>
      <Segmented value={b.kind} onChange={kind => set({ kind })} options={[{ value: 'focus', label: 'Focus / productive' }, { value: 'break', label: 'Break' }]} />
      <Field label="Title"><input className="input" autoFocus value={b.title} onChange={e => set({ title: e.target.value })} placeholder={b.kind === 'break' ? 'Break' : 'Deep work, study, workout…'} /></Field>
      <div className="form-row">
        <Field label="Date"><input className="input" type="date" value={b.date} onChange={e => e.target.value && set({ date: e.target.value })} /></Field>
        <Field label="Start"><TimeInput value={b.start_min} onChange={m => set({ start_min: m, end_min: m + (b.end_min - b.start_min) })} /></Field>
        <Field label="End"><TimeInput value={b.end_min} onChange={m => set({ end_min: m })} /></Field>
      </div>
      {!valid && <p className="muted" style={{ color: 'var(--bad)' }}>End time must be after the start.</p>}
      {b.kind === 'focus' && (
        <>
          <div className="form-row">
            <Field label="Category"><CategorySelect value={b.category} onChange={category => set({ category })} /></Field>
            <Field label="Goal"><GoalSelect value={b.goal_id} onChange={goal_id => set({ goal_id })} /></Field>
          </div>
          <Field label="Task" hint="(optional)">
            <select className="select" value={b.task_id || ''} onChange={e => { const task = ws.tasks.find(t => t.id === e.target.value); set({ task_id: e.target.value || null, ...(task && !b.title ? { title: task.title } : {}), ...(task?.goal_id ? { goal_id: task.goal_id } : {}) }) }}>
              <option value="">—</option>
              {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </Field>
        </>
      )}
      <label className="check"><input type="checkbox" checked={b.reminder} onChange={e => set({ reminder: e.target.checked })} /> Remind me when it starts</label>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Productive session (manual add / edit)

function SessionEditor({ req, close }: { req: Extract<EditorRequest, { kind: 'session' }>; close: () => void }) {
  const { ws, create, update, remove } = useStore()
  const toast = useToast()
  const existing = req.id ? ws.sessions.find(s => s.id === req.id) : undefined
  const initial = existing || req.defaults
  // New sessions default to "the last hour" today, or 09:00 on another day.
  const [date, setDate] = useState<DateKey>(() => initial?.date || todayKey())
  const [startMin, setStartMin] = useState(() => {
    if (initial?.started_at) { const d = new Date(initial.started_at); return d.getHours() * 60 + d.getMinutes() }
    return !initial?.date || initial.date === todayKey() ? roundTo(Math.max(0, nowMin() - 60), 5) : 9 * 60
  })
  const [minutes, setMinutes] = useState(Math.round((initial?.duration_seconds ?? 3600) / 60))
  const [category, setCategory] = useState(initial?.category || 'Work')
  const [goalId, setGoalId] = useState<string | null>(initial?.goal_id ?? null)
  const [partId, setPartId] = useState<string | null>(initial?.goal_part_id ?? null)
  const [chosenBlockId, setBlockId] = useState<string | null>(initial?.block_id ?? null)
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null)
  const [notes, setNotes] = useState(initial?.notes || '')
  const [label, setLabel] = useState(initial?.label || '')
  const goal = ws.goals.find(g => g.id === goalId)
  const blocks = ws.blocks.filter(b => b.date === date && b.kind === 'focus')
  const blockId = blocks.some(b => b.id === chosenBlockId) ? chosenBlockId : null // only blocks on the chosen date
  const save = () => {
    if (minutes <= 0) return
    const start = new Date(`${date}T00:00:00`)
    start.setMinutes(startMin)
    const row = {
      date, started_at: start.toISOString(), ended_at: new Date(start.getTime() + minutes * 60000).toISOString(), duration_seconds: minutes * 60,
      category, goal_id: goalId, goal_part_id: goal?.parts.some(p => p.id === partId) ? partId : null, task_id: existing?.task_id ?? null,
      block_id: blockId, rating, notes, label: label.trim(),
    }
    if (existing) update('sessions', existing.id, row)
    else { create('sessions', { ...row, source: 'manual', created_at: new Date().toISOString() } as NewRow<'sessions'>); toast(`Logged ${formatDuration(minutes * 60)} of ${category}`) }
    close()
  }
  return (
    <Modal open onClose={close} title={existing ? 'Edit session' : 'Log productive time'} subtitle="Sessions roll up into the day, week, month, goals and streaks." footer={<>
      {existing && <ConfirmButton onConfirm={() => { remove('sessions', existing.id); close() }} confirmLabel="Delete session"><Trash2 size={14} /> Delete</ConfirmButton>}
      <span className="spacer" />
      <Button onClick={close}>Cancel</Button>
      <Button variant="primary" onClick={save} disabled={minutes <= 0}>{existing ? 'Save' : 'Log session'}</Button>
    </>}>
      <div className="form-row">
        <Field label="Date"><input className="input" type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} /></Field>
        <Field label="Started"><TimeInput value={startMin} onChange={setStartMin} /></Field>
        <Field label="Minutes"><input className="input" type="number" min={1} value={minutes} onChange={e => setMinutes(Math.max(0, Number(e.target.value)))} /></Field>
      </div>
      <div className="form-row">
        <Field label="Category"><CategorySelect value={category} onChange={setCategory} /></Field>
        <Field label="Goal / project"><GoalSelect value={goalId} onChange={v => { setGoalId(v); setPartId(null) }} /></Field>
      </div>
      {goal && goal.parts.length > 0 && (
        <Field label="Part of goal">
          <select className="select" value={partId || ''} onChange={e => setPartId(e.target.value || null)}><option value="">—</option>{goal.parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </Field>
      )}
      {blocks.length > 0 && (
        <Field label="Planned block" hint="(for plan vs reality)">
          <select className="select" value={blockId || ''} onChange={e => setBlockId(e.target.value || null)}><option value="">Unplanned</option>{blocks.map(b => <option key={b.id} value={b.id}>{minToClock(b.start_min)}–{minToClock(b.end_min)} · {b.title}</option>)}</select>
        </Field>
      )}
      <Field label="Label" hint="(optional)"><input className="input" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Case study draft" /></Field>
      <Field label="Productivity rating"><Stars value={rating} onChange={v => setRating(v === rating ? null : v)} /></Field>
      <Field label="Notes"><textarea className="textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Note

function NoteEditor({ req, close }: { req: Extract<EditorRequest, { kind: 'note' }>; close: () => void }) {
  const { create } = useStore()
  const toast = useToast()
  const [text, setText] = useState('')
  const [date, setDate] = useState<DateKey | null>(req.defaults?.date === undefined ? todayKey() : req.defaults.date)
  const save = () => { if (!text.trim()) return; create('notes', { text: text.trim(), date, created_at: new Date().toISOString() }); toast('Note saved'); close() }
  return (
    <Modal open onClose={close} title="Quick note" footer={<><span className="spacer" /><Button onClick={close}>Cancel</Button><Button variant="primary" onClick={save} disabled={!text.trim()}>Save note</Button></>}>
      <textarea className="textarea" autoFocus rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="Capture a thought…" onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }} />
      <div className="row wrap">
        <Field label="Attach to day"><input className="input" type="date" value={date || ''} onChange={e => setDate(e.target.value || null)} /></Field>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Start timer — "What are you working on?"

function StartTimerDialog({ req, close }: { req: Extract<EditorRequest, { kind: 'timer' }>; close: () => void }) {
  const { ws, startTimer } = useStore()
  const planned = req.defaults?.block_id ? ws.blocks.find(b => b.id === req.defaults!.block_id) : blockAt(ws, todayKey(), nowMin())
  const [category, setCategory] = useState(req.defaults?.category || planned?.category || 'Work')
  const [goalId, setGoalId] = useState<string | null>(req.defaults?.goal_id ?? planned?.goal_id ?? null)
  const [partId, setPartId] = useState<string | null>(req.defaults?.goal_part_id ?? null)
  const [label, setLabel] = useState(req.defaults?.label || planned?.title || '')
  const [linkBlock, setLinkBlock] = useState(Boolean(planned))
  const goal = ws.goals.find(g => g.id === goalId)
  const go = () => {
    startTimer({ category, goal_id: goalId, goal_part_id: partId, task_id: req.defaults?.task_id ?? planned?.task_id ?? null, label: label.trim() || undefined, block_id: linkBlock && planned ? planned.id : null })
    close()
  }
  return (
    <Modal open onClose={close} title="What are you working on?" footer={<><span className="spacer" /><Button onClick={close}>Cancel</Button><Button variant="primary" icon={<Play size={14} />} onClick={go}>Start timer</Button></>}>
      <Field label="Category">
        <div className="row wrap">{ws.categories.map(c => <button type="button" key={c.id} className="chip chip-choice" aria-pressed={category === c.name} onClick={() => setCategory(c.name)}><span className="dot" style={{ background: c.color }} />{c.name}</button>)}</div>
      </Field>
      <div className="form-row">
        <Field label="Goal / project"><GoalSelect value={goalId} onChange={v => { setGoalId(v); setPartId(null); const g = ws.goals.find(x => x.id === v); if (g) setCategory(g.category) }} empty="No goal" /></Field>
        {goal && goal.parts.length > 0 && <Field label="Part"><select className="select" value={partId || ''} onChange={e => setPartId(e.target.value || null)}><option value="">—</option>{goal.parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
      </div>
      <Field label="Label" hint="(optional)"><input className="input" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Case study draft" onKeyDown={e => e.key === 'Enter' && go()} /></Field>
      {planned && (
        <label className="check"><input type="checkbox" checked={linkBlock} onChange={e => setLinkBlock(e.target.checked)} /> Count toward planned block “{planned.title}” ({minToClock(planned.start_min)}–{minToClock(planned.end_min)})</label>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Categories

function CategoryEditor({ close }: { close: () => void }) {
  const { ws, create, update, remove } = useStore()
  const [name, setName] = useState('')
  const used = new Set(ws.categories.map(c => c.color))
  const add = () => {
    const n = name.trim()
    if (!n || ws.categories.some(c => c.name.toLowerCase() === n.toLowerCase())) return
    create('categories', { name: n, color: CATEGORY_COLORS.find(c => !used.has(c)) || CATEGORY_COLORS[ws.categories.length % CATEGORY_COLORS.length], builtin: false })
    setName('')
  }
  return (
    <Modal open onClose={close} title="Categories" subtitle="Used for time tracking, planning and analytics." footer={<><span className="spacer" /><Button variant="primary" onClick={close}>Done</Button></>}>
      <div className="list">
        {ws.categories.map(c => (
          <div className="list-row" key={c.id}>
            <input type="color" value={c.color} onChange={e => update('categories', c.id, { color: e.target.value })} aria-label={`${c.name} colour`} style={{ width: 28, height: 28, border: 0, background: 'none', padding: 0 }} />
            <span className="title grow">{c.name}</span>
            {!c.builtin && <IconButton size="sm" label={`Delete ${c.name}`} onClick={() => remove('categories', c.id)}><Trash2 size={14} /></IconButton>}
          </div>
        ))}
      </div>
      <form className="row" onSubmit={e => { e.preventDefault(); add() }}>
        <input className="input grow" value={name} onChange={e => setName(e.target.value)} placeholder="New category (e.g. Writing)" />
        <Button type="submit" variant="soft" icon={<Plus size={14} />} disabled={!name.trim()}>Add</Button>
      </form>
    </Modal>
  )
}
