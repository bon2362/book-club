---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: complete
completedAt: '2026-05-28'
inputDocuments:
  - docs/planning-artifacts/group-matching-mode-plan.md
---

# Group Matching Mode - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Group Matching Mode, decomposing the requirements from the feature plan into implementable stories. The feature introduces a coordination space where book club participants can collaboratively pick reading groups of three in real time, separately from the regular catalog browsing experience.

## Requirements Inventory

### Functional Requirements

FR1: Админ может создать matching-сессию с обязательным `name`, `target_group_size` (по умолчанию 3) и опциональным `deadline_at`.
FR2: Админ может вручную заморозить активную сессию через действие «Зафиксировать».
FR3: В системе может существовать только одна `active` сессия одновременно.
FR4: После заморозки сессия становится read-only навсегда; данные доступны для просмотра.
FR5: Аутентифицированный пользователь может присоединиться к active-сессии и получить случайный псевдоним из словаря.
FR6: Псевдоним стабилен в рамках сессии (выдерживает reload, logout/login, смену устройства).
FR7: Каждая новая сессия выдаёт пользователю новый случайный псевдоним.
FR8: На странице /matching пользователь видит свой ранжированный список книг.
FR9: Пользователь может добавить книгу в свой список (insert в `signup_books`).
FR10: Пользователь может удалить книгу из своего списка (удаляет и `signup_books`, и `book_priorities`).
FR11: Пользователь может изменять порядок книг через drag-and-drop.
FR12: Сервер нормализует ранги пользователя в плотную последовательность `1..N` после каждого PATCH.
FR13: Пользователь видит секцию «Сценарии групп» — отсортированные по правилам (coverage → strong interest → average rank → worst rank → unranked count).
FR14: Топ-сценарий выделяется цветом «лидер».
FR15: Сценарии с максимально достижимым покрытием выделяются вторым цветом (включая случай `N % group_size != 0`).
FR16: Сценарии с субмаксимальным покрытием отображаются нейтральным цветом.
FR17: Книги с `reading_status='reading'` видны в личном списке с пометкой «читается», но исключены из scenario engine.
FR18: Книги без сигнапов видны как добавляемые, но не входят в сценарии.
FR19: Книги без ранга у пользователя считаются «готов(а) без ранга» и могут входить в сценарии; UI показывает ненавязчивый nudge.
FR20: Пользователь видит секцию «Мои ходы» — книги, где он может завершить группу из 3.
FR21: Каждое изменение (add/remove/reorder) одного участника отражается у всех открытых клиентов без перезагрузки страницы.
FR22: Сценарии и «Мои ходы» пересчитываются на сервере и пушатся клиентам через единый канал.
FR23: Пользователь видит индикаторы присутствия (online/offline) рядом с псевдонимами других участников.
FR24: Опциональный feed событий (свёрнут по умолчанию): добавление/удаление книги, появление/исчезновение группы; копи по псевдонимам.
FR25: Клик на название книги открывает модал с детализацией (cover, author, metadata, tags, description, why_read).
FR26: Админ может открыть вид любого участника через `?as=<userId>`: личный список, ранги, сценарии, «Мои ходы» этого участника.
FR27: Админ в режиме `?as=` может управлять личным списком, статусами и приоритетами участника; не-админские мутации с `as` возвращают 403.
FR28: Админ видит на странице реальные имена участников рядом с псевдонимами (`Мария · Барсук`).
FR29: При заморозке сессия фиксирует текущий лидер-сценарий в `frozen_scenario_json`; все клиенты получают `session_frozen` и переходят в read-only UI.
FR30: На странице виден обратный отсчёт `deadline_at` (если задан), но он не вызывает auto-freeze.
FR31: Админ видит панель audit-логов (`admin_views`) для текущей сессии.
FR32: При заморозке в сессию денормализуются success-метрики: число групп, coverage, time-to-freeze, time-since-last-mutation, top-3 hit rate.

### NonFunctional Requirements

NFR1: (Realtime latency) Обновления от мутации одного клиента появляются у других открытых клиентов за < 2 секунды на p95.
NFR2: (Performance) Scenario engine p95 < 200ms server-side для N ≤ 30 и M ≤ 50; perf-тест в CI на фикстуре этого размера.
NFR3: (Scalability) До 50 одновременных SSE-соединений на сессию; выше — клиент переключается на polling.
NFR4: (Reliability) SSE auto-reconnect с экспоненциальным backoff (1s, 2s, 4s, 8s, cap 30s); polling-fallback `/api/matching/state` раз в 3 секунды.
NFR5: (Reliability) SSE heartbeat 25 секунд; обнаружение disconnect — после двух пропущенных heartbeat (≥55 секунд).
NFR6: (Concurrency) Last-write-wins по `(user_id, book_id)`; ранги нормализуются на каждом PATCH; SSE-события несут monotonic `event_id`, клиенты дедупируют по нему.
NFR7: (Security) Персональные matching-мутации с `?as=` разрешены только админу; не-админские запросы возвращают 403.
NFR8: (Security) Каждый успешный impersonated read инсёртит строку в `admin_views`.
NFR9: (Security) Запрос с `?as=<userId>` от не-админа silently downgraded к собственной идентичности (без error leakage о существовании target user).
NFR10: (Security) Любые мутации сессии отвергаются когда `status='frozen'`.
NFR11: (Data integrity) Только одна `active` сессия одновременно — обеспечено partial unique index `matching_sessions(status) WHERE status='active'`.
NFR12: (Data integrity) Pseudonym уникален в пределах сессии — `UNIQUE (session_id, pseudonym)`.
NFR13: (A11y) Drag-and-drop через `@dnd-kit` keyboard sensor: стрелки/space; screen reader announce каждого reorder.
NFR14: (Mobile) Touch sensor для drag через long-press; альтернативные «move up/down» кнопки видны на touch.
NFR15: (Privacy) Анонимность только между участниками — админ видит mapping имя↔псевдоним; этот факт раскрыт участникам в UI-ноте.
NFR16: (Data retention) `matching_sessions`, `matching_session_participants`, `admin_views` — хранятся неограниченно; feed эфемерный (in-memory ring buffer, 100 событий на сессию).
NFR17: (Compatibility) Реализация совместима с Vercel Fluid Compute (SSE max-lifetime ≤ 5 минут с client-side reconnect).

