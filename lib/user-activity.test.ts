/**
 * @jest-environment node
 */
jest.mock('@/lib/db', () => ({
  db: {
    insert: jest.fn(),
    update: jest.fn(),
  },
}))

import { db } from '@/lib/db'
import { bestEffortRecordUserActivity, buildUserActivityDedupeKey, recordUserActivity } from './user-activity'

describe('user activity helper', () => {
  function mockDbChains() {
    const insertChain = {
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 'event-1' }]),
    }
    const updateChain = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined),
    }
    ;(db.insert as jest.Mock).mockReturnValue(insertChain)
    ;(db.update as jest.Mock).mockReturnValue(updateChain)
    return { insertChain, updateChain }
  }

  it('пишет событие с source/sourceId/dedupeKey/metadata', async () => {
    const { insertChain } = mockDbChains()
    const occurredAt = new Date('2026-05-19T10:00:00Z')

    await recordUserActivity('user-1', 'books_selected', {
      occurredAt,
      source: 'api',
      sourceId: 'signup:user-1',
      dedupeKey: 'api:books_selected:user-1',
      metadata: { selectedBooksCount: 2, books: ['A', 'B'] },
    })

    expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      type: 'books_selected',
      occurredAt,
      source: 'api',
      sourceId: 'signup:user-1',
      dedupeKey: 'api:books_selected:user-1',
      metadata: JSON.stringify({ selectedBooksCount: 2, books: ['A', 'B'] }),
    }))
    expect(insertChain.onConflictDoNothing).toHaveBeenCalled()
    expect(insertChain.returning).toHaveBeenCalled()
  })

  it('обновляет last_activity_at через SQL max-семантику после записи события', async () => {
    const { updateChain } = mockDbChains()
    const olderEvent = new Date('2026-01-01T00:00:00Z')

    await recordUserActivity('user-1', 'sheets_import', { occurredAt: olderEvent, source: 'backfill' })

    expect(db.update).toHaveBeenCalled()
    expect(updateChain.set).toHaveBeenCalledWith({
      lastActivityAt: expect.objectContaining({ queryChunks: expect.any(Array) }),
    })
  })

  it('строит стабильный sha256 dedupe key из частей', () => {
    expect(buildUserActivityDedupeKey(['api', 'profile_updated', 'user-1', true]))
      .toBe(buildUserActivityDedupeKey(['api', 'profile_updated', 'user-1', true]))
    expect(buildUserActivityDedupeKey(['api', 'profile_updated', 'user-1', true])).toHaveLength(64)
  })

  it('не обновляет cache, если duplicate dedupeKey пропустил insert', async () => {
    const { insertChain } = mockDbChains()
    insertChain.returning.mockResolvedValue([])

    await recordUserActivity('user-1', 'sign_in', {
      source: 'auth',
      dedupeKey: 'duplicate-key',
    })

    expect(insertChain.returning).toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })

  it('best-effort wrapper логирует и не пробрасывает ошибку activity logging', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const insertChain = {
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockReturnThis(),
      returning: jest.fn().mockRejectedValue(new Error('activity db down')),
    }
    ;(db.insert as jest.Mock).mockReturnValue(insertChain)

    await expect(bestEffortRecordUserActivity('user-1', 'feedback_created', {
      source: 'api',
      dedupeKey: 'feedback-key',
    })).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledWith('Failed to record user activity:', expect.any(Error))
    errorSpy.mockRestore()
  })

  it('тихо игнорирует FK violation (юзер удалён в гонке) — без логов и без cache update', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const fkError = Object.assign(new Error('foreign key violation'), { code: '23503' })
    const insertChain = {
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockReturnThis(),
      returning: jest.fn().mockRejectedValue(fkError),
    }
    ;(db.insert as jest.Mock).mockReturnValue(insertChain)

    await expect(recordUserActivity('user-1', 'sign_in', { source: 'auth' })).resolves.toBeUndefined()

    expect(db.update).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('распаковывает FK violation из обёртки err.cause (drizzle wrap)', async () => {
    const cause = Object.assign(new Error('inner'), { code: '23503' })
    const wrapper = Object.assign(new Error('wrapped'), { cause })
    const insertChain = {
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockReturnThis(),
      returning: jest.fn().mockRejectedValue(wrapper),
    }
    ;(db.insert as jest.Mock).mockReturnValue(insertChain)

    await expect(recordUserActivity('user-1', 'sign_in')).resolves.toBeUndefined()
    expect(db.update).not.toHaveBeenCalled()
  })

  it('пробрасывает все НЕ-FK ошибки (например db down)', async () => {
    const insertChain = {
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockReturnThis(),
      returning: jest.fn().mockRejectedValue(new Error('connection refused')),
    }
    ;(db.insert as jest.Mock).mockReturnValue(insertChain)

    await expect(recordUserActivity('user-1', 'sign_in')).rejects.toThrow('connection refused')
  })
})
