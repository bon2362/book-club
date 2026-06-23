'use client'

import { useEffect, useRef, useState } from 'react'
import MarkdownToolbar from './MarkdownToolbar'
import SummaryMarkdown from './SummaryMarkdown'

export interface EditableSummary {
  id: string
  bookId: string
  displayName: string
  title: string
  tldr: string
  bodyMarkdown: string
  status: 'draft' | 'pending' | 'published' | 'rejected'
  rejectionReason: string | null
}

interface Props {
  initialSummary: EditableSummary
  bookTitle: string
  bookAuthor: string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function SummaryEditor({ initialSummary, bookTitle, bookAuthor }: Props) {
  const [displayName, setDisplayName] = useState(initialSummary.displayName)
  const [title, setTitle] = useState(initialSummary.title)
  const [tldr, setTldr] = useState(initialSummary.tldr)
  const [bodyMarkdown, setBodyMarkdown] = useState(initialSummary.bodyMarkdown)
  const [preview, setPreview] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [dirty, setDirty] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const canEdit = initialSummary.status === 'draft' || initialSummary.status === 'rejected'

  const payload = { displayName, title, tldr, bodyMarkdown }

  async function saveDraft() {
    if (!canEdit) return
    setSaveState('saving')
    const res = await fetch(`/api/summaries/${initialSummary.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      setSaveState('error')
      return
    }
    setDirty(false)
    setSaveState('saved')
  }

  useEffect(() => {
    if (!dirty || !canEdit) return
    const timer = window.setTimeout(() => {
      saveDraft().catch(() => setSaveState('error'))
    }, 800)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, displayName, title, tldr, bodyMarkdown, canEdit])

  function update(setter: (value: string) => void, value: string) {
    setter(value)
    setDirty(true)
  }

  async function submit() {
    if (dirty) await saveDraft()
    const res = await fetch(`/api/summaries/${initialSummary.id}/submit`, { method: 'POST' })
    if (!res.ok) {
      setSaveState('error')
      return
    }
    window.location.href = '/'
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '0.85rem 1.5rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
        }}
      >
        <div>
          <a href="/" style={{ color: 'var(--text)', textDecoration: 'none', fontFamily: 'var(--nd-sans)' }}>← Книга</a>
          <span style={{ marginLeft: '0.75rem', fontFamily: 'var(--nd-sans)', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            {initialSummary.status === 'rejected' ? 'Отклонено' : 'Черновик'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span role="status" style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {saveState === 'saving' ? 'Сохранение...' : saveState === 'saved' ? 'Сохранено' : saveState === 'error' ? 'Ошибка сохранения' : ''}
          </span>
          <button type="button" onClick={() => setPreview(v => !v)} style={ghostButton}>Предпросмотр</button>
          <button type="button" onClick={submit} disabled={!canEdit} style={darkButton}>Отправить на проверку</button>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
        {initialSummary.status === 'rejected' && initialSummary.rejectionReason && (
          <section style={{ marginBottom: '1.25rem', padding: '1rem', borderLeft: '2px solid var(--accent)', background: 'var(--bg-tint)' }}>
            <div style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', marginBottom: '0.35rem' }}>Комментарий админа</div>
            <p style={{ margin: 0, fontFamily: 'var(--nd-sans)', fontSize: '0.9rem', color: 'var(--text-body)' }}>{initialSummary.rejectionReason}</p>
          </section>
        )}

        {preview ? (
          <article>
            <p style={{ fontFamily: 'var(--nd-sans)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{bookTitle} · {bookAuthor}</p>
            <h1 style={{ fontFamily: 'var(--nd-serif)', fontSize: '2rem', lineHeight: 1.15 }}>{title || 'Без названия'}</h1>
            <section style={{ margin: '1rem 0 1.5rem', padding: '1rem', borderLeft: '2px solid var(--accent)', background: 'var(--bg-tint)' }}>
              <div style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', marginBottom: '0.35rem' }}>В двух словах</div>
              <p style={{ margin: 0 }}>{tldr}</p>
            </section>
            <SummaryMarkdown markdown={bodyMarkdown} />
          </article>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <label style={labelStyle}>
              Имя для публикации
              <input aria-label="Имя для публикации" disabled={!canEdit} value={displayName} onChange={e => update(setDisplayName, e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Заголовок саммари
              <input aria-label="Заголовок саммари" disabled={!canEdit} value={title} onChange={e => update(setTitle, e.target.value)} style={{ ...inputStyle, fontFamily: 'var(--nd-serif)', fontSize: '1.5rem' }} />
            </label>
            <p style={{ margin: 0, fontFamily: 'var(--nd-serif)', fontStyle: 'italic', color: 'var(--text-muted)' }}>{bookTitle} · {bookAuthor}</p>
            <label style={labelStyle}>
              В двух словах
              <textarea aria-label="В двух словах" disabled={!canEdit} value={tldr} onChange={e => update(setTldr, e.target.value)} rows={3} style={{ ...textareaStyle, borderLeft: '2px solid var(--accent)' }} />
            </label>
            <MarkdownToolbar textareaRef={bodyRef} value={bodyMarkdown} onChange={value => update(setBodyMarkdown, value)} />
            <textarea ref={bodyRef} aria-label="Текст саммари" disabled={!canEdit} value={bodyMarkdown} onChange={e => update(setBodyMarkdown, e.target.value)} rows={14} style={textareaStyle} />
          </div>
        )}
      </div>
    </main>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: '0.4rem',
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.68rem',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--text-muted)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  padding: '0.75rem',
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '1rem',
  color: 'var(--text)',
  background: 'var(--bg)',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  padding: '0.85rem',
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.95rem',
  lineHeight: 1.6,
  color: 'var(--text)',
  background: 'var(--bg)',
  resize: 'vertical',
}

const ghostButton: React.CSSProperties = {
  border: '1px solid var(--border-strong)',
  background: 'transparent',
  color: 'var(--text)',
  padding: '0.55rem 0.8rem',
  fontFamily: 'var(--nd-sans)',
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  cursor: 'pointer',
}

const darkButton: React.CSSProperties = {
  ...ghostButton,
  background: 'var(--text)',
  color: 'var(--bg)',
}
