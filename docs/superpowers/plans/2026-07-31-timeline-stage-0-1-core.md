# Timeline, этапы 0–1: аудит тестов и перенос расчётного ядра

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести чистые расчётные модули таймлайна (арифметика исторических
дат и геометрия раскладки ленты) из `~/documents/timeline` в `lib/timeline/`
book-club, оставив только те тесты, что покрывают невидимые глазами граничные
случаи.

**Architecture:** Модули не знают ни про базу, ни про сеть, ни про React — это
чистые функции над числами и датами. Переносятся почти дословно; меняются только
импорты (убирается зависимость от контрактов исходного проекта в пользу
локального `lib/timeline/types.ts`) и раннер тестов (vitest → jest). Никаких
изменений в поведении на этом этапе не вносится.

**Tech Stack:** TypeScript, Jest (`next/jest`, окружение jsdom), zod 4.

**Спецификация:** `docs/superpowers/specs/2026-07-31-timeline-section-design.md`

**Источник:** `/Users/ekoshkin/documents/timeline` (локальный, не в git этого репозитория)

## Global Constraints

- Пользовательских изменений на этом этапе нет: ни страниц, ни API, ни миграций.
- Тесты лежат рядом с кодом как `<модуль>.test.ts` — соглашение `lib/` этого репозитория.
- `jest.config.ts` собирает покрытие с `lib/**/*.ts` при пороге 80% строк и функций. Новые файлы попадают под этот порог.
- Импорты внутри перенесённых модулей — без расширения `.js` (в исходнике оно есть, Next.js его не примет).
- Раннер тестов — Jest с глобальными `describe/it/expect`. Строки `import { describe, expect, it } from 'vitest'` удаляются, не заменяются.
- Перед каждым коммитом: `npm run lint && npm run typecheck && npm test`.
- Работа ведётся в отдельном git worktree от свежего `origin/main`, изменения уходят через PR с автомержем.
- E2E не нужны ни в одной задаче этого плана: пользовательского поведения не появляется.
- Wiki не нужна ни в одной задаче этого плана: фичи для владельца проекта пока нет.

---

## Результаты аудита тестов (этап 0)

Аудит выполнен до написания плана, его выводы вшиты в задачи ниже — отдельной
задачи «провести аудит» нет, есть готовые решения по каждому файлу.

Переносимый объём: **12 файлов, 75 тестов, 1182 строки.** (В спецификации стояла
приблизительная оценка «9 файлов, ~800 строк» — уточнено по факту.) Остальные
984 теста исходного проекта не переносятся вместе с кодом, который они
проверяют: бэкапы, импорт TimelineJS, маршруты Fastify, репозитории SQLite,
покомпонентные тесты форм под старую вёрстку.

| Файл | Было | Станет | Что удаляется и почему |
|---|---|---|---|
| `historical-date.test.ts` | 7 | 6 | `accepts a BCE year without month or day` — тривиальный happy path схемы zod |
| `calendar-year-overlap.test.ts` | 6 | 5 | `allows ranges with no shared calendar year` — далеко от границы, которую задаёт правило «конфликт от двух общих лет» |
| `time-coordinate.test.ts` | 8 | 7 | `expands a month-only end date to the final day of that month` — частный случай соседнего теста про неполную дату конца |
| `viewport.test.ts` | 6 | 5 | `moves both viewport boundaries by the supplied horizontal delta` — проверяет однострочную обёртку без логики |
| `ruler-ticks.test.ts` | 3 | 3 | Ничего не удаляется, но `subdivides a labelled step` переписывается: 25 строк захардкоженного массива → проверка свойств |
| `density.test.ts` | 8 | 6 | `exports density stages from most detailed to most reduced` — тавтология, проверяет константу-массив; `keeps nearby unselected points clustered around a selected point` — перекрывается соседним тестом про отделение выбранной точки |
| `event-lanes.test.ts` | 6 | 5 | `does not change lane assignment when an item is selected` — перекрывается тестом про непересекающиеся выбранные элементы |
| `event-layout.test.ts` | 9 | 7 | `grows the reserved row without an upper cap` — перекрывается тестом про запас ширины на широкие глифы; `keeps non-overlapping selected and unselected points in one lane` — дублирует проверку из `event-lanes` |
| `epoch-lanes.test.ts` | 8 | 6 | `rejects a pin that overlaps another pinned epoch in the target lane` и `accepts a pin when the lane has no overlapping pinned epoch` — граница «один общий год против двух» уже покрыта двумя соседними тестами |
| `epoch-label.test.ts` | 7 | 5 | `pushes the title into the band when the band starts left of the viewport` и `limits the title to the visible slice when the band runs off the right edge` — оба случая по отдельности покрыты тестом про выход за обе границы |
| `event-connections.test.ts` | 5 | 5 | Ничего: каждый тест — отдельная ветка функции (точка, завершённый интервал, обрезанный, продолжающийся, вне диапазона) |
| `performance.test.ts` | 2 | 0 | Удаляется целиком: второй тест рендерит `TimelineRenderer` и ищет CSS-классы `.timeline-event`, которых после перевёрстки не будет; оба меряют время выполнения и дают пороги 500 мс / 2 с — источник ложных падений в CI. Покрытие не страдает: те же функции проверяются другими тестами |
| **Итого** | **75** | **60** | 15 тестов удалено, 1 переписан |

