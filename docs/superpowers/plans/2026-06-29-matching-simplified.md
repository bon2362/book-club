# Matching Simplified Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить оба старых режима matching одним satisfaction-flow с реальными именами, Ranking Gate, временными подтверждениями точных кругов, автоматическим закреплением и observer-mode.

**Architecture:** Генератор сценариев остаётся чистой детерминированной функцией. Все изменения, способные повлиять на сценарии, проходят через один транзакционный сервис: блокировка сессии, мутация, пересчёт, перенос подтверждений, каскадное закрепление, события/notices и увеличение `state_version`. Клиент получает единый read-model с непрозрачными participant refs, а админка — отдельный внутренний DTO.

**Tech Stack:** Next.js 14 App Router, TypeScript, React, NextAuth v5, Drizzle ORM, Neon Postgres, Jest, Playwright, GitHub Actions, Vercel.

**Canonical spec:** `docs/superpowers/specs/2026-06-29-matching-simplified-design.md`

---

## Execution constraints

- Выполнять в отдельном worktree от свежего `origin/main`; не переключать ветку в `/Users/ekoshkin/book-club`.
- Перед изменением схемы применить skill `db-migrate` и его процедуру для Neon/Drizzle.
- Перед Playwright-правками перечитать `docs/features/testing.md`.
- Перед каждым коммитом явно зафиксировать решения по E2E и Wiki, затем выполнить `npm run lint && npm run typecheck`; перед UI-коммитами также `npm test && npm run test:e2e e2e/ui-states.spec.ts`.
- Phase A и Phase B оформляются разными PR. Phase B начинается только после merge/deploy и production smoke-check Phase A.
- Не использовать `--no-verify`, не пушить в `main`, не снимать branch protection.

## Task 1: Isolate the work and archive legacy matching

**Files:**

- Create worktree: `/Users/ekoshkin/book-club-matching-simplified`
- Reference: `docs/superpowers/specs/2026-06-29-matching-simplified-design.md`

- [ ] Проверить незавершённую работу до создания ветки:

```bash
cd /Users/ekoshkin/book-club
gh pr list
git branch --remote | rg -v 'origin/(HEAD|main)$'
git fetch origin main
```

Expected: нет неизвестного зависшего PR/ветки, требующего решения пользователя.

- [ ] Создать task-worktree от свежего `origin/main`:

```bash
git worktree add /Users/ekoshkin/book-club-matching-simplified -b codex/matching-simplified origin/main
cd /Users/ekoshkin/book-club-matching-simplified
pwd
git status --short --branch
```

Expected: `pwd` указывает на task-worktree, status чистый, ветка `codex/matching-simplified`.

- [ ] Заархивировать старую реализацию аннотированным тегом и проверить remote ref:

```bash
git tag -a matching-legacy-before-simplification-2026-06-29 origin/main -m "Matching before simplified satisfaction flow"
git push origin refs/tags/matching-legacy-before-simplification-2026-06-29
git ls-remote --tags origin matching-legacy-before-simplification-2026-06-29
```

Expected: origin возвращает tag ref; имя затем указывается в технической и Wiki-документации.

## Task 2: Add Phase A schema, constraints, and audit coverage

**Files:**

- Modify: `lib/db/schema.ts`
- Modify: `lib/audit/audited-tables.ts`
- Create: `drizzle/0048_matching_simplified.sql`
- Create: `drizzle/0048_matching_simplified.test.ts`
- Modify: `drizzle/0040_audit_triggers.test.ts`

- [ ] Сначала написать migration contract test. Он должен требовать:

  - `join_source` и `public_ref` у `matching_session_participants`;
  - nullable legacy `pseudonym` без прежнего unique index;
  - таблицы `matching_circle_confirmations`, `matching_locked_circles`, `matching_locked_circle_members`, `matching_notices`, `matching_events`;
  - PK/partial unique constraints для одного confirmation, одного активного locked membership и одного active locked `circle_key`;
  - audit triggers на всех новых мутабельных таблицах;
  - очистку одноразового matching-state, но отсутствие `DELETE/TRUNCATE` для `user`, `books`, `signup_books`, `book_priorities`.

- [ ] Запустить красный тест:

```bash
npm test -- drizzle/0048_matching_simplified.test.ts
```

Expected: FAIL — миграции и schema exports ещё нет.

- [ ] Добавить Drizzle-сущности. Целевая форма:

