# Site-wide Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Append-only журнал всех изменений данных (кто/что/где/когда, before→after) для расследования инцидентов и жалоб, с захватом на уровне БД (триггеры) и контекстом «кто» из кода.

**Architecture:** Триггеры Postgres на всех мутабельных таблицах автоматически пишут `before`/`after` в одну таблицу `audit_log` — полнота гарантируется БД. Код через `withAuditContext` (transaction-local `set_config`) сообщает триггеру actor/source/reason. Полнота — обязанность БД, контекст — обязанность кода; забывчивость «ломается безопасно» (запись остаётся, теряется максимум имя актора, и такие записи помечены `source='trigger'`).

**Tech Stack:** Next.js 14, drizzle-orm `neon-serverless` (Pool/WebSocket — держит сессию в `db.transaction`, поэтому `set_config(...,true)` доживает до триггера), Postgres (Neon, pg16 — `gen_random_uuid()` встроен), Jest, Playwright.

**Spec:** [docs/superpowers/specs/2026-06-10-site-audit-log-design.md](../specs/2026-06-10-site-audit-log-design.md)

---

## File Structure

- `lib/db/schema.ts` — добавить таблицу `auditLog` (modify).
- `lib/audit/audited-tables.ts` — реестр `AUDITED_TABLES` (create).
- `lib/audit/with-audit-context.ts` — `withAuditContext`, тип `AuditContext` (create).
- `lib/audit/with-audit-context.test.ts` — unit (create).
- `drizzle/00XX_audit_log.sql` — таблица + индексы + FK (create, через drizzle-kit).
- `drizzle/00XX_audit_log.test.ts` — тест миграции таблицы (create).
- `drizzle/00YY_audit_triggers.sql` — функция `audit_capture()` + триггеры на каждую таблицу реестра (create, вручную).
- `drizzle/00YY_audit_triggers.test.ts` — тест миграции триггеров (create).
- `.eslintrc.json` — `no-restricted-syntax` против сырых `db.insert/update/delete` (modify).
- `app/api/admin/audit-log/route.ts` — read API просмотрщика (create).
- `app/api/admin/audit-log/route.test.ts` — тест API (create).
- `components/nd/AdminAuditLog.tsx` — вкладка просмотрщика (create).
- `components/nd/AdminPanel.tsx` — добавить вкладку `audit` (modify).
- `e2e/audit-log.spec.ts` — e2e персистентности + out-of-band (create).
- `docs/features/audit-log.md` — code-level доки (create).
- `docs/wiki/audit-log.md` — wiki для владельца (create).
- `CLAUDE.md` — правило про `AUDITED_TABLES` и запрет сырых мутаций (modify).

> **Решение по §13 спеки:** `withAuditContext` ставится **на каждом мутирующем роуте** (а не глобальной обёрткой) — явно, рядом с `auth()`, чтобы actor брался из сессии этого запроса. `entityId` для композитных PK триггер берёт из `id`-ключа, если он есть; для таблиц без `id` (`book_priorities`, `signup_books`, `matching_session_participants`, `verificationToken`) `entity_id` остаётся `NULL`, а идентификация ведётся по `before/after` jsonb — этого достаточно для расследований (см. Task 3, шаг с `entity_id`).

---

## Task 1: Таблица `audit_log` в схеме

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Добавить таблицу в конец `lib/db/schema.ts`**

```ts
// Site-wide audit log — см. docs/superpowers/specs/2026-06-10-site-audit-log-design.md
// Захват делают триггеры БД (drizzle/00YY_audit_triggers.sql), не drizzle-код.
export const auditLog = pgTable('audit_log', {
  id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  occurredAt:    timestamp('occurred_at', { mode: 'date' }).notNull().defaultNow(),
  // БЕЗ FK на users: append-only журнал не должен мутироваться каскадом ON DELETE,
  // иначе REVOKE UPDATE/DELETE (Task 3, append-only) конфликтует с set-null. «Кто»
  // сохраняется денормализованно в actorLabel; actorUserId — просто текстовый id.
  actorUserId:   text('actor_user_id'),
  actorLabel:    text('actor_label'),
  source:        text('source').notNull(),
  action:        text('action').notNull(),
  entityType:    text('entity_type').notNull(),
  entityId:      text('entity_id'),
  before:        jsonb('before'),
  after:         jsonb('after'),
  changedFields: jsonb('changed_fields').$type<string[]>(),
  reason:        text('reason'),
  metadata:      jsonb('metadata'),
}, (t) => ({
  entityIdx: index('audit_log_entity_idx').on(t.entityType, t.entityId, t.occurredAt),
  actorIdx:  index('audit_log_actor_idx').on(t.actorUserId, t.occurredAt),
  timeIdx:   index('audit_log_occurred_at_idx').on(t.occurredAt),
}))
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: PASS (jsonb/index/timestamp уже импортированы в schema.ts).

- [ ] **Step 3: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat(audit): add audit_log table to schema"
```

---

## Task 2: Миграция таблицы `audit_log`

**Files:**
- Create: `drizzle/00XX_audit_log.sql` (номер — следующий за последним в `drizzle/`, на момент написания последний `0038`, значит `0039`)
- Create: `drizzle/00XX_audit_log.test.ts`

- [ ] **Step 1: Сгенерировать миграцию**