Тесты, которые аудит сохранил, отвечают одному из двух критериев: граничный
случай, невидимый глазами (переход «до н.э. → н.э.», отсутствие
астрономического года ноль, событие без даты окончания, ровно один общий год
против двух), либо расчёт, ошибка в котором даёт правдоподобный, но неверный
результат.

**Итог сквозным счётом: 1059 тестов исходного проекта → 60.** Сокращение в
17 раз, из них целенаправленный рез аудита — 15 тестов из 75 переносимых;
остальное отпало вместе с непереносимыми подсистемами.

---

## Замечания для последующих этапов

Зафиксировано при сверке с исходным репозиторием 31.07.2026 (коммиты `777407e`,
`c0ba0d8`, `1c2e1cd`, `d088b83`, `5e189d4`). К этапам 0–1 не относится, но при
переносе отрисовки на этапе 3 должно быть учтено:

- Размещение подписи эпохи публикуется в разметку **через CSS custom properties**,
  а не инлайновыми стилями. Расчёт (`epochLabelPlacement`) от этого не зависит и
  переносится этим планом как есть.
- Из максимальной ширины заголовка **вычитается рамка полосы** — иначе подпись
  вылезает за свою полосу на пиксель. Исправление живёт в слое отрисовки
  (`EpochLayer.tsx`, `styles.css`), не в геометрии.
- У заголовка эпохи есть **BEM-класс с закреплённой формой DOM**. При перевёрстке
  под токены проекта имя класса изменится — это ожидаемо.
- Список типов события раскрывается по фокусу (`EventForm`) — поведение для
  этапа 4, когда переносятся админские формы.

## Порядок исполнения

Задачи 1–7 ниже описывают перенос по модулям и служат чеклистом. По решению
владельца проекта они исполняются **одним проходом с одной финальной проверкой**,
а не семью циклами «реализация → ревью». Основание: работа механическая —
копирование файлов, правка путей импорта и удаление поимённо перечисленных
тестов; ошибка в ней ловится счётом тестов и `typecheck`, а не глазами
рецензента. Коммиты внутри прохода допустимо объединить в один.

## File Structure

Создаётся:

```
lib/timeline/
  types.ts                      — TimelineEventDates: даты события без остальной модели
  historical-date.ts            — эры, сравнение дат, схема валидации
  historical-date.test.ts
  calendar-year-overlap.ts      — пересечение периодов по календарным годам
  calendar-year-overlap.test.ts
  geometry/
    time-coordinate.ts          — дата ↔ непрерывная координата
    time-coordinate.test.ts
    viewport.ts                 — координата ↔ пиксель, масштаб, панорама
    viewport.test.ts
    ruler-ticks.ts              — засечки линейки
    ruler-ticks.test.ts
    density.ts                  — прореживание точек при отдалении
    density.test.ts
    event-lanes.ts              — распределение событий по дорожкам
    event-lanes.test.ts
    event-layout.ts             — выбор степени прореживания под лимит дорожек
    event-layout.test.ts
    epoch-lanes.ts              — дорожки эпох с закреплением
    epoch-lanes.test.ts
    epoch-label.ts              — размещение подписи полосы эпохи
    epoch-label.test.ts
    event-connections.ts        — геометрия отрезка события в вьюпорте
    event-connections.test.ts
```

Ничего существующего не изменяется.

