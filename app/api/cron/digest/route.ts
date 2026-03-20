import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notificationQueue } from '@/lib/db/schema'
import { and, isNull, isNotNull, lt, inArray } from 'drizzle-orm'
import { Resend } from 'resend'

export async function GET(req: Request) {
  // 1. Authorization
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'Misconfigured' }, { status: 401 })
  }
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Early exit: ADMIN_EMAIL not configured
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) {
    return NextResponse.json({ skipped: 'no-admin-email' })
  }

  // 3. Release stale locks (processing_at set > 5 min ago, not yet sent)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
  await db
    .update(notificationQueue)
    .set({ processingAt: null })
    .where(
      and(
        isNotNull(notificationQueue.processingAt),
        isNull(notificationQueue.sentAt),
        lt(notificationQueue.processingAt, fiveMinutesAgo)
      )
    )

  // 4. Atomically claim pending rows
  const captured = await db
    .update(notificationQueue)
    .set({ processingAt: new Date() })
    .where(and(isNull(notificationQueue.sentAt), isNull(notificationQueue.processingAt)))
    .returning()

  // 5. Empty queue
  if (captured.length === 0) {
    return NextResponse.json({ skipped: 'empty' })
  }

  const capturedIds = captured.map((r) => r.id)
  const now = Date.now()

  // 6. Debounce check
  const latestCreatedAt = Math.max(...captured.map((r) => r.createdAt.getTime()))
  const oldestCreatedAt = Math.min(...captured.map((r) => r.createdAt.getTime()))
  const isCooling = latestCreatedAt > now - 30 * 60 * 1000
  const isForcedFlush = oldestCreatedAt < now - 2 * 60 * 60 * 1000

  if (isCooling && !isForcedFlush) {
    await db
      .update(notificationQueue)
      .set({ processingAt: null })
      .where(inArray(notificationQueue.id, capturedIds))
    return NextResponse.json({ skipped: 'cooling' })
  }

  // 7. Build digest email
  const totalBooks = captured.reduce((sum, r) => {
    const books = JSON.parse(r.addedBooks) as string[]
    return sum + books.length
  }, 0)

  const subject = `Дайджест записей: ${captured.length} участников, ${totalBooks} книг`
  const lines = captured.map((r, i) => {
    const books = JSON.parse(r.addedBooks) as string[]
    const label = r.isNew ? 'новая запись' : 'обновление'
    return `${i + 1}. ${r.userName} (${label})\n   Контакт: ${r.contacts}\n   Email: ${r.userEmail}\n   Книги: ${books.join(', ')}`
  })
  const text = `${subject}\n\n${lines.join('\n\n')}`

  // 8. Send via Resend
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    await resend.emails.send({
      from: 'Долгое наступление <noreply@slowreading.club>',
      to: adminEmail,
      subject,
      text,
    })
  } catch (err) {
    // 9. On failure: release lock so next cron cycle retries
    console.error('Digest email failed:', err)
    await db
      .update(notificationQueue)
      .set({ processingAt: null })
      .where(inArray(notificationQueue.id, capturedIds))
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
  }

  // 10. Mark as sent
  await db
    .update(notificationQueue)
    .set({ sentAt: new Date(), processingAt: null })
    .where(inArray(notificationQueue.id, capturedIds))

  return NextResponse.json({ sent: captured.length, books: totalBooks })
}