```ts
matchingSessionParticipants: {
  sessionId,
  userId,
  publicRef,
  pseudonym: nullableLegacyOnly,
  joinSource: 'self' | 'admin',
  joinedAt,
  lastSeenAt,
}

matchingCircleConfirmations: {
  sessionId,
  userId,
  bookId,
  circleKey,
  memberUserIdsJson: string[],
  createdAt,
  updatedAt,
}

matchingLockedCircles: {
  id,
  sessionId,
  bookId,
  circleKey,
  status: 'locked' | 'dissolved',
  lockedAt,
  lockedStateVersion,
  dissolvedAt,
  dissolvedBy,
  dissolveReason,
}

matchingLockedCircleMembers: {
  circleId,
  sessionId,
  userId,
  displayNameSnapshot,
  releasedAt,
}
```

`matching_notices` хранит `kind`, JSON payload, `created_at`, `read_at`; `matching_events` — `event_type`, actor/subject, source, book, before/after, metadata, `state_version`, name snapshots и `occurred_at`.

- [ ] В SQL-миграции очистить только disposable matching state, сделать legacy-поля обратно совместимыми для старого приложения и создать новые constraints. `public_ref` заполнить для существующих строк до `NOT NULL`.

- [ ] Добавить пять новых таблиц в `AUDITED_TABLES` и создать audit triggers в той же миграции. Не добавлять их в `SYSTEM_TRIGGER_TABLES`: runtime-мутации обязаны идти через `withAuditContext`.

- [ ] Запустить migration/audit tests:

```bash
npm test -- drizzle/0048_matching_simplified.test.ts drizzle/0040_audit_triggers.test.ts
```

Expected: PASS.

- [ ] Применить миграцию к разрешённой skill `db-migrate` среде и сверить фактические constraints запросами из skill.

- [ ] Commit:

```bash
git add lib/db/schema.ts lib/audit/audited-tables.ts drizzle/0048_matching_simplified.sql drizzle/0048_matching_simplified.test.ts drizzle/0040_audit_triggers.test.ts
git commit -m "feat: добавить данные закрепления кругов"
```

## Task 3: Preserve and clarify Ranking Gate, then reduce the engine to satisfaction

**Files:**

- Modify: `lib/matching/ranking-readiness.ts`
- Create: `lib/matching/__tests__/ranking-readiness.test.ts`
- Modify: `lib/matching/scenarios.ts`
- Modify: `lib/matching/scenario-input.ts`
- Modify: `lib/matching/__tests__/scenarios.test.ts`

- [ ] Написать тесты нового predicate:

```ts
expect(listNeedsRankingGate([])).toBe(false)
expect(listNeedsRankingGate([rankedActiveBook])).toBe(false)
expect(listNeedsRankingGate([unrankedActiveBook])).toBe(true)
expect(listNeedsRankingGate([unrankedInactiveBook])).toBe(false)
```

Также проверить серверный вариант: пользователь без signup не блокируется; хотя бы одна active signup без rank блокируется.

- [ ] Запустить красный тест:

```bash
npm test -- lib/matching/__tests__/ranking-readiness.test.ts
```

Expected: FAIL — пустой список сейчас считается неготовым, нового predicate нет.

- [ ] Заменить «полную готовность» явным условием gate:

```ts
export function listNeedsRankingGate(books: PersonalBook[]): boolean {
  return books.some(
    (book) => book.isInList && book.personalStatus === null && book.rank === null,
  )
}
```

- [ ] В tests генератора зафиксировать неизменный satisfaction order и правило: signup без rank исключается, после назначения rank включается.

- [ ] Удалить `OptimizationMode`, coverage comparator/score/branches и `maxResults`; переименовать `filterSignupsByMode` в `filterRankedSignups`. Внутренние участники используют `displayName`, но алгоритмическая идентичность остаётся по `userId`.

- [ ] Запустить узкие тесты:

```bash
npm test -- lib/matching/__tests__/ranking-readiness.test.ts lib/matching/__tests__/scenarios.test.ts
```

Expected: PASS; snapshot/order соответствует прежнему satisfaction.

- [ ] Commit:

```bash
git add lib/matching/ranking-readiness.ts lib/matching/__tests__/ranking-readiness.test.ts lib/matching/scenarios.ts lib/matching/scenario-input.ts lib/matching/__tests__/scenarios.test.ts
git commit -m "refactor: оставить единый satisfaction расчёт"
```

## Task 4: Build stable circle identity and safe public names

**Files:**

- Create: `lib/matching/circle-key.ts`
- Create: `lib/matching/display-names.ts`
- Create: `lib/matching/__tests__/circle-key.test.ts`
- Create: `lib/matching/__tests__/display-names.test.ts`
- Modify: `lib/matching/public-state.ts`
- Modify: `lib/matching/__tests__/public-state.test.ts`

