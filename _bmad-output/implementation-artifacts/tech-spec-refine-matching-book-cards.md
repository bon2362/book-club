---
title: 'Уточнить карточки и детали книг в Matching'
type: 'feature'
created: '2026-07-15'
status: 'done'
context:
  - 'docs/features/matching.md'
  - 'docs/features/testing.md'
  - 'docs/wiki/Group-Matching-Mode.md'
---

# Уточнить карточки и детали книг в Matching

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** В книжной вкладке Matching статусы участников визуально распадаются, агрегаты пересекаются и смешаны с CTA, а сформированный круг получает чрезмерно широкую левую отметку. Интерфейс также не доказывает поддерживаемый системой случай двух кругов по одной книге.

**Approach:** Сделать метрики одной компактной интерактивной строкой, сгруппировать имя и статус каждого участника в деталях, оставить только действие, соответствующее фактическому результату клика, и покрыть два круга сквозным тестом без изменения механики распределения.

## Boundaries & Constraints

**Always:** Использовать существующие токены и matching-примитивы; сохранить keyboard/touch tooltip, focus trap и возврат фокуса; считать три метрики как непересекающиеся группы; показывать conditional CTA только если он не приведёт к немедленному назначению; отображать каждый существующий круг и отмечать круг viewer.

**Ask First:** Изменение порогов 2 hard / группы 3–5, алгоритма перераспределения, модели одного назначения на сессию или административного workflow.

**Never:** Добавлять новые цветовые токены, тени или декоративные карточки; использовать `intersectionCount` для метрики «ещё у N»; вводить ограничение «один круг на книгу»; менять БД-схему без необходимости.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| Три статуса | 1 hard, 2 conditional, 4 interest-peer + viewer | Кликабельные `1 уже записал:ась`, `2 готовы читать`, `ещё у 4 эта книга в списке` | Нулевые группы не выводятся |
| Автоназначение | Два доступных hard, следующий conditional сформирует круг | Показывается только `Записаться`; conditional CTA скрыт | Решение исходит из canonical public state |
| Два круга | Шесть назначений одной книге | `Круг 1` и `Круг 2` по три человека; только один помечен `· ваш` | Карточка не переполняется на mobile |
| Свой найденный круг | Viewer assigned в formed-книгу | Стандартная 3px success-линия и подпись `ваш круг` | Нет дополнительного 4px border |

</frozen-after-approval>

## Code Map

- `lib/matching/book-public-state.ts` — canonical DTO и признак немедленного назначения.
- `components/nd/MatchingBookCard.tsx` — метрики, CTA, лейблы и круги.
- `components/nd/MatchingBookDetailModal.tsx` — группы имя+статус и rank tooltip.
- `components/nd/MatchingBookCircles.tsx` — несколько кругов и viewer marker.
- `app/globals.css` — существующие matching-примитивы и ширина status-line.
- `e2e/matching-layout.spec.ts` — интерактивный и геометрический regression gate.

## Handoff Notes

