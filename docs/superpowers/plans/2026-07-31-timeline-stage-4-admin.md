# Timeline, этап 4: справочники в админке

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Завести вкладку «Ленты времени» в панели администратора, чтобы события,
эпохи и типы событий создавались и правились на сайте, а не в локальном
приложении.

**Architecture:** Вкладка — клиентский компонент внутри существующего
`AdminPanel`, данные ходят через маршруты `app/api/admin/timeline/*`. Проверка
прав и мутации следуют укладу проекта: `auth()` + `session.user.isAdmin` в
каждом обработчике, запись только через `withAuditContext`. Валидация — чистые
функции в `lib/timeline/admin.ts`, повторяющие ограничения, уже стоящие в базе.

**Tech Stack:** Next.js App Router, React 18, Drizzle, zod, Jest, Playwright.

**Спецификация:** `docs/superpowers/specs/2026-07-31-timeline-section-design.md`
**Предыдущие этапы:** ядро — PR #502, схема и данные — PR #504, публичные страницы — PR #506, исправления — PR #507.

## Global Constraints

- **Только токены, никаких литералов цвета** в стилях. Проверка `scripts/check-no-raw-hex.sh` ловит hex внутри `style={{…}}` и Tailwind-классы с произвольным значением. Скрипт получает список файлов от lint-staged: запуск без аргументов ничего не проверяет.
- **Палитра цветов для типов и эпох — исключение.** Это значения, которые уедут в базу и потом придут обратно как данные. Хранить их массивом констант в отдельном файле (`components/nd/timeline/admin/palette.ts`), не в `style={{…}}` — тогда проверка не срабатывает и правило не нарушается по сути.
- Каждый обработчик начинается с `auth()` и `session?.user?.isAdmin`; иначе `403`. Образец — `app/api/admin/books/route.ts`.
- Каждый маршрут — `export const dynamic = 'force-dynamic'`.
- **Любая мутация — через `withAuditContext`** с `actorUserId` текущего админа и `source: 'admin'`. Без этого падает ESLint, а в журнале аудита появится запись с источником `trigger` — признак «забыли обернуть».
- Заголовки — `var(--nd-serif)`, текст и метки — `var(--nd-sans)`. Микрометки — UPPERCASE, `0.6rem`, `letter-spacing: 0.12em`, `var(--text-muted)`. Тёмной темы нет.
- Описания — markdown, редактируются существующим `components/nd/MarkdownToolbar.tsx`. Tiptap не добавлять.
- `AdminBooksCatalog.tsx` разросся до 1685 строк — **не повторять**: вкладка разбивается на компоненты по формам.
- Перед каждым коммитом: `npm run lint && npm run typecheck && npm test`.
- Работа — в отдельном worktree от свежего `origin/main`, изменения через PR с автомержем.
- **E2E нужны:** новый админский флоу, меняющий персистентное состояние.
- **Wiki нужна:** появляется админский workflow.

## Что входит и что нет

| Входит | Не входит |
|---|---|
| CRUD типов событий (название, цвет, иконка) | Сборка таймлайна: добавить событие в подборку, локальная заметка, цвет эпохи на таймлайне — этап 5 |
| CRUD событий (даты с эрами, тип, описание, картинка) | Создание и удаление самих таймлайнов — этап 5 |
| CRUD эпох (период, описание, картинка) | Фильтры, сохранённый масштаб, отмена действия — этап 6 |
| Переключатель публикации таймлайна | Загрузка файлов картинок — только внешние адреса |

**Переключатель публикации** — дополнение сверх спецификации: там он относится к
этапу 5. Причина: обе ленты уже опубликованы, и делать это пришлось запросом к
базе руками. Переключатель — один `PATCH` и одна кнопка; откладывать его на этап
позже значит ещё раз ходить в базу руками.

## Правила проверки данных

Повторяют ограничения, уже стоящие в базе миграцией `0056`. Форма обязана
отвергать данные до отправки, а маршрут — независимо от формы: база иначе
ответит невнятной ошибкой ограничения.

