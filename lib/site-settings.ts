import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { siteSettings } from '@/lib/db/schema'
import { isMissingCollectionsSchemaError } from '@/lib/collections/errors'

type DbLike = typeof db

export interface SiteSettingValues {
  collections_home_block_enabled: boolean
}

export type SiteSettingKey = keyof SiteSettingValues

export const SITE_SETTING_DEFAULTS: SiteSettingValues = {
  collections_home_block_enabled: false,
}

export function parseSiteSetting<K extends SiteSettingKey>(key: K, raw: unknown): SiteSettingValues[K] {
  const fallback = SITE_SETTING_DEFAULTS[key]
  return typeof raw === typeof fallback ? (raw as SiteSettingValues[K]) : fallback
}

export async function getSiteSetting<K extends SiteSettingKey>(key: K, client: DbLike = db): Promise<SiteSettingValues[K]> {
  try {
    const [row] = await client
      .select({ value: siteSettings.value })
      .from(siteSettings)
      .where(eq(siteSettings.id, key))
      .limit(1)
    return parseSiteSetting(key, row?.value)
  } catch (error) {
    if (isMissingCollectionsSchemaError(error)) return SITE_SETTING_DEFAULTS[key]
    throw error
  }
}

export async function setSiteSetting<K extends SiteSettingKey>(tx: DbLike, key: K, value: SiteSettingValues[K]): Promise<void> {
  const updatedAt = new Date()
  await tx
    .insert(siteSettings)
    .values({ id: key, value, updatedAt })
    .onConflictDoUpdate({ target: siteSettings.id, set: { value, updatedAt } })
}
