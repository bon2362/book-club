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
| `components/nd/BooksPage.tsx` | Mount `<Footer>` and `<FeedbackForm>`, add `feedbackFormOpen` state; pass `userEmail={session?.user?.email ?? undefined}` to FeedbackForm |

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

- Normal-flow strip at the bottom of the page (not fixed/sticky): `border-top: 2px solid #000`, white background
- `maxWidth: 1200px`, same padding as header (`0.75rem 1.5rem`)
- Single button "Написать автору проекта" styled like other text buttons in the project (no background, `border-bottom: 1px solid`)
- No z-index needed (normal flow; the existing fixed scroll-to-top button already handles its own positioning)
- Props: `onFeedback: () => void`

### `FeedbackForm.tsx`

Modal following the `SubmitBookForm` pattern:
- Overlay with `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="feedback-form-title"`
- Close on Escape and overlay click — **except while in `submitting` state** (both are disabled during submission, matching `SubmitBookForm` behavior)
- Fixed header `<h2 id="feedback-form-title">Написать автору проекта</h2>`, scrollable body, sticky submit button

**Props:**

```ts
{
  isOpen: boolean
  onClose: () => void
  currentUser: UserSignup | null   // for name pre-fill
  userEmail?: string               // session?.user?.email from BooksPage
}
```

**Fields:**

| Field | Type | Required | Initial value (logged-in) | Initial value (anonymous) |
|-------|------|----------|--------------------------|--------------------------|
| Сообщение | textarea | ✓ | — | — |
| Имя | text input | — | `currentUser?.name ?? ''` | `''` |
| Email | email input | — | `userEmail ?? ''` | `''` |

**Form reset on close:** When `isOpen` transitions to `false`, reset `message` to `''`; reset `name` and `email` to their initial pre-filled values (not to empty). This mirrors the `useEffect([isOpen])` pattern in `SubmitBookForm`.

**Submit button state machine:**

| State | Button label | Button disabled? | Extra UI |
|-------|-------------|-----------------|----------|
| idle | «Отправить» | no | — |
| submitting | «Отправляем…» | yes | — |
| needs-email-confirm | «Отправить» | no | Inline warning below button |
| success | — | — | Success message + «Закрыть» button |
| error | «Отправить» | no | Error message below button |

**Submit logic:**

1. User clicks «Отправить»
   - If `message` is empty → do nothing (the submit button is disabled when `message.trim()` is empty)
   - If `email` is empty AND state ≠ `needs-email-confirm` → set state to `needs-email-confirm`, show warning: «Без email я не смогу ответить. [Отправить всё равно]»
   - If `email` is empty AND state === `needs-email-confirm` → this click does NOT send; only «Отправить всё равно» sends
   - If `email` is not empty → send immediately

2. User clicks «Отправить всё равно» → send (bypasses email check)

3. When email field value changes while in `needs-email-confirm` state → reset state to `idle` (warning disappears)

4. On send: set state to `submitting` → await API → on success set `success`, on error set `error`

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

**Validation:** `message` empty or missing → 400 `{ error: 'Missing message' }`.

**Email via Resend:**
- `from`: `'Долгое наступление <noreply@slowreading.club>'`
- `to`: `'hello@slowreading.club'`
- `subject`: `'Обратная связь'` + (name ? ` от ${name}` : `''`)
- `text` template:
  ```
  Имя: ${name || 'не указано'}
  Email: ${email || 'не указан'}

  ${message}
  ```

**Responses:**
- `{ ok: true }` — 200
- `{ error: 'Missing message' }` — 400
- `{ error: 'Failed to send' }` — 500

Sending is **synchronous** (not fire-and-forget) — the client needs to know if Resend fails.

---

## Out of Scope

- Rate limiting (if spam becomes an issue: Vercel rate limiting middleware or in-memory counter per IP is the recommended approach)
- Storing messages in DB
- Admin panel view of messages
