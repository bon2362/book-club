# Timeline, этап 5: сборка лент

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать возможность собирать ленту на сайте: создавать её, включать в неё
события и эпохи из общей базы, писать к ним заметки и задавать оформление эпох.
После этого локальное приложение перестаёт быть нужным.

**Architecture:** Продолжение вкладки «Ленты времени» из этапа 4. Подвкладка
«Ленты» получает создание, правку и экран состава; связи правятся маршрутами
`app/api/admin/timeline/timelines/[id]/{events,epochs}/[itemId]`. Проверка
занятости дорожки эпохи берётся из уже перенесённого расчётного ядра, а не
пишется заново.

**Tech Stack:** Next.js App Router, React 18, Drizzle, zod, Jest, Playwright.

**Спецификация:** `docs/superpowers/specs/2026-07-31-timeline-section-design.md`
**Предыдущие этапы:** ядро — PR #502, схема и данные — PR #504, публичные страницы — PR #506, исправления — PR #507, справочники в админке — PR #509.

## Global Constraints

- **Только токены**, никаких сырых hex в `style={{…}}`. Палитра цветов эпох — из существующего `components/nd/timeline/admin/palette.ts`, новую не заводить. Проверка: `bash scripts/check-no-raw-hex.sh <файлы>` — **скрипт принимает список файлов аргументами; без аргументов он ничего не проверяет и возвращает успех**.
- Проверка прав в каждом обработчике: `auth()` + `session?.user?.isAdmin`, иначе `403`. Каждый маршрут — `export const dynamic = 'force-dynamic'`.
- **Любая мутация — через `withAuditContext`** с `actorUserId` админа и `source: 'admin'`.
- Переиспользовать готовое из этапа 4: `components/nd/timeline/admin/shared.ts` (стили, типы, форматирование дат), `MarkdownField.tsx`, `HistoricalDateField.tsx`, `palette.ts`. Не заводить их копии.
- `AdminTimelinePanel.tsx` уже 311 строк — экран состава выносить отдельными файлами, не наращивать панель.
- Заголовки — `var(--nd-serif)`, метки — `var(--nd-sans)`, микрометки UPPERCASE `0.6rem`.
- Перед каждым коммитом: `npm run lint && npm run typecheck && npm test`.
- Работа — в отдельном worktree от свежего `origin/main`, изменения через PR с автомержем.
- **E2E нужны:** новый флоу, меняющий персистентное состояние; тест обязан включать `page.reload()`.
- **Wiki нужна:** меняется админский workflow, и утверждение «состав собирается в локальном приложении» становится неверным.

## Что входит и что нет

| Входит | Не входит |
|---|---|
| Создание, правка и удаление ленты (название, адрес, описание) | Фильтры по типам, сохранённый масштаб, отмена действия — этап 6 |
| Включение и исключение событий и эпох | Перетаскивание границ интервала мышью — этап 6 |
| Заметка к связи (markdown) | Мобильная вёрстка админки — вкладка десктопная, как вся панель |
| Цвет, видимость и закреплённая дорожка эпохи на ленте | Загрузка файлов картинок — только внешние адреса |

## Правила проверки данных

- **Адрес ленты** (`slug`): `^[a-z0-9]+(-[a-z0-9]+)*$`, уникален. Занятый адрес → `409` с понятным текстом, а не пятисотка от ограничения базы.
- **Цвет эпохи на ленте** — семь символов `#RRGGBB`.
- **Дорожка** (`pinnedLane`) — целое, не меньше нуля.
- **Занятая дорожка.** Две эпохи с пересечением больше одного календарного года не могут делить закреплённую дорожку. Проверять **`validatePinnedEpochLane` из `lib/timeline`** — она уже перенесена и покрыта тестами; при конфликте вернуть `409` с названием мешающей эпохи. Своей проверки не писать: правило «пересечение ровно в один год допустимо, в два — нет» неочевидно и там уже выверено.
- **Удаление ленты** убирает только подборку: события и эпохи остаются в общей базе. Связи уходят каскадом (`ON DELETE CASCADE` в миграции 0056).

---

## File Structure

Создаётся:

```
app/api/admin/timeline/timelines/[id]/contents/route.ts         GET — состав ленты
app/api/admin/timeline/timelines/[id]/events/[eventId]/route.ts PUT, DELETE
app/api/admin/timeline/timelines/[id]/epochs/[epochId]/route.ts PUT, DELETE
lib/timeline/contents.ts                                        схемы и проверки связей
lib/timeline/contents.test.ts
components/nd/timeline/admin/
  TimelineForm.tsx            — название, адрес, описание
  TimelineContents.tsx        — экран состава: две колонки, поиск
  MembershipDetail.tsx        — заметка, цвет, видимость, дорожка
e2e/timeline-contents.spec.ts
```

Изменяется:

```
app/api/admin/timeline/timelines/route.ts        + POST
app/api/admin/timeline/timelines/[id]/route.ts   PATCH принимает название/адрес/описание; + DELETE
components/nd/timeline/admin/AdminTimelinePanel.tsx  переход в форму и в экран состава
docs/features/timeline.md, docs/wiki/Timelines.md
```

