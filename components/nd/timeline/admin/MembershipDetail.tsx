'use client'

import { useState } from 'react'
import MarkdownField from './MarkdownField'
import { TIMELINE_EPOCH_PALETTE } from './palette'
import {
  SANS,
  SERIF,
  type AdminTimelineEpoch,
  type AdminTimelineEvent,
  buttonStyle,
  errorStyle,
  inputStyle,
  microLabelStyle,
  readError,
} from './shared'

/**
 * Правка связи элемента с лентой: заметка, а у эпохи ещё цвет, видимость и
 * закреплённая дорожка.
 *
 * Отказ по занятой дорожке (`409`) показывается **у поля дорожки**, а не общим
 * баннером сверху: сообщение называет мешающую эпоху, и читать его надо рядом
 * с тем полем, которое придётся поменять.
 */

export type Membership =
  | { kind: 'event'; item: AdminTimelineEvent }
  | { kind: 'epoch'; item: AdminTimelineEpoch }

interface Props {
  timelineId: string
  membership: Membership
  onSaved: () => void
  onCancel: () => void
}

function membershipUrl(timelineId: string, membership: Membership): string {
  return membership.kind === 'event'
    ? `/api/admin/timeline/timelines/${timelineId}/events/${membership.item.id}`
    : `/api/admin/timeline/timelines/${timelineId}/epochs/${membership.item.id}`
}

export default function MembershipDetail({ timelineId, membership, onSaved, onCancel }: Props) {
  const epoch = membership.kind === 'epoch' ? membership.item : null

  const [note, setNote] = useState(membership.item.note)
  const [color, setColor] = useState(epoch?.color ?? TIMELINE_EPOCH_PALETTE[0].value)
  const [visible, setVisible] = useState(epoch?.visible ?? true)
  const [lane, setLane] = useState(epoch?.pinnedLane == null ? '' : String(epoch.pinnedLane))
  const [error, setError] = useState<string | null>(null)
  const [laneError, setLaneError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function payload() {
    if (membership.kind === 'event') return { note }
    const trimmed = lane.trim()
    return { note, color, visible, pinnedLane: trimmed === '' ? null : Number(trimmed) }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setLaneError(null)

    const trimmed = lane.trim()
    if (membership.kind === 'epoch' && trimmed !== '' && !/^\d+$/.test(trimmed)) {
      setLaneError('Дорожка — целое число, не меньше нуля')
      return
    }

    setBusy(true)
    try {
      const res = await fetch(membershipUrl(timelineId, membership), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()),
      })
      const message = await readError(res)
      if (message) {
        // 409 приходит только от проверки дорожек — показываем у поля.
        if (res.status === 409) setLaneError(message)
        else setError(message)
        return
      }
      onSaved()
    } catch {
      setError('Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(membershipUrl(timelineId, membership), { method: 'DELETE' })
      const message = await readError(res)
      if (message) { setError(message); return }
      onSaved()
    } catch {
      setError('Не удалось исключить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} data-testid="membership-detail" style={{ fontFamily: SANS }}>
      <h3 style={{ fontFamily: SERIF, fontSize: '1.05rem', color: 'var(--text)', margin: '0 0 0.35rem' }}>
        {membership.item.title}
      </h3>
      <p style={{ ...microLabelStyle, marginBottom: '1rem' }}>
        {membership.kind === 'event' ? 'Событие на этой ленте' : 'Эпоха на этой ленте'}
      </p>

      <MarkdownField label="Заметка" value={note} onChange={setNote} testId="membership-note" />

      {membership.kind === 'epoch' && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <span style={microLabelStyle}>Цвет на ленте</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }} data-testid="membership-palette">
              {TIMELINE_EPOCH_PALETTE.map(option => (
                <button
                  key={option.value}
                  type="button"
                  title={option.label}
                  aria-label={option.label}
                  aria-pressed={color === option.value}
                  onClick={() => setColor(option.value)}
                  data-testid={`membership-color-${option.value.slice(1)}`}
                  style={{
                    width: '1.75rem',
                    height: '1.75rem',
                    background: option.value,
                    border: color === option.value ? '2px solid var(--text)' : '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
              <input
                type="checkbox"
                checked={visible}
                onChange={event => setVisible(event.target.checked)}
                data-testid="membership-visible"
              />
              Показывать эпоху на ленте
            </label>
          </div>

          <div style={{ marginBottom: '1rem', maxWidth: '12rem' }}>
            <label>
              <span style={microLabelStyle}>Закреплённая дорожка</span>
              <input
                value={lane}
                onChange={event => setLane(event.target.value)}
                placeholder="без закрепления"
                inputMode="numeric"
                data-testid="membership-lane"
                aria-label="Закреплённая дорожка эпохи"
                style={inputStyle}
              />
            </label>
            {laneError && (
              <p
                style={{ ...errorStyle, margin: '0.4rem 0 0' }}
                role="alert"
                data-testid="membership-lane-error"
              >
                {laneError}
              </p>
            )}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <button type="submit" disabled={busy} style={buttonStyle('primary')} data-testid="membership-save">
          Сохранить
        </button>
        <button type="button" onClick={onCancel} style={buttonStyle()} data-testid="membership-cancel">
          Назад
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          style={{ ...buttonStyle('danger'), marginLeft: 'auto' }}
          data-testid="membership-remove"
        >
          Исключить из ленты
        </button>
      </div>

      {error && <p style={errorStyle} role="alert" data-testid="membership-error">{error}</p>}
    </form>
  )
}
