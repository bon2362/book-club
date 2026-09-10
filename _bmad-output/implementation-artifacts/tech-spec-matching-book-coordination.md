---
title: 'Координация по книгам в админке Matching'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
baseline_commit: 'a762353b'
context:
  - 'docs/features/matching.md'
  - 'docs/wiki/Group-Matching-Mode.md'
  - 'components/nd/AdminMatchingSession.tsx'
  - 'app/api/admin/matching/sessions/[id]/participants/route.ts'
  - 'lib/matching/book-public-state.ts'
  - 'lib/matching/book-partition.ts'
  - 'historical: lib/matching/scenarios.ts at c78d48d'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'Next.js 14 App Router / TypeScript'
  - 'React client components'
  - 'Drizzle ORM / Neon Postgres'
  - 'Jest + React Testing Library'
  - 'Playwright focused E2E for admin workflow if layout or persistence behavior changes'
files_to_modify:
  - 'lib/matching/coordination-radar.ts'
  - 'lib/matching/__tests__/coordination-radar.test.ts'
  - 'app/api/admin/matching/sessions/[id]/coordination/route.ts'
  - 'app/api/admin/matching/sessions/[id]/coordination/route.test.ts'
  - 'components/nd/AdminMatchingBookCoordination.tsx'
  - 'components/nd/AdminMatchingBookCoordination.test.tsx'
  - 'components/nd/AdminMatchingSession.tsx'
  - 'components/nd/AdminMatchingSession.test.tsx'
  - 'docs/features/matching.md'
  - 'docs/wiki/Group-Matching-Mode.md'
code_patterns:
  - 'Admin-only reads start with auth() and return 403 for non-admin users.'
  - 'Matching admin state is loaded from AdminMatchingSession via fetch() for the selected session.'
  - 'Pure matching calculations live under lib/matching/ and get focused Jest tests.'
  - 'Participant-facing public state hides completed participants, but admin read models may include them when they are needed for controls.'
  - 'Matching UI uses semantic tokens from app/globals.css, not raw colors.'
test_patterns:
  - 'Pure logic tests in lib/matching/__tests__/*.test.ts.'
  - 'Route handler tests mock auth and db query chains next to the route.'
  - 'Component tests mock fetch and assert rendered copy/actions with React Testing Library.'
---

# Координация по книгам в админке Matching

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Администратор видит участников сессии и их уже сделанные matching-выборы, но не видит удобной книжной картины спроса: какие книги одновременно есть в списках «Хочу читать» у нескольких активных участников, как сильны эти пересечения по рангам и кто из людей уже записался, включил авто-запись или пока только держит книгу в списке. Из-за этого координатор собирает эту информацию вручную или внешним ИИ и затем транслирует её в чат.

**Approach:** Под существующей таблицей «Участники» добавить read-only блок «Координация по книгам». Блок показывает только книги, где минимум три активных участника текущей сессии держат книгу в «Хочу читать» с `personal_status IS NULL`. Сортировка строится по силе пересечений и рангов, а окончательные и автоматические записи показываются как контекст после показателей интереса. Блок не даёт автоматических рекомендаций и не меняет механику формирования кругов.

## Boundaries & Constraints

**Always:** Считать координаторский радар только для админки; не показывать его обычным участникам; включать только активных участников текущей сессии с `completed_at IS NULL`; включать книгу в блок только при трёх и более активных shortlist-пересечениях; считать интерес по `signup_books.personal_status IS NULL`; показывать у участника любые текущие книги со статусом `reading` справочно, независимо от текущей matching-сессии; показывать сформированные книги, но не использовать факт сформированного круга в сортировке; использовать только read-only запросы; сохранить текущую таблицу «Участники» и её действия.

**Ask First:** Любое расширение за пределы read-only радара: автоматические рекомендации координатору, подсказки конкретных действий, учёт `reading` в сортировке или score, изменение правил формирования книги, замена текущей таблицы участников вместо добавления отдельного блока, либо любые мутации в новом coordination endpoint.

