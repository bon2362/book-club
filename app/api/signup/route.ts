import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { upsertSignup } from '@/lib/signups'
import { Resend } from 'resend'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, contacts, selectedBooks } = body

  if (!name?.trim() || typeof contacts !== 'string' || !Array.isArray(selectedBooks)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const result = await upsertSignup({
    userId: session.user.email,
    name: name.trim(),
    email: session.user.email,
    contacts: contacts.trim(),
    selectedBooks,
  })

  // Notify admin when books are added
  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail && result.addedBooks.length > 0 && process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const subject = result.isNew
      ? `Новая запись: ${name.trim()}`
      : `Обновление записи: ${name.trim()}`
    const bookList = result.addedBooks.map(b => `• ${b}`).join('\n')
    const text = `${subject}\n\nКонтакт: ${contacts.trim()}\nEmail: ${session.user.email}\n\nДобавленные книги:\n${bookList}`

    resend.emails.send({
      from: 'Долгое наступление <noreply@slowreading.club>',
      to: adminEmail,
      subject,
      text,
    }).catch(console.error) // не блокируем ответ
  }

  return NextResponse.json({ ok: true })
}