- год строго больше нуля, эра `BCE` или `CE`;
- день задаётся только вместе с месяцем;
- у события конец либо задан полностью (год и эра), либо отсутствует целиком;
- признак «продолжается» несовместим с датой окончания;
- у эпохи конец обязателен;
- начало не позже конца — сравнивать `compareHistoricalDates` из `lib/timeline`, а не числами: у дат есть эры и неполные значения;
- цвет — семь символов вида `#RRGGBB`;
- удаление типа, который используется хотя бы одним событием, запрещено: внешний ключ стоит `ON DELETE RESTRICT`, маршрут обязан вернуть `409` с понятным текстом, а не пятисотку.

---

## File Structure

Создаётся:

```
lib/timeline/admin.ts                      — схемы zod и проверки
lib/timeline/admin.test.ts
app/api/admin/timeline/event-types/route.ts        GET, POST
app/api/admin/timeline/event-types/[id]/route.ts   PATCH, DELETE
app/api/admin/timeline/events/route.ts             GET, POST
app/api/admin/timeline/events/[id]/route.ts        PATCH, DELETE
app/api/admin/timeline/epochs/route.ts             GET, POST
app/api/admin/timeline/epochs/[id]/route.ts        PATCH, DELETE
app/api/admin/timeline/timelines/route.ts          GET
app/api/admin/timeline/timelines/[id]/route.ts     PATCH — публикация
components/nd/timeline/admin/
  palette.ts                 — набор цветов для типов и эпох
  AdminTimelinePanel.tsx     — вкладка: списки и переключение между ними
  HistoricalDateField.tsx    — поле даты: год, эра, месяц, день
  HistoricalDateField.test.tsx
  EventTypeForm.tsx
  EventForm.tsx
  EpochForm.tsx
e2e/admin-timeline.spec.ts
```

Изменяется:

```
components/nd/AdminPanel.tsx     — вкладка «Ленты времени»
docs/features/timeline.md        — статусы этапов, описание админки
docs/wiki/Timelines.md           — раздел «Как редактировать»
```

---

### Task 1: Проверки и маршруты

**Files:**
- Create: `lib/timeline/admin.ts`, `lib/timeline/admin.test.ts`
- Create: восемь файлов маршрутов из списка выше

**Interfaces:**
- Consumes: таблицы Drizzle; `compareHistoricalDates` из `lib/timeline`.
- Produces:
  - `eventTypeInputSchema`, `eventInputSchema`, `epochInputSchema` — схемы zod
  - `assertEventDates(input): void` — бросает `TimelineValidationError` с русским текстом
  - `assertEpochDates(input): void`
  - `class TimelineValidationError extends Error`

- [ ] **Шаг 1: Создать рабочую папку**

```bash
git fetch origin main
git worktree add ../book-club-timeline-admin -b feat/timeline-admin origin/main
cd ../book-club-timeline-admin
ln -s ../book-club/node_modules node_modules
```

- [ ] **Шаг 2: Написать провальные тесты проверок**

`lib/timeline/admin.test.ts`. Обязательные случаи — по одному на каждое правило
из раздела «Правила проверки данных», плюс:

- событие «продолжается» с датой конца отвергается;
- событие с концом раньше начала отвергается, причём случай «100 до н. э. → 50 до н. э.» проходит, а «50 до н. э. → 100 до н. э.» нет (проверка эр, а не чисел);
- эпоха без конца отвергается;
- день без месяца отвергается;
- корректное событие-точка проходит.

- [ ] **Шаг 3: Реализовать `lib/timeline/admin.ts`**

Схемы zod повторяют форму колонок. Проверки дат — отдельными функциями, чтобы
их можно было звать и из маршрута, и из формы.

- [ ] **Шаг 4: Написать маршруты**

Восемь файлов по образцу `app/api/admin/books/route.ts` и
`app/api/admin/books/[id]/route.ts`. В каждом:

