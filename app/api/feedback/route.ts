import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { feedback } from '@/lib/db/schema'
import { bestEffortRecordUserActivity } from '@/lib/user-activity'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { message, name, email } = body as { message?: string; name?: string; email?: string }

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Missing message' }, { status: 400 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const session = await auth()
  const subject = name?.trim()
    ? `Обратная связь от ${name.trim()}`
    : 'Обратная связь'
  const text = `Имя: ${name?.trim() || 'не указано'}\nEmail: ${email?.trim() || 'не указан'}\n\n${message.trim()}`

  try {
    await resend.emails.send({
      from: 'Долгое наступление <noreply@slowreading.club>',
      to: 'hello@slowreading.club',
      subject,
      text,
    })
    const saved = await db.insert(feedback).values({
      userId: session?.user?.id ?? null,
      name: name?.trim() || null,
      email: email?.trim() || null,
      message: message.trim(),
    }).returning({ id: feedback.id, createdAt: feedback.createdAt })
    if (session?.user?.id && saved[0]) {
      await bestEffortRecordUserActivity(session.user.id, 'feedback_created', {
        occurredAt: saved[0].createdAt,
        source: 'api',
        sourceId: saved[0].id,
        dedupeKey: `api:feedback_created:${saved[0].id}`,
      })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}
