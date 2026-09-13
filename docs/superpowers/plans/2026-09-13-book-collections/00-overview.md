# Подборки книг — план реализации (обзор)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Участники собирают тематические подборки из книг каталога, делятся ссылкой и записываются на книги со страницы подборки; владелец модерирует создание (до публикации) и правки (после).

**Architecture:** Две новые таблицы (`book_collections`, `book_collection_items`) и таблица настроек `site_settings`. Вся бизнес-логика — чистые функции в `lib/collections/` (статусы, правила, разница, форматирование); слой БД — `lib/collections/repo.ts`; API-роуты тонкие. UI — inline-стили на токенах `app/globals.css` и примитивах `.p-*`, существующие `BookCard` / `BookCardMobile`, `AuthModal`, `ContactsForm`, `MarkdownToolbar`, `SummaryMarkdown`, `CoverImage`, `AuthorAvatar`.

**Tech Stack:** Next.js 14 App Router, NextAuth v5, Drizzle ORM + Neon Postgres, Jest + Testing Library, Playwright, `next/og`.

**Spec:** `docs/superpowers/specs/2026-09-12-book-collections-design.md` — читать целиком до начала. План спорит со спекой только в пунктах «Уточнения к спеке» ниже.

## Global Constraints

- Прямой push в `main` запрещён. Каждый PR — отдельный worktree от свежего `origin/main`, **соседний** с основным чекаутом (`../book-club-collections-N`), не внутри `.claude/worktrees/` (Jest игнорирует этот путь и молча находит 0 тестов).
- Перед каждым коммитом: `npm run lint && npm run typecheck && npm test` зелёные; в ответе явно: «E2E: нужен / не нужен — причина» и «Wiki: нужна / не нужна — причина».
- `--no-verify` запрещён.
- Цвета — только `var(--…)`; сырой hex в `style={{…}}` ломает pre-commit (`scripts/check-no-raw-hex.sh`). Исключение — `ImageResponse` в OG-роуте (CSS-переменные там не работают): значения выносятся в константы с комментарием-ссылкой на токен.
- Углы прямые (`var(--radius)`), теней нет, акцент — линией. Шрифты: `--nd-serif`, `--nd-sans`, `--nd-mono`.
- Каждая мутация БД — внутри `withAuditContext`. Новые таблицы — в `AUDITED_TABLES` + триггер в миграции.
- Роуты, читающие БД, — `export const dynamic = 'force-dynamic'`.
- Лимиты (из спеки, дословно): название ≤ 120; подпись ≤ 60; описание ≤ 5000; текстов ≤ 50; для отправки на проверку ≥ 2 текстов, опубликованных в каталоге; для черновика обязательно только название.
- Статусы: `draft | pending | published | rejected | hidden`. Действия: `submit` (автор), `publish`, `reject`, `mark_reviewed`, `hide`, `unhide` (админ). `reject` и `hide` требуют непустую причину.
- Перестановка текстов опубликованной подборки не отправляет её в очередь и не поднимает в списках.
- Автор удаляет только неопубликованные подборки; админ — любые.
- Адрес подборки присваивается при первой публикации, не меняется; `new` зарезервирован.
- Блок на главной выключен, пока в `site_settings` нет строки `collections_home_block_enabled = true`.
- Счётчики — «текст / текста / текстов».
- Прод-миграцию `drizzle/0066_book_collections.sql` применяет **только владелец** (или агент после его явного «да»). В e2e-ветку Neon агент применяет её сам перед первым E2E: `node --env-file=.env.test.local scripts/apply-migration.mjs drizzle/0066_book_collections.sql`.

---

## Уточнения к спеке, принятые при планировании

