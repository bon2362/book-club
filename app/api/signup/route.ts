import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { upsertSignup } from '@/lib/signups'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import { bookPriorities } from '@/lib/db/schema'
import { and, eq, notInArray } from 'drizzle-orm'

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

  // Clean up book_priorities for books no longer in selectedBooks.
  // Uses session.user.id (Postgres user UUID), not session.user.email (Sheets userId).
  const pgUserId = (session.user as { id?: string }).id
  if (pgUserId) {
    if ((selectedBooks as string[]).length > 0) {
      await db
        .delete(bookPriorities)
        .where(
          and(
            eq(bookPriorities.userId, pgUserId),
            notInArray(bookPriorities.bookName, selectedBooks as string[])
          )
        )
        .catch(() => {}) // non-critical — don't fail the request
    } else {
      // All books removed — delete all priorities for this user
      await db
        .delete(bookPriorities)
        .where(eq(bookPriorities.userId, pgUserId))
        .catch(() => {})
    }
  }

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
