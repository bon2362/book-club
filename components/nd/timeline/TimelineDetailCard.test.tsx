/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import TimelineDetailCard from './TimelineDetailCard'
import type { TimelineEventView } from '@/lib/timeline/view-model'

jest.mock('next/image', () => ({ __esModule: true, default: () => <span data-testid="mock-image" /> }))
jest.mock('../SummaryMarkdown', () => ({ __esModule: true, default: ({ markdown }: { markdown: string }) => <div>{markdown}</div> }))

const event: TimelineEventView = {
  id: 'event-1',
  title: 'Старое название',
  typeId: 'type-1',
  typeTitle: 'Событие',
  color: '#5D7290',
  icon: '',
  start: { year: 1900, era: 'CE' },
  ongoing: false,
  description: 'Описание',
  imageUrl: null,
  imageCaption: null,
  note: 'Местная заметка',
  visible: true,
}

const ok = () => Promise.resolve({ ok: true, json: async () => ({ success: true, data: {} }) }) as Promise<Response>

beforeEach(() => {
  global.fetch = jest.fn(ok)
})

it('не показывает правку гостю', () => {
  render(<TimelineDetailCard selected={{ kind: 'event', item: event }} onClose={jest.fn()} />)

  expect(screen.queryByRole('button', { name: 'Править' })).not.toBeInTheDocument()
})

it('сохраняет общие поля отдельно от свойств этой ленты', async () => {
  const onChanged = jest.fn()
  render(
    <TimelineDetailCard
      selected={{ kind: 'event', item: event }}
      timelineId="timeline-1"
      isAdmin
      onClose={jest.fn()}
      onChanged={onChanged}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Править' }))
  fireEvent.change(screen.getByLabelText('Название события'), { target: { value: 'Новое название' } })
  fireEvent.change(screen.getByLabelText('Заметка для этой ленты'), { target: { value: 'Новая заметка' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3))
  expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/admin/timeline/event-types')
  expect(global.fetch).toHaveBeenNthCalledWith(
    2,
    '/api/admin/timeline/events/event-1',
    expect.objectContaining({ method: 'PATCH' }),
  )
  expect(global.fetch).toHaveBeenNthCalledWith(
    3,
    '/api/admin/timeline/timelines/timeline-1/events/event-1',
    expect.objectContaining({ method: 'PUT' }),
  )
  expect(onChanged).toHaveBeenCalled()
})

it('разделяет скрытие, открепление и удаление из общей базы', async () => {
  const onChanged = jest.fn()
  const { rerender } = render(
    <TimelineDetailCard
      selected={{ kind: 'event', item: event }}
      timelineId="timeline-1"
      isAdmin
      onClose={jest.fn()}
      onChanged={onChanged}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Править' }))
  await screen.findByRole('button', { name: 'Скрыть на ленте' })
  fireEvent.click(screen.getByRole('button', { name: 'Скрыть на ленте' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/admin/timeline/timelines/timeline-1/events/event-1',
    expect.objectContaining({ method: 'PATCH' }),
  ))

  rerender(
    <TimelineDetailCard
      selected={{ kind: 'event', item: event }}
      timelineId="timeline-1"
      isAdmin
      onClose={jest.fn()}
      onChanged={onChanged}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Открепить от ленты' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/admin/timeline/timelines/timeline-1/events/event-1',
    expect.objectContaining({ method: 'DELETE' }),
  ))

  fireEvent.click(screen.getByRole('button', { name: 'Удалить из базы' }))
  expect(screen.getByText('Удалить из общей базы?')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Да, удалить' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/admin/timeline/events/event-1',
    expect.objectContaining({ method: 'DELETE' }),
  ))
})

it('призрак предлагает прикрепление без режима правки', async () => {
  const onChanged = jest.fn()
  render(
    <TimelineDetailCard
      selected={{ kind: 'event', item: { ...event, isLibrary: true } }}
      timelineId="timeline-1"
      isAdmin
      onClose={jest.fn()}
      onChanged={onChanged}
    />,
  )

  expect(screen.queryByRole('button', { name: 'Править' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '+ Прикрепить' }))

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/admin/timeline/timelines/timeline-1/events/event-1',
    expect.objectContaining({ method: 'PUT' }),
  ))
  expect(onChanged).toHaveBeenCalled()
})
