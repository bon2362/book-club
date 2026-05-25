# Долгое наступление — сайт книжного клуба

Веб-приложение для книжного клуба: участники видят каталог книг, предлагают новые тексты, записываются на совместное чтение и оставляют контакты.

[![codecov](https://codecov.io/gh/bon2362/book-club/branch/main/graph/badge.svg)](https://codecov.io/gh/bon2362/book-club)

**Live:** https://www.slowreading.club

## Стек

- **Next.js 14** (App Router)
- **NextAuth v5** — Google OAuth, Google One Tap, email magic link, Telegram pre-auth
- **Neon Postgres** + **Drizzle ORM** — пользователи, каталог книг, заявки, приоритеты, уведомления
- **Resend** — отправка email
- **Vercel** — хостинг

## Возможности

- Просмотр каталога книг с обложками, тегами, поиском и переключением вида
- Запись на совместное чтение
- Расстановка приоритетов книг (drag-and-drop)
- Вход через Google, Google One Tap, email magic link или Telegram
- Профиль участника: имя, контакты, языки чтения
- Предложение книг на модерацию
- Панель администратора: каталог, заявки, пользователи, фидбек, статусы и описания тегов

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
- Google Cloud: OAuth credentials
- Neon: создать базу, получить `DATABASE_URL`
- Resend: API key для отправки email
- Telegram bot: токен и домен виджета
- `.env.local` по шаблону `.env.example`

## Тесты

```bash
# Unit-тесты
npm test

# E2E-тесты (Playwright, поднимает dev-сервер автоматически)
npm run test:e2e
```