**Never:** Не возвращать пользовательский экран сценариев; не показывать новый блок не-админам; не считать выпущенных читать участников как активный спрос; не учитывать `read` и `reading` как активный интерес по конкретной книге; не использовать число собранных кругов как часть score; не добавлять новую таблицу БД или миграцию для read-only расчёта.

## Core Product Rules

- Блок называется «Координация по книгам» и располагается под существующей таблицей «Участники» в админке Matching.
- Текущая таблица участников остаётся отдельным блоком: добавление/удаление участника, источник вступления, роль, дата вступления, текущие записи и ссылка `/matching?as={userId}` сохраняются в прежнем workflow.
- Книга попадает в радар, если минимум три активных участника текущей сессии добавили её в «Хочу читать» и по этой книге у них `signup_books.personal_status IS NULL`.
- Уже сформированные книги показываются наравне с остальными, потому что одна книга может собрать несколько кругов.
- Участники с `matching_session_participants.completed_at IS NOT NULL` исключаются из расчёта активного спроса.
- Если активный участник читает любую другую книгу (`signup_books.personal_status = 'reading'`), эти названия показываются рядом с ним как справка. Эта справка не влияет на score.
- Если подходящих книг нет, блок показывает тихую строку: «Пока нет книг с тремя активными пересечениями».

## Coordination Metrics

Для каждой книги вернуть агрегаты:

- `interestedCount` — сколько активных участников держат книгу в «Хочу читать» и могут участвовать в подборе по этой книге;
- `topThreeCount` — сколько из них поставили книгу на места 1-3;
- `avgRank` — средний ранг среди участников с известным рангом;
- `worstRank` — худший известный ранг;
- `unrankedCount` — сколько строк интереса не имеют ранга; ожидаемо редко из-за обязательных рангов, но старые/краевые данные не должны ломать расчёт;
- `hardCount` — сколько активных участников сделали окончательную запись на эту книгу;
- `conditionalCount` — сколько активных участников включили авто-запись;
- `assignedCount` — сколько активных участников уже назначены в круг по этой книге. Этот счётчик показывается справочно и не участвует в сортировке.

Сортировка книг:

1. больше `interestedCount`;
2. больше `topThreeCount`;
3. ниже `avgRank`, `null` считать хуже любого числового значения;
4. ниже `worstRank`, `null` считать хуже любого числового значения;
5. больше `hardCount`;
6. больше `conditionalCount`;
7. стабильный tie-breaker по названию книги и `bookId`.

Записи идут после пересечений и рангов намеренно: задача блока — показать силу общего книжного интереса, а не «почти сформированные» книги.

## Participant Display Rules

Внутри книги показывать участников, которые вошли в `interestedCount`. Для каждого участника:

- имя;
- ранг в формате `#2` или `без ранга`;
- статус по этой книге: `в круге`, `записался`, `авто-запись`, `в списке`;
- `readingNowTitles`, если у человека есть любые книги в статусе `reading`.

Приоритет статуса на одной книге:

1. `в круге`, если есть `matching_book_assignments` по этой книге;
2. `записался`, если есть `matching_book_intents.kind = 'hard'`;
3. `авто-запись`, если есть `matching_book_intents.kind = 'conditional'`;
4. `в списке`, если есть только `signup_books` + `book_priorities`.

Порядок людей внутри книги: ниже ранг выше; затем статус в порядке `в круге`, `записался`, `авто-запись`, `в списке`; затем имя. Этот порядок делает список сканируемым, но не влияет на score книги.

## UX Shape

Блок размещается под таблицей участников и перед журналом событий, чтобы координатор сначала видел состав людей, потом книжную картину, потом историю действий.

Верх блока:

- заголовок «Координация по книгам»;
- короткая подпись: «Книги, которые есть в списках минимум у трёх активных участников. Сортировка — по силе пересечений и рангам.»;
- кнопка обновления, аналогичная refresh у участников.

Карточка/строка книги:

- название и автор;
- строка агрегатов: `5 в списках · топ-3: 4 · средний ранг 2.6 · худший 5 · 1 записался · 1 авто · 1 в круге`;
- раскрытый или компактный список участников. Первый вариант реализации может показывать список сразу, потому что блок админский и количество участников обычно небольшое.