- [ ] Написать tests для `circle_key`: перестановка участников даёт тот же ключ; другая книга, сессия или состав — другой; ключ не содержит raw user IDs.

- [ ] Реализовать server-only ключ:

```ts
export function buildCircleKey(input: {
  sessionId: string
  bookId: string
  memberUserIds: string[]
}): string {
  const canonical = JSON.stringify([
    input.sessionId,
    input.bookId,
    [...input.memberUserIds].sort(),
  ])
  return createHash('sha256').update(canonical).digest('base64url')
}
```

- [ ] Написать tests для одинаковых имён: одинокая Анна остаётся `Анна`; две Анны стабильно получают `Анна (1)`/`Анна (2)` по `joinedAt`, затем `publicRef`; перестановка входных rows результат не меняет.

- [ ] Перестроить public DTO: участник наружу получает `publicRef`, `displayName`, `online`, confirmation state; raw `userId` и legacy pseudonym отсутствуют. Admin DTO остаётся отдельным и содержит `userId`.

- [ ] Запустить tests:

```bash
npm test -- lib/matching/__tests__/circle-key.test.ts lib/matching/__tests__/display-names.test.ts lib/matching/__tests__/public-state.test.ts
```

Expected: PASS.

- [ ] Commit:

```bash
git add lib/matching/circle-key.ts lib/matching/display-names.ts lib/matching/__tests__/circle-key.test.ts lib/matching/__tests__/display-names.test.ts lib/matching/public-state.ts lib/matching/__tests__/public-state.test.ts
git commit -m "feat: добавить безопасную идентичность кругов"
```

## Task 5: Implement pure confirmation reconciliation and cascade rules

**Files:**

- Create: `lib/matching/confirmation-reconciliation.ts`
- Create: `lib/matching/__tests__/confirmation-reconciliation.test.ts`

- [ ] Описать чистые входы/выходы без Drizzle:

```ts
type ReconcileInput = {
  rankedScenarios: Scenario[]
  confirmations: Confirmation[]
  lockedMemberUserIds: Set<string>
}

type ReconcileResult = {
  confirmations: Confirmation[]
  transfers: Transfer[]
  invalidations: Invalidation[]
  circlesToLock: Circle[]
}
```

- [ ] Test-first покрыть:

  - точный круг сохранился — confirmation не меняется независимо от его нового rank;
  - точный круг исчез, одна альтернатива той же книги с пользователем — transfer;
  - несколько альтернатив — круг из наиболее высокого сценария;
  - полный tie — стабильный `circleKey` tie-break;
  - альтернатив нет — invalidation;
  - другая книга не считается альтернативой;
  - один пользователь не получает два confirmation;
  - строгий quorum требует confirmation каждого участника точного круга;
  - перенесённый confirmation может немедленно завершить quorum;
  - независимые готовые круги возвращаются в deterministic order.

- [ ] Запустить красный тест:

```bash
npm test -- lib/matching/__tests__/confirmation-reconciliation.test.ts
```

Expected: FAIL — модуля ещё нет.

- [ ] Реализовать одну итерацию reconciliation и отдельную функцию устойчивого cascade, которая после каждого locked circle принимает пересчитанные сценарии. Ограничить цикл числом активных участников и бросать invariant error, если устойчивость не достигнута.

- [ ] Запустить test:

```bash
npm test -- lib/matching/__tests__/confirmation-reconciliation.test.ts
```

Expected: PASS.

- [ ] Commit:

```bash
git add lib/matching/confirmation-reconciliation.ts lib/matching/__tests__/confirmation-reconciliation.test.ts
git commit -m "feat: реализовать перенос и кворум кругов"
```

## Task 6: Centralize all scenario-changing mutations in one transaction service

**Files:**

- Create: `lib/matching/session-transition.ts`
- Create: `lib/matching/matching-events.ts`
- Create: `lib/matching/__tests__/session-transition.test.ts`
- Create: `lib/matching/__tests__/matching-events.test.ts`
- Modify: `lib/matching/realtime/version.ts`
- Modify: `lib/matching/realtime/__tests__/version.test.ts`

- [ ] Сначала создать injectable store contract и in-memory test store. Проверить rollback и first-commit semantics на уровне сервиса.

- [ ] Зафиксировать закрытый union действий:

```ts
type MatchingAction =
  | { type: 'self_join'; userId: string; name?: string }
  | { type: 'admin_add'; userId: string }
  | { type: 'leave'; userId: string }
  | { type: 'admin_remove'; userId: string }
  | { type: 'set_confirmation'; userId: string; circleKey: string }
  | { type: 'cancel_confirmation'; userId: string }
  | { type: 'change_book'; userId: string; bookId: string; operation: 'add' | 'remove' }
  | { type: 'change_rank'; userId: string; bookId: string; rank: number | null }
  | { type: 'change_group_size'; min: number; max: number }
  | { type: 'dissolve_circle'; circleId: string; reason: string }
  | { type: 'freeze' }
```

- [ ] Красные tests должны доказать:

  - строка сессии блокируется до чтения state;
  - frozen и observer запрещают участнические actions;
  - `set_confirmation` атомарно заменяет прежнее confirmation;
  - повтор того же action идемпотентен и не дублирует event;
  - action → recompute → transfer/invalidate → lock → recompute повторяется до устойчивости;
  - locked members исключаются из следующего generator input;
  - event/notice/version failure откатывает исходную мутацию;
  - `state_version` увеличивается ровно один раз на успешную внешнюю транзакцию;
  - leave раньше lock разрешён; lock раньше leave превращает запрос в conflict;
  - freeze очищает provisional confirmations, но сохраняет locked circles;
  - dissolve освобождает весь круг и возвращает всех его участников в active.

- [ ] Реализовать Drizzle adapter внутри `db.transaction`, `withAuditContext` и session row lock через SQL `FOR UPDATE`. Actor/source передаются в каждую mutation; никакой route не пишет matching-таблицы напрямую.

- [ ] Писать смысловые `matching_events` и durable notices в той же транзакции. Автоматические events наследуют actor/source исходного action и явно помечаются `automatic: true`.

- [ ] Выполнить tests:

```bash
npm test -- lib/matching/__tests__/session-transition.test.ts lib/matching/__tests__/matching-events.test.ts lib/matching/realtime/__tests__/version.test.ts
```

Expected: PASS.

- [ ] Commit:

```bash
git add lib/matching/session-transition.ts lib/matching/matching-events.ts lib/matching/__tests__/session-transition.test.ts lib/matching/__tests__/matching-events.test.ts lib/matching/realtime/version.ts lib/matching/realtime/__tests__/version.test.ts
git commit -m "feat: централизовать переходы matching"
```

## Task 7: Expose join, confirmation, notices, state, and admin actions through API

**Files:**

- Modify: `app/api/matching/sessions/[id]/join/route.ts`
- Modify: `app/api/matching/sessions/[id]/leave/route.ts`
- Create: `app/api/matching/sessions/[id]/confirmation/route.ts`
- Create: `app/api/matching/sessions/[id]/confirmation/route.test.ts`
- Create: `app/api/matching/notices/[id]/ack/route.ts`
- Create: `app/api/matching/notices/[id]/ack/route.test.ts`
- Modify: `app/api/matching/state/route.ts`
- Modify: `app/api/matching/state/route.test.ts`
- Modify: `app/api/matching/version/route.ts`
- Modify: `app/api/matching/books/route.ts`
- Modify: `app/api/matching/books/[bookId]/route.ts`
- Modify: `app/api/matching/priorities/route.ts`
- Modify: `app/api/matching/sessions/[id]/route.ts`
- Modify corresponding `route.test.ts` files
- Modify: `app/api/admin/matching/sessions/[id]/participants/route.ts`
- Modify: `app/api/admin/matching/sessions/[id]/participants/[userId]/route.ts`
- Create: `app/api/admin/matching/sessions/[id]/circles/[circleId]/dissolve/route.ts`
- Create: `app/api/admin/matching/sessions/[id]/circles/[circleId]/dissolve/route.test.ts`
- Modify: `app/api/matching/sessions/[id]/freeze/route.ts`
- Modify: `app/api/matching/sessions/[id]/freeze/route.test.ts`

- [ ] Написать route tests до handlers. Confirmation contract:

```http
PUT /api/matching/sessions/:id/confirmation
{ "circleKey": "opaque", "expectedStateVersion": 17 }

DELETE /api/matching/sessions/:id/confirmation
{ "expectedStateVersion": 17 }
```

`PUT` создаёт или атомарно переключает единственное confirmation. Handler не принимает book/member list от клиента как источник истины: он находит `circleKey` в текущем server scenario state.

- [ ] Проверить `400` invalid payload, `401`, `403` observer/frozen, `404` session/circle, `409` stale state/concurrency и успешный идемпотентный повтор.

