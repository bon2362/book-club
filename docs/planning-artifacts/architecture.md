---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-03-15'
inputDocuments: ['docs/planning-artifacts/prd.md', 'docs/project-context.md']
workflowType: 'architecture'
project_name: 'book-club'
user_name: 'Evgenii'
date: '2026-03-15'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

19 FR в 5 областях:
- **Book Submission (FR1–FR5):** форма с 9 полями (3 обязательных), хранение в новой таблице БД, статусная модель `pending → approved / rejected`
- **Entry Points (FR6–FR10):** два UI-входа (хедер + псевдо-карточка), попап авторизации для незалогиненных, автоматическое открытие формы после входа
- **Notifications (FR11–FR12):** email при смене статуса через Resend
- **Book Catalog (FR13–FR14):** объединённый каталог из двух источников (Google Sheets + БД)
- **Admin Moderation (FR15–FR19):** список заявок, редактирование полей, approve / reject

**Non-Functional Requirements:**

- **Mobile UX:** touch-цели, мобильная клавиатура по типу поля, никаких horizontal scroll
- **Security:** серверная проверка сессии для формы; `isAdmin` flag для admin-панели
- **Integration:** Resend (email), Drizzle + Neon Postgres (хранение), Google Sheets кэш (список тем)

**Scale & Complexity:**

- Primary domain: Full-stack Web App (Next.js 14 App Router)
- Complexity level: Низкая — brownfield расширение, все зависимости уже в проекте
- Estimated architectural components: 4–5 новых (таблица БД, API-маршруты, форма-компонент, admin-секция, email-утилита)

### Technical Constraints & Dependencies

- **Brownfield:** нельзя нарушить существующую функциональность каталога
- **NextAuth v5 beta:** `auth()` из `@/lib/auth`, JWT strategy, `isAdmin` через JWT callback — не хранить роли в БД
- **Google Sheets кэш:** темы для формы берутся из `fetchBooks()` (in-memory cache, TTL 10 min) — без дополнительных запросов к Sheets API
- **Обложки:** только URL (не Google Books API, не file upload в MVP)
- **Drizzle ORM:** новая таблица через schema + `drizzle-kit` миграция
- **Resend:** уже используется в проекте — переиспользовать паттерн

### Cross-Cutting Concerns Identified

- **Auth state → UI state:** клик незалогиненного → попап авторизации → после входа → открыть форму заявки. Требует координации между auth flow и UI state
- **Dual data source каталога:** страница каталога сейчас читает только Google Sheets — нужно объединить с одобренными заявками из БД (merge на уровне Server Component)
- **Admin доступ:** существующая admin-панель (`app/api/admin/`) — расширить, не переписывать

## Starter Template Evaluation

### Primary Technology Domain

Full-stack Web App — Next.js 14 App Router + TypeScript

### Starter Options Considered

Не применимо — brownfield проект. Существующий стек принят как данность.

### Architectural Foundation: Existing Stack

| Слой | Технология |
|---|---|
| Framework | Next.js 14.2 App Router |
| Language | TypeScript 5.x (strict mode) |
| Styling | TailwindCSS 3.4 |
| Database | Neon Postgres + Drizzle ORM |
| Migrations | drizzle-kit |
| Auth | NextAuth v5 beta (JWT strategy) |
| Email | Resend |
| Testing | Jest 29 + jsdom / Playwright (e2e) |
| Linting | ESLint next/core-web-vitals + next/typescript |
| Deploy | Vercel (git push → auto-deploy) |

Все новые компоненты следуют установленным паттернам проекта (`docs/project-context.md`). Инициализация нового проекта не требуется.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Схема таблицы `book_submissions` — определяет все слои (API, форма, admin)
- Auth state coordination — определяет UX flow для незалогиненных
- Catalog merging strategy — определяет изменения в существующем `/api/books`

**Important Decisions (Shape Architecture):**
- Расширение admin-панели новой секцией "Заявки"
- Email-шаблоны в отдельных файлах

**Deferred Decisions (Post-MVP):**
- File upload для обложек (Phase 2)
- Страница "Мои заявки" (Phase 2)

### Data Architecture

