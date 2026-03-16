# ProfileDrawer Improvements — Design Spec
_2026-03-16_

## Scope

Six UX improvements to the `ProfileDrawer` component implemented in #54. No new pages — all changes are within the drawer, its props, and its data layer.

---

## 1. Auth Badge — Move to Profile Tab

**What:** Remove the Google auth badge ("Вошли через Google") from the drawer header. Show it only inside the Profile tab, inside the new "Google-аккаунт" block (see §2).

**Change:** `ProfileDrawer.tsx` — delete the badge `<div>` from the header section.

---

## 2. Sign-Out Button — Move to Profile Tab

**What:** Remove the sign-out button from the drawer footer. Add a "Google-аккаунт" block at the **top** of the Profile tab:

```
[GOOGLE-АККАУНТ]  ← section label
┌──────────────────────────────────┐
│ 🟦 Вошли через Google            │
│ anna@gmail.com          [Выйти]  │
└──────────────────────────────────┘
```

- Email from `session.user.email`
- «Выйти» calls `signOut({ callbackUrl: '/' })` — redirects to home after sign-out
- Block appears **before** the contacts form fields, separated by a section label

---

## 3. Unsubscribe Toggle on "Записал:ась" Tab

### Data layer

Unsubscribing reuses the existing `saveSelection(name, contacts, books)` mechanism in `BooksPage.tsx`, which calls `POST /api/signup` and **replaces the full `selectedBooks` array** in Google Sheets. No new endpoint needed.

### Prop change in `BooksPage.tsx`

Add a new callback prop to `ProfileDrawer`:

```ts
onToggleBook: (bookName: string) => Promise<void>
```

`BooksPage` implements it as:

```ts
async function handleToggleByName(bookName: string): Promise<void> {
  // No auth guards — user is already logged in with a profile to see the drawer
  const next = selectedBooks.includes(bookName)
    ? selectedBooks.filter(n => n !== bookName)
    : [...selectedBooks, bookName]
  setSelectedBooks(next)
  try {
    await saveSelection(effectiveUser!.name, effectiveUser!.contacts, next)
  } catch (err) {
    // Rollback BooksPage state
    setSelectedBooks(selectedBooks)
    throw err  // re-throw so ProfileDrawer can execute its own rollback
  }
}
```

Pass `handleToggleByName` to `<ProfileDrawer onToggleBook={handleToggleByName} />`.

### UI behaviour

Each book row in "Записал:ась" tab:

```
● Сто лет одиночества        ×
  Г. Г. Маркес
```

**On × click:**
1. **Optimistic update** in drawer: bullet → grey, title → strikethrough, × → «↩ вернуть»
2. `await onToggleBook(bookName)`
3. On success → toast «Вы успешно отписал:ись от "[название]"»
4. On error → **rollback**: restore original visual state + toast «Не удалось отписаться»

**On «↩ вернуть» click:**
1. Optimistic update: restore normal state
2. `await onToggleBook(bookName)`
3. On success → toast «Вы успешно записал:ись на "[название]"»
4. On error → rollback: re-apply strikethrough + toast «Не удалось записаться»

**Page reload:** `selectedBooks` comes from the server. Unsubscribed books are absent — they do not appear in the drawer.

### Toast

Single local toast primitive in `ProfileDrawer.tsx`, shared by all features (§3 and §6):

```ts
const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
```

- Fixed-position, bottom-right, `z-index: 9999`
- Auto-dismisses after 3 seconds
- New toast replaces any visible toast
- `setTimeout` cleared via `useEffect` cleanup to avoid setting state on unmounted component:
  ```ts
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])
  ```

---

## 4. Gender-Neutral Writing (Гендергэп)

Update strings in `ProfileDrawer.tsx`:

| Old | New |
|-----|-----|
| «Записался» | «Записал:ась» |
| «Предложил» | «Предложил:а» |
| «Вы ещё не записались…» | «Вы ещё не записал:ись…» |
| «Книги, на которые вы записались» | «Книги, на которые вы записал:ись» |

---

## 5. Withdraw Pending Submission

### New API endpoint

**File:** `app/api/submissions/[id]/route.ts` (new file — dynamic segment, separate from `app/api/submissions/route.ts` and from `app/api/admin/submissions/[id]/route.ts`)

```ts
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select()
    .from(bookSubmissions)
    .where(and(eq(bookSubmissions.id, params.id), eq(bookSubmissions.userId, session.user.id)))
    .limit(1)

  if (!rows.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await db.delete(bookSubmissions).where(eq(bookSubmissions.id, params.id))
  return NextResponse.json({ ok: true })
}
```

Ownership enforced by the `userId` condition — users can only delete their own submissions.

### UI

On «Предложил:а» tab, each card with `status === 'pending'` shows a small «Отозвать» text button below the status badge.

