# Audit Log (журнал изменений)

## Что делает

Append-only журнал, фиксирующий каждую мутацию в БД: кто, что, где, когда, и полные снимки строки до и после изменения. Используется для расследования инцидентов и жалоб.

## Архитектура

Захват делают **триггеры БД**, а не код приложения. Принцип: _полнота — обязанность БД, богатый контекст — обязанность кода_. Забыл обернуть вызов — изменение всё равно записано, теряется максимум имя актора (и такая запись заметна по `source='trigger'`).

## Таблица `audit_log`

```ts
// lib/db/schema.ts
export const auditLog = pgTable('audit_log', {
  id:            text('id').primaryKey(),          // UUID
  occurredAt:    timestamp('occurred_at'),         // время события
  actorUserId:   text('actor_user_id'),            // БЕЗ FK: append-only, не мутируется каскадом
  actorLabel:    text('actor_label'),              // снимок имени/email — переживает удаление юзера
  source:        text('source').notNull(),         // 'admin'|'api'|'cron'|'auth'|'profile'|'trigger'
  action:        text('action').notNull(),         // 'insert'|'update'|'delete'
  entityType:    text('entity_type').notNull(),    // имя таблицы
  entityId:      text('entity_id'),               // PK строки (для составных — 'session_id:user_id:book_id')
  before:        jsonb('before'),                 // полная строка ДО (null при INSERT)
  after:         jsonb('after'),                  // полная строка ПОСЛЕ (null при DELETE)
  changedFields: jsonb('changed_fields'),         // ['field1','field2'] — ключи, которые сменились
  reason:        text('reason'),                  // опц. человеческая причина (текст отклонения и т.п.)
  metadata:      jsonb('metadata'),               // requestId, ip, userAgent, stateVersion (для #344)
})
```

Индексы: по `(entityType, entityId, occurredAt)` — история объекта; по `(actorUserId, occurredAt)` — что делал актор; по `occurredAt` — недавняя активность.

`actorLabel` — намеренная денормализация: при расследовании спустя месяцы юзер мог удалиться (FK отсутствует), а текстовый снимок «кто» сохранится.

## Триггерная функция `audit_capture`

Одна plpgsql-функция (`drizzle/0040_audit_triggers.sql`) навешивается триггером AFTER INSERT/UPDATE/DELETE на каждую аудируемую таблицу.

Что делает функция:
1. Формирует `v_before = to_jsonb(OLD)`, `v_after = to_jsonb(NEW)` по `TG_OP`.
2. **Маскирует секреты** по `TG_TABLE_NAME`:
   - `verificationToken` → вырезает поле `token` (`v_after - 'token'`) — иначе действующий magic-link был бы виден в просмотрщике.
   - `telegram_preauth_tokens` → вырезает `token_hash`.
   - `book_summary_helpful_reactions` → вырезает псевдонимный `visitor_hash` из `before` и `after`.
3. Для UPDATE вычисляет `changedFields` — ключи, где `v_after -> key IS DISTINCT FROM v_before -> key`.
4. Собирает `entity_id`: сначала пробует `id`; при композитных PK — конкатенирует `session_id:user_id:book_id` (актуально для `book_priorities`, `signup_books`, `matching_*`).
5. Читает контекст из transaction-local настроек:
   - `current_setting('app.audit_actor', true)` → `actor_user_id`
   - `current_setting('app.audit_label', true)` → `actor_label`
   - `current_setting('app.audit_source', true)` → `source`; если пусто — подставляет `'trigger'`
   - `current_setting('app.audit_reason', true)` → `reason`
6. Вставляет строку в `audit_log`.

## Реестр `AUDITED_TABLES`

