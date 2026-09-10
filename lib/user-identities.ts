import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userActivityEvents, userIdentities, users } from '@/lib/db/schema'
import {
  applyLoginPersonProperties,
  trackAuthSucceeded,
  trackIdentityConflict,
  type AuthLinkedBy,
  type LoginPersonProperties,
} from '@/lib/auth-analytics'

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
  /** Аккаунт, за которым уже закреплена identity. Нужен для события identity_conflict. */
  readonly existingUserId: string | null

  constructor(message: string, existingUserId: string | null = null) {
    super(message)
    this.name = 'IdentityConflictError'
    this.existingUserId = existingUserId
  }
}

type IdentityDb = Pick<typeof db, 'select' | 'insert' | 'update'>

async function withIdentityTransaction<T>(
  callback: (tx: IdentityDb) => Promise<T>,
  client: IdentityDb = db
): Promise<T> {
  if (client === db) {
    return db.transaction((tx) => callback(tx as IdentityDb))
  }
  return callback(client)
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

/**
 * Reads the data needed for PostHog person properties on a successful login.
 * Deliberately excludes email (see `LoginPersonProperties` / privacy note in
 * lib/auth-analytics.ts) — only name, telegram username, connected providers,
 * account age and admin flag are collected.
 */
async function fetchLoginPersonProperties(tx: IdentityDb, userId: string): Promise<LoginPersonProperties> {
  const [userRow] = await tx
    .select({ name: users.name, createdAt: users.createdAt, isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const identityRows = await tx
    .select({ provider: userIdentities.provider, telegramUsername: userIdentities.telegramUsername })
    .from(userIdentities)
    .where(eq(userIdentities.userId, userId))

  const providers = Array.from(new Set(identityRows.map((row) => row.provider)))
  const telegramUsername = identityRows.find((row) => row.telegramUsername)?.telegramUsername ?? null

  return {
    name: userRow?.name ?? null,
    telegramUsername,
    providers,
    createdAt: userRow?.createdAt ?? null,
    isAdmin: userRow?.isAdmin ?? false,
  }
}

/**
 * Common tail of a successful `resolveOrCreateUserFromIdentity` resolution:
 * reads the resolved user row, reports `auth_succeeded` + person properties
 * to PostHog (best-effort, never throws), and returns the resolved user.
 */
interface PendingLoginAnalytics {
  userId: string
  provider: IdentityProvider
  isNew: boolean
  linkedBy: AuthLinkedBy
  person: LoginPersonProperties | null
}

async function finalizeLoginSuccess(
  tx: IdentityDb,
  userId: string,
  provider: IdentityProvider,
  isNew: boolean,
  linkedBy: AuthLinkedBy,
): Promise<{ user: ResolvedIdentityUser; analytics: PendingLoginAnalytics }> {
  const user = await selectResolvedUser(tx, userId, isNew)
  let person: LoginPersonProperties | null = null
  try {
    person = await fetchLoginPersonProperties(tx, userId)
  } catch (error) {
    console.error('Failed to load login person properties for PostHog', error)
  }
  return { user, analytics: { userId, provider, isNew, linkedBy, person } }
}

/**
 * Отправка событий входа в PostHog. Вызывается ТОЛЬКО после коммита
 * транзакции: обращение к сети внутри открытой транзакции Postgres держало бы
 * её на всё время HTTP-запроса. Best-effort — вход не должен зависеть от аналитики.
 */
async function reportLoginSuccess(analytics: PendingLoginAnalytics): Promise<void> {
  const { userId, provider, isNew, linkedBy, person } = analytics
  await trackAuthSucceeded(userId, provider, isNew, linkedBy)
  if (person) await applyLoginPersonProperties(userId, person)
}

/**
 * Свойства персоны для PostHog вне контекста логин-транзакции. Нужны пути входа
 * через адаптер NextAuth (Google, ссылка из письма): там пользователь уже создан
 * адаптером, а событие входа и свойства отправляет колбэк signIn.
 *
 * PRIVACY: email не читается и не возвращается — см. `LoginPersonProperties`.
 */
export async function loadLoginPersonProperties(userId: string): Promise<LoginPersonProperties> {
  return fetchLoginPersonProperties(db, userId)
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

async function insertIdentityIfMissing(
  tx: IdentityDb,
  userId: string,
  provider: IdentityProvider,
  providerAccountId: string,
  profile: IdentityProfile,
  now: Date
): Promise<string | null> {
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
    .onConflictDoNothing({
      target: [userIdentities.provider, userIdentities.providerAccountId],
    })
    .returning({ userId: userIdentities.userId })
  return rows[0]?.userId ?? null
}

async function updateOwnedIdentity(
  tx: IdentityDb,
  userId: string,
  provider: IdentityProvider,
  providerAccountId: string,
  profile: IdentityProfile,
  now: Date
): Promise<void> {
  await tx
    .update(userIdentities)
    .set({
      email: normalizeEmail(profile.email),
      telegramUsername: normalizeTelegramContact(profile.telegramUsername),
      lastSeenAt: now,
      metadata: metadataToText(profile.metadata),
    })
    .where(and(
      eq(userIdentities.userId, userId),
      eq(userIdentities.provider, provider),
      eq(userIdentities.providerAccountId, providerAccountId)
    ))
}

export async function linkIdentityToUser(
  userId: string,
  provider: RawIdentityProvider | string,
  providerAccountId: string,
  profile: IdentityProfile = {}
): Promise<ResolvedIdentityUser> {
  return linkVerifiedIdentityToUser(userId, provider, providerAccountId, profile)
}

export async function linkVerifiedIdentityToUser(
  userId: string,
  provider: RawIdentityProvider | string,
  providerAccountId: string,
  profile: IdentityProfile = {},
  client: IdentityDb = db
): Promise<ResolvedIdentityUser> {
  try {
    return await withIdentityTransaction(async (tx) => {
    const normalizedProvider = normalizeIdentityProvider(provider)
    const normalizedProviderAccountId = normalizeProviderAccountId(normalizedProvider, providerAccountId)
    const now = profile.now ?? new Date()
    const existingIdentityUserId = await findIdentityUserId(tx, normalizedProvider, normalizedProviderAccountId)
    if (existingIdentityUserId && existingIdentityUserId !== userId) {
      throw new IdentityConflictError(`Identity ${normalizedProvider}:${normalizedProviderAccountId} is already linked to another user`, existingIdentityUserId)
    }

    if (existingIdentityUserId === userId) {
      await updateOwnedIdentity(tx, userId, normalizedProvider, normalizedProviderAccountId, profile, now)
      await updateUserCache(tx, userId, normalizedProvider, profile, now)
      return selectResolvedUser(tx, userId, false)
    }

    const insertedUserId = await insertIdentityIfMissing(tx, userId, normalizedProvider, normalizedProviderAccountId, profile, now)
    if (insertedUserId) {
      await updateUserCache(tx, insertedUserId, normalizedProvider, profile, now)
      return selectResolvedUser(tx, insertedUserId, false)
    }

    const racedIdentityUserId = await findIdentityUserId(tx, normalizedProvider, normalizedProviderAccountId)
    if (racedIdentityUserId !== userId) {
      throw new IdentityConflictError(`Identity ${normalizedProvider}:${normalizedProviderAccountId} is already linked to another user`, racedIdentityUserId)
    }
    await updateOwnedIdentity(tx, userId, normalizedProvider, normalizedProviderAccountId, profile, now)
    await updateUserCache(tx, userId, normalizedProvider, profile, now)
    return selectResolvedUser(tx, userId, false)
    }, client)
  } catch (error) {
    // Конфликт identity = человек, скорее всего, случайно завёл второй аккаунт.
    // Событие шлём после отката транзакции, снаружи неё.
    if (error instanceof IdentityConflictError) {
      await trackIdentityConflict(normalizeIdentityProvider(provider), userId, error.existingUserId)
    }
    throw error
  }
}

export async function resolveOrCreateUserFromIdentity(
  provider: RawIdentityProvider | string,
  providerAccountId: string,
  profile: IdentityProfile = {}
): Promise<ResolvedIdentityUser> {
  const { user, analytics } = await withIdentityTransaction(async (tx) => {
    const normalizedProvider = normalizeIdentityProvider(provider)
    const normalizedProviderAccountId = normalizeProviderAccountId(normalizedProvider, providerAccountId)
    const now = profile.now ?? new Date()
    const email = normalizeEmail(profile.email)

    const existingIdentityUserId = await findIdentityUserId(tx, normalizedProvider, normalizedProviderAccountId)

    if (existingIdentityUserId) {
      const userId = existingIdentityUserId
      await upsertIdentity(tx, userId, normalizedProvider, normalizedProviderAccountId, profile, now)
      await updateUserCache(tx, userId, normalizedProvider, profile, now)
      return finalizeLoginSuccess(tx, userId, normalizedProvider, false, 'identity')
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
    const resolvedIsNew = isNew && identityUserId === userId
    const linkedBy: AuthLinkedBy = resolvedIsNew ? 'new' : linkedByEmailUserId ? 'email' : 'identity'
    return finalizeLoginSuccess(tx, identityUserId, normalizedProvider, resolvedIsNew, linkedBy)
  })

  await reportLoginSuccess(analytics)
  return user
}
