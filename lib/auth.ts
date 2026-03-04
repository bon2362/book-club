import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
import Credentials from 'next-auth/providers/credentials'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createHash, createHmac, timingSafeEqual } from 'crypto'

function verifyTelegramHash(data: Record<string, string>): boolean {
  if (!process.env.TELEGRAM_BOT_TOKEN) return false
  const { hash, ...rest } = data
  if (!hash) return false
  const dataCheckString = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('\n')
  const secret = createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest()
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Resend({
      apiKey: process.env.RESEND_API_KEY!,
      from: 'Долгое наступление <noreply@slowreading.club>',
    }),
    Credentials({
      id: 'telegram',
      credentials: {},
      async authorize(credentials) {
        const data = credentials as Record<string, string>
        if (!verifyTelegramHash(data)) return null
        const { id, first_name, last_name, username } = data
        const name = [first_name, last_name].filter(Boolean).join(' ') || username || String(id)
        return {
          id: `telegram:${id}`,
          email: `telegram:${id}@telegram.user`,
          name,
          telegramUsername: username || null,
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.isAdmin = user.email === process.env.ADMIN_EMAIL
        token.telegramUsername = user.telegramUsername ?? token.telegramUsername
      } else if (token.email) {
        const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, token.email)).limit(1)
        if (existing.length === 0) return null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.isAdmin = token.isAdmin as boolean | undefined
        session.user.telegramUsername = token.telegramUsername
      }
      return session
    },
  },
  pages: {
    signIn: '/',
  },
})
