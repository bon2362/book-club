# Инфраструктура

## Валидация env-переменных

Файл `env.ts` в корне проекта — схема всех переменных окружения через `@t3-oss/env-nextjs` + zod.

При отсутствии обязательной переменной сервер падает на старте с понятным сообщением:
```
❌ Invalid environment variables: DATABASE_URL
```

### Обязательные серверные переменные
- `DATABASE_URL` — Neon Postgres
- `NEXTAUTH_SECRET` — NextAuth
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth
- `TELEGRAM_BOT_TOKEN` — Telegram Login Widget
- `ADMIN_EMAIL` — email администратора

### Опциональные серверные переменные
- `RESEND_API_KEY` — отправка email (уведомления)
- `CRON_SECRET` — защита cron-эндпоинтов
- `GH_TOKEN` — виджет CI в админке
- `GOOGLE_SERVICE_ACCOUNT_KEY` / `GOOGLE_SHEETS_ID` — больше не нужны для runtime (каталог теперь в БД); требуются только для исторического `scripts/books-catalog-audit.ts`
- `VERCEL_TOKEN` — виджет деплоев в админке
- `NEXTAUTH_TEST_MODE` — E2E-тесты

### Клиентские переменные
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — Google One Tap
- `NEXT_PUBLIC_TELEGRAM_BOT_NAME` — Telegram Login Widget

### Как использовать
Импортировать `env` вместо `process.env` в серверном коде:
```ts
import { env } from '@/env'
const db = neon(env.DATABASE_URL)
```

Валидация запускается при первом импорте `env.ts` — через `lib/db/index.ts`, который загружается на каждом серверном запросе.