### Additional Requirements

- Drizzle-миграция: создание таблиц `matching_sessions`, `matching_session_participants`, `admin_views`.
- Partial unique index: `CREATE UNIQUE INDEX ... ON matching_sessions(status) WHERE status='active'`.
- Никаких shadow-таблиц для книг/рангов: фича работает поверх существующих `signup_books` и `book_priorities`; удаление книги в matching-mode каскадно чистит обе таблицы.
- Pure-функция scenario engine в `lib/matching/scenarios.ts`; типы вход/выход явные; perf-тест в CI.
- Pseudonym dictionary в `lib/matching/pseudonyms.ts` (200+ слов-животных, без числовых суффиксов).
- SSE endpoint `/api/matching/stream` с heartbeat 25s, max-lifetime 5min.
- Shared middleware для `/api/matching/*`: проверка роли, обработка `?as=`, проверка `status='active'` для мутаций, аудит-лог.
- Feature gate v1: NextAuth admin role check на странице `/matching` и на всех `/api/matching/*` endpoints.
- При фризе сессии в `frozen_scenario_json` сохраняется снимок лидера; снимка `signup_books`/`book_priorities` нет.

### UX Design Requirements

UX-DR1: Header страницы matching: имя сессии, обратный отсчёт `deadline_at` (если задан), кнопка feed-toggle, кнопка admin-toggle (только для админа), strip с онлайн-псевдонимами.
UX-DR2: Основная область делится на три раздела: `Мой список`, `Сценарии групп`, `Мои ходы`.
UX-DR3: `Мой список` — drag-and-drop с альтернативными кнопками `↑`/`↓` (видны на touch и доступны с клавиатуры).
UX-DR4: Карточка сценария кодируется цветом: лидер / max-achievable-coverage / sub-max. Цветовые токены — через `dark:` Tailwind-префиксы для тёмной темы.
UX-DR5: Строка книги: обложка, заголовок, автор, badge `читается` (если применимо), чипы интереса участников (псевдонимы), номер ранга, действия «Хочу читать» / «Удалить».
UX-DR6: Модал детали книги (cover, author, metadata, tags, description, why_read) открывается по клику на название; имеет `role="dialog"`, закрывается Escape.
UX-DR7: Presence-индикатор — небольшая точка или чип рядом с псевдонимом, видна когда участник онлайн (heartbeat в окне 55s).
UX-DR8: Feed свёрнут по умолчанию; при открытии располагается над `Мой список` и сжимает список ниже — без page-level vertical scroll.
UX-DR9: Nudge для участников без рангов: ненавязчивая строка «расставь ранги, чтобы улучшить выбор», без блокировки участия.
UX-DR10: UI-нота на странице о приватности — «псевдонимы анонимны для участников, но не для админа».
UX-DR11: При заморозке сессии UI всех клиентов переключается в read-only: исчезают drag-handles, кнопки «удалить» и поля действий; виден badge `Зафиксирована`.
UX-DR12: Псевдоним в admin-view отображается рядом с реальным именем (`Мария · Барсук`).
UX-DR13: Раздел `Мои ходы` — карточки книг с указанием пары участников, образующих с текущим пользователем потенциальную группу.
UX-DR14: При активном `?as=<userId>` страница помечена явным баннером «Просмотр от лица X (админ-режим)».

### FR Coverage Map

FR1  → Epic 1 (создание сессии)
FR2  → Epic 2 (freeze action)
FR3  → Epic 1 (одна active за раз)
FR4  → Epic 2 (read-only после freeze)
FR5  → Epic 1 (join → псевдоним)
FR6  → Epic 1 (стабильность псевдонима в сессии)
FR7  → Epic 1 (новый псевдоним в новой сессии)
FR8  → Epic 2 (личный список)
FR9  → Epic 2 (добавить книгу)
FR10 → Epic 2 (удалить книгу)
FR11 → Epic 2 (drag-and-drop)
FR12 → Epic 2 (нормализация рангов на PATCH)
FR13 → Epic 2 (Сценарии групп + сортировка)
FR14 → Epic 2 (лидер цветом)
FR15 → Epic 2 (max-coverage цветом)
FR16 → Epic 2 (sub-max нейтрально)
FR17 → Epic 2 (reading-книги вне сценариев)
FR18 → Epic 2 (книги без сигнапов вне сценариев)
FR19 → Epic 2 (без ранга = готов, nudge)
FR20 → Epic 2 (Мои ходы)
FR21 → Epic 3 (broadcast мутаций)
FR22 → Epic 3 (пересчёт и пуш сценариев)
FR23 → Epic 3 (presence)
FR24 → Epic 3 (feed)
FR25 → Epic 2 (модал детали книги)
FR26 → Epic 4 (?as= view)
FR27 → Epic 4 (admin facilitation при ?as=)
FR28 → Epic 1 (имя + псевдоним для админа)
FR29 → Epic 2 (capture frozen_scenario + local read-only) + Epic 3 (broadcast session_frozen)
FR30 → Epic 1 (deadline countdown)
FR31 → Epic 4 (admin audit panel)
FR32 → Epic 2 (success-метрики на freeze)

