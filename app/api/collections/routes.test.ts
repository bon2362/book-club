/** @jest-environment node */
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import * as repo from '@/lib/collections/repo'
import { GET as oneGET } from './[slugOrId]/route'
import { GET as searchGET } from './book-search/route'
import { GET as listGET } from './route'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/collections/repo', () => ({
  listPublishedCollections: jest.fn(), loadCollectionPageData: jest.fn(), searchPublishedBooks: jest.fn(),
  serializeCollection: jest.fn((record) => ({ ...record, serialized: true })),
}))
const mockAuth = auth as jest.Mock

describe('GET /api/collections', () => {
  it('returns published collections', async () => {
    ;(repo.listPublishedCollections as jest.Mock).mockResolvedValue([{ id: 'c1' }])
    expect(await (await listGET()).json()).toEqual({ collections: [{ id: 'c1' }] })
  })
  it('returns an empty list until the migration is applied', async () => {
    ;(repo.listPublishedCollections as jest.Mock).mockRejectedValue(Object.assign(new Error('x'), { code: '42P01' }))
    expect(await (await listGET()).json()).toEqual({ collections: [] })
  })
})

describe('GET /api/collections/[slugOrId]', () => {
  it('returns 404 when unavailable to viewer', async () => {
    mockAuth.mockResolvedValue(null); (repo.loadCollectionPageData as jest.Mock).mockResolvedValue(null)
    expect((await oneGET(new NextRequest('http://x'), { params: { slugOrId: 'tema' } })).status).toBe(404)
  })
  it('passes viewer to repository', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', isAdmin: false } }); (repo.loadCollectionPageData as jest.Mock).mockResolvedValue({ record: { id: 'c1' }, books: [] })
    const response = await oneGET(new NextRequest('http://x'), { params: { slugOrId: 'tema' } })
    expect(repo.loadCollectionPageData).toHaveBeenCalledWith('tema', { userId: 'u1', isAdmin: false })
    expect(await response.json()).toEqual({ collection: { id: 'c1', serialized: true }, books: [] })
  })
})

describe('GET /api/collections/book-search', () => {
  it('requires authentication', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await searchGET(new NextRequest('http://x/api/collections/book-search?q=ha'))).status).toBe(401)
  })
  it('searches by q', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } }); (repo.searchPublishedBooks as jest.Mock).mockResolvedValue([{ id: 'b' }])
    const response = await searchGET(new NextRequest('http://x/api/collections/book-search?q=harv'))
    expect(repo.searchPublishedBooks).toHaveBeenCalledWith('harv')
    expect(await response.json()).toEqual({ books: [{ id: 'b' }] })
  })
})
