# Операционные сценарии

Эта страница отвечает на вопрос: что проверять, когда что-то пошло не так.

## Сайт не открывается

Проверьте по порядку:

1. [www.slowreading.club](https://www.slowreading.club)
2. [book-club-slow-rising.vercel.app](https://book-club-slow-rising.vercel.app)
3. Vercel dashboard по project id `prj_ZwWgPCcLf8RyrxeMJDI5zCX08dEp`
4. GitHub Actions для последнего commit
5. Домен и DNS в Namecheap/Vercel

## После деплоя видна старая версия

Проверьте:

- commit SHA в footer админки;
- последний deployment в Vercel;
- прошел ли GitHub Actions CI;
- привязан ли production domain к последнему deploy.

## Пользователь не может войти

| Способ входа | Что проверить |
| --- | --- |
| Google OAuth | Google credentials, callback URL, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. |
| Google One Tap | `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, браузерные third-party ограничения. |
| Email magic link | `RESEND_API_KEY`, домен Resend, spam. |
| Telegram | BotFather domain, bot photo, `TELEGRAM_BOT_TOKEN`, `/api/auth/telegram/callback`. |

## Не приходят письма

Проверьте:

- `RESEND_API_KEY`;
- Resend domain status;
- `ADMIN_EMAIL`;
- `notification_queue`;
- GitHub Actions `Notification Digest`;
- `CRON_SECRET`.

## Админка не открывается

Проверьте:

- пользователь вошел;
- в таблице `user` у него `is_admin=true`;
- `ADMIN_EMAIL` соответствует нужному email;
- session обновилась после изменения прав.

## Книга не видна на главной

Проверьте:

- `books.visibility='published'`;
- книга не скрыта фильтрами;
- `sort_order`;
- нет ли test-prefix в production;
- обложка доступна по URL.

## E2E упали

Проверьте:

- [Allure report](https://bon2362.github.io/book-club/);
- GitHub Actions logs;
- Playwright trace;
- не изменился ли auth/test endpoint;
- не перехватывает ли ContactsForm клики в тесте.

## Swagger не открывается

Проверьте:

- `/api-docs`;
- `/openapi.json`;
- не заблокирован ли CDN `unpkg.com`, откуда Swagger UI грузит assets;
- актуален ли `public/openapi.json`.

## PostHog widget пустой

Проверьте:

- `POSTHOG_PERSONAL_API_KEY`;
- `POSTHOG_PROJECT_ID`;
- `NEXT_PUBLIC_POSTHOG_HOST`;
- права API key.

## После деплоя «Обязательные ранги книг» — обязательный ручной шаг

Миграции `drizzle/0051_book_priorities_rank_source.sql` и `drizzle/0052_backfill_book_ranks.sql` не применяются автоматически деплоем Vercel/CI — их нужно прогнать на production-БД вручную, **строго в этом порядке** (0052 читает колонку, которую добавляет 0051):

1. `0051_book_priorities_rank_source.sql` — добавляет `book_priorities.rank_source` (default `'auto'`).
2. `0052_backfill_book_ranks.sql` — помечает все существующие ранги `manual`, дописывает `auto`-ранги в конец для записей на книги без строки в `book_priorities` (по `signed_at`).

Разовая операция: после успешного прогона на проде повторять не нужно — дальше инвариант «каждая не отложенная запись на книгу имеет ранг» поддерживается кодом на лету (choke-points описаны в `docs/features/matching.md`). Если пропустить этот шаг после деплоя, старые пользователи без явной сортировки будут видеть отсутствующие ранги до следующего собственного действия (подписка/смена статуса), пока бэкфилл не прогнан.

## После деплоя книжного режима Matching

До включения вкладки на живой сессии вручную примените `drizzle/0053_matching_books.sql` к production Neon и убедитесь, что появились четыре таблицы, audit triggers и DB guards. Скрипт `scripts/apply-migration.mjs` выполняет все statements в одной транзакции; Vercel-деплой сам миграцию не выполняет. В Neon-ветке `e2e` миграция тоже должна быть применена один раз вручную, поскольку `drizzle-kit push` не создаёт audit/guard triggers; после этого nightly workflow поддерживает Drizzle-схему шагом `drizzle-kit push --force`.

Безопасная проверка после миграции:

1. открыть админскую matching-сессию и включить книжный режим;
2. проверить, что вкладки «Книги»/«Сценарии» появились, а сценарии read-only;
3. двумя тестовыми участниками поставить твёрдый выбор, третьим — условный, убедиться в формировании круга;
4. закрыть и снова открыть сессию, убедиться, что состав сохранился;
5. проверить `matching_events` и глобальный audit log.

Инициализация режима необратима для этой сессии. Если после неё обнаружена проблема, не пытайтесь чистить новые таблицы или возвращать legacy writes: закройте сессию через административную панель, исправьте код форвардом и затем откройте снова. Ручная корректировка состава остаётся доступна.

## Прод лежит, срочный фикс минуя CI

В нормальном цикле любой коммит в `main` идёт через PR и ждёт зелёного CI (~5 минут). Когда прод реально лежит и пять минут — много, можно временно снять branch protection, push'нуть прямо, **вернуть защиту**:

```bash
# 1. Снять защиту (мгновенно)
gh api repos/bon2362/book-club/branches/main/protection -X DELETE

# 2. Сделать прямой push
git push origin main

# 3. ВЕРНУТЬ защиту обратно — это критично, иначе следующий
#    случайный коммит уйдёт без проверок и без CI gate
gh api repos/bon2362/book-club/branches/main/protection -X PUT --input - <<'JSON'
{
  "required_status_checks": {"strict": false, "checks": [{"context": "ci"}]},
  "enforce_admins": true,
  "required_pull_request_reviews": {"required_approving_review_count": 0, "dismiss_stale_reviews": false, "require_code_owner_reviews": false},
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": false,
  "required_linear_history": false
}
JSON
```

Шаг 3 обязателен. Поставьте напоминание сразу после шага 1.

**Не использовать** для удобства разработки — только когда нет другого выхода. Каждый emergency push минует все проверки: ESLint, secretlint, typecheck, unit-тесты, e2e, build. Это и есть его суть, но и его риск.

## Что не делать без отдельного плана

- Не менять структуру `user.id` и identity без миграционного плана.
- Не возвращать Google Sheets как runtime-источник каталога.
- Не удалять поля из схемы без поиска всех использований.
- Не менять auth callback URL без проверки Google, Telegram и Vercel domains.
- Не отключать e2e для “быстрого деплоя” без понимания риска.
