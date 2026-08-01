/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AdminTimelinePanel from './AdminTimelinePanel'

const typeRow = {
  id: 'type-1',
  title: 'Событие',
  color: '#5D7290',
  icon: '●',
  usageCount: 3,
}

const timelineRow = {
  id: 'timeline-1',
  slug: 'history',
  title: 'Всеобщая история',
  description: '',
  published: true,
  eventCount: 3,
}

beforeEach(() => {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const data = url.endsWith('/event-types')
      ? [typeRow]
      : url.endsWith('/timelines')
        ? [timelineRow]
        : []

    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data }),
    } as Response
  })
})

it('оставляет в админке только типы событий и управление публикацией лент', async () => {
  render(<AdminTimelinePanel />)

  await screen.findByTestId('timeline-types-list')

  expect(screen.getByTestId('timeline-section-types')).toBeInTheDocument()
  expect(screen.getByTestId('timeline-section-timelines')).toBeInTheDocument()
  expect(screen.queryByTestId('timeline-section-events')).not.toBeInTheDocument()
  expect(screen.queryByTestId('timeline-section-epochs')).not.toBeInTheDocument()

  fireEvent.click(screen.getByTestId('timeline-section-timelines'))

  const row = await screen.findByTestId('timeline-timeline-row')
  expect(row).toHaveTextContent('Всеобщая история')
  expect(row).toHaveTextContent('опубликована')
  expect(screen.getByTestId('timeline-publish-toggle')).toBeInTheDocument()
  expect(screen.queryByTestId('timeline-open-contents')).not.toBeInTheDocument()

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
  expect(global.fetch).toHaveBeenCalledWith('/api/admin/timeline/event-types')
  expect(global.fetch).toHaveBeenCalledWith('/api/admin/timeline/timelines')
})