## Epic List

### Epic 1: Coordination foundation — sessions, participation, pseudonyms

Админ создаёт matching-сессию (имя, опциональный `deadline_at`, `target_group_size`). Аутентифицированные пользователи присоединяются и получают стабильный животный псевдоним на всю сессию. Страница `/matching` гейтится admin role check и отображает заголовок сессии, обратный отсчёт дедлайна (advisory) и список участников; админ видит соответствие имя↔псевдоним. Гарантируется единственность активной сессии (partial unique index).

**FRs covered:** FR1, FR3, FR5, FR6, FR7, FR28, FR30
**NFRs covered:** NFR11, NFR12, NFR15, NFR16, NFR17 (частично)

### Epic 2: Personal list, scenarios, and freeze

Участник видит свой ранжированный список книг; добавляет и удаляет книги, перетаскивает порядок (drag-and-drop с keyboard и touch альтернативами). Сервер нормализует ранги после каждого PATCH. На странице — секции `Сценарии групп` (с цветовым кодированием лидер / max-achievable-coverage / sub-max), `Мои ходы` и модал детали книги. Книги со статусом `reading` и книги без сигнапов исключены из scenario engine. Админ может зафиксировать сессию — захватывается текущий лидер в `frozen_scenario_json`, денормализуются success-метрики, локальный UI переходит в read-only.

**FRs covered:** FR2, FR4, FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR25, FR29 (capture + локальный read-only), FR32
**NFRs covered:** NFR2, NFR6 (last-write-wins + rank normalize), NFR10, NFR13, NFR14

### Epic 3: Realtime collaboration and presence

SSE-канал с heartbeat 25s, broadcast мутаций с monotonic `event_id`, presence-индикаторы в стиле Google Docs (disconnect после двух пропущенных heartbeat), опциональный feed событий с server-side dedup. Polling-фолбэк `/api/matching/state` каждые 3 секунды. `session_frozen` транслируется всем клиентам, UI переключается в read-only без перезагрузки.

**FRs covered:** FR21, FR22, FR23, FR24, FR29 (broadcast session_frozen)
**NFRs covered:** NFR1, NFR3, NFR4, NFR5, NFR6 (event_id ordering)

### Epic 4: Admin facilitation — impersonated participant view

Админ открывает страницу через `?as=<userId>` и видит то, что видит участник: его личный список, ранги, сценарии, «Мои ходы». Админ может добавлять/удалять книги, менять порядок и статусы для выбранного участника; не-админский `?as=` не дает права на мутации. Каждое успешное чтение в `?as=` логируется в `admin_views`. UI помечен баннером «Просмотр от лица X (админ-режим)». Доступна admin-панель audit-логов для текущей сессии.

**FRs covered:** FR26, FR27, FR31
**NFRs covered:** NFR7, NFR8, NFR9

## Epic 1: Coordination foundation — sessions, participation, pseudonyms

Админ создаёт matching-сессию, аутентифицированные участники присоединяются и получают стабильный животный псевдоним на сессию. Страница `/matching` гейтится admin role check; отображается заголовок сессии, обратный отсчёт дедлайна (advisory) и список участников; админ видит соответствие имя↔псевдоним. Partial unique index гарантирует, что активная сессия только одна.

### Story 1.1: Drizzle migration — matching sessions and participants

As a разработчик,
I want миграцию Drizzle, создающую `matching_sessions` и `matching_session_participants`,
So that последующие истории могли писать и читать данные сессий.

**Acceptance Criteria:**

**Given** свежая БД без таблиц matching
**When** запускается миграция
**Then** появляется таблица `matching_sessions` с полями `id, name, created_by, created_at, deadline_at NULL, status ('active'|'frozen'), target_group_size DEFAULT 3, frozen_at NULL, frozen_scenario_json NULL`
**And** появляется таблица `matching_session_participants` с PK `(session_id, user_id)`, полями `pseudonym, joined_at` и UNIQUE индексом `(session_id, pseudonym)`
**And** создан partial unique index на `matching_sessions(status) WHERE status='active'`
**And** `npm run typecheck` и `npm run lint` проходят
**And** Drizzle schema в `lib/db/schema.ts` экспортирует новые таблицы

### Story 1.2: Pseudonym dictionary and assignment utility

As a разработчик,
I want словарь животных-псевдонимов и чистую функцию `assignPseudonym(takenSet)`,
So that истории join/admin могли её использовать без дублирования логики.

**Acceptance Criteria:**

**Given** файл `lib/matching/pseudonyms.ts`
**When** загружается модуль
**Then** экспортируется массив `ANIMALS` минимум из 200 уникальных одно-слов на русском (`Барсук`, `Выдра`, `Лис`, ...)
**And** экспортируется чистая функция `assignPseudonym(takenSet: Set<string>): string`, возвращающая случайное животное не из `takenSet`
**Given** unit-тест с N=30 случайных назначений на пустом множестве
**When** функция вызывается последовательно с накапливаемым множеством
**Then** все 30 значений уникальны и взяты из `ANIMALS`
**Given** unit-тест на исчерпанный словарь
**When** `takenSet` содержит все слова
**Then** функция бросает `PseudonymExhaustedError`

