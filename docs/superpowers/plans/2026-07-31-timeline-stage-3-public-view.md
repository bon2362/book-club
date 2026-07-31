# Timeline, этап 3: публичный просмотр

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Открыть раздел `/timeline` со списком таймлайнов и страницу
`/timeline/<адрес>` с лентой времени, которой можно поделиться ссылкой без входа
на сайт.

**Architecture:** Страницы — серверные компоненты App Router: читают базу через
`lib/timeline/queries.ts` и отдают готовые данные клиентскому компоненту ленты.
Вся математика раскладки уже перенесена на этапе 1 (`lib/timeline/geometry/`) —
компоненты только размещают элементы по её результатам. Редактирование,
фильтры и перетаскивание в этот этап не входят.

**Tech Stack:** Next.js App Router, React 18, Drizzle, Playwright.

**Спецификация:** `docs/superpowers/specs/2026-07-31-timeline-section-design.md`
**Предыдущие этапы:** ядро — PR #502, схема и данные — PR #504.

## Global Constraints

- **Только токены, никаких литералов цвета.** Ни одного сырого hex в inline-стиле, ни одного Tailwind-класса с произвольным значением. Цвет, шрифт, линия — через `var(--…)` из `app/globals.css`. Есть проверка `scripts/check-no-raw-hex.sh`.
- **Исключение — цвета данных.** Цвет типа события и цвет эпохи хранятся в базе как hex и приходят из данных. Их подставлять в `style` можно: это значение, а не литерал в коде. Через токены их выразить нельзя.
- Заголовки — `var(--nd-serif)`, текст и метки — `var(--nd-sans)`. Микрометки — UPPERCASE, `letter-spacing: 0.12em`, `0.6rem`, `var(--text-muted)`.
- Геометрия — `var(--radius)`. Тёмной темы в проекте нет, `dark:` не добавлять.
- Inline `style={{…}}` с `var(--…)` — канон проекта, весь `components/nd/*` написан так.
- Перед вёрсткой посмотреть живую витрину примитивов `/styleguide` и не изобретать кнопки и карточки заново.
- Публичное чтение — без авторизации. Показываются только `published = true`, **кроме админа**: он видит и неопубликованные (иначе после выката раздел будет пустым и проверить нечего).
- Мутаций на этом этапе нет, значит `withAuditContext` не нужен.
- Перед каждым коммитом: `npm run lint && npm run typecheck && npm test`.
- Работа — в отдельном worktree от свежего `origin/main`, изменения через PR с автомержем.
- **E2E нужны:** появляется новый пользовательский флоу и условный рендер по данным.
- **Wiki нужна:** появляется пользовательская фича; обновить `docs/wiki/Timelines.md` (раздел «Текущее состояние») и `docs/features/timeline.md` (таблица статусов этапов).

## Что переносится и что нет

В исходном приложении отрисовка размазана по шести файлам на ~1400 строк, но
половина из них — редактирование, которое относится к этапам 5–6.

| Файл источника | Строк | Этап 3 |
|---|---|---|
| `TimelineRenderer.tsx` | 259 | Переносится без редактирования: убрать `onCreateAtDate`, `onUpdateInterval`, `onUpdateEpochMembership`, `onImmediateUndo`, блок `TimelineFilters` |
| `EventLayer.tsx` | 716 | Переносится частично: разметка событий, кластеров и интервалов, подсказка при наведении. **Не переносится** `IntervalEvent` с ручками изменения границ (~150 строк) |
| `EpochLayer.tsx` | 173 | Переносится без перетаскивания |
| `TimeRuler.tsx` | 30 | Переносится целиком |
| `TimelineControls.tsx` | 45 | Переносится целиком (приблизить, отдалить, вместить) |
| `use-timeline-navigation.ts` | 199 | Переносится целиком: колесо мыши и перетаскивание полотна |
| `TimelineFilters.tsx` | 218 | **Не переносится** — этап 6 |
| `WorkspaceDivider.tsx` | 110 | **Не переносится** — разделитель панелей не портируется |
| `UndoToast.tsx` | 52 | **Не переносится** — этап 6 |

Сохранённые в базе `filter_type_ids`, `epochs_visible`, `show_all` **применяются**
как начальное состояние просмотра, но управления ими на странице нет.

## Мобильные

