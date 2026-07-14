---
title: 'Ускорить E2E-контур разработки'
type: 'refactor'
created: '2026-07-15'
status: 'done'
baseline_commit: '07119f72ac19c613a21b5ecb22db204171c1fb5d'
context: ['AGENTS.md', 'docs/features/testing.md', 'docs/project-context.md']
---

# Ускорить E2E-контур разработки

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Локальный UI-gate запускает несвязанные E2E, Matching-фикстуры всегда создают полный набор браузерных участников, а API/DB-инварианты проверяются через Chromium. Одна Matching-итерация тратит около 12,6 минуты на Playwright, nightly — около 41 минуты.

**Approach:** Сохранить рисковое покрытие, разделив пирамиду: локально запускать затронутые E2E; браузером проверять golden paths и layout; транзакции, concurrent actions, cutover и audit перенести в request-only integration suite на изолированной Neon-ветке.

## Boundaries & Constraints

**Always:** Полный портфель остаётся nightly/manual; мутации идут только в E2E-БД; reload остаётся в персистентных golden paths; realtime, DnD, focus trap и layout остаются браузерными; финальный gate выполняет один координатор один раз.

**Ask First:** Изменение продукта, DB-схемы, guards или отказ от реальных транзакций.

**Never:** Не возвращать E2E в merge-gate; не параллелить единственную active Matching session; не удалять риск без эквивалентного Jest/integration/golden теста; не использовать production DB.

## I/O & Edge-Case Matrix

| Сценарий | Вход | Результат | Защита |
|---|---|---|---|
| Focused | Один UI-flow | Конкретный spec/grep, без retry | Ноль тестов = ошибка |
| Nightly | `main` | Browser + integration, единый Allure | Retry только в CI |
| Integration | Concurrency/cutover/audit | Реальные HTTP, cookies, Neon; без BrowserContext | Fail-closed guard и cleanup |
| Fixture | Нужен один viewer | Один API identity; page/admin/peers ленивые | Все ресурсы очищаются |

</frozen-after-approval>

## Code Map

- `AGENTS.md`, `package.json`, `playwright.config.ts` — policy, команды, retry.
- `e2e/*-layout.spec.ts`, `e2e/helpers/layout.ts` — доменные layout tests.
- `e2e/fixtures.ts`, `e2e/api-fixtures.ts` — ленивые и request-only identities.
- `e2e/matching-*.spec.ts`, `e2e/integration/matching/*` — golden и integration portfolios.
- `.github/workflows/e2e-nightly.yml`, `docs/features/testing.md`, `docs/wiki/*` — nightly и документация.

## Tasks & Acceptance

**Execution:**
- [x] Добавить focused/full scripts, local retry 0 / CI retry 1 и правило одного final gate.
- [x] Разделить `ui-states` по доменам; заменить Matching `networkidle` семантическими waits.
- [x] Сделать Matching identities API-only и ленивыми; создавать browser pages по запросу.
- [x] Перенести concurrency, cutover, audit и чистые state/guard проверки в request-only suite.
- [x] Сжать browser Matching до golden paths/layout и удалить доказанные дубли.
- [x] Обновить docs/Wiki; измерить focused и полный набор.

**Acceptance Criteria:**
- Given один Matching layout change, when запускается focused `--grep`, then выполняется один тест без retry и чужих доменов.
- Given integration suite, when он запущен, then Chromium не стартует, а HTTP/Neon concurrency, cutover и audit проходят.
- Given nightly `--list`, when портфель собран, then каждый прежний риск покрыт одним уровнем, browser Matching содержит ≤12 golden/layout тестов.
- Given итоговое измерение, when focused Matching UI запущен, then цель ≤2 минуты; nightly стремится к ≤20 минутам.

## Spec Change Log

## Design Notes

Классификация по риску: Jest — тексты/rendering; request-only — API/SQL/transactions; browser — journey/reload/interactions; layout — только реальный viewport.

## Verification

- `npm run lint && npm run typecheck && npm test -- --runInBand`
- `npm run test:e2e:focused -- e2e/matching-layout.spec.ts --grep "document scroll"`
- `npm run test:integration:matching`
- `npm run test:e2e:matching`
- `npm run test:e2e:nightly -- --list` и ручной nightly workflow

Результат локального review-gate: lint и typecheck прошли; Jest — 211 suites / 1463 tests; focused Matching layout — 1 тест за 30 секунд; Matching golden — 12 тестов за 5,4 минуты; request-only integration — 8 тестов за 3,2 минуты. Nightly `--list` — 106 тестов (86 non-Matching browser + 12 Matching browser golden + 8 request-only integration). В доменных файлах сохранены все 35 исходных layout-тестов; nightly выполняет 27, а риски восьми manual legacy-layout сценариев сведены в board/ranking goldens. В curated Matching нет `networkidle`. Полное nightly-время измеряется ручным GitHub workflow на production build после merge.
