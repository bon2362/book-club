import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userActivityEvents, userIdentities, users } from '@/lib/db/schema'

export const IDENTITY_PROVIDERS = ['google', 'email', 'telegram'] as const

export type IdentityProvider = typeof IDENTITY_PROVIDERS[number]
export type RawIdentityProvider = IdentityProvider | 'resend' | 'google-one-tap' | 'telegram-preauth'
export type IdentityMetadataValue =
  | string
  | number
  | boolean
  | null
  | IdentityMetadataValue[]
  | { [key: string]: IdentityMetadataValue }
export type IdentityMetadata = Record<string, IdentityMetadataValue>

export interface IdentityProfile {
  userId?: string
  email?: string | null
  emailVerified?: boolean
  name?: string | null
  image?: string | null
  telegramUsername?: string | null
  isAdmin?: boolean
  metadata?: IdentityMetadata
  now?: Date
}

export interface ResolvedIdentityUser {
  id: string
  email: string | null
  contactEmail: string | null
  name: string | null
  image: string | null
  isNew: boolean
}

export class IdentityConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IdentityConflictError'
  }
}

type IdentityDb = Pick<typeof db, 'select' | 'insert' | 'update'>

async function withIdentityTransaction<T>(callback: (tx: IdentityDb) => Promise<T>): Promise<T> {
  return db.transaction(callback)
}

export function normalizeIdentityProvider(provider: RawIdentityProvider | string): IdentityProvider {
  if (provider === 'google' || provider === 'google-one-tap') return 'google'
  if (provider === 'email' || provider === 'resend') return 'email'
  if (provider === 'telegram' || provider === 'telegram-preauth') return 'telegram'
  throw new Error(`Unsupported identity provider: ${provider}`)
}

export function normalizeTelegramContact(rawContact?: string | null): string | null {
  const trimmed = rawContact?.trim()
  if (!trimmed) return null
  return trimmed.replace(/^@+/, '')
}

function normalizeEmail(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase()
  return normalized || null
}

function normalizeProviderAccountId(provider: IdentityProvider, providerAccountId: string): string {
  const trimmed = providerAccountId.trim()
  if (!trimmed) throw new Error('providerAccountId is required')
  return provider === 'email' ? trimmed.toLowerCase() : trimmed
}

function userContactEmail(provider: IdentityProvider, email: string | null): string | null {
  return provider === 'telegram' ? null : email
}

function telegramContact(profile: IdentityProfile): string | null {
  const username = normalizeTelegramContact(profile.telegramUsername)
  return username ? `@${username}` : null
}

function metadataToText(metadata?: IdentityMetadata): string | null {
  return metadata ? JSON.stringify(metadata) : null
}

function canLinkByEmail(provider: IdentityProvider, profile: IdentityProfile, email: string | null): email is string {
  if (!email) return false
  if (provider === 'email') return true
  if (provider === 'google') return profile.emailVerified !== false
  return false
}

async function findUserIdByEmail(tx: IdentityDb, email: string): Promise<string | null> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.contactEmail, email))
    .limit(1)
  if (rows[0]?.id) return rows[0].id

  const identityRows = await tx
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(eq(userIdentities.email, email))
    .limit(1)
  return identityRows[0]?.userId ?? null
}

async function findIdentityUserId(
  tx: IdentityDb,
  provider: IdentityProvider,
  providerAccountId: string
): Promise<string | null> {
  const rows = await tx
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(and(
      eq(userIdentities.provider, provider),
      eq(userIdentities.providerAccountId, providerAccountId)
    ))
    .limit(1)
  return rows[0]?.userId ?? null
}

