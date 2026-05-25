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

## Что не делать без отдельного плана

- Не менять структуру `user.id` и identity без миграционного плана.
- Не возвращать Google Sheets как runtime-источник каталога.
- Не удалять поля из схемы без поиска всех использований.
- Не менять auth callback URL без проверки Google, Telegram и Vercel domains.
- Не отключать e2e для “быстрого деплоя” без понимания риска.
