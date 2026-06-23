/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import AdminPanel from './AdminPanel'

const mockRouterReplace = jest.fn()
const mockRouterPush = jest.fn()
const mockRouterRefresh = jest.fn()
const mockRouter = { push: mockRouterPush, refresh: mockRouterRefresh, replace: mockRouterReplace }
let mockPathname = '/admin'
let mockSearchParams = new URLSearchParams()

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}))

jest.mock('./Header', () => ({
  __esModule: true,
  default: () => <div data-testid="header" />,
}))

// Minimal props for AdminPanel
const defaultProps = {
  users: [],
  byBook: [],
  allTags: [],
  tagDescriptions: {},
  bookPrioritiesMap: {},
  prioritiesSetMap: {},
  catalogCount: 0,
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
      pages: '',
      date: '',
      link: '',
      description: '',
      coverUrl: 'https://example.com/cover-a.jpg',
      whyRead: null,
      recommendationLink: null,
      isNew: false,
      summaryCount: 0,
    },
    users: [
      { timestamp: '2026-03-01T10:00:00.000Z', userId: 'user-1', name: 'Анна', email: 'anna@test.com', contacts: '', selectedBooks: ['Книга с одной записью'], selectedBookIds: ['1'], signups: [] },
    ],
  },
  {
    book: {
      id: '2',
      name: 'Книга с тремя записями',
      author: 'Автор Б',
      tags: [],
      type: 'Book',
      pages: '',
      date: '',
      link: '',
      description: '',
      coverUrl: null,
      whyRead: null,
      recommendationLink: null,
      isNew: false,
      summaryCount: 0,
    },
    users: [
      { timestamp: '2026-03-01T10:00:00.000Z', userId: 'user-2', name: 'Борис', email: 'boris@test.com', contacts: '', selectedBooks: ['Книга с тремя записями'], selectedBookIds: ['2'], signups: [] },
      { timestamp: '2026-03-01T10:00:00.000Z', userId: 'user-3', name: 'Вера', email: 'vera@test.com', contacts: '', selectedBooks: ['Книга с тремя записями'], selectedBookIds: ['2'], signups: [] },
      { timestamp: '2026-03-01T10:00:00.000Z', userId: 'user-4', name: 'Глеб', email: 'gleb@test.com', contacts: '', selectedBooks: ['Книга с тремя записями'], selectedBookIds: ['2'], signups: [] },
    ],
  },
]

const mockAdminUsers = [
  {
    id: 'user-old',
    name: 'Старый участник',
    email: 'old@test.com',
    contacts: '@old_reader',
    telegramDisplay: '@old_reader',
    authProvider: 'telegram',
    lastActivityAt: '2026-01-01T10:00:00.000Z',
    lastActivityType: 'sign_in',
    createdAt: '2025-12-01T10:00:00.000Z',
    languages: ['ru'],
    booksCount: 1,
    isAdmin: false,
  },
  {
    id: 'user-new',
    name: 'Новый участник',
    email: 'new@test.com',
    contacts: '@new_reader',
    telegramDisplay: '@new_reader',
    authProvider: 'telegram',
    lastActivityAt: '2026-05-18T10:00:00.000Z',
    lastActivityType: 'site_visit',
    createdAt: new Date().toISOString(),
    languages: ['en'],
    booksCount: 3,
    isAdmin: false,
  },
]

const mockAdminUserDetails = {
  user: {
    ...mockAdminUsers[0],
    contactEmail: 'old@test.com',
    prioritiesSet: false,
  },
  signupBooks: [],
  priorities: [],
  submissions: [],
  feedback: [],
}

const mockFeedback = [
  {
    id: 'fb-1',
    userId: 'user-1',
    name: null,
    email: null,
    message: 'Первый фидбек',
    createdAt: '2026-03-01T10:00:00.000Z',
    userName: 'Анна',
    userEmail: 'anna@test.com',
  },
  {
    id: 'fb-2',
    userId: null,
    name: 'Гость',
    email: 'guest@test.com',
    message: 'Второй фидбек',
    createdAt: '2026-03-02T10:00:00.000Z',
    userName: null,
    userEmail: null,
  },
]

const mockSummaries = [
  {
    id: 'sum-1',
    bookId: 'book-1',
    authorUserId: 'user-1',
    displayName: 'alina.reads',
    title: 'Институты, а не география',
    tldr: 'Коротко про институты',
    bodyMarkdown: '**Текст**',
    status: 'pending',
    rejectionReason: null,
    submittedAt: '2026-06-20T10:00:00.000Z',
    publishedAt: null,
    createdAt: '2026-06-19T10:00:00.000Z',
    updatedAt: '2026-06-20T10:00:00.000Z',
    bookTitle: 'Почему одни страны богатые',
    bookAuthor: 'Аджемоглу',
    authorName: 'Алина',
    authorEmail: 'alina@test.com',
  },
]

