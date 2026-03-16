---
project_name: 'book-club'
user_name: 'Evgenii'
date: '2026-03-14'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow', 'critical_rules']
status: 'complete'
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **Next.js** 14.2.35 (App Router)
- **React** 18.x
- **TypeScript** 5.x — strict mode включён (`"strict": true` в tsconfig)
- **NextAuth** v5.0.0-beta.30 — BETA версия, API отличается от v4
- **@auth/drizzle-adapter** 1.11.1
- **Drizzle ORM** 0.45.1 + **drizzle-kit** 0.31.9
- **@neondatabase/serverless** 1.0.2 (Neon Postgres)
- **googleapis** 171.4.0 (Google Sheets)
- **Resend** 6.9.2 (email)
- **Fuse.js** 7.1.0 (fuzzy search)
- **TailwindCSS** 3.4.1
- **transliteration** 2.6.1
- **Jest** 29 + **jest-environment-jsdom** 29 + **ts-jest** 29.4.6
- **@testing-library/react** 16.3.2
- **Playwright** 1.58.2 (e2e)
- Path alias: `@/*` → корень проекта

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- **strict mode** обязателен — нет `any` без явного обоснования
- **moduleResolution: bundler** — не использовать расширения `.js` в импортах
- **Path alias `@/`** — всегда использовать для импортов внутри проекта
  (например: `import { db } from '@/lib/db'`, не `../../lib/db`)
- **esModuleInterop: true** — можно использовать default imports для CJS модулей
- **isolatedModules: true** — каждый файл должен быть самостоятельным модулем,
  не использовать `const enum`
- Нет явного `export default` в серверных модулях `lib/` — только named exports
- Типы для `session.user` расширены через module augmentation в `lib/auth.ts`
  (поля `isAdmin`, `telegramUsername`)

### Framework-Specific Rules (Next.js 14 App Router)

- **App Router** — все страницы в `app/`, нет `pages/`
- **Server Components по умолчанию** — `'use client'` только там, где нужна
  интерактивность (хуки, браузерные API, обработчики событий)
- **API Routes** — структура `app/api/[route]/route.ts`, экспорт именованных
  функций `GET`, `POST`, `DELETE` и т.д.
- **`auth()`** из `@/lib/auth` — для проверки сессии на сервере (не `getSession`)
- **Admin-проверка** — через `session.user.isAdmin` (устанавливается в JWT callback
  на основе `ADMIN_EMAIL` env), не хранить роли в БД
- **next.config.mjs** — изображения `unoptimized: true`, любой домен разрешён
  (wildcard `**`) — не менять без необходимости
