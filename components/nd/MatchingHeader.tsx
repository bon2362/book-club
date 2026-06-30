'use client'

import { useState } from 'react'

export interface MatchingHeaderParticipant { ref: string; displayName: string; online: boolean }
export interface MatchingHeaderProps {
  sessionId: string; sessionName: string; sessionStatus: string
  minGroupSize: number; maxGroupSize: number; deadlineAt: string | null
  viewer: { displayName: string; role: 'active' | 'observer' }
  participants: MatchingHeaderParticipant[]; isAdmin: boolean; isImpersonating: boolean
  navigate?: (url: string) => void
  onSessionRefresh?: () => void | Promise<void>
}

function deadlineText(deadlineAt: string | null) {
  if (!deadlineAt) return 'Дедлайн не задан'
  const delta = new Date(deadlineAt).getTime() - Date.now()
  if (delta <= 0) return 'Дедлайн истёк'
  const days = Math.ceil(delta / 86_400_000)
  return `Дедлайн через ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`
}

export default function MatchingHeader(props: MatchingHeaderProps) {
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [editingSize, setEditingSize] = useState(false)
  const [minSize, setMinSize] = useState(String(props.minGroupSize))
  const [maxSize, setMaxSize] = useState(String(props.maxGroupSize))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = props.navigate ?? ((url: string) => window.location.assign(url))

  async function leave() {
    if (!window.confirm('Покинуть сессию?')) return
    setPending(true); setError(null)
    try {
      const response = await fetch(`/api/matching/sessions/${props.sessionId}/leave`, { method: 'DELETE' })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Не удалось покинуть сессию')
      }
      navigate('/matching')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось покинуть сессию')
    } finally { setPending(false) }
  }

  function cancelSize() {
    setMinSize(String(props.minGroupSize)); setMaxSize(String(props.maxGroupSize)); setError(null); setEditingSize(false)
  }

  async function saveSize() {
    const minGroupSize = Number(minSize); const maxGroupSize = Number(maxSize)
    if (!Number.isInteger(minGroupSize) || !Number.isInteger(maxGroupSize) || minGroupSize < 2 || maxGroupSize < minGroupSize) {
      setError('Размеры должны быть целыми: минимум 2, максимум не меньше минимума')
      return
    }
    setPending(true); setError(null)
    try {
      const response = await fetch(`/api/matching/sessions/${props.sessionId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ minGroupSize, maxGroupSize }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Не удалось изменить размер групп')
      }
      setEditingSize(false)
      await props.onSessionRefresh?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить размер групп')
    } finally { setPending(false) }
  }

  const groups = props.minGroupSize === props.maxGroupSize ? `Группы по ${props.minGroupSize}` : `Группы ${props.minGroupSize}–${props.maxGroupSize}`
  return <>
    {props.isImpersonating && <div data-testid="admin-impersonation-banner" style={{ padding: '0.45rem 1.3rem', borderBottom: '1px solid var(--hair)', color: 'var(--status-warn)' }}>👁 Просмотр за {props.viewer.displayName}<a href="/matching" style={{ float: 'right', color: 'inherit' }}>← выйти из админ-режима</a></div>}
    <header data-testid="matching-header" style={{ padding: '0.7rem 1.3rem', borderBottom: '1px solid var(--hair)', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <a href="/" className="nd-back-to-catalog">← Каталог</a><span style={{ width: 1, height: 22, background: 'var(--hair)' }} />
          <h1 style={{ margin: 0, fontFamily: 'var(--nd-serif)', fontSize: '1.45rem' }}>{props.sessionName}</h1>
          {editingSize ? <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.7rem' }}>Мин. <input className="nd-inline-number" aria-label="Минимум участников" type="number" value={minSize} onChange={(e) => setMinSize(e.target.value)} style={{ width: 46, border: '1px solid var(--border)', background: 'var(--bg-input)' }} /></label>
            <label style={{ fontSize: '0.7rem' }}>Макс. <input className="nd-inline-number" aria-label="Максимум участников" type="number" value={maxSize} onChange={(e) => setMaxSize(e.target.value)} style={{ width: 46, border: '1px solid var(--border)', background: 'var(--bg-input)' }} /></label>
            <button type="button" onClick={saveSize} disabled={pending} style={{ border: '1px solid var(--text)', background: 'var(--text)', color: 'var(--bg-input)' }}>Сохранить</button>
            <button type="button" onClick={cancelSize} disabled={pending} style={{ border: 0, background: 'transparent', color: 'var(--text-muted)' }}>Отмена</button>
          </div> : <span>{groups} {props.isAdmin && props.sessionStatus === 'active' && <button type="button" aria-label="Изменить размер групп" onClick={() => setEditingSize(true)} style={{ border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>✎</button>}</span>}
          <span>{deadlineText(props.deadlineAt)}</span><span style={{ color: props.sessionStatus === 'active' ? 'var(--success)' : 'var(--text-muted)' }}>● {props.sessionStatus === 'active' ? 'активна' : 'заморожена'}</span>
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {props.viewer.role === 'observer' ? <span style={{ color: 'var(--success)', borderBottom: '1px solid var(--success)' }}>Вы наблюдаете</span> : <span>Вы — <strong>{props.viewer.displayName}</strong></span>}
          <button type="button" aria-label={`Участники: ${props.participants.length}`} onClick={() => setParticipantsOpen(!participantsOpen)} style={{ display: 'flex', alignItems: 'center', border: 0, background: 'transparent' }}>{props.participants.slice(0, 5).map((participant, index) => <span key={participant.ref} aria-label={`${participant.displayName} — ${participant.online ? 'онлайн' : 'не в сети'}`} style={{ marginLeft: index ? -7 : 0, width: 28, height: 28, borderRadius: '50%', border: '2px solid var(--bg)', background: 'var(--chip-bg)', display: 'grid', placeItems: 'center', color: participant.online ? 'var(--success)' : 'var(--text-secondary)' }}>{participant.displayName[0]}</span>)}<span style={{ marginLeft: 6 }}>{props.participants.length}</span></button>
          {participantsOpen && <div role="dialog" aria-label="Участники" style={{ position: 'absolute', zIndex: 5, right: 0, top: 'calc(100% + 0.5rem)', minWidth: 220, padding: '0.75rem', background: 'var(--bg-input)', border: '1px solid var(--border-strong)' }}>{props.participants.map((participant) => <div key={participant.ref}><span style={{ color: participant.online ? 'var(--success)' : 'var(--text-muted)' }}>● </span>{participant.displayName}</div>)}</div>}
          {!props.isImpersonating && props.viewer.role === 'active' && <button type="button" onClick={leave} disabled={pending} style={{ border: 0, background: 'transparent', color: 'var(--text-muted)' }}>{pending ? 'Подождите…' : 'Покинуть'}</button>}
        </div>
      </div>{error && <p role="alert" style={{ margin: '0.45rem 0 0', color: 'var(--accent)' }}>{error}</p>}
    </header>
  </>
}
