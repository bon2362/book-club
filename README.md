# Долгое наступление — сайт книжного клуба

Веб-приложение для книжного клуба: участники видят список книг, записываются на совместное чтение и оставляют контакты.

**Live:** https://book-club-slow-rising.vercel.app

## Стек

- **Next.js 14** (App Router)
- **NextAuth v5** — Google OAuth + email magic link
- **Neon Postgres** + **Drizzle ORM** — хранение сессий и пользователей
- **Google Sheets** — каталог книг (редактируется без деплоя)
- **Resend** — отправка email
- **Vercel** — хостинг

## Возможности

- Просмотр каталога книг
- Запись на совместное чтение
- Вход через Google или email (magic link, без пароля)
- Профиль участника: имя + Telegram
- Тёмная/светлая тема
- Панель администратора

## Локальный запуск

```bash
npm install
cp .env.example .env.local
# заполните .env.local реальными значениями (см. docs/setup.md)
npm run dev
```

Открыть: http://localhost:3000

## Настройка внешних сервисов

Подробная инструкция — [docs/setup.md](docs/setup.md)

Нужно настроить:
- Google Cloud: сервисный аккаунт для Sheets + OAuth credentials
- Neon: создать базу, получить `DATABASE_URL`
- Resend: API key для отправки email
- `.env.local` по шаблону `.env.example`

## Тесты

```bash
npm test
```
