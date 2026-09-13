export type CollectionErrorCode = 'not_found' | 'forbidden' | 'invalid_transition' | 'validation' | 'book_not_published' | 'migration_required'

export class CollectionError extends Error {
  constructor(public readonly code: CollectionErrorCode, public readonly details: Record<string, unknown> = {}) {
    super(code)
    this.name = 'CollectionError'
  }
}

/** Прод и e2e-ветка ещё без миграции 0066: таблицы нет. */
export function isMissingCollectionsSchemaError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : null
  return code === '42P01' || String((error as Error)?.message ?? '').includes('does not exist')
}