Run: `npx drizzle-kit generate --name audit_log`
Expected: создан `drizzle/0039_audit_log.sql` с `CREATE TABLE "audit_log"`, FK на `user`, тремя индексами. Открыть файл и убедиться, что FK именно `ON DELETE set null`.

- [ ] **Step 2: Написать тест миграции**

`drizzle/0039_audit_log.test.ts`:
```ts
/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0039 audit_log migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0039_audit_log.sql'), 'utf8')

  it('creates the audit_log table with required columns', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "audit_log"')
    expect(sql).toContain('"occurred_at" timestamp DEFAULT now() NOT NULL')
    expect(sql).toContain('"actor_user_id" text')
    expect(sql).toContain('"source" text NOT NULL')
    expect(sql).toContain('"action" text NOT NULL')
    expect(sql).toContain('"entity_type" text NOT NULL')
    expect(sql).toContain('"before" jsonb')
    expect(sql).toContain('"after" jsonb')
  })

  it('does NOT add a FK on actor_user_id (append-only journal, no cascade)', () => {
    // actor_user_id хранится как обычный text — никакого REFERENCES на user.
    expect(sql).not.toMatch(/actor_user_id[^,]*REFERENCES/i)
  })

  it('adds read indexes', () => {
    expect(sql).toContain('"audit_log_entity_idx"')
    expect(sql).toContain('"audit_log_actor_idx"')
    expect(sql).toContain('"audit_log_occurred_at_idx"')
  })
})
```

- [ ] **Step 3: Запустить тест**

Run: `npm test -- drizzle/0039_audit_log.test.ts`
Expected: PASS. Если строки отличаются от сгенерированного файла — привести `toContain` к реальному содержимому, не наоборот.

- [ ] **Step 4: Применить миграцию к dev/e2e БД**

Run: `node scripts/apply-migration.mjs drizzle/0039_audit_log.sql`
Expected: `✅ Migration applied`.

- [ ] **Step 5: Commit**

```bash
git add drizzle/0039_audit_log.sql drizzle/0039_audit_log.test.ts drizzle/meta
git commit -m "feat(audit): migration for audit_log table"
```

---

## Task 3: Реестр таблиц + миграция триггеров

**Files:**
- Create: `lib/audit/audited-tables.ts`
- Create: `drizzle/0040_audit_triggers.sql`
- Create: `drizzle/0040_audit_triggers.test.ts`

- [ ] **Step 1: Реестр аудируемых таблиц**

`lib/audit/audited-tables.ts`:
```ts
// Единый источник правды: какие таблицы под аудитом.
// Новая мутабельная таблица → добавить сюда + триггер в миграции (см. CLAUDE.md).
// `audit_log` сюда НЕ входит — иначе триггер логировал бы собственные вставки (рекурсия).
export const AUDITED_TABLES = [
  'books',
  'user',
  'book_priorities',
  'book_submissions',
  'intro_sections',
  'signup_books',
  'feedback',
  'tag_descriptions',
  'matching_sessions',
  'matching_session_participants',
  'matching_pseudonym_reservations',
  'matching_preference_events',
  'user_activity_events',
  'user_identities',
  'verificationToken',
  'telegram_preauth_tokens',
  'notification_queue',
] as const

export type AuditedTable = (typeof AUDITED_TABLES)[number]
```

- [ ] **Step 2: Написать SQL миграции триггеров вручную**