**Таблица `book_submissions`** — новая таблица в `lib/db/schema.ts`:

```typescript
book_submissions:
  id             uuid, PK, default randomUUID()
  user_id        text, NOT NULL, FK → users.id
  title          text, NOT NULL          // название
  topic          text                    // тема
  author         text, NOT NULL          // писатель
  pages          integer                 // число страниц
  published_date text                    // дата издания (текст для гибкости)
  text_url       text                    // ссылка на текст
  description    text                    // описание
  cover_url      text                    // ссылка на обложку
  why_read       text, NOT NULL          // почему стоит прочитать
  status         text, NOT NULL, default 'pending'  // pending|approved|rejected
  created_at     timestamp, default now()
  updated_at     timestamp, default now()
```

Миграция через `drizzle-kit`. Индекс на `status` для фильтрации в admin-панели.

### Authentication & Security

**Существующий паттерн** — не меняется: `auth()` из `@/lib/auth`, `isAdmin` через JWT callback.

**Auth state → UI state (React Context):**
- Контекст `SubmitBookIntentContext` на уровне layout (`app/layout.tsx`)
- При клике на псевдо-карточку/кнопку хедера незалогиненным: установить `pendingIntent = 'submit-book'` → открыть попап авторизации
- После успешной авторизации: проверить `pendingIntent`, открыть форму заявки, сбросить intent

### API & Communication Patterns

**Расширить `/api/books`** (уже существует) — добавить одобренные заявки из БД к данным из Google Sheets. Ответ возвращает объединённый массив книг единого формата.

**Новые API-маршруты:**
```
POST   /api/submissions              — подача заявки (auth required)
GET    /api/admin/submissions        — список заявок (isAdmin required)
PATCH  /api/admin/submissions/[id]   — update status + fields (isAdmin required)
```

**Email trigger** — вызывается внутри `PATCH /api/admin/submissions/[id]` после успешного обновления статуса. Сбой Resend не откатывает операцию (try/catch с логированием).

### Frontend Architecture

**Новые компоненты** (в `components/nd/`):
- `SubmitBookButton.tsx` — кнопка в хедере (client component)
- `SubmitBookCard.tsx` — псевдо-карточка #1 в сетке (client component)
- `SubmitBookForm.tsx` — форма заявки (client component, modal/drawer)
- `SubmitBookIntentContext.tsx` — контекст для auth intent

**Admin:**
- Секция "Заявки" в admin-странице (`app/admin/`)
- Таблица заявок с inline-редактированием и кнопками approve/reject

### Infrastructure & Deployment

Без изменений — Vercel, git push → auto-deploy. Новая таблица БД требует запуска `drizzle-kit` миграции до деплоя.

### Email Templates

Отдельный файл `lib/email-templates/submission-status.ts` — экспортирует функции `approvedEmail(bookTitle)` и `rejectedEmail(bookTitle)`, возвращающие `{ subject, html }` для Resend.

### Decision Impact Analysis

**Implementation Sequence:**
1. DB schema + миграция (`book_submissions`)
2. `lib/email-templates/submission-status.ts`
3. API маршруты (`/api/submissions` + `/api/admin/submissions`)
4. Расширить `/api/books`
5. `SubmitBookIntentContext` + интеграция с auth попапом
6. UI компоненты (форма, псевдо-карточка, кнопка в хедере)
7. Admin секция "Заявки"

**Cross-Component Dependencies:**
- Форма зависит от контекста intent и API `/api/submissions`
- Admin секция зависит от `/api/admin/submissions`
- Каталог зависит от обновлённого `/api/books`
- Email зависит от шаблонов и вызывается из admin API

## Implementation Patterns & Consistency Rules

### Naming Patterns

**Database (Drizzle ORM):**
- Таблица: `bookSubmissions` (camelCase в schema.ts, Drizzle маппит в `book_submissions` в SQL)
- Колонки: camelCase в schema (`userId`, `coverUrl`, `whyRead`, `publishedDate`)
- Status values: строго `'pending' | 'approved' | 'rejected'` (не `PENDING`, не `0/1/2`)

