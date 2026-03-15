# Story 2.2: API модерации заявок

Status: done

## Story

As an admin,
I want to access a list of submissions and update their status via API,
So that I can manage book proposals programmatically.

## Acceptance Criteria

1. **[AC1 — GET список]** GET `/api/admin/submissions` от isAdmin → список всех заявок со всеми полями (включая email автора) и статусами

2. **[AC2 — GET 403]** GET без `isAdmin` → `403 Forbidden`

3. **[AC3 — PATCH статус + email]** PATCH `/api/admin/submissions/[id]` с новым статусом (`approved`/`rejected`) от admin → статус обновляется в БД + отправляется email через Resend

4. **[AC4 — PATCH Resend fail]** Resend возвращает ошибку → операция смены статуса всё равно успешна, ошибка логируется в консоль

5. **[AC5 — PATCH поля]** PATCH с изменениями полей заявки (не только статус) → поля обновляются вместе со статусом

6. **[AC6 — PATCH 403]** PATCH без `isAdmin` → `403 Forbidden`

## Tasks / Subtasks

- [x] Task 1: Создать `app/api/admin/submissions/route.ts` — GET (AC: #1, #2)
  - [ ] Auth guard: `session?.user?.isAdmin` → 403
  - [ ] `db.select()` из `bookSubmissions` с JOIN на `users` для получения email автора
  - [ ] Возврат списка заявок `{ success: true, data: [...] }`

- [x] Task 2: Создать `app/api/admin/submissions/[id]/route.ts` — PATCH (AC: #3, #4, #5, #6)
  - [ ] Auth guard: isAdmin → 403
  - [ ] Парсинг body: status + optional поля (title, author, whyRead, topic, pages, publishedDate, textUrl, description, coverUrl)
  - [ ] `db.update(bookSubmissions).set({ ...fields, updatedAt: new Date() }).where(eq(id, ...))`
  - [ ] Если status === 'approved' → `approvedEmail(title)`, если 'rejected' → `rejectedEmail(title)`
  - [ ] Resend try/catch — ошибка не блокирует ответ
  - [ ] Возврат обновлённой заявки

- [x] Task 3: Написать тесты (AC: #1–#6)
  - [ ] `app/api/admin/submissions/route.test.ts`
  - [ ] `app/api/admin/submissions/[id]/route.test.ts`

## Dev Notes

### GET с JOIN для email автора

Drizzle join:
```typescript
import { eq } from 'drizzle-orm'
const rows = await db
  .select({
    id: bookSubmissions.id,
    userId: bookSubmissions.userId,
    userEmail: users.email,
    title: bookSubmissions.title,
    topic: bookSubmissions.topic,
    author: bookSubmissions.author,
    pages: bookSubmissions.pages,
    publishedDate: bookSubmissions.publishedDate,
    textUrl: bookSubmissions.textUrl,
    description: bookSubmissions.description,
    coverUrl: bookSubmissions.coverUrl,
    whyRead: bookSubmissions.whyRead,
    status: bookSubmissions.status,
    createdAt: bookSubmissions.createdAt,
    updatedAt: bookSubmissions.updatedAt,
  })
  .from(bookSubmissions)
  .leftJoin(users, eq(bookSubmissions.userId, users.id))
  .orderBy(bookSubmissions.createdAt)
```

### PATCH с email

```typescript
import { Resend } from 'resend'
import { approvedEmail, rejectedEmail } from '@/lib/email-templates/submission-status'

const FROM = 'Долгое наступление <noreply@slowreading.club>'

// после update:
if (status === 'approved' || status === 'rejected') {
  const template = status === 'approved'
    ? approvedEmail(updated.title)
    : rejectedEmail(updated.title)
  try {
    const resend = new Resend(process.env.RESEND_API_KEY!)
    await resend.emails.send({ from: FROM, to: userEmail, ...template })
  } catch (e) {
    console.error('Email send failed:', e)
  }
}
```

### PATCH тело запроса

Принимает частичное обновление — только переданные поля. `status` обязателен если меняется; остальные поля опциональны.

```typescript
const { status, title, author, whyRead, topic, pages, publishedDate, textUrl, description, coverUrl } = body
const updates: Record<string, unknown> = { updatedAt: new Date() }
if (status !== undefined) updates.status = status
if (title !== undefined) updates.title = title
// ... и т.д.
```

### Мок Resend в тестах

```typescript
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ id: 'email-id' }) },
  })),
}))
```

### Файлы для изменения / создания

| Действие | Файл |
|---|---|
| Создать | `app/api/admin/submissions/route.ts` |
| Создать | `app/api/admin/submissions/route.test.ts` |
| Создать | `app/api/admin/submissions/[id]/route.ts` |
| Создать | `app/api/admin/submissions/[id]/route.test.ts` |

### References

- Auth guard паттерн: [Source: app/api/admin/delete-user/route.ts]
- DB update паттерн: [Source: lib/db/schema.ts — bookSubmissions]
- Resend паттерн: [Source: lib/auth.ts — sendMagicLinkEmail]
- Email templates: [Source: lib/email-templates/submission-status.ts]
- Тест паттерн (node env): [Source: app/api/admin/delete-user/route.test.ts]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- ✅ GET /api/admin/submissions — Drizzle leftJoin users для получения userEmail, isAdmin guard, 4 теста.
- ✅ PATCH /api/admin/submissions/[id] — частичное обновление полей, email через Resend с try/catch, 8 тестов.

### File List

- `app/api/admin/submissions/route.ts` (создан)
- `app/api/admin/submissions/route.test.ts` (создан)
- `app/api/admin/submissions/[id]/route.ts` (создан)
- `app/api/admin/submissions/[id]/route.test.ts` (создан)

### Change Log

- 2026-03-15: Реализована Story 2.2 — GET и PATCH эндпоинты для модерации заявок с email-уведомлениями.
