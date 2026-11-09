/**
 * @jest-environment node
 */
jest.mock('next/cache', () => ({
  unstable_cache: jest.fn((load: () => Promise<unknown>) => {
    // «Закэшированная» версия помечает результат, чтобы отличить её от прямого вызова
    return async () => ({ fromCache: true, value: await load() })
  }),
}))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/books', () => ({ fetchBooksWithCovers: jest.fn(async () => [{ id: 'b1' }]) }))
jest.mock('@/lib/intro', () => ({ getIntroData: jest.fn(async () => ({ header: null, sections: [] })) }))
jest.mock('@/lib/site-settings', () => ({ getSiteSetting: jest.fn(async () => true) }))
jest.mock('@/lib/collections/repo', () => ({ listPublishedCollections: jest.fn(async () => []) }))

import { unstable_cache } from 'next/cache'
import { getCachedHomeBooks, HOME_PUBLIC_REVALIDATE_SECONDS } from './home-public-data'
import { HOME_PUBLIC_TAG } from './home-public-tag'

// Регистрации снимаем при загрузке модуля: jest-конфиг очищает моки перед каждым тестом
const registrations = [...(unstable_cache as jest.Mock).mock.calls] as Array<[unknown, string[], { tags: string[]; revalidate: number }]>

describe('home-public-data', () => {
  const originalTestMode = process.env.NEXTAUTH_TEST_MODE

  afterEach(() => {
    if (originalTestMode === undefined) delete process.env.NEXTAUTH_TEST_MODE
    else process.env.NEXTAUTH_TEST_MODE = originalTestMode
  })

  it('каждая часть главной кэшируется отдельной записью с меткой главной и страховочным сроком', () => {
    const calls = registrations
    expect(calls).toHaveLength(6)
    expect(new Set(calls.map(([, keyParts]) => keyParts.join('/'))).size).toBe(6)
    for (const [, keyParts, options] of calls) {
      expect(keyParts[0]).toBe('home-public')
      expect(options.tags).toEqual([HOME_PUBLIC_TAG])
      expect(options.revalidate).toBe(HOME_PUBLIC_REVALIDATE_SECONDS)
    }
  })

  it('страховочный срок не короче часа — иначе боты снова будят базу', () => {
    expect(HOME_PUBLIC_REVALIDATE_SECONDS).toBeGreaterThanOrEqual(60 * 60)
  })

  it('вне тестового режима читает из кэша', async () => {
    delete process.env.NEXTAUTH_TEST_MODE
    await expect(getCachedHomeBooks()).resolves.toEqual({ fromCache: true, value: [{ id: 'b1' }] })
  })

  it('в тестовом режиме идёт в базу напрямую: E2E пишут в базу в обход приложения', async () => {
    process.env.NEXTAUTH_TEST_MODE = 'true'
    await expect(getCachedHomeBooks()).resolves.toEqual([{ id: 'b1' }])
  })
})