`drizzle/0040_audit_triggers.sql` (drizzle-kit это не генерирует — пишем руками; разделитель `--> statement-breakpoint` обязателен, его понимает `apply-migration.mjs`):
```sql
CREATE OR REPLACE FUNCTION audit_capture() RETURNS trigger AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_changed jsonb;
  v_entity_id text;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_before := to_jsonb(OLD); v_after := NULL;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_before := to_jsonb(OLD); v_after := to_jsonb(NEW);
  ELSE
    v_before := NULL; v_after := to_jsonb(NEW);
  END IF;

  -- Маскирование секретов: вырезаем чувствительные ключи ДО записи в журнал.
  -- (jsonb - 'key' на NULL даёт NULL — безопасно для before/after = NULL.)
  IF TG_TABLE_NAME = 'verificationToken' THEN
    v_before := v_before - 'token'; v_after := v_after - 'token';
  ELSIF TG_TABLE_NAME = 'telegram_preauth_tokens' THEN
    v_before := v_before - 'token_hash'; v_after := v_after - 'token_hash';
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    SELECT jsonb_agg(e.key) INTO v_changed
    FROM jsonb_each(v_after) AS e
    WHERE v_after -> e.key IS DISTINCT FROM v_before -> e.key;
  END IF;

  -- entity_id: 'id' если есть; иначе составной ключ из известных PK-колонок
  -- (book_priorities/signup_books = user_id:book_id; matching_* = session_id:user_id).
  v_entity_id := COALESCE(
    v_after ->> 'id',
    v_before ->> 'id',
    NULLIF(concat_ws(':',
      COALESCE(v_after ->> 'session_id', v_before ->> 'session_id'),
      COALESCE(v_after ->> 'user_id',    v_before ->> 'user_id'),
      COALESCE(v_after ->> 'book_id',    v_before ->> 'book_id')
    ), '')
  );

  INSERT INTO audit_log
    (id, actor_user_id, actor_label, source, action, entity_type, entity_id, before, after, changed_fields, reason)
  VALUES (
    gen_random_uuid()::text,
    NULLIF(current_setting('app.audit_actor', true), ''),
    NULLIF(current_setting('app.audit_label', true), ''),
    COALESCE(NULLIF(current_setting('app.audit_source', true), ''), 'trigger'),
    lower(TG_OP),
    TG_TABLE_NAME,
    v_entity_id,
    v_before,
    v_after,
    v_changed,
    NULLIF(current_setting('app.audit_reason', true), '')
  );

  IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_books AFTER INSERT OR UPDATE OR DELETE ON "books" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_user AFTER INSERT OR UPDATE OR DELETE ON "user" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_book_priorities AFTER INSERT OR UPDATE OR DELETE ON "book_priorities" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_book_submissions AFTER INSERT OR UPDATE OR DELETE ON "book_submissions" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_intro_sections AFTER INSERT OR UPDATE OR DELETE ON "intro_sections" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_signup_books AFTER INSERT OR UPDATE OR DELETE ON "signup_books" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_feedback AFTER INSERT OR UPDATE OR DELETE ON "feedback" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_tag_descriptions AFTER INSERT OR UPDATE OR DELETE ON "tag_descriptions" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_matching_sessions AFTER INSERT OR UPDATE OR DELETE ON "matching_sessions" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_matching_session_participants AFTER INSERT OR UPDATE OR DELETE ON "matching_session_participants" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_matching_pseudonym_reservations AFTER INSERT OR UPDATE OR DELETE ON "matching_pseudonym_reservations" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_matching_preference_events AFTER INSERT OR UPDATE OR DELETE ON "matching_preference_events" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_user_activity_events AFTER INSERT OR UPDATE OR DELETE ON "user_activity_events" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_user_identities AFTER INSERT OR UPDATE OR DELETE ON "user_identities" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_verificationToken AFTER INSERT OR UPDATE OR DELETE ON "verificationToken" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_telegram_preauth_tokens AFTER INSERT OR UPDATE OR DELETE ON "telegram_preauth_tokens" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_notification_queue AFTER INSERT OR UPDATE OR DELETE ON "notification_queue" FOR EACH ROW EXECUTE FUNCTION audit_capture();
```

- [ ] **Step 3: Тест миграции триггеров + синхронность с реестром**

`drizzle/0040_audit_triggers.test.ts`:
```ts
/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { AUDITED_TABLES } from '../lib/audit/audited-tables'

describe('0040 audit triggers migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0040_audit_triggers.sql'), 'utf8')

  it('defines the audit_capture function reading app.audit_* settings', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION audit_capture()')
    expect(sql).toContain("current_setting('app.audit_actor', true)")
    expect(sql).toContain("COALESCE(NULLIF(current_setting('app.audit_source', true), ''), 'trigger')")
    expect(sql).toContain('TG_TABLE_NAME')
  })

  it('attaches a trigger to every audited table (registry stays in sync)', () => {
    for (const table of AUDITED_TABLES) {
      expect(sql).toContain(`ON "${table}" FOR EACH ROW EXECUTE FUNCTION audit_capture()`)
    }
  })

  it('does not attach a trigger to audit_log itself (no recursion)', () => {
    expect(sql).not.toContain('ON "audit_log"')
  })

  it('masks secret columns before storing', () => {
    expect(sql).toContain("v_before := v_before - 'token'")
    expect(sql).toContain("v_before := v_before - 'token_hash'")
  })

  it('builds a composite entity_id for tables without an id column', () => {
    expect(sql).toContain("concat_ws(':'")
  })
})
```

- [ ] **Step 4: Запустить тест**

Run: `npm test -- drizzle/0040_audit_triggers.test.ts`
Expected: PASS. Этот тест — страховка реестра: добавишь таблицу в `AUDITED_TABLES`, но забудешь триггер → тест красный.

- [ ] **Step 5: Применить миграцию**

Run: `node scripts/apply-migration.mjs drizzle/0040_audit_triggers.sql`
Expected: `✅ Migration applied`.

- [ ] **Step 6: Append-only enforcement (S1) — REVOKE UPDATE/DELETE**

Журнал должен быть неизменяемым. Раз FK снят (Task 1), это безопасно.
1. Узнать роль приложения: `node -e "console.log(process.env.DATABASE_URL)"` → имя пользователя из строки подключения (на Neon обычно `neondb_owner` или роль проекта).
2. Добавить в конец `drizzle/0040_audit_triggers.sql` (через `--> statement-breakpoint`), подставив реальную роль `<APP_ROLE>`:
```sql
REVOKE UPDATE, DELETE ON "audit_log" FROM "<APP_ROLE>";
```
3. Триггерная функция вставляет от имени той же роли — это `INSERT`, он не отзывается, журнал продолжает наполняться. Если роль владеет таблицей (owner обходит REVOKE) — зафиксировать в `docs/features/audit-log.md`, что неизменяемость держится на уровне «приложение не делает UPDATE/DELETE», а жёсткий REVOKE требует отдельной не-owner роли (отметить как осознанное ограничение, не блокер).

> Если роль — owner и REVOKE не действует, не блокируемся: ESLint (Task 6) всё равно запрещает мутации `audit_log` из кода. REVOKE — defense-in-depth, а не единственная преграда.

- [ ] **Step 7: Commit**