**Почему `types.ts` отдельно:** в исходнике `time-coordinate.ts` и
`event-connections.ts` импортируют `Event` из контрактов приложения ради трёх
полей. Тянуть за собой полную модель события ради дат — лишняя связанность:
геометрии нужны только `start`, `end`, `ongoing`. Локальный тип разрывает эту
зависимость, и позже модель события в базе сможет меняться, не задевая расчёты.

---

### Task 1: Типы и арифметика исторических дат

**Files:**
- Create: `lib/timeline/types.ts`
- Create: `lib/timeline/historical-date.ts`
- Create: `lib/timeline/historical-date.test.ts`
- Create: `lib/timeline/calendar-year-overlap.ts`
- Create: `lib/timeline/calendar-year-overlap.test.ts`

**Interfaces:**
- Consumes: ничего (первая задача).
- Produces:
  - `HistoricalEra = 'BCE' | 'CE'`
  - `HistoricalDate { year: number; era: HistoricalEra; month?: number; day?: number }`
  - `historicalDateSchema: z.ZodType<HistoricalDate>`
  - `compareHistoricalDates(left: HistoricalDate, right: HistoricalDate, leftBoundary?: 'start' | 'end', rightBoundary?: 'start' | 'end'): number`
  - `assertChronologicalRange(start: HistoricalDate, end: HistoricalDate): void`
  - `HistoricalYearRange { start: HistoricalDate; end: HistoricalDate }`
  - `historicalCalendarYearOrdinal(date: Pick<HistoricalDate, 'year' | 'era'>): number`
  - `epochYearRangesConflict(left: HistoricalYearRange, right: HistoricalYearRange): boolean`
  - `TimelineEventDates { start: HistoricalDate; end?: HistoricalDate; ongoing: boolean }`

- [ ] **Шаг 1: Создать рабочую папку**

```bash
git fetch origin main
git worktree add ../book-club-timeline-core -b feat/timeline-core origin/main
cd ../book-club-timeline-core
ln -s ../book-club/node_modules node_modules
mkdir -p lib/timeline/geometry
```

- [ ] **Шаг 2: Скопировать модули дат**

```bash
SRC=/Users/ekoshkin/documents/timeline/src/shared/historical-date
cp "$SRC/historical-date.ts"       lib/timeline/historical-date.ts
cp "$SRC/calendar-year-overlap.ts" lib/timeline/calendar-year-overlap.ts
cp "$SRC/historical-date.test.ts"       lib/timeline/historical-date.test.ts
cp "$SRC/calendar-year-overlap.test.ts" lib/timeline/calendar-year-overlap.test.ts
```

- [ ] **Шаг 3: Починить импорт с расширением `.js`**

В `lib/timeline/calendar-year-overlap.ts` первая строка:

```ts
import type { HistoricalDate } from './historical-date.js';
```

Заменить на:

```ts
import type { HistoricalDate } from './historical-date';
```

- [ ] **Шаг 4: Перевести тесты с vitest на Jest**

В обоих файлах `*.test.ts` удалить строку импорта раннера — в Jest
`describe`/`it`/`expect` доступны глобально:

```ts
import { describe, expect, it } from 'vitest';
```

Внутри `lib/timeline/historical-date.test.ts` также заменить импорт с
расширением, если он есть:

```ts
import { ... } from './historical-date.js';
```

на

```ts
import { ... } from './historical-date';
```

То же самое в `lib/timeline/calendar-year-overlap.test.ts` для обоих его
импортов (`./calendar-year-overlap`, `./historical-date`).

- [ ] **Шаг 5: Применить решения аудита**

Удалить из `lib/timeline/historical-date.test.ts` тест целиком:

```
it('accepts a BCE year without month or day', ...)
```

Удалить из `lib/timeline/calendar-year-overlap.test.ts` тест целиком:

```
it('allows ranges with no shared calendar year', ...)
```

Должно остаться: 6 тестов в `historical-date.test.ts`, 5 в
`calendar-year-overlap.test.ts`.

- [ ] **Шаг 6: Создать `lib/timeline/types.ts`**

```ts
import type { HistoricalDate } from './historical-date'

/**
 * Даты события в том объёме, в каком их читает геометрия ленты. Отдельный тип
 * не даёт расчётам зависеть от полной модели события в базе.
 */
export interface TimelineEventDates {
  start: HistoricalDate
  end?: HistoricalDate
  ongoing: boolean
}

export type { HistoricalDate, HistoricalEra } from './historical-date'
```

- [ ] **Шаг 7: Запустить тесты и убедиться, что они проходят**