- **`BUILD_TIME`** доступен как `process.env.BUILD_TIME` — инжектируется в build time
- **Layout** — единый root layout в `app/layout.tsx`
- **Компоненты nd/** — компоненты нового дизайна хранятся в `components/nd/`

### Testing Rules

- **Unit-тесты** — Jest + jsdom, файлы рядом с исходником: `foo.test.ts` / `foo.test.tsx`
- **E2E-тесты** — Playwright, все файлы в `/e2e/*.spec.ts`
- **`NEXTAUTH_TEST_MODE=true`** — отключает проверку сессии в auth callbacks
  и возвращает тестовые данные из Google Sheets (`TEST_BOOKS`); обязателен для unit-тестов
- **Моки модулей** — через `jest.mock('@/lib/...')` в начале файла
- **`clearMocks: true`** в jest.config — моки сбрасываются автоматически между тестами,
  не нужно вызывать `mockReset()` вручную
- **`@/` alias** работает в Jest через `moduleNameMapper` в `jest.config.ts`
- **transliteration** требует специального маппинга в Jest
  (`node_modules/transliteration/dist/node/src/node/index.js`) — не менять
- **E2E** используют `NEXTAUTH_TEST_MODE=true` через `.env.test` или переменную окружения
- **`testPathIgnorePatterns`** исключает `/e2e/` из Jest — E2E запускаются только через Playwright

### Code Quality & Style Rules

- **ESLint** — `next/core-web-vitals` + `next/typescript`, без дополнительных плагинов
- **Нет Prettier** — форматирование не автоматизировано, следовать стилю окружающего кода
- **Именование файлов:**
  - React-компоненты: `PascalCase.tsx` (например `BookCard.tsx`, `CoverImage.tsx`)
  - Утилиты и хелперы: `kebab-case.ts` (например `books-with-covers.ts`, `sheets.ts`)
  - API routes: директории `kebab-case`, файл всегда `route.ts`
  - Тесты: `[имя-файла].test.ts(x)` рядом с исходником
- **Именование переменных/функций:** camelCase, компоненты — PascalCase
- **Нет комментариев** к очевидному коду; комментарии только для неочевидной логики
- **Tailwind** — утилитарные классы напрямую в JSX, без CSS modules или styled-components
- **Нет `export default`** в lib-модулях — только named exports для удобства tree-shaking

### Development Workflow Rules

- **Деплой:** `git push` → Vercel автоматически деплоит на `book-club-slow-rising.vercel.app`
- **Ветки:** работа обычно ведётся в `main`, feature-ветки при необходимости
- **Коммиты:** `fix:`, `feat:`, `docs:`, `refactor:` префиксы (conventional commits)
- **Vercel project:** team `bon2362-5067s-projects`, `projectId: prj_ZwWgPCcLf8RyrxeMJDI5zCX08dEp`
- **Переменные окружения** (не коммитить в репо):
  `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_SHEETS_ID`, `ADMIN_EMAIL`,
  `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **Firewall в devcontainer** — разрешены только GitHub, npmjs.org, api.anthropic.com,
  googleapis.com, vercel.com; exit code 7 = заблокировано firewall
- **`gh run list`** — доступен для мониторинга CI после пушей
- **Миграции БД** — через `drizzle-kit`, схема в `lib/db/schema.ts`

### Critical Don't-Miss Rules

**Архитектура обложек:**
- **НЕ использовать Google Books API** — убран из-за 429 rate limits
- Обложки берутся **только из колонки L Google Sheets** (`row[11]`, поле `coverUrl`)
- `lib/covers.ts` **удалён** — не восстанавливать
- Таблица `book_covers` в БД **не используется** для обложек (устаревшая) — не читать и не писать

**База данных:**
- **Перед удалением/переименованием поля** из schema — сначала `Grep` по всему проекту,
  т.к. интерфейсы могут дублироваться в нескольких файлах
- `bookCovers` таблица существует в schema но не используется — не трогать без явной задачи

**Аутентификация (NextAuth v5 beta):**
- **`session: { strategy: 'jwt' }`** — нет таблицы sessions в активном использовании
- JWT callback проверяет существование пользователя в БД при каждом запросе
  (если `NEXTAUTH_TEST_MODE !== 'true'`) — не убирать эту проверку
- Telegram-провайдер использует `Credentials` с кастомным `authorize` — не путать с OAuth

**Google Sheets:**
- In-memory кэш с TTL 10 минут — `invalidateCache()` для принудительного сброса
- `fetchBooks()` возвращает `TEST_BOOKS` при `NEXTAUTH_TEST_MODE=true` — не фетчит реальные данные
- ID книги = номер строки в таблице (1-based, со смещением +2 для пропуска заголовка)

**Общие:**
- Не добавлять новые внешние сервисы без добавления их IP в firewall allowlist
- `NEXTAUTH_TEST_MODE` влияет на несколько систем сразу (auth + sheets) — помнить об этом в тестах

---

## Usage Guidelines

**For AI Agents:**

- Читать этот файл перед реализацией любого кода
- Следовать ВСЕМ правилам в точности как задокументировано
- При сомнениях — выбирать более ограничительный вариант
- Обновлять файл при появлении новых паттернов

**For Humans:**

- Держать файл лаконичным и сфокусированным на нуждах агентов
- Обновлять при изменении стека технологий
- Пересматривать раз в квартал на предмет устаревших правил
- Удалять правила, которые со временем становятся очевидными

Last Updated: 2026-03-14
