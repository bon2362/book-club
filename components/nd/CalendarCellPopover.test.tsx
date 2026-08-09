import { fireEvent, render, screen } from '@testing-library/react'
import CalendarCellPopover from './CalendarCellPopover'
import type { CalendarPublicState } from '@/lib/calendar/public-state'
import type { OverlapCell } from '@/lib/calendar/overlap'

const SLOT = '2026-08-11T12:00:00.000Z'

function participant(ref: string, displayName: string, timezone: string | null = 'Europe/Belgrade'): CalendarPublicState['participants'][number] {
  return { ref, displayName, timezone, timezoneConfirmed: true, marked: true, intervals: [], busy: [] }
}

const participants = [
  participant('a', 'Галия'),
  participant('b', 'Полина', 'Asia/Tbilisi'),
  participant('c', 'Аня'),
]

function cell(overrides: Partial<OverlapCell> = {}): OverlapCell {
  return {
    slotStart: new Date(SLOT),
    freeRefs: ['a', 'b'],
    busyRefs: [],
    idleRefs: ['c'],
    ...overrides,
  }
}

function renderPopover(props: Partial<React.ComponentProps<typeof CalendarCellPopover>> = {}) {
  const handlers = { onClose: jest.fn(), onSchedule: jest.fn(), onToggleMine: jest.fn() }
  render(
    <CalendarCellPopover
      slotKey={SLOT}
      cell={cell()}
      participants={participants}
      markedCount={2}
      canEdit
      timeZone="Europe/Belgrade"
      canSchedule
      viewerFree={false}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('CalendarCellPopover', () => {
  it('показывает дату и время в поясе смотрящего', () => {
    renderPopover()

    // 12:00Z в Белграде — 14:00.
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(/11 августа/)
    expect(screen.getAllByText(/14:00/).length).toBeGreaterThan(0)
    // В UTC это было бы 12:00 — именно так сетка и рисовалась до починки поясов.
    expect(screen.queryByText(/12:00/)).not.toBeInTheDocument()
  })

  it('считает знаменатель от отметившихся, а не от размера круга', () => {
    renderPopover()

    expect(screen.getByText(/2 из 2/)).toBeInTheDocument()
  })

  it('перечисляет всех участников круга, включая не отметившихся', () => {
    renderPopover()

    expect(screen.getByText('Галия')).toBeInTheDocument()
    expect(screen.getByText('Полина')).toBeInTheDocument()
    expect(screen.getByText('Аня')).toBeInTheDocument()
  })

  it('показывает местное время участника из другого пояса', () => {
    renderPopover()

    // 12:00Z в Тбилиси — 16:00, и это надо пометить, иначе спорит с 14:00 в шапке.
    expect(screen.getByText('свободно · 16:00 у себя')).toBeInTheDocument()
    // У участника из того же пояса лишнего времени быть не должно.
    expect(screen.getByText('свободно')).toBeInTheDocument()
  })

  it('называет занятость отдельно от отсутствия отметки', () => {
    renderPopover({ cell: cell({ freeRefs: ['a'], busyRefs: ['b'], idleRefs: ['c'] }) })

    expect(screen.getByText('занято')).toBeInTheDocument()
    expect(screen.getByText('нет отметки')).toBeInTheDocument()
  })

  it('показывает кнопку назначения только на клетке-кандидате', () => {
    renderPopover({ canSchedule: false })

    expect(screen.queryByRole('button', { name: /Назначить встречу/ })).not.toBeInTheDocument()
  })

  it('в режиме просмотра не предлагает ни одного действия', () => {
    renderPopover({ canEdit: false })

    expect(screen.queryByRole('button', { name: /Назначить встречу/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /своё время/ })).not.toBeInTheDocument()
  })

  it('назначает встречу по кнопке', () => {
    const handlers = renderPopover()

    fireEvent.click(screen.getByRole('button', { name: /Назначить встречу/ }))

    expect(handlers.onSchedule).toHaveBeenCalled()
  })

  it('закрывается по кнопке', () => {
    const handlers = renderPopover()

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))

    expect(handlers.onClose).toHaveBeenCalled()
  })
})