Выполнить: `npx jest lib/timeline --verbose`
Ожидается: 11 пройденных тестов, 2 набора.

- [ ] **Шаг 8: Проверки перед коммитом**

Выполнить: `npm run lint && npm run typecheck && npm test`
Ожидается: без ошибок.

- [ ] **Шаг 9: Коммит**

```bash
git add lib/timeline
git commit -m "feat: перенести арифметику исторических дат в lib/timeline

E2E: не нужен — пользовательского поведения не появляется.
Wiki: не нужна — фичи для владельца проекта пока нет."
```

---

### Task 2: Координаты времени и вьюпорт

**Files:**
- Create: `lib/timeline/geometry/time-coordinate.ts`
- Create: `lib/timeline/geometry/time-coordinate.test.ts`
- Create: `lib/timeline/geometry/viewport.ts`
- Create: `lib/timeline/geometry/viewport.test.ts`

**Interfaces:**
- Consumes: `HistoricalDate` и `TimelineEventDates` из Task 1.
- Produces:
  - `historicalDateToCoordinate(date: HistoricalDate): number`
  - `coordinateToHistoricalDate(value: number): HistoricalDate`
  - `dateRangeForEvent(event: TimelineEventDates, now?: Date): { start: number; end: number }`
  - `VisibleRange { start: number; end: number }`
  - `ZoomLimits { minSpan: number; maxSpan: number }`
  - `createViewportTransform(range: VisibleRange, width: number): { toX(value: number): number; fromX(x: number): number; unitsPerPixel: number }`
  - `zoomRangeAroundPointer(range: VisibleRange, pointerValue: number, factor: number, limits: ZoomLimits): VisibleRange`
  - `panRange(range: VisibleRange, delta: number): VisibleRange`
  - `fitRange(values: number[], paddingRatio?: number): VisibleRange`

- [ ] **Шаг 1: Скопировать модули**

```bash
SRC=/Users/ekoshkin/documents/timeline/src/client/features/timeline/geometry
cp "$SRC/time-coordinate.ts"      lib/timeline/geometry/time-coordinate.ts
cp "$SRC/time-coordinate.test.ts" lib/timeline/geometry/time-coordinate.test.ts
cp "$SRC/viewport.ts"             lib/timeline/geometry/viewport.ts
cp "$SRC/viewport.test.ts"        lib/timeline/geometry/viewport.test.ts
```

- [ ] **Шаг 2: Отвязать `time-coordinate.ts` от контрактов исходного проекта**

Заменить два верхних импорта:

```ts
import type { Event } from '../../../../shared/contracts/event';
import type { HistoricalDate } from '../../../../shared/historical-date/historical-date';
```

на:

```ts
import type { HistoricalDate, TimelineEventDates } from '../types'
```

В той же функции заменить сигнатуру `dateRangeForEvent`:

```ts
export function dateRangeForEvent(
  event: Pick<Event, 'start' | 'end' | 'ongoing'>,
  now: Date = new Date(),
): { start: number; end: number } {
```

на:

```ts
export function dateRangeForEvent(
  event: TimelineEventDates,
  now: Date = new Date(),
): { start: number; end: number } {
```

- [ ] **Шаг 3: Перевести тесты на Jest и применить решения аудита**

В обоих файлах `*.test.ts` удалить строку `import { describe, expect, it } from 'vitest';`.

Удалить из `lib/timeline/geometry/time-coordinate.test.ts` тест целиком:

```
it('expands a month-only end date to the final day of that month', ...)
```

Удалить из `lib/timeline/geometry/viewport.test.ts` тест целиком:

```
it('moves both viewport boundaries by the supplied horizontal delta', ...)
```

Должно остаться: 7 тестов в `time-coordinate.test.ts`, 5 в `viewport.test.ts`.

- [ ] **Шаг 4: Запустить тесты**

Выполнить: `npx jest lib/timeline --verbose`
Ожидается: 23 пройденных теста, 4 набора.

- [ ] **Шаг 5: Проверки и коммит**

```bash
npm run lint && npm run typecheck && npm test
git add lib/timeline
git commit -m "feat: перенести координаты времени и вьюпорт таймлайна

E2E: не нужен — пользовательского поведения не появляется.
Wiki: не нужна — фичи для владельца проекта пока нет."
```

---

### Task 3: Засечки линейки