Пример участника:

`#2 Светлана · в списке · читает сейчас: «Другая книга»`

Если `readingNowTitles` содержит несколько книг, показывать `читает сейчас: «A», «B»`. Если список станет длинным, это можно позже свернуть до счётчика, но в первом варианте лучше отдавать координатору фактические названия.

## Data Contract

Предпочтительный endpoint: `GET /api/admin/matching/sessions/[id]/coordination`.

Ответ:

```ts
interface MatchingCoordinationResponse {
  success: true
  data: {
    sessionId: string
    generatedAt: string
    books: CoordinationBook[]
  }
}

interface CoordinationBook {
  bookId: string
  title: string
  author: string
  coverUrl: string | null
  metrics: {
    interestedCount: number
    topThreeCount: number
    avgRank: number | null
    worstRank: number | null
    unrankedCount: number
    hardCount: number
    conditionalCount: number
    assignedCount: number
  }
  participants: CoordinationParticipant[]
}

interface CoordinationParticipant {
  userId: string
  publicRef: string
  name: string
  rank: number | null
  status: 'assigned' | 'hard' | 'conditional' | 'interest'
  readingNowTitles: string[]
}
```

Не-админ получает `403`. Несуществующая сессия возвращает `404`, чтобы отличить ошибку id от пустой координации.

## Code Map

- `components/nd/AdminMatchingSession.tsx` — текущий экран админки Matching; добавить загрузку coordination state для выбранной сессии и отрендерить новый блок под таблицей участников.
- `components/nd/AdminMatchingBookCoordination.tsx` — новый client component для read-only блока, чтобы не раздувать `AdminMatchingSession.tsx`.
- `app/api/admin/matching/sessions/[id]/participants/route.ts` — источник текущего participants workflow; не заменять, использовать как соседний паттерн admin auth и загрузки choices.
- `app/api/admin/matching/sessions/[id]/coordination/route.ts` — новый read-only route handler.
- `lib/matching/coordination-radar.ts` — чистый расчёт метрик, фильтрации и сортировки по входным rows; не завязывать на React или Drizzle.
- `lib/matching/book-public-state.ts` — источник актуальных правил: completed participants исключаются из participant-facing агрегатов, `reading` перекрывает действие по книге, assignments/intents дают статусы.
- `lib/matching/book-partition.ts` — источник порогов формирования; новый блок не меняет эти пороги, но может использовать названия констант в тестах/документации при необходимости.
- Historical `lib/matching/scenarios.ts` at `c78d48d` — использовать как reference для score fields: `strongInterestCount`, `avgRank`, `worstRank`, `unrankedCount`; не переносить старый scenario-set UI и beam-search.
- `docs/features/matching.md` и `docs/wiki/Group-Matching-Mode.md` — обновить после реализации, потому что меняется admin workflow.

## Data Query Plan

Route handler должен собрать:

- участников выбранной сессии из `matching_session_participants` + `users`, включая `publicRef`, `completedAt`, `joinedAt`;
- shortlist rows из `signup_books` по `userId` активных участников, только опубликованные книги, только `personal_status IS NULL` для расчёта радара;
- ранги из `book_priorities` для тех же пар `userId/bookId`;
- reading context из `signup_books.personal_status = 'reading'` по тем же активным участникам, с названиями опубликованных книг;
- intents из `matching_book_intents` текущей сессии;
- assignments из `matching_book_assignments` текущей сессии;
- book metadata из `books`.