### Story 1.3: Admin creates a matching session

As an админ,
I want создавать новую matching-сессию через UI с обязательным именем и опциональным дедлайном,
So that появилось координационное пространство для участников.

**Acceptance Criteria:**

**Given** админ открывает страницу управления сессиями
**When** он заполняет форму `name`, `target_group_size` (default 3), опциональный `deadline_at`, и нажимает «Создать»
**Then** POST `/api/matching/sessions` возвращает 201 с `id` новой сессии в статусе `active`
**And** запись попадает в `matching_sessions`
**Given** уже существует активная сессия
**When** админ пытается создать вторую
**Then** API возвращает 409 «активная сессия уже существует»
**And** UI показывает понятное сообщение и предлагает зафиксировать предыдущую
**Given** не-админ делает POST `/api/matching/sessions`
**When** запрос обрабатывается
**Then** API возвращает 403

### Story 1.4: Participant joins active session and receives pseudonym

As an аутентифицированный участник,
I want присоединиться к активной сессии и получить стабильный псевдоним,
So that я мог участвовать в matching, оставаясь анонимным для других участников.

**Acceptance Criteria:**

**Given** активная сессия и аутентифицированный пользователь, не присоединявшийся ранее
**When** клиент делает POST `/api/matching/sessions/:id/join`
**Then** API возвращает 200 с `pseudonym`
**And** появляется строка в `matching_session_participants(session_id, user_id, pseudonym, joined_at)`
**Given** тот же пользователь делает повторный POST `/join`
**When** запрос обрабатывается
**Then** API возвращает 200 с тем же `pseudonym` (идемпотентность)
**Given** пользователь делает logout, login и снова открывает страницу
**When** клиент запрашивает текущее состояние
**Then** псевдоним совпадает с прежним
**Given** админ создаёт новую сессию после фриза предыдущей
**When** тот же участник присоединяется к новой
**Then** ему выдаётся новый случайный псевдоним
**Given** не-аутентифицированный запрос на `/join`
**When** запрос обрабатывается
**Then** API возвращает 401

### Story 1.5: Matching page with admin-gated route, header, and participant list

As a пользователь с админ-ролью,
I want открыть `/matching` и видеть имя сессии, обратный отсчёт дедлайна и список участников,
So that на следующих этапах было куда встроить личный список, сценарии и realtime.

**Acceptance Criteria:**

**Given** не-админ открывает `/matching`
**When** запрос рендерится сервером
**Then** пользователь редиректится на `/`
**Given** активная сессия и админ открывает `/matching`
**When** страница загружается
**Then** виден заголовок сессии (`name`), отсчёт до `deadline_at` если задан
**And** виден блок «Участники» со списком: реальное имя + псевдоним рядом (`Мария · Барсук`)
**Given** активной сессии нет
**When** админ открывает `/matching`
**Then** виден пустой стейт со ссылкой «Создать сессию»
**Given** `deadline_at` истёк
**When** страница рендерится
**Then** счётчик показывает «дедлайн прошёл» нейтральным цветом, не блокирует UI
**And** UI-нота о приватности видна на странице

## Epic 2: Personal list, scenarios, and freeze

Участник видит свой ранжированный список книг; добавляет, удаляет, перетаскивает порядок (с keyboard/touch-альтернативами). Сервер нормализует ранги. Видны разделы `Сценарии групп` (с цветовым кодированием), `Мои ходы` и модал детали книги. Книги `reading` и без сигнапов исключены из scenario engine. Админ может зафиксировать сессию — захватывается лидер, денормализуются метрики, локальный UI переходит в read-only.

### Story 2.1: Render personal list with current signups and ranks

As an участник активной сессии,
I want видеть свой ранжированный список книг на странице matching,
So that я мог опираться на текущее состояние, прежде чем что-то менять.

**Acceptance Criteria:**

**Given** участник присоединён к активной сессии и имеет несколько `signup_books`, часть с `book_priorities`
**When** он открывает `/matching`
**Then** виден раздел `Мой список` со всеми книгами из его `signup_books`
**And** книги с рангом отсортированы по `rank ASC`, без ранга — внизу секцией «Без ранга»
**And** для каждой книги отображаются: обложка, заголовок, автор, номер ранга (если есть), badge `читается` если `reading_status='reading'`
**Given** у пользователя есть книга со статусом `reading`
**When** список рендерится
**Then** книга видна с badge, кнопка «Удалить» неактивна (tooltip — управление статусом из каталога)
**Given** пользователь не присоединён к сессии
**When** он открывает `/matching`
**Then** виден экран «присоединиться»

### Story 2.2: Add and remove books in matching mode

As an участник,
I want добавлять и удалять книги в matching-mode так же, как в каталоге,
So that я мог формировать список под текущую сессию без переключения вкладок.

**Acceptance Criteria:**

**Given** в каталоге есть книги, отсутствующие в `signup_books` пользователя
**When** пользователь жмёт «Хочу читать» на такой книге в matching-режиме
**Then** POST `/api/matching/books` с `bookId` возвращает 200
**And** появляется строка в `signup_books`
**And** книга появляется в `Мой список` без ранга
**Given** в `signup_books` пользователя есть книга
**When** пользователь жмёт «Удалить»
**Then** DELETE `/api/matching/books/:bookId` возвращает 200
**And** удаляются строки и из `signup_books`, и из `book_priorities` для пары `(user, book)`
**And** ранги остальных книг пользователя нормализуются в `1..N-1`
**Given** сессия `status='frozen'`
**When** пользователь жмёт «Хочу читать» или «Удалить»
**Then** API возвращает 409
**And** UI скрывает кнопки действий, показывает inline-сообщение
**Given** не-аутентифицированный запрос
**When** запрос обрабатывается
**Then** API возвращает 401