По решению владельца — десктоп-онли. На узком экране лента не показывается, вместо
неё вертикальный список событий по хронологии: название, дата, тип, описание.

Переключение — через CSS `@media (max-width: 768px)`, а не через JS-определение
ширины. Причина: серверный рендер не знает ширину экрана, и хук вызвал бы
расхождение разметки при гидратации. Оба варианта попадают в разметку, лишний
скрыт — на 31 событии это дешевле, чем разбираться с гидратацией.

---

## File Structure

Создаётся:

```
lib/timeline/queries.ts               — чтение таймлайнов из базы
lib/timeline/queries.test.ts
lib/timeline/view-model.ts            — строки БД → данные для отрисовки
lib/timeline/view-model.test.ts
app/timeline/page.tsx                 — список таймлайнов
app/timeline/[slug]/page.tsx          — страница таймлайна
app/timeline/[slug]/not-found.tsx     — «таймлайн не найден»
components/nd/timeline/
  TimelineView.tsx                    — клиентский оркестратор: масштаб, выбор
  TimelineRuler.tsx                   — линейка лет
  TimelineEventLayer.tsx              — события, кластеры, интервалы
  TimelineEpochLayer.tsx              — полосы эпох
  TimelineDetailCard.tsx              — карточка выбранного элемента
  TimelineMobileList.tsx              — вертикальный список для узкого экрана
  TimelineControls.tsx                — приблизить / отдалить / вместить
  use-timeline-navigation.ts          — колесо мыши и перетаскивание
e2e/timeline.spec.ts                  — открытие по ссылке, выбор события
e2e/timeline-layout.spec.ts           — геометрия ленты через boundingBox
```

Изменяется:

```
components/nd/Header.tsx              — ссылка на раздел
docs/features/timeline.md             — статусы этапов
docs/wiki/Timelines.md                — «Текущее состояние»
```

**Почему `view-model.ts` отдельно от `queries.ts`:** запрос возвращает плоские
строки с внешними ключами, а отрисовке нужна собранная структура (событие вместе
со своим типом, эпоха вместе с цветом из связи). Разделение позволяет тестировать
сборку без базы.

---

### Task 1: Чтение из базы и модель отображения

**Files:**
- Create: `lib/timeline/view-model.ts`, `lib/timeline/view-model.test.ts`
- Create: `lib/timeline/queries.ts`, `lib/timeline/queries.test.ts`

**Interfaces:**
- Consumes: таблицы Drizzle из `lib/db/schema`; `TimelineEventDates` из `lib/timeline/types`.
- Produces:
  - `TimelineSummary { id, slug, title, description, published, eventCount }`
  - `TimelineEventView { id, title, typeId, typeTitle, color, icon, start, end?, ongoing, description, imageUrl, imageCaption, note }`
  - `TimelineEpochView { id, title, start, end, description, imageUrl, imageCaption, note, color, visible, pinnedLane? }`
  - `TimelineViewData { id, slug, title, description, published, viewportStart, viewportEnd, filterTypeIds, epochsVisible, showAll, events: TimelineEventView[], epochs: TimelineEpochView[] }`
  - `buildTimelineView(rows): TimelineViewData` — сборка из плоских строк
  - `fetchPublishedTimelines(): Promise<TimelineSummary[]>`
  - `fetchTimelineBySlug(slug: string): Promise<TimelineViewData | null>`

- [ ] **Шаг 1: Создать рабочую папку**

```bash
git fetch origin main
git worktree add ../book-club-timeline-view -b feat/timeline-public-view origin/main
cd ../book-club-timeline-view
ln -s ../book-club/node_modules node_modules
```

- [ ] **Шаг 2: Написать провальный тест сборки модели**

Создать `lib/timeline/view-model.test.ts`. Проверить обязательно:

- событие собирается вместе со своим типом (цвет и иконка приходят из `historical_event_types`, не из события);
- у эпохи цвет берётся из связи `timeline_epochs`, а не из самой эпохи — на разных таймлайнах одна эпоха может быть разного цвета;
- события отсортированы по хронологии, включая «до н. э.» перед «н. э.» (использовать `compareHistoricalDates` из `lib/timeline/historical-date`);
- событие без даты конца отдаёт `end: undefined`, а не `null` — геометрия ждёт `TimelineEventDates`;
- невидимая эпоха (`visible = false`) остаётся в наборе с флагом, а не выбрасывается: решение о показе принимает слой отрисовки;
- пустой таймлайн даёт пустые массивы, а не падение.

