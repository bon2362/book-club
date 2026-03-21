import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
import Credentials from 'next-auth/providers/credentials'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { Resend as ResendClient } from 'resend'
import { authorizeGoogleOneTap } from '@/lib/auth.google-one-tap'

const FROM = 'Долгое наступление <noreply@slowreading.club>'

async function sendMagicLinkEmail(email: string, url: string) {
  const client = new ResendClient(process.env.RESEND_API_KEY!)
  const html = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F0;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F0;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #E5E5E5;border-top:3px solid #111;">
        <tr><td style="padding:36px 36px 0">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#999;">Читательские круги</p>
          <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:26px;font-weight:700;color:#111;letter-spacing:-0.02em;">Долгое наступление</h1>
          <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#444;">
            Вы запросили ссылку для входа в читательские круги. Нажмите кнопку ниже — она действует <strong>24 часа</strong>.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="background:#111;">
              <a href="${url}" style="display:inline-block;padding:14px 32px;font-size:13px;font-family:system-ui,sans-serif;text-transform:uppercase;letter-spacing:0.1em;color:#fff;text-decoration:none;">
                Войти в клуб
              </a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;color:#999;line-height:1.5;">
            Если кнопка не работает, скопируйте и вставьте эту ссылку в браузер:
          </p>
          <p style="margin:0 0 32px;font-size:12px;word-break:break-all;">
            <a href="${url}" style="color:#555;text-decoration:none;border-bottom:1px solid #ccc;">${url}</a>
          </p>
        </td></tr>
        <tr><td style="padding:20px 36px;border-top:1px solid #E5E5E5;">
          <p style="margin:0;font-size:12px;color:#bbb;line-height:1.5;">
            Если вы не запрашивали этот email — просто проигнорируйте его.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = `Долгое наступление — читательские круги\n\nВойти: ${url}\n\nСсылка действует 24 часа. Если вы не запрашивали этот email — просто проигнорируйте его.`

  await client.emails.send({
    from: FROM,
    to: email,
    subject: 'Ссылка для входа в читательские круги',
    html,
    text,
  })
}

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
      from: FROM,
      sendVerificationRequest: async ({ identifier, url }) => {
        await sendMagicLinkEmail(identifier, url)
      },
    }),
    Credentials({
      id: 'google-one-tap',
      credentials: {},
      async authorize(credentials) {
        const { credential } = credentials as { credential: string }
        return authorizeGoogleOneTap(credential)
      },
    }),
    Credentials({
      id: 'telegram-preauth',
      credentials: {},
      async authorize(credentials) {
        const { uid, token, ts } = credentials as { uid: string; token: string; ts: string }
        if (!uid || !token || !ts) return null
        // Verify HMAC and freshness (5 min window)
        if (Date.now() / 1000 - parseInt(ts) > 300) return null
        const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
        if (!secret) return null
        const expected = createHmac('sha256', secret).update(`${uid}:${ts}`).digest('hex')
        try {
          if (!timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))) return null
        } catch { return null }
        const existing = await db.select().from(users).where(eq(users.id, uid)).limit(1)
        if (existing.length === 0) return null
        const user = existing[0]
        return { id: user.id, email: user.email, name: user.name ?? '', telegramUsername: null }
      },
    }),
    Credentials({
      id: 'telegram',
      credentials: {},
      async authorize(credentials) {
        const data = credentials as Record<string, string>
        if (!verifyTelegramHash(data)) return null
        const { id, first_name, last_name, username, photo_url } = data
        const name = [first_name, last_name].filter(Boolean).join(' ') || username || String(id)
        const email = `telegram:${id}@telegram.user`
        const userId = `telegram:${id}`
        await db.insert(users).values({ id: userId, email, name, image: photo_url || null }).onConflictDoUpdate({
          target: users.id,
          set: { name, image: photo_url || null },
        })
        return {
          id: userId,
          email,
          name,
          telegramUsername: username || null,
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.isAdmin = user.email === process.env.ADMIN_EMAIL
        token.telegramUsername = user.telegramUsername ?? token.telegramUsername
        token.provider = account?.provider ?? token.provider
      } else if (token.email && process.env.NEXTAUTH_TEST_MODE !== 'true') {
        const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, token.email)).limit(1)
        if (existing.length === 0) return null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub
        session.user.isAdmin = token.isAdmin as boolean | undefined
        session.user.telegramUsername = token.telegramUsername
        session.user.provider = token.provider
      }
      return session
    },
  },
  pages: {
    signIn: '/',
  },
})
