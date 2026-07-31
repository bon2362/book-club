'use client'

import type { HistoricalDate } from '@/lib/timeline'
import { SANS, makeDate, microLabelStyle, selectStyle, inputStyle } from './shared'

/**
 * Поле исторической даты: год, эра, необязательные месяц и день.
 *
 * День недоступен, пока не выбран месяц — это ограничение базы
 * (`historical_events_start_day_check`). Запрещать его в интерфейсе честнее,
 * чем показывать ошибку после отправки. Снятие месяца очищает и день.
 */

interface Props {
  label: string
  value: HistoricalDate
  onChange: (value: HistoricalDate) => void
  testId: string
}

const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1)

export default function HistoricalDateField({ label, value, onChange, testId }: Props) {
  const monthSelected = value.month != null

  function setYear(raw: string) {
    const year = Number.parseInt(raw, 10)
    onChange(makeDate(Number.isNaN(year) ? 0 : year, value.era, value.month ?? null, value.day ?? null))
  }

  function setEra(raw: string) {
    onChange(makeDate(value.year, raw === 'BCE' ? 'BCE' : 'CE', value.month ?? null, value.day ?? null))
  }

  function setMonth(raw: string) {
    if (raw === '') {
      // Без месяца день недопустим — снимаем оба разом.
      onChange(makeDate(value.year, value.era, null, null))
      return
    }
    onChange(makeDate(value.year, value.era, Number.parseInt(raw, 10), value.day ?? null))
  }

  function setDay(raw: string) {
    onChange(makeDate(value.year, value.era, value.month ?? null, raw === '' ? null : Number.parseInt(raw, 10)))
  }

  return (
    <fieldset
      data-testid={testId}
      style={{ border: '1px solid var(--border)', padding: '0.75rem', margin: 0 }}
    >
      <legend style={{ ...microLabelStyle, marginBottom: 0, padding: '0 0.4rem' }}>{label}</legend>
      <div style={{ display: 'grid', gridTemplateColumns: '5rem 7rem 1fr 5rem', gap: '0.5rem' }}>
        <label style={{ fontFamily: SANS }}>
          <span style={microLabelStyle}>Год</span>
          <input
            type="number"
            min={1}
            value={value.year === 0 ? '' : value.year}
            onChange={event => setYear(event.target.value)}
            data-testid={`${testId}-year`}
            aria-label={`${label}: год`}
            style={inputStyle}
          />
        </label>

        <label style={{ fontFamily: SANS }}>
          <span style={microLabelStyle}>Эра</span>
          <select
            value={value.era}
            onChange={event => setEra(event.target.value)}
            data-testid={`${testId}-era`}
            aria-label={`${label}: эра`}
            style={selectStyle}
          >
            <option value="CE">н. э.</option>
            <option value="BCE">до н. э.</option>
          </select>
        </label>

        <label style={{ fontFamily: SANS }}>
          <span style={microLabelStyle}>Месяц</span>
          <select
            value={value.month ?? ''}
            onChange={event => setMonth(event.target.value)}
            data-testid={`${testId}-month`}
            aria-label={`${label}: месяц`}
            style={selectStyle}
          >
            <option value="">не указан</option>
            {MONTHS.map((name, index) => (
              <option key={name} value={index + 1}>{name}</option>
            ))}
          </select>
        </label>

        <label style={{ fontFamily: SANS }}>
          <span style={microLabelStyle}>День</span>
          <select
            value={value.day ?? ''}
            onChange={event => setDay(event.target.value)}
            disabled={!monthSelected}
            data-testid={`${testId}-day`}
            aria-label={`${label}: день`}
            style={{ ...selectStyle, opacity: monthSelected ? 1 : 0.5, cursor: monthSelected ? 'pointer' : 'not-allowed' }}
          >
            <option value="">не указан</option>
            {DAYS.map(day => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        </label>
      </div>
      {!monthSelected && (
        <p style={{ fontFamily: SANS, fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0.5rem 0 0' }}>
          День можно указать только вместе с месяцем.
        </p>
      )}
    </fieldset>
  )
}
