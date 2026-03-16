---
name: db-migrate
description: Сгенерировать и применить Drizzle-миграцию к Neon Postgres
disable-model-invocation: true
---

Выполни следующий флоу для применения изменений схемы Drizzle ORM:

1. Убедись что `DATABASE_URL` в `/workspace/.env.local` указывает на реальную БД (не dummy)
2. Запусти `cd /workspace && npx drizzle-kit generate` — сгенерирует SQL-миграцию
3. Запусти `npx drizzle-kit push` — применит изменения к Neon Postgres
4. Выведи результат и список изменённых таблиц

Схема находится в `lib/db/schema.ts`.