**Flow:**
1. Click «Отозвать» → button disabled immediately (prevents double-click)
2. `window.confirm('Отозвать предложение «[название]»?')`
3. On cancel → re-enable button, do nothing
4. On confirm → `DELETE /api/submissions/[id]`
5. On success → remove from local `submissions` state (optimistic, already removed)
6. On error → re-enable button + inline error text «Не удалось отозвать»

### submissionsLoaded flag

`submissionsLoaded` is a one-shot flag that persists while the component is mounted. After a withdrawal, the submission is removed from local state. On drawer re-open (without page reload), the updated local state is shown correctly — no re-fetch needed. This is intentional.

### Test file

`app/api/submissions/[id]/route.test.ts` covering: auth required, own submission deleted successfully, another user's submission returns 404, non-existent id returns 404.

---

## 6. Language Preferences

### DB migration

1. Add `languages: text('languages')` to the `users` table in `lib/db/schema.ts`
2. Run `npx drizzle-kit generate` to create the migration SQL in `lib/db/migrations/`
3. Run `npx drizzle-kit migrate` to apply

### Null vs empty semantics

- `null` in DB = user has never interacted with language preferences → UI shows all buttons inactive + hint «Выберите языки чтения»
- `'[]'` in DB = user explicitly saved with nothing selected → UI shows all buttons inactive, no hint
- `'["ru","en"]'` = normal selection

### New API endpoint

**File:** `app/api/profile/route.ts`

```ts
// GET — returns raw null or parsed array; does NOT normalize null to []
GET /api/profile → { languages: string[] | null }

// PATCH — saves JSON string; first save of [] writes '[]', not null
PATCH /api/profile  body: { languages: string[] } → { languages: string[] }
```

GET queries: `db.select({ languages: users.languages }).from(users).where(eq(users.id, session.user.id))`

If no rows returned (deleted account edge case) → `return NextResponse.json({ languages: null })`.
Returns `{ languages: null }` if the column is null, `{ languages: string[] }` if set. Client uses `null` to decide whether to show the "never saved" hint.

**Test file:** `app/api/profile/route.test.ts` covering: auth required, GET returns null for new user, GET returns parsed array, PATCH saves and returns updated value.

### UI — Language toggles on Profile tab

Location: after the contacts form «Сохранить» button, before «Удалить аккаунт».

**Always visible:** «На русском» (`ru`), «In English» (`en`)

**Hidden behind «+ ещё»:** Auf Deutsch (`de`), En français (`fr`), En español (`es`), In italiano (`it`), Português (`pt`), 日本語 (`ja`), 中文 (`zh`), Polski (`pl`), Nederlands (`nl`), Svenska (`sv`), Türkçe (`tr`)

**«+ ещё»:** Dashed border button. Click = expands inline (all hidden languages appear). «+ ещё» becomes «скрыть» when expanded.

**Toggle button style:** Active = `background: #111; color: #fff; border: 1px solid #111`. Inactive = `background: #fff; color: #111; border: 1px solid #E5E5E5`.

### Loading state

`GET /api/profile` is fetched when the Profile tab is first activated (lazy). Until the GET resolves:
- Language toggle buttons are **disabled** (not just dimmed) — `disabled` attribute + reduced opacity
- This prevents a partial-state PATCH race where a toggle fires before the current server state is known

### Auto-save with debounce

After each toggle, wait **500ms** (debounce), then `PATCH /api/profile` with the full current selection. If another toggle fires within 500ms, restart the timer. This prevents race conditions from rapid clicks.

On PATCH error → show error toast «Не удалось сохранить языки» (reuse toast from §3). Selected state is **not** rolled back — the user's local selection is preserved and they can retry via the «Сохранить» button (contacts form button does not save languages — languages auto-save independently).

---

## Files Affected

| File | Change |
|------|--------|
| `components/nd/ProfileDrawer.tsx` | All UI changes (items 1–6), new `onToggleBook` prop |
| `components/nd/BooksPage.tsx` | Add `handleToggleByName`, pass as `onToggleBook` to `ProfileDrawer` |
| `lib/db/schema.ts` | Add `languages: text('languages')` to `users` |
| `lib/db/migrations/` | Generated by `drizzle-kit generate` |
| `app/api/submissions/[id]/route.ts` | New — user DELETE with ownership check |
| `app/api/submissions/[id]/route.test.ts` | New test file |
| `app/api/profile/route.ts` | New — GET + PATCH for languages |
| `app/api/profile/route.test.ts` | New test file |
| `BACKLOG.md` | Add completed items post-factum |

---

## Out of Scope

- No changes to book cards, header, or other pages
- No email notifications for withdrawals
- No admin visibility into language preferences
- No server-side validation of language codes (trust the client enum)
