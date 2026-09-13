/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'
import { DELETE, POST } from './route'
import { auth } from '@/lib/auth'
import { saveSignupSelection } from '@/lib/signup-selection'
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/signup-selection', () => ({ saveSignupSelection: jest.fn() }))
const queue: unknown[][] = []
jest.mock('@/lib/db', () => { const chain = (): unknown => new Proxy({}, { get: (_t, prop) => prop === 'then' ? (resolve: (value: unknown) => void) => resolve(queue.shift() ?? []) : () => chain() }); return { db: { select: () => chain() } } })
const mockAuth = auth as jest.Mock; const mockSave = saveSignupSelection as jest.Mock
const request = (method: string) => new NextRequest('http://localhost/api/signup-books/b2', { method }); const params = { params: { bookId: 'b2' } }
beforeEach(() => { queue.length = 0; mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Аня' } }); mockSave.mockResolvedValue(NextResponse.json({ ok: true })) })
test('POST возвращает 404 для скрытой книги', async () => { queue.push([{ id: 'b2', visibility: 'hidden' }]); expect((await POST(request('POST'), params)).status).toBe(404) })
test('POST добавляет опубликованную книгу к текущей записи', async () => { queue.push([{ id: 'b2', visibility: 'published' }], [{ name: 'Аня', contacts: '@anya' }], [{ bookId: 'b1' }]); await POST(request('POST'), params); expect(mockSave).toHaveBeenCalledWith(expect.anything(), { name: 'Аня', contacts: '@anya', selectedBookIds: ['b1', 'b2'] }) })
test('DELETE убирает книгу из текущей записи', async () => { queue.push([{ name: 'Аня', contacts: '@anya' }], [{ bookId: 'b1' }, { bookId: 'b2' }]); await DELETE(request('DELETE'), params); expect(mockSave).toHaveBeenCalledWith(expect.anything(), { name: 'Аня', contacts: '@anya', selectedBookIds: ['b1'] }) })