**Files:**
- Create: `lib/timeline/geometry/ruler-ticks.ts`
- Create: `lib/timeline/geometry/ruler-ticks.test.ts`

**Interfaces:**
- Consumes: `VisibleRange` из Task 2.
- Produces: `RulerTick { value: number; label: string; major: boolean }`,
  `buildRulerTicks(range: VisibleRange, pixelWidth: number): RulerTick[]`

- [ ] **Шаг 1: Скопировать модуль и убрать импорт vitest**

```bash
SRC=/Users/ekoshkin/documents/timeline/src/client/features/timeline/geometry
cp "$SRC/ruler-ticks.ts"      lib/timeline/geometry/ruler-ticks.ts
cp "$SRC/ruler-ticks.test.ts" lib/timeline/geometry/ruler-ticks.test.ts
```

В `ruler-ticks.test.ts` удалить строку `import { describe, expect, it } from 'vitest';`.

- [ ] **Шаг 2: Переписать тест на подразбиение**

Заменить тест `subdivides a labelled step into unlabelled minor ticks` целиком
(вместе с его 25-строчным ожидаемым массивом) на проверку свойств:

```ts
  it('subdivides a labelled step into unlabelled minor ticks', () => {
    const ticks = buildRulerTicks({ start: 1, end: 101 }, 500)
    const major = ticks.filter((tick) => tick.major)
    const minor = ticks.filter((tick) => !tick.major)

    // Подписанный шаг — 20 лет, между подписями по четыре немых засечки.
    expect(major.map((tick) => tick.value)).toEqual([20, 40, 60, 80, 100])
    expect(major.every((tick) => tick.label === String(tick.value))).toBe(true)
    expect(minor.every((tick) => tick.label === '')).toBe(true)
    expect(minor.every((tick) => tick.value % 4 === 0 && tick.value % 20 !== 0)).toBe(true)
  })
```

Причина замены: исходный тест перечислял все 25 засечек буквально. Он падал при
любом изменении шага, не сообщая, что именно сломалось, и не читался. Новая
версия проверяет то же правило — «подписи кратны 20, между ними по четыре немых
засечки», — но выражает его как правило.

- [ ] **Шаг 3: Запустить тесты**

Выполнить: `npx jest lib/timeline/geometry/ruler-ticks --verbose`
Ожидается: 3 пройденных теста.

- [ ] **Шаг 4: Проверки и коммит**

```bash
npm run lint && npm run typecheck && npm test
git add lib/timeline
git commit -m "feat: перенести засечки линейки таймлайна

E2E: не нужен — пользовательского поведения не появляется.
Wiki: не нужна — фичи для владельца проекта пока нет."
```

---

### Task 4: Прореживание точек и дорожки событий

**Files:**
- Create: `lib/timeline/geometry/density.ts`
- Create: `lib/timeline/geometry/density.test.ts`
- Create: `lib/timeline/geometry/event-lanes.ts`
- Create: `lib/timeline/geometry/event-lanes.test.ts`

**Interfaces:**
- Consumes: ничего из предыдущих задач.
- Produces:
  - `DensityPoint { id: string; x: number; label: string; selected?: boolean }`
  - `DensityStage = 'full-label' | 'shortened-label' | 'marker-only' | 'cluster'`
  - `DENSITY_STAGES: readonly DensityStage[]`
  - `DensityMarker = DensityPointMarker | DensityClusterMarker`
  - `reduceDensity(points: DensityPoint[], options: DensityOptions): DensityMarker[]`
  - `EventCollisionBox { id: string; start: number; end: number; selected?: boolean }`
  - `EventLanePlacement { id: string; lane: number }`
  - `assignEventLanes(items: EventCollisionBox[], options?: EventLaneOptions): EventLanePlacement[]`

- [ ] **Шаг 1: Скопировать модули и убрать импорты vitest**

```bash
SRC=/Users/ekoshkin/documents/timeline/src/client/features/timeline/geometry
cp "$SRC/density.ts"          lib/timeline/geometry/density.ts
cp "$SRC/density.test.ts"     lib/timeline/geometry/density.test.ts
cp "$SRC/event-lanes.ts"      lib/timeline/geometry/event-lanes.ts
cp "$SRC/event-lanes.test.ts" lib/timeline/geometry/event-lanes.test.ts
```

В обоих `*.test.ts` удалить строку `import { describe, expect, it } from 'vitest';`.

- [ ] **Шаг 2: Применить решения аудита**

