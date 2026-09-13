'use client'

import { useState } from 'react'

interface Props {
  kind: 'reject' | 'hide'
  onSubmit: (reason: string) => Promise<void>
  onCancel: () => void
}

export default function CollectionReasonSheet({ kind, onSubmit, onCancel }: Props) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const title = kind === 'reject' ? 'Причина отказа' : 'Почему скрываем'

  async function send() {
    setBusy(true)
    try {
      await onSubmit(reason.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="dialog" aria-label={title} style={{ border: '1px solid var(--border-strong)', padding: 16, marginTop: 14 }}>
      <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }}>
        {title}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '8px 0 10px', lineHeight: 1.5 }}>
        Автор увидит этот текст в профиле рядом с подборкой. Пишите, что поправить, чтобы её опубликовали.
      </p>
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Например: добавьте два-три текста и абзац о том, зачем это читать"
        style={{
          width: '100%',
          minHeight: 80,
          fontFamily: 'var(--nd-sans)',
          fontSize: 13,
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderBottom: '2px solid var(--border-strong)',
          padding: 11,
          outline: 'none',
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" className="p-btn sm" disabled={!reason.trim() || busy} onClick={send}>
          {kind === 'reject' ? 'Отправить и отклонить' : 'Отправить и скрыть'}
        </button>
        <button type="button" className="p-btn ghost sm" onClick={onCancel}>Отмена</button>
      </div>
    </div>
  )
}