- [ ] Join принимает optional trimmed global `name`, валидирует теми же правилами, что профиль, и одной транзакцией обновляет `users.name` + добавляет participant с `join_source=self`. Admin add задаёт `join_source=admin`, не меняет имя и создаёт override-disclosure event.

- [ ] Все scenario-changing routes перевести на `runMatchingTransition`. Это включает catalog add/remove, priority update, leave/admin remove, group size, freeze/dissolve. Обновления пользователя через общие admin endpoints `app/api/admin/signup-books/route.ts` и `app/api/admin/priorities/route.ts` тоже должны запускать transition, если пользователь состоит в active matching session.

- [ ] `GET /api/matching/state` вернуть единый DTO: scenarios, confirmations, locked registry, viewer role/circle, notices, session status/version и Ranking Gate data. Удалить myMoves/feed/optimization mode/pseudonym fields.

- [ ] Notice ack меняет только `read_at` через audit context и не увеличивает scenario `state_version`.

- [ ] Выполнить route tests:

```bash
npm test -- app/api/matching app/api/admin/matching app/api/admin/signup-books/route.test.ts app/api/admin/priorities/route.test.ts
```

Expected: PASS.

- [ ] Commit:

```bash
git add app/api/matching app/api/admin/matching app/api/admin/signup-books app/api/admin/priorities
git commit -m "feat: добавить API подтверждения кругов"
```

## Task 8: Rebuild the participant UI around Welcome, Ranking Gate, and circles

**Files:**

- Modify: `app/matching/page.tsx`
- Modify: `components/nd/MatchingWelcome.tsx`
- Modify: `components/nd/MatchingWelcome.test.tsx`
- Modify: `components/nd/MatchingSatisfactionFlow.tsx`
- Modify: `components/nd/MatchingSatisfactionFlow.test.tsx`
- Modify: `components/nd/MatchingHeader.tsx`
- Modify: `components/nd/MatchingScenarios.tsx`
- Modify: `components/nd/MatchingScenarios.test.tsx`
- Modify: `components/nd/MatchingPersonalList.tsx`
- Modify: `components/nd/MatchingPersonalList.test.tsx`
- Create: `components/nd/MatchingConfirmationDialog.tsx`
- Create: `components/nd/MatchingConfirmationDialog.test.tsx`
- Create: `components/nd/MatchingLockedCircles.tsx`
- Create: `components/nd/MatchingLockedCircles.test.tsx`
- Create: `components/nd/MatchingNotices.tsx`
- Create: `components/nd/MatchingNotices.test.tsx`
- Modify: `components/nd/MatchingRealtimeClient.tsx`
- Modify: `components/nd/MatchingRealtimeClient.test.tsx`

- [ ] До JSX написать component tests для последовательности:

```text
not joined → Welcome
joined + active unranked book → Ranking Gate
joined + no books OR all active books ranked → board
locked member → observer board
frozen → read-only snapshot
```

- [ ] Welcome показывает global name, disclosure реальных имён и inline edit. Submit отправляет join с именем; после success выполняет refresh. Telegram CTA отсутствует.

- [ ] Ranking Gate использовать после Welcome только при `listNeedsRankingGate(books)`. При пустом списке доска доступна; добавление первой книги без rank переводит пользователя в gate после refresh/poll.

- [ ] Перестроить scenarios в одну полную колонку без выделения первого. Для круга viewer-а:

  - active/no confirmation — CTA «Хочу в этот круг»;
  - waiting — все статусы, `N из M`, временность и «Отменить»;
  - другой current confirmation — CTA открывает atomic switch dialog со старой/новой книгой и составом;
  - observer/frozen — read-only без CTA.

- [ ] На desktop CTA появляется по hover и keyboard focus; на touch видна постоянно. Использовать только токены `app/globals.css`, острые углы, линии вместо декоративных заливок.

- [ ] Locked registry расположен над live scenarios. Observer получает основной блок своего круга и badge «Вы наблюдаете», но продолжает видеть live scenarios read-only.

- [ ] Durable notices показывают transfer/invalidation/automatic lock и отправляют ack после явного закрытия; потеря ответа не скрывает notice до подтверждённого ack.

- [ ] Polling по version после изменения загружает полный state. Не делать optimistic confirmation state, способный пережить `409`.

- [ ] Выполнить component tests:

