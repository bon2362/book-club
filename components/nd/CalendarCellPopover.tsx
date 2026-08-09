import type { CalendarPublicState } from '@/lib/calendar/public-state'
import type { OverlapCell } from '@/lib/calendar/overlap'

export default function CalendarCellPopover({
  slotKey,
  cell,
  participants,
  markedCount,
  canEdit,
  canSchedule,
  viewerFree,
  onClose,
  onSchedule,
  onToggleMine,
}: {
  slotKey: string
  cell: OverlapCell
  participants: CalendarPublicState['participants']
  markedCount: number
  canEdit: boolean
  canSchedule: boolean
  viewerFree: boolean
  onClose: () => void
  onSchedule: () => void
  onToggleMine: () => void
}) {
  const date = new Date(slotKey)
  const idleNames = participants.filter((participant) => cell.idleRefs.includes(participant.ref)).map((participant) => participant.displayName)
  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 40, width: 'min(320px, calc(100vw - 32px))', background: 'var(--bg-input)', border: '1px solid var(--hair)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)', padding: 14 }}>
      <button type="button" onClick={onClose} aria-label="Закрыть" style={{ position: 'absolute', right: 8, top: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
      <h4 style={{ margin: '0 0 2px', fontFamily: 'var(--nd-serif)', fontWeight: 400, fontSize: '1.02rem' }}>{formatDate(date)}</h4>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 10 }}>{formatTime(date)} · свободны <b style={{ color: canSchedule ? 'var(--success)' : 'var(--accent)' }}>{cell.freeRefs.length} из {Math.max(1, markedCount)}</b></div>
      <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {participants.map((participant) => {
          const free = cell.freeRefs.includes(participant.ref)
          const busy = cell.busyRefs.includes(participant.ref)
          return (
            <li key={participant.ref} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.78rem', alignItems: 'baseline' }}>
              <span style={{ color: free ? 'var(--text)' : 'var(--text-body)' }}>{participant.displayName}</span>
              <span style={{ fontSize: '0.7rem', color: free ? 'var(--success)' : busy ? 'var(--accent)' : 'var(--text-muted)', fontFamily: 'var(--nd-mono)', textAlign: 'right' }}>
                {free ? `свободно · ${localTime(date, participant.timezone)}` : busy ? 'занято' : 'нет отметки'}
              </span>
            </li>
          )
        })}
      </ul>
      {idleNames.length > 0 && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>не отмечались: {idleNames.join(', ')}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--hair)', paddingTop: 10 }}>
        {canEdit && canSchedule && <button type="button" onClick={onSchedule} style={primaryButtonStyle}>Назначить встречу на {formatTime(date)}</button>}
        {canEdit && <button type="button" onClick={onToggleMine} style={ghostButtonStyle}>{viewerFree ? 'Убрать своё время' : 'Отметить: я свободен'}</button>}
        {!canEdit && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Только участники круга могут отмечать время и назначать встречи.</div>}
      </div>
    </div>
  )
}

const primaryButtonStyle = {
  font: 'inherit',
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  padding: '9px 14px',
  border: '1px solid var(--success)',
  background: 'var(--success)',
  color: 'var(--bg-input)',
  cursor: 'pointer',
  borderRadius: 'var(--radius-control)',
} as const

const ghostButtonStyle = {
  ...primaryButtonStyle,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text)',
} as const

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date)
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(date)
}

function localTime(date: Date, timezone: string | null) {
  return new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit', timeZone: timezone ?? 'UTC' }).format(date)
}