### Story 2.3: Reorder ranks via drag-and-drop with keyboard and touch alternatives

As an участник,
I want перетаскивать книги в списке мышью, клавиатурой или на тач-устройстве,
So that я мог расставлять предпочтения удобно с любого устройства и с использованием screen reader.

**Acceptance Criteria:**

**Given** в `Мой список` ≥ 2 книги
**When** пользователь перетаскивает книгу мышью на новую позицию
**Then** PATCH `/api/matching/priorities` отправляется с упорядоченным массивом `[bookId, ...]`
**And** сервер нормализует ранги пользователя в плотную последовательность `1..N`
**And** ответ возвращает канонический порядок; клиент сверяется
**Given** пользователь фокусирует строку клавиатурой, нажимает `Space`, стрелки `↑`/`↓`, `Space`
**When** действие завершается
**Then** ранг меняется идентично mouse-drop
**And** screen-reader-анонс читается («Книга X перемещена на позицию Y из N»)
**Given** тач-устройство
**When** пользователь долго касается и перетаскивает row
**Then** ранг меняется идентично
**And** альтернативные кнопки `↑`/`↓` рядом со строкой работают, видны на touch и доступны с клавиатуры
**Given** два одновременных PATCH от одного пользователя с разных вкладок
**When** оба обрабатываются
**Then** последний по `updated_at` побеждает
**And** канонический порядок возвращается обоим; первая вкладка снапится к серверу

### Story 2.4: Pure scenario engine utility with sorting and color tiers

As a разработчик,
I want чистую функцию `generateScenarios(input)` с явной типизацией и тестами,
So that UI и серверные хендлеры могли её переиспользовать без дублирования логики комбинаторики.

**Acceptance Criteria:**

**Given** модуль `lib/matching/scenarios.ts`
**When** загружается
**Then** экспортируется функция `generateScenarios({ participants, books, signups, ranks, targetGroupSize, maxResults=10 }): ScenarioCard[]`
**And** исключаются книги с `reading_status='reading'` и книги без сигнапов
**And** формируются только группы ровно из `targetGroupSize` без повторов участников между группами одного сценария
**And** сортировка: maximize covered → maximize `хочу читать` → minimize average rank → minimize worst rank → minimize unranked count
**And** каждая карточка несёт `tier: 'leader' | 'max-coverage' | 'sub-max'`, где `leader` — топ-1, `max-coverage` — все сценарии с тем же coverage что у лидера
**Given** unit-тесты в `lib/matching/__tests__/scenarios.test.ts`
**When** запускается `npm test`
**Then** тесты покрывают: размер группы строго `targetGroupSize`; нет повторов участников; reading-книги исключены; книги без сигнапов исключены; tier-классификация на `N=10, group=3`; tier-классификация на `N % group == 0`; пустые входы
**Given** perf-тест на фикстуре N=30, M=50
**When** тест запускается в CI
**Then** медианное время < 200ms, p95 < 400ms

### Story 2.5: Render scenarios section with color tiers

As an участник,
I want видеть `Сценарии групп` с цветовой подсветкой лидера и сценариев с максимальным покрытием,
So that я мог понять, какой выбор будет принят сейчас и какие альтернативы остаются.

**Acceptance Criteria:**

**Given** активная сессия с ≥ `targetGroupSize` участниками
**When** страница `/matching` рендерится сервером
**Then** виден раздел `Сценарии групп` с до 10 карточек, отсортированных по правилам из 2.4
**And** топ-карточка имеет tier `leader` и подсветку «лидер-цветом» (с `dark:` префиксом)
**And** карточки tier `max-coverage` имеют второй подсветочный цвет
**And** карточки tier `sub-max` нейтральные (бежевые)
**And** каждая карточка показывает: книгу (обложка+название), тройку участников с псевдонимами и их интерес-чипом
**Given** в сессии нет ни одной книги с достаточным числом сигнапов
**When** страница рендерится
**Then** виден empty-state
**Given** клик по названию книги в карточке
**When** обработчик срабатывает
**Then** открывается модал детали книги, `role="dialog"`, закрывается Escape

### Story 2.6: Render "Мои ходы" section

As an участник,
I want видеть секцию `Мои ходы` — книги, где я могу завершить группу из трёх,
So that я мог увидеть, какие мои действия откроют новые варианты.

**Acceptance Criteria:**

**Given** в сессии есть книги, на которые подписано `targetGroupSize - 1` участников без текущего пользователя
**When** страница рендерится
**Then** виден раздел `Мои ходы` с такими карточками
**And** карточка показывает книгу + пару существующих участников
**And** на карточке есть действие «Добавить в мой список», использующее поток 2.2
**Given** нет подходящих книг
**When** страница рендерится
**Then** виден пустой стейт
**Given** пользователь добавил книгу из секции
**When** мутация прошла
**Then** карточка исчезает из `Мои ходы`

### Story 2.7: UI nudge for participants without ranks

As an участник без ранжированных книг,
I want видеть ненавязчивую подсказку, что расстановка рангов улучшит выбор,
So that я понимал, как мой ввод влияет на сценарии, без жёсткой блокировки.

**Acceptance Criteria:**

