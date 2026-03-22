/**
 * @jest-environment node
 */
import { GET } from './route'
import * as authModule from '@/lib/auth'
import * as signupsModule from '@/lib/signups'
import * as sheetsModule from '@/lib/sheets'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/signups', () => ({ getAllSignups: jest.fn() }))
jest.mock('@/lib/sheets', () => ({ fetchBooks: jest.fn() }))

const mockAuth = authModule.auth as jest.Mock
const mockGetAllSignups = signupsModule.getAllSignups as jest.Mock
const mockFetchBooks = sheetsModule.fetchBooks as jest.Mock

const sampleSignups = [
  { userId: 'u1', name: 'Ivan', email: 'i@t.ru', contacts: '@ivan', timestamp: '', selectedBooks: ['Книга A', 'Книга B'] },
  { userId: 'u2', name: 'Anna', email: 'a@t.ru', contacts: '@anna', timestamp: '', selectedBooks: ['Книга A'] },
]

const sampleBooks = [
  { id: '1', name: 'Книга A', author: 'Author', tags: [], type: 'Book', size: '', pages: '', date: '', link: '', description: '', coverUrl: null, whyForClub: null, recommendationLink: null },
  { id: '2', name: 'Книга B', author: 'Author', tags: [], type: 'Book', size: '', pages: '', date: '', link: '', description: '', coverUrl: null, whyForClub: null, recommendationLink: null },
  { id: '3', name: 'Книга C', author: 'Author', tags: [], type: 'Book', size: '', pages: '', date: '', link: '', description: '', coverUrl: null, whyForClub: null, recommendationLink: null },
]

describe('GET /api/admin', () => {
  it('возвращает 403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('возвращает 403 если isAdmin=false', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@t.ru', isAdmin: false } })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('возвращает 403 если isAdmin не задан', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@t.ru' } })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('возвращает пользователей и группировку по книгам', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@t.ru', isAdmin: true } })
    mockGetAllSignups.mockResolvedValue(sampleSignups)
    mockFetchBooks.mockResolvedValue(sampleBooks)

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.users).toHaveLength(2)
    expect(data.byBook['Книга A']).toHaveLength(2)
    expect(data.byBook['Книга B']).toHaveLength(1)
    expect(data.byBook['Книга C']).toBeUndefined() // no signups
  })

  it('не включает в byBook книги без записей', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'admin@t.ru', isAdmin: true } })
    mockGetAllSignups.mockResolvedValue([])
    mockFetchBooks.mockResolvedValue(sampleBooks)

    const res = await GET()
    const data = await res.json()

    expect(data.byBook).toEqual({})
  })
})
