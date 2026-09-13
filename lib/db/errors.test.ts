/**
 * @jest-environment node
 */
import { DrizzleQueryError } from 'drizzle-orm'
import { isMissingRelationError } from '@/lib/db/errors'
import { isMissingCollectionsSchemaError } from '@/lib/collections/errors'
import { isMissingCalendarSchemaError } from '@/lib/calendar/public-state'

jest.mock('@/lib/db', () => ({ db: {} }))

function pgError(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}

// Так ошибку отдаёт установленный drizzle-orm: код Postgres только в cause,
// а в тексте верхнего уровня — «Failed query: …» без «does not exist».
function drizzleWrapped(cause: unknown) {
  return new DrizzleQueryError('select "id" from "book_collections"', [], cause as Error)
}

describe('isMissingRelationError', () => {
  it('узнаёт прямую ошибку Postgres 42P01', () => {
    expect(isMissingRelationError(pgError('42P01', 'relation "book_collections" does not exist'))).toBe(true)
  })

  it('узнаёт 42P01 внутри DrizzleQueryError', () => {
    const error = drizzleWrapped(pgError('42P01', 'relation "book_collections" does not exist'))
    expect(error.message).not.toContain('does not exist')
    expect(isMissingRelationError(error)).toBe(true)
  })

  it('узнаёт «does not exist» во вложенной причине без кода', () => {
    expect(isMissingRelationError(drizzleWrapped(new Error('column "timezone" does not exist')))).toBe(true)
  })

  it('не срабатывает на других ошибках базы', () => {
    expect(isMissingRelationError(drizzleWrapped(pgError('23505', 'duplicate key value violates unique constraint')))).toBe(false)
    expect(isMissingRelationError(new Error('boom'))).toBe(false)
  })

  it('не падает на не-объектах и циклических причинах', () => {
    expect(isMissingRelationError(null)).toBe(false)
    expect(isMissingRelationError('42P01')).toBe(false)
    const looped: { message: string; cause?: unknown } = { message: 'loop' }
    looped.cause = looped
    expect(isMissingRelationError(looped)).toBe(false)
  })
})

describe('проверки разделов используют общую функцию', () => {
  const wrapped = drizzleWrapped(pgError('42P01', 'relation "x" does not exist'))

  it('подборки', () => {
    expect(isMissingCollectionsSchemaError(wrapped)).toBe(true)
  })

  it('календарь', () => {
    expect(isMissingCalendarSchemaError(wrapped)).toBe(true)
  })
})
