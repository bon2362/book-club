# Feedback Form — Design Spec

**Date:** 2026-03-19
**Backlog item:** #65
**Complexity:** S

## Summary

Add a way for users to send feedback — questions, suggestions, or comments — to the project author. A footer with a "Написать автору проекта" button opens a modal form. Messages are sent to `hello@slowreading.club` via Resend. No login required; for authenticated users, name and email are pre-filled.

---

## Architecture

**New files:**

| File | Purpose |
|------|---------|
| `components/nd/Footer.tsx` | Minimal footer strip with "Написать автору проекта" button |
| `components/nd/FeedbackForm.tsx` | Modal feedback form |
| `app/api/feedback/route.ts` | POST handler — sends email via Resend |

**Modified files:**

| File | Change |
|------|--------|
| `components/nd/BooksPage.tsx` | Mount `<Footer>` and `<FeedbackForm>`, add `feedbackFormOpen` state |

No changes to: Header, layout, DB schema, auth.

---

## Data Flow

```
Footer (button) → feedbackFormOpen = true
FeedbackForm → POST /api/feedback { message, name?, email? }
/api/feedback → Resend.send() → hello@slowreading.club
FeedbackForm → success state ("Спасибо, я прочитаю и отвечу")
```

---

## Components

### `Footer.tsx`

- Strip at the bottom of the page: `border-top: 2px solid #000`, white background
- `maxWidth: 1200px`, same padding as header
- Single button "Написать автору проекта" styled like other text buttons in the project (no background, `border-bottom: 1px solid`)
- Props: `onFeedback: () => void`

### `FeedbackForm.tsx`

Modal following the `SubmitBookForm` pattern:
- Overlay with `role="dialog"`, close on Escape and overlay click
- Fixed header "Написать автору проекта", scrollable body, sticky submit button

**Fields:**

| Field | Type | Required | Pre-fill for logged-in users |
|-------|------|----------|------------------------------|
| Сообщение | textarea | ✓ | — |
| Имя | text input | — | `effectiveUser?.name` → `session.user.name` |
| Email | email input | — | `session.user.email` |

**Submit button states:**

1. First click with empty email → inline warning below button: «Без email я не смогу ответить. [Отправить всё равно]»
2. Click "Отправить всё равно" (or repeat click) → sends
3. On success → «Спасибо, я прочитаю и отвечу» + close button
4. On error → error message, form remains open

**Props:** `isOpen: boolean`, `onClose: () => void`, `currentUser: UserSignup | null`

---

## API — `POST /api/feedback`

**No auth required.**

**Request body:**
```ts
{
  message: string   // required
  name?: string
  email?: string
}
```

**Validation:** `message` empty → 400.

**Email via Resend:**
- `from`: `'Долгое наступление <noreply@slowreading.club>'`
- `to`: `'hello@slowreading.club'`
- `subject`: `'Обратная связь'` + (name ? ` от ${name}` : `''`)
- `text`: name (or «не указано»), email (or «не указан»), message body

**Responses:**
- `{ ok: true }` — 200
- `{ error: 'Missing message' }` — 400
- `{ error: 'Failed to send' }` — 500

Sending is **synchronous** (not fire-and-forget) — the client needs to know if Resend fails.

---

## Out of Scope

- Rate limiting (can be added later if spam becomes an issue)
- Storing messages in DB
- Admin panel view of messages