**Given** у пользователя есть `signup_books`, но нет ни одной строки в `book_priorities`
**When** страница рендерится
**Then** виден inline-баннер «Расставь ранги, чтобы улучшить выбор сценариев» в `Мой список`
**And** баннер не блокирует действия, закрывается Escape или крестиком (persist в localStorage на сессию)
**Given** пользователь проранжировал хотя бы одну книгу
**When** страница рендерится
**Then** баннер не показывается

### Story 2.8: Admin freezes session — capture leader and lock mutations

As an админ активной сессии,
I want зафиксировать сессию одним действием, сохранив текущего лидера как финальный выбор,
So that участники видели прозрачный итог и больше никто не мог изменить состояние сессии.

**Acceptance Criteria:**

**Given** активная сессия с непустым набором сценариев
**When** админ жмёт «Зафиксировать» и подтверждает
**Then** POST `/api/matching/sessions/:id/freeze` возвращает 200
**And** в `matching_sessions` устанавливаются `status='frozen'`, `frozen_at=now()`, `frozen_scenario_json` = снимок топ-карточки
**And** денормализуются success-метрики: `metric_groups_count`, `metric_coverage`, `metric_time_to_freeze_seconds`, `metric_time_since_last_mutation_seconds`, `metric_top3_hit_rate`
**Given** сессия `status='frozen'`
**When** любой клиент пытается POST/PATCH/DELETE `/api/matching/*`
**Then** API возвращает 409
**Given** участник перезагружает страницу зафиксированной сессии
**When** страница рендерится
**Then** UI в read-only: drag-handles, кнопки «Удалить», «Хочу читать» отсутствуют
**And** виден badge `Зафиксирована` и карточка финального сценария с подсветкой «лидер-цветом»
**Given** не-админ делает POST `/freeze`
**When** запрос обрабатывается
**Then** API возвращает 403

## Epic 3: Realtime collaboration and presence

SSE-канал с heartbeat 25s, broadcast мутаций с monotonic `event_id`, presence-индикаторы в стиле Google Docs, опциональный feed событий с server-side dedup. Polling-фолбэк `/api/matching/state` каждые 3 секунды. `session_frozen` транслируется всем клиентам, UI переключается в read-only без перезагрузки.

### Story 3.1: SSE endpoint with heartbeat and per-session broadcast hub

As a разработчик,
I want серверный SSE endpoint `/api/matching/stream?session=<id>` с in-memory hub-ом подписчиков,
So that последующие истории могли пушить state/presence/feed-события всем подключённым клиентам сессии.

**Acceptance Criteria:**

**Given** активная сессия и аутентифицированный участник
**When** клиент открывает GET `/api/matching/stream?session=<id>` с `Accept: text/event-stream`
**Then** соединение остаётся открытым, отвечает SSE-заголовками
**And** каждые 25 секунд сервер шлёт heartbeat (`: ping\n\n`)
**And** соединение закрывается сервером после 5 минут — клиент должен реконнектиться сам
**Given** модуль `lib/matching/realtime/hub.ts`
**When** код мутации вызывает `hub.broadcast(sessionId, event)`
**Then** все клиенты сессии получают событие в формате `event: <type>\ndata: <json>\n\n`
**And** событие несёт монотонный `event_id` (per-session счётчик), `type`, `payload`
**Given** не-аутентифицированный или не-участник сессии запрос
**When** клиент открывает stream
**Then** API возвращает 401 / 403
**Given** 51-й одновременный subscriber на сессию
**When** клиент подключается
**Then** сервер возвращает 503
**And** клиент переходит на polling-режим (Story 3.5)

### Story 3.2: Broadcast state_changed events on every mutation

As an участник,
I want видеть изменения других участников (add/remove/reorder) без перезагрузки страницы,
So that matching-страница ощущалась как живое совместное пространство.

**Acceptance Criteria:**

**Given** endpoint `GET /api/matching/state?session=<id>` отсутствует
**When** реализуется эта story
**Then** появляется endpoint, возвращающий полный state текущего пользователя в сессии: личный список со ранжированием, `ScenarioCard[]`, `MyMoves[]`, последний `latest_event_id` (для дедупа на клиенте)
**And** endpoint доступен и в обычном, и в `?as=` режиме (middleware из 4.1 управляет identity)
**Given** активная сессия с подключёнными клиентами A и B (разные пользователи)
**When** клиент A делает POST/DELETE/PATCH на matching-эндпоинты
**Then** сервер вызывает `hub.broadcast(sessionId, { type: 'state_changed', event_id, payload: { userId, kind } })`
**And** клиент B получает событие в течение < 2 секунд на p95 (E2E с двумя контекстами)
**Given** клиент B принимает `state_changed`
**When** обработчик срабатывает
**Then** клиент перезапрашивает `GET /api/matching/state?session=<id>` и применяет ответ
**And** карточки в `Сценарии групп` / `Мои ходы` обновляются в месте
**Given** клиент получает событие с уже применённым `event_id`
**When** обработчик срабатывает
**Then** событие отбрасывается
**Given** клиент получает событие с `event_id` ниже последнего применённого
**When** обработчик срабатывает
**Then** событие отбрасывается

### Story 3.3: Server-side scenario recomputation pushed to clients

As an участник,
I want видеть пересчитанные сценарии и `Мои ходы` сразу после чужой мутации, без локального перебора,
So that 20 клиентов не пересчитывали одну и ту же комбинаторику параллельно.

**Acceptance Criteria:**

