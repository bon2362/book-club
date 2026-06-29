# Данные и база

База данных проекта находится в Neon Postgres. Код работает с ней через Drizzle ORM. Главный файл схемы: `lib/db/schema.ts`.

## Главная модель данных

```mermaid
erDiagram
    user ||--o{ user_identities : has
    user ||--o{ user_activity_events : produces
    user ||--o{ signup_books : signs_up
    books ||--o{ signup_books : selected
    user ||--o{ book_priorities : ranks
    books ||--o{ book_priorities : ranked
    user ||--o{ matching_session_participants : joins
    matching_sessions ||--o{ matching_session_participants : contains
    matching_sessions ||--o{ matching_circle_confirmations : confirms
    matching_sessions ||--o{ matching_locked_circles : locks
    matching_locked_circles ||--o{ matching_locked_circle_members : contains
    matching_sessions ||--o{ matching_notices : notifies
    matching_sessions ||--o{ matching_events : records
    user ||--o{ book_submissions : submits
    books ||--o{ book_submissions : may_publish_from
    user ||--o{ book_summaries : writes
    books ||--o{ book_summaries : has
    book_summaries ||--o| book_summary_revisions : has_active_edit
    book_summaries ||--o{ book_summary_helpful_reactions : receives
    user ||--o{ book_summary_helpful_reactions : may_react
    user ||--o{ feedback : may_send
    books ||--o{ notification_queue : referenced_in_payload

    user {
      text id
      text name
      text contact_email
      text contacts
      text languages
      boolean priorities_set
      boolean is_admin
      timestamp created_at
      timestamp last_activity_at
    }

    user_identities {
      text provider
      text provider_account_id
      text email
      text telegram_username
      timestamp last_seen_at
    }

    books {
      text id
      text slug
      text title
      text author
      jsonb tags
      text visibility
      text reading_status
      boolean is_new
      integer sort_order
      text source
    }

    signup_books {
      text user_id
      text book_id
      timestamp signed_at
      text personal_status
      timestamp personal_status_updated_at
    }

    book_priorities {
      text user_id
      text book_id
      integer rank
    }

    matching_sessions {
      text id
      text status
      integer min_group_size
      integer max_group_size
      timestamp deadline_at
      jsonb frozen_scenario_json
    }

    matching_session_participants {
      text session_id
      text user_id
      text public_ref
      text join_source
      timestamp joined_at
    }

    matching_circle_confirmations {
      text session_id
      text user_id
      text book_id
      text circle_key
      jsonb member_user_ids_json
    }

    matching_locked_circles {
      text id
      text session_id
      text book_id
      text circle_key
      text status
      text dissolve_reason
    }

    matching_events {
      text id
      text session_id
      text actor_user_id
      text subject_user_id
      text event_type
      text source
      text book_id
      timestamp occurred_at
    }

    user_merge_events {
      text source_user_id
      text target_user_id
      text reason
      jsonb source_snapshot
      jsonb target_snapshot
      jsonb moved_counts
    }

    book_summary_helpful_reactions {
      text id
      text summary_id
      text user_id
      text visitor_hash
      timestamp created_at
    }
```

## Основные таблицы

| Таблица | Что хранит | Почему важна |
| --- | --- | --- |
| `user` | Профиль пользователя: имя, контактный email, контакты, языки, флаг админа, активность. | Это внутренний человек в системе. |
| `user_identities` | Внешние способы входа: Google, email, Telegram. | Позволяет одному человеку иметь несколько способов входа. |
| `user_activity_events` | События активности: вход, профиль, записи, приоритеты, фидбек. | Помогает видеть, когда пользователь реально был активен. |
| `books` | Каталог книг, статусы публикации и уникальный nullable `slug` для красивых URL саммари. | Главный источник публичного каталога и стабильных книжных адресов. |
| `signup_books` | Связь пользователя с выбранными книгами. | Показывает, кто на что записался. |
| `book_priorities` | Порядок книг у пользователя. | Помогает понять, что человек хочет сильнее всего. |
| `book_submissions` | Предложенные пользователями книги. | Материал для модерации и пополнения каталога. |
| `book_summaries` | Markdown-саммари участников по прочитанным книгам. | Публичный клубный слой поверх каталога после админской модерации. |
| `book_summary_revisions` | Одна активная ревизия опубликованного саммари. | Позволяет повторно модерировать правки, не скрывая текущую публикацию. |
| `book_summary_helpful_reactions` | Одна реакция «Полезно» на саммари от аккаунта или SHA-256 гостевого браузера. | Даёт тёплый социальный сигнал без обязательной регистрации и без списка голосовавших. |
| `feedback` | Сообщения обратной связи. | Канал связи с владельцем. |
| `notification_queue` | Очередь email-уведомлений. | Позволяет отправлять digest, а не письмо на каждое действие. |
| `intro_sections` | Редактируемые блоки intro на главной. | Позволяет менять объяснение сайта из админки. |
| `telegram_preauth_tokens` | Короткоживущие токены Telegram-входа. | Нужны для безопасного Telegram redirect flow. |
| `matching_sessions` | Matching-сессии: статус, размеры групп, `state_version`, freeze snapshot. | Координирует транзакционные пересчёты. |
| `matching_session_participants` | Участники, непрозрачный public ref, presence и источник self/admin. | Сохраняет доступ и для observer после закрепления. |
| `matching_circle_confirmations` | Одно временное подтверждение книги и точного состава на пользователя. | Позволяет собрать единогласие и безопасно перенести выбор. |
| `matching_locked_circles` / `matching_locked_circle_members` | Закреплённые или распущенные круги и их состав. | Неизменяемый участниками результат; dissolve освобождает весь состав. |
| `matching_notices` | Durable-сообщения о переносе, сбросе и закреплении. | Уведомление переживает закрытую страницу. |
| `matching_events` | Смысловой журнал matching с actor/subject, before/after и снимками имён. | Источник админской аналитики изменений предпочтений. |
| `user_merge_events` | Summary-события admin merge дублей пользователей. | Даёт читаемую историю слияния поверх подробного row-level audit. |