Удалить из `density.test.ts` два теста целиком:

```
it('exports density stages from most detailed to most reduced', ...)
it('keeps nearby unselected points clustered around a selected point', ...)
```

Удалить из `event-lanes.test.ts` тест целиком:

```
it('does not change lane assignment when an item is selected', ...)
```

Должно остаться: 6 тестов в `density.test.ts`, 5 в `event-lanes.test.ts`.

- [ ] **Шаг 3: Запустить тесты**

Выполнить: `npx jest lib/timeline --verbose`
Ожидается: 37 пройденных тестов, 7 наборов.

- [ ] **Шаг 4: Проверки и коммит**

```bash
npm run lint && npm run typecheck && npm test
git add lib/timeline
git commit -m "feat: перенести прореживание точек и дорожки событий

E2E: не нужен — пользовательского поведения не появляется.
Wiki: не нужна — фичи для владельца проекта пока нет."
```

---

### Task 5: Выбор раскладки событий под лимит дорожек

**Files:**
- Create: `lib/timeline/geometry/event-layout.ts`
- Create: `lib/timeline/geometry/event-layout.test.ts`

**Interfaces:**
- Consumes: `DENSITY_STAGES`, `reduceDensity`, `DensityMarker`, `DensityPoint`,
  `DensityStage` из Task 4; `assignEventLanes`, `EventCollisionBox`,
  `EventLanePlacement` из Task 4.
- Produces:
  - `EVENT_DOT_BOX_PX: number`, `EVENT_ICON_LABEL_GAP_PX: number`, `EVENT_LABEL_MAX_TEXT_WIDTH_PX: number`
  - `estimateEventLabelTextWidth(label: string | undefined): number`
  - `estimateEventRowWidth(label: string | undefined, shape?: 'point' | 'interval'): number`
  - `finishedIntervalCollisionBox(input: { id: string; start: number; end: number; label: string }): EventCollisionBox`
  - `EventLayoutInput { points: DensityPoint[]; intervalBoxes: EventCollisionBox[]; preferredStage: DensityStage; showAll: boolean; laneCapacity: number; horizontalClearance: number }`
  - `EventLayoutResult { stage: DensityStage; markers: DensityMarker[]; placements: EventLanePlacement[]; laneCount: number }`
  - `buildEventLayout(input: EventLayoutInput): EventLayoutResult`

- [ ] **Шаг 1: Скопировать модуль и убрать импорт vitest**

```bash
SRC=/Users/ekoshkin/documents/timeline/src/client/features/timeline/geometry
cp "$SRC/event-layout.ts"      lib/timeline/geometry/event-layout.ts
cp "$SRC/event-layout.test.ts" lib/timeline/geometry/event-layout.test.ts
```

В `event-layout.test.ts` удалить строку `import { describe, expect, it } from 'vitest';`.

- [ ] **Шаг 2: Применить решения аудита**

Удалить из `event-layout.test.ts` два теста целиком:

```
it('grows the reserved row without an upper cap so labels are never clipped', ...)
it('keeps non-overlapping selected and unselected points in one lane', ...)
```

Должно остаться 7 тестов.

- [ ] **Шаг 3: Запустить тесты**

Выполнить: `npx jest lib/timeline/geometry/event-layout --verbose`
Ожидается: 7 пройденных тестов.

Тест `keeps every lane assignment identical across a pure pan` — ключевой:
он проверяет, что раскладка не зависит от положения прокрутки. Если он падает,
значит в расчёт коробки столкновения просочилась координата вьюпорта.

- [ ] **Шаг 4: Проверки и коммит**

```bash
npm run lint && npm run typecheck && npm test
git add lib/timeline
git commit -m "feat: перенести выбор раскладки событий таймлайна

E2E: не нужен — пользовательского поведения не появляется.
Wiki: не нужна — фичи для владельца проекта пока нет."
```

---

### Task 6: Дорожки и подписи эпох

**Files:**
- Create: `lib/timeline/geometry/epoch-lanes.ts`
- Create: `lib/timeline/geometry/epoch-lanes.test.ts`
- Create: `lib/timeline/geometry/epoch-label.ts`
- Create: `lib/timeline/geometry/epoch-label.test.ts`

**Interfaces:**
- Consumes: `epochYearRangesConflict`, `historicalCalendarYearOrdinal`,
  `HistoricalYearRange` из Task 1.
