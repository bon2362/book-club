import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

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
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}
