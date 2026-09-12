'use client'

import { useEffect, useRef, useState } from 'react'
import MarkdownToolbar from './MarkdownToolbar'
import SummaryMarkdown from './SummaryMarkdown'
import { DEFAULT_MATCHING_INSTRUCTIONS, type MatchingInstructions } from '@/lib/matching/instructions-content'
import { fieldInput, fieldLabel, ghostButton, primaryButton, quietText } from './admin-matching-shared'

export default function AdminMatchingInstructions() {
  const [instructions, setInstructions] = useState<MatchingInstructions>(DEFAULT_MATCHING_INSTRUCTIONS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch('/api/admin/matching/instructions')
      .then(async (response) => {
        if (!response.ok) throw new Error('Не удалось загрузить инструкцию')
        setInstructions(await response.json() as MatchingInstructions)
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Не удалось загрузить инструкцию'))
      .finally(() => setLoading(false))
  }, [])

  function change(field: keyof MatchingInstructions, value: string) {
    setInstructions(current => ({ ...current, [field]: value }))
    setMessage(null)
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/matching/instructions', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(instructions),
      })
      const data = await response.json() as MatchingInstructions & { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Не удалось сохранить инструкцию')
      setInstructions(data)
      setMessage('Сохранено')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сохранить инструкцию')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section data-testid="admin-matching-instructions" style={{ margin: '18px 0 24px', padding: '16px 0', borderTop: '1px solid var(--hair)', borderBottom: '1px solid var(--hair)' }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--nd-serif)', fontSize: '1.12rem' }}>Инструкция для участни:ц</h2>
      <p style={quietText}>Общий текст для всех сессий Matching. Поддерживается Markdown: списки, выделение и ссылки.</p>
      {loading ? <p style={quietText}>Загрузка…</p> : <>
        <label style={fieldLabel}>Заголовок<input style={fieldInput} value={instructions.title} onChange={(event) => change('title', event.target.value)} /></label>
        <label style={fieldLabel}>Подзаголовок<input style={fieldInput} value={instructions.lead} onChange={(event) => change('lead', event.target.value)} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <label style={fieldLabel}>Ссылка в закрытом виде<input style={fieldInput} value={instructions.expandLabel} onChange={(event) => change('expandLabel', event.target.value)} /></label>
          <label style={fieldLabel}>Ссылка в открытом виде<input style={fieldInput} value={instructions.collapseLabel} onChange={(event) => change('collapseLabel', event.target.value)} /></label>
        </div>
        <div style={{ marginTop: 14 }}>
          <span style={fieldLabel}>Инструкция</span>
          <MarkdownToolbar textareaRef={textareaRef} value={instructions.bodyMarkdown} onChange={(value) => change('bodyMarkdown', value)} />
          {preview ? <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)' }}><SummaryMarkdown markdown={instructions.bodyMarkdown} /></div> : <textarea ref={textareaRef} aria-label="Инструкция в Markdown" value={instructions.bodyMarkdown} onChange={(event) => change('bodyMarkdown', event.target.value)} style={{ ...fieldInput, minHeight: 180, marginTop: 10, resize: 'vertical' }} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <button type="button" style={primaryButton} onClick={save} disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>
          <button type="button" style={ghostButton} onClick={() => setPreview(value => !value)}>{preview ? 'К редактированию' : 'Предпросмотр'}</button>
          {message && <span role="status" style={quietText}>{message}</span>}
        </div>
      </>}
    </section>
  )
}
