# Дизайн: группировка email-уведомлений о новых записях (бэклог #74)

## Контекст

Сейчас при каждой новой записи на книгу организатору немедленно шлётся отдельный email через Resend. При всплеске активности (после анонса) это создаёт поток писем. Цель — накапливать уведомления и отправлять один дайджест после того как всплеск «остынет».

## Подход

**Очередь в Postgres + Vercel Cron с дебаунсом.**

Каждая новая запись на книгу сохраняется в таблицу-очередь `notification_queue`. Vercel Cron раз в 10 минут вызывает эндпоинт `/api/cron/digest`. Тот проверяет: есть ли необработанные строки, последняя из которых старше 30 минут. Если да — формирует дайджест, шлёт одно письмо, помечает строки как отправленные.

## БД: новая таблица

```sql
CREATE TABLE notification_queue (
  id         TEXT PRIMARY KEY,
  user_name  TEXT NOT NULL,
  user_email TEXT NOT NULL,
  contacts   TEXT NOT NULL,
  books      TEXT NOT NULL,   -- JSON-массив строк
  is_new     BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  sent_at    TIMESTAMP          -- NULL = ещё не отправлено
);
```

В `lib/db/schema.ts` добавляется экспортируемая таблица `notificationQueue`.

Миграция: `drizzle/0005_notification_queue.sql`.

## Изменения в `/api/signup`

Убирается блок `resend.emails.send(...)`. Вместо него — `INSERT` в `notification_queue`:

```
INSERT notification_queue (id, user_name, user_email, contacts, books, is_new)
VALUES (uuid, name, email, contacts, JSON(addedBooks), isNew)
```

Вставка не блокирует ответ (`.catch` для некритичных ошибок).

## Cron-эндпоинт `/api/cron/digest`

**Файл:** `app/api/cron/digest/route.ts`

**Алгоритм:**

1. Проверить `Authorization: Bearer <CRON_SECRET>` → 401 если не совпадает
2. Выбрать все строки `WHERE sent_at IS NULL`
3. Если строк нет → вернуть 200 (ничего не делать)
4. Найти `MAX(created_at)` среди необработанных строк
5. Если `MAX(created_at) > NOW() - 30 минут` → вернуть 200 (всплеск ещё не остыл)
6. Сформировать дайджест-письмо
7. Отправить через Resend
8. Обновить все обработанные строки: `sent_at = NOW()`

**Формат письма:**

- Тема: `Дайджест записей: N новых, M книг`
- Тело (text): краткая статистика + список участников с именем, контактом, email и книгами

## Vercel Cron

Новый файл `vercel.json` в корне проекта:

```json
{
  "crons": [
    { "path": "/api/cron/digest", "schedule": "*/10 * * * *" }
  ]
}
```

## Env-переменные

| Переменная    | Где добавить                     | Назначение                        |
|---------------|----------------------------------|-----------------------------------|
| `CRON_SECRET` | Vercel Dashboard + `.env.local`  | Авторизация cron-запроса          |

CI (`ci.yml`) менять не нужно — cron-эндпоинт не вызывается в тестах.

## Тесты

Файл `app/api/cron/digest/route.test.ts`:

- 401 при отсутствии или неверном `CRON_SECRET`
- 200 без отправки письма при пустой очереди
- 200 без отправки письма если последняя строка моложе 30 минут
- 200 с отправкой письма если очередь «остыла»; Resend мокается

## Затронутые файлы

| Файл | Действие |
|------|----------|
| `lib/db/schema.ts` | Добавить таблицу `notificationQueue` |
| `drizzle/0005_notification_queue.sql` | Новая миграция |
| `app/api/signup/route.ts` | Заменить `resend.emails.send` на INSERT в очередь |
| `app/api/cron/digest/route.ts` | Новый cron-эндпоинт |
| `app/api/cron/digest/route.test.ts` | Тесты эндпоинта |
| `vercel.json` | Новый файл с расписанием cron |
