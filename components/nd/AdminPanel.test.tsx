/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import AdminPanel from './AdminPanel'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

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
  newFlags: {},
  bookPrioritiesMap: {},
  prioritiesSetMap: {},
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

const mockByBook = [
  {
    book: {
      id: '1',
      name: 'Книга с одной записью',
      author: 'Автор А',
      tags: [],
      type: 'Book',
      size: '',
      pages: '',
      date: '',
      link: '',
      description: '',
      coverUrl: 'https://example.com/cover-a.jpg',
      whyRead: null,
      recommendationLink: null,
      isNew: false,
    },
    users: [
      { timestamp: '2026-03-01T10:00:00.000Z', userId: 'user-1', name: 'Анна', email: 'anna@test.com', contacts: '', selectedBooks: ['Книга с одной записью'] },
    ],
  },
  {
    book: {
      id: '2',
      name: 'Книга с тремя записями',
      author: 'Автор Б',
      tags: [],
      type: 'Book',
      size: '',
      pages: '',
      date: '',
      link: '',
      description: '',
      coverUrl: null,
      whyRead: null,
      recommendationLink: null,
      isNew: false,
    },
    users: [
      { timestamp: '2026-03-01T10:00:00.000Z', userId: 'user-2', name: 'Борис', email: 'boris@test.com', contacts: '', selectedBooks: ['Книга с тремя записями'] },
      { timestamp: '2026-03-01T10:00:00.000Z', userId: 'user-3', name: 'Вера', email: 'vera@test.com', contacts: '', selectedBooks: ['Книга с тремя записями'] },
      { timestamp: '2026-03-01T10:00:00.000Z', userId: 'user-4', name: 'Глеб', email: 'gleb@test.com', contacts: '', selectedBooks: ['Книга с тремя записями'] },
    ],
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
    expect(screen.getByText('Почему предлагаю прочитать?', { exact: false })).toBeInTheDocument()
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

describe('AdminPanel — По книгам таб', () => {
  it('по умолчанию сортирует книги по числу записей по убыванию', () => {
    render(<AdminPanel {...defaultProps} byBook={mockByBook} />)
    fireEvent.click(screen.getByText(/по книгам/i))

    const rows = screen.getAllByRole('row')
    expect(within(rows[1]).getByText('Книга с тремя записями')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Книга с одной записью')).toBeInTheDocument()
  })

  it('показывает автора в ячейке книги и не показывает отдельный столбец автора', () => {
    render(<AdminPanel {...defaultProps} byBook={mockByBook} />)
    fireEvent.click(screen.getByText(/по книгам/i))

    expect(screen.queryByRole('columnheader', { name: /^автор$/i })).not.toBeInTheDocument()
    expect(screen.getByText('Автор А')).toBeInTheDocument()
    expect(screen.getByText('Автор Б')).toBeInTheDocument()
  })

  it('показывает миниатюру обложки, если coverUrl задан', () => {
    render(<AdminPanel {...defaultProps} byBook={mockByBook} />)
    fireEvent.click(screen.getByText(/по книгам/i))

    const cover = screen.getByAltText('Обложка: Книга с одной записью')
    expect(cover).toHaveAttribute('src', 'https://example.com/cover-a.jpg')
    expect(cover).toHaveAttribute('loading', 'lazy')
  })

  it('переключает сортировку по названию книги', () => {
    render(<AdminPanel {...defaultProps} byBook={mockByBook} />)
    fireEvent.click(screen.getByText(/по книгам/i))

    fireEvent.click(screen.getByRole('columnheader', { name: /^книга$/i }))

    const rows = screen.getAllByRole('row')
    expect(within(rows[1]).getByText('Книга с одной записью')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Книга с тремя записями')).toBeInTheDocument()
  })
})
