---
title: 'Улучшить книжную вкладку Matching'
type: 'feature'
created: '2026-07-14'
status: 'done'
baseline_commit: '9abe8e8ffb2bd485ec19597c6650dc84ec762663'
context: ['docs/features/matching.md', 'docs/features/testing.md', 'docs/project-context.md']
---

# Улучшить книжную вкладку Matching

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Книжная вкладка не объясняет механику выбора, сортирует книги почти только по популярности, показывает технические статусы, прячет список во внутреннем viewport и расходится с дизайн-макетом в карточках и popup.

**Approach:** Сделать вкладку естественной редакторской страницей: ранжировать книги сервером по решениям и удовлетворённости интереса участников, показать ранги в доступных tooltip, упростить статусы и добавить явные подтверждения для смены окончательного выбора.

## Boundaries & Constraints

**Always:** Показывать все книги актуального шорт-листа viewer; вычислять порядок только из участников текущей сессии; сохранять assignment/hard viewer сверху и один слот; считать все ненулевые ранги без cutoff; использовать canonical state, дизайн-токены, доступные hover/focus/tap interactions и существующую optimistic concurrency.

**Ask First:** Только если реализация потребует изменения механики формирования кругов, схемы БД или удаления существующего API `cancelHard`.

**Never:** Не считать порядок на клиенте; не использовать сырые цвета; не менять вкладку Scenarios; не скрывать книги с низким интересом; не разрешать обычному участнику разрушать сформированный круг.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ranked interest | Несколько доступных участников с ranks, включая rank > 3 | Внутри одного decision-tier ниже average rank, затем ниже worst rank, затем больше интересующихся; стабильный catalog tie-break | `null` rank не участвует в score, но книга остаётся видимой |
| Unavailable interest | Участник назначен на другую книгу | Его rank не улучшает порядок этой книги | Статус остаётся видимым в canonical detail, если применимо |
| Hard switch | Viewer уже окончательно выбрал A и нажимает «Записаться» на B | Сначала inline-предупреждение; запрос только после «Перезаписаться» | Отказ сохраняет A и не отправляет POST |
| Assigned viewer | Круг сформирован | Верхняя строка «Вы записаны на {книга}»; «Отменить» объясняет обратиться к администратору | Никакой мутации |
| Viewer-only tail | После книг с пересечениями остаются только личные книги | Один divider отделяет хвост; книги не скрываются | Viewer hard/assignment остаётся pinned, а не попадает в хвост |

</frozen-after-approval>

## Code Map

- `lib/matching/public-state-db.ts` — читает ранги book-mode участников.
- `lib/matching/book-public-state.ts` — canonical rank projection и сортировка.
- `components/nd/MatchingBooksView.tsx` — intro, assignment row, divider, switch confirmation и сообщения.
- `components/nd/MatchingBookCard.tsx` — CTA/copy, formed treatment и post-choice explanation.
- `components/nd/MatchingBookDetailModal.tsx` — компактные inline-статусы и rank tooltip.
- `components/nd/MatchingWorkspace.tsx`, `app/globals.css` — natural document flow книжной вкладки.

## Tasks & Acceptance

**Execution:**
- [ ] Расширить book-mode DTO рангом и чистой satisfaction-сортировкой; покрыть отсутствующие/глубокие ранги, unavailable participants и tie-breakers.
- [ ] Обновить view/card state machine, тексты и доступное подтверждение смены книги.
- [ ] Перестроить participant popup в компактный wrap со статусами и hover/focus/tap tooltip.
- [ ] Убрать внутренний fixed-height scroll в book mode, добавить divider и семантическую success-заливку formed card.
- [ ] Обновить Jest, Playwright layout/persistence checks, техдокументацию и Wiki.

**Acceptance Criteria:**
- Given открытая книжная вкладка, when viewer сканирует страницу, then видит заданные заголовок/инструкцию, все книги в deterministic interest order и отделённый личный хвост.
- Given имя участника в popup, when hover/focus/tap, then появляется «У {name} на {rank} месте» без overflow на mobile.
- Given hard choice A, when viewer выбирает B, then видит предупреждение и только явное подтверждение атомарно переносит запись; reload сохраняет результат.
- Given formed assignment, when viewer нажимает «Отменить», then видит совет обратиться к администратору и assignment сохраняется.
- Given desktop/mobile book mode, when список длинный, then document scroll достигает последней карточки без внутреннего cap/пустого подвала.

## Spec Change Log

## Design Notes

**Visual thesis:** спокойный редакторский список с одной линией действия и зелёным подтверждением только там, где договорённость уже сложилась.

**Content plan:** инструкция → назначение viewer → ранжированный список → divider личного хвоста → подробности книги в компактном popup.

**Interaction thesis:** tooltip мягко появляется на hover/focus и фиксируется tap; предупреждение о переносе раскрывается inline; natural page scroll заменяет вложенный viewport.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` — весь unit gate зелёный.
- `npm run test:e2e e2e/ui-states.spec.ts` — layout, tooltip, fill, divider и document flow.
- `npm run test:e2e e2e/matching-books.spec.ts` — confirm/cancel/reload и canonical order.
