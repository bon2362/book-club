# /matching realtime: DB-backed сигнал обновления

**Дата:** 2026-06-05
**Статус:** дизайн утверждён, готов к плану реализации

## Проблема

На `/matching` изменение состояния одним пользователем не доходит до остальных.
Пример: Шакал меняет порядок книг (книга уезжает с «очень хочу» на «хочу») — другой
участник (Бурундук) продолжает видеть старое «очень хочу».

### Корень

Доставка сигнала «обнови меня» построена на in-memory `Map` в
`lib/matching/realtime/hub.ts`. Мутация вызывает `broadcast(sessionId, 'state_changed', …)`,
SSE-подписчики получают событие и делают `router.refresh()`.

На Vercel (serverless / Fluid Compute) каждый инстанс имеет **свою** память.
Публикатор (PATCH от Шакала) и подписчик (открытый SSE Бурундука) почти всегда на
**разных** инстансах — событие теряется. Polling в текущем клиенте включается только
как fallback после 3 ошибок SSE, в норме не работает, поэтому залипание не лечится.

Это **третий** случай той же «Vercel serverless split-brain» проблемы в проекте.
Прошлые два раза решение было одинаковым — уйти с in-memory на персист в Postgres:

- #256 / d8ec9193 — `fix: persist matching feed`
- #257 / 9061afd0 — `refactor: remove in-memory matching feed buffer`
- #259 / 1c5738d7 — `replace in-memory adrift cause with persistent DB lookup` (дословно «fixing the Vercel serverless split-brain issue»)
- 7100e1f3 — Sync-кэш на `unstable_cache` с глобальной инвалидацией

Контент (ранги, feed, состояние) уже читается из БД. Недомигрированным остался только
**триггер обновления** — последний кусок на in-memory `Map`.

## Решение

Заменить in-memory broadcast на **монотонный счётчик версии на уровне сессии в Postgres**.
Клиент постоянно поллит лёгкий endpoint и при росте версии перечитывает страницу.
SSE / hub / presence / heartbeat удаляются полностью — один code path, ничего per-instance.

### Почему счётчик на уровне сессии, а не `MAX(id)` из событий

`state_changed` шлётся из 6 мест, плюс `session_frozen` из 7-го. В
`matching_preference_events` пишутся **только** изменения приоритетов/книг.
`participant_joined/left`, смена конфигурации сессии и freeze туда не попадают —
версия на основе preference-events их бы пропустила и оставила залипание.
Поэтому нужен единый счётчик, который дёргается во **всех** местах мутации.

## Компоненты

### 1. Схема БД
Добавить в `matching_sessions`:
```
state_version integer NOT NULL DEFAULT 0
```
Drizzle-миграция.

### 2. Хелпер `lib/matching/realtime/version.ts`
- `bumpSessionState(sessionId, dbClient = db)` → `UPDATE matching_sessions SET state_version = state_version + 1 WHERE id = ?`. Один write по PK.
- `getSessionState(sessionId, dbClient = db)` → `{ version: number, status: 'active' | 'frozen' }`.

### 3. Заменить broadcast → bumpSessionState (7 мест)
| Файл | Сейчас |
|---|---|
| `app/api/matching/priorities/route.ts` | `state_changed` (ranks_updated) |
| `app/api/matching/books/route.ts` | `state_changed` (book_added) |
| `app/api/matching/books/[bookId]/route.ts` | `state_changed` (book_removed) |
| `app/api/matching/sessions/[id]/route.ts` | `state_changed` (session updated) |
| `app/api/matching/sessions/[id]/join/route.ts` | `state_changed` (participant_joined) |
| `app/api/matching/sessions/[id]/leave/route.ts` | `state_changed` (participant_left) |
| `app/api/matching/sessions/[id]/freeze/route.ts` | `session_frozen` |

Плюс аудит `lib/matching/realtime/state-change.ts`
(`broadcastActiveMatchingStateChangeForParticipant`) — если есть живые вызовы,
конвертировать их на `bumpSessionState` тоже.

### 4. Endpoint `GET /api/matching/version?session=ID`
- `export const dynamic = 'force-dynamic'`.
- Auth + проверка «участник или админ» (паттерн из `app/api/matching/feed/route.ts`).
- Ответ: `{ version, status }`. Одна выборка строки по PK.

### 5. Клиент `components/nd/MatchingRealtimeClient.tsx`
Переписать на polling-only:
- `setInterval` 3с → `GET /api/matching/version`.
- Хранить последнюю версию; при изменении — звать `onStateChange()` (= `router.refresh()`).
- Индикатор `●/⟳` оставить.
- Убрать `EventSource`, heartbeat, presence-ветку, frozen-ветку (frozen теперь приедет
  через обычный рост версии → `router.refresh()` перерисует замороженное состояние).
- `MatchingRealtimeWrapper.tsx` не трогаем.

### 6. Удалить мёртвую in-memory инфру
- `lib/matching/realtime/hub.ts`
- `app/api/matching/stream/route.ts`
- `lib/matching/realtime/presence.ts`
- `app/api/matching/sessions/[id]/heartbeat/route.ts`
- соответствующие тесты (`hub.test.ts`, `presence.test.ts`, и т.п.)

presence/heartbeat в UI не отрисовываются (callback `onPresence` нигде не подключён) и
тоже split-brain. «Кто онлайн» по-настоящему — отдельная будущая задача, делать её надо
через БД, а не возвращать этот код.

## Поток данных (после изменения)

1. Шакал меняет порядок → `PATCH /priorities` пишет ранги в БД и делает `bumpSessionState`.
2. Браузер Бурундука раз в 3с дёргает `/api/matching/version`, видит, что версия выросла.
3. Клиент зовёт `router.refresh()` → server component перечитывает состояние из БД.
4. Бурундук видит «хочу» вместо «очень хочу».

Никакой памяти инстанса в критическом пути — работает на любом числе инстансов.

## Обработка ошибок

- Сетевые ошибки polling — глотаем, следующий тик повторит (как сейчас в fallback).
- Endpoint version при отсутствии сессии — 404; не участник — 403; не залогинен — 401.

## Тесты

### Unit
- `version.ts`: `bumpSessionState` инкрементит на 1; `getSessionState` возвращает версию и статус.
- `/api/matching/version`: 401 без сессии, 403 не участнику, 200 + значение участнику/админу.
- По одному ассерту на каждый из 7 мутационных роутов: после успешной мутации `state_version` вырос.

### E2E (основной регресс-сценарий со скринов)
- Два контекста: A (участник, меняет порядок) и B (другой участник/админ-просмотр).
- A перетаскивает книгу с 1-го места → B в окне polling (≤ ~4с) видит обновлённое «хочу».
- Второй контекст логинится через `/api/test/session`.

## Out of scope
- Настоящая presence-фича («кто онлайн»).
- Оптимизация частоты polling под адаптивный интервал — фиксированные 3с достаточно.
