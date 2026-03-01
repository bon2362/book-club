import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
import Credentials from 'next-auth/providers/credentials'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/lib/db'
import { createHash, createHmac, timingSafeEqual } from 'crypto'

function verifyTelegramHash(data: Record<string, string>): boolean {
  console.log('[TG Auth] verifyTelegramHash called, data keys:', Object.keys(data))
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log('[TG Auth] ERROR: TELEGRAM_BOT_TOKEN is not set')
    return false
  }
  const { hash, ...rest } = data
  if (!hash) {
    console.log('[TG Auth] ERROR: hash field missing from data')
    return false
  }
  const dataCheckString = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('\n')
  console.log('[TG Auth] dataCheckString:', dataCheckString)
  const secret = createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest()
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex')
  console.log('[TG Auth] expected hash:', expected)
  console.log('[TG Auth] received hash:', hash)
  try {
    const result = timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'))
    console.log('[TG Auth] hash match:', result)
    return result
  } catch (e) {
    console.log('[TG Auth] ERROR in timingSafeEqual:', e)
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
      from: 'Долгое наступление <noreply@resend.dev>',
    }),
    Credentials({
      id: 'telegram',
      credentials: {},
      async authorize(credentials) {
        console.log('[TG Auth] authorize() called, raw credentials:', JSON.stringify(credentials))
        const data = credentials as Record<string, string>
        if (!verifyTelegramHash(data)) {
          console.log('[TG Auth] authorize() → hash verification FAILED, returning null')
          return null
        }
        const { id, first_name, last_name, username } = data
        const name = [first_name, last_name].filter(Boolean).join(' ') || username || String(id)
        console.log('[TG Auth] authorize() → SUCCESS, user:', { id, username, name })
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
