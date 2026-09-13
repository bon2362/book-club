/** @jest-environment node */
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { CollectionError } from '@/lib/collections/errors'
import * as repo from '@/lib/collections/repo'
import { DELETE, PATCH } from './[id]/route'
import { POST as submit } from './[id]/submit/route'
import { GET, POST } from './route'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({ withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}) }))
jest.mock('@/lib/collections/repo', () => ({ listMyCollections: jest.fn(), createDraftCollection: jest.fn(), loadCollectionById: jest.fn(), saveCollectionContent: jest.fn(), submitCollection: jest.fn(), deleteCollection: jest.fn(), serializeCollection: jest.fn((record) => record) }))
const mockAuth = auth as jest.Mock
const json = (body: unknown, method = 'POST') => new NextRequest('http://x', { method, body: JSON.stringify(body) })
const params = { params: { id: 'c1' } }
const content = { title: 'Т', descriptionMarkdown: 'О', displayName: 'П', bookIds: ['a', 'b'] }
beforeEach(() => { jest.clearAllMocks(); mockAuth.mockResolvedValue({ user: { id: 'author', name: 'Аня', isAdmin: false } }) })

it('requires authentication for all routes', async () => {
  mockAuth.mockResolvedValue(null)
  expect((await GET()).status).toBe(401); expect((await POST(json({ title: 'Т' }))).status).toBe(401)
  expect((await PATCH(json(content, 'PATCH'), params)).status).toBe(401); expect((await DELETE(new NextRequest('http://x', { method: 'DELETE' }), params)).status).toBe(401)
  expect((await submit(new NextRequest('http://x', { method: 'POST' }), params)).status).toBe(401)
})
it('creates a draft', async () => { (repo.createDraftCollection as jest.Mock).mockResolvedValue({ id: 'c1' }); expect((await POST(json({ title: 'Тема' }))).status).toBe(201); expect(repo.createDraftCollection).toHaveBeenCalledWith({}, expect.objectContaining({ authorUserId: 'author', title: 'Тема' })) })
it('hides another author collection', async () => { (repo.loadCollectionById as jest.Mock).mockResolvedValue({ id: 'c1', authorUserId: 'other', status: 'draft' }); expect((await PATCH(json(content, 'PATCH'), params)).status).toBe(404) })
it('saves an owner collection as author', async () => { (repo.loadCollectionById as jest.Mock).mockResolvedValue({ id: 'c1', authorUserId: 'author', status: 'published' }); (repo.saveCollectionContent as jest.Mock).mockResolvedValue({ id: 'c1' }); expect((await PATCH(json(content, 'PATCH'), params)).status).toBe(200); expect(repo.saveCollectionContent).toHaveBeenCalledWith({}, expect.objectContaining({ id: 'c1', content, by: 'author' })) })
it('returns book publication errors', async () => { (repo.loadCollectionById as jest.Mock).mockResolvedValue({ id: 'c1', authorUserId: 'author', status: 'draft' }); (repo.saveCollectionContent as jest.Mock).mockRejectedValue(new CollectionError('book_not_published', { bookIds: ['x'] })); expect((await PATCH(json(content, 'PATCH'), params)).status).toBe(400) })
it('prevents author deletion of published collection', async () => { (repo.loadCollectionById as jest.Mock).mockResolvedValue({ id: 'c1', authorUserId: 'author', status: 'published' }); expect((await DELETE(new NextRequest('http://x', { method: 'DELETE' }), params)).status).toBe(403); expect(repo.deleteCollection).not.toHaveBeenCalled() })
it('deletes a hidden collection', async () => { (repo.loadCollectionById as jest.Mock).mockResolvedValue({ id: 'c1', authorUserId: 'author', status: 'hidden' }); expect((await DELETE(new NextRequest('http://x', { method: 'DELETE' }), params)).status).toBe(200); expect(repo.deleteCollection).toHaveBeenCalledWith({}, 'c1') })
it('returns submit validation issues', async () => { (repo.loadCollectionById as jest.Mock).mockResolvedValue({ id: 'c1', authorUserId: 'author', status: 'draft' }); (repo.submitCollection as jest.Mock).mockRejectedValue(new CollectionError('validation', { issues: ['too_few_books'] })); const response = await submit(new NextRequest('http://x', { method: 'POST' }), params); expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: 'validation', issues: ['too_few_books'] }) })
