import { fireEvent, render, screen } from '@testing-library/react'
import CalendarParticipants from './CalendarParticipants'
import type { CalendarPublicState } from '@/lib/calendar/public-state'

function participant(
  ref: string,
  displayName: string,
  overrides: Partial<CalendarPublicState['participants'][number]> = {},
): CalendarPublicState['participants'][number] {
  return {
    ref,
    displayName,
    timezone: 'Europe/Belgrade',
    timezoneConfirmed: true,
    marked: true,
    intervals: [{ startsAt: '2026-08-11T12:00:00.000Z', endsAt: '2026-08-11T13:00:00.000Z' }],
    busy: [],
    ...overrides,
  }
}

const participants = [
  participant('viewer', 'Евгений Кошкин'),
  participant('polina', 'Полина', { timezone: 'Asia/Tbilisi' }),
  participant('anya', 'Аня', { marked: false, intervals: [], adminUserId: 'user-anya' }),
]

function renderList(props: Partial<React.ComponentProps<typeof CalendarParticipants>> = {}) {
  const onFocus = jest.fn()
  const onActAs = jest.fn()
  render(
    <CalendarParticipants
      participants={participants}
      viewerRef="viewer"
      focusRef={null}
      isDesktop
      isAdmin={false}
      onFocus={onFocus}
      onActAs={onActAs}
      referenceDate={new Date('2026-08-11T12:00:00.000Z')}
      {...props}
    />,
  )
  return { onFocus, onActAs }
}

describe('CalendarParticipants', () => {
  it('показывает весь состав круга, включая не заполнявших календарь', () => {
    renderList()

    expect(screen.getByText(/Евгений Кошкин/)).toBeInTheDocument()
    expect(screen.getByText(/Полина/)).toBeInTheDocument()
    expect(screen.getByText(/Аня/)).toBeInTheDocument()
  })

  it('помечает не отметившихся отдельной подписью', () => {
    renderList()

    expect(screen.getByText('ещё не отмечался')).toBeInTheDocument()
  })

  it('помечает смотрящего', () => {
    renderList()

    expect(screen.getByText(/Евгений Кошкин · вы/)).toBeInTheDocument()
  })

  it('показывает смещение пояса каждого участника', () => {
    renderList()

    // Белград летом +2, Тбилиси +4.
    expect(screen.getAllByText('UTC+2').length).toBeGreaterThan(0)
    expect(screen.getByText('UTC+4')).toBeInTheDocument()
  })

  it('включает и выключает фильтр по наведению на десктопе', () => {
    const { onFocus } = renderList()

    const row = screen.getByRole('button', { name: /Полина/ })
    fireEvent.mouseEnter(row)
    expect(onFocus).toHaveBeenCalledWith('polina')

    fireEvent.mouseLeave(row)
    expect(onFocus).toHaveBeenCalledWith(null)
  })

  it('на телефоне фильтр переключается тапом, а не наведением', () => {
    const { onFocus } = renderList({ isDesktop: false })

    fireEvent.click(screen.getByRole('button', { name: /Полина/ }))

    expect(onFocus).toHaveBeenCalledWith('polina')
    expect(screen.getByText('Нажмите на имя, чтобы увидеть только его время')).toBeInTheDocument()
  })

  it('повторный тап снимает фильтр', () => {
    const { onFocus } = renderList({ isDesktop: false, focusRef: 'polina' })

    fireEvent.click(screen.getByRole('button', { name: /Полина/ }))

    expect(onFocus).toHaveBeenCalledWith(null)
  })

  it('обычному участнику не предлагает править за другого', () => {
    const { onActAs } = renderList()

    fireEvent.click(screen.getByRole('button', { name: /Аня/ }))

    expect(onActAs).not.toHaveBeenCalled()
  })

  it('админу по клику открывает режим правки за участника', () => {
    const { onActAs } = renderList({ isAdmin: true })

    fireEvent.click(screen.getByRole('button', { name: /Аня/ }))

    expect(onActAs).toHaveBeenCalledWith('user-anya')
  })
})
