import { OAuth2Client } from 'google-auth-library'
import { resolveOrCreateUserFromIdentity } from '@/lib/user-identities'

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

    const { sub, email, name, picture, email_verified } = payload
    const user = await resolveOrCreateUserFromIdentity('google-one-tap', sub, {
      email,
      name: name ?? email,
      image: picture ?? null,
      emailVerified: email_verified !== false,
      metadata: { source: 'google-one-tap' },
    })
    return { id: user.id, email: user.email, name: user.name ?? email }
  } catch {
    return null
  }
}
