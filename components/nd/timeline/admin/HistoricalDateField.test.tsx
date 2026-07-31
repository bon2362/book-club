/**
 * @jest-environment jsdom
 */
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { HistoricalDate } from '@/lib/timeline'
import HistoricalDateField from './HistoricalDateField'

function Harness({ initial }: { initial: HistoricalDate }) {
  const [value, setValue] = useState<HistoricalDate>(initial)
  return (
    <>
      <HistoricalDateField label="Начало" value={value} onChange={setValue} testId="start" />
      <output data-testid="dump">{JSON.stringify(value)}</output>
    </>
  )
}

describe('HistoricalDateField', () => {
  it('день недоступен, пока не выбран месяц', () => {
    render(<Harness initial={{ year: 1917, era: 'CE' }} />)
    expect(screen.getByTestId('start-day')).toBeDisabled()
  })

  it('выбор месяца включает поле дня', () => {
    render(<Harness initial={{ year: 1917, era: 'CE' }} />)
    fireEvent.change(screen.getByTestId('start-month'), { target: { value: '11' } })
    expect(screen.getByTestId('start-day')).toBeEnabled()
    expect(screen.getByTestId('dump')).toHaveTextContent('"month":11')
  })

  it('снятие месяца очищает день', () => {
    render(<Harness initial={{ year: 1917, era: 'CE', month: 11, day: 7 }} />)
    expect(screen.getByTestId('start-day')).toHaveValue('7')

    fireEvent.change(screen.getByTestId('start-month'), { target: { value: '' } })

    expect(screen.getByTestId('start-day')).toBeDisabled()
    const dump = JSON.parse(screen.getByTestId('dump').textContent ?? '{}')
    expect(dump.month).toBeUndefined()
    expect(dump.day).toBeUndefined()
  })

  it('меняет эру', () => {
    render(<Harness initial={{ year: 100, era: 'CE' }} />)
    fireEvent.change(screen.getByTestId('start-era'), { target: { value: 'BCE' } })
    expect(screen.getByTestId('dump')).toHaveTextContent('"era":"BCE"')
  })

  it('меняет год', () => {
    render(<Harness initial={{ year: 1917, era: 'CE' }} />)
    fireEvent.change(screen.getByTestId('start-year'), { target: { value: '1918' } })
    expect(screen.getByTestId('dump')).toHaveTextContent('"year":1918')
  })
})
