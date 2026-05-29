# Group Matching Mode

Matching — координационное пространство, в котором участники книжного клуба совместно выбирают читательские группы из трёх человек в реальном времени.

Страница: `/matching`

## Как это работает

1. Администратор создаёт **matching-сессию** (имя, опциональный дедлайн, размер группы).
2. Авторизованные участники **присоединяются** и получают стабильный животный псевдоним на всю сессию.
3. Каждый участник **формирует личный список** книг (из каталога) и расставляет приоритеты (drag-and-drop).
4. Страница показывает **«Сценарии групп»** — движок вычисляет оптимальные группы из поступивших записей.
5. Секция **«Мои ходы»** показывает книги, которые станут полными группами, если участник к ним запишется.
6. Администратор **фиксирует сессию** — захватывает текущий лидер-сценарий, денормализует метрики, UI переходит в read-only.
7. Изменения передаются через **SSE**; при потере связи — polling-фолбэк каждые 3 секунды.

## БД-схема

### `matching_sessions`
| Поле | Тип | Описание |
| --- | --- | --- |
| `id` | text PK | UUID |
| `name` | text | Название сессии |
| `status` | text | `active` / `frozen` |
| `target_group_size` | integer | Целевой размер группы |
| `deadline_at` | timestamp? | Опциональный дедлайн |
| `frozen_at` | timestamp? | Когда была заморожена |
| `frozen_scenario_json` | jsonb? | Лидер-сценарий на момент заморозки |
| `metric_groups_count` | integer? | Кол-во групп (при заморозке) |
| `metric_coverage` | integer? | Охват участников (%) |
| `metric_time_to_freeze_seconds` | integer? | Время от создания до заморозки |
| `metric_top3_hit_rate` | real? | Доля участников, чья топ-3 книга попала в группу |

**Partial unique index**: только одна `active` сессия одновременно.

### `matching_session_participants`
| Поле | Тип | Описание |
| --- | --- | --- |
| `session_id` | text FK → matching_sessions | |
| `user_id` | text FK → user | |
| `pseudonym` | text | Животный псевдоним (стабильный в рамках сессии) |
| `joined_at` | timestamp | |

PK: `(session_id, user_id)`.

### `admin_views`
Аудит-лог просмотров участников администратором через `?as=` режим.

| Поле | Тип | Описание |
| --- | --- | --- |
| `id` | text PK | UUID |
| `admin_id` | text FK → user | Кто смотрел |
| `viewed_user_id` | text FK → user | Кого смотрели |
| `session_id` | text FK → matching_sessions? | В рамках какой сессии |
| `ts` | timestamp | Время просмотра |

