'use client'

import { useEffect, useRef, useState } from 'react'
import {
  disclosureBlock,
  fieldInput,
  fieldLabel,
  focusRing,
  formColumn,
  ghostButton,
  linkAction,
  microLabel,
  primaryButton,
  warnLine,
  type MatchingSession,
} from './admin-matching-shared'

function statusLabel(status: string): string {
  if (status === 'open') return 'открыта'
  if (status === 'closed') return 'закрыта'
  return status
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU')
}

function formatDeadline(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

interface SessionBarProps {
  sessions: MatchingSession[]
  session: MatchingSession
  activeParticipants: number | null
  lifecycleBusy: boolean
  lifecycleError: string | null
  onSelect: (sessionId: string) => void
  onNewSession: () => void
  onLifecycle: (action: 'closeSession' | 'reopenSession') => void
}

export default function AdminMatchingSessionBar({
  sessions,
  session,
  activeParticipants,
  lifecycleBusy,
  lifecycleError,
  onSelect,
  onNewSession,
  onLifecycle,
}: SessionBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const isOpen = session.status === 'open'

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const meta = [
    `Создана ${formatDate(session.createdAt)}`,
    session.deadlineAt ? `дедлайн ${formatDeadline(session.deadlineAt)}` : 'без дедлайна',
    ...(activeParticipants === null ? [] : [`активных: ${activeParticipants}`]),
  ].join(' · ')

  return (
    <div data-testid="admin-matching-session-bar">
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 20,
        flexWrap: 'wrap',
        borderTop: '2px solid var(--border-strong)',
        paddingTop: 12,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
            <h3 style={{
              fontFamily: 'var(--nd-serif)',
              fontWeight: 400,
              fontSize: '1.35rem',
              letterSpacing: '-0.01em',
              color: 'var(--text)',
              margin: 0,
            }}>
              {session.name}
            </h3>
            <span
              data-testid="admin-matching-session-status"
              style={{ ...microLabel, color: isOpen ? 'var(--success)' : 'var(--text-muted)' }}
            >
              {statusLabel(session.status)}
            </span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{meta}</div>
          {!isOpen && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Участники не могут менять выбор; административная корректировка остаётся доступной.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <a href="/matching" className={focusRing} style={linkAction}>
            Страница матчинга →
          </a>
          {isOpen ? (
            <button
              type="button"
              onClick={() => onLifecycle('closeSession')}
              disabled={lifecycleBusy}
              className={focusRing}
              style={{ ...linkAction, color: 'var(--accent)' }}
              data-testid="admin-close-session"
            >
              {lifecycleBusy ? 'Закрываю…' : 'Закрыть сессию'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onLifecycle('reopenSession')}
              disabled={lifecycleBusy}
              className={focusRing}
              style={linkAction}
              data-testid="admin-reopen-session"
            >
              {lifecycleBusy ? 'Открываю…' : 'Открыть снова'}
            </button>
          )}
          <div ref={pickerRef} style={{ position: 'relative' }}>
            <button
              ref={triggerRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
              className={focusRing}
              style={linkAction}
              data-testid="admin-matching-session-menu"
            >
              Сессии ({sessions.length}) ▾
            </button>
            {menuOpen && (
              <div
                role="menu"
                aria-label="Сессии матчинга"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 10,
                  minWidth: 250,
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius)',
                  padding: '4px 0',
                }}
              >
                {sessions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    aria-current={item.id === session.id ? 'true' : undefined}
                    onClick={() => { onSelect(item.id); setMenuOpen(false) }}
                    className="hover:bg-bg-elevated focus-visible:bg-bg-elevated focus-visible:outline-none"
                    style={menuRow(item.id === session.id)}
                    data-testid="matching-session-option"
                  >
                    <span>{item.name}</span>
                    <span style={microLabel}>{statusLabel(item.status)}</span>
                  </button>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { onNewSession(); setMenuOpen(false) }}
                  className="hover:bg-bg-elevated focus-visible:bg-bg-elevated focus-visible:outline-none"
                  style={menuRow(false)}
                  data-testid="admin-matching-new-session"
                >
                  + Новая сессия
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {lifecycleError && <p style={{ ...warnLine, marginTop: 6 }}>{lifecycleError}</p>}
    </div>
  )
}

function menuRow(current: boolean): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '1rem',
    width: '100%',
    textAlign: 'left',
    padding: '6px 12px',
    fontFamily: 'var(--nd-sans)',
    fontSize: '0.78rem',
    fontWeight: current ? 600 : 400,
    color: 'var(--text)',
    border: 0,
    cursor: 'pointer',
  }
}

interface NewSessionFormProps {
  blocked: boolean
  onCreate: (input: { name: string; deadlineAt: string | null }) => Promise<void>
  onClose: () => void
}

export function AdminMatchingNewSessionForm({ blocked, onCreate, onClose }: NewSessionFormProps) {
  const [name, setName] = useState('')
  const [deadlineAt, setDeadlineAt] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const disabled = creating || blocked

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setCreating(true)
    setError(null)
    try {
      await onCreate({ name: name.trim(), deadlineAt: deadlineAt || null })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ ...disclosureBlock, marginTop: 20 }} data-testid="admin-matching-new-session-form">
      <div style={microLabel}>Новая сессия</div>
      <form onSubmit={handleSubmit} style={formColumn}>
        {blocked && <p style={warnLine}>Уже есть открытая сессия. Сначала закройте её, затем создайте новую.</p>}
        <div>
          <label htmlFor="matching-session-name" style={fieldLabel}>Название</label>
          <input
            id="matching-session-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например: Июньская встреча"
            required
            disabled={disabled}
            className={focusRing}
            style={fieldInput}
            data-testid="matching-session-name"
          />
        </div>
        <div>
          <label htmlFor="matching-session-deadline" style={fieldLabel}>Дедлайн — опционально</label>
          <input
            id="matching-session-deadline"
            type="datetime-local"
            value={deadlineAt}
            onChange={(event) => setDeadlineAt(event.target.value)}
            disabled={disabled}
            className={focusRing}
            style={fieldInput}
            data-testid="matching-session-deadline"
          />
        </div>
        {error && <p style={warnLine}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            disabled={disabled || !name.trim()}
            className={`disabled:opacity-50 ${focusRing}`}
            style={primaryButton}
            data-testid="matching-session-submit"
          >
            {creating ? 'Создаю…' : 'Создать сессию'}
          </button>
          <button type="button" onClick={onClose} className={focusRing} style={ghostButton}>
            Отмена
          </button>
        </div>
      </form>
    </div>
  )
}
