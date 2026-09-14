/**
 * @jest-environment node
 */
jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('drizzle-orm', () => jest.requireActual('@/lib/matching/test-support/fake-drizzle-tx').fakeDrizzleOrm())
jest.mock('@/lib/db/schema', () => jest.requireActual('@/lib/matching/test-support/fake-drizzle-tx').fakeSchema())

import { applyBookMatchingAction } from '../book-transition-db'
import { createFakeTx, type FakeRows, type FakeTxOptions } from '../test-support/fake-drizzle-tx'

// Запреты книжного подбора до этого теста проверялись только ночным интеграционным E2E:
// снятая проверка доезжала до прода. Каждый отказ сверяет код ошибки и то, что до отказа
// в базу ничего не записано; рядом стоит разрешённый случай, чтобы подделка не была пустой.
type BookAction = Parameters<typeof applyBookMatchingAction>[0]['action']

const actor = { userId: 'admin-1', label: 'Админ', source: 'matching' }
const inShortlist: FakeRows = { signupBooks: [[{ personalStatus: null }]] }

function run(action: BookAction, rows: FakeRows = {}, options: Omit<FakeTxOptions, 'rows'> = {}) {
  const tx = createFakeTx({ ...options, rows })
  const result = applyBookMatchingAction({ tx: tx as never, sessionId: 'session-1', action, actor, nextStateVersion: 5 })
  return { tx, result }
}

describe('условный выбор (set_conditional)', () => {
  const action: BookAction = { type: 'set_conditional', userId: 'user-1', bookId: 'book-1' }

  it.each([
    ['книги нет в списке участника', { signupBooks: [[]] }, 'book_not_in_shortlist'],
    ['книга уже в статусе «читаю»', { signupBooks: [[{ personalStatus: 'reading' }]] }, 'book_not_in_shortlist'],
    ['круг по книге уже собран', { ...inShortlist, matchingSessionBookStates: [[{ bookId: 'book-1' }]] }, 'book_action_forbidden'],
    ['участник уже назначен на эту книгу', { ...inShortlist, matchingBookAssignments: [[{ userId: 'user-1' }]] }, 'book_action_forbidden'],
    ['у участника уже стоит твёрдый выбор', { ...inShortlist, matchingBookIntents: [[{ userId: 'user-1' }]] }, 'book_action_forbidden'],
  ])('отказывает, когда %s, и ничего не записывает', async (_label, rows, code) => {
    const { tx, result } = run(action, rows)

    await expect(result).rejects.toMatchObject({ code })
    expect(tx.writes).toEqual([])
  })

  it('записывает условный выбор, когда ничто не мешает', async () => {
    const { tx, result } = run(action, inShortlist)

    await expect(result).resolves.toMatchObject({ changed: true })
    expect(tx.writes).toEqual([
      { op: 'insert', table: 'matchingBookIntents', values: expect.objectContaining({ bookId: 'book-1', kind: 'conditional' }) },
    ])
  })
})

describe('твёрдый выбор (set_hard)', () => {
  const action: BookAction = { type: 'set_hard', userId: 'user-1', bookId: 'book-1' }

  it('отказывает книге не из списка участника', async () => {
    const { tx, result } = run(action, { signupBooks: [[]] })

    await expect(result).rejects.toMatchObject({ code: 'book_not_in_shortlist' })
    expect(tx.writes).toEqual([])
  })

  it('не трогает участника, уже назначенного на эту книгу', async () => {
    const { tx, result } = run(action, { ...inShortlist, matchingBookAssignments: [[{ userId: 'user-1' }]] })

    await expect(result).rejects.toMatchObject({ code: 'participant_locked' })
    expect(tx.writes).toEqual([])
  })

  it('ничего не меняет, если такой твёрдый выбор уже стоит', async () => {
    const { tx, result } = run(action, { ...inShortlist, matchingBookIntents: [[{ bookId: 'book-1' }]] })

    await expect(result).resolves.toBe(false)
    expect(tx.writes).toEqual([])
  })

  it('до сбора круга ставит твёрдый выбор и снимает прочие условные', async () => {
    const { tx, result } = run(action, inShortlist)

    await expect(result).resolves.toMatchObject({ changed: true })
    expect(tx.writes).toEqual([
      { op: 'delete', table: 'matchingBookIntents' },
      { op: 'insert', table: 'matchingBookIntents', values: expect.objectContaining({ bookId: 'book-1', kind: 'hard' }) },
    ])
  })

  it('в уже собранный круг назначает участника сразу', async () => {
    const { tx, result } = run(action, { ...inShortlist, matchingSessionBookStates: [[{ bookId: 'book-1' }]] })

    await expect(result).resolves.toMatchObject({ changed: true })
    expect(tx.writes).toContainEqual({
      op: 'insert', table: 'matchingBookAssignments', values: expect.objectContaining({ bookId: 'book-1', source: 'hard' }),
    })
  })
})

describe('жизненный цикл и действия администратора', () => {
  it('второй открытый подбор (нарушение уникального индекса) отклоняется как запрещённое действие', async () => {
    const duplicate = Object.assign(new Error('duplicate key value'), { code: '23505' })
    const { result } = run({ type: 'reopen_session' }, {}, { failOnUpdate: { matchingSessions: duplicate } })

    await expect(result).rejects.toMatchObject({ code: 'book_action_forbidden' })
  })

  it('прочие ошибки базы при повторном открытии не маскируются', async () => {
    const outage = new Error('connection lost')
    const { result } = run({ type: 'reopen_session' }, {}, { failOnUpdate: { matchingSessions: outage } })

    await expect(result).rejects.toBe(outage)
  })

  it.each([
    ['участник не назначен на книгу', { matchingBookAssignments: [[]] }],
    ['круг относится к другой книге', { matchingBookAssignments: [[{ bookId: 'book-1' }]], matchingCircles: [[{ bookId: 'book-2' }]] }],
  ])('не переносит участника в круг, когда %s', async (_label, rows) => {
    const { tx, result } = run(
      { type: 'admin_place_book_assignment', userId: 'user-1', bookId: 'book-1', circleId: 'circle-1' },
      rows,
    )

    await expect(result).rejects.toMatchObject({ code: 'invalid_book_action' })
    expect(tx.writes).toEqual([])
  })

  // Отправка круга читать включает отметку app.matching_release_circle, которая снимает
  // защиту базы от статуса «читаю» на назначенной книге. Без проверенного круга её ставить нельзя.
  it.each([
    ['круга нет', {}],
    ['в круге никого нет', { matchingCircles: [[{ id: 'circle-1', bookId: 'book-1' }]] }],
  ])('не отправляет круг читать, когда %s', async (_label, rows) => {
    const { tx, result } = run({ type: 'admin_release_circle', circleId: 'circle-1' }, rows)

    await expect(result).rejects.toMatchObject({ code: 'invalid_book_action' })
    expect(tx.executed).toEqual([])
    expect(tx.writes).toEqual([])
  })

  it('не возвращает в подбор того, кто не участвует в сессии', async () => {
    const { tx, result } = run({ type: 'admin_return_participant', userId: 'user-1' }, { matchingSessionParticipants: [[]] })

    await expect(result).rejects.toMatchObject({ code: 'invalid_book_action' })
    expect(tx.writes).toEqual([])
  })
})
