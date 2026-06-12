import { verifyGoogleCredential } from '@/lib/google-credential'
import { resolveOrCreateUserFromIdentity } from '@/lib/user-identities'

export async function authorizeGoogleOneTap(
  credential: string
): Promise<{ id: string; email: string | null; contactEmail: string | null; name: string } | null> {
  try {
    const payload = await verifyGoogleCredential(credential)
    if (!payload?.email) return null

    const { sub, email, name, picture, email_verified } = payload
    if (!sub) return null
    const user = await resolveOrCreateUserFromIdentity('google-one-tap', sub, {
      email,
      name: name ?? email,
      image: picture ?? null,
      emailVerified: email_verified !== false,
      metadata: { source: 'google-one-tap' },
    })
    return { id: user.id, email: user.email, contactEmail: user.contactEmail, name: user.name ?? email }
  } catch {
    return null
  }
}