- [ ] **Шаг 3: Запустить тест, убедиться что падает**

Выполнить: `npx jest lib/timeline/view-model`

- [ ] **Шаг 4: Написать `view-model.ts`**

Чистые функции, к базе не обращаются. Даты собираются из колонок
`start_year`/`start_era`/`start_month`/`start_day` в объект `HistoricalDate`;
`null` в месяце и дне превращается в отсутствующее поле, а не в `null` — иначе
`historicalDateSchema` не примет.

- [ ] **Шаг 5: Написать `queries.ts`**

Два запроса через Drizzle:

`fetchPublishedTimelines()` — список с числом событий, только `published = true`,
сортировка по названию.

`fetchTimelineBySlug(slug)` — таймлайн со связями. Джойны:
`timelines` → `timeline_events` → `historical_events` → `historical_event_types`,
и `timelines` → `timeline_epochs` → `historical_epochs`. Собрать через
`buildTimelineView`. Возвращает `null`, если таймлайна нет.

**Фильтр по `published` в запрос не зашивать** — страница решает сама, потому что
админу показываются и неопубликованные.

- [ ] **Шаг 6: Тест запросов**

`lib/timeline/queries.test.ts` — с замоканным `@/lib/db` (в проекте так делают в
других тестах `lib/`). Проверить, что `fetchPublishedTimelines` добавляет условие
по `published`, а `fetchTimelineBySlug` — нет.

- [ ] **Шаг 7: Проверки и коммит**

```bash
npm run lint && npm run typecheck && npm test
git add lib/timeline
git commit -m "feat: чтение таймлайнов из базы и модель отображения

E2E: не нужен на этом шаге — интерфейса ещё нет, добавляется в задаче 4.
Wiki: не нужна на этом шаге — пользовательской фичи ещё нет."
```

---

### Task 2: Компоненты ленты

**Files:**
- Create: `components/nd/timeline/use-timeline-navigation.ts`
- Create: `components/nd/timeline/TimelineControls.tsx`
- Create: `components/nd/timeline/TimelineRuler.tsx`
- Create: `components/nd/timeline/TimelineEpochLayer.tsx`
- Create: `components/nd/timeline/TimelineEventLayer.tsx`
- Create: `components/nd/timeline/TimelineDetailCard.tsx`
- Create: `components/nd/timeline/TimelineMobileList.tsx`
- Create: `components/nd/timeline/TimelineView.tsx`

**Interfaces:**
- Consumes: `TimelineViewData`, `TimelineEventView`, `TimelineEpochView` из Task 1;
  `buildEventLayout`, `assignEpochLanes`, `epochLabelPlacement`, `buildRulerTicks`,
  `createViewportTransform`, `fitRange`, `zoomRangeAroundPointer`, `panRange`,
  `dateRangeForEvent`, `historicalDateToCoordinate`, `buildEventConnection` из `lib/timeline`.
- Produces: `<TimelineView timeline={...} />` — единственный компонент, который
  используют страницы.

Источник для переноса: `/Users/ekoshkin/documents/timeline/src/client/features/timeline/`.
Брать оттуда логику и разметку, **не брать** CSS-классы и значения цветов —
вёрстка переписывается на токены.

- [ ] **Шаг 1: Перенести навигацию**

Скопировать `use-timeline-navigation.ts`, поправить импорты на `@/lib/timeline`.
Он даёт масштабирование колесом с сохранением точки под курсором и перетаскивание
полотна. Логику не менять.

- [ ] **Шаг 2: Линейка**

`TimelineRuler.tsx` — порт `TimeRuler.tsx` (30 строк). Засечки от `buildRulerTicks`.
Крупная засечка — год подписью `var(--nd-sans)`, `0.6rem`, `var(--text-muted)`,
UPPERCASE не нужен (это цифры). Мелкая — только штрих `var(--border)`.

- [ ] **Шаг 3: Слой эпох**

