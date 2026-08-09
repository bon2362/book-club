import type { CalendarPublicState } from '@/lib/calendar/public-state'

export default function CalendarParticipants({
  participants,
  viewerRef,
  focusRef,
  onFocus,
}: {
  participants: CalendarPublicState['participants']
  viewerRef: string | null
  focusRef: string | null
  onFocus: (ref: string | null) => void
}) {
  return (
    <aside>
      <h3 style={{ margin: '0 0 2px', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-muted)', fontWeight: 600, borderTop: '2px solid var(--success)', paddingTop: 8 }}>Круг</h3>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '6px 0 12px' }}>Нажмите на имя, чтобы увидеть только его время</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {participants.map((participant) => {
          const focused = focusRef === participant.ref
          return (
            <li key={participant.ref}>
              <button
                type="button"
                onClick={() => onFocus(focused ? null : participant.ref)}
                style={{
                  width: '100%',
                  display: 'flex',
                  gap: 9,
                  alignItems: 'center',
                  padding: '7px 6px',
                  border: 'none',
                  borderLeft: focused ? '2px solid var(--success)' : '2px solid transparent',
                  background: focused ? 'var(--surface-soft)' : 'transparent',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 999, background: participant.marked ? 'var(--text)' : 'var(--text-muted)', color: 'var(--bg-input)', display: 'grid', placeItems: 'center', fontSize: '0.72rem', flex: 'none' }}>
                  {participant.displayName.trim().charAt(0).toLocaleUpperCase('ru') || '•'}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: '0.84rem', lineHeight: 1.2 }}>{participant.displayName}{participant.ref === viewerRef ? ' · вы' : ''}</span><br />
                  {participant.marked
                    ? <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--nd-mono)', whiteSpace: 'nowrap' }}>{participant.timezone ?? 'пояс не указан'}</span>
                    : <span style={{ fontSize: '0.65rem', color: 'var(--accent)' }}>ещё не отмечался</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