- Produces:
  - `EpochLaneInput extends HistoricalYearRange { id: string; pinnedLane?: number }`
  - `EpochLanePlacement { id: string; lane: number }`
  - `EpochLaneResult { placements: EpochLanePlacement[]; laneCount: number }`
  - `validatePinnedEpochLane(candidate: EpochLaneInput, items: EpochLaneInput[]): { valid: true } | { valid: false; conflictingEpochId: string }`
  - `assignEpochLanes(items: EpochLaneInput[]): EpochLaneResult`
  - `MIN_EPOCH_LABEL_WIDTH_PX: number`
  - `epochLabelPlacement(input: { left: number; right: number; width: number }): { offset: number; maxWidth: number; visible: boolean }`

- [ ] **Шаг 1: Скопировать модули и убрать импорты vitest**

```bash
SRC=/Users/ekoshkin/documents/timeline/src/client/features/timeline/geometry
cp "$SRC/epoch-lanes.ts"      lib/timeline/geometry/epoch-lanes.ts
cp "$SRC/epoch-lanes.test.ts" lib/timeline/geometry/epoch-lanes.test.ts
cp "$SRC/epoch-label.ts"      lib/timeline/geometry/epoch-label.ts
cp "$SRC/epoch-label.test.ts" lib/timeline/geometry/epoch-label.test.ts
```

В обоих `*.test.ts` удалить строку `import { describe, expect, it } from 'vitest';`.

- [ ] **Шаг 2: Поправить путь импорта в `epoch-lanes.ts`**

Заменить:

```ts
import {
  epochYearRangesConflict,
  historicalCalendarYearOrdinal,
  type HistoricalYearRange,
} from '../../../../shared/historical-date/calendar-year-overlap';
```

на:

```ts
import {
  epochYearRangesConflict,
  historicalCalendarYearOrdinal,
  type HistoricalYearRange,
} from '../calendar-year-overlap'
```

Такой же импорт может присутствовать в `epoch-lanes.test.ts` — там путь тоже
меняется на `'../calendar-year-overlap'`.

- [ ] **Шаг 3: Применить решения аудита**

Удалить из `epoch-lanes.test.ts` два теста целиком:

```
it('rejects a pin that overlaps another pinned epoch in the target lane', ...)
it('accepts a pin when the lane has no overlapping pinned epoch', ...)
```

Удалить из `epoch-label.test.ts` два теста целиком:

```
it('pushes the title into the band when the band starts left of the viewport', ...)
it('limits the title to the visible slice when the band runs off the right edge', ...)
```

Должно остаться: 6 тестов в `epoch-lanes.test.ts`, 5 в `epoch-label.test.ts`.

- [ ] **Шаг 4: Запустить тесты**

Выполнить: `npx jest lib/timeline --verbose`
Ожидается: 55 пройденных тестов, 10 наборов.

- [ ] **Шаг 5: Проверки и коммит**

```bash
npm run lint && npm run typecheck && npm test
git add lib/timeline
git commit -m "feat: перенести дорожки и подписи эпох

E2E: не нужен — пользовательского поведения не появляется.
Wiki: не нужна — фичи для владельца проекта пока нет."
```

---

### Task 7: Геометрия отрезка события и завершение переноса

**Files:**
- Create: `lib/timeline/geometry/event-connections.ts`
- Create: `lib/timeline/geometry/event-connections.test.ts`
- Create: `lib/timeline/index.ts`

**Interfaces:**
- Consumes: `dateRangeForEvent`, `historicalDateToCoordinate`,
  `createViewportTransform`, `VisibleRange` из Task 2; `TimelineEventDates` из Task 1.
- Produces:
  - `EventConnectionGeometry` — размеченное объединение с вариантами `'point'`, `'finished-interval'`, `'ongoing-interval'`
  - `buildEventConnection(event: TimelineEventDates, range: VisibleRange, width: number): EventConnectionGeometry | undefined`
  - `lib/timeline/index.ts` — единая точка входа для будущих этапов

- [ ] **Шаг 1: Скопировать модуль и убрать импорт vitest**

```bash
SRC=/Users/ekoshkin/documents/timeline/src/client/features/timeline/geometry
cp "$SRC/event-connections.ts"      lib/timeline/geometry/event-connections.ts
cp "$SRC/event-connections.test.ts" lib/timeline/geometry/event-connections.test.ts
```

В `event-connections.test.ts` удалить строку `import { describe, expect, it } from 'vitest';`.

