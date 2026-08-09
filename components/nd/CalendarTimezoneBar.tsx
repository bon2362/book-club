'use client'

const COMMON_TIMEZONES = ['Europe/Belgrade', 'Europe/Moscow', 'Europe/London', 'Asia/Tbilisi', 'Asia/Yerevan', 'America/New_York', 'America/Los_Angeles']

/**
 * Полоса управляемая: пояс живёт в состоянии страницы, потому что в нём же
 * рисуется сетка. Держать здесь собственную копию нельзя — расхождение между
 * полосой и сеткой уже было багом.
 */
export default function CalendarTimezoneBar({
  value,
  confirmed,
  canPersist,
  onChange,
}: {
  value: string
  confirmed: boolean
  /** Анонимному сохранять некуда: он меняет только то, как видит страницу сам. */
  canPersist: boolean
  onChange: (timeZone: string, confirmed: boolean) => void
}) {
  const explanation = canPersist
    ? confirmed ? '' : ' — определили по браузеру.'
    : ' — определили по браузеру. Выбор действует только в этой вкладке.'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px', border: '1px solid var(--hair)', background: 'var(--surface-soft)', borderRadius: 'var(--radius-control)', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
      {canPersist && confirmed && <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓</span>}
      <span>Время показано по <b style={{ fontFamily: 'var(--nd-mono)' }}>{value}</b>{explanation}</span>
      <select
        aria-label="Часовой пояс"
        value={value}
        onChange={(event) => onChange(event.target.value, canPersist ? false : confirmed)}
        style={{ font: 'inherit', fontFamily: 'var(--nd-mono)', fontSize: '0.75rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderBottom: '2px solid var(--border-strong)', padding: '3px 6px', color: 'var(--text)' }}
      >
        {Array.from(new Set([value, ...COMMON_TIMEZONES])).map((zone) => <option key={zone}>{zone}</option>)}
      </select>
      {canPersist && !confirmed && (
        <button
          type="button"
          onClick={() => onChange(value, true)}
          style={{ font: 'inherit', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '5px 10px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', borderRadius: 'var(--radius-control)' }}
        >
          Верно
        </button>
      )}
    </div>
  )
}