```bash
npm test -- components/nd/MatchingWelcome.test.tsx components/nd/MatchingSatisfactionFlow.test.tsx components/nd/MatchingScenarios.test.tsx components/nd/MatchingPersonalList.test.tsx components/nd/MatchingConfirmationDialog.test.tsx components/nd/MatchingLockedCircles.test.tsx components/nd/MatchingNotices.test.tsx components/nd/MatchingRealtimeClient.test.tsx
```

Expected: PASS.

- [ ] Commit только после обязательного UI layout E2E из Task 11 либо оставить изменения незакоммиченными до его добавления. Рекомендуемый общий commit после Task 11: `feat: упростить интерфейс matching`.

## Task 9: Update admin matching and semantic analytics

**Files:**

- Modify: `components/nd/AdminMatchingSession.tsx`
- Create: `components/nd/AdminMatchingSession.test.tsx`
- Modify: `app/api/admin/matching/preference-events/route.ts`
- Modify: `app/api/admin/matching/preference-events/route.test.ts`
- Create: `lib/matching/matching-event-display.ts`
- Create: `lib/matching/__tests__/matching-event-display.test.ts`
- Delete: `lib/matching/preference-event-display.ts`
- Delete: `lib/matching/__tests__/preference-event-display.test.ts`

- [ ] Test-first убрать выбор/mutation режима из create/edit session.

- [ ] Participants table показывает real name, online, `self/admin`, `active/observer`. Admin add содержит явное предупреждение об обходе disclosure. Remove locked member disabled с объяснением «сначала распустить круг».

- [ ] Добавить registry locked circles в админку и dissolve dialog с книгой, полным составом и обязательной непустой причиной. Frozen UI read-only.

- [ ] Сохранить пользовательское название секции «Аналитика изменений предпочтений», но читать `matching_events`. Форматтер должен покрывать join/leave/remove, Welcome name change, confirm/cancel/switch/transfer/invalidation, locked/dissolved, books/ranks/group sizes и freeze.

- [ ] Проверить tests:

```bash
npm test -- components/nd/AdminMatchingSession.test.tsx app/api/admin/matching/preference-events/route.test.ts lib/matching/__tests__/matching-event-display.test.ts
```

Expected: PASS.

- [ ] Commit вместе с соответствующим admin E2E из Task 11 либо после него.

## Task 10: Delete legacy runtime and prevent accidental resurrection

**Files:**

- Delete: `app/api/matching/feed/route.ts`
- Delete: `app/api/matching/feed/route.test.ts`
- Delete: `app/api/matching/sessions/[id]/mode/route.ts`
- Delete: `app/api/matching/sessions/[id]/mode/route.test.ts`
- Delete: `app/api/matching/sessions/[id]/pseudonym/route.ts`
- Delete: `components/nd/MatchingMyMoves.tsx`
- Delete: `components/nd/MatchingImpactWorkspace.tsx`
- Delete: `components/nd/MatchingImpactWorkspace.test.tsx`
- Delete: `components/nd/MatchingAdriftBanner.tsx`
- Delete obsolete pseudonym/feed/my-moves/adrift/move-impact modules and tests under `lib/matching/`
- Modify: `components/nd/matching-shared.ts`
- Modify: `components/nd/matching-shared.test.ts`

- [ ] Сначала найти все usages перед каждым delete:

```bash
rg -n "optimizationMode|coverage|pseudonym|MatchingMyMoves|MatchingImpactWorkspace|MatchingAdriftBanner|matching/feed|myMoves" app components lib e2e public docs --glob '!docs/superpowers/specs/**' --glob '!docs/superpowers/plans/**'
```

- [ ] Удалить runtime/API/UI/tests старого mode toggle, feed, pseudonyms, My Moves и coverage. Из `matching-shared` оставить только действительно используемые нейтральные UI helpers; удалить `getPseudonymColor` и species assets.

- [ ] Добавить regression test, читающий runtime-файлы и падающий при возвращении `optimizationMode`, coverage branch или pseudonym DTO. Исторические specs и git tag не входят в scan.

- [ ] Выполнить unit suite:

```bash
npm test
```

Expected: PASS, нет импортов удалённых модулей.

- [ ] Не коммитить отдельно до добавления E2E удаления/нового UI в Task 11.

## Task 11: Replace obsolete matching E2E and prove persistence/layout

**Files:**

- Read first: `docs/features/testing.md`
- Modify: `e2e/fixtures.ts`
- Modify: `e2e/matching-satisfaction.spec.ts`
- Modify: `e2e/matching-realtime.spec.ts`
- Modify: `e2e/ui-states.spec.ts`
- Delete: `e2e/matching-mode-toggle.spec.ts`
- Delete: `e2e/matching-feed-regression.spec.ts`
- Delete or rewrite: `e2e/matching-reader-circles.spec.ts`
- Modify matching test setup endpoint(s) under `app/api/test/`

