import { sql } from 'drizzle-orm'
import type { db } from '@/lib/db'

type TransactionClient = Pick<typeof db, 'execute'>

/** Enables legacy matching cascade cleanup for the current trusted transaction only. */
export async function enableMatchingLegacyCleanup(tx: TransactionClient): Promise<void> {
  await tx.execute(sql`select set_config('app.matching_legacy_cleanup', 'on', true)`)
}