beforeEach(() => {
  window.localStorage.clear()
  mockRouterReplace.mockClear()
  mockRouterPush.mockClear()
  mockRouterRefresh.mockClear()
  mockPathname = '/admin'
  mockSearchParams = new URLSearchParams()
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

  it('если новых заявок нет, по умолчанию открывает фильтр "Все"', async () => {
    const nonPending = mockSubmissions.map(s => ({ ...s, status: 'approved' }))
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/admin/submissions') {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, data: nonPending }),
          ok: true,
        })
      }
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: [] }),
        ok: true,
      })
    })

    render(<AdminPanel {...defaultProps} />)
    fireEvent.click(screen.getByText(/заявки/i))

    await waitFor(() => {
      expect(screen.getByText('Сапиенс')).toBeInTheDocument()
      expect(screen.getByText('Война и мир')).toBeInTheDocument()
    })
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

  it('сбрасывает счетчик непрочитанных после обработки заявки', async () => {
    const updatedSub = { ...mockSubmissions[0], status: 'approved' }
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockSubmissions }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: [] }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: updatedSub }),
        ok: true,
      })

    render(<AdminPanel {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByLabelText('1 новых')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/заявки/i))
    fireEvent.click(await screen.findByText('Сапиенс'))
    fireEvent.click(screen.getByText('Одобрить'))

    await waitFor(() => {
      expect(screen.queryByLabelText('1 новых')).not.toBeInTheDocument()
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

  it('редактирование темы использует список тем и сохраняет выбранную тему', async () => {
    const updatedSub = { ...mockSubmissions[0], topic: 'Философия' }
    ;(global.fetch as jest.Mock).mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/admin/submissions' && !init) {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, data: mockSubmissions }),
          ok: true,
        })
      }
      if (url === '/api/admin/submissions/sub-1') {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, data: updatedSub }),
          ok: true,
        })
      }
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: [] }),
        ok: true,
      })
    })

    render(<AdminPanel {...defaultProps} allTags={['История', 'Философия']} />)
    fireEvent.click(screen.getByText(/заявки/i))
    await waitFor(() => screen.getByText('Сапиенс'))

    fireEvent.click(screen.getByText('Сапиенс'))

    const topicSelect = screen.getByLabelText('Тема')
    expect(within(topicSelect).getByRole('option', { name: 'История' })).toBeInTheDocument()
    expect(within(topicSelect).getByRole('option', { name: 'Философия' })).toBeInTheDocument()

    fireEvent.change(topicSelect, { target: { value: 'Философия' } })
    fireEvent.click(screen.getByText('Сохранить'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/submissions/sub-1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"topic":"Философия"'),
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

describe('AdminPanel — Саммари таб', () => {
  it('загружает и показывает саммари на проверке', async () => {
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/admin/summaries') {
        return Promise.resolve({ json: () => Promise.resolve({ summaries: mockSummaries }), ok: true })
      }
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }), ok: true })
    })

    render(<AdminPanel {...defaultProps} />)
    fireEvent.click(screen.getByText(/саммари/i))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/summaries')
      expect(screen.getByText('Институты, а не география')).toBeInTheDocument()
      expect(screen.getByText('Почему одни страны богатые')).toBeInTheDocument()
    })
  })
})