- [ ] Обновить fixtures для создания session, participants, ranked/unranked books и cleanup всех новых matching tables. Все записи — только Neon `e2e` branch.

- [ ] E2E покрывает:

  - Welcome на новой сессии, name disclosure/edit и сохранение global name после `page.reload()`;
  - Ranking Gate сразу после Welcome при unranked active book, исчезновение после rank + reload;
  - отсутствие gate при пустом списке и доступность каталога;
  - отсутствие pseudonyms, «Моих ходов», feed и mode selector;
  - равные scenario cards без leader-highlight;
  - confirm/cancel/switch warning, сохранение после reload;
  - confirmation status виден второму пользователю после refresh/poll;
  - automatic transfer и durable notice;
  - all-member lock, observer role, locked registry и исключение observers из пересчёта после reload;
  - first-commit concurrent requests;
  - admin add override, remove active, запрет remove locked, dissolve whole circle и freeze;
  - events в matching analytics и row changes в global audit.

- [ ] В `e2e/ui-states.spec.ts` добавить обязательные `boundingBox()` проверки: scenarios занимают освобождённую ширину; My Moves/feed не занимают место; desktop hover/focus CTA и touch CTA; locked registry над scenarios; observer state не меняет ширину доски.

- [ ] Запустить matching/layout E2E:

```bash
npm run test:e2e e2e/matching-satisfaction.spec.ts e2e/matching-realtime.spec.ts e2e/ui-states.spec.ts
```

Expected: PASS в изолированной e2e DB.