```bash
git add lib/audit/audited-tables.ts drizzle/0040_audit_triggers.sql drizzle/0040_audit_triggers.test.ts
git commit -m "feat(audit): db triggers capture all mutations into audit_log"
```

---

## Task 3B: Spike — доказать транзакционную семантику (B1, КРИТИЧНО, делать до Task 5)

> Весь механизм держится на том, что `set_config('app.audit_*', …, true)`, выставленный внутри `db.transaction`, доживёт до AFTER-триггера в той же транзакции на драйвере `neon-serverless`. Это **надо доказать на живой БД до** обвязки роутов — иначе вся декомпозиция меняется. Unit-тест Task 4 это НЕ проверяет (мокает транзакцию).

**Files:**
- Create (временный): `scripts/audit-spike.mjs`

- [ ] **Step 1: Скрипт-проба**

`scripts/audit-spike.mjs` (по образцу `scripts/apply-migration.mjs` — тот же Pool):
```js
import { neonConfig, Pool } from '@neondatabase/serverless'
import ws from 'ws'
neonConfig.webSocketConstructor = ws
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const probeId = `spike-${Date.now()}`
try {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("select set_config('app.audit_source', 'spike', true)")
    await client.query("select set_config('app.audit_actor', 'spike-actor', true)")
    await client.query(
      'INSERT INTO "tag_descriptions" ("tag","description") VALUES ($1,$2)',
      [probeId, 'probe'],
    )
    await client.query('COMMIT')
  } finally { client.release() }
  const { rows } = await pool.query(
    "SELECT source, actor_user_id FROM audit_log WHERE entity_id = $1 ORDER BY occurred_at DESC LIMIT 1",
    [probeId],
  )
  console.log('captured:', rows[0])
  if (rows[0]?.source !== 'spike') throw new Error('FAIL: set_config did not reach trigger (got ' + rows[0]?.source + ')')
  console.log('✅ set_config reaches trigger within the same transaction')
  await pool.query('DELETE FROM "tag_descriptions" WHERE tag = $1', [probeId])
} finally { await pool.end() }
```

- [ ] **Step 2: Запустить пробу**

Run: `node scripts/audit-spike.mjs`
Expected: `✅ set_config reaches trigger within the same transaction`, `captured: { source: 'spike', actor_user_id: 'spike-actor' }`.

- [ ] **Step 3: Если проба провалилась (`source='trigger'`)**

Значит drizzle/Pool гоняет statements вне единой сессии. План меняется: `withAuditContext` (Task 4) должен использовать явный `pool.connect()` + `BEGIN`/`COMMIT` на одном клиенте (как этот скрипт) вместо `db.transaction`, либо `db.transaction` с `tx.execute(sql.raw('SET LOCAL ...'))`. **Не продолжать Task 5+, пока проба не зелёная.** Зафиксировать рабочий способ в Task 4.

- [ ] **Step 4: Удалить временный скрипт, commit факта проверки в сообщении**

Проба доказана драйвером — `scripts/audit-spike.mjs` можно удалить (или оставить как `npm`-утилиту диагностики). Решение зафиксировать в `docs/features/audit-log.md`.

---

## Task 4: `withAuditContext` хелпер

**Files:**
- Create: `lib/audit/with-audit-context.ts`
- Create: `lib/audit/with-audit-context.test.ts`

> **B2:** этот unit-тест проверяет только *форму* вызовов (4× `set_config`, тело в tx) — он мокает транзакцию и НЕ доказывает, что контекст доживёт до триггера. Транзакционную семантику доказывает Task 3B (spike) на живой БД; реализацию ниже использовать только после зелёного spike (если spike потребовал `pool.connect()`-вариант — отразить здесь).

- [ ] **Step 1: Написать падающий тест**

`lib/audit/with-audit-context.test.ts`:
```ts
import { withAuditContext } from './with-audit-context'

const execute = jest.fn()
const fakeTx = { execute }
const fakeDb = {
  transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(fakeTx)),
}

describe('withAuditContext', () => {
  beforeEach(() => {
    execute.mockReset()
    fakeDb.transaction.mockClear()
  })

  it('sets transaction-local audit settings then runs the body in the tx', async () => {
    const body = jest.fn(async () => 'result')
    const result = await withAuditContext(
      { actorUserId: 'u1', actorLabel: 'Вася', source: 'admin', reason: 'spam' },
      body,
      fakeDb as never,
    )

    expect(result).toBe('result')
    expect(fakeDb.transaction).toHaveBeenCalledTimes(1)
    // 4 set_config calls (actor, label, source, reason)
    expect(execute).toHaveBeenCalledTimes(4)
    expect(body).toHaveBeenCalledWith(fakeTx)
  })

  it('passes empty string (not null) when optional fields are absent', async () => {
    await withAuditContext({ source: 'cron' }, async () => undefined, fakeDb as never)
    // every set_config must have been called; none should throw on undefined
    expect(execute).toHaveBeenCalledTimes(4)
  })
})
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm test -- lib/audit/with-audit-context.test.ts`
Expected: FAIL — `Cannot find module './with-audit-context'`.

- [ ] **Step 3: Реализовать хелпер**

