const MAX_CAUSE_DEPTH = 5

/**
 * Таблицы или колонки ещё нет: деплой приложения опередил ручную миграцию.
 *
 * drizzle-orm оборачивает ошибку Postgres в DrizzleQueryError («Failed query: …»),
 * а исходный код 42P01 и текст «does not exist» остаются только в `cause` —
 * поэтому смотрим всю цепочку причин, а не один верхний уровень.
 */
export function isMissingRelationError(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth++) {
    if (typeof current !== 'object' || current === null) return false
    const { code, message, cause } = current as { code?: unknown; message?: unknown; cause?: unknown }
    if (code === '42P01') return true
    if (typeof message === 'string' && message.includes('does not exist')) return true
    if (cause === current) return false
    current = cause
  }
  return false
}
