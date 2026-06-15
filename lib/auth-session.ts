import { encode } from '@auth/core/jwt'
import type { NextResponse } from 'next/server'

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // дефолт сессии NextAuth

export interface ServerSessionUser {
  userId: string
  email?: string | null
  name?: string | null
  provider?: string | null
  isAdmin?: boolean
  contactEmail?: string | null
}

/**
 * Кодирует session-JWT NextAuth и ставит куку сессии на res.
 * Имя куки и salt зависят от secure (prod HTTPS → __Secure- префикс).
 * isAdmin/contactEmail кодируются только если переданы (нужно тест-режиму;
 * в проде jwt-callback гидратирует их из БД по sub).
 */
export async function issueServerSession(
  res: NextResponse,
  user: ServerSessionUser,
  opts: { secure: boolean; maxAgeSeconds?: number },
): Promise<void> {
  const cookieName = opts.secure ? '__Secure-authjs.session-token' : 'authjs.session-token'
  const maxAge = opts.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS
  const token = await encode({
    token: {
      sub: user.userId,
      email: user.email ?? null,
      name: user.name ?? null,
      provider: user.provider ?? null,
      ...(user.isAdmin !== undefined ? { isAdmin: user.isAdmin } : {}),
      ...(user.contactEmail !== undefined ? { contactEmail: user.contactEmail } : {}),
    },
    secret: (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET)!,
    salt: cookieName,
    maxAge,
  })
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: opts.secure,
    maxAge,
  })
}