`TimelineEpochLayer.tsx` — порт `EpochLayer.tsx` без перетаскивания.
Дорожки от `assignEpochLanes`, положение подписи от `epochLabelPlacement`.
Полоса эпохи заливается своим цветом из данных с прозрачностью; подпись —
`var(--nd-serif)`. Эпохи с `visible = false` не рисуются.

- [ ] **Шаг 4: Слой событий**

`TimelineEventLayer.tsx` — порт отрисовочной части `EventLayer.tsx`.
Раскладка целиком от `buildEventLayout` — самому ничего не считать.

Три вида элементов: точка (кружок цвета типа с иконкой), интервал (отрезок от
начала к концу), кластер (кружок с числом, клик приближает к его границам через
`fitRange`). Подпись события — `var(--nd-sans)`, `0.84rem`, `var(--text)`.

Ручки изменения границ интервала (`IntervalEvent`, ~150 строк исходника) **не
переносить**.

- [ ] **Шаг 5: Карточка деталей**

`TimelineDetailCard.tsx` — то, что показывается при клике на событие или эпоху:
название `var(--nd-serif)`, дата микрометкой, описание через `react-markdown`
(как в остальном проекте), картинка при наличии с подписью.

Карточка — не модальное окно, а панель сбоку или под лентой; фон
`var(--bg-input)`, рамка `1px solid var(--border)`, радиус `var(--radius)`.

- [ ] **Шаг 6: Мобильный список**

`TimelineMobileList.tsx` — вертикальный список событий по хронологии.
Каждая строка: дата микрометкой, название `var(--nd-serif)`, тип цветной линией
слева (не заливкой — правило дизайн-системы), описание в markdown.

- [ ] **Шаг 7: Оркестратор**

`TimelineView.tsx` (`'use client'`) — держит состояние видимого диапазона и
выбранного элемента, собирает всё вместе. Начальный диапазон: сохранённый
`viewportStart`/`viewportEnd`, а если их нет — `fitRange` по всем датам с
отступом 0.15 (как в исходнике). Начальные `filterTypeIds` и `showAll` из данных
применяются, управления ими нет.

Лента прячется на узком экране, список — на широком, через `@media (max-width: 768px)`.

- [ ] **Шаг 8: Проверки и коммит**

```bash
npm run lint && npm run typecheck && npm test
bash scripts/check-no-raw-hex.sh
git add components/nd/timeline
git commit -m "feat: компоненты ленты времени на токенах проекта

E2E: не нужен на этом шаге — страниц ещё нет, добавляется в задаче 4.
Wiki: не нужна на этом шаге — фича ещё не доступна пользователю."
```

---

### Task 3: Страницы, ссылка в шапке, тесты и документация

**Files:**
- Create: `app/timeline/page.tsx`, `app/timeline/[slug]/page.tsx`, `app/timeline/[slug]/not-found.tsx`
- Create: `e2e/timeline.spec.ts`, `e2e/timeline-layout.spec.ts`
- Modify: `components/nd/Header.tsx`, `docs/features/timeline.md`, `docs/wiki/Timelines.md`

**Interfaces:**
- Consumes: `fetchPublishedTimelines`, `fetchTimelineBySlug` из Task 1;
  `<TimelineView>` из Task 2.
- Produces: маршруты `/timeline` и `/timeline/[slug]`.

- [ ] **Шаг 1: Страница списка**

`app/timeline/page.tsx` — серверный компонент. Заголовок раздела, под ним
карточки таймлайнов: название `var(--nd-serif)`, описание, число событий
микрометкой. Админу дополнительно показываются неопубликованные с пометкой
«черновик» (акцентной линией, не заливкой).

Пустой список — короткое объяснение, а не пустой экран.

- [ ] **Шаг 2: Страница таймлайна**

`app/timeline/[slug]/page.tsx` — серверный компонент: читает по адресу,
`notFound()` если нет или если не опубликован и смотрит не админ.

Обязательно `export const dynamic = 'force-dynamic'` — иначе Next.js закэширует
страницу на сборке и правки данных не будут видны (правило проекта для
маршрутов, читающих внешние данные).

Метаданные для ссылки в мессенджере: `generateMetadata` с названием и описанием
таймлайна — раздел существует ради того, чтобы им делиться.

- [ ] **Шаг 3: Ссылка в шапке**

В `components/nd/Header.tsx` добавить ссылку на `/timeline` рядом с
существующими. Стиль скопировать у соседней ссылки, своих значений не вводить.

