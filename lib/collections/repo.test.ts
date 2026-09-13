/**
 * @jest-environment node
 */
jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('@/lib/books', () => ({ fetchBooksByIds: jest.fn() }))

import { fetchBooksByIds } from '@/lib/books'
import { applyAdminCollectionAction, listAdminQueue, listPublishedCollections, searchPublishedBooks } from './repo'

type Write = { op: 'update' | 'insert' | 'delete'; values: unknown[] }

/** Цепочка drizzle: любые методы возвращают саму цепочку, await отдаёт очередной результат select. */
function fakeDb(selectResults: unknown[][]) {
  const writes: Write[] = []
  const chain = (result: Promise<unknown>, write?: Write): unknown => new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return result.then.bind(result)
      if (prop === 'catch') return result.catch.bind(result)
      return (...args: unknown[]) => {
        if (write && (prop === 'set' || prop === 'values')) write.values.push(args[0])
        return chain(result, write)
      }
    },
  })
  const write = (op: Write['op']) => {
    const entry: Write = { op, values: [] }
    writes.push(entry)
    return chain(Promise.resolve([]), entry)
  }
  return {
    writes,
    client: {
      select: () => chain(Promise.resolve(selectResults.shift() ?? [])),
      update: () => write('update'),
      insert: () => write('insert'),
      delete: () => write('delete'),
    } as never,
  }
}

const at = (iso: string) => new Date(iso)
const snapshot = (bookIds: string[]) => ({ title: 'Тема', descriptionMarkdown: 'Текст', displayName: 'Аня', bookIds })

function row(overrides: Record<string, unknown>) {
  return {
    id: 'c1',
    slug: 'tema',
    authorUserId: 'u1',
    displayName: 'Аня',
    title: 'Тема',
    descriptionMarkdown: 'Текст',
    status: 'published',
    moderationReason: null,
    submittedAt: null,
    editedAt: null,
    publishedAt: at('2026-09-01T10:00:00Z'),
    reviewedAt: at('2026-09-01T10:00:00Z'),
    reviewedSnapshot: null,
    createdAt: at('2026-08-30T10:00:00Z'),
    updatedAt: at('2026-09-01T10:00:00Z'),
    ...overrides,
  }
}

const book = (id: string, visibility = 'published') => ({ id, name: `Книга ${id}`, author: 'Автор', coverUrl: null, visibility })
const mockFetchBooks = fetchBooksByIds as jest.Mock

beforeEach(() => mockFetchBooks.mockReset())

test('короткий запрос поиска не ходит в базу', async () => {
  const client = { select: jest.fn() }
  await expect(searchPublishedBooks(' а ', client as never)).resolves.toEqual([])
  expect(client.select).not.toHaveBeenCalled()
})

describe('listPublishedCollections', () => {
  it('скрывает подборки без публичных книг и ставит свежие первыми', async () => {
    const { client } = fakeDb([
      [row({ id: 'old' }), row({ id: 'fresh', slug: 'fresh', editedAt: at('2026-09-10T10:00:00Z') }), row({ id: 'empty', slug: 'empty' })],
      [
        { collectionId: 'old', bookId: 'a' },
        { collectionId: 'old', bookId: 'h' },
        { collectionId: 'fresh', bookId: 'b' },
        { collectionId: 'empty', bookId: 'h' },
      ],
    ])
    mockFetchBooks.mockResolvedValue([book('a'), book('b'), book('h', 'hidden')])

    const list = await listPublishedCollections(client)

    expect(list.map((item) => item.id)).toEqual(['fresh', 'old'])
    expect(list[1]).toMatchObject({ textsCount: 1, covers: [{ id: 'a', title: 'Книга a' }] })
  })
})

describe('listAdminQueue', () => {
  it('раскладывает по секциям, сводка изменений — только у изменённых после проверки', async () => {
    const { client } = fakeDb([
      [
        row({ id: 'p', status: 'pending', slug: null, submittedAt: at('2026-09-11T10:00:00Z') }),
        row({ id: 'ch', editedAt: at('2026-09-12T10:00:00Z'), reviewedSnapshot: snapshot(['a']) }),
        row({ id: 'ok', reviewedSnapshot: snapshot(['a']) }),
        row({ id: 'r', status: 'rejected' }),
        row({ id: 'd', status: 'draft' }),
      ],
      [
        { collectionId: 'ch', bookId: 'a' },
        { collectionId: 'ch', bookId: 'b' },
        { collectionId: 'ok', bookId: 'a' },
      ],
    ])
    mockFetchBooks.mockResolvedValue([book('a'), book('b')])

    const queue = await listAdminQueue(client)

    expect(queue.pending.map((item) => item.id)).toEqual(['p'])
    expect(queue.changed.map((item) => item.id)).toEqual(['ch'])
    expect(queue.changed[0].diffSummary).toEqual({ added: 1, removed: 0, textChanged: false, orderChanged: false })
    expect(queue.published.map((item) => item.id)).toEqual(['ok'])
    expect(queue.published[0].diffSummary).toBeNull()
    expect(queue.rejectedOrHidden.map((item) => item.id)).toEqual(['r'])
  })
})

describe('applyAdminCollectionAction', () => {
  it('«Правка проверена» не стирает время правки автора', async () => {
    const edited = row({ editedAt: at('2026-09-12T10:00:00Z'), reviewedSnapshot: snapshot(['a']) })
    const { client, writes } = fakeDb([[edited], [{ collectionId: 'c1', bookId: 'a' }], [edited], [{ collectionId: 'c1', bookId: 'a' }]])

    await applyAdminCollectionAction(client, { id: 'c1', action: 'mark_reviewed', reason: null, now: at('2026-09-13T10:00:00Z') })

    expect(writes[0].op).toBe('update')
    expect(writes[0].values[0]).toMatchObject({ reviewedAt: at('2026-09-13T10:00:00Z') })
    expect(writes[0].values[0]).not.toHaveProperty('editedAt')
  })
})