**Given** в `GET /api/matching/state` возвращается уже посчитанный набор `ScenarioCard[]` и `MyMoves[]`
**When** мутация триггерит `state_changed`, и клиент B перезапрашивает state
**Then** ответ содержит свежий пересчёт через `generateScenarios(...)`
**Given** scenario engine отрабатывает дольше 200ms для текущего размера сессии
**When** мутация отрабатывает
**Then** клиент A получает 200 до broadcast; engine считает асинхронно, после — `state_changed`
**Given** клиент в admin-`?as=` режиме
**When** мутация в сессии происходит
**Then** клиент получает `state_changed` и обновляет вид (read-only)

### Story 3.4: Presence indicators via heartbeat aggregation

As an участник,
I want видеть, кто сейчас онлайн на странице, рядом с псевдонимом,
So that я понимал, кто реально в комнате.

**Acceptance Criteria:**

**Given** клиент подключён к SSE-стриму
**When** соединение открывается и каждые 25 секунд после
**Then** клиент шлёт presence-heartbeat (через POST `/api/matching/sessions/:id/heartbeat` или встроенно в stream)
**And** сервер сохраняет `lastSeen` для `(sessionId, userId)` в in-memory store
**Given** > 55 секунд без сигнала пользователя X
**When** sweep раз в 10 секунд
**Then** X удаляется из online-set
**And** `hub.broadcast(sessionId, { type: 'presence', payload: { online: [pseudonym, ...] } })` отправляется
**Given** клиент получает `presence`
**When** обработчик срабатывает
**Then** UI обновляет индикатор online/offline рядом с псевдонимом
**And** strip онлайн-псевдонимов в header пересоставляется
**Given** админ открыл `?as=<userId>` (Epic 4)
**When** он подключён к stream-у
**Then** его heartbeat не регистрируется в presence

### Story 3.5: Polling fallback when SSE fails or unsupported

As a клиент в среде без SSE или после 503 от 3.1,
I want получать обновления через polling,
So that функциональность не ломалась при network/browser/edge-ограничениях.

**Acceptance Criteria:**

**Given** клиент пытается открыть SSE и получает ошибку (не 200, или 3 разрыва подряд с backoff > 30s)
**When** ошибочный путь срабатывает
**Then** клиент переключается на polling `GET /api/matching/state?session=<id>` каждые 3 секунды
**And** UI показывает дискретный индикатор «синхронизация по интервалу»
**Given** клиент в polling-режиме
**When** ответ содержит новый `latest_event_id`
**Then** клиент применяет новый state без дёргания UI
**Given** SSE восстановилось
**When** reconnect срабатывает
**Then** клиент переключается обратно на SSE, polling прекращается

### Story 3.6: Realtime feed with classification and dedup

As an участник,
I want опциональный feed событий, который показывает добавления/удаления книг и появление/исчезновение групп,
So that я мог следить за движением в сессии.

**Acceptance Criteria:**

**Given** клиент пушит мутацию add/remove
**When** сервер обрабатывает её
**Then** до broadcast серверный классификатор сравнивает набор сценариев до и после
**And** формируется `feed_event` с типом из набора: `book_added_new_group`, `book_added_no_change`, `book_removed_group_disappeared`, `book_removed_no_change`
**And** copy формируется по псевдониму актёра
**Given** in-memory ring buffer на сессию, размер 100
**When** новое событие добавляется
**Then** старые вытесняются по FIFO
**Given** клиент открывает feed-toggle
**When** feed раскрывается
**Then** виден список из ring buffer (последние ≤ 100)
**And** feed над `Мой список`, сжимает список ниже без появления page-level vertical scroll
**Given** новый клиент присоединяется к сессии
**When** он подписывается на stream
**Then** сервер посылает начальный snapshot `feed_snapshot`, дальше — incremental `feed_event`

### Story 3.7: Broadcast session_frozen to all clients

As an участник зафиксированной сессии,
I want получить переход в read-only немедленно, без перезагрузки,
So that я не пытался зря кликнуть на действие.

**Acceptance Criteria:**

**Given** активная сессия с подключёнными клиентами
**When** админ выполняет freeze (Story 2.8)
**Then** сервер вызывает `hub.broadcast(sessionId, { type: 'session_frozen', payload: { frozen_at, frozen_scenario } })`
**And** все клиенты получают событие в течение < 2 секунд на p95
**Given** клиент получает `session_frozen`
**When** обработчик срабатывает
**Then** UI переходит в read-only без F5: исчезают drag-handles, кнопки «Удалить», «Хочу читать»
**And** виден badge `Зафиксирована` и финальный сценарий с подсветкой «лидер-цветом»
**And** SSE-соединения остаются открытыми

## Epic 4: Admin facilitation — impersonated participant view

Админ открывает `/matching?as=<userId>` и видит то, что видит участник: личный список, ранги, сценарии, `Мои ходы`. Админ может управлять личным списком, статусами и приоритетами участника; не-админский `?as=` не дает права на мутации. Каждое успешное чтение логируется в `admin_views`. UI помечен баннером «Просмотр от лица X (админ-режим)». Доступна admin-панель audit-логов для текущей сессии.

### Story 4.1: Shared middleware — role check and `?as=` handling

As a разработчик,
I want единый middleware для всех `/api/matching/*` маршрутов, обрабатывающий роль и `?as=`,
So that security-инвариант не зависел от дисциплины каждого хендлера.

**Acceptance Criteria:**

