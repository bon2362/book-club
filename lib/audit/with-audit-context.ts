import { sql } from 'drizzle-orm'
import { db as defaultDb } from '@/lib/db'
import { invalidateHomePublicCache } from '@/lib/cache/home-public-tag'

export interface AuditContext {
  actorUserId?: string | null
  actorLabel?: string | null
  source: string
  reason?: string | null
}

type DbLike = typeof defaultDb

/**
 * Открывает транзакцию, проставляет transaction-local настройки app.audit_*,
 * затем выполняет тело. Триггер audit_capture() читает их и проставляет
 * actor/source/reason в audit_log. Использовать на КАЖДОМ мутирующем роуте.
 * set_config(name, value, true) — параметризуемый аналог SET LOCAL.
 */
export async function withAuditContext<T>(
  ctx: AuditContext,
  fn: (tx: DbLike) => Promise<T>,
  db: DbLike = defaultDb,
): Promise<T> {
  const result = await (db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.audit_actor', ${ctx.actorUserId ?? ''}, true)`)
    await tx.execute(sql`select set_config('app.audit_label', ${ctx.actorLabel ?? ''}, true)`)
    await tx.execute(sql`select set_config('app.audit_source', ${ctx.source}, true)`)
    await tx.execute(sql`select set_config('app.audit_reason', ${ctx.reason ?? ''}, true)`)
    return fn(tx as unknown as DbLike)
  }) as Promise<T>)
  // Любая успешная мутация может менять то, что видно на главной (каталог,
  // счётчики записей, интро, подборки). Сбрасываем кэш здесь, в одном месте,
  // а не в каждом из десятков роутов. После отката транзакции сюда не доходим.
  invalidateHomePublicCache()
  return result
}
