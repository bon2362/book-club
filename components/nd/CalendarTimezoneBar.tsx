'use client'

import { useEffect, useState } from 'react'

const COMMON_TIMEZONES = ['Europe/Belgrade', 'Europe/Moscow', 'Europe/London', 'Asia/Tbilisi', 'Asia/Yerevan', 'America/New_York', 'America/Los_Angeles']

export default function CalendarTimezoneBar({
  timezone,
  confirmed,
}: {
  timezone: string | null
  confirmed: boolean
}) {
  const [value, setValue] = useState(timezone ?? 'UTC')
  const [isConfirmed, setConfirmed] = useState(confirmed)

  useEffect(() => {
    if (timezone) return
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!detected) return
    setValue(detected)
    void fetch('/api/profile/timezone', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: detected, confirmed: false }),
    })
  }, [timezone])

  async function save(nextConfirmed: boolean, nextValue = value) {
    setValue(nextValue)
    setConfirmed(nextConfirmed)
    await fetch('/api/profile/timezone', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: nextValue, confirmed: nextConfirmed }),
    })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px', border: '1px solid var(--hair)', background: 'var(--surface-soft)', borderRadius: 'var(--radius-control)', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
      {isConfirmed && <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓</span>}
      <span>Время показано по <b style={{ fontFamily: 'var(--nd-mono)' }}>{value}</b>{!isConfirmed ? ' — определили по браузеру.' : ''}</span>
      <select value={value} onChange={(event) => void save(false, event.target.value)} style={{ font: 'inherit', fontFamily: 'var(--nd-mono)', fontSize: '0.75rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderBottom: '2px solid var(--border-strong)', padding: '3px 6px', color: 'var(--text)' }}>
        {Array.from(new Set([value, ...COMMON_TIMEZONES])).map((zone) => <option key={zone}>{zone}</option>)}
      </select>
      {!isConfirmed && <button type="button" onClick={() => void save(true)} style={{ font: 'inherit', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '5px 10px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', borderRadius: 'var(--radius-control)' }}>Верно</button>}
    </div>
  )
}