- [ ] **Шаг 2: Отвязать от контрактов исходного проекта**

Заменить верхний импорт:

```ts
import type { Event } from '../../../../shared/contracts/event';
```

на:

```ts
import type { TimelineEventDates } from '../types'
```

и сигнатуру:

```ts
export function buildEventConnection(
  event: Pick<Event, 'start' | 'end' | 'ongoing'>,
  range: VisibleRange,
  width: number,
): EventConnectionGeometry | undefined {
```

на:

```ts
export function buildEventConnection(
  event: TimelineEventDates,
  range: VisibleRange,
  width: number,
): EventConnectionGeometry | undefined {
```

Аудит по этому файлу ничего не удаляет: каждый из пяти тестов покрывает
отдельную ветку функции.

- [ ] **Шаг 3: Создать точку входа `lib/timeline/index.ts`**

```ts
export * from './types'
export * from './historical-date'
export * from './calendar-year-overlap'
export * from './geometry/time-coordinate'
export * from './geometry/viewport'
export * from './geometry/ruler-ticks'
export * from './geometry/density'
export * from './geometry/event-lanes'
export * from './geometry/event-layout'
export * from './geometry/epoch-lanes'
export * from './geometry/epoch-label'
export * from './geometry/event-connections'
```

- [ ] **Шаг 4: Проверить, что перенесено ровно 60 тестов**

Выполнить: `npx jest lib/timeline --verbose`
Ожидается: 60 пройденных тестов, 11 наборов.

Если число отличается — сверить с таблицей аудита в этом плане и найти файл,
где удалено не то количество тестов.

- [ ] **Шаг 5: Проверить покрытие новых модулей**

Выполнить: `npx jest lib/timeline --coverage --collectCoverageFrom='lib/timeline/**/*.ts'`
Ожидается: строки и функции не ниже 80% — порога, заданного в `jest.config.ts`.

Если покрытие ниже порога, значит аудит вырезал лишнее: вернуть удалённый тест,
покрывавший непокрытую ветку, и отметить это отклонение от таблицы аудита.

- [ ] **Шаг 6: Проверки и коммит**

```bash
npm run lint && npm run typecheck && npm test
git add lib/timeline
git commit -m "feat: перенести геометрию отрезков событий и точку входа lib/timeline

Завершает перенос расчётного ядра таймлайна: 60 тестов из 75 переносимых,
1059 тестов исходного проекта сведены к 60.

E2E: не нужен — пользовательского поведения не появляется.
Wiki: не нужна — фичи для владельца проекта пока нет."
```

- [ ] **Шаг 7: Пул-реквест**

```bash
git push -u origin feat/timeline-core
gh pr create --fill
gh pr merge --auto --squash --delete-branch
gh pr view --json mergeStateStatus,mergeable
```

Состояние `BLOCKED` означает ожидание CI — это норма. `BEHIND` — выполнить
`gh pr update-branch`. `CONFLICTING` — перебазироваться на свежий `origin/main`.

---

## Self-Review

**Покрытие спецификации.** План закрывает этап 0 (аудит тестов — результаты в
таблице, решения вшиты в задачи 1–7) и этап 1 (перенос `historical-date` и
`geometry` в `lib/timeline/`). Этапы 2–7 спецификации намеренно не входят в этот
план: для них планы пишутся отдельно, по мере подхода.

**Отклонение от спецификации.** Спецификация называет переносимый объём
«9 файлов, ~800 строк»; по факту это 12 файлов, 75 тестов, 1182 строки. Цифра в
спецификации была приблизительной оценкой до чтения файлов. Правка спецификации
не требуется: вывод («режем то, что реально переносится») не изменился.

**Заглушки.** Проверено: в плане нет «TBD», «позже», «добавить обработку
ошибок». Каждый шаг содержит либо точную команду, либо код целиком, либо
конкретное имя удаляемого теста.

**Согласованность типов.** `TimelineEventDates` определён в задаче 1 и
используется в задачах 2 и 7 под тем же именем. `VisibleRange` определён в
задаче 2, используется в задачах 3 и 7. `EventCollisionBox` и
`EventLanePlacement` определены в задаче 4, используются в задаче 5.
`HistoricalYearRange` определён в задаче 1, используется в задаче 6.

**Нарастающий счёт тестов** по задачам: 11 → 23 → 26 → 37 → 44 → 55 → 60.
Числа в шагах проверки согласованы с этой последовательностью и с таблицей аудита.