Фильтр активного участника для радара: `completedAt === null`. Observer/assigned role не должен сам по себе исключать человека: в текущей модели назначение на одну книгу не мешает выбирать другие. Исключение — человек, отправленный читать (`completed_at`), потому что он уже не находится в активном выборе.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| Сильное пересечение | 4 активных участника держат книгу в shortlist, ранги 1/2/2/5 | Книга попадает в блок; `interestedCount=4`, `topThreeCount=3`, `avgRank=2.5`, `worstRank=5` | Нет ошибки |
| Недостаточно пересечений | Только 2 активных участника держат книгу в shortlist | Книга не попадает в блок | Если ни одной книги нет, показать тихую строку |
| Reading по этой книге | У активного участника книга в `signup_books` со статусом `reading` | Эта пара не входит в `interestedCount`; книга может остаться в блоке за счёт других людей | Reading title показывается у участника в других книгах |
| Reading другая книга | У участника есть другая книга `personal_status='reading'` | У участника показывается `читает сейчас: «...»`; score не меняется | Нет ошибки |
| Выпущенный участник | `completed_at IS NOT NULL` | Участник исключён из радара и reading context блока | Существующая таблица участников продолжает показывать его как `читает` |
| Уже сформированная книга | По книге есть assignments/circles | Книга всё равно показывается, если есть минимум 3 активных shortlist-пересечения; `assignedCount` справочный | Assignments не участвуют в сортировке |
| Равные метрики | Две книги имеют одинаковые counts и ranks | Стабильный порядок по title, затем bookId | Нет случайного дрожания UI |
| Не-админ | Пользователь без `isAdmin` вызывает endpoint | `403 Forbidden` | UI не вызывает endpoint вне админки |

</frozen-after-approval>

## Implementation Tasks

- [ ] Task 1: Add pure coordination calculation.
  - File: `lib/matching/coordination-radar.ts`
  - Action: Define input row types, output DTO types, filtering, status derivation, metrics and sorting.
  - Notes: Keep this module DB-free. Treat `null` ranks as unranked; exclude `personal_status !== null` from active interest; exclude completed participants from all radar candidates.

- [ ] Task 2: Cover calculation behavior with focused unit tests.
  - File: `lib/matching/__tests__/coordination-radar.test.ts`
  - Action: Test three-person threshold, ranking metrics, sort order, reading context, completed exclusion, formed/assigned display without sort influence and stable tie-breaks.
  - Notes: Include a regression case where a formed book and an unformed book have equal interest/rank metrics; formed status must not decide order.

- [ ] Task 3: Add admin read-only endpoint.
  - File: `app/api/admin/matching/sessions/[id]/coordination/route.ts`
  - Action: Check `auth()` admin, load rows with Drizzle, call `buildMatchingCoordinationRadar`, return `{ success: true, data }`.
  - Notes: Follow the auth and JSON style of `participants/route.ts`. Do not wrap in `runMatchingTransition` because this endpoint does not mutate state.

- [ ] Task 4: Add route tests.
  - File: `app/api/admin/matching/sessions/[id]/coordination/route.test.ts`
  - Action: Assert 403 for non-admin; assert DB rows are mapped through pure calculation; assert empty result is returned successfully for sessions with no qualifying books.
  - Notes: Use existing route test mocking style under `app/api/admin/matching/sessions/[id]/participants/route.test.ts`.

- [ ] Task 5: Build read-only coordination component.
  - File: `components/nd/AdminMatchingBookCoordination.tsx`
  - Action: Render loading, error, empty state, refresh, sorted book cards and participant rows.
  - Notes: Use project tokens and compact admin styling. Display the exact empty copy: «Пока нет книг с тремя активными пересечениями».

- [ ] Task 6: Mount the block in admin session view.
  - File: `components/nd/AdminMatchingSession.tsx`
  - Action: Load coordination data when `selectedSessionId` changes; place the component under the participants table and before event analytics; refresh it after participant add/remove and session change.
  - Notes: Keep existing participants table behavior intact. The block is visible for selected open and closed sessions, but the data is read-only.

- [ ] Task 7: Add component integration tests.
  - Files: `components/nd/AdminMatchingBookCoordination.test.tsx`, `components/nd/AdminMatchingSession.test.tsx`
  - Action: Assert rendered metrics, participant statuses, reading context, empty copy and fetch path for the selected session.
  - Notes: Existing `AdminMatchingSession.test.tsx` mocks fetch by URL substring; extend carefully to avoid collisions with participants endpoint.

- [ ] Task 8: Update documentation.
  - Files: `docs/features/matching.md`, `docs/wiki/Group-Matching-Mode.md`
  - Action: Document the new admin coordination block, data filters, sorting and non-recommendation boundary.
  - Notes: Wiki update is required because the owner/admin workflow changes.

