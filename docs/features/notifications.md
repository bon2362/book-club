# Уведомления (Digest)

## Что делает
Когда пользователь записывается в список читателей книги (signup), каждому уже записавшемуся участнику этой книги ставится в очередь email-уведомление. Каждые 10 минут cron job отправляет накопившиеся уведомления пакетами. Участники получают digest-письмо со списком новых записавшихся и их контактами.

## Как работает
- **Очередь** — таблица `notification_queue` в Neon Postgres; одна строка на каждое ожидающее уведомление администратору. Поля: `userName`, `userEmail`, `contacts`, `addedBooks` (JSON), `isNew`, `createdAt`, `processingAt`, `sentAt`
- **Постановка в очередь** — при signup пользователя `POST /api/signup` вставляет строки в `notification_queue` для всех текущих участников этой книги
- **Cron trigger** — GitHub Actions `digest.yml` вызывает `GET /api/cron/digest` с заголовком `Authorization: Bearer $CRON_SECRET` каждые 10 минут
- **Обработка** — `/api/cron/digest` атомарно захватывает строки с `sentAt IS NULL` и `processingAt IS NULL`, выдерживает debounce, отправляет один digest на `ADMIN_EMAIL` через Resend и заполняет `sentAt`
- **Email** — HTML-шаблон в `lib/email-templates/`; содержит список новых участников и их контакты
- **DigestStatusWidget** — компонент только для админов, показывает размер очереди и время последней отправки

## Ключевые файлы
- `lib/db/schema.ts` — таблица `notificationQueue`
- `app/api/cron/digest/route.ts` — digest endpoint (обрабатывает очередь, отправляет письма)
- `app/api/signup/route.ts` — ставит уведомления в очередь при signup
- `lib/email-templates/` — HTML-шаблоны для Resend
- `.github/workflows/digest.yml` — cron trigger (каждые 10 минут)
- `components/nd/DigestStatusWidget.tsx` — UI статистики очереди для админов
