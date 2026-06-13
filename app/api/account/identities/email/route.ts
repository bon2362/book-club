export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { createEmailAccountLinkToken, normalizeAccountLinkEmail } from '@/lib/account-email-linking'

const FROM = 'Долгое наступление <noreply@slowreading.club>'

type RequestBody = {
  email?: unknown
}

function emailBody(linkUrl: string) {
  return {
    subject: 'Подтвердите почту для профиля',
    html: `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F0;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F0;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #E5E5E5;border-top:3px solid #111;">
        <tr><td style="padding:36px 36px 0">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#999;">Читательские круги</p>
          <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:26px;font-weight:700;color:#111;">Привязать почту</h1>
          <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#444;">
            Нажмите кнопку ниже, чтобы добавить эту почту к вашему профилю в «Долгом наступлении».
          </p>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="background:#111;">
              <a href="${linkUrl}" style="display:inline-block;padding:14px 32px;font-size:13px;font-family:system-ui,sans-serif;text-transform:uppercase;letter-spacing:0.1em;color:#fff;text-decoration:none;">
                Привязать почту
              </a>
            </td></tr>
          </table>
          <p style="margin:0 0 32px;font-size:12px;word-break:break-all;">
            <a href="${linkUrl}" style="color:#555;text-decoration:none;border-bottom:1px solid #ccc;">${linkUrl}</a>
          </p>
        </td></tr>
        <tr><td style="padding:20px 36px;border-top:1px solid #E5E5E5;">
          <p style="margin:0;font-size:12px;color:#bbb;line-height:1.5;">
            Если вы не запрашивали привязку почты — просто проигнорируйте это письмо.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    text: `Долгое наступление — читательские круги\n\nПривязать почту: ${linkUrl}\n\nЕсли вы не запрашивали привязку почты — просто проигнорируйте это письмо.`,
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: RequestBody
  try {
    body = await req.json() as RequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  if (typeof body.email !== 'string') {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  const email = normalizeAccountLinkEmail(body.email)
  if (!email) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  const { identifier, token } = await withAuditContext(
    {
      actorUserId: userId,
      actorLabel: session.user?.name ?? session.user?.email ?? session.user?.contactEmail ?? null,
      source: 'account-linking',
    },
    async (tx) => createEmailAccountLinkToken(userId, email, tx),
  )
  const callbackUrl = new URL('/api/account/identities/email/callback', req.nextUrl.origin)
  callbackUrl.searchParams.set('identifier', identifier)
  callbackUrl.searchParams.set('token', token)

  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: FROM,
    to: email,
    ...emailBody(callbackUrl.toString()),
  })

  return NextResponse.json({ ok: true })
}