## Acceptance Criteria

- [ ] AC 1: Given an admin opens a matching session with at least one book held in «Хочу читать» by three active participants, when the admin views the Matching admin panel, then the «Координация по книгам» block shows that book with interested count, top-3 count, average rank, worst rank, hard count, conditional count and assigned count.
- [ ] AC 2: Given a book is held by only two active participants, when the coordination endpoint is called, then the book is omitted from the response.
- [ ] AC 3: Given no books meet the three-active-intersections threshold, when the admin views the block, then it shows «Пока нет книг с тремя активными пересечениями».
- [ ] AC 4: Given one active participant has another book with `personal_status='reading'`, when their row appears under a coordination book, then the row shows `читает сейчас: «...»` without changing the book score or sort order.
- [ ] AC 5: Given a participant has `completed_at IS NOT NULL`, when coordination data is calculated, then that participant is excluded from book eligibility, metrics and participant rows.
- [ ] AC 6: Given a book already has one or more assignments/circles, when it still has three active shortlist intersections, then it appears in the block and shows assigned participants, while assignment/circle presence does not move it above a stronger unassigned book.
- [ ] AC 7: Given two books differ by intersection count and rank quality, when they are rendered, then the order follows interested count, top-3 count, average rank, worst rank, hard count, conditional count, then stable title/bookId tie-break.
- [ ] AC 8: Given a non-admin requests `GET /api/admin/matching/sessions/[id]/coordination`, when the route runs, then it returns `403` and no coordination data.

## Testing Strategy

**Unit:** `lib/matching/__tests__/coordination-radar.test.ts` must carry most logic coverage: threshold, exclusions, rank metrics, status priority and sorting.

**Route:** `app/api/admin/matching/sessions/[id]/coordination/route.test.ts` should verify admin authorization and that route-level DB rows are passed into the pure calculation with the right filters.

**Component:** `components/nd/AdminMatchingBookCoordination.test.tsx` should verify visible admin copy and metric formatting. `AdminMatchingSession.test.tsx` should verify the block is mounted under participants and fetches the selected session endpoint.

**E2E:** Required only if implementation changes layout behavior enough to need browser geometry confidence. A read-only admin block can usually be covered by component + route tests; if the UI uses collapsible cards or responsive layout with nontrivial wrapping, add a focused Playwright check in `e2e/matching-admin.spec.ts`.

## Dependencies

- Existing matching tables and migrations through `0064`.
- Existing admin auth via `auth()`.
- Existing mandatory rank invariant for active shortlist books; unranked handling remains defensive.
- No new external services, env vars or database migrations.

## Risks & Design Notes

- **Meaning drift:** The block must not read as a recommendation engine. Keep labels factual: «в списках», «топ-3», «записался», «авто-запись», «читает сейчас».
- **Double-counting assigned readers:** A person assigned to the same book still has an assignment status, but active demand should come from shortlist rows with `personal_status IS NULL`. Do not let `matching_book_assignments` alone make a book eligible.
- **Completed participants:** Admin read models sometimes include completed participants for controls. This block is different: it is a coordination radar for people still in choice, so completed participants are excluded.
- **Historical scenario math:** Old scenario code is useful for score vocabulary and edge cases, not for direct UI revival. Do not reintroduce beam-search or scenario-set cards.
- **Admin component size:** `AdminMatchingSession.tsx` is already large. Put rendering for the new block in a separate component and keep data loading glue in the session component.

## Verification Before PR

Before committing implementation, report:

- `E2E: нужен / не нужен — [причина]`
- `Wiki: нужна — меняется admin workflow Matching`

Run at minimum:

- `npm run lint`
- `npm run typecheck`
- `npm test -- --runInBand` or a targeted Jest set plus full Jest if touched shared matching calculation
- focused E2E only if the implementation introduces nontrivial browser layout or flow behavior

## Spec Change Log

- 2026-09-10 — Initial review draft based on product brainstorming after PR #559 and current `origin/main` at `a762353b`.