- [ ] Запустить обязательные проверки UI change:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e e2e/ui-states.spec.ts
```

Expected: PASS.

- [ ] Зафиксировать Tasks 8–11:

```bash
git add app components lib e2e
git commit -m "feat: упростить интерфейс matching"
```

## Task 12: Update technical docs, Wiki, and OpenAPI

**Files:**

- Create: `docs/features/matching.md`
- Modify: `docs/features/audit-log.md`
- Modify: `docs/features/testing.md`
- Modify: `docs/wiki/Group-Matching-Mode.md`
- Modify: `docs/wiki/Admin-Panel.md`
- Modify: `docs/wiki/Data-and-Database.md`
- Modify: `docs/wiki/Privacy-and-User-Data.md`
- Modify: `docs/wiki/API-and-Swagger.md`
- Modify: `docs/wiki/Project-Map.md`
- Modify: `public/openapi.json`

- [ ] Техническая документация описывает transaction pipeline, tables/invariants, Ranking Gate predicate, reconciliation/cascade, version polling, audit/events и tag `matching-legacy-before-simplification-2026-06-29`.

- [ ] Wiki объясняет владельцу продукта реальные имена/disclosure, временность confirmation, observer-mode, admin dissolve/freeze, data retention и отсутствие Telegram CTA.

- [ ] OpenAPI удалить mode/feed/pseudonym contracts и документировать confirmation, notices, dissolve и новый public state. Проверить JSON:

```bash
node -e "JSON.parse(require('fs').readFileSync('public/openapi.json','utf8')); console.log('openapi json ok')"
```

Expected: `openapi json ok`.

- [ ] Проверить отсутствие устаревших утверждений в актуальной документации:

```bash
rg -n "coverage|псевдоним|Мои ходы|Лента событий|optimizationMode" docs/features docs/wiki public/openapi.json
```

Expected: только явно маркированные исторические/удалённые понятия, не описание активного runtime.

- [ ] Commit:

```bash
git add docs/features docs/wiki public/openapi.json
git commit -m "docs: описать новый matching flow"
```

## Task 13: Verify and merge Phase A through CI gate

- [ ] Зафиксировать pre-commit artifacts:

```text
E2E: нужен — новый UI-flow, persistent state, conditional rendering, CSS layout и admin workflow.
Wiki: нужна — меняются пользовательский/admin workflow, схема БД, API, privacy и operations.
```

- [ ] Полная локальная проверка:

```bash
pwd
git status --short --branch
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e e2e/matching-satisfaction.spec.ts e2e/matching-realtime.spec.ts e2e/ui-states.spec.ts
git diff --check
```

Expected: все команды PASS; worktree/branch правильные; diff без whitespace errors.

- [ ] Self-review против canonical spec: проверить каждый раздел 1–13, затем повторить runtime scan:

```bash
rg -n "optimizationMode|coverage|pseudonym|MatchingMyMoves|matching/feed" app components lib e2e public/openapi.json
```

Expected: нет активных legacy references.

- [ ] Push, PR и auto-merge:

```bash
git push -u origin codex/matching-simplified
gh pr create --fill
gh pr merge --auto --squash --delete-branch
gh pr view --json number,mergeStateStatus,mergeable,url
```

Expected: `CLEAN` или `BLOCKED`; при `BEHIND` выполнить `gh pr update-branch <number>`, при CI failure исправлять в этой же ветке. Задача Phase A не завершена, пока PR не merged.

## Task 14: Production smoke-check before destructive cleanup

- [ ] После merge дождаться production deployment и открыть production через in-app browser.

- [ ] На тестовой сессии проверить: Welcome → Ranking Gate → board; real names; confirm/cancel; второй participant status; lock → observer; admin analytics/audit.

- [ ] Проверить серверные ошибки и Vercel deployment status. При дефекте чинить forward отдельным PR; Phase B не начинать до зелёного smoke-check.

- [ ] Зафиксировать SHA Phase A deployment и результат smoke-check в описании Phase B PR.

## Task 15: Remove legacy schema in Phase B

**Files:**

- Modify: `lib/db/schema.ts`
- Modify: `lib/audit/audited-tables.ts`
- Create: `drizzle/0050_drop_legacy_matching.sql`
- Create: `drizzle/0050_drop_legacy_matching.test.ts`
- Modify: `drizzle/0040_audit_triggers.test.ts`
- Modify docs if Phase A smoke revealed operational details

- [ ] От свежего `origin/main` создать новый worktree/branch `codex/drop-legacy-matching-schema`; не продолжать в уже merged Phase A worktree.

- [ ] Test-first потребовать удаление:

  - `matching_sessions.optimization_mode`;
  - `matching_session_participants.pseudonym`;
  - `matching_pseudonym_reservations`;
  - `matching_preference_events`;
  - coverage-only поля `metric_groups_count`, `metric_coverage`, `metric_time_to_freeze_seconds`, `metric_time_since_last_mutation_seconds`, `metric_top3_hit_rate`;
  - legacy names из `AUDITED_TABLES`/`SYSTEM_TRIGGER_TABLES`.

`frozen_at` и `frozen_scenario_json` сохраняются: Phase A уже пишет JSON в новой форме locked registry + read-only остаточный snapshot.

- [ ] Выполнить красный test:

```bash
npm test -- drizzle/0050_drop_legacy_matching.test.ts drizzle/0040_audit_triggers.test.ts
```

Expected: FAIL до migration/schema cleanup.

- [ ] Через skill `db-migrate` сгенерировать/применить destructive migration. Перед `DROP` проверить, что production application SHA — Phase A или новее и runtime scan не находит обращения к удаляемым объектам.

- [ ] Запустить полный verification:

```bash
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

Expected: PASS.

- [ ] Зафиксировать pre-commit artifacts:

```text
E2E: не нужен — Phase B удаляет уже неиспользуемую legacy schema; пользовательский flow доказан Phase A E2E и не меняется.
Wiki: нужна — итоговая схема БД больше не содержит legacy matching objects.
```

- [ ] Commit, push, PR, auto-merge и CI monitoring по стандартному workflow. В PR body указать Phase A SHA, production smoke result, удалённые объекты и rollback source tag.

- [ ] После merge повторить короткий production smoke-check matching и проверить, что итоговая БД не содержит legacy schema.

## Final acceptance checklist

- [ ] Runtime имеет только satisfaction и не содержит mode switching.
- [ ] Welcome использует/редактирует global name и показывается один раз на новую сессию.
- [ ] Ranking Gate появляется только при active unranked books; пустой список не блокируется.
- [ ] Raw user IDs и pseudonyms не уходят обычному участнику.
- [ ] У пользователя максимум одно provisional confirmation; switch атомарен.
- [ ] Transfer/invalidation/quorum/cascade детерминированы и транзакционны.
- [ ] Locked circle необратим для участников; admin dissolve освобождает весь состав.
- [ ] Observers исключены из расчётов и сохраняют read-only доступ.
- [ ] Matching events и global audit отражают все смысловые изменения.
- [ ] My Moves, user feed, leader highlight и Telegram CTA отсутствуют.
- [ ] Phase A и Phase B merged через зелёный CI; production smoke-check пройден после каждой фазы.
- [ ] Старый runtime восстановим только из `matching-legacy-before-simplification-2026-06-29`.