async function selectResolvedUser(tx: IdentityDb, userId: string, isNew: boolean): Promise<ResolvedIdentityUser> {
  const rows = await tx
    .select({
      id: users.id,
      email: users.contactEmail,
      contactEmail: users.contactEmail,
      name: users.name,
      image: users.image,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const user = rows[0]
  if (!user) throw new Error(`User not found for identity: ${userId}`)
  return { ...user, isNew }
}

async function updateUserCache(
  tx: IdentityDb,
  userId: string,
  provider: IdentityProvider,
  profile: IdentityProfile,
  now: Date
): Promise<void> {
  const contactEmail = userContactEmail(provider, normalizeEmail(profile.email))
  const contact = provider === 'telegram' ? telegramContact(profile) : null
  await tx
    .update(users)
    .set({
      lastActivityAt: now,
      ...(contactEmail ? { contactEmail } : {}),
      ...(profile.name ? { name: profile.name } : {}),
      ...(profile.image ? { image: profile.image } : {}),
      ...(contact ? {
        contacts: sql`case when nullif(trim(${users.contacts}), '') is null then ${contact} else ${users.contacts} end`,
      } : {}),
      ...(profile.isAdmin !== undefined ? { isAdmin: profile.isAdmin } : {}),
    })
    .where(eq(users.id, userId))
}

async function bestEffortRecordUserCreated(
  tx: IdentityDb,
  userId: string,
  provider: IdentityProvider,
  now: Date
): Promise<void> {
  try {
    await tx
      .insert(userActivityEvents)
      .values({
        userId,
        type: 'user_created',
        occurredAt: now,
        source: 'auth',
        sourceId: provider,
        dedupeKey: `user_created:${userId}`,
        metadata: JSON.stringify({ provider }),
      })
      .onConflictDoNothing({ target: userActivityEvents.dedupeKey })
  } catch (error) {
    const errorName = error instanceof Error ? error.name : typeof error
    console.error('Failed to record user_created activity', { errorName })
  }
}

async function upsertIdentity(
  tx: IdentityDb,
  userId: string,
  provider: IdentityProvider,
  providerAccountId: string,
  profile: IdentityProfile,
  now: Date
): Promise<string> {
  const rows = await tx
    .insert(userIdentities)
    .values({
      userId,
      provider,
      providerAccountId,
      email: normalizeEmail(profile.email),
      telegramUsername: normalizeTelegramContact(profile.telegramUsername),
      lastSeenAt: now,
      metadata: metadataToText(profile.metadata),
    })
    .onConflictDoUpdate({
      target: [userIdentities.provider, userIdentities.providerAccountId],
      set: {
        email: normalizeEmail(profile.email),
        telegramUsername: normalizeTelegramContact(profile.telegramUsername),
        lastSeenAt: now,
        metadata: metadataToText(profile.metadata),
      },
    })
    .returning({ userId: userIdentities.userId })
  return rows[0]?.userId ?? userId
}

export async function linkIdentityToUser(
  userId: string,
  provider: RawIdentityProvider | string,
  providerAccountId: string,
  profile: IdentityProfile = {}
): Promise<ResolvedIdentityUser> {
  return withIdentityTransaction(async (tx) => {
    const normalizedProvider = normalizeIdentityProvider(provider)
    const normalizedProviderAccountId = normalizeProviderAccountId(normalizedProvider, providerAccountId)
    const now = profile.now ?? new Date()
    const existingIdentityUserId = await findIdentityUserId(tx, normalizedProvider, normalizedProviderAccountId)
    if (existingIdentityUserId && existingIdentityUserId !== userId) {
      throw new IdentityConflictError(`Identity ${normalizedProvider}:${normalizedProviderAccountId} is already linked to another user`)
    }
    const identityUserId = await upsertIdentity(tx, userId, normalizedProvider, normalizedProviderAccountId, profile, now)
    await updateUserCache(tx, identityUserId, normalizedProvider, profile, now)
    return selectResolvedUser(tx, identityUserId, false)
  })
}

export async function resolveOrCreateUserFromIdentity(
  provider: RawIdentityProvider | string,
  providerAccountId: string,
  profile: IdentityProfile = {}
): Promise<ResolvedIdentityUser> {
  return withIdentityTransaction(async (tx) => {
    const normalizedProvider = normalizeIdentityProvider(provider)
    const normalizedProviderAccountId = normalizeProviderAccountId(normalizedProvider, providerAccountId)
    const now = profile.now ?? new Date()
    const email = normalizeEmail(profile.email)

    const existingIdentityUserId = await findIdentityUserId(tx, normalizedProvider, normalizedProviderAccountId)

    if (existingIdentityUserId) {
      const userId = existingIdentityUserId
      await upsertIdentity(tx, userId, normalizedProvider, normalizedProviderAccountId, profile, now)
      await updateUserCache(tx, userId, normalizedProvider, profile, now)
      return selectResolvedUser(tx, userId, false)
    }

    const linkedByEmailUserId = canLinkByEmail(normalizedProvider, profile, email)
      ? await findUserIdByEmail(tx, email)
      : null
    const userId = profile.userId ?? linkedByEmailUserId ?? crypto.randomUUID()
    const isNew = !profile.userId && !linkedByEmailUserId

    if (isNew) {
      const contact = normalizedProvider === 'telegram' ? telegramContact(profile) : null
      await tx.insert(users).values({
        id: userId,
        contactEmail: userContactEmail(normalizedProvider, email),
        name: profile.name ?? email ?? normalizeTelegramContact(profile.telegramUsername) ?? normalizedProviderAccountId,
        emailVerified: email && normalizedProvider !== 'telegram' ? now : null,
        image: profile.image ?? null,
        ...(contact ? { contacts: contact } : {}),
        lastActivityAt: now,
        isAdmin: profile.isAdmin ?? false,
      })
      await bestEffortRecordUserCreated(tx, userId, normalizedProvider, now)
    } else {
      await updateUserCache(tx, userId, normalizedProvider, profile, now)
    }

    const identityUserId = await upsertIdentity(tx, userId, normalizedProvider, normalizedProviderAccountId, profile, now)
    return selectResolvedUser(tx, identityUserId, isNew && identityUserId === userId)
  })
}