`lib/audit/with-audit-context.ts`:
```ts
import { sql } from 'drizzle-orm'
import { db as defaultDb } from '@/lib/db'

export interface AuditContext {
  actorUserId?: string | null
  actorLabel?: string | null
  source: string
  reason?: string | null
}

// Drizzle tx и db структурно совместимы для наших запросов.
type DbLike = typeof defaultDb

/**
 * Открывает транзакцию, проставляет transaction-local настройки app.audit_*,
 * затем выполняет тело. Триггер audit_capture() читает эти настройки и
 * проставляет actor/source/reason в audit_log. Используется на КАЖДОМ
 * мутирующем роуте — см. docs/features/audit-log.md.
 *
 * set_config(name, value, is_local=true) — параметризуемый аналог SET LOCAL
 * (SET LOCAL не принимает плейсхолдеры).
 */
export async function withAuditContext<T>(
  ctx: AuditContext,
  fn: (tx: DbLike) => Promise<T>,
  db: DbLike = defaultDb,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.audit_actor', ${ctx.actorUserId ?? ''}, true)`)
    await tx.execute(sql`select set_config('app.audit_label', ${ctx.actorLabel ?? ''}, true)`)
    await tx.execute(sql`select set_config('app.audit_source', ${ctx.source}, true)`)
    await tx.execute(sql`select set_config('app.audit_reason', ${ctx.reason ?? ''}, true)`)
    return fn(tx as unknown as DbLike)
  }) as Promise<T>
}
```

- [ ] **Step 4: Запустить — зелёный**

Run: `npm test -- lib/audit/with-audit-context.test.ts`
Expected: PASS.

- [ ] **Step 5: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/audit/with-audit-context.ts lib/audit/with-audit-context.test.ts
git commit -m "feat(audit): withAuditContext sets actor context for triggers"
```

---

## Task 5: Подключить `withAuditContext` к мутирующим роутам

> Полнота уже обеспечена триггерами; этот таск **обогащает** записи актором. Делаем на показательном роуте (видимость книги) — он же используется в e2e (Task 9). Остальные мутирующие роуты оборачиваются по тому же шаблону отдельными коммитами; шаблон зафиксирован здесь.

**Files:**
- Modify: `app/api/admin/books/route.ts` (роут изменения книги — найти PATCH/PUT/POST хендлер мутации)

- [ ] **Step 1: Найти мутирующий хендлер**

Run: `grep -n "export async function \(POST\|PATCH\|PUT\|DELETE\)" app/api/admin/books/route.ts`
Expected: имя хендлера, который меняет книгу.

- [ ] **Step 2: Обернуть мутацию**

Шаблон (вставить вместо прямого `db`-вызова мутации; `session` уже получен через `auth()` выше):
```ts
import { withAuditContext } from '@/lib/audit/with-audit-context'
// ...
await withAuditContext(
  {
    actorUserId: session.user.id,
    actorLabel: session.user.name ?? session.user.email ?? null,
    source: 'admin',
  },
  async (tx) => {
    // тот же drizzle-код мутации, но через tx вместо db:
    await tx.update(books).set(patch).where(eq(books.id, id))
  },
)
```

