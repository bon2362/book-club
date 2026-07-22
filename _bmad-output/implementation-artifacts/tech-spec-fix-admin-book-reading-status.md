---
title: 'Исправить смену статуса книги в карточке пользователя'
type: 'bugfix'
created: '2026-07-23'
status: 'done'
baseline_commit: '00faa7cb8f8e1391edbb35d8ca2141321831db8c'
context:
  - 'docs/features/admin-panel.md'
  - 'docs/features/matching.md'
  - 'docs/features/testing.md'
---

# Исправить смену статуса книги в карточке пользователя

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** В `/admin` выбор «Читаю» в карточке участника может закончиться без видимого результата даже после закрытия всех matching-сессий. Resolver намеренно выбирает `closed`/`frozen` сессию для каталоговой корректировки, но нижний доменный слой продолжает применять её исторические `hard`/assignment/observer-блокировки, а `AdminPanel` молча скрывает ответ `409`.

**Approach:** Разделить текущие и исторические matching-ограничения: в `open`/`active` сохранить существующие защиты, а в `closed`/`frozen` разрешить каталоговые действия `change_book`/`change_rank`/`change_status` без блокировки старыми intent/assignment/observer-записями и без их удаления. После успеха перечитывать карточку с сервера; после отказа показывать понятную причину. Синхронизировать приоритеты по каноническому инварианту и закрепить поведение тестом с reload.

## Boundaries & Constraints

**Always:** Считать matching-ограничения обязательными только для текущей `open`/`active` сессии; сохранять historical intents, assignments, круги и события закрытой сессии неизменными; выполнять мутацию через `runMatchingTransition` и audit context; для `personal_status=null` гарантировать ровно один `book_priorities`, для `reading`/`read` — ни одного; показывать администратору ошибку API.

**Ask First:** Любое решение, которое автоматически распускает круг, снимает assignment, отменяет hard intent или меняет ограничения внутри открытой сессии.

**Never:** Не обходить matching прямой записью в БД; не ослаблять локи `open`/`active` сессии; не переписывать историю закрытой сессии ради смены личного статуса; не скрывать 4xx/5xx; не менять глобальный `books.reading_status`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| Обычная запись | Admin выбирает `reading` для signup-книги без matching lock | Статус сохраняется, приоритет удаляется, карточка после reload показывает книгу в «Читаю» | Сообщение из API при отказе |
| Закрытая сессия | Участник имеет historical hard/assignment/observer; admin или сам участник меняет personal status | Статус и приоритеты меняются; matching history остаётся неизменной | Транзакционный откат при ошибке |
| Открытая сессия | Участник имеет текущий hard/assignment/observer lock | Существующие доменные ограничения продолжают действовать | API возвращает типизированный 409, UI показывает причину |
| Возврат после закрытия | Personal status `reading`/`read` меняется на `null` | Книга получает auto-rank в конец; historical matching-записи не меняются | Транзакционный откат при ошибке |

</frozen-after-approval>

## Code Map

- `components/nd/AdminPanel.tsx` — отправляет status PATCH, обновляет/перечитывает drawer и показывает ошибки.
- `app/api/admin/signup-books/route.ts` — административный API; сейчас содержит дублирующую логику рангов.
- `app/api/signup-books/[bookId]/status/route.ts` — каноническая синхронизация personal status и `book_priorities`, поддерживает admin `?as=`.
- `lib/matching/realtime/state-change.ts` — выбирает текущую либо последнюю закрытую matching-сессию участника для catalog mutation.
- `lib/matching/session-transition.ts` — lifecycle-aware правила допуска доменного действия.
- `lib/matching/session-transition-db.ts` — атомарное изменение статуса/рангов и проверки hard/assignment.
- `drizzle/0055_release_closed_matching_signup_guard.sql` — синхронизирует DB guard с lifecycle-правилом приложения.
- `e2e/admin-user-book-status.spec.ts` — UI-сценарий админской смены статуса с reload и проверкой закрытой matching-сессии.

## Tasks & Acceptance

**Execution:**
- [x] `lib/matching/session-transition.ts`, `lib/matching/session-transition-db.ts` и их тесты — передать lifecycle-контекст catalog mutation; игнорировать historical locks только для `closed`/`frozen`, сохраняя все защиты `open`/`active`.
- [x] `app/api/admin/signup-books/route.ts` и route tests — устранить расхождение с канонической status/rank логикой без прямого обхода matching.
- [x] `components/nd/AdminPanel.tsx` и component tests — обрабатывать ответ, показывать ошибку и перечитывать карточку после успеха.
- [x] `e2e/admin-user-book-status.spec.ts` — проверить `null → reading`, reload и повторное открытие drawer; добавить закрытую сессию с historical hard/assignment либо эквивалентную integration-проверку доменного перехода.
- [x] `drizzle/0055_release_closed_matching_signup_guard.sql` и SQL-тест — убрать DB-level блокировку исторических `closed`/`frozen`, сохранив её для `open`/`active`.
- [x] `docs/features/admin-panel.md`, `docs/features/testing.md`, `docs/wiki/Submissions-Signups-and-Priorities.md`, `docs/wiki/API-and-Swagger.md` — зафиксировать восстановленный admin workflow и тестовое покрытие.

**Acceptance Criteria:**
- Given обычная signup-книга, when администратор выбирает «Читаю», then карточка сразу перемещает книгу в секцию «Читаю» и после reload показывает тот же статус.
- Given закрытая или замороженная сессия с historical hard/assignment/observer-записями, when personal status меняет администратор или сам участник, then статус и ранги сохраняются, а история matching не меняется.
- Given та же блокировка в открытой сессии, when выполняется запрещённая смена статуса, then API по-прежнему отклоняет действие и admin UI показывает причину.
- Given любой неуспешный status PATCH, when ответ получен, then интерфейс не меняет локальный статус и показывает ошибку.

## Spec Change Log

- 2026-07-23 — Реализован lifecycle-aware catalog transition, канонический admin status path, server refresh/error UI, регрессионные тесты и документация. Frozen intent-секция не изменялась.
- 2026-07-23 — После adversarial review historical transition ограничен тремя catalog-действиями без matching event/version mutation; добавлены rank-repair, UI race protection и OpenAPI-контракт.
- 2026-07-23 — Focused E2E выявил второй слой блокировки в Postgres trigger; добавлена миграция `0055`, применена к E2E Neon и проверена с сохранением historical hard intent.

## Verification

**Commands:**
- `npm run lint` — без предупреждений и ошибок.
- `npm run typecheck` — TypeScript без ошибок.
- `npm test` — все unit/integration тесты зелёные.
- `npm run test:e2e:focused -- e2e/admin-user-book-status.spec.ts` — admin UI сохраняет personal status после reload в изолированной E2E-БД.

**Результат 2026-07-23:** lint и typecheck зелёные; Jest — 214 suites / 1510 tests; focused E2E — 2/2, включая полный reload UI и сохранение historical hard intent. Для E2E восстановлены отдельный `node_modules`, `.env.test.local` и Chromium; миграция `0055` применена только к изолированной E2E Neon-ветке. Production Neon на этапе проверки не изменялся.
