/**
 * @jest-environment node
 */
jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('drizzle-orm', () => jest.requireActual('@/lib/matching/test-support/fake-drizzle-tx').fakeDrizzleOrm())
jest.mock('@/lib/db/schema', () => jest.requireActual('@/lib/matching/test-support/fake-drizzle-tx').fakeSchema())
jest.mock('@/lib/audit/with-audit-context', () => ({ withAuditContext: jest.fn() }))
jest.mock('@/lib/matching-analytics', () => ({ reportMatchingEvents: jest.fn() }))
jest.mock('@/lib/signup-books', () => ({ upsertSignupByBookIds: jest.fn() }))
jest.mock('@/lib/matching/session-transition', () => ({
  ...jest.requireActual('@/lib/matching/session-transition'),
  executeMatchingTransition: jest.fn(),
}))

import { withAuditContext } from '@/lib/audit/with-audit-context'
import { upsertSignupByBookIds } from '@/lib/signup-books'
import {
  executeMatchingTransition,
  type MatchingAction,
  type MatchingTransitionStore,
} from '@/lib/matching/session-transition'
import { runMatchingTransition } from '../session-transition-db'
import { createFakeTx, type FakeRows } from '../test-support/fake-drizzle-tx'

// Блокировки каталога на время подбора живут в хранилище транзакции (applyAction):
// назначенную или твёрдо выбранную книгу нельзя убрать из списка или отметить «читаю».
// executeMatchingTransition подменён и сразу зовёт applyAction — блокировку сессии и
// проверку версии покрывает session-transition.test.ts.
const withAuditMock = withAuditContext as jest.Mock
const executeMock = executeMatchingTransition as jest.Mock
const upsertMock = upsertSignupByBookIds as jest.Mock
const actor = { userId: 'user-1', label: 'Аня', source: 'catalog' }

function apply(action: MatchingAction, rows: FakeRows, sessionStatus = 'open') {
  const tx = createFakeTx({ rows })
  withAuditMock.mockImplementation((_ctx: unknown, callback: (client: unknown) => unknown) => callback(tx))
  executeMock.mockImplementation(async (input: { sessionId: string; action: MatchingAction }, store: MatchingTransitionStore) => ({
    changed: Boolean(await store.applyAction(input.sessionId, input.action, 2, { sessionStatus })),
    stateVersion: 2,
  }))
  return { tx, result: runMatchingTransition({ sessionId: 'session-1', actor, action }) }
}

beforeEach(() => {
  upsertMock.mockResolvedValue({ isNew: false, addedBooks: [], addedBookIds: ['book-1'], newlyAddedBookIds: [], removedBookIds: [] })
})

describe('удаление книги из списка (change_book)', () => {
  const removeBook: MatchingAction = { type: 'change_book', userId: 'user-1', bookId: 'book-2', operation: 'remove' }

  it.each([
    ['участник назначен на эту книгу', { matchingBookAssignments: [[{ userId: 'user-1' }]] }, 'participant_locked'],
    ['на книге твёрдый выбор участника', { matchingBookIntents: [[{ kind: 'hard' }]] }, 'book_action_forbidden'],
  ])('отказывает, когда %s, и книга остаётся в списке', async (_label, rows, code) => {
    const { tx, result } = apply(removeBook, rows)

    await expect(result).rejects.toMatchObject({ code })
    expect(tx.writes).toEqual([])
  })

  it('снимает условный выбор вместе с книгой', async () => {
    const { tx, result } = apply(removeBook, { matchingBookIntents: [[{ kind: 'conditional' }]] })

    await expect(result).resolves.toEqual({ changed: true, stateVersion: 2 })
    expect(tx.writes).toEqual(expect.arrayContaining([
      { op: 'delete', table: 'matchingBookIntents' },
      { op: 'delete', table: 'signupBooks' },
    ]))
  })

  it('в закрытой сессии не блокирует удаление назначенной книги', async () => {
    const { tx, result } = apply(removeBook, { matchingBookAssignments: [[{ userId: 'user-1' }]] }, 'closed')

    await expect(result).resolves.toEqual({ changed: true, stateVersion: 2 })
    expect(tx.writes).toContainEqual({ op: 'delete', table: 'signupBooks' })
  })
})

