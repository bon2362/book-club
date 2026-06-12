# Авторизация и пользователи

Авторизация построена на NextAuth v5. Пользователь может войти несколькими способами, а система приводит их к одному внутреннему пользователю.

## Способы входа

| Способ | Где используется | Что важно |
| --- | --- | --- |
| Google OAuth | Кнопка входа | Стандартный redirect-flow Google. |
| Google One Tap | Главная страница | Быстрый вход через всплывающий Google prompt. |
| Email magic link | Модал входа | Ссылка приходит через Resend на email. |
| Telegram Login Widget | Модал входа | Использует redirect через `/api/auth/telegram/callback`, не JS callback. |

Для удобства входа сайт помнит только последний способ входа в `localStorage` браузера. Это не серверное состояние и не пользовательский профиль, а лишь подсказка для модалки: если последний способ был Google или email, вторичные способы раскрываются сразу, а в Telegram/Google/email блоках показывается бейдж «последний способ входа». В памяти хранится только нормализованный provider (`google`, `telegram` или `email`), без имени, email, Telegram username или user id.

## Привязка нескольких способов входа

На вкладке «Профиль» пользователь видит привязанные способы входа и может добавить Google или Telegram к текущему профилю. Это главный способ предотвратить новые дубли: человек сначала входит привычным способом, затем явно подтверждает второй provider.

Что важно:

- Google привязывается только после серверной проверки Google credential.
- Telegram привязывается отдельным callback-режимом Telegram Widget, требует активную сессию сайта и короткоживущий signed state, выданный именно для текущего профиля.
- Если выбранный Google или Telegram уже принадлежит другому профилю, сайт не объединяет пользователей автоматически.
- Автоматического объединения по имени, Telegram username или похожему email нет: это опасно для приватности и может склеить разных людей.

## Общий поток входа

```mermaid
flowchart TD
    Start["Пользователь выбирает способ входа"] --> Provider{"Провайдер"}
    Provider --> Google["Google OAuth / One Tap"]
    Provider --> Email["Email magic link"]
    Provider --> Telegram["Telegram Login Widget"]
    Google --> Identity["resolveOrCreateUserFromIdentity"]
    Email --> Identity
    Telegram --> Callback["Telegram callback проверяет HMAC"]
    Callback --> Preauth["Pre-auth token"]
    Preauth --> Identity
    Identity --> User["user + user_identities"]
    User --> Session["JWT session"]
    Session --> Site["Сайт и админка"]
```

## Почему есть `user_identities`

Раньше внешний идентификатор мог смешиваться с внутренним пользователем. Сейчас модель разделена:

- `user` — человек внутри сайта.
- `user_identities` — способы, которыми этот человек входит.

Пример:

- один пользователь может войти через Google;
- потом через email;
- потом через Telegram;
- система должна понимать, что это один человек, если identity связаны корректно.

## Администратор

Админский доступ определяется флагом `isAdmin` в таблице `user` и попадает в `session.user.isAdmin`.

При первом входе пользователя с email из `ADMIN_EMAIL` система может выставить ему admin-флаг, если в базе еще нет администратора.

## Telegram: важные уроки

Telegram Login Widget должен использовать `data-auth-url`, а не `data-onauth`. Callback-режим через JavaScript ненадежен из-за браузерных ограничений.

Поток Telegram:

```mermaid
sequenceDiagram
    participant U as Пользователь
    participant T as Telegram Widget
    participant C as /api/auth/telegram/callback
    participant DB as Neon Postgres
    participant P as /auth/telegram
    participant N as NextAuth

    U->>T: Нажимает Telegram login
    T->>C: Redirect с Telegram payload
    C->>C: Проверяет HMAC
    C->>DB: Находит или создает user + identity
    C->>DB: Создает preauth token
    C->>P: Redirect с token, ts
    P->>N: signIn('telegram-preauth')
    N->>DB: Поглощает token, получает userId и создает session
```

В redirect URL намеренно нет внутреннего `user.id` и Telegram `username`: одноразовый token связывается с пользователем в таблице `telegram_preauth_tokens`, а `telegram-preauth` provider получает `userId` только после успешного consume. PostHog pageview дополнительно вычищает чувствительные query-параметры (`token`, `uid`, `ts`, `username`, `email`) перед отправкой.

## Пользовательский профиль

Профиль хранит:

- имя;
- контактный email;
- контакт для связи, например Telegram;
- языки чтения;
- флаг, расставлены ли приоритеты;
- последнюю активность.

Технический Telegram username из `user_identities` не равен пользовательскому контакту. Пользователь может изменить отображаемый контакт в профиле.

## Где смотреть проблемы

| Симптом | Что проверить |
| --- | --- |
| Пользователь не входит | Provider credentials, NextAuth secret, callback URL, cookies. |
| Telegram не работает | BotFather domain, фото бота, `TELEGRAM_BOT_TOKEN`, HMAC callback. |
| Google One Tap не появляется | `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, Google OAuth настройки, браузерные ограничения. |
| Пользователь видит дубль профиля | Попросить войти в основной профиль и привязать второй способ входа; если identity уже занята другим user, нужен админский merge. |
| Админ не видит `/admin` | `user.is_admin`, `ADMIN_EMAIL`, session callback. |
| Профиль открывается пустым | `user.name`, `user.contacts`, `contact_email`, session refresh. |
