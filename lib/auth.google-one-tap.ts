import { OAuth2Client } from 'google-auth-library'
import { db } from '@/lib/db'
import { users, accounts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function authorizeGoogleOneTap(
  credential: string
): Promise<{ id: string; email: string; name: string } | null> {
  try {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (!payload?.email) return null

    const { sub, email, name } = payload

    // Find existing user by email
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (existing.length > 0) {
      return { id: existing[0].id, email, name: name ?? email }
    }

    // New user: insert into users + accounts
    // accounts entry prevents OAuthAccountNotLinked if user later signs in via Google OAuth button
    const newId = crypto.randomUUID()
    await db.insert(users).values({
      id: newId,
      email,
      name: name ?? email,
      emailVerified: new Date(),
    })
    await db.insert(accounts).values({
      userId: newId,
      type: 'oidc',
      provider: 'google',
      providerAccountId: sub,
    })
    return { id: newId, email, name: name ?? email }
  } catch {
    return null
  }
}
