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
    user ||--o{ book_submissions : submits
    books ||--o{ book_submissions : may_publish_from
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
```

## Основные таблицы

| Таблица | Что хранит | Почему важна |
| --- | --- | --- |
| `user` | Профиль пользователя: имя, контактный email, контакты, языки, флаг админа, активность. | Это внутренний человек в системе. |
| `user_identities` | Внешние способы входа: Google, email, Telegram. | Позволяет одному человеку иметь несколько способов входа. |
| `user_activity_events` | События активности: вход, профиль, записи, приоритеты, фидбек. | Помогает видеть, когда пользователь реально был активен. |
| `books` | Каталог книг и статусы публикации. | Главный источник публичного каталога. |
| `signup_books` | Связь пользователя с выбранными книгами. | Показывает, кто на что записался. |
| `book_priorities` | Порядок книг у пользователя. | Помогает понять, что человек хочет сильнее всего. |
| `book_submissions` | Предложенные пользователями книги. | Материал для модерации и пополнения каталога. |
| `feedback` | Сообщения обратной связи. | Канал связи с владельцем. |
| `notification_queue` | Очередь email-уведомлений. | Позволяет отправлять digest, а не письмо на каждое действие. |
| `intro_sections` | Редактируемые блоки intro на главной. | Позволяет менять объяснение сайта из админки. |
| `telegram_preauth_tokens` | Короткоживущие токены Telegram-входа. | Нужны для безопасного Telegram redirect flow. |
| `matching_sessions` | Matching-сессии (имя, статус, дедлайн, метрики заморозки). | Координирует выбор читательских групп. |
| `matching_session_participants` | Участники каждой сессии с псевдонимами. | Псевдоним стабилен в рамках сессии, новый в каждой следующей. |
| `admin_views` | Аудит-лог: когда и кого просматривал администратор через `?as=`. | Прозрачность admin impersonation. |

## Как связаны пользователь и способ входа

`user.id` — внутренний стабильный идентификатор. Внешние id Google, Telegram или email хранятся отдельно в `user_identities`.

Это важно: Telegram id или Google sub не должны становиться главным id пользователя. Такой подход снижает риск дублей и упрощает будущие изменения авторизации.

## Что каскадно удаляется

При удалении пользователя каскадом удаляются связанные записи в:

- `user_identities`
- `user_activity_events`
- `signup_books`
- `book_priorities`
- `book_submissions`
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

## Практический вывод

Если нужно понять “почему пользователь видит вот это”, почти всегда надо смотреть связку:

`user` -> `signup_books` -> `book_priorities` -> `books`.

Если нужно понять “как пользователь вошел”, надо смотреть:

`user` -> `user_identities`.

Если нужно понять “когда он был активен”, надо смотреть:

`user.last_activity_at` и `user_activity_events`.
