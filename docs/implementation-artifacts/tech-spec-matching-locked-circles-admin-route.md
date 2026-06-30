---
title: 'Админский реестр закреплённых кругов'
type: 'bugfix'
created: '2026-06-30'
status: 'done'
baseline_commit: 'f8ea461f64e4940676ac607d41141fb67649e957'
context:
  - 'docs/project-context.md'
  - 'docs/features/matching.md'
  - 'docs/features/testing.md'
---

# Админский реестр закреплённых кругов

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Админская вкладка матчинга запрашивает отсутствующий `GET /api/admin/matching/sessions/{id}/locked-circles`, поэтому после реального закрепления показывает «Закреплённые круги (0)». Это скрывает состав круга и блокирует аварийный роспуск через UI.

**Approach:** Добавить минимальный admin-only read route, который возвращает закреплённые и распущенные круги с названием книги и сохранёнными снимками имён участников. Не менять доменную модель, публичный state или логику роспуска.

## Boundaries & Constraints

**Always:** Проверять `session.user.isAdmin`; явно выбирать поля из БД; возвращать `[]`, если кругов нет; включать `locked` и `dissolved`; сохранять текущий JSON-контракт компонента; документировать новый endpoint; покрыть авторизацию, пустой результат, сборку кругов с участниками и реальный admin UI E2E.

**Ask First:** Любое изменение схемы БД, модели закрепления, поведения роспуска или UI-компонента; расширение endpoint мутациями.

**Never:** Переиспользовать публичный state с потерей распущенных кругов; добавлять raw SQL; менять production-данные из автотестов; скрывать ошибку авторизации как пустой результат.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Не администратор | Нет admin-сессии | Ответ без данных | `403 Forbidden` |
| Кругов нет | Валидная сессия без записей | `{ success: true, data: [] }` | N/A |
| Есть история | Несколько locked/dissolved кругов и members | Круги от новых к старым; каждый содержит book title и всех snapshot-members | N/A |

</frozen-after-approval>

## Code Map

- `components/nd/AdminMatchingSession.tsx` — существующий потребитель контракта и UI реестра.
- `lib/db/schema.ts` — `matchingLockedCircles`, `matchingLockedCircleMembers`, `books`.
- `app/api/admin/matching/sessions/[id]/participants/route.ts` — эталон admin auth и Drizzle route.
- `e2e/matching-satisfaction.spec.ts` — существующий сценарий, который реально закрепляет круг.
- `public/openapi.json` — публичный API-контракт.

## Tasks & Acceptance

**Execution:**
- [x] `app/api/admin/matching/sessions/[id]/locked-circles/route.test.ts` — сначала зафиксировать падающий контракт маршрута.
- [x] `app/api/admin/matching/sessions/[id]/locked-circles/route.ts` — выбрать круги с книгами и сгруппировать snapshots участников.
- [x] `e2e/matching-satisfaction.spec.ts` — после закрепления открыть admin matching и увидеть круг в реестре.
- [x] `public/openapi.json`, `docs/features/matching.md`, `docs/wiki/API-and-Swagger.md`, `docs/wiki/Group-Matching-Mode.md` — синхронизировать контракт и документацию.

**Acceptance Criteria:**
- Given закреплённый круг, when администратор открывает matching-вкладку, then реестр показывает книгу, состав и статус.
- Given распущенный круг, when endpoint запрашивают повторно, then запись остаётся в истории со статусом и причиной.
- Given не-администратор, when он вызывает endpoint, then сервер отвечает 403.

## Spec Change Log

## Verification

**Commands:**
- `npm test -- app/api/admin/matching/sessions/[id]/locked-circles/route.test.ts --runInBand` — route contract green.
- `npm run test:e2e e2e/matching-satisfaction.spec.ts` — закреплённый круг виден в админке.
- `npm run lint && npm run typecheck && npm test -- --runInBand && npm run build` — полный локальный gate green.
