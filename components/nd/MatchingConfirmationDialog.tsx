'use client'

import { useEffect, useId, useRef } from 'react'

export interface ConfirmationCircleSummary {
  bookTitle: string
  members: string[]
}

export interface MatchingConfirmationDialogProps {
  open: boolean
  /** Текущее подтверждение, если есть. null — первый выбор круга (без switch). */
  from: ConfirmationCircleSummary | null
  to: ConfirmationCircleSummary
  onConfirm: () => void
  onCancel: () => void
  pending?: boolean
}

function CircleBlock({ label, circle }: { label: string; circle: ConfirmationCircleSummary }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <span
        style={{
          fontFamily: 'var(--nd-sans)',
          fontSize: '0.58rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </span>
      <span style={{ fontFamily: 'var(--nd-serif), Georgia, serif', fontSize: '1.02rem', fontWeight: 700, color: 'var(--text)' }}>
        {circle.bookTitle}
      </span>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-body)' }}>{circle.members.join(', ')}</span>
    </div>
  )
}

/**
 * Атомарное подтверждение/переключение круга. Когда `from` задан — показывает
 * старый и новый круг (switch), иначе только новый (первый выбор). Сам по себе
 * не делает мутаций — это решает родитель (Task 8).
 */
export default function MatchingConfirmationDialog({
  open,
  from,
  to,
  onConfirm,
  onCancel,
  pending = false,
}: MatchingConfirmationDialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    return () => previousFocusRef.current?.focus()
  }, [open])

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!pending) onCancel()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      ref={dialogRef}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          maxWidth: 460,
          width: '100%',
          padding: '1.4rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.1rem',
        }}
      >
        <h2 id={titleId} style={{ margin: 0, fontFamily: 'var(--nd-serif), Georgia, serif', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)' }}>
          {from ? 'Сменить круг?' : 'Подтвердить круг?'}
        </h2>
        {from && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Подтверждение можно держать только в одном круге. Прежнее снимется.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {from && <CircleBlock label="Сейчас" circle={from} />}
          <CircleBlock label={from ? 'Новый круг' : 'Круг'} circle={to} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            disabled={pending}
            style={{
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text)',
              padding: '0.6rem 1.1rem',
              borderRadius: 'var(--radius)',
              fontFamily: 'var(--nd-sans)',
              fontSize: '0.68rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            style={{
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--bg)',
              padding: '0.6rem 1.3rem',
              borderRadius: 'var(--radius)',
              fontFamily: 'var(--nd-sans)',
              fontSize: '0.68rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {pending ? 'Подтверждаем…' : 'Подтвердить'}
          </button>
        </div>
      </div>
    </div>
  )
}
