---
title: 'Исправить мобильную геометрию книжного Matching'
type: 'bugfix'
created: '2026-07-16'
status: 'done'
baseline_commit: 'fd9d478c01c1dd9efd543c8de41957a3fff10b17'
context:
  - 'docs/features/matching.md'
  - 'docs/features/testing.md'
  - '/Users/ekoshkin/Downloads/REVIEW-FIXES.md'
---

# Исправить мобильную геометрию книжного Matching

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** На ширине 360–393px универсальные правила `min-height: 44px` и `flex: 1 1 100%` применились к информационным метрикам, заголовку и вторичным кнопкам. Карточки стали рыхлыми, каретка split-кнопки заняла половину строки, ghost-действие выглядит главным, а bottom sheet оставляет длинному названию слишком узкую колонку. В каталоге также видна опечатка «Доктирна шока».

**Approach:** Сузить mobile CSS-селекторы до действительно интерактивных контролов, сохранить 44px для основных CTA и каретки, вернуть контенту естественную высоту и освободить ширину заголовка в sheet. Исправить название идемпотентной data-миграцией, не переписывая историческую `0021`.

## Boundaries & Constraints

**Always:** Использовать только существующие токены; сохранить 56×80 у карточки и 96×144 в sheet; сохранить focus trap, drag-to-close, rank tooltip и доступные 44px у primary CTA; проверять 360 и 393px через `boundingBox()`.

**Ask First:** Изменение текстов, бизнес-правил записи, состава карточки, desktop-геометрии или размеров обложек.

**Never:** Уменьшать primary CTA ниже 44px; возвращать 44px информационным chips/metrics; править историческую миграцию `0021`; применять тесты к production DB.

## I/O & Edge-Case Matrix

| Состояние | Ожидаемое поведение |
|---|---|
| Split CTA | `Записаться` занимает остаток строки; каретка — узкая зона около 44px |
| Метрики переносятся | Строки имеют естественную высоту без 44px пустот |
| Hard до формирования | `Отменить` остаётся компактным вторичным действием слева |
| Длинное название в sheet | Колонка заголовка использует доступную ширину, крестик не перекрывает текст |
| Много участников | Chips переносятся по строкам и имеют высоту около 34px |
| Каталог | Книга `9b351ca1-…` называется «Доктрина шока» во всех применённых окружениях |

</frozen-after-approval>

## Code Map

- `app/globals.css` — mobile specificity, естественная высота контента, геометрия sheet.
- `e2e/matching-layout.spec.ts` — существующий mobile golden с геометрическими регрессиями.
- `drizzle/0054_fix_shock_doctrine_title.sql` и тест — идемпотентная data correction.
- `_bmad-output/implementation-artifacts/tech-spec-refine-matching-book-cards.md` — исправить устаревший статус `ready-for-dev` на `done`.

## Tasks & Acceptance

- [x] Удалить mobile `inline-flex/min-height` у `.nd-mb-title` и `.nd-mb-metric`, сохранив естественный перенос и доступность входа в детали через обложку/заголовок.
- [x] Селектором достаточной специфичности закрепить растущий `.nd-mb-split-main`, фиксированную `.nd-mb-split-caret` и компактную `.is-ghost`.
- [x] Сделать participant chips компактными (`34px`) и расширить колонку длинного названия sheet, не меняя обложку 96×144.
- [x] Добавить `boundingBox()`-проверки ширины split-частей, плотности карточки, ghost-кнопки, sheet-заголовка и chips в существующий golden.
- [x] Добавить и проверить идемпотентную коррекцию названия; применить её отдельно к e2e и production Neon через существующий migration runner после проверки URL без вывода секрета.
- [x] Прогнать `lint`, `typecheck`, Jest, focused layout E2E и build.
- [ ] Создать PR, дождаться auto-merge и проверить production UI.

**Acceptance Criteria:**

- Given viewport 360–393px, when карточка содержит несколько метрик, then между ними нет искусственных строк высотой 44px и горизонтального overflow.
- Given split CTA, then каретка не растягивается и остаётся примерно 44px, а main занимает существенно большую часть строки.
- Given hard selection, then ghost-action не шире своего содержимого, но сохраняет доступную высоту 44px.
- Given mobile detail sheet, then cover остаётся 96×144, title не резервирует лишние 2.5rem справа, participant chips имеют компактную высоту и всё остаётся внутри viewport.
- Given миграция применена повторно, then она безопасно оставляет корректное название без побочных изменений.

## Design Notes

**Visual thesis:** компактная редакторская карточка; обложка и название задают ритм, агрегаты читаются как плотная метаинформация, визуальный вес остаётся у одного primary CTA.

**Content plan:** название и автор → компактная строка агрегатов → действие; в sheet — обложка и читаемый заголовок → участники → описание.

**Interaction thesis:** split воспринимается одной кнопкой с узкой зоной раскрытия; вторичные действия отступают; sheet сохраняет drag/close/focus-модель без новых жестов.

## Verification

- `npm run lint && npm run typecheck && npm test`
- `npm run test:e2e:focused -- e2e/matching-layout.spec.ts --grep "393px keeps cards"`
- `npm run build`
- Read-only production check: title and mobile layout after deploy.