---

### Task 1: Маршруты состава

**Files:**
- Create: `lib/timeline/contents.ts` (+тест)
- Create: три файла маршрутов из списка
- Modify: `app/api/admin/timeline/timelines/route.ts`, `.../[id]/route.ts`

**Interfaces:**
- Consumes: `validatePinnedEpochLane`, `historicalCalendarYearOrdinal` из `lib/timeline`; `TimelineValidationError` из `lib/timeline/admin`.
- Produces:
  - `timelineInputSchema` — название, адрес, описание
  - `eventMembershipSchema` — `{ note?: string }`
  - `epochMembershipSchema` — `{ note?: string; color: string; visible: boolean; pinnedLane?: number | null }`
  - `assertEpochLaneFree(candidate, existing): void` — обёртка над `validatePinnedEpochLane`, бросает `TimelineValidationError` с названием мешающей эпохи

- [ ] **Шаг 1: Рабочая папка**

```bash
git fetch origin main
git worktree add ../book-club-timeline-contents -b feat/timeline-contents origin/main
cd ../book-club-timeline-contents
ln -s ../book-club/node_modules node_modules
ln -sf /Users/ekoshkin/book-club/.env.local .env.local
ln -sf /Users/ekoshkin/book-club/.env.test.local .env.test.local
```

- [ ] **Шаг 2: Провальные тесты `lib/timeline/contents.test.ts`**

Обязательные случаи:

- адрес `moya-lenta` проходит, `Моя Лента`, `moya_lenta`, `-abc`, `abc-` — нет;
- цвет `#7463BA` проходит, `7463BA` и `#74` — нет;
- дорожка `-1` отвергается, `0` проходит;
- **две эпохи с пересечением в два календарных года не делят закреплённую дорожку** — ошибка содержит название мешающей эпохи;
- **две эпохи с пересечением ровно в один год делить дорожку могут** — это граница, ради которой и берётся готовая функция.

- [ ] **Шаг 3: Реализовать `lib/timeline/contents.ts`**

`assertEpochLaneFree` собирает вход для `validatePinnedEpochLane` (там нужны
`id`, `start`, `end`, `pinnedLane`), зовёт её и превращает отказ в
`TimelineValidationError` с названием конфликтующей эпохи.

- [ ] **Шаг 4: Маршрут состава**

`GET /api/admin/timeline/timelines/[id]/contents` возвращает: саму ленту,
включённые события со своими типами и заметками, включённые эпохи с цветом,
видимостью и дорожкой, и списки того, что **ещё не включено** — чтобы форма не
делала второй запрос.

- [ ] **Шаг 5: Маршруты связей**

`PUT .../events/[eventId]` — вставка или обновление заметки (`upsert` по
составному ключу). `DELETE` — удаление связи.

`PUT .../epochs/[epochId]` — то же плюс цвет, видимость, дорожка; перед записью
`assertEpochLaneFree` по остальным эпохам этой ленты, при конфликте `409`.

Оба `PUT` идемпотентны: повторный вызов с теми же данными не должен падать.

- [ ] **Шаг 6: Создание, правка и удаление ленты**

`POST /api/admin/timeline/timelines` — создать. Занятый адрес → `409`.
`PATCH .../[id]` — расширить: помимо `published` принимать название, адрес и
описание. Смена адреса на занятый → `409`.
`DELETE .../[id]` — удалить ленту.

- [ ] **Шаг 7: Тесты маршрутов**

С замоканными `auth` и `db`, по укладу этапа 4. Обязательно: неадмин → `403`;
занятый адрес → `409`; конфликт дорожки → `409`; успешная мутация идёт через
`withAuditContext`.

- [ ] **Шаг 8: Проверки и коммит**

```bash
npm run lint && npm run typecheck && npm test
git add lib/timeline app/api/admin/timeline
git commit -m "feat: API состава лент времени

E2E: не нужен на этом шаге — интерфейса ещё нет, добавляется в задаче 3.
Wiki: нужна — правка идёт в задаче 3 этого плана."
```

---

### Task 2: Экран состава

**Files:**
- Create: `components/nd/timeline/admin/TimelineForm.tsx`
- Create: `components/nd/timeline/admin/TimelineContents.tsx`
- Create: `components/nd/timeline/admin/MembershipDetail.tsx`
- Modify: `components/nd/timeline/admin/AdminTimelinePanel.tsx`

**Interfaces:**
- Consumes: маршруты из Task 1; `shared.ts`, `MarkdownField`, `palette.ts` из этапа 4.
- Produces: `<TimelineContents timelineId={…} onBack={…} />`.

- [ ] **Шаг 1: Форма ленты**

`TimelineForm.tsx` — название, адрес, описание. Под полем адреса показывать
итоговую ссылку вида `/timeline/<адрес>`: адрес — то, чем будут делиться, и
видеть результат до сохранения важнее, чем экономить строку.

- [ ] **Шаг 2: Экран состава**

