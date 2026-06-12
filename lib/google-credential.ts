import { OAuth2Client } from 'google-auth-library'

export interface GoogleCredentialPayload {
  sub?: string
  email?: string
  name?: string | null
  picture?: string | null
  email_verified?: boolean | string | null
}

export async function verifyGoogleCredential(credential: string): Promise<GoogleCredentialPayload | null> {
  try {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    return ticket.getPayload() as GoogleCredentialPayload | null
  } catch {
    return null
  }
}