1. `export const dynamic = 'force-dynamic'`;
2. `auth()`, при отсутствии `isAdmin` — `403`;
3. разбор тела через zod, при ошибке — `400` с текстом;
4. проверки дат, при `TimelineValidationError` — `400` с её сообщением;
5. мутация внутри `withAuditContext({ actorUserId: session.user.id, source: 'admin', reason: '…' })`;
6. `DELETE` типа события: перед удалением посчитать события этого типа, при ненулевом — `409` с текстом «Тип используется в N событиях».

`PATCH /api/admin/timeline/timelines/[id]` принимает только `{ published: boolean }`.

- [ ] **Шаг 5: Тесты маршрутов**

По укладу проекта — рядом с маршрутом, с замоканными `auth` и `db`. Обязательно
проверить: неадмин получает `403`; удаление используемого типа даёт `409`;
успешная мутация вызывает `withAuditContext`.

Осторожно с сигнатурами: если обработчик не использует `req`, он объявляется без
аргументов и тест зовёт его без аргументов — иначе упадёт либо lint, либо
typecheck (типовая ошибка в этом репозитории).

- [ ] **Шаг 6: Проверки и коммит**

```bash
npm run lint && npm run typecheck && npm test
git add lib/timeline app/api/admin/timeline
git commit -m "feat: API справочников раздела Timeline

E2E: не нужен на этом шаге — интерфейса ещё нет, добавляется в задаче 3.
Wiki: нужна — правка идёт в задаче 3 этого плана."
```

---

### Task 2: Формы и вкладка

**Files:**
- Create: `components/nd/timeline/admin/palette.ts`
- Create: `components/nd/timeline/admin/HistoricalDateField.tsx` (+тест)
- Create: `components/nd/timeline/admin/EventTypeForm.tsx`
- Create: `components/nd/timeline/admin/EventForm.tsx`
- Create: `components/nd/timeline/admin/EpochForm.tsx`
- Create: `components/nd/timeline/admin/AdminTimelinePanel.tsx`
- Modify: `components/nd/AdminPanel.tsx`

**Interfaces:**
- Consumes: маршруты из Task 1; `MarkdownToolbar` из `components/nd/`.
- Produces: `<AdminTimelinePanel />` — единственный компонент, который подключает `AdminPanel`.

- [ ] **Шаг 1: Поле исторической даты**

`HistoricalDateField.tsx`: год (число), эра (переключатель «до н. э.» / «н. э.»),
месяц и день — необязательные. День недоступен, пока не выбран месяц: это
правило базы, и запрещать его в интерфейсе честнее, чем показывать ошибку после
отправки.

Тест на компонент: выбор месяца включает поле дня; снятие месяца очищает день.

- [ ] **Шаг 2: Палитра**

`palette.ts` — массив из 8–10 цветов, подходящих к пергаментному фону сайта.
Это данные, а не оформление: значения уедут в базу. Рядом — комментарий, почему
здесь допустим hex.

- [ ] **Шаг 3: Формы**

Три формы одного покроя: поля, кнопки «Сохранить» и «Отмена», показ ошибки от
маршрута. Кнопки и поля — с `/styleguide`, своих примитивов не изобретать.

- `EventTypeForm`: название, цвет из палитры, иконка (эмодзи, одно поле).
- `EventForm`: название, тип (выбор), дата начала, дата конца или «продолжается», описание markdown, адрес картинки, подпись.
- `EpochForm`: название, начало, конец, описание, картинка, подпись.

- [ ] **Шаг 4: Вкладка**

`AdminTimelinePanel.tsx`: три списка — события, эпохи, типы — с переключением
между ними; в каждом кнопка «Добавить» и правка по клику. Плюс список
таймлайнов с переключателем публикации и ссылкой на публичную страницу.

- [ ] **Шаг 5: Подключить к админке**

В `components/nd/AdminPanel.tsx` добавить вкладку рядом с существующими:
кнопка со стилем `tabStyle(view === 'timeline')`, `data-testid="admin-tab-timeline"`,
и ветку рендера. Тип `View` дополнить значением `'timeline'`.

