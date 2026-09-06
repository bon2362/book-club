# План: персонификация и продуктовая аналитика в PostHog

Дата: 2026-09-06. Ветка: `claude/posthog-user-personalization-589049`.

## Цель

Отвечать на вопросы: кто этот человек, что он делал, до какого шага дошёл,
где прервался, были ли у него ошибки. Плюс — понимать, как люди выбирают книги.

Решения владельца проекта:
- в PostHog отправляем **имя и telegram-username**, **email не отправляем**;
- **session replay не включаем** — слишком чувствительно;
- autocapture кликов оставляем: клики по «Читать далее» и разделам «о проекте» ценны;
- первыми делаем этапы 0 и 1 (инфраструктура + авторизация и дубли аккаунтов).

## Что уже есть

| Что | Где | Комментарий |
| --- | --- | --- |
| `identify(userId)` после входа | `lib/analytics.ts`, `components/PostHogProvider.tsx` | distinct_id = UUID из `user`. Свойств персоны нет. |
| ~10 клиентских событий | `AuthModal`, `BooksPage`, `SubmitBookForm`, `ContactsForm`, `FeedbackForm` | `auth_attempt`, `book_signup`, `book_submission`… |
| Своя таблица активности | `lib/user-activity.ts`, `user_activity_events` | `user_created`, `sign_in`, `books_selected`, `priorities_updated`… В PostHog не попадает. |
| Слияние дублей аккаунтов | `lib/admin/user-merge.ts` | Инструмент есть, сигнала «здесь дубль» нет. |
| `IdentityConflictError` | `lib/user-identities.ts:304,321` | Прямой симптом дубля, никуда не логируется. |
| Удаление person при удалении аккаунта | `lib/posthog-server.ts` | Единственное серверное обращение к PostHog. |

Механика появления дублей (`lib/user-identities.ts:350`): аккаунты склеиваются по email.
Telegram email не даёт, поэтому «вошёл через Telegram, потом через Google» = второй аккаунт.

## Ограничения

- Серверных событий нет вообще — половина нужных шагов (успех входа, конфликт identity,
  расстановка приоритетов) происходит не в браузере.
- `NEXT_PUBLIC_DISABLE_ANALYTICS` глушит только клиент. Без серверного аналога
  ночные E2E зальют боевой проект PostHog и испортят воронки.
- `content/privacy.md:9` обещает, что имя в PostHog не передаётся — строку надо переписать.
- Событие «дубль аккаунта» ловит только случай «тот же браузер». Второй аккаунт с другого
  устройства так не поймать — там остаётся сверка в админке.

---

## Этап 0. Инфраструктура и приватность

1. **`posthog-node`** в зависимости.
2. **`lib/posthog-server.ts`** → `captureServerEvent(distinctId, event, properties)`:
   - токен `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, host из `NEXT_PUBLIC_POSTHOG_HOST`;
   - `flushAt: 1`, явный `flush()` — иначе на serverless события теряются при завершении функции;
   - best-effort: ошибка отправки никогда не ломает пользовательский запрос;
   - **no-op**, если `NEXTAUTH_TEST_MODE === 'true'` или `NEXT_PUBLIC_DISABLE_ANALYTICS === 'true'`,
     или токен не задан. Это защита боевого проекта PostHog от E2E.
3. **Свойства персоны ставим сервером**, в момент успешного входа: `name`, `telegram_username`,
   `providers`, `created_at`, `is_admin`. Email не отправляем.
   Клиент продолжает делать только `identify(userId)` — расширять сессию NextAuth не требуется,
   и PII не ходит через браузер.
4. **Error tracking**: `capture_exceptions` в `posthog.init`. Даёт ответ «были ли проблемы»
   без записи экрана.
5. **`content/privacy.md`**: переписать строку про «не передаются имя и email» —
   имя и публичный никнейм передаются, email не передаётся. Обновить дату изменения.
6. **`docs/wiki/Analytics-and-PostHog.md`**: новая таблица событий, серверный слой, тест-режим.

Тесты: unit на `captureServerEvent` (no-op в тест-режиме, best-effort при ошибке сети,
корректный distinct_id), unit на свойства персоны.

## Этап 1. Авторизация: где ломается и откуда дубли

### События входа

| Событие | Где | Свойства |
| --- | --- | --- |
| `auth_attempt` (есть) | клиент | + `entry_point`: header / book_signup / submit_book |
| `auth_email_link_sent` (есть) | клиент | — |
| `auth_email_link_opened` | клиент | разрыв с предыдущим = письмо в спаме или другой браузер |
| `auth_succeeded` | сервер | `provider`, `is_new_user`, `linked_by`: identity / email / new |
| `auth_failed` | сервер | `provider`, `reason` |
| `auth_abandoned` | клиент | модалку закрыли, не войдя |

Воронка: `auth_modal_opened` → `auth_attempt` → (`auth_email_link_sent` → `auth_email_link_opened`) → `auth_succeeded`.

### Дубли аккаунтов

| Событие | Где | Смысл |
| --- | --- | --- |
| `account_duplicate_suspected` | клиент | В том же браузере identify пришёл под другим UUID. Свойства: оба userId, оба провайдера. |
| `identity_conflict` | сервер | Брошен `IdentityConflictError` — попытка привязать чужую identity. |
| `accounts_merged` | сервер | Слияние в админке. Нужно, чтобы мерить масштаб проблемы. |

Механика `account_duplicate_suspected`: последний известный userId хранится в браузере;
при identify под другим id шлём событие и обновляем сохранённый id.
Хранилище — то же, что уже используется для аналитики, чтобы не плодить ключей.

Тесты: unit на детектор дублей (тот же id — молчим; другой id — одно событие; после reset
при выходе ложных срабатываний нет), unit на серверные события входа,
E2E на воронку входа с проверкой отправленных событий.

---

## Этап 2. Как люди выбирают книги (следующий PR)

Autocapture знает только текст кнопки и не знает, какую книгу развернули — поэтому поверх него
нужны явные события: `book_card_expanded`, `book_text_opened`, обогащённые `book_signup` /
`book_unsignup` (id, теги, позиция в списке, разворачивал ли карточку до этого),
`about_section_opened`, `timeline_opened`, `summary_opened`,
серверные `priorities_updated`, `calendar_slots_marked`, `circle_meeting_scheduled`.

## Этап 3. Дашборды в PostHog (без кода)

Воронка входа, воронка выбора книги, разрез по тегам, список подозрений на дубли, лента ошибок.

## Артефакты перед коммитом

- E2E: нужен — меняется auth chain и добавляется клиентская логика в модалке входа.
- Wiki: нужна — `docs/wiki/Analytics-and-PostHog.md` и `docs/wiki/Privacy-and-User-Data.md`.
- `content/privacy.md` — обязательная часть этапа 0, без неё этап нельзя мержить.