1. **`site_settings` — колонка `id`, а не `key`.** `audit_capture()` берёт `entity_id` из поля `id` строки (`drizzle/0040_audit_triggers.sql`); с колонкой `key` у записей аудита не было бы идентификатора.
2. **Добавлена колонка `book_collections.submitted_at`.** Профиль показывает «отправлена 11 сентября», а очередь модерации сортируется по времени отправки; `updated_at` для этого не годится — он меняется на каждом автосохранении.
3. **Отдельного «окна подробностей книги» на странице подборки нет.** `BookDetailProvider` работает только внутри доски матчинга (зависит от `useMatchingBoard`), а в каталоге на главной модального окна нет — карточка сама разворачивает описание. Страница подборки использует ту же карточку, что каталог.
4. **Запись на одну книгу** — новые `POST` / `DELETE /api/signup-books/[bookId]`. Они читают текущий список пользователя на сервере и вызывают общую функцию `saveSignupSelection`, вынесенную из `POST /api/signup`. Так сохраняется поведение при активной сессии матчинга (`runMatchingTransition` с `replace_signup`) и инвариант рангов.
5. **Гость открывает `/collections/new`** → редирект на `/collections?create=1`; страница списка открывает окно входа и сохраняет намерение «собрать подборку».
6. **Картинка превью** встраивает только обложки `image/png` и `image/jpeg`; остальное — прямоугольник с инициалами автора.

## Карта файлов

| Файл | Ответственность | PR |
|---|---|---|
| `lib/slug.ts` | транслитерация и уникальный адрес (вынесено из календаря) | 1 |
| `drizzle/0066_book_collections.sql` + `.test.ts` | таблицы, индексы, триггеры аудита | 1 |
| `lib/db/schema.ts` | `bookCollections`, `bookCollectionItems`, `siteSettings` | 1 |
| `lib/audit/audited-tables.ts` | +3 таблицы | 1 |
| `lib/collections/types.ts` | общие типы и лимиты | 1 |
| `lib/collections/errors.ts` | `CollectionError`, распознавание «таблицы нет» | 1 |
| `lib/collections/rules.ts` | права, валидация, классификация правок, переходы, планы патчей | 1 |
| `lib/collections/diff.ts` | разница со снимком и сводка | 1 |
| `lib/collections/format.ts` | склонения, выжимка Markdown, даты, тексты ошибок | 1 |
| `lib/collections/repo.ts` | чтение и запись в БД | 1 |
| `lib/collections/http.ts` | ответы ошибок, аудит-контекст, разбор тела | 1 |
| `lib/site-settings.ts` | чтение и запись настроек | 1 |
| `lib/books.ts` | `fetchBooksByIds`, `orderRowsByIds` | 1 |
| `lib/signup-books.ts` | `getUserSignupState` | 1 |
| `lib/signup-selection.ts` | общая логика сохранения списка книг | 1 |
| `app/api/signup/route.ts` | использует `saveSignupSelection` | 1 |
| `app/api/signup-books/[bookId]/route.ts` | запись и снятие одной книги | 1 |
| `app/api/collections/**`, `app/api/me/collections/**`, `app/api/admin/collections/**` | API | 1 |
| `components/nd/BookCard.tsx`, `BookCardMobile.tsx` | проп `ignoreClubStatus` | 2 |
| `lib/collections/intents.ts` | намерения гостя в `localStorage` | 2 |
| `components/nd/CollectionStackCard.tsx` | карточка «стопка корешков» | 2 |
| `components/nd/CollectionsIndex.tsx`, `app/collections/page.tsx` | «Все подборки» | 2 |
| `components/nd/CollectionPageClient.tsx`, `CollectionStatusBanner.tsx`, `app/collections/[slugOrId]/page.tsx` | страница подборки | 2 |
| `components/nd/CollectionEditor.tsx`, `CollectionBookSearch.tsx`, `useCollectionAutosave.ts`, `app/collections/new/page.tsx`, `app/collections/[slugOrId]/edit/page.tsx` | редактор | 2 |
| `components/nd/ProfileCollectionsTab.tsx`, `ProfileDrawer.tsx` | вкладка профиля | 2 |
| `app/api/og/collections/[slug]/route.tsx`, `lib/collections/og.ts` | картинка превью | 2 |
| `e2e/fixtures.ts`, `e2e/collections.spec.ts`, `e2e/collections-layout.spec.ts` | E2E | 2 |
| `components/nd/AdminCollectionsPanel.tsx`, `AdminCollectionReview.tsx`, `CollectionReasonSheet.tsx`, `AdminPanel.tsx` | модерация | 3 |
| `e2e/collections-admin.spec.ts` | E2E модерации | 3 |
| `components/nd/CollectionsCarousel.tsx`, `HomeCollectionsBlock.tsx`, `BooksPage.tsx`, `app/page.tsx` | блок на главной | 4 |
| `e2e/collections-home.spec.ts` | E2E главной | 4 |
| `components/nd/Header.tsx` | ссылка «Подборки» | 5 |
| `docs/features/collections.md`, `docs/wiki/Book-Collections.md`, `public/openapi.json` + wiki-страницы из спеки | документация | 1–5 |