**API endpoints:**
- Новые маршруты: `app/api/submissions/route.ts`, `app/api/admin/submissions/route.ts`, `app/api/admin/submissions/[id]/route.ts`
- Параметры: `[id]` (не `[submissionId]`, не `[slug]`)

**Компоненты** (в `components/nd/`):
- `SubmitBook*.tsx` — префикс для всех компонентов фичи
- Контекст: `SubmitBookIntentContext.tsx`

### Structure Patterns

**Файловая структура:**
```
app/api/submissions/route.ts
app/api/admin/submissions/route.ts
app/api/admin/submissions/[id]/route.ts
components/nd/SubmitBookButton.tsx
components/nd/SubmitBookCard.tsx
components/nd/SubmitBookForm.tsx
components/nd/SubmitBookIntentContext.tsx
lib/email-templates/submission-status.ts
lib/db/schema.ts                        — дополнить существующий
```

**Тесты** — рядом с исходником:
```
app/api/submissions/route.test.ts
lib/email-templates/submission-status.test.ts
```

### Format Patterns

**API response format:**
```typescript
// Успех
return NextResponse.json({ success: true, data: ... })
// Ошибка
return NextResponse.json({ error: 'message' }, { status: 4xx })
```

**Submission type** — единый формат во всех слоях:
```typescript
type Submission = {
  id: string
  userId: string
  title: string
  topic: string | null
  author: string
  pages: number | null
  publishedDate: string | null
  textUrl: string | null
  description: string | null
  coverUrl: string | null
  whyRead: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: Date
  updatedAt: Date
}
```

### Process Patterns

**Auth guard в API-маршрутах:**
```typescript
const session = await auth()
if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
// для admin:
if (!session.user.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

**Email отправка** — сбой не блокирует основную операцию:
```typescript
try {
  await resend.emails.send(...)
} catch (e) {
  console.error('Email send failed:', e)
}
```

**Form loading state** — локальный `useState` в `SubmitBookForm.tsx`, не глобальный стейт.

### Enforcement Guidelines

**Все AI-агенты ОБЯЗАНЫ:**
- Использовать `@/` alias для всех внутренних импортов
- Не добавлять `export default` в lib-модули — только named exports
- Проверять сессию через `auth()` из `@/lib/auth`
- Использовать строго типизированный `status: 'pending' | 'approved' | 'rejected'`
- Размещать тесты рядом с исходником, не в отдельной папке `__tests__`

## Project Structure & Boundaries

### New Files (создать)

```
app/
├── api/
│   ├── submissions/
│   │   ├── route.ts              ← POST /api/submissions
│   │   └── route.test.ts
│   └── admin/
│       └── submissions/
│           ├── route.ts          ← GET /api/admin/submissions
│           └── [id]/
│               └── route.ts     ← PATCH /api/admin/submissions/[id]
│
components/
└── nd/
    ├── SubmitBookButton.tsx       ← кнопка в хедере
    ├── SubmitBookCard.tsx         ← псевдо-карточка #1 в сетке
    ├── SubmitBookForm.tsx         ← форма заявки (modal/drawer)
    └── SubmitBookIntentContext.tsx ← контекст auth intent
│
lib/
└── email-templates/
    ├── submission-status.ts       ← approvedEmail(), rejectedEmail()
    └── submission-status.test.ts
```

### Modified Files (изменить)

```
lib/db/schema.ts                  ← добавить bookSubmissions table
app/api/books/route.ts            ← добавить approved submissions к ответу
app/layout.tsx                    ← обернуть в SubmitBookIntentContext provider
app/page.tsx                      ← добавить SubmitBookCard как первый элемент сетки
components/nd/Header.tsx          ← добавить SubmitBookButton
app/admin/page.tsx                ← добавить секцию "Заявки"
```

### Architectural Boundaries

**API Boundaries:**

| Endpoint | Auth | Действие |
|---|---|---|
| `POST /api/submissions` | session required | Создать заявку |
| `GET /api/admin/submissions` | isAdmin required | Список заявок |
| `PATCH /api/admin/submissions/[id]` | isAdmin required | Сменить статус + поля |
| `GET /api/books` | public | Объединённый каталог (Sheets + approved) |

**Data Flow:**

```
User → SubmitBookForm → POST /api/submissions → bookSubmissions (DB, status=pending)
                                                        ↓
