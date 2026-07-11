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
- `VERCEL_TOKEN` — виджет деплоев в админке
- `NEON_API_KEY` — виджет расхода Neon (CU-часы/spend) в подвале админки. Ключ `napi_…` из Neon Console → Account settings → API keys. Читается сервером в `lib/neon-usage.ts` (Consumption API), клиенту не отдаётся.
- `NEON_SPEND_LIMIT_USD` — порог для прогресс-бара расхода Neon (по умолчанию 10). Ставь равным своему spend-лимиту в Neon.
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