```ts
// lib/audit/audited-tables.ts
export const AUDITED_TABLES = [
  'books', 'user', 'book_priorities', 'book_submissions',
  'book_summaries', 'book_summary_revisions', 'book_summary_helpful_reactions',
  'intro_sections', 'signup_books', 'feedback', 'tag_descriptions',
  'matching_sessions', 'matching_session_participants',
  'matching_pseudonym_reservations', 'matching_preference_events',
  'user_merge_events', 'user_identities',
  'verificationToken', 'telegram_preauth_tokens', 'notification_queue',
] as const
```

Реестр — единый источник правды для:
- генерации триггер-миграций (`drizzle/0040_audit_triggers.sql`);
- ESLint-правила, запрещающего сырые `db.insert/update/delete` вне `withAuditContext`;
- reconciliation-теста `drizzle/0040_audit_triggers.test.ts`, проверяющего синхронность.

`audit_log` в реестр **не входит** — триггер на неё вызвал бы рекурсию.

## `withAuditContext` — паттерн вызова на роуте

```ts
import { withAuditContext } from '@/lib/audit/with-audit-context'

// Пример: мутирующий admin-роут
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()

  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel:  session.user.name ?? session.user.email ?? undefined,
      source:      'admin',
      reason:      body.reason,        // опционально
    },
    async (tx) => {
      await tx.update(books).set(body).where(eq(books.id, params.id))
    },
  )

  return NextResponse.json({ ok: true })
}
```

`withAuditContext` открывает `db.transaction()`, делает `SET LOCAL` для четырёх `app.audit_*` настроек через `set_config(name, value, true)`, затем выполняет тело. Все мутации внутри подхватываются триггером с контекстом.

Системные пути (cron, scheduled jobs): `source: 'cron'` или `'system'`, `actorUserId: null`.

## Что значит `source='trigger'`

Запись с `source='trigger'` означает, что мутация прошла **мимо `withAuditContext`** — настройки `app.audit_*` были пусты, и триггер подставил дефолт.

Два легитимных случая:
- **Auth-таблицы** (`verificationToken`, `telegram_preauth_tokens`, `user_identities`): NextAuth DrizzleAdapter пишет в них напрямую, минуя наш код. Эти таблицы входят в allowlist `AUTH_OOB_TABLES` — reconciliation-сигнал их не считает нарушением.
- Ручные SQL-запросы в dev/migration-скриптах.

Во всех остальных случаях `source='trigger'` — сигнал «забыли обернуть роут». Следует найти роут и добавить `withAuditContext`.

## Телеметрия (шум, который не логируем)

`user_activity_events` — сам по себе лог посещений; аудировать его значило бы дублировать данные, поэтому триггер с этой таблицы снят (миграция `0041`), и таблица убрана из `AUDITED_TABLES`.

Кроме того, чисто телеметрические UPDATE-ы в обычных таблицах тоже пропускаются прямо в теле `audit_capture`:

- `user.last_activity_at` — обновляется на каждый визит; реальные изменения учётки (email, имя, is_admin) по-прежнему логируются.
- `user_identities.last_seen_at` — аналогично.

Пропуск реализован через `RETURN NEW` в начале функции, если единственное изменённое поле — исключённое: `v_changed <@ '["last_activity_at"]'::jsonb`.

## «Система» vs «внесистемное» в просмотрщике

Просмотрщик различает два случая `source='trigger'`:

- **«система»** (цвет `var(--text-muted)`) — таблица входит в `SYSTEM_TRIGGER_TABLES` (`verificationToken`, `user`, `user_identities`, `notification_queue`, `matching_pseudonym_reservations`). Это ожидаемые строки от системной автоматики / NextAuth.
- **«внесистемное»** (цвет `var(--accent)`) — таблица не входит в список. Это реальный сигнал «забыли обернуть роут».

## ESLint-правило

Прямые вызовы `db.transaction(...)`, `db.insert(...)`, `db.update(...)`, `db.delete(...)` вне разрешённых модулей запрещены — нужно использовать `withAuditContext`. Разрешённые исключения: сам `lib/audit/with-audit-context.ts`, `drizzle`-миграции, seed-скрипты.