- Продолжить в уже подготовленном task-worktree `/Users/ekoshkin/book-club-refine-matching-book-cards` на ветке `codex/refine-matching-book-cards`; не редактировать исходный checkout `/Users/ekoshkin/book-club`. Сначала проверить `git status`, затем подтянуть/rebase свежий `origin/main`, если он продвинулся. Сейчас worktree содержит только эту незакоммиченную спецификацию.
- `conditionalWouldAssign` должен вычисляться в canonical public read model, а не эвристикой в React. Для текущей модели действие назначает viewer, когда после добавления его `conditional` выполняется реальное правило `shouldFormBook`: среди доступных, ещё не назначенных intents есть не менее двух `hard`, а `hard + conditional >= 3`. Не использовать `intersectionCount` и не менять пороги в этой задаче.
- Метрики карточки взаимоисключающие: `hard + assigned`; `conditional`; `interest`, причём из последней группы исключается `viewerRef`. Нулевые метрики не рендерятся. Формы: `1/21 уже записал:ась`, `2/11 уже записались`, `1 готов:а читать`, `2 готовы читать`, `ещё у N эта книга в списке`.
- Все три метрики — настоящие `button`, вызывающие уже существующий `onOpenBook(book, currentTarget)`. Счётчик с CTA удалить полностью.
- Широкая планка вызвана одновременными `.is-formed` (`inset 3px`) и `.is-assigned` (`border-left: 4px`). Удалить отдельный assigned-border; success inset сформированной карточки остаётся единственной линией.
- Popup уже держит имя и статус внутри одной кнопки; проблема визуальная. Оформить каждый participant-button компактной общей поверхностью на существующих `var(--surface-soft)`/`var(--hair-soft)`/`var(--radius-control)`, сохранив flex-wrap, focus-visible и tooltip относительно `li`. Новые дизайн-токены не нужны.
- Поддержка нескольких кругов уже реализована: unique только `(session, book, position)`, `partitionBookAssignments(6) = [3,3]`, public state возвращает массив, `MatchingBookCircles` показывает `Круг 1/2`. Бизнес-фикс не нужен — нужен regression proof.
- Сквозной сценарий двух кругов: четыре участника ставят `conditional`, двое — `hard`; после формирования/reload одна книга содержит два круга по три, ровно один имеет `· ваш`. На desktop круги не перекрываются, на mobile переходят в одну колонку без horizontal overflow.
- Присоединение нового `hard` к уже сформированной книге сейчас полностью перестраивает автоматические круги и может сбросить ручное размещение. Это известное допустимое поведение и не входит в scope.

## Tasks & Acceptance

**Execution:**
- [ ] `lib/matching/book-public-state.ts`, `components/nd/matching-book-types.ts` — добавить canonical `conditionalWouldAssign`, рассчитанный по реальным доступным intents.
- [ ] `components/nd/MatchingBookCard.tsx` — вынести conditional count в мета-строку, сделать три непересекающихся счётчика кнопками, обновить wording и скрыть conditional CTA при auto-assignment.
- [ ] `components/nd/MatchingBookDetailModal.tsx`, `app/globals.css` — визуально связать имя и статус каждого участника, сохранив tooltip и responsive wrap; убрать двойную левую линию assigned+formed.
- [ ] Unit-тесты public state/card/modal/circles — покрыть вычисления, copy, клики, CTA и два круга.
- [ ] `e2e/matching-layout.spec.ts` — проверить popup через счётчик, геометрию participant groups, CTA на пороге, 3px plan и два круга desktop/mobile.
- [ ] `docs/features/matching.md`, `docs/wiki/Group-Matching-Mode.md` — обновить пользовательскую модель метрик и подтверждённую поддержку нескольких кругов.

**Acceptance Criteria:**
- Given карточка с разными статусами, when пользователь кликает любой счётчик, then открывается общий popup этой книги с полным списком и рангами.
- Given conditional не назначает немедленно, when книга не сформирована, then доступна кнопка `Готов:а читать` без числа; иначе остаётся `Записаться`.
- Given книга сформирована, then лейбл — `○ круг найден`, пояснение — `Круг уже найден, но можно присоединиться`, а у viewer — подпись `ваш круг`.
- Given шесть назначенных участников, when state перезагружен, then одна карточка показывает два устойчивых круга по три без horizontal overflow.

## Design Notes

**Visual thesis:** спокойная редакторская карточка, где статус читается текстовой строкой, а детали — компактными обведёнными парами имя+статус.

**Content plan:** идентичность книги → интерактивная строка агрегатов → одноуровневые CTA → найденные круги; popup раскрывает людей и ранги, затем остальные сведения книги.

**Interaction thesis:** hover/focus подчёркивает счётчик как вход в детали; click/tap открывает существующий sheet; participant group целиком управляет rank tooltip без новых модалей и анимационного шума.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` — все статические и unit-проверки зелёные.
- `npm run test:e2e:focused -- e2e/matching-layout.spec.ts --grep "book cards and two circles"` — interaction/layout сценарий зелёный.
- `npm run build` — production build успешен.
