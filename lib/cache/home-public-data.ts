import { unstable_cache } from 'next/cache'
import { inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { matchingSessions, tagDescriptions } from '@/lib/db/schema'
import { fetchBooksWithCovers } from '@/lib/books'
import { getIntroData } from '@/lib/intro'
import { MATCHING_OPEN_DB_STATUSES } from '@/lib/matching/session-status'
import { getSiteSetting } from '@/lib/site-settings'
import { listPublishedCollections } from '@/lib/collections/repo'
import { HOME_PUBLIC_TAG } from './home-public-tag'

/**
 * Кэш общих данных главной. Цель — чтобы анонимный заход (в основном боты)
 * не будил Neon. Сброс — по метке HOME_PUBLIC_TAG после любой мутации
 * (см. withAuditContext); срок ниже — только страховка на случай мутации
 * мимо обёртки аудита (например, через параметр dbClient = db по умолчанию).
 *
 * Каждая часть кэшируется отдельной записью: у Vercel Data Cache лимит 2 МБ
 * на запись, каталог — самая крупная часть. Ошибки не кэшируются
 * (unstable_cache сохраняет только успешный результат), поэтому fallback'и
 * делает вызывающий код через .catch.
 *
 * В тестовом режиме (NEXTAUTH_TEST_MODE=true) кэш выключен: E2E пишут
 * в базу напрямую SQL-запросами в обход приложения, и закэшированная главная
 * показывала бы им устаревшие данные. Подробности: docs/features/home-cache.md.
 */
export const HOME_PUBLIC_REVALIDATE_SECONDS = 60 * 60

function homeCached<T>(key: string, load: () => Promise<T>): () => Promise<T> {
  const cached = unstable_cache(load, ['home-public', key], {
    tags: [HOME_PUBLIC_TAG],
    revalidate: HOME_PUBLIC_REVALIDATE_SECONDS,
  })
  return () => (process.env.NEXTAUTH_TEST_MODE === 'true' ? load() : cached())
}

export const getCachedHomeBooks = homeCached('books', () => fetchBooksWithCovers())

export const getCachedTagDescriptions = homeCached('tag-descriptions', async (): Promise<Record<string, string>> => {
  const rows = await db
    .select({ tag: tagDescriptions.tag, description: tagDescriptions.description })
    .from(tagDescriptions)
  return Object.fromEntries(rows.map((row) => [row.tag, row.description]))
})

export const getCachedPublishedIntro = homeCached('intro', () => getIntroData({ onlyPublished: true }))

export const getCachedOpenMatchingSessionId = homeCached('open-matching-session', async (): Promise<string | null> => {
  const [row] = await db
    .select({ id: matchingSessions.id })
    .from(matchingSessions)
    .where(inArray(matchingSessions.status, [...MATCHING_OPEN_DB_STATUSES]))
    .limit(1)
  return row?.id ?? null
})

export const getCachedHomeCollectionsEnabled = homeCached(
  'collections-home-block-enabled',
  () => getSiteSetting('collections_home_block_enabled'),
)

export const getCachedPublishedCollections = homeCached('published-collections', () => listPublishedCollections())
