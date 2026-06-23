# Саммари книг от участников — дизайн

**Дата:** 2026-06-23
**Цель:** дать участникам клуба возможность публиковать личные саммари прочитанных книг после модерации администратором.
**Связанный issue:** [#16](https://github.com/bon2362/book-club/issues/16) — Саммари книги от участников.

---

## 1. Scope MVP

MVP строится вокруг отдельной сущности `book_summaries`.

Пользовательский поток:

1. Участник открывает профиль, секцию `Прочитал:а`.
2. В меню прочитанной книги видит действие по саммари.
3. Если саммари ещё нет, открывает Markdown-редактор.
4. Редактор автосохраняет черновик, toolbar вставляет Markdown-разметку, preview показывает будущий вид.
5. После отправки саммари переходит в `pending`.
6. Админ правит текст, одобряет или отклоняет с комментарием.
7. После публикации саммари видно на публичной странице книги и из каталога.
8. После отклонения автор возвращается в редактор из меню книги и видит комментарий админа.

В MVP входят:

- написать саммари для книги, которую пользователь лично отметил как `Прочитал:а`;
- Markdown toolbar и preview;
- автосейв черновика;
- модерация администратором с inline-правкой текста;
- approve/reject с обязательным комментарием при reject;
- публичная страница книги со всеми опубликованными саммари;
- заметный вход к саммари на карточке книги в каталоге.

В MVP не входят:

- реакции `Полезно`;
- комментарии;
- отдельная страница или вкладка `Мои саммари`;
- версии опубликованного текста;
- WYSIWYG/contentEditable редактор;
- email-уведомления о модерации;
- редактирование опубликованного саммари автором.

## 2. Ключевые продуктовые правила

- У одной книги может быть несколько опубликованных саммари от разных участников.
- Один пользователь может иметь максимум одно саммари на одну книгу.
- Писать может только пользователь, у которого эта книга есть в `signup_books` с `personal_status='read'`.
- Право писать не зависит от клубного `books.reading_status`: если пользователь лично прочитал книгу, он может предложить саммари.
- Каталог показывает вход к саммари на любой книге, где есть хотя бы одно опубликованное саммари.
- Автор может редактировать только `draft` и `rejected`.
- `pending` для автора заблокирован от редактирования.
- `published` в MVP редактирует только админ.
- Публично видны только `published`.

## 3. Отклонённые подходы

### 3.1 Переиспользовать `book_submissions`

Плюс: можно частично использовать существующую админскую модерацию заявок.

Минусы:

- заявки на книги и саммари имеют разные жизненные циклы;
- автосейв и уникальность `book_id + author_user_id` плохо ложатся на `book_submissions`;
- публичная страница саммари и будущие реакции станут семантически грязным расширением таблицы заявок.

### 3.2 Хранить саммари внутри `books`

Плюс: быстро показать текст в каталоге.

Минусы:

- плохо поддерживает несколько авторов;
- усложняет статусы, модерацию и права доступа;
- увеличивает риск конфликтов при админском редактировании книги;
- хуже аудируется как отдельная пользовательская сущность.

Выбранный подход: отдельная таблица `book_summaries`, UI и API рядом с каталогом, но модерационный UX повторяет знакомый паттерн заявок.

## 4. Модель данных

Новая таблица `book_summaries`:

```ts
export const bookSummaries = pgTable('book_summaries', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  authorUserId: text('author_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  title: text('title').notNull().default(''),
  tldr: text('tldr').notNull().default(''),
  bodyMarkdown: text('body_markdown').notNull().default(''),
  status: text('status').notNull().default('draft'), // draft | pending | published | rejected
  rejectionReason: text('rejection_reason'),
  submittedAt: timestamp('submitted_at', { mode: 'date' }),
  publishedAt: timestamp('published_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  bookAuthorUnique: uniqueIndex('book_summaries_book_author_unique').on(t.bookId, t.authorUserId),
  bookStatusIdx: index('book_summaries_book_status_idx').on(t.bookId, t.status),
  authorStatusIdx: index('book_summaries_author_status_idx').on(t.authorUserId, t.status),
}))
```

Решения:

- `display_name` хранится на самом саммари, чтобы опубликованное имя не менялось задним числом при изменении профиля.
- Тело хранится как Markdown, не HTML. Raw HTML не рендерится.
- `title`, `tldr`, `body_markdown` могут быть пустыми в черновике, но обязательны при отправке на проверку.
- `submitted_at` обновляется при каждом переходе в `pending`.
- `published_at` выставляется при первом approve и обновляется при повторной публикации только админом.

## 5. Аудит

`book_summaries` — новая мутабельная таблица, значит:

- добавить `book_summaries` в `AUDITED_TABLES` (`lib/audit/audited-tables.ts`);
- добавить audit trigger в новой миграции;
- все insert/update/delete выполнять через `withAuditContext`;
- source для автора: `summary`;
- source для админа: `admin`;
- reason при reject: текст `rejection_reason`.

Чувствительных колонок в MVP нет: Markdown-тело и имя для публикации являются пользовательским контентом, который видит админ. Дополнительное маскирование в `audit_capture()` не требуется.

## 6. Серверный слой

Новый модуль `lib/book-summaries.ts` отвечает за:

- нормализацию `displayName`, `title`, `tldr`, `bodyMarkdown`;
- проверку статусов;
- проверку права автора писать по книге;
- создание или возврат существующего summary для `bookId + authorUserId`;
- автосейв `draft`/`rejected`;
- submit в `pending`;
- approve/reject;
- публичные выборки только `published`;
- агрегаты `summaryCount` для каталога.

Переходы статусов:

```text
draft -> pending
pending -> published
pending -> rejected
rejected -> pending
```

Админ может править поля в любом статусе. Автор может править только `draft` и `rejected`.

## 7. API

Авторские API:

- `GET /api/summaries/by-book/:bookId`  
  Возвращает summary текущего пользователя для книги, если есть, и публичные метаданные права писать.

- `POST /api/summaries/by-book/:bookId`  
  Создаёт draft или возвращает существующий summary. Требует `personal_status='read'`.

- `PATCH /api/summaries/:id`  
  Автосейв полей `displayName`, `title`, `tldr`, `bodyMarkdown`. Разрешён только автору для `draft`/`rejected`.

- `POST /api/summaries/:id/submit`  
  Валидирует обязательные поля, повторно проверяет `personal_status='read'`, переводит в `pending`.

Админские API:

- `GET /api/admin/summaries`  
  Список саммари для админки, с фильтрами на клиенте или query-параметром `status`.

- `PATCH /api/admin/summaries/:id`  
  Inline-правки `displayName`, `title`, `tldr`, `bodyMarkdown`, `rejectionReason`.

- `POST /api/admin/summaries/:id/publish`  
  Переводит в `published`, очищает `rejectionReason`, выставляет `publishedAt`.

- `POST /api/admin/summaries/:id/reject`  
  Требует непустой `rejectionReason`, переводит в `rejected`.

Публичные данные получаем server-side через `lib/book-summaries.ts`, без отдельного публичного JSON API в MVP.

## 8. UI: профиль и вход в редактор

`MatchingBookDetailModal` получает summary state для текущей книги:

- нет summary, личный статус `read` → `Написать саммари`;
- `draft` → `Продолжить саммари`;
- `pending` → `Саммари на проверке` (disabled/read-only);
- `rejected` → `Доработать саммари`;
- `published` → `Саммари опубликовано` + ссылка на публичную страницу.

Если личный статус не `read`, кнопка написания не показывается.

Статус и комментарий отказа не выносятся в отдельный раздел `Мои саммари`: в MVP автор возвращается к тексту через ту же книгу в профиле.

## 9. UI: Markdown-редактор

Новая страница редактора:

- верхняя панель: назад к книге/профилю, статус сохранения, `Предпросмотр`, `Отправить на проверку`;
- поля: `displayName`, `title`, `tldr`, `bodyMarkdown`;
- toolbar: `B`, `I`, `H`, quote, bullet list, link;
- preview режим рендерит тот же Markdown-пайплайн, что публичная страница;
- rejected-состояние показывает комментарий админа над редактором;
- pending/published открываются read-only или редиректят к профилю/публичной странице.

Toolbar работает как Markdown helper:

- выделенный текст оборачивается маркерами;
- без выделения вставляется шаблон;
- после вставки textarea остаётся в фокусе.

Автосейв:

- debounce 700-1000 мс;
- final save перед submit;
- визуальные состояния: `Сохранение...`, `Сохранено`, `Ошибка сохранения`;
- retry вручную через повторную правку или кнопку submit;
- не сохраняет пустой новый draft чаще, чем нужно: запись создаётся при входе в редактор, а последующие PATCH отправляются только при изменениях.

## 10. UI: публичная страница саммари книги

Новая публичная страница `/books/[bookId]/summaries`.

Содержимое:

- hero книги: название, автор, год, страницы;
- если published summaries несколько — переключатель/список авторов;
- если одно — без лишних табов;
- блок каждого summary: имя для публикации, дата публикации, заголовок, TL;DR, Markdown prose;
- ссылка назад в каталог.

Если опубликованных саммари нет:

- публичная страница возвращает 404, потому что каталог не должен ссылаться на пустую страницу.

Markdown рендер:

- `react-markdown`;
- raw HTML отключён;
- ссылки открываются безопасно с `target="_blank"` и `rel="noopener noreferrer"`;
- стили prose используют токены `app/globals.css` и редакторский белый канон.

## 11. UI: каталог

`BookCard` и `BookCardMobile` получают `summaryCount`.

Если `summaryCount > 0`:

- на карточке показывается заметная плашка `✦ N саммари клуба`;
- клик ведёт на `/books/[bookId]/summaries`;
- плашка показывается независимо от `books.reading_status`;
- кнопка `Хочу читать` и личные статусы остаются как сейчас.

Для MVP не делаем popover TL;DR в каталоге. Это отдельное улучшение после базовой публикации.

## 12. UI: админка

`AdminPanel` получает вкладку `Саммари`.

Вкладка повторяет паттерн заявок:

- фильтры: `Все`, `Черновики`, `На проверке`, `Опубликованные`, `Отклонённые`;
- таблица: книга, автор аккаунта, имя для публикации, статус, дата;
- раскрытая строка с inline-редактором `displayName`, `title`, `tldr`, `bodyMarkdown`, `rejectionReason`;
- preview Markdown рядом или под редактором;
- действия: `Сохранить`, `Опубликовать`, `Отклонить`;
- reject без причины заблокирован сервером и показывается ошибкой в UI.

Админская правка опубликованного текста сразу меняет публичную версию и аудируется.

## 13. Интеграция с каталогом данных

`fetchBooksWithCovers` должен вернуть `summaryCount` для публичного каталога.

Реализация:

- отдельный aggregate query по `book_summaries` со статусом `published`;
- join/map по `bookId` в `lib/books.ts`;
- тип `BookWithCover` расширяется полем `summaryCount: number`;
- тесты проверяют, что учитываются только `published`.

Это не меняет порядок книг и не влияет на `signupCount`.

## 14. Ошибки и edge cases

- Если книга удалена, связанные саммари удаляются cascade.
- Если пользователь убрал книгу из `read`, существующий draft/rejected остаётся видимым автору, но submit блокируется.
- Если пользователь уже имеет summary для книги, `POST /api/summaries/by-book/:bookId` возвращает существующую запись.
- Если два запроса одновременно создают summary, unique index защищает от дублей; API должен обработать конфликт и вернуть существующую запись.
- Если админ публикует пустой текст, API возвращает 400: `title`, `tldr`, `bodyMarkdown`, `displayName` обязательны для `published`.
- Если автор отправляет пустой текст, API возвращает 400 с полями ошибок.
- Если Markdown содержит HTML, HTML выводится как текст или отбрасывается рендерером, но не исполняется.

## 15. Тестирование

Unit/API:

- автор без сессии получает 401;
- автор без `personal_status='read'` не может создать/submit summary;
- `book_id + author_user_id` уникален;
- автосейв разрешён для `draft` и `rejected`;
- автосейв запрещён для `pending` и `published`;
- submit валидирует обязательные поля;
- публичная выборка возвращает только `published`;
- админ publish/reject меняет статус и timestamps;
- reject требует `rejectionReason`;
- `fetchBooksWithCovers` считает только published summaries.

Component tests:

- toolbar вставляет Markdown-разметку;
- preview использует Markdown body;
- меню книги показывает правильное действие для `none/draft/pending/rejected/published`;
- admin tab показывает фильтры и inline editor.

E2E:

- нужен, потому что это новый UI-flow с персистентным состоянием и модерацией;
- happy path: пользователь с книгой `read` создаёт draft, автосейв переживает reload, отправляет на проверку, админ публикует, после reload плашка видна в каталоге и публичная страница показывает текст;
- rejection path: админ отклоняет с причиной, автор видит причину в редакторе и может отправить повторно.

Перед коммитом реализации прогонять:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e <relevant specs>
```

## 16. Документация

`docs/features/` нужна:

- новая БД-сущность;
- API;
- модерационный workflow;
- Markdown/autosave правила;
- аудит.

`docs/wiki/` нужна:

- пользовательская фича;
- админский workflow;
- публичная страница;
- изменения в данных и приватности.

`public/openapi.json` нужно обновить: в проекте уже документируются публичные и admin API, включая `submissions`.

## 17. Порядок реализации

1. Миграция и схема `book_summaries`, audit trigger, `AUDITED_TABLES`.
2. `lib/book-summaries.ts` с тестами на права, статусы, публичные выборки.
3. Авторские API для create/get/save/submit.
4. Admin API для list/edit/publish/reject.
5. Markdown editor и toolbar.
6. Интеграция в профиль.
7. Публичная страница summaries.
8. Агрегат `summaryCount` в каталоге и плашки в desktop/mobile карточках.
9. AdminPanel вкладка `Саммари`.
10. E2E happy path и rejection path.
11. `docs/features/`, `docs/wiki/`, `public/openapi.json`.

## 18. Артефакты перед коммитом реализации

Для реализации этой фичи перед каждым commit явно фиксировать:

- `E2E: нужен` — новый UI-flow, персистентное состояние, модерация и публичная видимость после reload.
- `Wiki: нужна` — меняются пользовательская фича, БД-схема, API, admin workflow и data handling.
