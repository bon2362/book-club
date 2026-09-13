import { isMissingRelationError } from '@/lib/db/errors'

export type CollectionErrorCode = 'not_found' | 'forbidden' | 'invalid_transition' | 'validation' | 'book_not_published' | 'migration_required'

export class CollectionError extends Error {
  constructor(public readonly code: CollectionErrorCode, public readonly details: Record<string, unknown> = {}) {
    super(code)
    this.name = 'CollectionError'
  }
}

/** Прод и e2e-ветка ещё без миграции 0066: таблицы нет. */
export const isMissingCollectionsSchemaError = isMissingRelationError