- [ ] **Шаг 4: E2E на флоу**

`e2e/timeline.spec.ts`. Обязательные проверки:

- неавторизованный пользователь открывает `/timeline/<адрес>` опубликованного
  таймлайна и видит его название и хотя бы одно событие;
- клик по событию показывает карточку с его описанием;
- неопубликованный таймлайн неавторизованному отдаёт 404;
- список `/timeline` содержит опубликованный и не содержит неопубликованный.

Данные готовить фикстурой с уборкой в teardown — писать только в Neon-ветку
`e2e`, существующие строки не редактировать. Перед написанием прочитать
`docs/features/testing.md`: там разобраны живые локаторы, кнопки-тогглы и
типовые грабли.

- [ ] **Шаг 5: E2E на геометрию**

`e2e/timeline-layout.spec.ts` — обязателен по правилам проекта, потому что
поведение зависит от CSS. Через `boundingBox()` проверить:

- подписи соседних событий не накладываются друг на друга;
- полоса эпохи начинается левее и кончается правее своих дат, а подпись остаётся
  в видимой части полосы;
- на ширине 375 px лента скрыта, а вертикальный список виден;
- на ширине 1280 px наоборот.

- [ ] **Шаг 6: Прогон**

```bash
npm run test:e2e:focused -- e2e/timeline.spec.ts
npm run test:e2e:focused -- e2e/timeline-layout.spec.ts
```

- [ ] **Шаг 7: Документация**

`docs/features/timeline.md` — отметить этап 3 выполненным, описать маршруты.
`docs/wiki/Timelines.md` — переписать «Текущее состояние»: раздел доступен по
ссылке, редактирование по-прежнему в локальном приложении до этапа 4, объяснить
что такое черновик и как опубликовать.

- [ ] **Шаг 8: Проверки, коммит, PR**

```bash
npm run lint && npm run typecheck && npm test
bash scripts/check-no-raw-hex.sh
git add -A
git commit -m "feat: публичные страницы раздела Timeline

E2E: добавлены — новый пользовательский флоу и условный рендер по данным.
Wiki: обновлена — появилась пользовательская фича."
git push -u origin feat/timeline-public-view
gh pr create --fill
gh pr merge --auto --squash --delete-branch
gh pr view --json mergeStateStatus,mergeable
```

---

## После мержа — публикация (делает владелец)

Оба таймлайна в проде неопубликованы. Порядок: зайти админом на `/timeline`,
посмотреть черновики глазами, затем публиковать. Переключателя публикации в
интерфейсе пока нет — он появится на этапе 4, до тех пор флаг ставится запросом:

```sql
UPDATE timelines SET published = true WHERE slug = 'vseobschaya-istoriya';
```

Этого шага в задачах нет намеренно: что и когда показывать участникам —
решение владельца, а не исполнителя.

---

## Self-Review

**Покрытие спецификации.** Этап 3 спецификации требует: страницы `/timeline` и
`/timeline/[slug]` (задача 3), порт `TimelineRenderer`/`EventLayer`/`EpochLayer`
на токены (задача 2), простой вертикальный список на узком экране (задача 2,
шаг 6), E2E на открытие по ссылке и layout-тест (задача 3, шаги 4–5). Закрыто
полностью.

**Дополнение сверх спецификации.** Показ неопубликованных таймлайнов админу.
Без него после выката раздел был бы пуст: оба таймлайна перенесены с
`published = false`, а переключателя публикации до этапа 4 нет. Владелец
не смог бы проверить работу.

**Заглушки.** Шаги 4–7 задачи 2 и шаги 1–2 задачи 3 задают требования и
источник переноса, а не готовый код: это вёрстка на 600–800 строк, и вписывать
её целиком в план значит писать реализацию дважды. Все решения, которые нельзя
вывести из кода (что не переносить, какие токены, чем считать раскладку, где
`force-dynamic`, откуда берётся цвет эпохи), заданы явно.

**Согласованность типов.** `TimelineViewData`, `TimelineEventView`,
`TimelineEpochView` объявлены в задаче 1 и используются под теми же именами в
задачах 2 и 3. Тип модели данных называется `TimelineViewData`, компонент — `TimelineView`:
имена намеренно разведены, чтобы не пересекались в импортах.