- [ ] **Step 3: Проверки**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (Если lint из Task 6 уже включён — прямой `db.update` вне обёртки будет ошибкой; здесь мы как раз через `tx`, поэтому чисто.)

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/books/route.ts
git commit -m "feat(audit): record actor context on admin book mutations"
```

---

## Task 6: ESLint-запрет сырых мутаций мимо `withAuditContext`

**Files:**
- Modify: `.eslintrc.json`

- [ ] **Step 1: Добавить правило с исключениями (B5)**

> Прежний селектор `callee.object.name='db'` ловил только литеральный `db.insert/...` и пропускал `tx.delete(...)` внутри голого `db.transaction` (как в `lib/signup-books.ts`) — ложное покрытие. Правильный подход: запретить сам `db.transaction(` вне `lib/audit/**` (мутации обязаны идти через `withAuditContext`) **плюс** top-level `db.insert/update/delete`.

`.eslintrc.json` — заменить содержимое на:
```json
{
  "extends": ["next/core-web-vitals", "next/typescript"],
  "root": true,
  "rules": {
    "no-restricted-syntax": [
      "error",
      {
        "selector": "CallExpression[callee.object.name='db'][callee.property.name='transaction']",
        "message": "Голый db.transaction запрещён — используй withAuditContext (lib/audit), чтобы аудит знал actor. См. docs/features/audit-log.md"
      },
      {
        "selector": "CallExpression[callee.object.name='db'][callee.property.name=/^(insert|update|delete)$/]",
        "message": "Прямые мутации через db.insert/update/delete запрещены — оборачивай в withAuditContext (lib/audit). См. docs/features/audit-log.md"
      }
    ]
  },
  "overrides": [
    {
      "files": ["lib/audit/**", "lib/db/**", "**/*.test.ts", "**/*.test.tsx", "scripts/**"],
      "rules": { "no-restricted-syntax": "off" }
    }
  ]
}
```

- [ ] **Step 2: Запустить lint — увидеть нарушения**

Run: `npm run lint`
Expected: ошибки в местах с `db.transaction(`/`db.insert|update|delete` — в т.ч. `lib/signup-books.ts`, `lib/user-identities.ts`, `lib/telegram-auth.ts:41`. Это и есть полный список мест под обёртку. (Мутации через `tx.*` внутри `withAuditContext` правило не трогает — это и нужно.)

- [ ] **Step 3: Решение по охвату нарушений (+ B4 auth-пути)**

Обернуть каждый найденный мутирующий вызов по шаблону Task 5 (отдельными коммитами на роут). Где мутация идёт через `tx` внутри существующей `db.transaction` (напр. `lib/signup-books.ts`) — заменить внешний `db.transaction` на `withAuditContext`, передав actor (cron/системные пути — `source: 'cron'`/`'system'`, `actorUserId: null`).

**Auth-пути (B4):** `lib/user-identities.ts` (`withIdentityTransaction`), `lib/auth-adapter.ts`, `lib/telegram-auth.ts` пишут в `user`/`user_identities`/`verificationToken`/`telegram_preauth_tokens` при логине. Это **штатный** трафик, а не «забыли».
- Где мутацию вызываем мы (telegram-auth insert, `resolveOrCreateUserFromIdentity`, `linkIdentityToUser`) — обернуть в `withAuditContext({ source: 'auth', actorUserId: null })`.
- **`@auth/drizzle-adapter` (стандартные методы adapter) фреймворк вызывает мимо нашего кода — обернуть нельзя.** Его записи останутся `source='trigger'`. Это осознанно: в reconciliation-тесте (Task 9B) и в бейдже просмотрщика (Task 8) auth-таблицы (`verificationToken`, частично `user`/`user_identities`) входят в **allowlist** легитимных «внесистемных», чтобы сигнал «забыли обернуть» не тонул в логинах.

> Если охват всех роутов раздувает один PR — легитимная точка разбиения на серию PR. Минимум для зелёного CI: обернуть все нарушения; правило держать `"error"`.

- [ ] **Step 4: lint зелёный**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .eslintrc.json
git commit -m "feat(audit): forbid raw db mutations outside withAuditContext"
```

---

## Task 7: Read API просмотрщика

**Files:**
- Create: `app/api/admin/audit-log/route.ts`
- Create: `app/api/admin/audit-log/route.test.ts`

- [ ] **Step 1: Написать падающий тест**

`app/api/admin/audit-log/route.test.ts`:
```ts
import { GET } from './route'
import { auth } from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: () => ({ limit: async () => [] }) }),
        orderBy: () => ({ limit: async () => [] }),
      }),
    }),
  },
}))

const mockedAuth = auth as unknown as jest.Mock

function req(url = 'http://localhost/api/admin/audit-log') {
  return new Request(url) as never
}

describe('GET /api/admin/audit-log', () => {
  it('rejects non-admins with 403', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { isAdmin: false } })
    const res = await GET(req())
    expect(res.status).toBe(403)
  })

  it('returns 200 for admins', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { isAdmin: true } })
    const res = await GET(req())
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm test -- app/api/admin/audit-log/route.test.ts`
Expected: FAIL — модуль `./route` не найден.

- [ ] **Step 3: Реализовать роут** (паттерн из `app/api/admin/matching/preference-events/route.ts`)

`app/api/admin/audit-log/route.ts`:
```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditLog } from '@/lib/db/schema'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const p = req.nextUrl.searchParams
  const conditions: SQL[] = []
  const actor = p.get('actorUserId')
  const entityType = p.get('entityType')
  const entityId = p.get('entityId')
  const source = p.get('source')
  const from = p.get('from')
  const to = p.get('to')

  if (actor) conditions.push(eq(auditLog.actorUserId, actor))
  if (entityType) conditions.push(eq(auditLog.entityType, entityType))
  if (entityId) conditions.push(eq(auditLog.entityId, entityId))
  if (source) conditions.push(eq(auditLog.source, source))
  if (from) conditions.push(gte(auditLog.occurredAt, new Date(from)))
  if (to) conditions.push(lte(auditLog.occurredAt, new Date(to)))

  const base = db.select().from(auditLog)
  const filtered = conditions.length ? base.where(and(...conditions)) : base
  const rows = await filtered.orderBy(desc(auditLog.occurredAt)).limit(parseLimit(p.get('limit')))

  return NextResponse.json({ events: rows })
}
```

- [ ] **Step 4: Запустить — зелёный**

Run: `npm test -- app/api/admin/audit-log/route.test.ts`
Expected: PASS.

- [ ] **Step 5: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/audit-log/route.ts app/api/admin/audit-log/route.test.ts
git commit -m "feat(audit): admin read API for audit_log"
```

---

## Task 8: Вкладка просмотрщика в админке

**Files:**
- Create: `components/nd/AdminAuditLog.tsx`
- Modify: `components/nd/AdminPanel.tsx`

- [ ] **Step 1: Компонент просмотрщика**

`components/nd/AdminAuditLog.tsx` — клиентский компонент, стиль по `/styleguide` (токены `var(--…)`, без скруглений/теней, линия вместо заливки). Тянет `GET /api/admin/audit-log`, рендерит таблицу: время, actor (`actorLabel` или `actor_user_id`, для `source='trigger'` — бейдж «внесистемное»), source, action, entityType, entityId; строка раскрывается в `before`→`after` с подсветкой `changedFields`. Поля фильтров: actorUserId, entityType, entityId, source, диапазон дат.
```tsx
'use client'

import { Fragment, useEffect, useState } from 'react'

interface AuditEvent {
  id: string
  occurredAt: string
  actorUserId: string | null
  actorLabel: string | null
  source: string
  action: string
  entityType: string
  entityId: string | null
  before: unknown
  after: unknown
  changedFields: string[] | null
  reason: string | null
}

export default function AdminAuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/audit-log')
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
      <thead>
        <tr>
          {['Время', 'Кто', 'Источник', 'Действие', 'Объект', 'ID'].map((h) => (
            <th key={h} style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border)', fontFamily: 'var(--nd-sans)' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <Fragment key={e.id}>
            <tr data-testid="audit-row" onClick={() => setExpanded(expanded === e.id ? null : e.id)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '0.5rem' }}>{new Date(e.occurredAt).toLocaleString('ru-RU')}</td>
              <td style={{ padding: '0.5rem' }}>
                {e.source === 'trigger'
                  ? <span style={{ color: 'var(--accent)' }}>внесистемное</span>
                  : (e.actorLabel ?? e.actorUserId ?? '—')}
              </td>
              <td style={{ padding: '0.5rem' }}>{e.source}</td>
              <td style={{ padding: '0.5rem' }}>{e.action}</td>
              <td style={{ padding: '0.5rem' }}>{e.entityType}</td>
              <td style={{ padding: '0.5rem' }}>{e.entityId ?? '—'}</td>
            </tr>
            {expanded === e.id && (
              <tr data-testid="audit-detail">
                <td colSpan={6} style={{ padding: '0.5rem', background: 'var(--bg)' }}>
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--nd-sans)', fontSize: '0.8rem' }}>
                    {JSON.stringify({ before: e.before, after: e.after, changedFields: e.changedFields, reason: e.reason }, null, 2)}
                  </pre>
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 2: Зарегистрировать вкладку в `AdminPanel.tsx`**

Внести три правки (точечно, по строкам из разведки):
1. строка 52 — расширить тип: `type View = 'users' | 'catalog' | 'tags' | 'submissions' | 'feedback' | 'intro' | 'matching' | 'audit'`
2. строка 57 — добавить в массив: `const ADMIN_VIEWS: View[] = ['users', 'catalog', 'tags', 'submissions', 'feedback', 'intro', 'matching', 'audit']`
3. рядом со строкой 707 (кнопка `matching`) добавить кнопку:
```tsx
<button style={tabStyle(view === 'audit')} onClick={() => selectView('audit')} data-testid="admin-tab-audit">
  История изменений
</button>
```
4. рядом со строкой 714 добавить рендер: `{view === 'audit' && <AdminAuditLog />}`
5. в импорты добавить: `import AdminAuditLog from './AdminAuditLog'`

- [ ] **Step 3: Проверки**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/nd/AdminAuditLog.tsx components/nd/AdminPanel.tsx
git commit -m "feat(audit): admin viewer tab for audit_log"
```

---

## Task 9: E2E — персистентность + out-of-band

> Перед написанием прочитать `docs/features/testing.md` (live-locators, изоляция e2e-ветки, фикстуры). Использовать фикстуру создания книги (`createTestBook`) и admin-сессию из существующих e2e.

**Files:**
- Create: `e2e/audit-log.spec.ts`

- [ ] **Step 1: Тест — мутация попадает в журнал и переживает reload**

`e2e/audit-log.spec.ts` (адаптировать хелперы под существующие в `e2e/fixtures.ts`):
```ts
import { test, expect } from './fixtures'

test('admin book mutation appears in audit log and persists after reload', async ({ page, adminLogin, createTestBook }) => {
  await adminLogin()
  const book = await createTestBook({ title: 'Audit Probe' })

  // изменить видимость книги через админку «Каталог»
  await page.goto('/admin?tab=catalog')
  // ... переключить visibility книги book.id (по data-testid существующего контрола) ...

  await page.goto('/admin?tab=audit')
  const row = page.getByTestId('audit-row').filter({ hasText: book.id }).first()
  await expect(row).toBeVisible()

  // персистентность: запись остаётся после перезагрузки
  await page.reload()
  await page.goto('/admin?tab=audit')
  await expect(page.getByTestId('audit-row').filter({ hasText: book.id }).first()).toBeVisible()
})
```

- [ ] **Step 2: Тест — запись вне withAuditContext помечена внесистемной**

```ts
test('out-of-band write is captured as source=trigger with no actor', async ({ page, adminLogin, dbExec }) => {
  await adminLogin()
  // прямая мутация в обход кода (через тестовую db-фикстуру e2e-ветки)
  const id = `e2e-oob-${Date.now()}`
  await dbExec(`INSERT INTO "tag_descriptions" ("tag","description") VALUES ('${id}','probe')`)

  await page.goto('/admin?tab=audit')
  const row = page.getByTestId('audit-row').filter({ hasText: id }).first()
  await expect(row).toBeVisible()
  await expect(row).toContainText('внесистемное')
})
```
> Если в `e2e/fixtures.ts` нет хелпера сырого SQL — добавить минимальный `dbExec(sql: string)` поверх того же пула, что и остальные фикстуры (cleanup в teardown по префиксу `e2e-oob-`).

- [ ] **Step 3: Запустить**

Run: `npm run test:e2e e2e/audit-log.spec.ts`
Expected: PASS (на изолированной e2e-ветке с применёнными миграциями 0039/0040).

- [ ] **Step 4: Commit**

```bash
git add e2e/audit-log.spec.ts e2e/fixtures.ts
git commit -m "test(audit): e2e persistence and out-of-band capture"
```

---

## Task 9B: Reconciliation — нормальный трафик не плодит «внесистемные» записи (S4)

> Явный исполняемый тест к спеке §6.3. С учётом B4 — с allowlist легитимных auth-источников, иначе логины (через DrizzleAdapter) всегда `source='trigger'` и тест бессмысленно красный.

**Files:**
- Create: `e2e/audit-reconciliation.spec.ts`

- [ ] **Step 1: allowlist легитимных внесистемных записей**

Добавить в `lib/audit/audited-tables.ts`:
```ts
// Таблицы, для которых source='trigger' — НЕ сигнал «забыли обернуть»:
// их пишет NextAuth DrizzleAdapter мимо нашего кода (см. docs/features/audit-log.md, B4).
export const AUTH_OOB_TABLES = ['verificationToken', 'user', 'user_identities'] as const
```

- [ ] **Step 2: Тест reconciliation**

`e2e/audit-reconciliation.spec.ts`:
```ts
import { test, expect } from './fixtures'
import { AUTH_OOB_TABLES } from '../lib/audit/audited-tables'

test('admin mutations do not produce out-of-band audit rows', async ({ adminLogin, createTestBook, dbQuery }) => {
  await adminLogin()
  const since = new Date().toISOString()
  const book = await createTestBook({ title: 'Reconcile Probe' })

  // выполнить пару штатных мутаций через UI/API (например смена видимости) ...

  const placeholders = AUTH_OOB_TABLES.map((_, i) => `$${i + 2}`).join(',')
  const rows = await dbQuery(
    `SELECT entity_type, count(*)::int AS n FROM audit_log
     WHERE source = 'trigger' AND occurred_at >= $1
       AND entity_type NOT IN (${placeholders})
     GROUP BY entity_type`,
    [since, ...AUTH_OOB_TABLES],
  )
  expect(rows).toEqual([]) // ни одной «внесистемной» записи вне auth-allowlist
})
```
> Если в `e2e/fixtures.ts` нет `dbQuery(sql, params)` — добавить тонкий хелпер поверх того же пула (вернуть `rows`).

- [ ] **Step 3: Запустить**

Run: `npm run test:e2e e2e/audit-reconciliation.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/audit-reconciliation.spec.ts lib/audit/audited-tables.ts e2e/fixtures.ts
git commit -m "test(audit): reconciliation guards against forgotten withAuditContext"
```

---

## Task 10: Документация + правило в CLAUDE.md

**Files:**
- Create: `docs/features/audit-log.md`
- Create: `docs/wiki/audit-log.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: `docs/features/audit-log.md`** — code-level: таблица `audit_log`, `audit_capture()`, `AUDITED_TABLES`, `withAuditContext` (паттерн на роуте), правило ESLint, что значит `source='trigger'`, как добавить таблицу под аудит (реестр + триггер в новой миграции + строка в тесте).

- [ ] **Step 2: `docs/wiki/audit-log.md`** — для владельца: зачем журнал, что в нём видно, как расследовать жалобу (фильтры по actor/объекту/датам), что значит бейдж «внесистемное», retention (пока без удаления). Связь с лентой матчинга (пользователи видят свою вычисленную ленту, не журнал) и с #344.

- [ ] **Step 3: Правило в `CLAUDE.md`** — в раздел «Правила работы с кодом» добавить:
```markdown
## Аудит изменений
- Любая новая мутабельная таблица → добавить её имя в `AUDITED_TABLES` (`lib/audit/audited-tables.ts`) **и** триггер в новой миграции (шаблон — `drizzle/0040_audit_triggers.sql`). Тест `drizzle/0040_audit_triggers.test.ts` проверяет синхронность реестра и триггеров.
- Мутации (`insert/update/delete`) идут только через `withAuditContext` (`lib/audit/with-audit-context.ts`), иначе ESLint падает. Это даёт аудиту actor. Системные пути — `source: 'cron'/'system'`, `actorUserId: null`.
- Записи с `source='trigger'` в просмотрщике = мутация прошла мимо `withAuditContext`. Это сигнал «забыли обернуть», а не норма — найти и обернуть.
```

- [ ] **Step 4: Финальные проверки**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/features/audit-log.md docs/wiki/audit-log.md CLAUDE.md
git commit -m "docs(audit): feature + wiki docs and CLAUDE.md rules"
```

---

## Тестовые артефакты (чеклист перед коммитами)

- **E2E: нужен** — новый admin UI-флоу + персистентное состояние (Task 9, с `page.reload()`).
- **Wiki: нужна** — новая подсистема, БД-схема, admin-workflow (Task 10).

## Замечания по реализации

- **Миграции применяются вручную** к dev/e2e-БД (`scripts/apply-migration.mjs`); прод-применение — по принятому в проекте процессу деплоя миграций.
- **Порядок:** Task 1→2→3 обязателен до Task 5+ (триггеры должны существовать). Task 4 можно параллельно с 7/8.
- **Рекурсия исключена:** на `audit_log` триггера нет (Task 3, Step 3 это тестирует).
- **`reason`** прокидывается через `withAuditContext({ ..., reason })` там, где есть человеческая причина (напр. отклонение заявки в `app/api/admin/submissions`).