## Как связаны пользователь и способ входа

`user.id` — внутренний стабильный идентификатор. Внешние id Google, Telegram или email хранятся отдельно в `user_identities`.

Это важно: Telegram id или Google sub не должны становиться главным id пользователя. Такой подход снижает риск дублей и упрощает будущие изменения авторизации.

Если дубль уже создан, администратор может слить source user в target user. Merge переносит `user_identities`, записи на книги, приоритеты, заявки, feedback, activity events, Telegram preauth tokens и matching-связи. `audit_log` не переписывается; summary попадает в `user_merge_events`.

## Что каскадно удаляется

При удалении пользователя каскадом удаляются связанные записи в:

- `user_identities`
- `user_activity_events`
- `signup_books`
- `book_priorities`
- `matching_session_participants`
- `matching_circle_confirmations`
- `matching_locked_circle_members`
- `matching_notices`
- `matching_events`
- `book_submissions`
- `book_summary_helpful_reactions`
- `telegram_preauth_tokens`

Фидбек остается, но `feedback.user_id` становится пустым. Это сохраняет историю сообщений без привязки к удаленному пользователю.

## Миграции

Миграции лежат в папке `drizzle`. Важные этапы:

- `0012_user_activity_events.sql` — события активности.
- `0013_user_identities.sql` — таблица внешних идентичностей.
- `0018_contact_email_nullable_user_email.sql` и `0019_drop_user_email.sql` — переход от обязательного `users.email` к `contact_email`.
- `0021_books_catalog.sql` и последующие cleanup-миграции — перенос каталога в Postgres.
- `0028_unique_contact_email.sql` — уникальность контактного email без учета регистра.
- `0028_matching_tables.sql` — таблицы `matching_sessions`, `matching_session_participants`, `admin_views`.
- `0029_matching_signup_books.sql` — FK-связь `signup_books` с matching.
- `0030_matching_freeze_metrics.sql` — колонки метрик заморозки в `matching_sessions`.
- `0043_user_merge_events.sql` — summary-таблица для admin merge дублей и audit-триггер.
- `0044_book_summaries.sql` — саммари книг от участников и audit-триггер.
- `0045_book_summary_revisions.sql` — активные ревизии опубликованных саммари и audit-триггер.
- `0046_book_slugs.sql` — nullable slug книги и уникальный индекс для красивых URL саммари.
- `0047_summary_helpful_reactions.sql` — реакции, partial unique-индексы, audit trigger и masking `visitor_hash`.
- `0048_matching_simplified.sql` — public refs, confirmations, locked circles, notices, matching events, ограничения и audit triggers нового flow.
- `0034_matching_pseudonym_reservations.sql` — временные резервы псевдонимов для welcome screen.
- `0035_matching_preference_events.sql` — персистентная аналитика изменений предпочтений в matching.
- `0036_drop_admin_views.sql` — удаление аудит-лога `admin_views` (бесполезный лог impersonation-просмотров).

## Практический вывод

Если нужно понять “почему пользователь видит вот это”, почти всегда надо смотреть связку:

`user` -> `signup_books` -> `book_priorities` -> `books`.

Если нужно понять “как пользователь вошел”, надо смотреть:

`user` -> `user_identities`.

Если нужно понять “когда он был активен”, надо смотреть:

`user.last_activity_at` и `user_activity_events`.

Если нужно понять matching, смотреть связку `matching_session_participants` → `matching_circle_confirmations` → `matching_locked_circles`, а историю решения — в `matching_events`. Legacy matching-колонки и две прежние таблицы временно остаются nullable и не используются runtime; они удаляются отдельной Phase B миграцией после production smoke-check.
