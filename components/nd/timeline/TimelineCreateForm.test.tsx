/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import TimelineCreateForm from './TimelineCreateForm'

const response = (data: unknown = {}) => Promise.resolve({ ok: true, json: async () => data }) as Promise<Response>

beforeEach(() => {
  global.fetch = jest.fn()
    .mockImplementationOnce(() => response({ data: [{ id: 'type-1', title: 'Событие', color: '#5D7290', icon: '', usageCount: 0 }] }))
    .mockImplementationOnce(() => response({ success: true, data: { id: 'event-new' } }))
    .mockImplementationOnce(() => response({ success: true, data: {} }))
})

it('создаёт событие из середины диапазона и прикрепляет id из data', async () => {
  const onCreated = jest.fn()
  render(<TimelineCreateForm kind="event" timelineId="timeline-1" range={{ start: 1900, end: 2000 }} onCancel={jest.fn()} onCreated={onCreated} />)

  await screen.findByRole('button', { name: 'Событие' })
  expect(screen.getByTestId('create-start-year')).toHaveValue(1950)
  fireEvent.change(screen.getByLabelText('Название нового события'), { target: { value: 'Новое событие' } })
  fireEvent.click(screen.getByRole('button', { name: 'Создать' }))

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith('event', 'event-new'))
  const createInit = (global.fetch as jest.Mock).mock.calls[1][1] as RequestInit
  expect(JSON.parse(createInit.body as string)).toMatchObject({
    end: null,
    imageUrl: null,
    imageCaption: null,
  })
  expect(global.fetch).toHaveBeenNthCalledWith(
    3,
    '/api/admin/timeline/timelines/timeline-1/events/event-new',
    expect.objectContaining({ method: 'PUT' }),
  )
})

it('Esc отменяет форму', () => {
  const onCancel = jest.fn()
  render(<TimelineCreateForm kind="epoch" timelineId="timeline-1" range={{ start: 1900, end: 2000 }} onCancel={onCancel} onCreated={jest.fn()} />)

  fireEvent.keyDown(screen.getByTestId('timeline-create-form'), { key: 'Escape' })

  expect(onCancel).toHaveBeenCalled()
})
