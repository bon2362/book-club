# Book Club Project

## Проект
"Долгое наступление" — сайт книжного клуба.
- **Live:** https://www.slowreading.club (резерв: https://book-club-slow-rising.vercel.app)
- **Стек:** Next.js 14, NextAuth v5, Neon Postgres + Drizzle ORM, Google Sheets, Resend, Vercel
- **Repo:** github.com/bon2362/book-club

## Деплой
- **Стандартный процесс: `git commit` + `git push` → Vercel автоматически деплоит и обновляет алиас** ✓
- Vercel project живёт в team `bon2362-5067s-projects`, `projectId: "prj_ZwWgPCcLf8RyrxeMJDI5zCX08dEp"`
- `book-club-slow-rising.vercel.app` добавлен как домен проекта в настройках Vercel — обновляется автоматически
- auto-alias — `book-club-lilac.vercel.app`
- При проблемах с деплоем сразу проверять статус через Vercel API

## Devcontainer: firewall и ограничения
- Firewall настроен в `.devcontainer/init-firewall.sh` — блокирует всё кроме allowlist
- Разрешены: GitHub, npmjs.org, api.anthropic.com, googleapis.com, slowreading.club, book-club-slow-rising.vercel.app, vercel.com, api.vercel.com
- Чтобы добавить новый сервис: отредактировать `init-firewall.sh`, затем Rebuild Container (Ctrl+Shift+P)
- Exit code 7 от curl = заблокировано firewall (не сетевая ошибка)
- После ребилда контейнера: Vercel-токен в auth.json сбрасывается, использовать `--token` флаг
- Firewall резолвит IP доменов при старте — Vercel CDN может отдавать с других IP (curl на vercel.app может не работать из контейнера)
- `GH_TOKEN` берётся из `/workspace/.env.local` — если `gh` не работает: `export GH_TOKEN=$(grep GH_TOKEN /workspace/.env.local | cut -d= -f2)`

## Правила работы с кодом
- Перед удалением/переименованием поля из интерфейса/типа — сначала искать все его вхождения в проекте (Grep), чтобы не пропустить дублирующие интерфейсы в других файлах

## Unit-тесты (Jest)
- Компоненты с `useRouter` требуют мока: `jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))`
- Тесты на порядок книг: `fetchBooksWithCovers` делает `.reverse()` — `result[0]` это последняя книга из sheets, не первая

## E2E-тесты (Playwright)
- **Dev server запускать только через Playwright** (`npm run playwright test`), не вручную — иначе `NEXTAUTH_TEST_MODE=true` не будет выставлен и `/api/test/session` вернёт 403
- `reuseExistingServer: true` в playwright.config.ts — если сервер уже запущен, Playwright его переиспользует (без нужных env vars)
- **`waitForLoadState('networkidle')`** — надёжный способ дождаться React-гидрации в Next.js перед взаимодействием с client-side компонентами
- **ContactsForm** автоматически открывается для залогиненных пользователей без профиля (`isLoggedIn && !currentUser && !savedUser`) — нужно закрывать в тестах перед кликами
- Все модальные компоненты должны иметь `role="dialog"` и обработчик Escape — иначе тесты не смогут их найти и закрыть
- `session.user.id` нужно явно устанавливать в `session` callback (`session.user.id = token.sub`) — без этого API-эндпоинты с `auth()` вернут 401

## Архитектура обложек
- Обложки берутся напрямую из **колонки L Google Sheets** (`coverUrl` = `row[11]`)
- `lib/covers.ts` удалён (был Google Books API + DB cache — убран из-за 429 rate limits)
- `lib/books-with-covers.ts` — просто маппит данные из sheets, без фетча
- `lib/sheets.ts` — читает `coverUrl` из колонки L таблицы
- `CoverImage.tsx` — client component, fallback на инициалы автора при `coverUrl=null`
- `BookCard.tsx` — кнопка «Читать далее» / «Свернуть» для описаний > 120 символов
- Чтобы обложки появились — нужно заполнить колонку L в Google Sheets вручную

## Ключевые файлы
- `lib/books-with-covers.ts` — pass-through из sheets
- `lib/sheets.ts` — Google Sheets (каталог книг + coverUrl из колонки L)
- `components/nd/CoverImage.tsx` — client component, onError fallback
- `components/nd/BookCard.tsx` — expand/collapse описания
- `app/new-design/page.tsx` — страница
- `lib/db/schema.ts` — таблица book_covers (больше не используется для обложек)
