/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import AdminPanel from './AdminPanel'

jest.mock('./Header', () => ({
  __esModule: true,
  default: () => <div data-testid="header" />,
}))

// Minimal props for AdminPanel
const defaultProps = {
  users: [],
  byBook: [],
  statuses: {},
  allTags: [],
  tagDescriptions: {},
}

const mockSubmissions = [
  {
    id: 'sub-1',
    userId: 'user-1',
    userEmail: 'alice@test.com',
    title: 'Сапиенс',
    author: 'Харари',
    topic: 'История',
    pages: 500,
    publishedDate: null,
    textUrl: null,
    description: null,
    coverUrl: null,
    whyRead: 'Интересная история человечества',
    status: 'pending',
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
  },
  {
    id: 'sub-2',
    userId: 'user-2',
    userEmail: 'bob@test.com',
    title: 'Война и мир',
    author: 'Толстой',
    topic: null,
    pages: 1200,
    publishedDate: null,
    textUrl: null,
    description: null,
    coverUrl: null,
    whyRead: 'Классика',
    status: 'approved',
    createdAt: '2026-03-02T10:00:00.000Z',
    updatedAt: '2026-03-02T10:00:00.000Z',
  },
]

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    json: () => Promise.resolve({ success: true, data: [] }),
    ok: true,
  })
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('AdminPanel — Заявки таб', () => {
  it('показывает кнопку таба Заявки', () => {
    render(<AdminPanel {...defaultProps} />)
    expect(screen.getByText(/заявки/i)).toBeInTheDocument()
  })

  it('загружает заявки при переходе на таб', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: mockSubmissions }),
      ok: true,
    })

    render(<AdminPanel {...defaultProps} />)
    fireEvent.click(screen.getByText(/заявки/i))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/submissions')
    })
  })

  it('отображает заявки в таблице', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: mockSubmissions }),
      ok: true,
    })

    render(<AdminPanel {...defaultProps} />)
    fireEvent.click(screen.getByText(/заявки/i))

    // Default filter is 'pending' — only sub-1
    await waitFor(() => {
      expect(screen.getByText('Сапиенс')).toBeInTheDocument()
    })
  })

  it('фильтр "Все" показывает все заявки', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: mockSubmissions }),
      ok: true,
    })

    render(<AdminPanel {...defaultProps} />)
    fireEvent.click(screen.getByText(/заявки/i))

    await waitFor(() => screen.getByText('Сапиенс'))

    fireEvent.click(screen.getByText(/^все/i))
    expect(screen.getByText('Сапиенс')).toBeInTheDocument()
    expect(screen.getByText('Война и мир')).toBeInTheDocument()
  })

  it('клик на заявку разворачивает детальный вид', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: mockSubmissions }),
      ok: true,
    })

    render(<AdminPanel {...defaultProps} />)
    fireEvent.click(screen.getByText(/заявки/i))
    await waitFor(() => screen.getByText('Сапиенс'))

    fireEvent.click(screen.getByText('Сапиенс'))
    expect(screen.getByText('Почему стоит прочитать?', { exact: false })).toBeInTheDocument()
    expect(screen.getAllByText('alice@test.com').length).toBeGreaterThan(0)
    expect(screen.getByText('Одобрить')).toBeInTheDocument()
    expect(screen.getByText('Отклонить')).toBeInTheDocument()
  })

  it('кнопка "Одобрить" вызывает PATCH с status=approved', async () => {
    const updatedSub = { ...mockSubmissions[0], status: 'approved' }
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockSubmissions }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: updatedSub }),
        ok: true,
      })

    render(<AdminPanel {...defaultProps} />)
    fireEvent.click(screen.getByText(/заявки/i))
    await waitFor(() => screen.getByText('Сапиенс'))

    fireEvent.click(screen.getByText('Сапиенс'))
    fireEvent.click(screen.getByText('Одобрить'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/submissions/sub-1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"status":"approved"'),
        })
      )
    })
  })

  it('кнопка "Отклонить" вызывает PATCH с status=rejected', async () => {
    const updatedSub = { ...mockSubmissions[0], status: 'rejected' }
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockSubmissions }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: updatedSub }),
        ok: true,
      })

    render(<AdminPanel {...defaultProps} />)
    fireEvent.click(screen.getByText(/заявки/i))
    await waitFor(() => screen.getByText('Сапиенс'))

    fireEvent.click(screen.getByText('Сапиенс'))
    fireEvent.click(screen.getByText('Отклонить'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/submissions/sub-1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"status":"rejected"'),
        })
      )
    })
  })

  it('редактирование поля и сохранение вызывает PATCH без смены статуса', async () => {
    const updatedSub = { ...mockSubmissions[0], title: 'Сапиенс (изм.)' }
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockSubmissions }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: updatedSub }),
        ok: true,
      })

    render(<AdminPanel {...defaultProps} />)
    fireEvent.click(screen.getByText(/заявки/i))
    await waitFor(() => screen.getByText('Сапиенс'))

    fireEvent.click(screen.getByText('Сапиенс'))

    const titleInput = screen.getByDisplayValue('Сапиенс')
    fireEvent.change(titleInput, { target: { value: 'Сапиенс (изм.)' } })

    fireEvent.click(screen.getByText('Сохранить'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/submissions/sub-1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"title":"Сапиенс (изм.)"'),
        })
      )
    })
  })

  it('показывает "Загрузка…" до получения данных', async () => {
    let resolve: (v: unknown) => void
    ;(global.fetch as jest.Mock).mockReturnValue(
      new Promise(r => { resolve = r })
    )

    render(<AdminPanel {...defaultProps} />)
    fireEvent.click(screen.getByText(/заявки/i))

    expect(screen.getByText('Загрузка…')).toBeInTheDocument()

    await act(async () => {
      resolve!({
        json: () => Promise.resolve({ success: true, data: [] }),
        ok: true,
      })
    })
  })
})
