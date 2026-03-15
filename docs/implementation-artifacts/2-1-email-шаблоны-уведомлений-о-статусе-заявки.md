# Story 2.1: Email-шаблоны уведомлений о статусе заявки

Status: done

## Story

As a system,
I want to send email notifications when a submission status changes,
So that users are informed about the outcome of their proposals.

## Acceptance Criteria

1. **[AC1 — approvedEmail]** `approvedEmail(bookTitle)` возвращает `{ subject, html }` с темой письма и HTML-телом, содержащим название книги и сообщение об одобрении

2. **[AC2 — rejectedEmail]** `rejectedEmail(bookTitle)` возвращает `{ subject, html }` с темой письма и HTML-телом, содержащим название книги и нейтральное сообщение об отклонении

3. **[AC3 — Named exports]** Функции экспортируются как named exports из `lib/email-templates/submission-status.ts`, совместимы с Resend API

## Tasks / Subtasks

- [x] Task 1: Создать `lib/email-templates/submission-status.ts` (AC: #1, #2, #3)
  - [x] `approvedEmail(bookTitle: string): { subject: string; html: string }`
  - [x] `rejectedEmail(bookTitle: string): { subject: string; html: string }`
  - [x] Named exports (не default)
  - [x] HTML следует паттерну из `lib/auth.ts` (table-based, стиль проекта)

- [x] Task 2: Написать тесты `lib/email-templates/submission-status.test.ts` (AC: #1–#3)
  - [x] `approvedEmail` возвращает `subject` и `html`
  - [x] `approvedEmail` html содержит `bookTitle`
  - [x] `rejectedEmail` возвращает `subject` и `html`
  - [x] `rejectedEmail` html содержит `bookTitle`

## Dev Notes

### Паттерн из lib/auth.ts

```typescript
// FROM = 'Долгое наступление <noreply@slowreading.club>'
// client.emails.send({ from, to, subject, html, text })
```

Шаблоны возвращают только `{ subject, html }` — `from` и `to` добавляются в вызывающем коде.

### Реализация

```typescript
// lib/email-templates/submission-status.ts

const BASE_STYLES = `font-family:system-ui,sans-serif;...` // как в auth.ts

export function approvedEmail(bookTitle: string): { subject: string; html: string } {
  return {
    subject: `Ваша заявка на книгу одобрена`,
    html: `...HTML с bookTitle...`,
  }
}

export function rejectedEmail(bookTitle: string): { subject: string; html: string } {
  return {
    subject: `Статус вашей заявки на книгу обновлён`,
    html: `...нейтральное HTML с bookTitle...`,
  }
}
```

Тон: одобрение — тёплый, отклонение — нейтральный (согласно UX-спецификации: "без осуждения", "не была одобрена", без объяснений причин в MVP).

### Файлы для изменения / создания

| Действие | Файл |
|---|---|
| Создать | `lib/email-templates/submission-status.ts` |
| Создать | `lib/email-templates/submission-status.test.ts` |

### References

- Паттерн HTML email: [Source: lib/auth.ts#sendMagicLinkEmail]
- Resend API: [Source: lib/auth.ts — ResendClient]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- ✅ Task 1: `lib/email-templates/submission-status.ts` — named exports `approvedEmail` и `rejectedEmail`, table-based HTML по паттерну auth.ts.
- ✅ Task 2: 8 тестов — все прошли.

### File List

- `lib/email-templates/submission-status.ts` (создан)
- `lib/email-templates/submission-status.test.ts` (создан)

### Change Log

- 2026-03-15: Реализована Story 2.1 — email-шаблоны для одобрения и отклонения заявки.
