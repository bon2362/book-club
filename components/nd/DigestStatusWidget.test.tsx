import React from 'react'
import { render, screen, act } from '@testing-library/react'
import DigestStatusWidget from './DigestStatusWidget'

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

function respondWith(data: object) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => data,
  })
}

describe('DigestStatusWidget', () => {
  it('ничего не рендерит пока данные не загружены', () => {
    mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
    const { container } = render(<DigestStatusWidget />)
    expect(container.firstChild).toBeNull()
  })

  it('показывает "очередь пуста" при status:empty', async () => {
    respondWith({ status: 'empty' })
    render(<DigestStatusWidget />)
    await act(async () => {})
    expect(screen.getByText(/очередь пуста/i)).toBeInTheDocument()
  })

  it('показывает count при status:ready', async () => {
    respondWith({ status: 'ready', count: 3 })
    render(<DigestStatusWidget />)
    await act(async () => {})
    expect(screen.getByText(/готово/i)).toBeInTheDocument()
    expect(screen.getByText(/3/)).toBeInTheDocument()
  })

  it('показывает минуты до отправки при status:cooling', async () => {
    const sendAt = new Date(Date.now() + 20 * 60 * 1000).toISOString()
    respondWith({ status: 'cooling', count: 1, sendAt })
    render(<DigestStatusWidget />)
    await act(async () => {})
    expect(screen.getByText(/ожидание/i)).toBeInTheDocument()
    expect(screen.getByText(/20 мин/i)).toBeInTheDocument()
  })

  it('делает повторный запрос каждые 60 секунд', async () => {
    respondWith({ status: 'empty' })
    render(<DigestStatusWidget />)
    await act(async () => {})
    expect(mockFetch).toHaveBeenCalledTimes(1)
    await act(async () => { jest.advanceTimersByTime(60_000) })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('остаётся невидимым при ошибке fetch (non-ok ответ)', async () => {
    mockFetch.mockResolvedValue({ ok: false })
    const { container } = render(<DigestStatusWidget />)
    await act(async () => {})
    expect(container.firstChild).toBeNull()
  })
})