## Общие контракты

Эти имена используются в нескольких PR. Меняешь — меняй везде.

```ts
// lib/collections/types.ts
export type CollectionStatus = 'draft' | 'pending' | 'published' | 'rejected' | 'hidden'
export type CollectionAction = 'submit' | 'publish' | 'reject' | 'mark_reviewed' | 'hide' | 'unhide'
export type AdminCollectionAction = Exclude<CollectionAction, 'submit'>
export const COLLECTION_LIMITS: { titleMax: 120; displayNameMax: 60; descriptionMax: 5000; booksMinToSubmit: 2; booksMax: 50 }
export interface CollectionSnapshot { title: string; descriptionMarkdown: string; displayName: string; bookIds: string[] }
export interface CollectionRecord extends CollectionSnapshot { id; slug: string | null; authorUserId; status; moderationReason: string | null; submittedAt; editedAt; publishedAt; reviewedAt: Date | null; reviewedSnapshot: CollectionSnapshot | null; createdAt; updatedAt: Date }
export interface SerializedCollection /* CollectionRecord с датами в ISO-строках */
export interface CollectionViewer { userId: string | null; isAdmin: boolean }
export interface CollectionCoverBook { id: string; title: string; author: string; coverUrl: string | null }
export interface CollectionListItem { id: string; slug: string; title: string; textsCount: number; covers: CollectionCoverBook[]; sortAt: string }
export interface MyCollectionItem { id; slug: string | null; title; status; moderationReason: string | null; textsCount: number; covers: CollectionCoverBook[]; changedAt: string; submittedAt: string | null }
export interface AdminQueueItem { id; slug: string | null; title; displayName; status; textsCount; covers; at: string; diffSummary: DiffSummary | null }
export interface AdminCollectionQueue { pending; changed; published; rejectedOrHidden: AdminQueueItem[] }
export interface CollectionBookSearchResult extends CollectionCoverBook { year: string; isArticle: boolean; clubStatus: 'reading' | 'read' | null }
export interface EditorBook extends CollectionBookSearchResult { hiddenFromCatalog: boolean }

// lib/collections/types.ts — DiffSummary (diff.ts реэкспортирует); lib/collections/diff.ts — CollectionDiff
export interface DiffSummary { added: number; removed: number; textChanged: boolean; orderChanged: boolean }
export interface CollectionDiff { added: string[]; removed: string[]; moved: Array<{ bookId: string; from: number; to: number }>; title; description; displayName: { before: string; after: string } | null }

// lib/collections/repo.ts
loadCollectionById(id, client?): Promise<CollectionRecord | null>
loadCollectionBySlugOrId(ref, client?): Promise<CollectionRecord | null>
loadCollectionPageData(ref, viewer, client?): Promise<{ record; books: Array<{ book: BookWithCover; hiddenFromCatalog: boolean }> } | null>
loadEditorBooks(bookIds, client?): Promise<EditorBook[]>
listPublishedCollections(client?): Promise<CollectionListItem[]>
listMyCollections(userId, client?): Promise<MyCollectionItem[]>
listAdminQueue(client?): Promise<AdminCollectionQueue>
searchPublishedBooks(query, client?): Promise<CollectionBookSearchResult[]>
createDraftCollection(tx, { authorUserId, title, now }): Promise<CollectionRecord>
saveCollectionContent(tx, { id, content: CollectionSnapshot, by: 'author' | 'admin', now }): Promise<CollectionRecord>
submitCollection(tx, { id, now }): Promise<CollectionRecord>
applyAdminCollectionAction(tx, { id, action: AdminCollectionAction, reason: string | null, now }): Promise<CollectionRecord>
deleteCollection(tx, id): Promise<void>
serializeCollection(record): SerializedCollection

// lib/site-settings.ts
getSiteSetting('collections_home_block_enabled', client?): Promise<boolean>
setSiteSetting(tx, 'collections_home_block_enabled', value: boolean): Promise<void>

// lib/collections/intents.ts (PR 2)
saveSignupIntent({ collectionRef, bookId }); consumeSignupIntent(collectionRef): string | null
saveCreateIntent(); consumeCreateIntent(): boolean

// HTTP
GET    /api/collections                              → { collections: CollectionListItem[] }
GET    /api/collections/[slugOrId]                   → { collection: SerializedCollection; books: Array<{ book; hiddenFromCatalog }> }
GET    /api/collections/book-search?q=               → { books: CollectionBookSearchResult[] }
GET    /api/me/collections                           → { collections: MyCollectionItem[] }
POST   /api/me/collections        { title }          → 201 { collection }
PATCH  /api/me/collections/[id]   CollectionSnapshot → { collection }
DELETE /api/me/collections/[id]                      → { ok: true } | 403
POST   /api/me/collections/[id]/submit               → { collection } | 400 { error: 'validation', issues }
GET    /api/admin/collections                        → { queue: AdminCollectionQueue }
GET    /api/admin/collections/[id]                   → { collection; books: EditorBook[]; diff: CollectionDiff | null }
PATCH  /api/admin/collections/[id] CollectionSnapshot → { collection }
DELETE /api/admin/collections/[id]                   → { ok: true }
POST   /api/admin/collections/[id]/actions { action, reason? } → { collection }
GET    /api/admin/collections/settings               → { homeBlockEnabled: boolean }
PATCH  /api/admin/collections/settings { homeBlockEnabled } → { homeBlockEnabled }
POST   /api/signup-books/[bookId]                    → { ok: true } | 404 | 409 { error: 'contacts_required' }
DELETE /api/signup-books/[bookId]                    → { ok: true }
GET    /api/og/collections/[slug]                    → image/png
```