## Как добавить новую таблицу под аудит

1. Добавить имя таблицы в массив `AUDITED_TABLES` (`lib/audit/audited-tables.ts`).
2. Создать новую миграцию с триггером по шаблону `drizzle/0040_audit_triggers.sql`:
   ```sql
   CREATE TRIGGER audit_<table_name>
     AFTER INSERT OR UPDATE OR DELETE ON "<table_name>"
     FOR EACH ROW EXECUTE FUNCTION audit_capture();
   ```
3. Убедиться, что reconciliation-тест `drizzle/0040_audit_triggers.test.ts` проходит — он сравнивает реестр с набором триггеров в БД.
4. Если таблица содержит секреты (токены, хеши) — добавить маску в функцию `audit_capture()` по аналогии с `verificationToken`.

`user_merge_events` — специальная summary-таблица для admin merge дублей. Она аудируется как обычная мутабельная таблица, но сама запись уже содержит человекочитаемую причину, source/target snapshots и movedCounts. `audit_log.actor_user_id` намеренно не переписывается при merge: append-only история остаётся привязанной к тому внутреннему user id, который совершал действие на тот момент.

## Append-only и неизменяемость

FK на `actor_user_id` снят намеренно: `ON DELETE set null` потребовал бы UPDATE по `audit_log` и конфликтовал с append-only семантикой. При желании можно `REVOKE UPDATE, DELETE ON audit_log FROM <app_role>` для defense-in-depth; иначе неизменяемость держится на ESLint-запрете мутаций `audit_log` из кода.

## Просмотрщик (admin-вкладка «История изменений»)

- Компонент: `components/nd/AdminAuditLog.tsx` (data-testid: `admin-tab-audit`)
- API: `GET /api/admin/audit-log`; доступ только `isAdmin`
- Фильтры через query params: `actorUserId`, `entityType`, `entityId`, `source`, `from`, `to`
- Пагинация: `page` (1-based, дефолт 1) и `pageSize` (дефолт 50, макс 200); ответ содержит `total`, `page`, `pageSize`
- Сортировка: `sortBy` ∈ `{ occurredAt, source, action, entityType, entityId, actorLabel }` (дефолт `occurredAt`), `sortDir` ∈ `{ asc, desc }` (дефолт `desc`)
- UI-компонент поддерживает серверную пагинацию (50/стр), панель фильтров (источник/объект/актор/ID/даты) и сортировку кликом по заголовкам столбцов с индикатором ▲/▼
- Строки с `source='trigger'` подсвечиваются меткой «внесистемное»
- Клик по строке раскрывает `before`/`after`/`changedFields`/`reason`

## Связь с issue #344

`audit_log` — журнал diff-мутаций («кто/что поменял»). Issue #344 — snapshot-стор вычисленных сценариев матчинга (`frozenScenarioJson`, отдельная таблица). Они связаны через `metadata.stateVersion` в `audit_log`: запись о перестановке рангов содержит версию состояния, по которой можно найти соответствующий снимок сценариев. Не сливаем в одну таблицу — объём и форма разные.

## Ключевые файлы

- `lib/db/schema.ts` — таблица `auditLog`
- `drizzle/0039_audit_log.sql` — миграция создания таблицы
- `drizzle/0040_audit_triggers.sql` — функция `audit_capture` + триггеры
- `lib/audit/audited-tables.ts` — реестр `AUDITED_TABLES`
- `lib/audit/with-audit-context.ts` — враппер транзакции с контекстом
- `app/api/admin/audit-log/route.ts` — GET API для просмотрщика
- `components/nd/AdminAuditLog.tsx` — UI вкладки «История изменений»
- `drizzle/0040_audit_triggers.test.ts` — reconciliation-тест реестра и триггеров
- `drizzle/0047_summary_helpful_reactions.sql` — trigger для реакций и masking `visitor_hash`
