import type { Adapter, AdapterAccount, AdapterUser } from '@auth/core/adapters'
import { and, eq, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userIdentities, users, verificationTokens } from '@/lib/db/schema'
import { normalizeIdentityProvider } from '@/lib/user-identities'

type DbUserRow = typeof users.$inferSelect

function normalizeEmail(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase()
  return normalized || null
}

function toAdapterUser(user: DbUserRow): AdapterUser {
  return {
    id: user.id,
    name: user.name,
    email: user.contactEmail ?? null,
    emailVerified: user.emailVerified,
    image: user.image,
    contactEmail: user.contactEmail,
  } as AdapterUser
}

async function getUserById(userId: string): Promise<AdapterUser | null> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  return rows[0] ? toAdapterUser(rows[0]) : null
}

async function getUserIdByEmail(email: string): Promise<string | null> {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return null

  const contactRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.contactEmail, normalizedEmail))
    .limit(1)
  if (contactRows[0]?.id) return contactRows[0].id

  const identityRows = await db
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(or(
      eq(userIdentities.email, normalizedEmail),
      and(eq(userIdentities.provider, 'email'), eq(userIdentities.providerAccountId, normalizedEmail))
    ))
    .limit(1)
  return identityRows[0]?.userId ?? null
}

export function IdentityAwareDrizzleAdapter(): Adapter {
  return {
    async createUser(data) {
      const email = normalizeEmail(data.email)
      const id = data.id ?? crypto.randomUUID()
      const [created] = await db
        .insert(users)
        .values({
          id,
          name: data.name ?? email,
          contactEmail: email,
          emailVerified: data.emailVerified ?? null,
          image: data.image ?? null,
        })
        .returning()
      return toAdapterUser(created)
    },
    getUser: getUserById,
    async getUserByEmail(email) {
      const userId = await getUserIdByEmail(email)
      return userId ? getUserById(userId) : null
    },
    async getUserByAccount(account: Pick<AdapterAccount, 'provider' | 'providerAccountId'>) {
      const identityRows = await db
        .select({ userId: userIdentities.userId })
        .from(userIdentities)
        .where(and(
          eq(userIdentities.provider, account.provider),
          eq(userIdentities.providerAccountId, account.providerAccountId)
        ))
        .limit(1)
      const identityUser = identityRows[0]?.userId ? await getUserById(identityRows[0].userId) : null
      if (identityUser) return identityUser

      return null
    },
    async updateUser(data) {
      const { id, email, name, image, emailVerified } = data
      const contactEmail = normalizeEmail(email)
      const [updated] = await db
        .update(users)
        .set({
          ...(name !== undefined ? { name } : {}),
          ...(image !== undefined ? { image } : {}),
          ...(emailVerified !== undefined ? { emailVerified } : {}),
          ...(contactEmail !== null ? { contactEmail } : {}),
        })
        .where(eq(users.id, id))
        .returning()
      if (!updated) throw new Error('No user found.')
      return toAdapterUser(updated)
    },
    async linkAccount(account) {
      const provider = normalizeIdentityProvider(account.provider)
      const now = new Date()
      const metadata = JSON.stringify({ source: 'auth-adapter-link-account', type: account.type })
      await db
        .insert(userIdentities)
        .values({
          userId: account.userId,
          provider,
          providerAccountId: account.providerAccountId,
          lastSeenAt: now,
          metadata,
        })
        .onConflictDoUpdate({
          target: [userIdentities.provider, userIdentities.providerAccountId],
          set: {
            userId: account.userId,
            lastSeenAt: now,
            metadata,
          },
        })
      return account
    },
    async getAccount(providerAccountId, provider) {
      const normalizedProvider = normalizeIdentityProvider(provider)
      const rows = await db
        .select({ userId: userIdentities.userId })
        .from(userIdentities)
        .where(and(
          eq(userIdentities.provider, normalizedProvider),
          eq(userIdentities.providerAccountId, providerAccountId)
        ))
        .limit(1)
      if (!rows[0]?.userId) return null
      return {
        userId: rows[0].userId,
        type: normalizedProvider === 'google' ? 'oidc' : 'oauth',
        provider: normalizedProvider,
        providerAccountId,
      } as AdapterAccount
    },
    async unlinkAccount(account) {
      const provider = normalizeIdentityProvider(account.provider)
      await db
        .delete(userIdentities)
        .where(and(
          eq(userIdentities.provider, provider),
          eq(userIdentities.providerAccountId, account.providerAccountId)
        ))
      return undefined
    },
    async createVerificationToken(data) {
      const [created] = await db
        .insert(verificationTokens)
        .values(data)
        .returning()
      return created
    },
    async useVerificationToken(params) {
      const [used] = await db
        .delete(verificationTokens)
        .where(and(
          eq(verificationTokens.identifier, params.identifier),
          eq(verificationTokens.token, params.token)
        ))
        .returning()
      return used ?? null
    },
  }
}