describe('отметка «читаю» или «прочитал» (change_status)', () => {
  it.each([
    ['reading' as const, 'участник назначен на эту книгу', { matchingBookAssignments: [[{ userId: 'user-1' }]] }, 'participant_locked'],
    ['read' as const, 'на книге твёрдый выбор участника', { matchingBookIntents: [[{ kind: 'hard' }]] }, 'book_action_forbidden'],
  ])('статус %s отклоняется, когда %s, и не записывается', async (status, _label, rows, code) => {
    const { tx, result } = apply(
      { type: 'change_status', userId: 'user-1', bookId: 'book-2', status },
      { signupBooks: [[{ personalStatus: null }]], ...rows },
    )

    await expect(result).rejects.toMatchObject({ code })
    expect(tx.writes).toEqual([])
  })

  it('возврат книги в подбор не блокируется назначением', async () => {
    const { tx, result } = apply(
      { type: 'change_status', userId: 'user-1', bookId: 'book-2', status: null },
      { signupBooks: [[{ personalStatus: 'reading' }]], matchingBookAssignments: [[{ userId: 'user-1' }]] },
    )

    await expect(result).resolves.toEqual({ changed: true, stateVersion: 2 })
    expect(tx.writes).toContainEqual({ op: 'update', table: 'signupBooks', values: expect.objectContaining({ personalStatus: null }) })
  })

  it('в закрытой сессии назначенную книгу можно отметить прочитанной', async () => {
    const { tx, result } = apply(
      { type: 'change_status', userId: 'user-1', bookId: 'book-2', status: 'read' },
      { signupBooks: [[{ personalStatus: null }]], matchingBookAssignments: [[{ userId: 'user-1' }]] },
      'closed',
    )

    await expect(result).resolves.toEqual({ changed: true, stateVersion: 2 })
    expect(tx.writes).toContainEqual({ op: 'update', table: 'signupBooks', values: expect.objectContaining({ personalStatus: 'read' }) })
  })
})

describe('пересохранение профиля со списком книг (replace_signup)', () => {
  const currentList: FakeRows = { signupBooks: [[{ bookId: 'book-1' }, { bookId: 'book-2' }]] }
  const replaceWith = (bookIds: string[]): MatchingAction => ({
    type: 'replace_signup', userId: 'user-1', name: 'Аня', contacts: '@anya', bookIds,
  })

  it.each([
    ['участник назначен на убираемую книгу', { matchingBookAssignments: [[{ bookId: 'book-2' }]] }, 'participant_locked'],
    ['на убираемой книге твёрдый выбор', { matchingBookIntents: [[{ bookId: 'book-2' }]] }, 'book_action_forbidden'],
  ])('отказывает, когда %s, и не трогает список', async (_label, rows, code) => {
    const { tx, result } = apply(replaceWith(['book-1']), { ...currentList, ...rows })

    await expect(result).rejects.toMatchObject({ code })
    expect(upsertMock).not.toHaveBeenCalled()
    expect(tx.writes).toEqual([])
  })

  it('снимает условные выборы с убираемых книг и сохраняет список', async () => {
    upsertMock.mockResolvedValueOnce({ isNew: false, addedBooks: [], addedBookIds: ['book-1'], newlyAddedBookIds: [], removedBookIds: ['book-2'] })
    const { tx, result } = apply(replaceWith(['book-1']), currentList)

    await expect(result).resolves.toEqual({ changed: true, stateVersion: 2 })
    expect(tx.writes).toEqual([{ op: 'delete', table: 'matchingBookIntents' }])
    expect(upsertMock).toHaveBeenCalledWith('user-1', ['book-1'], tx)
  })

  it('не блокирует сохранение, если назначенная книга остаётся в списке', async () => {
    const { tx, result } = apply(
      replaceWith(['book-1', 'book-2']),
      { ...currentList, matchingBookAssignments: [[{ bookId: 'book-2' }]] },
    )

    await expect(result).resolves.toEqual({ changed: false, stateVersion: 2 })
    expect(upsertMock).toHaveBeenCalledWith('user-1', ['book-1', 'book-2'], tx)
    expect(tx.writes).toEqual([])
  })
})