describe('AdminPanel — merge users', () => {
  it('не показывает ID пользователей в списке и не ищет по ID', async () => {
    ;(global.fetch as jest.Mock).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/admin/submissions') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) })
      }
      if (url === '/api/admin/summaries') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ summaries: [] }) })
      }
      if (url === '/api/admin/feedback') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) })
      }
      if (url === '/api/admin/users') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: mockAdminUsers }) })
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? 'GET'}`)
    })

    render(<AdminPanel {...defaultProps} />)

    await screen.findByText('Старый участник')
    expect(screen.getByPlaceholderText('Поиск по имени или Telegram')).toBeInTheDocument()
    expect(screen.queryByText('user-new')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Поиск пользователей'), { target: { value: 'user-new' } })

    expect(screen.queryByText('Новый участник')).not.toBeInTheDocument()
    expect(screen.getByText('Никого не найдено')).toBeInTheDocument()
  })

  it('находит target-пользователя по вставленному ID и отправляет merge без причины', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText },
    })
    ;(global.fetch as jest.Mock).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/admin/submissions') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) })
      }
      if (url === '/api/admin/summaries') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ summaries: [] }) })
      }
      if (url === '/api/admin/feedback') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) })
      }
      if (url === '/api/admin/users') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: mockAdminUsers }) })
      }
      if (url === '/api/admin/users/user-old') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: mockAdminUserDetails }) })
      }
      if (url === '/api/admin/users/user-new') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { ...mockAdminUserDetails, user: mockAdminUsers[1] } }) })
      }
      if (url === '/api/admin/users/merge') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, result: { movedCounts: { users: 1 } } }) })
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? 'GET'}`)
    })

    render(<AdminPanel {...defaultProps} />)

    fireEvent.click(await screen.findByText('Старый участник'))
    expect(await screen.findByText('Слить дубль')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /скопировать id пользователя user-old/i }))
    expect(writeText).toHaveBeenCalledWith('user-old')

    fireEvent.change(screen.getByLabelText('ID аккаунта, который оставить'), { target: { value: ' user-new ' } })
    expect(await screen.findByText(/Новый участник/)).toBeInTheDocument()
    expect(screen.getByText('user-new')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Merge to user'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/users/merge', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          sourceUserId: 'user-old',
          targetUserId: 'user-new',
          reason: '',
        }),
      }))
    })
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Слить пользователя Старый участник в user-new?'))
  })

  it('показывает ошибку merge в карточке пользователя', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true)
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    })
    ;(global.fetch as jest.Mock).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/admin/submissions') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) })
      }
      if (url === '/api/admin/summaries') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ summaries: [] }) })
      }
      if (url === '/api/admin/feedback') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) })
      }
      if (url === '/api/admin/users') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: mockAdminUsers }) })
      }
      if (url === '/api/admin/users/user-old') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: mockAdminUserDetails }) })
      }
      if (url === '/api/admin/users/user-new') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { ...mockAdminUserDetails, user: mockAdminUsers[1] } }) })
      }
      if (url === '/api/admin/users/merge') {
        return Promise.resolve({ ok: false, statusText: 'Conflict', json: () => Promise.resolve({ error: 'target user not found' }) })
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? 'GET'}`)
    })

    render(<AdminPanel {...defaultProps} />)

    fireEvent.click(await screen.findByText('Старый участник'))
    const drawer = screen.getByRole('dialog')
    expect(await within(drawer).findByText('Слить дубль')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('ID аккаунта, который оставить'), { target: { value: 'user-new' } })
    expect(await within(drawer).findByText(/Новый участник/)).toBeInTheDocument()

    fireEvent.click(within(drawer).getByText('Merge to user'))

    expect(await within(drawer).findByText('Не удалось слить пользователей: target user not found')).toBeInTheDocument()
    expect(within(drawer).getByText('Слить дубль')).toBeInTheDocument()
  })
})

describe('AdminPanel — таб-бар', () => {
  it('таб "По книгам" удалён', () => {
    render(<AdminPanel {...defaultProps} byBook={mockByBook} />)
    expect(screen.queryByText(/по книгам/i)).not.toBeInTheDocument()
  })

  it('таб "Каталог" присутствует', () => {
    render(<AdminPanel {...defaultProps} />)
    expect(screen.getByTestId('admin-tab-catalog')).toBeInTheDocument()
  })

  it('открывает активную вкладку из query-параметра tab', () => {
    mockSearchParams = new URLSearchParams('tab=tags')

    render(<AdminPanel {...defaultProps} allTags={['История']} />)

    expect(screen.getByTestId('tag-block-История')).toBeInTheDocument()
    expect(mockRouterReplace).not.toHaveBeenCalled()
  })

  it('при клике сохраняет активную вкладку в URL без скролла', () => {
    mockSearchParams = new URLSearchParams('from=digest')

    render(<AdminPanel {...defaultProps} />)
    fireEvent.click(screen.getByTestId('admin-tab-catalog'))

    expect(mockRouterReplace).toHaveBeenCalledWith('/admin?from=digest&tab=catalog', { scroll: false })
  })

  it('некорректный query-параметр tab сбрасывает на users', async () => {
    mockSearchParams = new URLSearchParams('tab=unknown&from=digest')

    render(<AdminPanel {...defaultProps} />)

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/admin?tab=users&from=digest', { scroll: false })
    })
    expect(screen.getByLabelText('Поиск пользователей')).toBeInTheDocument()
  })
})

describe('AdminPanel — Участники таб', () => {
  it('по умолчанию сортирует пользователей по последней активности и показывает новые колонки', async () => {
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/admin/users') {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, data: mockAdminUsers }),
          ok: true,
        })
      }
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: [] }),
        ok: true,
      })
    })

    render(<AdminPanel {...defaultProps} />)

    await waitFor(() => screen.getByText('Новый участник'))

    const rows = screen.getAllByRole('row')
    expect(within(rows[0]).getByRole('columnheader', { name: /книг/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /последняя активность/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /дата создания/i })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /^email$/i })).not.toBeInTheDocument()
    expect(within(rows[1]).getByText('Новый участник')).toBeInTheDocument()
    expect(within(rows[1]).getByLabelText(/Пользователь заходил на сайт/)).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()
  })
})

describe('AdminPanel — Фидбеки таб', () => {
  it('заранее загружает счетчик фидбеков и показывает бейдж на вкладке', async () => {
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/admin/feedback') {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, data: mockFeedback }),
          ok: true,
        })
      }
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: [] }),
        ok: true,
      })
    })

    render(<AdminPanel {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Фидбеки (2)')).toBeInTheDocument()
      expect(screen.getByLabelText('2 новых')).toBeInTheDocument()
    })
  })

  it('сбрасывает счетчик непрочитанных после просмотра вкладки', async () => {
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/admin/feedback') {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, data: mockFeedback }),
          ok: true,
        })
      }
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: [] }),
        ok: true,
      })
    })

    render(<AdminPanel {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByLabelText('2 новых')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/фидбеки/i))

    await waitFor(() => {
      expect(screen.queryByLabelText('2 новых')).not.toBeInTheDocument()
    })
  })
})