**Given** модуль `lib/matching/middleware.ts` экспортирует `withMatchingGuards(handler, { mutates })`
**When** все хендлеры в `app/api/matching/**/route.ts` обёрнуты
**Then** до тела хендлера выполняется проверка: аутентификация (иначе 401), активная сессия для мутирующих (409, если `status='frozen'`)
**Given** в запросе `?as=<userId>` и текущий пользователь — admin
**When** запрос обрабатывается
**Then** middleware ставит в context `actorUserId=caller.id`, `viewedUserId=as`, `isImpersonating=true`
**And** если `mutates: true` — запрос продолжает выполнение как мутация выбранного участника
**Given** в запросе `?as=<userId>` и текущий пользователь — не админ
**When** запрос обрабатывается
**Then** middleware silently игнорирует `as`: запрос идёт как от вызывающего
**And** ответ не отличает «target существует» и «target не существует»
**Given** unit-тесты на middleware
**When** запускается `npm test`
**Then** покрыты: не-аутентифицированный → 401; админ с `?as=` на мутирующем → pass-through; не-админ с `?as=` → silent downgrade/read or 403/mutation; нет активной сессии на мутирующем → 409; frozen на мутирующем → 409

### Story 4.2: Admin view of arbitrary participant via `?as=`

As an админ активной сессии,
I want открыть `/matching?as=<userId>` и увидеть всё, что видит этот участник,
So that я мог отслеживать прогресс каждого без необходимости их просить поделиться экраном.

**Acceptance Criteria:**

**Given** админ открывает `/matching?as=<participantUserId>` для участника активной сессии
**When** страница рендерится
**Then** все секции (`Мой список`, `Сценарии групп`, `Мои ходы`, nudge) рендерятся с данными `participantUserId`
**And** псевдонимы и интерес-чипы участников показываются по правилам участника
**Given** админ в `?as=` режиме
**When** страница рендерится
**Then** виден явный баннер вверху «Просмотр от лица *Мария · Барсук* (админ-режим)» с действием «Выйти из режима просмотра»
**And** drag-handles, кнопки «Удалить», «Хочу читать», поля действий доступны для админа
**Given** не-админ открывает `/matching?as=<otherUserId>`
**When** страница рендерится
**Then** `?as=` silently игнорируется, пользователь видит свой собственный вид
**Given** админ открывает `?as=<userId>`, где userId не существует или не присоединён к сессии
**When** страница рендерится
**Then** виден empty-state «участник не найден в сессии»
**Given** активной сессии нет
**When** админ открывает `/matching?as=<...>`
**Then** виден обычный empty-state «Создать сессию»

### Story 4.3: Audit log — record every successful impersonated read

As an админ,
I want видеть журнал, какие участники когда были открыты в `?as=`-режиме,
So that была независимая запись того, кого и когда я смотрел.

**Acceptance Criteria:**

**Given** в рамках этой story создаётся отдельная Drizzle-миграция, добавляющая таблицу `admin_views` (`id`, `admin_id → users.id`, `viewed_user_id → users.id`, `session_id → matching_sessions.id NULL`, `ts default now()`)
**When** миграция применяется
**Then** `npm run typecheck` и `npm run lint` проходят
**And** Drizzle schema в `lib/db/schema.ts` экспортирует таблицу
**Given** middleware из 4.1 пропускает успешный read с `?as=`
**Then** в `admin_views` инсёртится `(admin_id, viewed_user_id, session_id, ts=now())`
**And** инсёрт делается асинхронно, не блокирует latency
**Given** middleware silently downgrade-ит не-админский `?as=`
**When** запрос обрабатывается
**Then** в `admin_views` ничего не пишется
**Given** middleware блокирует мутацию (403)
**When** запрос обрабатывается
**Then** в `admin_views` ничего не пишется
**Given** мутация без `?as=`
**When** middleware пропускает её
**Then** в `admin_views` ничего не пишется

### Story 4.4: Admin audit panel for current session

As an админ,
I want открыть на странице matching admin-панель с журналом моих просмотров текущей сессии,
So that я мог пересмотреть, кого открывал и в какой последовательности.

**Acceptance Criteria:**

**Given** админ открывает `/matching` без `?as=`
**When** страница рендерится
**Then** виден admin-toggle, открывающий sidebar «Журнал просмотров»
**Given** sidebar открыт
**When** он рендерится
**Then** показываются строки `admin_views` для текущей `session_id`, отсортированные по `ts DESC`
**And** каждая строка: имя+псевдоним просмотренного, относительное время, действие «Открыть снова» (ведёт на `?as=<userId>`)
**Given** в `admin_views` для сессии нет записей
**When** sidebar открыт
**Then** виден empty-state
**Given** не-админ открывает страницу
**When** страница рендерится
**Then** admin-toggle отсутствует; любой потенциальный запрос данных журнала → 403
**Given** сессия `status='frozen'`
**When** админ открывает панель
**Then** журнал доступен (read-only)

### Story 4.5: Admin-`?as=` SSE silent subscription

As a разработчик,
I want чтобы SSE-подписка под `?as=<userId>` не считалась online-присутствием просматриваемого участника,
So that админ-наблюдение оставалось незаметным для участников.

**Acceptance Criteria:**

**Given** админ открыл `/matching?as=<userId>`
**When** клиент подключается к `/api/matching/stream?session=<id>` с `as` в session-контексте middleware
**Then** middleware из 4.1 распознаёт impersonation; сервер подписывает соединение на broadcast, но НЕ регистрирует heartbeat в presence-store
**And** в `presence`-событиях `online` не включает админа и не «оживляет» просматриваемого участника, если тот сам оффлайн
**Given** админ в обычном режиме без `?as=`
**When** подключается к stream-у
**Then** его heartbeat регистрируется в presence как обычно