Коды ошибок API: `not_found` 404, `forbidden` 403, `invalid_transition` 409, `validation` 400 (+ `issues: string[]`), `book_not_published` 400 (+ `bookIds`), `migration_required` 409, прочее — 500 `collections_failed`.

## Порядок PR

| PR | План | Зависит от | Что проверяет E2E | Wiki |
|---|---|---|---|---|
| 1 | `01-data-and-api.md` | — | не нужен: только API и логика, покрыто Jest | нужна: новые таблицы, API, миграция |
| 2 | `02-author-and-reader-ui.md` | PR 1 в `main`, миграция в e2e-ветке | создание, автосохранение, отправка, страница, запись, намерение гостя, статусы клуба | нужна: пользовательская фича |
| 3 | `03-moderation.md` | PR 2 | публикация, разница, перестановка, скрытие, удаление | нужна: админский workflow |
| 4 | `04-home-block.md` | PR 3 (переключатель в админке) | включение и выключение блока, карусель | нужна: главная |
| 5 | `05-header-link.md` | макет дизайнера, PR 2 | ссылка в шапке | нужна: навигация |

После мержа каждого PR: сообщить владельцу, что соседний worktree можно удалить (`git worktree remove ../book-club-collections-N`); следующий PR — от свежего `origin/main`.

После мержа PR 1 — напомнить владельцу применить миграцию на прод:

```bash
node --env-file=.env.local scripts/apply-migration.mjs drizzle/0066_book_collections.sql
```
