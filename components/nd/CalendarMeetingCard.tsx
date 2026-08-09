import type { CalendarPublicState } from '@/lib/calendar/public-state'
import { formatInZone } from '@/lib/calendar/timezone'

export default function CalendarMeetingCard({
  meeting,
  bookTitle,
  canEdit,
  timeZone,
  onCancel,
}: {
  meeting: CalendarPublicState['meetings'][number]
  bookTitle: string
  canEdit: boolean
  timeZone: string
  onCancel: () => void
}) {
  const start = new Date(meeting.startsAt)
  const end = new Date(start.getTime() + meeting.durationMinutes * 60 * 1000)
  return (
    <section style={{ background: 'var(--bg-input)', border: '1px solid var(--hair)', borderTop: '2px solid var(--success)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card)', padding: '22px 24px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
      <div>
        <div style={{ textTransform: 'uppercase', letterSpacing: '0.13em', fontSize: '0.6rem', color: 'var(--text-muted)' }}>Ближайшая встреча</div>
        <div style={{ fontFamily: 'var(--nd-serif)', fontSize: '1.7rem', lineHeight: 1.2, margin: '8px 0 6px' }}>{formatDate(start, timeZone)}, {formatTime(start, timeZone)}–{formatTime(end, timeZone)}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{meeting.durationMinutes} минут · {bookTitle}{meeting.createdByName ? ` · назначил(а) ${meeting.createdByName}` : ''}</div>
      </div>
      {canEdit && <button type="button" onClick={onCancel} style={{ font: 'inherit', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '9px 14px', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', borderRadius: 'var(--radius-control)' }}>Отменить</button>}
    </section>
  )
}

function formatDate(date: Date, timeZone: string) {
  return formatInZone(date, timeZone, { weekday: 'long', day: 'numeric', month: 'long' })
}

function formatTime(date: Date, timeZone: string) {
  return formatInZone(date, timeZone, { hour: '2-digit', minute: '2-digit' })
}