Admin → admin panel → PATCH /api/admin/submissions/[id] → status=approved/rejected
                                                        ↓
                                              resend.emails.send() (async, non-blocking)
                                                        ↓
                                              approved → GET /api/books включает книгу в каталог
```

**Auth Intent Flow:**

```
Click (unauthenticated)
  → SubmitBookIntentContext.setPendingIntent('submit-book')
  → open auth popup
  → on auth success: check pendingIntent
  → open SubmitBookForm
  → clearPendingIntent()
```

### Requirements to Structure Mapping

| FR | Файл(ы) |
|---|---|
| FR1–FR5 (форма, сохранение) | `SubmitBookForm.tsx`, `POST /api/submissions`, `schema.ts` |
| FR2a (список тем) | `SubmitBookForm.tsx` + `GET /api/books` (темы из Sheets кэша) |
| FR6–FR10 (входы, auth intent) | `SubmitBookCard.tsx`, `SubmitBookButton.tsx`, `SubmitBookIntentContext.tsx`, `layout.tsx` |
| FR11–FR12 (email) | `lib/email-templates/submission-status.ts`, `PATCH /api/admin/submissions/[id]` |
| FR13–FR14 (каталог) | `GET /api/books` (расширить) |
| FR15–FR19 (admin) | `GET+PATCH /api/admin/submissions`, admin page секция |

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
Все технологии совместимы — Next.js 14 + TypeScript + Drizzle + NextAuth v5 + Resend уже работают в связке в существующем проекте. Новые решения органично вписываются в существующую архитектуру.

**Pattern Consistency:**
Паттерны (`@/` alias, named exports, `auth()` сессия, co-located тесты) соответствуют `project-context.md`. Новые правила не противоречат существующим.

**Structure Alignment:**
Структура файлов следует существующим конвенциям: API в `app/api/`, компоненты в `components/nd/`, утилиты в `lib/`.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**
Все 19 FR + FR2a архитектурно покрыты (см. Requirements to Structure Mapping).

**Non-Functional Requirements Coverage:**
- Mobile UX → `SubmitBookForm.tsx` + `SubmitBookCard.tsx` с touch-целями
- Security → auth guards в каждом API-маршруте
- Integration (Resend, Drizzle, Sheets кэш) → описаны в Data Architecture

### Implementation Readiness Validation ✅

**Decision Completeness:** Все критические решения задокументированы с обоснованием.
**Structure Completeness:** Каждый FR трассируется к конкретному файлу.
**Pattern Completeness:** Примеры кода для auth guard, email try/catch, API response format.

### Gap Analysis Results

**Важный Gap (не блокирующий):**
Компоненты находятся в `components/nd/`, layout в `app/layout.tsx`.

### Architecture Completeness Checklist

- [x] Контекст проекта проанализирован
- [x] Масштаб и сложность оценены
- [x] Технические ограничения определены
- [x] Критические решения задокументированы
- [x] Паттерны именования установлены
- [x] Паттерны процессов (error handling, auth, email) определены
- [x] Полная файловая структура специфицирована
- [x] Все FR трассируются к файлам
- [x] Порядок реализации определён

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** Высокий — brownfield проект с хорошо знакомым стеком, все зависимости уже работают.

**Key Strengths:**
- Новые компоненты следуют существующим паттернам — минимальный риск конфликтов
- Независимость фичи — можно реализовывать инкрементально
- Чёткий порядок реализации из 7 шагов

**Areas for Future Enhancement:**
- Phase 2: file upload для обложек (потребует storage решения)
- Phase 2: страница "Мои заявки"

### Implementation Handoff

**AI Agent Guidelines:**
- Читать `docs/project-context.md` перед написанием любого кода
- Следовать порядку реализации из Core Architectural Decisions
- При работе с auth popup и хедером — сначала читать существующий код

**First Implementation Priority:**
```
1. Читать существующие: lib/db/schema.ts, components/nd/ (header, auth popup)
2. Добавить bookSubmissions в lib/db/schema.ts + запустить drizzle-kit migrate
3. Далее по порядку из Decision Impact Analysis
```