`TimelineContents.tsx` — две колонки: «В ленте» и «Можно добавить», с полем
поиска над каждой. Строка — название, дата, тип. Кнопка в строке включает или
исключает. Переключатель «События / Эпохи» сверху.

Порядок в колонке «В ленте» — хронологический, как на самой ленте: сортировать
`compareHistoricalDates` из `lib/timeline`, не строками.

- [ ] **Шаг 3: Правка связи**

`MembershipDetail.tsx` — открывается по клику на строку в колонке «В ленте»:
заметка markdown через `MarkdownField`; для эпохи дополнительно цвет из
`palette.ts`, переключатель видимости и поле дорожки. Ошибку от маршрута
(занятая дорожка) показывать текстом рядом с полем, а не общим баннером.

- [ ] **Шаг 4: Связать с панелью**

В `AdminTimelinePanel.tsx`: кнопка «Добавить» в подвкладке «Ленты» открывает
`TimelineForm`; клик по названию ленты — `TimelineContents`; у строки ленты
появляются «Править» и «Удалить». Удаление — с подтверждением, где сказано, что
события и эпохи останутся в общей базе.

Убрать подпись «Состав лент собирается в локальном приложении» — она перестаёт
быть правдой.

- [ ] **Шаг 5: Проверки и коммит**

```bash
npm run lint && npm run typecheck && npm test
bash scripts/check-no-raw-hex.sh $(git diff --name-only HEAD | grep -E '\.tsx?$')
git add components/nd
git commit -m "feat: экран сборки ленты времени в админке

E2E: не нужен на этом шаге — добавляется в задаче 3.
Wiki: нужна — правка идёт в задаче 3 этого плана."
```

---

### Task 3: E2E и документация

**Files:**
- Create: `e2e/timeline-contents.spec.ts`
- Modify: `docs/features/timeline.md`, `docs/wiki/Timelines.md`

- [ ] **Шаг 1: Прочитать `docs/features/testing.md`**

Обязательно перед написанием спека.

- [ ] **Шаг 2: Сквозной сценарий**

Главный тест этапа — полный цикл, ради которого всё делалось:

1. админ создаёт ленту с адресом;
2. включает в неё событие;
3. публикует ленту;
4. **неавторизованный** открывает `/timeline/<адрес>` и видит это событие;
5. `page.reload()` — событие на месте (проверка, что состояние действительно записалось, а не живёт в памяти страницы);
6. админ исключает событие — на публичной странице его больше нет.

Дополнительно:

- занятый адрес показывает понятную ошибку, а не падение;
- удаление ленты не удаляет само событие: оно остаётся в списке справочника;
- две эпохи с пересечением в два года не встают на одну дорожку — показывается название мешающей.

Данные — фикстурой с уборкой в teardown, только в Neon-ветку `e2e`.

- [ ] **Шаг 3: Прогон**

```bash
npm run test:e2e:focused -- e2e/timeline-contents.spec.ts
```

- [ ] **Шаг 4: Документация**

`docs/features/timeline.md` — этап 5 выполнен, маршруты состава, правило дорожек.
`docs/wiki/Timelines.md` — переписать «Как редактировать»: теперь на сайте
делается всё, локальное приложение больше не нужно. Явно сказать, что удаление
ленты не трогает события и эпохи.

- [ ] **Шаг 5: Проверки, коммит, PR**

```bash
npm run lint && npm run typecheck && npm test
git add -A
git commit -m "feat: сборка лент времени в админке

E2E: добавлены — сквозной цикл создания ленты с проверкой после перезагрузки.
Wiki: обновлена — состав лент больше не собирается в локальном приложении."
git push -u origin feat/timeline-contents
gh pr create --fill
gh pr merge --auto --squash --delete-branch
gh pr view --json mergeStateStatus,mergeable
```

---

## Self-Review

**Покрытие спецификации.** Этап 5 требует: добавление и удаление событий и эпох,
локальная заметка, цвет эпохи, видимость, создание ленты с адресом и публикацией.
Всё распределено по трём задачам. Публикация уже сделана на этапе 4, здесь
добавляются только название, адрес и описание.

После этого этапа утверждение спецификации «локальное приложение больше не
нужно» становится верным.

**Сокращение против исходника.** `TimelineContentsPage` там 1009 строк, здесь
ожидается заметно меньше: создание событий и эпох «на лету» не переносится —
справочники ведутся отдельной вкладкой с этапа 4, и дублировать формы незачем.

**Заглушки.** Шаги задач 2 и 3 задают требования и источники, а не готовый код.
Все неочевидные решения заданы явно: чем проверять занятость дорожки и почему
именно ей, порядок сортировки, идемпотентность `PUT`, что показывать при
удалении ленты, обязательность `page.reload()`.

**Согласованность типов.** `assertEpochLaneFree`, `timelineInputSchema`,
`eventMembershipSchema`, `epochMembershipSchema` объявлены в Task 1 и
используются в маршрутах там же и в формах Task 2. `TimelineValidationError`
переиспользуется из `lib/timeline/admin.ts` (этап 4), новый класс не заводится.
