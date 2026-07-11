---
title: 'Исправить nightly E2E после обязательных рангов и бесшумного переноса'
type: 'bugfix'
created: '2026-07-11'
status: 'done'
baseline_commit: '0b14db4fec183cf69a5720a94f0b65cbeed9478d'
context:
  - 'docs/features/testing.md'
  - 'docs/features/matching.md'
---

# Исправить nightly E2E после обязательных рангов и бесшумного переноса

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nightly run 29136585014 стабильно завершает 5 E2E-проверок ошибкой после PR #465–#467. Продуктовое поведение уже покрыто unit-тестами и соответствует документации, но старые Playwright-сценарии продолжают ожидать публичное уведомление о переносе и отсутствие автоматически созданного ранга.

**Approach:** Обновить только E2E-сценарии: проверять бесшумный перенос подтверждения согласно актуальному контракту, а defensive Ranking Gate воспроизводить через явное создание legacy-состояния без `book_priorities` в изолированной E2E-БД.

## Boundaries & Constraints

**Always:** Все DB-мутации выполнять через fixture `dbExec`; удалять ранг только у созданного тестом viewer; сохранить проверки персистентности через reload; сохранить layout-проверки CTA на desktop и mobile; прогнать оба изменённых спека и обязательные статические/unit-проверки.

**Ask First:** Если локальный прогон покажет продуктовый runtime-баг, несовместимый с контрактом PR #465–#467, остановиться до изменения production-кода.

**Never:** Не ослаблять readiness-логику Ranking Gate, не возвращать `confirmation_transferred` в публичный state/UI, не писать в production DB, не заменять проверки таймаутами или retry.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Бесшумный перенос | Выбранный круг исчез, но для той же книги есть альтернативный состав | Confirmation переносится; public/UI notice `confirmation_transferred` отсутствует | Последующий сброс без альтернативы остаётся durable notice с reload/ack |
| Legacy missing-rank | Участник записан на книгу, но его `book_priorities` удалён в E2E setup | После join отображается Ranking Gate | Тест падает, если gate отсутствует или DB setup затронул другого пользователя |
| Layout gate | Legacy missing-rank на 1440×900 и 375×812 | CTA видна в пределах viewport, на mobile остаётся sticky после scroll | `boundingBox()` подтверждает границы viewport |

</frozen-after-approval>

## Code Map

- `e2e/matching-satisfaction.spec.ts` — functional matching-сценарии переноса notice и Ranking Gate.
- `e2e/ui-states.spec.ts` — desktop/mobile layout-проверки Ranking Gate.
- `e2e/fixtures.ts` — существующий безопасный `dbExec` с guard и cleanup-контрактом.
- `lib/matching/public-state.ts` — актуальный контракт: `confirmation_transferred` фильтруется из public state.

## Tasks & Acceptance

**Execution:**
- [ ] `e2e/matching-satisfaction.spec.ts` — заменить устаревшие assertions transfer notice на проверку бесшумного переноса; перенести durable reload/ack-проверку на invalidation; удалить авторанги viewer в двух gate-сценариях через `dbExec`.
- [ ] `e2e/ui-states.spec.ts` — получить `userId` viewer и удалить только его авторанг перед двумя layout-проверками gate.

**Acceptance Criteria:**
- Given альтернативный круг той же книги, when исходный состав исчезает, then confirmation переносится без public/UI notice.
- Given альтернативы нет, when подтверждённый круг исчезает, then invalidation notice переживает reload и удаляется после ack.
- Given test-owned viewer с удалённым авторангом, when он входит в matching, then functional и layout Ranking Gate проверки проходят на desktop/mobile.
- Given изменённые спеки, when выполняются lint, typecheck, unit и targeted E2E, then команды завершаются успешно.

## Spec Change Log

## Verification

**Commands:**
- `npm run lint` — ожидается 0 ошибок и warnings.
- `npm run typecheck` — ожидается успешный `tsc --noEmit`.
- `npm test` — ожидается зелёный Jest suite.
- `npm run test:e2e e2e/matching-satisfaction.spec.ts e2e/ui-states.spec.ts` — ожидаются зелёные оба изменённых спека.
