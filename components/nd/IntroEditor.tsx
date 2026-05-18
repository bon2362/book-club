'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface HeaderData {
  id: string
  title: string
  body: string
}

interface SectionData {
  id: string
  title: string
  body: string
  sortOrder: number
  isPublished: boolean
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#666',
  marginBottom: '0.25rem',
  display: 'block',
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.85rem',
  color: '#111',
  padding: '0.5rem 0.625rem',
  border: '1px solid #E5E5E5',
  background: '#fff',
  boxSizing: 'border-box',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  minHeight: '6rem',
  resize: 'none',
  overflow: 'hidden',
  lineHeight: 1.55,
}

const btn = (color: string, disabled = false): React.CSSProperties => ({
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: '0.35rem 0.75rem',
  border: `1px solid ${disabled ? '#E5E5E5' : color}`,
  background: 'transparent',
  color: disabled ? '#999' : color,
  cursor: disabled ? 'default' : 'pointer',
})

function AutoHeightTextarea({
  value,
  onChange,
  style,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }, [value])

  return (
    <textarea
      {...props}
      ref={ref}
      value={value}
      onChange={onChange}
      style={{ ...textareaStyle, ...style }}
    />
  )
}

function SortableSection({
  section,
  onChange,
  onDelete,
  saving,
}: {
  section: SectionData
  onChange: (patch: Partial<SectionData>) => void
  onDelete: () => void
  saving: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    border: '1px solid #E5E5E5',
    background: '#fff',
    padding: '0.875rem',
    marginBottom: '0.625rem',
  }
  return (
    <div ref={setNodeRef} style={style} data-testid={`intro-section-${section.id}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.625rem' }}>
        <button
          {...attributes}
          {...listeners}
          aria-label="Перетащить"
          title="Перетащить"
          style={{
            cursor: 'grab',
            background: 'none',
            border: 'none',
            color: '#aaa',
            fontSize: '1.1rem',
            padding: '0 0.25rem',
            touchAction: 'none',
          }}
        >
          ⋮⋮
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.7rem', color: '#555', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={section.isPublished}
            onChange={e => onChange({ isPublished: e.target.checked })}
          />
          Опубликовано
        </label>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={onDelete}
            disabled={saving}
            style={btn('#C0603A', saving)}
            data-testid={`intro-delete-${section.id}`}
          >
            Удалить
          </button>
        </div>
      </div>
      <label style={labelStyle}>Вопрос</label>
      <input
        type="text"
        value={section.title}
        onChange={e => onChange({ title: e.target.value })}
        style={{ ...inputStyle, marginBottom: '0.625rem' }}
        data-testid={`intro-question-${section.id}`}
      />
      <label style={labelStyle}>Ответ (абзацы разделять пустой строкой)</label>
      <AutoHeightTextarea
        value={section.body}
        onChange={e => onChange({ body: e.target.value })}
        data-testid={`intro-body-${section.id}`}
      />
    </div>
  )
}

export default function IntroEditor() {
  const [header, setHeader] = useState<HeaderData | null>(null)
  const [sections, setSections] = useState<SectionData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/intro', { cache: 'no-store' })
      if (!res.ok) throw new Error('load failed')
      const data = await res.json() as {
        header: HeaderData | null
        sections: SectionData[]
      }
      setHeader(data.header)
      setSections(data.sections)
      setDirtyIds(new Set())
    } catch {
      setMsg('Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  function markDirty(id: string) {
    setDirtyIds(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  function handleHeaderChange(patch: Partial<HeaderData>) {
    if (!header) return
    setHeader({ ...header, ...patch })
    markDirty(header.id)
  }

  function handleSectionChange(id: string, patch: Partial<SectionData>) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
    markDirty(id)
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = sections.findIndex(s => s.id === active.id)
    const newIdx = sections.findIndex(s => s.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = arrayMove(sections, oldIdx, newIdx).map((s, idx) => ({ ...s, sortOrder: idx }))
    setSections(reordered)
    setDirtyIds(prev => {
      const next = new Set(prev)
      reordered.forEach(s => next.add(s.id))
      return next
    })
  }

  async function handleSave() {
    if (!header) return
    setSaving(true)
    setMsg(null)
    try {
      const patches = [
        ...(dirtyIds.has(header.id) ? [{ id: header.id, title: header.title, body: header.body }] : []),
        ...sections
          .filter(s => dirtyIds.has(s.id))
          .map(s => ({
            id: s.id,
            title: s.title,
            body: s.body,
            sortOrder: s.sortOrder,
            isPublished: s.isPublished,
          })),
      ]
      if (patches.length === 0) {
        setMsg('Нет изменений')
        setSaving(false)
        return
      }
      const res = await fetch('/api/admin/intro', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patches }),
      })
      if (!res.ok) throw new Error('save failed')
      setDirtyIds(new Set())
      setMsg('Сохранено')
    } catch {
      setMsg('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/intro', { method: 'POST' })
      if (!res.ok) throw new Error('add failed')
      const data = await res.json() as { section: SectionData }
      setSections(prev => [...prev, data.section])
    } catch {
      setMsg('Ошибка добавления')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Удалить секцию?')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/intro/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
      setSections(prev => prev.filter(s => s.id !== id))
    } catch {
      setMsg('Ошибка удаления')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.85rem', color: '#666' }}>Загрузка…</div>

  return (
    <div data-testid="intro-editor" style={{ maxWidth: '780px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <button onClick={handleSave} disabled={saving || dirtyIds.size === 0} style={btn('#111', saving || dirtyIds.size === 0)} data-testid="intro-save">
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
        {msg && <span style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.7rem', color: '#666' }} data-testid="intro-msg">{msg}</span>}
      </div>

      {header && (
        <div style={{ border: '1px solid #E5E5E5', background: '#fff', padding: '0.875rem', marginBottom: '1.25rem' }}>
          <div style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', marginBottom: '0.625rem' }}>
            Шапка
          </div>
          <label style={labelStyle}>Eyebrow</label>
          <input
            type="text"
            value={header.title}
            onChange={e => handleHeaderChange({ title: e.target.value })}
            style={{ ...inputStyle, marginBottom: '0.625rem' }}
            data-testid="intro-header-title"
          />
          <label style={labelStyle}>Лид-абзац (абзацы разделять пустой строкой)</label>
          <AutoHeightTextarea
            value={header.body}
            onChange={e => handleHeaderChange({ body: e.target.value })}
            data-testid="intro-header-body"
          />
        </div>
      )}

      <div style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', marginBottom: '0.5rem' }}>
        Секции аккордеона
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
          {sections.map(section => (
            <SortableSection
              key={section.id}
              section={section}
              onChange={patch => handleSectionChange(section.id, patch)}
              onDelete={() => handleDelete(section.id)}
              saving={saving}
            />
          ))}
        </SortableContext>
      </DndContext>

      <button onClick={handleAdd} disabled={saving} style={btn('#111', saving)} data-testid="intro-add">
        + Добавить секцию
      </button>
    </div>
  )
}