## API-эндпоинты

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/matching/sessions` | Список всех сессий (только admin) |
| POST | `/api/matching/sessions` | Создать сессию (только admin) |
| POST | `/api/matching/sessions/:id/join` | Присоединиться к сессии (участник получает псевдоним) |
| POST | `/api/matching/sessions/:id/freeze` | Заморозить сессию (только admin) |
| POST | `/api/matching/sessions/:id/heartbeat` | Обновить presence (участники; для admin — no-op) |
| GET | `/api/matching/sessions/:id/audit-log` | Журнал admin_views для сессии (только admin) |
| GET | `/api/matching/stream?session=<id>` | SSE-канал с событиями сессии |
| GET | `/api/matching/state?session=<id>&as=<userId>` | Текущее состояние (personalBooks, myMoves, scenarios) |
| POST | `/api/matching/books` | Добавить книгу в личный список |
| DELETE | `/api/matching/books/:bookId` | Удалить книгу из личного списка |
| PATCH | `/api/matching/priorities` | Обновить порядок книг |
| PATCH | `/api/signup-books/:bookId/status` | Обновить personal_status книги (`reading` / `read` / `null`) |

## Realtime-архитектура

- **SSE-хаб** (`lib/matching/realtime/hub.ts`): in-memory, per-session, до 50 подписчиков. Monotonic `event_id`. Heartbeat `: ping` каждые 25 секунд.
- **Presence** (`lib/matching/realtime/presence.ts`): in-memory, время последнего `heartbeat`. Пользователь считается online, если heartbeat был ≤55 секунд назад. Sweep каждые 10 секунд.
- **Feed** (`lib/matching/realtime/feed.ts`): ring-buffer на 100 событий; классифицирует мутации (`book_added_new_group`, `book_removed_group_disappeared` и др.).
- **Polling-фолбэк**: `MatchingRealtimeClient` переключается на polling `/api/matching/state` каждые 3 секунды, если SSE падает 3 раза и backoff ≥ 30 секунд.

## Personal status (личный статус книги)

Каждый участник может отметить книгу из своего списка:

| Статус | Значение | Поведение |
| --- | --- | --- |
| `null` | «В списке» | Активный кандидат для матчинга |
| `reading` | «Читаю сейчас» | Исключён из матчинга для новых групп |
| `read` | «Прочитал(а)» | Исключён из матчинга для новых групп |

Хранится в `signup_books.personal_status`. Изменяется через дропдаун в левой панели «Мой список». Книги с установленным статусом отображаются в отдельной секции «В процессе / Прочитано» под ранжируемым списком.

В чипах других участников (видны на каждой книге) статус тоже отображается: «читаю» / «прочитал(а)» / «хочу читать» / «без ранга».

## Сценарий engine

`lib/matching/scenarios.ts` — pure function, без side-effects. Алгоритм:
1. Принимает только активные записи (`personal_status IS NULL`) — фильтрация происходит в `page.tsx` до вызова функции.
2. Исключает книги без записей участников текущей сессии.
3. Для малых входных данных (≤ 30 кандидатов, ≤ 5 в группе) — полный перебор оптимального состава группы.
4. Жадный выбор непересекающихся групп из оставшихся кандидатов.
5. Tier: `leader` = топ-1, `max-coverage` = такой же `wantsCount` как лидер, `sub-max` = остальные.
6. Сортировка: `wantsCount DESC → avgRank ASC → worstRank ASC → unrankedCount ASC`.

## Admin-режим `?as=`

Администратор может просматривать данные любого участника:

```
/matching?as=<userId>
```

- Показывает личный список и «Мои ходы» участника.
- Жёлтый баннер «Просмотр за [псевдоним] (только чтение)».
- Мутации заблокированы (middleware возвращает 403 при попытке POST/PATCH/DELETE с `?as=`).
- Каждый успешный просмотр записывается в `admin_views`.
- Таблица просмотров видна в Админ-панели → Матчинг → «Журнал просмотров».

## Заморозка сессии

Действие: Админ-панель → Матчинг → «Зафиксировать».

При заморозке:
- `status` → `frozen`, `frozen_at` = now.
- `frozen_scenario_json` = текущий лидер-сценарий.
- Денормализуются метрики: `metric_groups_count`, `metric_coverage`, `metric_time_to_freeze_seconds`, `metric_top3_hit_rate`.
- SSE-событие `session_frozen` отправляется всем клиентам.
- UI на `/matching` переходит в read-only (drag-and-drop, кнопки добавления/удаления книг заблокированы).

## Ключевые файлы

| Файл | Назначение |
| --- | --- |
| `app/matching/page.tsx` | Главная страница матчинга (server component) |
| `lib/matching/personal-list.ts` | Личный список книг участника с рангами |
| `lib/matching/scenarios.ts` | Сценарий engine (pure function) |
| `lib/matching/my-moves.ts` | «Мои ходы» — книги, которых не хватает одного участника |
| `lib/matching/middleware.ts` | Shared guards: auth, `?as=`, session freeze check, audit log |
| `lib/matching/realtime/hub.ts` | In-memory SSE broadcast hub |
| `lib/matching/realtime/presence.ts` | In-memory presence tracker |
| `lib/matching/realtime/feed.ts` | Ring-buffer feed с классификацией событий |
| `components/nd/MatchingPersonalList.tsx` | Drag-and-drop список книг участника |
| `components/nd/MatchingScenarios.tsx` | Карточки сценариев с цветовым кодированием |
| `components/nd/MatchingMyMoves.tsx` | Секция «Мои ходы» |
| `components/nd/MatchingRankNudge.tsx` | Баннер-нападка для участников без рангов |
| `components/nd/MatchingRealtimeClient.tsx` | SSE-клиент с polling-фолбэком и heartbeat |
| `components/nd/MatchingRealtimeWrapper.tsx` | Server → Client bridge для router.refresh() |
| `components/nd/AdminMatchingSession.tsx` | Admin UI: создание/заморозка сессии, журнал просмотров |
| `app/api/matching/` | Все API-эндпоинты матчинга |
| `drizzle/0028_matching_tables.sql` | Миграция: matching_sessions, participants, admin_views |
| `drizzle/0029_matching_signup_books.sql` | Миграция: добавление matching FK в signup_books |
| `drizzle/0030_matching_freeze_metrics.sql` | Миграция: метрики заморозки |
| `drizzle/0031_signup_books_personal_status.sql` | Миграция: personal_status на signup_books |
| `app/api/signup-books/[bookId]/status/route.ts` | PATCH: обновить personal_status |