- [ ] **Шаг 6: Проверки и коммит**

```bash
npm run lint && npm run typecheck && npm test
bash scripts/check-no-raw-hex.sh $(git diff --name-only --cached | grep -E '\.tsx?$')
git add components/nd
git commit -m "feat: вкладка «Ленты времени» в панели администратора

E2E: не нужен на этом шаге — добавляется в задаче 3.
Wiki: нужна — правка идёт в задаче 3 этого плана."
```

---

### Task 3: E2E и документация

**Files:**
- Create: `e2e/admin-timeline.spec.ts`
- Modify: `docs/features/timeline.md`, `docs/wiki/Timelines.md`

- [ ] **Шаг 1: Прочитать `docs/features/testing.md`**

Обязательно перед написанием спека: там разобраны живые локаторы,
кнопки-тогглы, оверлеи, перехватывающие клики, и правила изоляции от прод-базы.

- [ ] **Шаг 2: Написать E2E**

Сценарии:

1. Неадмин не видит вкладку и получает `403` от маршрута.
2. Админ создаёт тип события, затем событие этого типа — **после `page.reload()`** оба на месте (правило проекта: действие меняет персистентное состояние → тест обязан проверить, что оно пережило перезагрузку).
3. Созданное событие появляется на публичной странице таймлайна, если добавлено в подборку. Если добавления в подборку на этом этапе нет — проверить, что событие видно в админском списке.
4. Удаление типа, используемого событием, показывает понятную ошибку, а не падение.
5. Переключатель публикации: снять публикацию → неавторизованный получает 404; вернуть → страница снова открывается.

Данные — фикстурой с уборкой в teardown, только в Neon-ветку `e2e`.

- [ ] **Шаг 3: Прогон**

```bash
npm run test:e2e:focused -- e2e/admin-timeline.spec.ts
```

- [ ] **Шаг 4: Документация**

`docs/features/timeline.md` — этап 4 выполнен, описать маршруты и правила
валидации.
`docs/wiki/Timelines.md` — раздел «Как редактировать»: где вкладка, что можно
завести, почему нельзя удалить используемый тип, как публиковать. Убрать фразу
о том, что редактирование идёт в локальном приложении.

- [ ] **Шаг 5: Проверки, коммит, PR**

```bash
npm run lint && npm run typecheck && npm test
git add -A
git commit -m "feat: E2E и документация админки раздела Timeline

E2E: добавлены — новый админский флоу, меняющий персистентное состояние.
Wiki: обновлена — появился админский workflow."
git push -u origin feat/timeline-admin
gh pr create --fill
gh pr merge --auto --squash --delete-branch
gh pr view --json mergeStateStatus,mergeable
```

---

## Self-Review

**Покрытие спецификации.** Этап 4 требует вкладку «Таймлайны» с формами событий,
эпох и типов, поля дат с эрами, выбор цвета, markdown-редактор, маршруты
`app/api/admin/timeline/*` и мутации через `withAuditContext`. Всё распределено
по трём задачам. Утверждение спецификации «после этого локальное приложение
больше не нужно» станет верным только после этапа 5: сборка подборок остаётся
там.

**Дополнение сверх спецификации.** Переключатель публикации таймлайна перенесён
из этапа 5. Обоснование в разделе «Что входит».

**Заглушки.** Шаги задач 2 и 3 задают требования и источники образцов, а не
готовый код: это формы на несколько сотен строк, повторять их в плане значит
писать реализацию дважды. Все решения, которые нельзя вывести из кода
(правила валидации, поведение при удалении используемого типа, где допустим
hex, какой компонент markdown брать, обязательность `page.reload()` в тесте),
заданы явно.

**Согласованность типов.** `TimelineValidationError`, `assertEventDates`,
`assertEpochDates` объявлены в Task 1 и используются в маршрутах там же и в
формах Task 2. Компонент `AdminTimelinePanel` объявлен в Task 2 и подключается
в `AdminPanel` там же.
