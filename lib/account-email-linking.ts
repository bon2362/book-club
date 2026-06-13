import { randomBytes } from 'crypto'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { verificationTokens } from '@/lib/db/schema'

const IDENTIFIER_PREFIX = 'account-link-email:'
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export type EmailAccountLinkToken = {
  identifier: string
  token: string
  expires: Date
}

export type ConsumedEmailAccountLinkToken = {
  userId: string
  email: string
}

type TokenDb = Pick<typeof db, 'delete' | 'insert'>

export function normalizeAccountLinkEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase()
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null
  return normalized
}

function identifierFor(userId: string, email: string): string {
  return `${IDENTIFIER_PREFIX}${userId}:${email}`
}

export function parseEmailAccountLinkIdentifier(identifier: string | null): ConsumedEmailAccountLinkToken | null {
  if (!identifier) return null
  if (!identifier.startsWith(IDENTIFIER_PREFIX)) return null
  const rest = identifier.slice(IDENTIFIER_PREFIX.length)
  const separatorIndex = rest.indexOf(':')
  if (separatorIndex <= 0) return null
  const userId = rest.slice(0, separatorIndex)
  const email = rest.slice(separatorIndex + 1)
  const normalizedEmail = normalizeAccountLinkEmail(email)
  if (!userId || !normalizedEmail) return null
  return { userId, email: normalizedEmail }
}

export async function createEmailAccountLinkToken(
  userId: string,
  email: string,
  client: TokenDb = db
): Promise<EmailAccountLinkToken> {
  const normalizedEmail = normalizeAccountLinkEmail(email)
  if (!normalizedEmail) throw new Error('Invalid email')

  const identifier = identifierFor(userId, normalizedEmail)
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + TOKEN_TTL_MS)

  await client.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier))
  await client.insert(verificationTokens).values({ identifier, token, expires })

  return { identifier, token, expires }
}

export async function consumeEmailAccountLinkToken(
  identifier: string | null,
  token: string | null,
  client: TokenDb = db
): Promise<ConsumedEmailAccountLinkToken | null> {
  if (!identifier || !token) return null
  const parsed = parseEmailAccountLinkIdentifier(identifier)
  if (!parsed) return null

  const rows = await client
    .delete(verificationTokens)
    .where(and(
      eq(verificationTokens.identifier, identifier),
      eq(verificationTokens.token, token),
      gt(verificationTokens.expires, new Date())
    ))
    .returning({ identifier: verificationTokens.identifier })

  return rows[0] ? parsed : null
}
