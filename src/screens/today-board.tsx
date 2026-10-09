import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  closestCorners, DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, EyeOff, GripVertical, Plus, RotateCcw, type LucideIcon } from 'lucide-react'
import { useStore } from '../lib/store'
import { Button } from '../ui/kit'
import {
  columnsForWidth, findColumn, hiddenWidgets, resolveColumns, withColumns, withHidden, withShown,
  type ColumnCount, type Columns, type WidgetId,
} from './today-layout'

export type WidgetSpec = { title: string; icon: LucideIcon; node: ReactNode }

/**
 * The customisable part of Today: cards in balanced columns. In "customize"
 * mode cards can be dragged within and between columns (mouse, touch or
 * keyboard), hidden, and restored. Arrangements are saved per column count in
 * settings.dashboard, so they sync across devices.
 */
export function TodayBoard({ widgets, editing, onDone }: { widgets: Record<WidgetId, WidgetSpec>; editing: boolean; onDone: () => void }) {
  const { ws, updateSettings } = useStore()
  const saved = ws.settings.dashboard
  const ref = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState<ColumnCount>(3)
  const [activeId, setActiveId] = useState<WidgetId | null>(null)
  const [overCol, setOverCol] = useState<number | null>(null)

  // Column count follows the board's own width (sidebar, drawer and zoom all count).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setCount(columnsForWidth(el.clientWidth))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cols = resolveColumns(saved, count)
  const hidden = hiddenWidgets(saved)

  // Pointer (mouse + touch) dragging; keyboard moves are handled per card below
  // so arrows mean "up/down within the column" and "left/right between columns".
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const [announce, setAnnounce] = useState('')
  // After a keyboard move the card remounts in its new spot; keep focus on its handle.
  const refocus = useRef<WidgetId | null>(null)
  const layoutKey = JSON.stringify(cols)
  useEffect(() => {
    if (!refocus.current) return
    document.querySelector<HTMLButtonElement>(`[data-widget="${refocus.current}"] .tboard-handle`)?.focus()
    refocus.current = null
  }, [layoutKey])

  const moveByKey = (id: WidgetId, key: string) => {
    const c = findColumn(cols, id)
    const i = cols[c].indexOf(id)
    const next = cols.map(col => [...col])
    if (key === 'ArrowUp' && i > 0) next[c] = arrayMove(next[c], i, i - 1)
    else if (key === 'ArrowDown' && i < next[c].length - 1) next[c] = arrayMove(next[c], i, i + 1)
    else if ((key === 'ArrowLeft' && c > 0) || (key === 'ArrowRight' && c < count - 1)) {
      const to = key === 'ArrowLeft' ? c - 1 : c + 1
      next[c].splice(i, 1)
      next[to].splice(Math.min(i, next[to].length), 0, id)
    } else return false
    save(next)
    const col = findColumn(next, id)
    setAnnounce(`${widgets[id].title} moved to column ${col + 1}, position ${next[col].indexOf(id) + 1}`)
    refocus.current = id
    return true
  }

  const save = (next: Columns) => updateSettings({ dashboard: withColumns(saved, count, next) })

  const onDragStart = (e: DragStartEvent) => setActiveId(e.active.id as WidgetId)

  // Only highlight the target column while hovering; the move itself happens on
  // drop. (Moving between columns mid-drag makes the drop target oscillate.)
  const onDragOver = ({ over }: DragOverEvent) => {
    const col = over ? findColumn(cols, String(over.id)) : null
    setOverCol(prev => (prev === col ? prev : col))
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    setOverCol(null)
    if (!over || active.id === over.id) return
    const from = findColumn(cols, String(active.id))
    const to = findColumn(cols, String(over.id))
    if (from < 0 || to < 0) return
    const next = cols.map(c => [...c])
    const id = active.id as WidgetId
    if (from === to) {
      const a = next[from].indexOf(id)
      const b = next[from].indexOf(over.id as WidgetId)
      if (b < 0) return
      next[from] = arrayMove(next[from], a, b)
    } else {
      next[from] = next[from].filter(x => x !== id)
      let index = next[to].indexOf(over.id as WidgetId)
      if (index < 0) index = next[to].length // dropped on the column itself
      else {
        // Dropped on a card: before it if released over its top half, else after.
        const dragged = active.rect.current.translated
        if (dragged && dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2) index += 1
      }
      next[to].splice(index, 0, id)
    }
    save(next)
  }

  const active = activeId ? widgets[activeId] : null

  return (
    <section className={`tboard ${editing ? 'is-editing' : ''}`} aria-label="Today dashboard">
      {editing && (
        <div className="tboard-bar" role="region" aria-label="Customize Today">
          <div className="tboard-bar-text">
            <b>Customize your Today</b>
            <span>Drag cards by the handle to rearrange them. Hide what you don’t need.</span>
          </div>
          {hidden.length > 0 && (
            <div className="tboard-hidden" aria-label="Hidden cards">
              {hidden.map(id => {
                const W = widgets[id]
                return (
                  <button key={id} className="chip chip-choice" onClick={() => updateSettings({ dashboard: withShown(saved, id, count, cols) })}>
                    <Plus size={13} /><W.icon size={13} />{W.title}
                  </button>
                )
              })}
            </div>
          )}
          <div className="row">
            <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => updateSettings({ dashboard: null })} disabled={!saved}>Reset</Button>
            <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={onDone}>Done</Button>
          </div>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); setOverCol(null) }}>
        <div ref={ref} className="tboard-grid" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
          {cols.map((col, i) => (
            <Column key={i} index={i} ids={col} editing={editing} highlight={overCol === i && activeId !== null && !col.includes(activeId)}>
              {col.map(id => <SortableCard key={id} id={id} spec={widgets[id]} editing={editing} onMoveKey={key => moveByKey(id, key)} onHide={() => updateSettings({ dashboard: withHidden(saved, id) })} />)}
            </Column>
          ))}
        </div>
        <p className="sr-only" aria-live="polite">{announce}</p>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
          {active && (
            <div className="tboard-ghost">
              <GripVertical size={16} /><active.icon size={16} /><b>{active.title}</b>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </section>
  )
}

function Column({ index, ids, editing, highlight, children }: { index: number; ids: WidgetId[]; editing: boolean; highlight: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${index}`, disabled: !editing })
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className={`tboard-col ${isOver || highlight ? 'is-over' : ''}`}>
        {children}
        {editing && !ids.length && <div className="tboard-drop">Drop a card here</div>}
      </div>
    </SortableContext>
  )
}

function SortableCard({ id, spec, editing, onHide, onMoveKey }: { id: WidgetId; spec: WidgetSpec; editing: boolean; onHide: () => void; onMoveKey: (key: string) => boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing })
  return (
    <div
      ref={setNodeRef}
      className={`tboard-item ${isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-widget={id}
    >
      {editing && (
        <div className="tboard-tools">
          <button
            ref={setActivatorNodeRef}
            className="tboard-handle"
            {...attributes}
            {...listeners}
            aria-label={`Move ${spec.title}. Drag, or use arrow keys: up and down within the column, left and right between columns.`}
            aria-roledescription="movable card"
            onKeyDown={e => { if (e.key.startsWith('Arrow') && onMoveKey(e.key)) e.preventDefault() }}
          >
            <GripVertical size={15} /><spec.icon size={14} /><span>{spec.title}</span>
          </button>
          <button className="tboard-hide" aria-label={`Hide ${spec.title}`} title="Hide card" onClick={onHide}><EyeOff size={14} /></button>
        </div>
      )}
      <div className="tboard-body" inert={editing}>{spec.node}</div>
    </div>
  )
}
