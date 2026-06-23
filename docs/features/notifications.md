# Уведомления (Digest)

## Что делает
Когда пользователь записывается в список читателей книги (signup), каждому уже записавшемуся участнику этой книги ставится в очередь email-уведомление. Раз в сутки cron job отправляет накопившиеся уведомления пакетами. Участники получают digest-письмо со списком новых записавшихся и их контактами.

## Как работает
- **Очередь** — таблица `notification_queue` в Neon Postgres; одна строка на каждое ожидающее уведомление администратору. Поля: `userName`, `userEmail`, `contacts`, `addedBooks` (JSON), `isNew`, `createdAt`, `processingAt`, `sentAt`
- **Постановка в очередь** — при signup пользователя `POST /api/signup` вставляет строки в `notification_queue` для всех текущих участников этой книги
- **Cron trigger** — GitHub Actions `digest.yml` вызывает `GET /api/cron/digest` с заголовком `Authorization: Bearer $CRON_SECRET` раз в сутки в **03:00 UTC**. Время намеренно совмещено с Vercel-кроном `telegram-preauth-cleanup` (тоже `0 3 * * *`): оба бьют в production-ветку Neon, поэтому compute просыпается один раз и обслуживает оба джоба. ⚠️ **Не учащать без нужды:** прежний `*/10` будил Neon-compute ~50% суток вхолостую (каждый вызов делает write даже на пустой очереди) и выжигал ~90 CU-час/мес — это вызвало паузу БД на Free-плане (июнь 2026). Сам digest всё равно дебаунсит отправку (cooling 30 мин / forced-flush 2 ч), так что частить смысла нет.
- **Обработка** — `/api/cron/digest` атомарно захватывает строки с `sentAt IS NULL` и `processingAt IS NULL`, выдерживает debounce, отправляет один digest на `ADMIN_EMAIL` через Resend и заполняет `sentAt`
- **Email** — HTML-шаблон в `lib/email-templates/`; содержит список новых участников и их контакты
- **DigestStatusWidget** — компонент только для админов, показывает размер очереди и время последней отправки

## Ключевые файлы
- `lib/db/schema.ts` — таблица `notificationQueue`
- `app/api/cron/digest/route.ts` — digest endpoint (обрабатывает очередь, отправляет письма)
- `app/api/signup/route.ts` — ставит уведомления в очередь при signup
- `lib/email-templates/` — HTML-шаблоны для Resend
- `.github/workflows/digest.yml` — cron trigger (раз в сутки, 03:00 UTC, совмещён с telegram-preauth-cleanup)
- `components/nd/DigestStatusWidget.tsx` — UI статистики очереди для админов
