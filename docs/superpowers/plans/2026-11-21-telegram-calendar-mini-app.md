# Telegram Calendar Mini App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать участнику круга возможность согласовывать время встречи в Telegram, используя существующие данные и правила календаря сайта.

**Architecture:** Mini App — отдельный компактный клиент `app/tg/calendar/[slug]`, а не копия календарной модели. Он передаёт подписанные Telegram `initData` на Telegram-адаптер календарных операций; тот проверяет подпись, находит связанного пользователя и вызывает общие доменные сервисы календаря. Второй релиз добавляет привязку Telegram-чата к кругу и сообщения бота, не меняя модель доступности.

**Tech Stack:** Next.js 14 App Router, TypeScript, Drizzle/Neon Postgres, NextAuth v5, Telegram Bot API, Telegram Web Apps JavaScript API, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-telegram-calendar-mini-app-design.md`

## Global Constraints

- Основной календарь сайта остаётся рабочим; Telegram использует те же `user_availability`, `circle_schedules`, `circle_meetings`.
- Не принимать Telegram ID или `initData` без серверной HMAC-проверки и срока действия.
- `slug` в прямой ссылке не является авторизацией: проверять участие в круге на каждом чтении и изменении.
- Любая новая мутабельная таблица добавляется в `AUDITED_TABLES`, получает trigger миграцией, а все записи идут через `withAuditContext`.
- Mini App должен работать на ширине 320 px; CSS-поведение получает focused Playwright layout-тест.
- Для всех новых persistent UI-флоу E2E-тест перезагружает страницу и проверяет сохранение.
- Пилот использует отдельные тестовые bot/chat/Neon credentials; реальные чаты и production bot не меняются.

## Review Focus

- Подпись корректна, но `auth_date` старше установленного TTL: Task 1, unit test `rejects stale init data`.
- Telegram ID подписан, но не связан с пользователем клуба: Task 2, API test `returns identity_not_linked without creating user`.
- Участник передал slug чужого круга: Task 2, API test `returns not_a_member for a valid Telegram identity`.
- Два участника одновременно подтверждают найденный слот: Task 2, integration test использует существующую блокировку `circle_schedules` и ожидает один `circle_meetings` row.
- Отметка времени сделана в Telegram и Mini App перезапущен: Task 3, E2E делает reload и проверяет тот же marked interval.

---

## Planned file structure

| File | Responsibility |
|---|---|
| `lib/telegram-miniapp-auth.ts` | Проверка `initData` Mini App и извлечение Telegram пользователя. |
| `lib/calendar/calendar-actor.ts` | Единый actor календаря для NextAuth-session и Mini App identity. |
| `lib/calendar/calendar-service.ts` | Общие read/write операции, вызываемые и сайтом, и Telegram API. |
| `app/api/tg/calendar/[slug]/route.ts` | Прочитать состояние календаря с Mini App actor. |
| `app/api/tg/calendar/availability/route.ts` | Сохранить интервалы текущего Mini App actor. |
| `app/api/tg/calendar/[slug]/meetings/route.ts` | Назначить встречу с существующей проверкой кандидата. |
| `app/tg/calendar/[slug]/page.tsx` | Экран, загружаемый Telegram Mini App. |
| `components/nd/TelegramCalendarClient.tsx` | Компактная мобильная сетка и запросы с `initData`. |
| `lib/telegram-bot.ts` | Расширяется только во втором релизе: ссылка, команда привязки чата, напоминания. |
| `drizzle/0066_telegram_circle_chats.sql` | Второй релиз: связь календаря и Telegram-чата + audit trigger. |
| `docs/features/calendar.md`, `docs/features/auth.md`, `docs/wiki/*` | Техническая и владелецкая документация изменений. |

### Task 1: Проверка подписи Telegram Mini App

**Files:**
- Create: `lib/telegram-miniapp-auth.ts`
- Test: `lib/telegram-miniapp-auth.test.ts`
- Modify: `.env.example` (добавить только имя и описание тестовых переменных, без значений)

**Interfaces:**
- Produces: `verifyTelegramMiniAppInitData(raw: string, now?: Date): Promise<VerifiedTelegramMiniAppData>`.
- Produces: `VerifiedTelegramMiniAppData = { telegramUserId: string; username: string | null; authDate: Date }`.
- Produces: `TelegramMiniAppAuthError` с кодами `missing`, `malformed`, `expired`, `invalid_signature`.

- [ ] Написать Jest-тесты для валидной подписи, отсутствующего `hash`, изменённого `user`, устаревшего `auth_date` и будущей даты.
- [ ] Запустить `npm test -- --runInBand lib/telegram-miniapp-auth.test.ts`; ожидается падение, пока модуль отсутствует.
- [ ] Реализовать `verifyTelegramMiniAppInitData`: исключить `hash`, сортировать пары `key=value`, получить ключ через `HMAC_SHA256('WebAppData', TELEGRAM_BOT_TOKEN)`, сравнить HMAC constant-time и ограничить срок 5 минут.
- [ ] Добавить именованные переменные тестового контура: `TELEGRAM_TEST_BOT_NAME`, `TELEGRAM_TEST_CHAT_ID`, `TELEGRAM_MINI_APP_URL`; production-secret не дублировать.
- [ ] Повторить целевой Jest-тест; ожидается PASS.
- [ ] Commit: `feat(telegram): validate mini app init data`.

### Task 2: Общий actor и Telegram API календаря

**Files:**
- Create: `lib/calendar/calendar-actor.ts`
- Create: `lib/calendar/calendar-service.ts`
- Create: `app/api/tg/calendar/[slug]/route.ts`
- Create: `app/api/tg/calendar/availability/route.ts`
- Create: `app/api/tg/calendar/[slug]/meetings/route.ts`
- Test: `app/api/tg/calendar/[slug]/route.test.ts`
- Test: `app/api/tg/calendar/availability/route.test.ts`
- Test: `app/api/tg/calendar/[slug]/meetings/route.test.ts`
- Modify: `app/api/calendar/[slug]/route.ts`, `app/api/calendar/availability/route.ts`, `app/api/calendar/[slug]/meetings/route.ts`

**Interfaces:**
- Consumes: `verifyTelegramMiniAppInitData(raw)` from Task 1 and `Authorization: tma <raw>`.
- Produces: `resolveTelegramCalendarActor(req: NextRequest): Promise<CalendarActor>`.
- Produces: `CalendarActor = { userId: string; name: string | null; isAdmin: boolean; source: 'calendar' | 'telegram-miniapp' }`.
- Produces: the same JSON status/body contracts as existing website calendar routes, with additional `401 invalid_telegram_init_data` and `403 telegram_identity_not_linked`.

- [ ] Написать route-тест: валидный `initData` связанного участника читает только свой круг и сохраняет выровненный 30-минутный интервал.
- [ ] Написать route-тесты отказов: неподписанные данные → 401; несвязанный Telegram ID → 403 без новой строки `users`; член другого круга → 403; невалидный интервал → существующий 400.
- [ ] Запустить три новых route-теста; ожидается падение, пока endpoints отсутствуют.
- [ ] Вынести общие чтение состояния, сохранение availability и транзакционное назначение встречи из website handlers в `calendar-service.ts`; сохранить существующие HTTP-контракты website routes.
- [ ] Реализовать `resolveTelegramCalendarActor`: проверить `initData`, найти `user_identities.provider='telegram'` по `provider_account_id`, не вызывать `resolveOrCreateUserFromIdentity`.
- [ ] Все записи availability/meeting выполнять с `withAuditContext({ source: 'telegram-miniapp', actorUserId })`; добавить новый допустимый source в типы и документацию аудита, если он закрыт union-типом.
- [ ] Написать integration test конкурентного назначения через Telegram API: два actor-а отправляют один кандидат, ответ `201` получает только один.
- [ ] Запустить целевые route + calendar unit/integration tests; ожидается PASS.
- [ ] Commit: `feat(calendar): expose authenticated telegram mini app API`.

### Task 3: Встроенный интерфейс Mini App

**Files:**
- Create: `app/tg/calendar/[slug]/page.tsx`
- Create: `components/nd/TelegramCalendarClient.tsx`
- Create: `components/nd/TelegramCalendarClient.test.tsx`
- Create: `e2e/telegram-calendar.spec.ts`
- Create: `e2e/telegram-calendar-layout.spec.ts`
- Modify: `app/globals.css` (только при нехватке существующих семантических токенов)

**Interfaces:**
- Consumes: Telegram global `window.Telegram.WebApp.initData` and Task 2 endpoints.
- Produces: Mini App requests `GET /api/tg/calendar/:slug`, `PUT /api/tg/calendar/availability`, `POST /api/tg/calendar/:slug/meetings` with `Authorization: tma <initData>`.

- [ ] Прочитать `docs/features/testing.md`, затем написать component-тесты для loading/error состояний, отсутствующих `initData`, отметки и снятия целого блока длительности.
- [ ] Написать failing E2E: Playwright подставляет подписанный тестовый `initData`, участник отмечает слот, `page.reload()` сохраняет отметку; второй тестовый identity создаёт кандидат.
- [ ] Реализовать минимальный `TelegramCalendarClient`: вызвать `ready()`, при поддержке запросить fullscreen, применить Telegram theme variables как значения существующих семантических токенов, отправлять `initData` только в Authorization header.
- [ ] Реализовать узкую сетку: 7 дней за экран, переключатель страниц, часовой пояс, собственные отметки и read-only список общих кандидатов. Не переносить admin `?as=` и редактирование duration/slug.
- [ ] Добавить `boundingBox()` E2E: при ширине 320–393 px нет горизонтальной прокрутки, тап-цель клетки не меньше 44 px и подписи не перекрываются.
- [ ] Запустить `npm run test:e2e:focused -- e2e/telegram-calendar.spec.ts e2e/telegram-calendar-layout.spec.ts` с изолированной базой и затем Jest компонентов; ожидается PASS.
- [ ] Commit: `feat(telegram): add embedded circle calendar`.

### Task 4: Закрытый ручной пилот

**Files:**
- Modify: `docs/features/testing.md`
- Modify: `docs/features/calendar.md`
- Modify: `docs/wiki/Hosting-Deployment-and-Domains.md`
- Modify: `docs/wiki/Authentication-and-Accounts.md`

**Interfaces:**
- Consumes: `TELEGRAM_TEST_BOT_NAME`, `TELEGRAM_TEST_CHAT_ID`, `TELEGRAM_MINI_APP_URL` from Task 1.
- Produces: пошаговая операция для владельца: test bot → closed group → linked accounts → Vercel Preview → manual acceptance script.

- [ ] Написать ручной acceptance checklist: один linked user открывает Mini App, отмечает слот, закрывает/открывает экран; два test identity получают общий слот; website calendar видит те же данные; неподписанный запрос отклонён.
- [ ] Документировать настройку BotFather для test bot и HTTPS Preview URL без передачи токена в репозиторий, а также rollback: отключить ссылку/переменную Mini App без удаления данных календаря.
- [ ] Запустить focused E2E из Task 3 на свежем worktree с `.env.local` и `.env.test.local`, затем удалить симлинки перед Jest.
- [ ] Commit: `docs(telegram): document isolated calendar pilot`.

### Task 5: Сообщения в Telegram-группе и напоминания — после пилота

**Files:**
- Create: `drizzle/0066_telegram_circle_chats.sql`
- Modify: `lib/db/schema.ts`
- Modify: `lib/audit/audited-tables.ts`
- Modify: `lib/telegram-bot.ts`
- Modify: `app/api/telegram/webhook/route.ts`
- Create: `app/api/cron/telegram-calendar-reminders/route.ts`
- Create: tests for the route, bot client, migration/audit registry and cron.
- Modify: `docs/features/calendar.md`, `docs/features/auth.md`, relevant `docs/wiki/*`.

**Interfaces:**
- Produces table `telegram_circle_chats(schedule_id, chat_id, message_thread_id, invitation_message_id, created_by, created_at)` with unique `schedule_id`.
- Produces group command `/calendar <slug>`; only a globally site-admin Telegram identity can bind a chat to an existing circle.
- Produces `postCalendarInvitation(scheduleId)` and `sendCalendarReminders(now)`.

- [ ] Написать migration/audit-test: таблица есть в `AUDITED_TABLES`, migration содержит `audit_capture()` trigger, sensitive values отсутствуют.
- [ ] Написать webhook-тесты: команду в group может выполнить только site admin; несуществующий slug, чужой круг и повторная привязка возвращают безопасное сообщение без изменения связи.
- [ ] Создать migration, добавить Drizzle schema и обернуть bind/unbind в `withAuditContext({ source: 'telegram-calendar' })`.
- [ ] Расширить bot client: отправлять URL-кнопку в группу, редактировать invitation message с числом отметившихся/кандидатами и отправлять дедуплицированные reminders только после явной настройки графика.
- [ ] Добавить cron с защищённым существующим cron-secret pattern, idempotency key и тестом timezone/DST границы; не отправлять личные интервалы в групповой чат.
- [ ] Запустить focused webhook/cron/migration tests и `npm run test:integration:matching`; ожидается PASS.
- [ ] Commit: `feat(telegram): coordinate circle calendars in group chats`.

### Task 6: Финальный gate и rollout

**Files:**
- Modify: `docs/features/calendar.md`, `docs/wiki/*` only if acceptance findings change operation.

- [ ] Проверить checklist Tasks 1–5 и выполнить ручной acceptance script с test bot и двумя разными Telegram accounts.
- [ ] Проверить E2E: нужен — persistent Mini App flow, подтверждён reload и 320px layout.
- [ ] Проверить Wiki: нужна — изменены auth, Calendar API, Telegram integration and operational setup.
- [ ] Запустить один раз после последнего изменения: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, focused Mini App E2E and integration matching.
- [ ] Создать PR, включить auto-merge, проверить `mergeStateStatus`; при `BEHIND` обновить ветку и повторить CI.
- [ ] После merge применить новую миграцию только для Task 5 по существующей production procedure; до этого включать только Tasks 1–4.

## Self-review

- Spec coverage: Mini App, безопасная авторизация, существующий источник данных, изолированный пилот, групповые сообщения и напоминания покрыты Tasks 1–5; rollout — Task 6.
- Deliberate scope split: автоматизация группового чата идёт после подтверждения удобства Mini App, поэтому пилот остаётся проверяемым и обратимым.
- Existing API compatibility: Task 2 требует вынести операции в service layer, не менять контракт website routes.
- Security: HMAC algorithm Mini App, expiry, identity mapping and membership checks имеют отдельные tests.
- Data/audit: возможная новая таблица появляется только во втором релизе и прямо покрыта миграцией, audit trigger и registry-test.

